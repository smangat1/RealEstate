import { prisma } from "@/lib/prisma";
import { trackEvent } from "@/lib/analytics";
import type { BoardSubscriptionRecord, BoardSubscriptionStatus } from "@/lib/types";
import {
  SCOUT_WEEKLY_AMOUNT_CENTS,
  SCOUT_DURATION_MS,
  calculateEqualSplit,
} from "@/lib/scout-utils";

export { SCOUT_WEEKLY_AMOUNT_CENTS, SCOUT_DURATION_MS, calculateEqualSplit };
export type { SplitCalculation } from "@/lib/scout-utils";

export async function getBoardSubscriptionState(boardId: string): Promise<BoardSubscriptionRecord | null> {
  const subscription = await (prisma as any).boardSubscription.findFirst({
    where: { boardId },
    orderBy: { createdAt: "desc" },
    include: {
      contributions: {
        include: {
          user: {
            select: { id: true, displayName: true },
          },
        },
      },
    },
  });

  if (!subscription) return null;

  const now = new Date();
  let currentStatus: BoardSubscriptionStatus = subscription.status as BoardSubscriptionStatus;

  // Auto-expire if pass window ended
  if (subscription.status === "active" && subscription.expiresAt && subscription.expiresAt < now) {
    currentStatus = "expired";
    await (prisma as any).boardSubscription.update({
      where: { id: subscription.id },
      data: { status: "expired" },
    });
  }

  const fundedCents = subscription.contributions
    .filter((entry: any) => entry.status === "paid")
    .reduce((sum: number, entry: any) => sum + entry.amountCents, 0);

  const daysRemaining = subscription.expiresAt && currentStatus === "active"
    ? Math.max(0, Math.ceil((subscription.expiresAt.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)))
    : 0;

  return {
    id: subscription.id,
    boardId: subscription.boardId,
    status: currentStatus,
    tier: "scout_weekly",
    amountCents: subscription.amountCents,
    currency: subscription.currency,
    startedAt: subscription.startedAt?.toISOString() ?? null,
    expiresAt: subscription.expiresAt?.toISOString() ?? null,
    fundedCents,
    targetCents: subscription.amountCents,
    daysRemaining,
    contributions: subscription.contributions.map((c: any) => ({
      id: c.id,
      subscriptionId: c.subscriptionId,
      userId: c.userId,
      userName: c.user?.displayName,
      amountCents: c.amountCents,
      status: c.status as "pledged" | "paid",
      paymentMethod: c.paymentMethod,
      paidAt: c.paidAt?.toISOString() ?? null,
      transactionId: c.transactionId,
    })),
  };
}

export async function initiateBoardSubscriptionSplit(
  boardId: string,
  initiatorUserId: string,
  memberUserIds: string[],
): Promise<BoardSubscriptionRecord> {
  const members = [...new Set([initiatorUserId, ...memberUserIds.filter(Boolean)])];
  const split = calculateEqualSplit(members, SCOUT_WEEKLY_AMOUNT_CENTS);

  // Check if there is already an active subscription
  const existing = await (prisma as any).boardSubscription.findFirst({
    where: { boardId, status: "active", expiresAt: { gt: new Date() } },
  });
  if (existing) {
    const state = await getBoardSubscriptionState(boardId);
    if (state) return state;
  }

  // Create new split session
  await (prisma as any).boardSubscription.create({
    data: {
      boardId,
      status: "pending_split",
      tier: "scout_weekly",
      amountCents: SCOUT_WEEKLY_AMOUNT_CENTS,
      currency: "usd",
      contributions: {
        create: members.map((uid) => ({
          userId: uid,
          amountCents: split.sharesByUserId[uid] ?? split.perRoommateCents,
          status: "pledged",
        })),
      },
    },
  });

  await trackEvent("scout_split_initiated", {
    boardId,
    initiatorUserId,
    memberCount: members.length,
    perRoommateCents: split.perRoommateCents,
  });

  const state = await getBoardSubscriptionState(boardId);
  return state!;
}

