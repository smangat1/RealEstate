import "server-only";

import { createHash, randomUUID } from "node:crypto";

import { Prisma, type BoardNotificationPreference } from "@prisma/client";

import {
  classifyAdvisorPushDelivery,
  type AdvisorPushDeliveryOutcome,
} from "@/lib/apns-delivery";

import {
  advisorLocalDateKey,
  buildAdvisorDigest,
  DEFAULT_ADVISOR_DIGEST_HOUR,
  initialAdvisorTimeZone,
  isValidAdvisorTimeZone,
  nextAdvisorDigestAt,
  planAdvisorDelivery,
  type AdvisorNotificationKind,
} from "@/lib/advisor-notification-diet";
import {
  notifyBoardMembers,
  type BoardPushType,
} from "@/lib/apns";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

const DELIVERY_LEASE_MS = 5 * 60 * 1_000;
const UNCERTAIN_RETRY_MS = 15 * 60 * 1_000;
const NO_DEVICE_RETRY_MS = 6 * 60 * 60 * 1_000;
const PREFERENCE_SCAN_LIMIT = 250;
const URGENT_RETRY_LIMIT = 100;

export function advisorNotificationCreateData(input: {
  boardId: string;
  boardListingId?: string;
  type: AdvisorNotificationKind;
  title: string;
  body: string;
  fingerprint: string;
  urgent: boolean;
  recipientUserIds: string[];
}) {
  const recipientUserIds = Array.from(new Set(input.recipientUserIds.filter(Boolean)));
  return {
    boardId: input.boardId,
    boardListingId: input.boardListingId ?? null,
    type: input.type,
    title: input.title,
    body: input.body,
    fingerprint: input.fingerprint,
    urgent: input.urgent,
    deliveries: {
      create: recipientUserIds.map((userId) => ({ userId })),
    },
  } satisfies Prisma.AdvisorNotificationEventUncheckedCreateInput;
}

function currentMemberIds(board: {
  userId: string;
  members: Array<{ userId: string }>;
}) {
  return new Set([board.userId, ...board.members.map((member) => member.userId)]);
}

function nextDigestOrFallback(now: Date, timeZone: string, digestHourLocal: number) {
  return nextAdvisorDigestAt(now, timeZone, digestHourLocal)
    ?? new Date(now.getTime() + 24 * 60 * 60 * 1_000);
}

export async function ensureBoardNotificationPreferences(
  boardId: string,
  recipientUserIds: string[],
  now = new Date(),
) {
  const userIds = Array.from(new Set(recipientUserIds.filter(Boolean)));
  if (userIds.length === 0) return;
  const [existing, devices] = await Promise.all([
    prisma.boardNotificationPreference.findMany({
      where: { boardId, userId: { in: userIds } },
      select: { userId: true },
    }),
    prisma.pushDevice.findMany({
      where: { userId: { in: userIds }, timeZone: { not: null } },
      orderBy: [{ lastSeenAt: "desc" }, { id: "asc" }],
      select: { userId: true, timeZone: true },
    }),
  ]);
  const existingIds = new Set(existing.map((preference) => preference.userId));
  const deviceZones = new Map<string, string>();
  for (const device of devices) {
    if (!deviceZones.has(device.userId)
        && device.timeZone
        && isValidAdvisorTimeZone(device.timeZone)) {
      deviceZones.set(device.userId, device.timeZone);
    }
  }
  const missingPreferences = userIds
    .filter((userId) => !existingIds.has(userId))
    .map((userId) => {
      const timeZone = initialAdvisorTimeZone([deviceZones.get(userId)]);
      return {
        boardId,
        userId,
        timeZone,
        timeZoneSource: deviceZones.has(userId) ? "device" : "fallback",
        digestHourLocal: DEFAULT_ADVISOR_DIGEST_HOUR,
        nextDigestAt: nextDigestOrFallback(now, timeZone, DEFAULT_ADVISOR_DIGEST_HOUR),
      };
    });
  if (missingPreferences.length === 0) return;
  await prisma.boardNotificationPreference.createMany({
    data: missingPreferences,
    skipDuplicates: true,
  });
}

