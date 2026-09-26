import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { summarizeAdvisorGroupFinances } from "../lib/advisor-finances";

test("Advisor never returns board-visible aggregates of private member values", () => {
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
    combinedAnnualIncomeMin: null,
    combinedAnnualIncomeMax: null,
    creditScoreMin: null,
    creditScoreMax: null,
    contributorCount: 0,
    memberCount: 3,
  });
  assert.equal("profiles" in summary, false);
  assert.equal("members" in summary, false);
});

test("Advisor output is invariant across successive member updates", () => {
  const summary = summarizeAdvisorGroupFinances([
    {
      annualIncomeMin: 70_000,
      annualIncomeMax: null,
      creditScoreMin: 720,
      creditScoreMax: 760,
    },
  ], 2);

  const changed = summarizeAdvisorGroupFinances([
    {
      annualIncomeMin: 700_000,
      annualIncomeMax: 900_000,
      creditScoreMin: 300,
      creditScoreMax: 850,
    },
    {
      annualIncomeMin: 10_000,
      annualIncomeMax: 20_000,
      creditScoreMin: 600,
      creditScoreMax: 610,
    },
  ], 2);
  assert.deepEqual(changed, summary);
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

  assert.equal(summary.contributorCount, 0);
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
