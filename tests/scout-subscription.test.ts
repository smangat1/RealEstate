import assert from "node:assert/strict";
import test from "node:test";
import {
  SCOUT_WEEKLY_AMOUNT_CENTS,
  calculateEqualSplit,
  detectPriceDrop,
  generateBrokerPitch,
} from "../lib/scout-utils";

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

test("detectPriceDrop correctly identifies price cuts and calculates percentage", () => {
  // Price drop from $3,400 to $3,200
  const drop = detectPriceDrop(3400, 3200);
  assert.ok(drop !== null);
  assert.equal(drop.oldPrice, 3400);
  assert.equal(drop.newPrice, 3200);
  assert.equal(drop.dropAmount, 200);
  assert.equal(drop.percentDrop, 6);

  // No drop (same price)
  assert.equal(detectPriceDrop(3000, 3000), null);

  // Price increase
  assert.equal(detectPriceDrop(3000, 3200), null);

  // Invalid numbers
  assert.equal(detectPriceDrop(0, 3200), null);
  assert.equal(detectPriceDrop(3200, 0), null);
});

test("generateBrokerPitch creates professional, tailored group outreach text", () => {
  const pitch = generateBrokerPitch({
    listingAddress: "31-15 21st St, Apt 3B",
    neighborhood: "Astoria",
    monthlyRent: 3200,
    roommateCount: 3,
    combinedBudgetMax: 3500,
    moveInDate: "October 1st",
    senderName: "Sam",
  });

  assert.match(pitch, /31-15 21st St, Apt 3B in Astoria/);
  assert.match(pitch, /\$3,200\/mo/);
  assert.match(pitch, /my 2 roommates and myself \(3 working professionals\)/);
  assert.match(pitch, /October 1st/);
  assert.match(pitch, /40x requirements/);
  assert.match(pitch, /tour this week/);
  assert.match(pitch, /Sam and group/);
});

test("scout cron scan route file exists and exports a GET handler", () => {
  const fs = require("node:fs");
  const path = require("node:path");

  // Route file checks
  const routePath = path.join(__dirname, "../app/api/cron/scout-scan/route.ts");
  assert.ok(fs.existsSync(routePath), "cron route file should exist");
  const src = fs.readFileSync(routePath, "utf8");
  assert.match(src, /export async function GET/, "should export a GET handler");
  assert.match(src, /CRON_SECRET/, "should check CRON_SECRET for auth");
  assert.match(src, /runBoardScoutScan/, "should call runBoardScoutScan for each board");
  assert.match(src, /boardSubscription/, "should query for active subscriptions");

  // vercel.json schedule checks
  const vercelPath = path.join(__dirname, "../vercel.json");
  assert.ok(fs.existsSync(vercelPath), "vercel.json should exist");
  const vercelJson = JSON.parse(fs.readFileSync(vercelPath, "utf8"));
  const cronEntry = vercelJson.crons?.find((c: any) => c.path === "/api/cron/scout-scan");
  assert.ok(cronEntry, "vercel.json should have a cron entry for /api/cron/scout-scan");
  assert.equal(cronEntry.schedule, "0 9,21 * * *", "should run twice a day at 9am and 9pm UTC");
});
