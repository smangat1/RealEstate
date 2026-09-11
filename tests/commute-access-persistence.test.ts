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
const nativeModel = source("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
const workspace = source("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");
const onboarding = source("ios/HomeboardNative/HomeboardNative/Sources/AccountOnboardingView.swift");
const memberRoute = source("app/api/mobile/boards/[id]/members/route.ts");
const memberDetailRoute = source("app/api/mobile/boards/[id]/members/[memberId]/route.ts");

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

test("a member's onboarding commute follows them into each shared board", () => {
  assert.match(boardData, /workAddress:[\s\S]*seededProfile\.commuteTarget\?\.trim\(\) \|\| null/);
  assert.match(boardData, /where: \{ boardId, linkedUserId: actingUserId \}/);
  assert.match(boardData, /commuteDestination: finalizedProfile\.commuteTarget \?\? null/);
  assert.match(boardData, /boardId: \{ not: invitation\.boardId \}/);
  assert.match(boardData, /orderBy: \{ updatedAt: "desc" \}/);
  assert.match(boardData, /commuteDestination: previousRoommate\?\.commuteDestination \?\? user\.workAddress/);
  assert.match(boardData, /commuteAccess: previousRoommate\?\.commuteAccess \?\? null/);
  assert.match(boardData, /preferredCommuteMinutes: previousRoommate\?\.preferredCommuteMinutes \?\? null/);
  assert.match(boardData, /maxCommuteMinutes: previousRoommate\?\.maxCommuteMinutes \?\? null/);
});

test("additional commute points persist separately from people and route every listing", () => {
  assert.match(nativeModel, /func addCommutePoint\(/);
  assert.match(nativeModel, /status: "commute point"/);
  assert.match(nativeAPI, /roleLabel: String\?/);
  assert.match(nativeAPI, /preferredCommuteMinutes: preferredCommuteMinutes/);
  assert.match(memberRoute, /roleLabel: z\.enum\(\["roommate", "commute point"\]\)/);
  assert.match(memberRoute, /Only the board owner can add shared commute points/);
  assert.match(memberDetailRoute, /Only the board owner can edit shared commute points/);
  assert.match(memberDetailRoute, /name: parsed\.data\.name/);
  assert.match(boardData, /roommate\.roleLabel !== "commute point"/);
  assert.match(payloads, /roommate\.roleLabel === "commute point"/);
  assert.match(workspace, /title: "Add a commute point"/);
  assert.match(workspace, /Your main commute belongs to you/);
  assert.match(workspace, /child's school neighborhood/);
  assert.match(workspace, /roommate stand-in/);
  assert.match(workspace, /A neighborhood is enough/);
  assert.match(workspace, /Additional commute points/);
  assert.match(onboarding, /final class OnboardingAddressSearch/);
  assert.doesNotMatch(onboarding, /private final class OnboardingAddressSearch/);
  assert.equal(workspace.match(/SharedAddressAutocompleteField\(/g)?.length, 3);
  assert.match(workspace, /Suggestions from Apple Maps/);
  assert.match(workspace, /addressSearch\.resolvedAddress\(for: suggestion\)/);
  assert.match(workspace, /addressSearch\.update\(query: value, city: city\)/);
  assert.doesNotMatch(workspace, /Capture a profile manually/);
});
