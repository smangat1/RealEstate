import assert from "node:assert/strict";
import test from "node:test";

import {
  ADVISOR_TEST_PAYMENT_PREFIX,
  ADVISOR_WINDOW_MS,
  applyAdvisorContribution,
  realAdvisorLedgerWhere,
} from "../lib/advisor-wallet";

test("test-mode funding records no Advisor subscription", async () => {
  let subscriptionWrites = 0;
  let aggregateReads = 0;

  const result = await applyAdvisorContribution({
    boardId: "board_test",
    userId: "operator",
    amountCents: 400,
    paymentId: `${ADVISOR_TEST_PAYMENT_PREFIX}payment`,
    testMode: true,
    now: new Date("2026-09-25T12:00:00.000Z"),
  }, {
    recordLedger: async () => true,
    getRealRollingTotal: async () => {
      aggregateReads += 1;
      return 400;
    },
    upsertSubscription: async () => {
      subscriptionWrites += 1;
    },
  });

  assert.deepEqual(result, {
    recorded: true,
    activated: false,
    rollingTotalCents: null,
  });
  assert.equal(aggregateReads, 0);
  assert.equal(subscriptionWrites, 0);
});

test("rolling Advisor totals exclude test-mode ledger rows", () => {
  assert.deepEqual(
    realAdvisorLedgerWhere("board_real", new Date("2026-09-18T12:00:00.000Z")),
    {
      boardId: "board_real",
      createdAt: { gte: new Date("2026-09-18T12:00:00.000Z") },
      NOT: {
        stripePaymentId: { startsWith: ADVISOR_TEST_PAYMENT_PREFIX },
      },
    },
  );
});

test("real Stripe funding counts toward totals and activates the subscription", async () => {
  const now = new Date("2026-09-25T12:00:00.000Z");
  let aggregateWindowStart: Date | undefined;
  let subscriptionWrite: { boardId: string; validUntil: Date } | undefined;

  const result = await applyAdvisorContribution({
    boardId: "board_real",
    userId: "member",
    amountCents: 250,
    paymentId: "pi_real_payment",
    testMode: false,
    now,
  }, {
    recordLedger: async () => true,
    getRealRollingTotal: async (_boardId, windowStart) => {
      aggregateWindowStart = windowStart;
      return 400;
    },
    upsertSubscription: async (boardId, validUntil) => {
      subscriptionWrite = { boardId, validUntil };
    },
  });

  assert.deepEqual(result, {
    recorded: true,
    activated: true,
    rollingTotalCents: 400,
  });
  assert.equal(
    aggregateWindowStart?.toISOString(),
    new Date(now.getTime() - ADVISOR_WINDOW_MS).toISOString(),
  );
  assert.deepEqual(subscriptionWrite, {
    boardId: "board_real",
    validUntil: new Date(now.getTime() + ADVISOR_WINDOW_MS),
  });
});
