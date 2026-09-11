import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const schema = read("prisma/schema.prisma");
const migration = read(
  "prisma/migrations/20260909160000_recently_deleted_listings/migration.sql",
);
const boardData = read("lib/board-data.ts");
const payloads = read("lib/mobile-payloads.ts");
const listingRoute = read(
  "app/api/mobile/boards/[id]/listings/[listingId]/route.ts",
);
const cleanupRoute = read(
  "app/api/mobile/boards/[id]/recently-deleted/route.ts",
);
const catalogSources = read("lib/catalog-listing-sources.ts");
const models = read(
  "ios/HomeboardNative/HomeboardNative/Sources/HomeboardModels.swift",
);
const api = read("ios/HomeboardNative/HomeboardNative/Sources/HomeboardAPI.swift");
const appModel = read(
  "ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift",
);
const workspace = read(
  "ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift",
);

test("recently deleted listings have an explicit indexed retention timestamp", () => {
  assert.match(schema, /deletedAt\s+DateTime\?/);
  assert.match(schema, /@@index\(\[boardId, deletedAt\]\)/);
  assert.match(migration, /ADD COLUMN "deletedAt" TIMESTAMP\(3\)/);
  assert.match(migration, /"BoardListing_boardId_deletedAt_idx"/);
});

test("ordinary board reads hide expired trash without performing maintenance writes", () => {
  const boardRead = boardData.slice(
    boardData.indexOf("export async function getBoardPageData"),
    boardData.indexOf("export async function createBoardAndReturnId"),
  );
  assert.match(boardRead, /recentlyDeletedCutoffDate = recentlyDeletedCutoff\(\)/);
  assert.match(boardRead, /\{ deletedAt: null \}/);
  assert.match(boardRead, /\{ deletedAt: \{ gt: recentlyDeletedCutoffDate \} \}/);
  assert.doesNotMatch(boardRead, /deleteMany/);
  assert.match(boardRead, /recentlyDeletedBoardListings/);
});

test("delete is recoverable, restore is explicit, and re-saving revives a duplicate", () => {
  assert.match(listingRoute, /moveBoardListingToRecentlyDeleted\(listingId, user\.id\)/);
  assert.match(listingRoute, /restoreRecentlyDeletedBoardListing\(listingId, user\.id\)/);
  assert.match(listingRoute, /Restore this listing before editing it/);

  const duplicateFlow = boardData.slice(
    boardData.indexOf("if (duplicateBoardListing)"),
    boardData.indexOf("const listing = await prisma.listing.create"),
  );
  assert.match(duplicateFlow, /deletedAt: null/);
  assert.match(boardData, /deletedAt: \{ gt: recentlyDeletedCutoff\(\) \}/);
  assert.match(
    boardData,
    /board\?\.deletedAt && board\.deletedAt <= recentlyDeletedCutoff\(\)[\s\S]*?boardListing\.delete/,
  );
});

test("expiry is a dedicated mutation and early permanent clearing is owner-only", () => {
  assert.match(cleanupRoute, /requireMobileAppUser/);
  assert.match(cleanupRoute, /purgeExpiredRecentlyDeletedBoardListings/);
  assert.match(cleanupRoute, /clearRecentlyDeletedBoardListings/);
  const clearHelper = boardData.slice(
    boardData.indexOf("export async function clearRecentlyDeletedBoardListings"),
    boardData.indexOf("export async function purgeExpiredRecentlyDeletedBoardListings"),
  );
  assert.match(clearHelper, /searchBoard\.findFirst/);
  assert.match(clearHelper, /userId: actorUserId/);
  assert.match(clearHelper, /RECENTLY_DELETED_OWNER_REQUIRED/);
  assert.match(cleanupRoute, /status: .*ownerRequired \? 403 : 500/);
});

test("mobile payloads remain backward compatible and expose recoverable listings", () => {
  assert.match(payloads, /recentlyDeleted: MobileListingPreviewPayload\[\]/);
  assert.match(payloads, /deletedAt\?: string \| null/);
  assert.match(models, /var recentlyDeleted: \[ListingPreview\]\? = nil/);
  assert.match(models, /deletedAt = try container\.decodeIfPresent/);
  assert.match(api, /func restoreListing/);
  assert.match(api, /func clearRecentlyDeleted/);
  assert.match(api, /func purgeExpiredRecentlyDeleted/);
});

test("multi-unit Zillow pages remain board references instead of merging distinct units", () => {
  assert.match(catalogSources, /isZillowBuildingDetailUrl\(canonicalUrl\)/);
  assert.match(catalogSources, /kind: "member_reference"/);
  assert.match(catalogSources, /catalogSourceId: null/);
  assert.match(catalogSources, /same URL represents several apartments/);
});

test("Cards cleanup only selects saved listings and explains the shared consequence", () => {
  assert.match(workspace, /Text\("Clean listings"\)/);
  assert.match(workspace, /cleanableListingIDs\.contains\(listing\.id\)/);
  assert.match(workspace, /if isCleaning \{[\s\S]*?if canClean/);
  assert.match(workspace, /Only listings already on this board can be moved/);
  assert.match(workspace, /Move to Recently Deleted/);
  assert.match(workspace, /shared board for everyone/);
  assert.match(appModel, /func moveListingsToRecentlyDeleted/);
  assert.match(appModel, /pendingListingCreatesByBoard\[key\]\?\.removeAll/);
});

test("Settings supports restore, seven-day expiry, and owner-only clear all", () => {
  assert.match(workspace, /title: "Recently Deleted"/);
  assert.match(workspace, /SharedRecentlyDeletedSheet/);
  assert.match(workspace, /restoreRecentlyDeletedListing/);
  assert.match(workspace, /Clear Recently Deleted now/);
  assert.match(workspace, /Only the board owner can permanently clear/);
  assert.match(workspace, /7 \* 24 \* 60 \* 60/);
  assert.match(appModel, /scheduleRecentlyDeletedPurge\(boardId: id\)/);
  assert.match(appModel, /recentlyDeletedPurgeBoardIDs\.insert\(boardId\)\.inserted/);
  assert.match(appModel, /let date = self\.recentlyDeletedDate\(from: deletedAt\)/);
});
