import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const hardeningMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/202608280001_secure_all_public_tables.sql",
  ),
  "utf8",
);

test("every public table is private from the Supabase Data API", () => {
  assert.match(hardeningMigration, /namespace\.nspname = 'public'/);
  assert.match(hardeningMigration, /relation\.relkind in \('r', 'p'\)/);
  assert.match(
    hardeningMigration,
    /alter table %I\.%I enable row level security/,
  );
  assert.match(
    hardeningMigration,
    /revoke all on all tables in schema public from anon, authenticated/,
  );
  assert.match(
    hardeningMigration,
    /alter default privileges in schema public[\s\S]*revoke all on tables from anon, authenticated/,
  );
});