export async function contributeToBoardSubscription(
  boardId: string,
  userId: string,
  paymentMethod: string = "apple_pay",
  transactionId?: string,
): Promise<BoardSubscriptionRecord> {
  const activeOrPending = await (prisma as any).boardSubscription.findFirst({
    where: { boardId, status: "pending_split" },
    include: { contributions: true },
    orderBy: { createdAt: "desc" },
  });

  if (!activeOrPending) {
    throw new Error("No active Scout split found for this board.");
  }

  const existingContribution = activeOrPending.contributions.find((c: any) => c.userId === userId);
  const now = new Date();

  if (existingContribution) {
    await (prisma as any).boardSubscriptionContribution.update({
      where: { id: existingContribution.id },
      data: {
        status: "paid",
        paymentMethod,
        paidAt: now,
        transactionId: transactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
    });
  } else {
    // Roommate was added after split was initiated
    const count = activeOrPending.contributions.length + 1;
    const amount = Math.floor(SCOUT_WEEKLY_AMOUNT_CENTS / count);
    await (prisma as any).boardSubscriptionContribution.create({
      data: {
        subscriptionId: activeOrPending.id,
        userId,
        amountCents: amount,
        status: "paid",
        paymentMethod,
        paidAt: now,
        transactionId: transactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
    });
  }

  // Check if fully funded
  const updatedContributions = await (prisma as any).boardSubscriptionContribution.findMany({
    where: { subscriptionId: activeOrPending.id },
  });
  const totalPaid = updatedContributions
    .filter((c: any) => c.status === "paid")
    .reduce((sum: number, c: any) => sum + c.amountCents, 0);

  if (totalPaid >= activeOrPending.amountCents) {
    const expiresAt = new Date(Date.now() + SCOUT_DURATION_MS);
    await (prisma as any).boardSubscription.update({
      where: { id: activeOrPending.id },
      data: {
        status: "active",
        startedAt: now,
        expiresAt,
      },
    });

    // Announce to shared chat
    await (prisma as any).chatMessage.create({
      data: {
        boardId,
        role: "assistant",
        content: "🚀 Homeboard Scout is now fully funded and active for the group! Price drop monitoring, concession alerts, and daily lead radar are unlocked for the next 7 days.",
      },
    });

    await trackEvent("scout_subscription_activated", {
      boardId,
      activatedByUserId: userId,
      totalAmountCents: totalPaid,
      durationDays: 7,
    });
  }

  const state = await getBoardSubscriptionState(boardId);
  return state!;
}

export async function coverRemainingSubscriptionBalance(
  boardId: string,
  userId: string,
  paymentMethod: string = "apple_pay",
): Promise<BoardSubscriptionRecord> {
  const pending = await (prisma as any).boardSubscription.findFirst({
    where: { boardId, status: "pending_split" },
    include: { contributions: true },
    orderBy: { createdAt: "desc" },
  });

  if (!pending) {
    throw new Error("No pending Scout split found to cover.");
  }

  const now = new Date();
  const alreadyPaid = pending.contributions
    .filter((c: any) => c.status === "paid")
    .reduce((sum: number, c: any) => sum + c.amountCents, 0);
  const remainingCents = Math.max(0, pending.amountCents - alreadyPaid);

  if (remainingCents > 0) {
    await (prisma as any).boardSubscriptionContribution.create({
      data: {
        subscriptionId: pending.id,
        userId,
        amountCents: remainingCents,
        status: "paid",
        paymentMethod: `${paymentMethod}_balance_cover`,
        paidAt: now,
        transactionId: `cover_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      },
    });
  }

  // Activate immediately
  const expiresAt = new Date(Date.now() + SCOUT_DURATION_MS);
  await (prisma as any).boardSubscription.update({
    where: { id: pending.id },
    data: {
      status: "active",
      startedAt: now,
      expiresAt,
    },
  });

  await (prisma as any).chatMessage.create({
    data: {
      boardId,
      role: "assistant",
      content: "🚀 Homeboard Scout was covered and is now active for the entire group! Autonomous price drop tracking, concession alerts, and lead radar are live for the next 7 days.",
    },
  });

  await trackEvent("scout_balance_covered", {
    boardId,
    userId,
    amountCents: remainingCents,
  });

  const state = await getBoardSubscriptionState(boardId);
  return state!;
}
