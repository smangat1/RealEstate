import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("Scout and Advisor migrations reconcile the existing production shape without deleting rows", () => {
  const scout = read("prisma/migrations/20260912000000_homeboard_scout_monetization/migration.sql");
  const recentlyDeleted = read("prisma/migrations/20260909160000_recently_deleted_listings/migration.sql");
  const reconciliation = read("prisma/migrations/20260912190000_reconcile_scout_schema/migration.sql");
  const advisor = read("prisma/migrations/20260912200000_advisor_actions/migration.sql");
  const runbook = read("docs/PRODUCTION_MIGRATION_RUNBOOK.md");

  assert.doesNotMatch(scout, /gen_random_uuid/);
  assert.match(scout, /"matchScore"\s+INTEGER\s+NOT NULL DEFAULT 85/);
  assert.match(scout, /"matchReason"\s+TEXT\s+NOT NULL/);
  assert.match(reconciliation, /WHERE "matchReason" IS NULL/);
  assert.match(reconciliation, /ALTER COLUMN "updatedAt" DROP DEFAULT/);
  assert.match(reconciliation, /ScoutDiscoveredLead_boardId_listingId_key/);
  assert.doesNotMatch(reconciliation, /DELETE FROM|DROP TABLE|DROP COLUMN/i);
  assert.match(recentlyDeleted, /ADD COLUMN IF NOT EXISTS "deletedAt"/);
  assert.match(recentlyDeleted, /CREATE INDEX IF NOT EXISTS "BoardListing_boardId_deletedAt_idx"/);
  assert.match(recentlyDeleted, /SET TIME ZONE 'UTC'/);
  assert.doesNotMatch(recentlyDeleted, /DELETE FROM|DROP TABLE|DROP COLUMN/i);
  assert.match(advisor, /ADD COLUMN IF NOT EXISTS "createdAt"/);
  assert.match(advisor, /ADD COLUMN IF NOT EXISTS "updatedAt"/);
  assert.match(runbook, /migrate resolve --applied 20260912000000_homeboard_scout_monetization/);
  assert.match(runbook, /20260912190000_reconcile_scout_schema/);
});