async function claimDeliveries(ids: string[], now: Date) {
  if (ids.length === 0) return { token: "", ids: [] as string[] };
  const token = randomUUID();
  await prisma.advisorNotificationDelivery.updateMany({
    where: {
      id: { in: ids },
      status: "pending",
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
    },
    data: {
      leaseToken: token,
      leaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
    },
  });
  const claimed = await prisma.advisorNotificationDelivery.findMany({
    where: { id: { in: ids }, status: "pending", leaseToken: token },
    select: { id: true },
  });
  return { token, ids: claimed.map((delivery) => delivery.id) };
}

async function finishDeliveries(input: {
  ids: string[];
  token: string;
  now: Date;
  status: "delivered" | "suppressed" | "failed";
  outcome?: AdvisorPushDeliveryOutcome;
  failureReason?: string;
  attempted?: boolean;
}) {
  if (input.ids.length === 0) return;
  await prisma.advisorNotificationDelivery.updateMany({
    where: { id: { in: input.ids }, leaseToken: input.token, status: "pending" },
    data: {
      status: input.status,
      leaseToken: null,
      leaseUntil: null,
      deliveredAt: input.status === "delivered" ? input.now : null,
      suppressedAt: input.status === "suppressed" ? input.now : null,
      failedAt: input.status === "failed" ? input.now : null,
      lastAttemptAt: input.attempted ? input.now : undefined,
      attemptCount: input.attempted ? { increment: 1 } : undefined,
      deliveryOutcome: input.outcome,
      failureReason: input.failureReason,
    },
  });
}

async function deferDeliveries(input: {
  ids: string[];
  token: string;
  now: Date;
  retryAt: Date;
  outcome: AdvisorPushDeliveryOutcome;
  failureReason: string;
  attempted: boolean;
}) {
  if (input.ids.length === 0) return;
  await prisma.advisorNotificationDelivery.updateMany({
    where: { id: { in: input.ids }, leaseToken: input.token, status: "pending" },
    data: {
      leaseToken: null,
      leaseUntil: input.retryAt,
      lastAttemptAt: input.attempted ? input.now : undefined,
      attemptCount: input.attempted ? { increment: 1 } : undefined,
      deliveryOutcome: input.outcome,
      failureReason: input.failureReason,
    },
  });
}

type ClaimedDeliveryResult = {
  delivered: boolean;
  outcome: AdvisorPushDeliveryOutcome;
  retryAt?: Date;
};

async function deliverClaimed(input: {
  ids: string[];
  token: string;
  now: Date;
  boardId: string;
  userId: string;
  type: BoardPushType;
  title: string;
  body: string;
  boardListingId?: string | null;
  collapseId: string;
}): Promise<ClaimedDeliveryResult> {
  try {
    const result = await notifyBoardMembers({
      boardId: input.boardId,
      recipientUserIds: [input.userId],
      type: input.type,
      title: input.title,
      body: input.body,
      boardListingId: input.boardListingId,
      collapseId: input.collapseId,
    });
    const outcome = classifyAdvisorPushDelivery(result);
    if (outcome === "accepted" || outcome === "partial") {
      await finishDeliveries({ ...input, status: "delivered", outcome, attempted: true });
      return { delivered: true, outcome };
    }
    if (outcome === "rejected") {
      await finishDeliveries({
        ...input,
        status: "failed",
        outcome,
        failureReason: "All eligible APNs requests were definitively rejected.",
        attempted: true,
      });
      return { delivered: false, outcome };
    }
    const retryAt = new Date(input.now.getTime()
      + (outcome === "uncertain" ? UNCERTAIN_RETRY_MS : NO_DEVICE_RETRY_MS));
    await deferDeliveries({
      ...input,
      retryAt,
      outcome,
      attempted: outcome === "uncertain",
      failureReason: outcome === "uncertain"
        ? "APNs outcome was uncertain; retry is lease-delayed."
        : outcome === "no_device"
          ? "No eligible push device was registered."
          : "APNs is not configured.",
    });
    return { delivered: false, outcome, retryAt };
  } catch (error) {
    const retryAt = new Date(input.now.getTime() + UNCERTAIN_RETRY_MS);
    await deferDeliveries({
      ...input,
      retryAt,
      outcome: "uncertain",
      attempted: true,
      failureReason: error instanceof Error ? error.message.slice(0, 500) : "Unknown APNs error.",
    });
    await sendOperationalAlert(error, {
      area: "push",
      operation: `advisor_${input.type}`,
      severity: "error",
    });
    return { delivered: false, outcome: "uncertain", retryAt };
  }
}

