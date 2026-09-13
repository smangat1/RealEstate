import { demoAdvisorSubscription, isDemoAdvisorAccount } from "@/lib/advisor-access";
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

async function requireBoardMemberUserIds(boardId: string, actingUserId: string): Promise<string[]> {
  const board = await prisma.searchBoard.findUnique({
    where: { id: boardId },
    select: {
      userId: true,
      members: { select: { userId: true } },
    },
  });

  if (!board) {
    throw new Error("ADVISOR_BOARD_NOT_FOUND");
  }

  const memberUserIds = [...new Set([board.userId, ...board.members.map((member) => member.userId)])];
  if (!memberUserIds.includes(actingUserId)) {
    // Do not reveal the existence of a board to a signed-in non-member.
    throw new Error("ADVISOR_BOARD_NOT_FOUND");
  }

  return memberUserIds;
}

export async function requireBoardSubscriptionAccess(boardId: string, actingUserId: string): Promise<void> {
  await requireBoardMemberUserIds(boardId, actingUserId);
}

export async function getDemoBoardSubscription(boardId: string): Promise<BoardSubscriptionRecord | null> {
  const board = await prisma.searchBoard.findUnique({
    where: { id: boardId },
    select: { user: { select: { email: true, isDemoAccount: true } } },
  });
  if (!board) return null;
  return process.env.DEMO_MODE === "true" || isDemoAdvisorAccount(board.user)
    ? demoAdvisorSubscription(boardId) : null;
}

export async function getBoardSubscriptionState(boardId: string): Promise<BoardSubscriptionRecord | null> {
  const demo = await getDemoBoardSubscription(boardId);
  if (demo) return demo;

  const subscription = await prisma.boardSubscription.findFirst({
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
    await prisma.boardSubscription.update({
      where: { id: subscription.id },
      data: { status: "expired" },
    });
  }

  const fundedCents = subscription.contributions
    .filter((entry) => entry.status === "paid")
    .reduce((sum, entry) => sum + entry.amountCents, 0);

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
    contributions: subscription.contributions.map((c) => ({
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
): Promise<BoardSubscriptionRecord> {
  // Membership is derived on the server. Accepting member IDs from the client
  // allowed malformed splits and could create contributions for other users.
  const boardMemberUserIds = await requireBoardMemberUserIds(boardId, initiatorUserId);
  const demo = await getDemoBoardSubscription(boardId);
  if (demo) return demo;
  const members = [initiatorUserId, ...boardMemberUserIds.filter((id) => id !== initiatorUserId)];
  const split = calculateEqualSplit(members, SCOUT_WEEKLY_AMOUNT_CENTS);

  // Starting is idempotent: an impatient double tap should never create two
  // simultaneous funding rounds for the same board.
  const existing = await prisma.boardSubscription.findFirst({
    where: {
      boardId,
      OR: [
        { status: "pending_split" },
        { status: "active", expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) {
    const state = await getBoardSubscriptionState(boardId);
    if (state) return state;
  }

  // Create new split session
  await prisma.boardSubscription.create({
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
  await requireBoardMemberUserIds(boardId, userId);
  const demo = await getDemoBoardSubscription(boardId);
  if (demo) return demo;

  const activeOrPending = await prisma.boardSubscription.findFirst({
    where: { boardId, status: "pending_split" },
    include: { contributions: true },
    orderBy: { createdAt: "desc" },
  });

  if (!activeOrPending) {
    throw new Error("No pending Advisor split found for this board.");
  }

  const existingContribution = activeOrPending.contributions.find((contribution) => contribution.userId === userId);
  const now = new Date();

  if (existingContribution) {
    // A retried payment callback must be idempotent.
    if (existingContribution.status !== "paid") {
      await prisma.boardSubscriptionContribution.update({
        where: { id: existingContribution.id },
        data: {
          status: "paid",
          paymentMethod,
          paidAt: now,
          transactionId: transactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        },
      });
    }
  } else {
    // If someone joined after the split began, rebalance only the unpaid
    // remainder. Already-paid shares never change and the round still totals
    // exactly the advertised board price.
    const paidCents = activeOrPending.contributions
      .filter((contribution) => contribution.status === "paid")
      .reduce((sum, contribution) => sum + contribution.amountCents, 0);
    const unpaid = activeOrPending.contributions.filter((contribution) => contribution.status !== "paid");
    const remainingCents = Math.max(0, activeOrPending.amountCents - paidCents);
    const remainingMembers = [userId, ...unpaid.map((contribution) => contribution.userId).filter((id) => id !== userId)];
    const rebalanced = calculateEqualSplit(remainingMembers, remainingCents);

    await prisma.$transaction([
      ...unpaid.map((contribution) =>
        prisma.boardSubscriptionContribution.update({
          where: { id: contribution.id },
          data: { amountCents: rebalanced.sharesByUserId[contribution.userId] ?? 0 },
        }),
      ),
      prisma.boardSubscriptionContribution.create({
        data: {
          subscriptionId: activeOrPending.id,
          userId,
          amountCents: rebalanced.sharesByUserId[userId] ?? 0,
          status: "paid",
          paymentMethod,
          paidAt: now,
          transactionId: transactionId ?? `tx_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        },
      }),
    ]);
  }

  // Check if fully funded
  const updatedContributions = await prisma.boardSubscriptionContribution.findMany({
    where: { subscriptionId: activeOrPending.id },
  });
  const totalPaid = updatedContributions
    .filter((contribution) => contribution.status === "paid")
    .reduce((sum, contribution) => sum + contribution.amountCents, 0);

  if (totalPaid >= activeOrPending.amountCents) {
    const expiresAt = new Date(Date.now() + SCOUT_DURATION_MS);
    await prisma.boardSubscription.update({
      where: { id: activeOrPending.id },
      data: {
        status: "active",
        startedAt: now,
        expiresAt,
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
  await requireBoardMemberUserIds(boardId, userId);
  const demo = await getDemoBoardSubscription(boardId);
  if (demo) return demo;

  const pending = await prisma.boardSubscription.findFirst({
    where: { boardId, status: "pending_split" },
    include: { contributions: true },
    orderBy: { createdAt: "desc" },
  });

  if (!pending) {
    throw new Error("No pending Advisor split found to cover.");
  }

  const now = new Date();
  const alreadyPaid = pending.contributions
    .filter((contribution) => contribution.status === "paid")
    .reduce((sum, contribution) => sum + contribution.amountCents, 0);
  const remainingCents = Math.max(0, pending.amountCents - alreadyPaid);

  if (remainingCents > 0) {
    await prisma.boardSubscriptionContribution.create({
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
  await prisma.boardSubscription.update({
    where: { id: pending.id },
    data: {
      status: "active",
      startedAt: now,
      expiresAt,
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
