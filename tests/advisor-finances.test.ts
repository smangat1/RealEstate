import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { summarizeAdvisorGroupFinances } from "../lib/advisor-finances";

test("Advisor combines member ranges without returning member-level values", () => {
  const summary = summarizeAdvisorGroupFinances([
    {
      annualIncomeMin: 70_000,
      annualIncomeMax: 85_000,
      creditScoreMin: 720,
      creditScoreMax: 760,
    },
    {
      annualIncomeMin: 90_000,
      annualIncomeMax: 110_000,
      creditScoreMin: 690,
      creditScoreMax: 740,
    },
  ], 3);

  assert.deepEqual(summary, {
    combinedAnnualIncomeMin: 160_000,
    combinedAnnualIncomeMax: 195_000,
    creditScoreMin: 690,
    creditScoreMax: 760,
    contributorCount: 2,
    memberCount: 3,
  });
  assert.equal("profiles" in summary, false);
  assert.equal("members" in summary, false);
});

test("Advisor excludes incomplete private ranges from the group quick fill", () => {
  const summary = summarizeAdvisorGroupFinances([
    {
      annualIncomeMin: 70_000,
      annualIncomeMax: null,
      creditScoreMin: 720,
      creditScoreMax: 760,
    },
  ], 2);

  assert.equal(summary.contributorCount, 0);
  assert.equal(summary.combinedAnnualIncomeMin, null);
  assert.equal(summary.creditScoreMin, null);
});

test("Advisor never exposes one member's ranges as a group aggregate", () => {
  const summary = summarizeAdvisorGroupFinances([
    {
      annualIncomeMin: 80_000,
      annualIncomeMax: 95_000,
      creditScoreMin: 710,
      creditScoreMax: 750,
    },
  ], 3);

  assert.equal(summary.contributorCount, 1);
  assert.equal(summary.combinedAnnualIncomeMin, null);
  assert.equal(summary.combinedAnnualIncomeMax, null);
  assert.equal(summary.creditScoreMin, null);
  assert.equal(summary.creditScoreMax, null);
});

test("private Advisor finance rows are not exposed through Supabase Data API", () => {
  const migration = readFileSync(resolve(
    process.cwd(),
    "prisma/migrations/20260925180000_advisor_member_financial_privacy/migration.sql",
  ), "utf8");
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/);
  assert.match(migration, /REVOKE ALL ON TABLE "AdvisorMemberFinancialProfile" FROM anon, authenticated/);
});
