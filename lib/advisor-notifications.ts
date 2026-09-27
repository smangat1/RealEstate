import "server-only";

import { createHash, randomUUID } from "node:crypto";

import type { Prisma } from "@prisma/client";

import {
  buildAdvisorDigest,
  DEFAULT_ADVISOR_DIGEST_HOUR,
  DEFAULT_ADVISOR_TIME_ZONE,
  planAdvisorDelivery,
  type AdvisorNotificationKind,
} from "@/lib/advisor-notification-diet";
import { notifyBoardMembers, type BoardPushType } from "@/lib/apns";
import { sendOperationalAlert } from "@/lib/monitoring";
import { prisma } from "@/lib/prisma";

const DELIVERY_LEASE_MS = 5 * 60 * 1_000;
const DELIVERY_SCAN_LIMIT = 1_000;

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
  status: "delivered" | "suppressed";
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
    },
  });
}

async function releaseDeliveries(ids: string[], token: string) {
  if (ids.length === 0) return;
  await prisma.advisorNotificationDelivery.updateMany({
    where: { id: { in: ids }, leaseToken: token, status: "pending" },
    data: { leaseToken: null, leaseUntil: null },
  });
}

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
}) {
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
    if (!result.configured) {
      await releaseDeliveries(input.ids, input.token);
      return false;
    }
    // APNs has no cross-device transaction. One configured attempt is final so
    // a retry cannot duplicate a push on a device that already accepted it.
    await finishDeliveries({ ...input, status: "delivered" });
    return true;
  } catch (error) {
    await releaseDeliveries(input.ids, input.token);
    await sendOperationalAlert(error, {
      area: "push",
      operation: `advisor_${input.type}`,
      severity: "error",
    });
    return false;
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
    if (!members.has(delivery.userId)) {
      const claim = await claimDeliveries([delivery.id], now);
      await finishDeliveries({ ...claim, now, status: "suppressed" });
      continue;
    }
    const claim = await claimDeliveries([delivery.id], now);
    if (claim.ids.length === 0) continue;
    if (await deliverClaimed({
      ...claim,
      now,
      boardId: event.boardId,
      userId: delivery.userId,
      type: event.type as BoardPushType,
      title: event.title,
      body: event.body,
      boardListingId: event.boardListingId,
      collapseId: event.fingerprint,
    })) delivered += 1;
  }
  return delivered;
}

type PendingDelivery = Awaited<ReturnType<typeof pendingDigestDeliveries>>[number];

async function pendingDigestDeliveries(now: Date) {
  return prisma.advisorNotificationDelivery.findMany({
    where: {
      status: "pending",
      OR: [{ leaseUntil: null }, { leaseUntil: { lt: now } }],
      event: { urgent: false },
    },
    include: {
      event: {
        include: {
          board: {
            select: { title: true, userId: true, members: { select: { userId: true } } },
          },
        },
      },
    },
    orderBy: { createdAt: "asc" },
    take: DELIVERY_SCAN_LIMIT,
  });
}

function groupPendingDeliveries(deliveries: PendingDelivery[]) {
  const groups = new Map<string, PendingDelivery[]>();
  for (const delivery of deliveries) {
    const key = `${delivery.event.boardId}:${delivery.userId}`;
    groups.set(key, [...(groups.get(key) ?? []), delivery]);
  }
  return Array.from(groups.values());
}

export async function flushDueAdvisorDigests(now = new Date()) {
  const pending = await pendingDigestDeliveries(now);
  const groups = groupPendingDeliveries(pending);
  const results = { deliveredDigests: 0, deliveredEvents: 0, suppressedEvents: 0, waitingEvents: 0 };

  for (const group of groups) {
    const first = group[0];
    if (!first) continue;
    const board = first.event.board;
    const member = currentMemberIds(board).has(first.userId);
    const preference = await prisma.boardNotificationPreference.findUnique({
      where: { boardId_userId: { boardId: first.event.boardId, userId: first.userId } },
    });
    const plan = planAdvisorDelivery({
      urgent: false,
      isCurrentMember: member,
      nonCriticalPushEnabled: preference?.nonCriticalPushEnabled ?? true,
      now,
      timeZone: preference?.timeZone ?? DEFAULT_ADVISOR_TIME_ZONE,
      digestHourLocal: preference?.digestHourLocal ?? DEFAULT_ADVISOR_DIGEST_HOUR,
    });
    const ids = group.map((delivery) => delivery.id);
    if (plan === "wait") {
      results.waitingEvents += ids.length;
      continue;
    }

    const claim = await claimDeliveries(ids, now);
    if (claim.ids.length === 0) continue;
    if (plan === "suppress") {
      await finishDeliveries({ ...claim, now, status: "suppressed" });
      results.suppressedEvents += claim.ids.length;
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
    if (await deliverClaimed({
      ...claim,
      now,
      boardId: first.event.boardId,
      userId: first.userId,
      type: "advisor_digest",
      title: digest.title,
      body: digest.body,
      collapseId,
    })) {
      results.deliveredDigests += 1;
      results.deliveredEvents += claim.ids.length;
    }
  }
  return results;
}
