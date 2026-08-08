import assert from "node:assert/strict";
import test from "node:test";

import { allocateRentFairly, summarizeMemberAffordability } from "@/lib/group-affordability";

const members = [
  { id: "sam", name: "Sam", budgetMin: 1_300, budgetMax: 1_700, stretchBudget: 1_800 },
  { id: "maya", name: "Maya", budgetMin: 1_400, budgetMax: 1_800, stretchBudget: 1_900 },
  { id: "jordan", name: "Jordan", budgetMin: 1_200, budgetMax: 1_500, stretchBudget: 1_600 },
];

test("group affordability sums each member's personal contribution", () => {
  assert.deepEqual(summarizeMemberAffordability(members), {
    groupBudgetMin: 3_900,
    groupBudgetMax: 5_000,
    groupStretchBudget: 5_300,
    budgetMemberCount: 3,
    missingBudgetMemberNames: [],
  });
});

test("fair rent splits charge higher-capacity members more at the same relative burden", () => {
  const split = allocateRentFairly(4_500, members);
  assert.ok(split);
  assert.equal(split.status, "ready");
  assert.equal(split.shares.reduce((sum, share) => sum + share.amount, 0), 4_500);
  assert.deepEqual(
    split.shares.map((share) => [share.name, share.amount]),
    [
      ["Sam", 1_530],
      ["Maya", 1_620],
      ["Jordan", 1_350],
    ],
  );
  assert.ok(split.shares.every((share) => share.percentOfComfortableBudget === 90));
});

test("a missing member budget keeps the split provisional", () => {
  const split = allocateRentFairly(3_000, [
    members[0],
    { ...members[1], budgetMax: null, stretchBudget: null },
  ]);
  assert.ok(split);
  assert.equal(split.status, "incomplete");
  assert.deepEqual(split.missingMemberNames, ["Maya"]);
});
