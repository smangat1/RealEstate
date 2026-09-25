import type { Prisma } from "@prisma/client";

export const ADVISOR_WEEK_CENTS = 400;
export const ADVISOR_WINDOW_MS = 7 * 24 * 60 * 60 * 1_000;
export const ADVISOR_TEST_PAYMENT_PREFIX = "advisor_test_";

export function realAdvisorLedgerWhere(
  boardId: string,
  windowStart: Date,
): Prisma.BoardWalletLedgerWhereInput {
  return {
    boardId,
    createdAt: { gte: windowStart },
    NOT: {
      stripePaymentId: { startsWith: ADVISOR_TEST_PAYMENT_PREFIX },
    },
  };
}

type AdvisorContribution = {
  boardId: string;
  userId: string;
  amountCents: number;
  paymentId: string;
  testMode: boolean;
  now: Date;
};

type AdvisorContributionStore = {
  recordLedger: (input: AdvisorContribution) => Promise<boolean>;
  getRealRollingTotal: (boardId: string, windowStart: Date) => Promise<number>;
  upsertSubscription: (boardId: string, validUntil: Date) => Promise<void>;
};

export async function applyAdvisorContribution(
  contribution: AdvisorContribution,
  store: AdvisorContributionStore,
) {
  const recorded = await store.recordLedger(contribution);
  if (!recorded || contribution.testMode) {
    return { recorded, activated: false, rollingTotalCents: null };
  }

  const windowStart = new Date(contribution.now.getTime() - ADVISOR_WINDOW_MS);
  const rollingTotalCents = await store.getRealRollingTotal(contribution.boardId, windowStart);
  if (rollingTotalCents < ADVISOR_WEEK_CENTS) {
    return { recorded: true, activated: false, rollingTotalCents };
  }

  const validUntil = new Date(contribution.now.getTime() + ADVISOR_WINDOW_MS);
  await store.upsertSubscription(contribution.boardId, validUntil);
  return { recorded: true, activated: true, rollingTotalCents };
}