export async function deliverUrgentAdvisorNotification(fingerprint: string, now = new Date()) {
  const event = await prisma.advisorNotificationEvent.findUnique({
    where: { fingerprint },
    include: {
      board: { select: { userId: true, members: { select: { userId: true } } } },
      deliveries: {
        where: {
          status: "pending",
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
      },
    },
  });
  if (!event?.urgent) return 0;

  const members = currentMemberIds(event.board);
  let delivered = 0;
  for (const delivery of event.deliveries) {
    const claim = await claimDeliveries([delivery.id], now);
    if (claim.ids.length === 0) continue;
    if (!members.has(delivery.userId)) {
      await finishDeliveries({ ...claim, now, status: "suppressed" });
      continue;
    }
    const result = await deliverClaimed({
      ...claim,
      now,
      boardId: event.boardId,
      userId: delivery.userId,
      type: event.type as BoardPushType,
      title: event.title,
      body: event.body,
      boardListingId: event.boardListingId,
      collapseId: event.fingerprint,
    });
    if (result.delivered) delivered += 1;
  }
  return delivered;
}

async function flushPendingUrgentNotifications(now: Date) {
  const events = await prisma.advisorNotificationEvent.findMany({
    where: {
      urgent: true,
      deliveries: {
        some: {
          status: "pending",
          OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        },
      },
    },
    select: { fingerprint: true },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: URGENT_RETRY_LIMIT,
  });
  let delivered = 0;
  for (const event of events) delivered += await deliverUrgentAdvisorNotification(event.fingerprint, now);
  return delivered;
}

type DigestPreferenceCandidate = Pick<
  BoardNotificationPreference,
  | "id"
  | "boardId"
  | "userId"
  | "digestHourLocal"
  | "timeZone"
  | "nonCriticalPushEnabled"
  | "nextDigestAt"
  | "lastDigestLocalDate"
>;

async function pendingDigestPreferences(now: Date) {
  return prisma.$queryRaw<DigestPreferenceCandidate[]>(Prisma.sql`
    SELECT p."id", p."boardId", p."userId", p."digestHourLocal", p."timeZone",
           p."nonCriticalPushEnabled", p."nextDigestAt", p."lastDigestLocalDate"
    FROM "BoardNotificationPreference" p
    WHERE (p."digestLeaseUntil" IS NULL OR p."digestLeaseUntil" < (${now} AT TIME ZONE 'UTC'))
      AND (p."nonCriticalPushEnabled" = false OR p."nextDigestAt" <= (${now} AT TIME ZONE 'UTC'))
      AND EXISTS (
        SELECT 1
        FROM "AdvisorNotificationDelivery" d
        JOIN "AdvisorNotificationEvent" e ON e."id" = d."eventId"
        WHERE d."userId" = p."userId"
          AND e."boardId" = p."boardId"
          AND e."urgent" = false
          AND d."status" = 'pending'
          AND (d."leaseUntil" IS NULL OR d."leaseUntil" < (${now} AT TIME ZONE 'UTC'))
      )
    ORDER BY p."nextDigestAt" ASC, p."id" ASC
    LIMIT ${PREFERENCE_SCAN_LIMIT}
  `);
}

async function claimPreference(preference: DigestPreferenceCandidate, now: Date) {
  const token = randomUUID();
  const claimed = await prisma.boardNotificationPreference.updateMany({
    where: {
      id: preference.id,
      OR: [{ digestLeaseUntil: null }, { digestLeaseUntil: { lt: now } }],
    },
    data: {
      digestLeaseToken: token,
      digestLeaseUntil: new Date(now.getTime() + DELIVERY_LEASE_MS),
    },
  });
  return claimed.count === 1 ? token : null;
}

async function releasePreference(input: {
  preference: DigestPreferenceCandidate;
  token: string;
  nextDigestAt?: Date;
  lastDigestAt?: Date | null;
  lastDigestLocalDate?: string | null;
}) {
  await prisma.boardNotificationPreference.updateMany({
    where: { id: input.preference.id, digestLeaseToken: input.token },
    data: {
      digestLeaseToken: null,
      digestLeaseUntil: null,
      nextDigestAt: input.nextDigestAt,
      lastDigestAt: input.lastDigestAt,
      lastDigestLocalDate: input.lastDigestLocalDate,
    },
  });
}

export async function flushDueAdvisorDigests(now = new Date()) {
  const retriedUrgent = await flushPendingUrgentNotifications(now);
  const preferences = await pendingDigestPreferences(now);
  const results = {
    deliveredDigests: 0,
    deliveredEvents: 0,
    suppressedEvents: 0,
    failedEvents: 0,
    waitingEvents: 0,
    retriedUrgent,
  };

  for (const preference of preferences) {
    const preferenceToken = await claimPreference(preference, now);
    if (!preferenceToken) continue;
    const board = await prisma.searchBoard.findUnique({
      where: { id: preference.boardId },
      select: { title: true, userId: true, members: { select: { userId: true } } },
    });
    if (!board) {
      await releasePreference({ preference, token: preferenceToken });
      continue;
    }
    const member = currentMemberIds(board).has(preference.userId);
    const plan = planAdvisorDelivery({
      urgent: false,
      isCurrentMember: member,
      nonCriticalPushEnabled: preference.nonCriticalPushEnabled,
      now,
      timeZone: preference.timeZone,
      digestHourLocal: preference.digestHourLocal,
      nextDigestAt: preference.nextDigestAt,
      lastDigestLocalDate: preference.lastDigestLocalDate,
    });
    const group = await prisma.advisorNotificationDelivery.findMany({
      where: {
        userId: preference.userId,
        status: "pending",
        OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
        event: { boardId: preference.boardId, urgent: false },
      },
      include: { event: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const ids = group.map((delivery) => delivery.id);
    if (ids.length === 0) {
      await releasePreference({ preference, token: preferenceToken });
      continue;
    }
    if (plan === "wait") {
      results.waitingEvents += ids.length;
      await releasePreference({
        preference,
        token: preferenceToken,
        nextDigestAt: nextDigestOrFallback(now, preference.timeZone, preference.digestHourLocal),
      });
      continue;
    }

    const claim = await claimDeliveries(ids, now);
    if (claim.ids.length === 0) {
      await releasePreference({ preference, token: preferenceToken });
      continue;
    }
    if (plan === "suppress") {
      await finishDeliveries({ ...claim, now, status: "suppressed" });
      results.suppressedEvents += claim.ids.length;
      await releasePreference({
        preference,
        token: preferenceToken,
        nextDigestAt: nextDigestOrFallback(now, preference.timeZone, preference.digestHourLocal),
        lastDigestAt: now,
        lastDigestLocalDate: advisorLocalDateKey(now, preference.timeZone),
      });
      continue;
    }

    const claimedIds = new Set(claim.ids);
    const claimed = group.filter((delivery) => claimedIds.has(delivery.id));
    const digest = buildAdvisorDigest({
      boardTitle: board.title,
      events: claimed.map((delivery) => ({
        kind: delivery.event.type as AdvisorNotificationKind,
        urgent: false,
        title: delivery.event.title,
        body: delivery.event.body,
      })),
    });
    const collapseId = `advisor-digest:${createHash("sha256")
      .update(claimed.map((delivery) => delivery.event.fingerprint).sort().join("|"))
      .digest("hex")}`;
    const delivery = await deliverClaimed({
      ...claim,
      now,
      boardId: preference.boardId,
      userId: preference.userId,
      type: "advisor_digest",
      title: digest.title,
      body: digest.body,
      collapseId,
    });
    if (delivery.delivered) {
      results.deliveredDigests += 1;
      results.deliveredEvents += claim.ids.length;
      await releasePreference({
        preference,
        token: preferenceToken,
        nextDigestAt: nextDigestOrFallback(now, preference.timeZone, preference.digestHourLocal),
        lastDigestAt: now,
        lastDigestLocalDate: advisorLocalDateKey(now, preference.timeZone),
      });
    } else if (delivery.outcome === "rejected") {
      results.failedEvents += claim.ids.length;
      await releasePreference({
        preference,
        token: preferenceToken,
        nextDigestAt: nextDigestOrFallback(now, preference.timeZone, preference.digestHourLocal),
      });
    } else {
      await releasePreference({
        preference,
        token: preferenceToken,
        nextDigestAt: delivery.retryAt,
      });
    }
  }
  return results;
}
