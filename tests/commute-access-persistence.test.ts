import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const schema = source("prisma/schema.prisma");
const migration = source("supabase/migrations/202608020001_commute_access.sql");
const boardData = source("lib/board-data.ts");
const payloads = source("lib/mobile-payloads.ts");
const nativeAPI = source("ios/HomeboardNative/HomeboardNative/Sources/HomeboardAPI.swift");

test("commute access persists from onboarding through board member payloads", () => {
  assert.match(schema, /commuteAccess\s+String\?/);
  assert.match(migration, /add column if not exists "commuteAccess" text/);
  assert.match(migration, /'car', 'transit', 'flexible', 'remote', 'skip'/);
  assert.match(boardData, /commuteAccess: seededProfile\.commuteAccess \?\? null/);
  assert.match(boardData, /row\.commuteAccess === "car"/);
  assert.match(payloads, /commuteAccess: linkedRoommate\?\.commuteAccess \?\? null/);
  assert.match(nativeAPI, /self\.commuteAccess = remote\.commuteAccess/);
  assert.match(nativeAPI, /commuteAccess: member\.commuteAccess/);
});
