import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import {
  SCOUT_WEEKLY_AMOUNT_CENTS,
  calculateEqualSplit,
} from "../lib/scout-utils";

const source = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

test("calculateEqualSplit divides $4.99 cleanly among roommates with remainder assigned to initiator", () => {
  // 1 member
  const split1 = calculateEqualSplit(["user-1"]);
  assert.equal(split1.totalAmountCents, 499);
  assert.equal(split1.perRoommateCents, 499);
  assert.equal(split1.sharesByUserId["user-1"], 499);

  // 2 members: 499 / 2 = 249 remainder 1 -> initiator gets 250, second gets 249
  const split2 = calculateEqualSplit(["user-1", "user-2"]);
  assert.equal(split2.totalAmountCents, 499);
  assert.equal(split2.sharesByUserId["user-1"], 250);
  assert.equal(split2.sharesByUserId["user-2"], 249);
  assert.equal(split2.sharesByUserId["user-1"] + split2.sharesByUserId["user-2"], 499);

  // 3 members: 499 / 3 = 166 remainder 1 -> initiator gets 167, others get 166
  const split3 = calculateEqualSplit(["user-1", "user-2", "user-3"]);
  assert.equal(split3.totalAmountCents, 499);
  assert.equal(split3.sharesByUserId["user-1"], 167);
  assert.equal(split3.sharesByUserId["user-2"], 166);
  assert.equal(split3.sharesByUserId["user-3"], 166);
  assert.equal(
    split3.sharesByUserId["user-1"] + split3.sharesByUserId["user-2"] + split3.sharesByUserId["user-3"],
    499
  );

  // 4 members: 499 / 4 = 124 remainder 3 -> initiator gets 124 + 3 = 127, others get 124
  const split4 = calculateEqualSplit(["user-1", "user-2", "user-3", "user-4"]);
  assert.equal(split4.totalAmountCents, 499);
  assert.equal(split4.sharesByUserId["user-1"], 127);
  assert.equal(split4.sharesByUserId["user-2"], 124);
  assert.equal(split4.sharesByUserId["user-3"], 124);
  assert.equal(split4.sharesByUserId["user-4"], 124);
  assert.equal(
    split4.sharesByUserId["user-1"] +
      split4.sharesByUserId["user-2"] +
      split4.sharesByUserId["user-3"] +
      split4.sharesByUserId["user-4"],
    499
  );
});

test("Advisor monitoring route is scheduled and exports a GET handler", () => {
  // Route file checks
  const routePath = resolve(process.cwd(), "app/api/cron/advisor-monitor/route.ts");
  assert.ok(existsSync(routePath), "cron route file should exist");
  const src = readFileSync(routePath, "utf8");
  assert.match(src, /export async function GET/, "should export a GET handler");
  assert.match(src, /CRON_SECRET/, "should check CRON_SECRET for auth");
  assert.match(src, /monitorBoardListings/, "should monitor saved listings");
  assert.match(src, /markStaleInquiriesAndCreateFollowUps/, "should schedule inquiry follow-ups");

  // vercel.json schedule checks
  const vercelPath = resolve(process.cwd(), "vercel.json");
  assert.ok(existsSync(vercelPath), "vercel.json should exist");
  const vercelJson = JSON.parse(readFileSync(vercelPath, "utf8")) as {
    crons?: Array<{ path: string; schedule: string }>;
  };
  const cronEntry = vercelJson.crons?.find((entry) => entry.path === "/api/cron/advisor-monitor");
  assert.ok(cronEntry, "vercel.json should schedule /api/cron/advisor-monitor");
  assert.equal(cronEntry.schedule, "0 9,21 * * *", "should run twice a day at 9am and 9pm UTC");
});

test("Advisor subscription is included in native board payloads", () => {
  const payload = source("lib/mobile-payloads.ts");

  assert.match(payload, /scoutSubscription:\s*data\.scoutSubscription\s*\?\?\s*null/);
});

test("Advisor split route derives members on the server", () => {
  const routeSource = source("app/api/mobile/boards/[id]/subscription/route.ts");
  const serviceSource = source("lib/subscription-service.ts");

  assert.doesNotMatch(routeSource, /body\.memberUserIds/);
  assert.match(serviceSource, /requireBoardMemberUserIds\(boardId, initiatorUserId\)/);
  assert.match(serviceSource, /status:\s*"pending_split"/);
});

test("demo accounts and the native preview receive an active Advisor entitlement", () => {
  const boardData = source("lib/board-data.ts");
  const appModel = source("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");

  assert.match(boardData, /getBoardSubscriptionState\(board.id\)/);
  assert.match(appModel, /boardWithDemoAdvisorEntitlement\(response\.board\)/);
  assert.doesNotMatch(appModel, /private var hasDemoAdvisorEntitlement/);
  assert.match(appModel, /id:\s*"demo-advisor-preview-workspace"/);
  assert.match(appModel, /boardError\s*=\s*nil\s*\n\s*boardTab\s*=\s*tab/);
});
