import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  buildAdvisorDigest,
  isAdvisorDigestWindow,
  isUrgentAdvisorNotification,
  planAdvisorDelivery,
} from "../lib/advisor-notification-diet";

test("non-urgent Advisor events become one board-aware digest", () => {
  const digest = buildAdvisorDigest({
    boardTitle: "Astoria search",
    events: [
      { kind: "listing_change", urgent: false, title: "Changed", body: "Price changed" },
      { kind: "advisor_follow_up", urgent: false, title: "Follow up", body: "Draft ready" },
      { kind: "negotiation_comp", urgent: false, title: "Comp", body: "Comp ready" },
    ],
  });
  assert.equal(digest.title, "Astoria search · Advisor digest");
  assert.equal(digest.total, 3);
  assert.match(digest.body, /1 listing update/);
  assert.match(digest.body, /1 follow-up draft/);
  assert.match(digest.body, /1 negotiation flag/);
});

test("only safety warnings and verified unavailable transitions interrupt immediately", () => {
  assert.equal(isUrgentAdvisorNotification({ kind: "listing_change" }), false);
  assert.equal(isUrgentAdvisorNotification({ kind: "listing_change", verifiedUnavailableTransition: true }), true);
  assert.equal(isUrgentAdvisorNotification({ kind: "scam_warning" }), true);
  assert.equal(isUrgentAdvisorNotification({ kind: "advisor_follow_up" }), false);
  assert.equal(isUrgentAdvisorNotification({ kind: "negotiation_comp" }), false);
  assert.equal(isUrgentAdvisorNotification({ kind: "advisor_group_nag" }), false);
});

test("digest windows honor each board preference timezone across edges", () => {
  const beforeNewYorkWindow = new Date("2026-09-27T21:59:59.000Z");
  const inNewYorkWindow = new Date("2026-09-27T22:00:00.000Z");
  assert.equal(isAdvisorDigestWindow(beforeNewYorkWindow, "America/New_York", 18), false);
  assert.equal(isAdvisorDigestWindow(inNewYorkWindow, "America/New_York", 18), true);
  assert.equal(isAdvisorDigestWindow(inNewYorkWindow, "America/Los_Angeles", 18), false);

  // After the fall DST transition, 18:00 New York is 23:00 UTC.
  assert.equal(isAdvisorDigestWindow(new Date("2026-11-01T22:00:00.000Z"), "America/New_York", 18), false);
  assert.equal(isAdvisorDigestWindow(new Date("2026-11-01T23:00:00.000Z"), "America/New_York", 18), true);
});

test("quiet settings suppress only non-critical pushes for that board member", () => {
  const now = new Date("2026-09-27T22:00:00.000Z");
  assert.equal(planAdvisorDelivery({
    urgent: false,
    isCurrentMember: true,
    nonCriticalPushEnabled: false,
    now,
    timeZone: "America/New_York",
    digestHourLocal: 18,
  }), "suppress");
  assert.equal(planAdvisorDelivery({
    urgent: true,
    isCurrentMember: true,
    nonCriticalPushEnabled: false,
    now,
    timeZone: "America/New_York",
    digestHourLocal: 18,
  }), "urgent");
  assert.equal(planAdvisorDelivery({
    urgent: false,
    isCurrentMember: true,
    nonCriticalPushEnabled: true,
    now,
    timeZone: "America/Los_Angeles",
    digestHourLocal: 18,
  }), "wait");
});

test("membership removal suppresses a queued delivery before any push", () => {
  assert.equal(planAdvisorDelivery({
    urgent: true,
    isCurrentMember: false,
    nonCriticalPushEnabled: true,
    now: new Date("2026-09-27T22:00:00.000Z"),
    timeZone: "America/New_York",
    digestHourLocal: 18,
  }), "suppress");
});

test("the persistent queue is atomic, board scoped, and leased for overlap-safe delivery", () => {
  const root = process.cwd();
  const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(resolve(root, "prisma/migrations/20260927121500_advisor_notification_diet/migration.sql"), "utf8");
  const proactive = readFileSync(resolve(root, "lib/advisor-proactive.ts"), "utf8");
  const delivery = readFileSync(resolve(root, "lib/advisor-notifications.ts"), "utf8");
  const nativeApp = readFileSync(resolve(root, "ios/HomeboardNative/HomeboardNative/Sources/HomeboardNativeApp.swift"), "utf8");
  const settingsUI = readFileSync(resolve(root, "ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift"), "utf8");

  assert.match(schema, /fingerprint\s+String\s+@unique/);
  assert.match(schema, /@@unique\(\[eventId, userId\]\)/);
  assert.match(delivery, /leaseToken: token/);
  assert.match(delivery, /recipientUserIds: \[input\.userId\]/);
  assert.match(proactive, /advisorNotificationEvent\.create/);
  assert.match(proactive, /chatMessage\.create/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /REVOKE ALL ON TABLE "AdvisorNotificationEvent" FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AdvisorNotificationEvent" TO service_role/);
  assert.match(nativeApp, /"advisor_digest"/);
  assert.match(settingsUI, /homeboard\.notifications\.digest-toggle/);
  assert.match(settingsUI, /HomeboardPalette\.danger/);
});
