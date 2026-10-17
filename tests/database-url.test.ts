import assert from "node:assert/strict";
import test from "node:test";

import { getPrismaDatasourceUrl } from "../lib/database-url";

test("serverless Prisma uses one transaction-pool connection for Supabase", () => {
  const result = getPrismaDatasourceUrl(
    "postgresql://example.pooler.supabase.com:5432/postgres?sslmode=require&connect_timeout=10",
    true,
  );
  const url = new URL(result!);

  assert.equal(url.port, "6543");
  assert.equal(url.searchParams.get("pgbouncer"), "true");
  assert.equal(url.searchParams.get("connection_limit"), "1");
  assert.equal(url.searchParams.get("sslmode"), "require");
  assert.equal(url.searchParams.get("connect_timeout"), "10");
});

test("database URLs outside the Vercel serverless pool stay unchanged", () => {
  const sessionPooler =
    "postgresql://example.pooler.supabase.com:5432/postgres";
  const otherProvider = "postgresql://database.example.com:5432/app";

  assert.equal(getPrismaDatasourceUrl(sessionPooler, false), sessionPooler);
  assert.equal(getPrismaDatasourceUrl(otherProvider, true), otherProvider);
  assert.equal(getPrismaDatasourceUrl("not-a-url", true), "not-a-url");
});
