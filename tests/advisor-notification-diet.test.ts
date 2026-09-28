import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import {
  advisorDeliveryLeaseIsAvailable,
  classifyAdvisorPushDelivery,
  classifyBoardPushAttempt,
} from "../lib/apns-delivery";
import {
  buildAdvisorDigest,
  advisorLocalDateKey,
  advisorNotificationPreferenceKey,
  advisorTimeZoneAfterDeviceRegistration,
  initialAdvisorTimeZone,
  isAdvisorDigestDue,
  isAdvisorDigestWindow,
  isUrgentAdvisorNotification,
  nextAdvisorDigestAt,
  planAdvisorDelivery,
  selectFairDigestCandidates,
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

test("a delayed cron catches up once during safe local hours", () => {
  const due = new Date("2026-09-27T22:00:00.000Z");
  const delayed = new Date("2026-09-28T00:00:00.000Z"); // 20:00 New York
  assert.equal(isAdvisorDigestDue({
    now: delayed,
    nextDigestAt: due,
    timeZone: "America/New_York",
    digestHourLocal: 18,
  }), true);
  assert.equal(isAdvisorDigestDue({
    now: delayed,
    nextDigestAt: due,
    timeZone: "America/New_York",
    digestHourLocal: 18,
    lastDigestLocalDate: "2026-09-27",
  }), false);
  assert.equal(isAdvisorDigestDue({
    now: new Date("2026-09-28T03:00:00.000Z"), // 23:00 New York
    nextDigestAt: due,
    timeZone: "America/New_York",
    digestHourLocal: 18,
  }), false);
});

test("next digest scheduling survives DST and timezone changes", () => {
  assert.equal(
    nextAdvisorDigestAt(new Date("2026-10-31T23:30:00.000Z"), "America/New_York", 18)?.toISOString(),
    "2026-11-01T23:00:00.000Z",
  );
  assert.equal(
    nextAdvisorDigestAt(new Date("2026-09-27T20:00:00.000Z"), "America/Los_Angeles", 18)?.toISOString(),
    "2026-09-28T01:00:00.000Z",
  );
  assert.equal(advisorLocalDateKey(new Date("2026-09-28T01:00:00.000Z"), "America/Los_Angeles"), "2026-09-27");
});

test("member timezone initialization and travel preserve intentional board choices", () => {
  assert.equal(initialAdvisorTimeZone(["America/Los_Angeles"]), "America/Los_Angeles");
  assert.equal(initialAdvisorTimeZone([null, "invalid"]), "UTC");
  assert.equal(advisorTimeZoneAfterDeviceRegistration({
    storedTimeZone: "UTC",
    timeZoneSource: "fallback",
    deviceTimeZone: "America/Los_Angeles",
  }), "America/Los_Angeles");
  assert.equal(advisorTimeZoneAfterDeviceRegistration({
    storedTimeZone: "America/New_York",
    timeZoneSource: "manual",
    deviceTimeZone: "America/Los_Angeles",
  }), "America/New_York");
});

test("notification preference lookup is board scoped and self only", () => {
  assert.deepEqual(advisorNotificationPreferenceKey("board-a", "member-a"), {
    boardId_userId: { boardId: "board-a", userId: "member-a" },
  });
  assert.notDeepEqual(
    advisorNotificationPreferenceKey("board-a", "member-a"),
    advisorNotificationPreferenceKey("board-a", "member-b"),
  );
  assert.notDeepEqual(
    advisorNotificationPreferenceKey("board-a", "member-a"),
    advisorNotificationPreferenceKey("board-b", "member-a"),
  );
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

test("APNs outcomes never claim delivery without an accepted device", () => {
  const noDevice = classifyBoardPushAttempt({ configured: true, statuses: [] });
  assert.equal(classifyAdvisorPushDelivery(noDevice), "no_device");
  assert.equal(noDevice.delivered, 0);

  assert.equal(classifyAdvisorPushDelivery(
    classifyBoardPushAttempt({ configured: true, statuses: [200] }),
  ), "accepted");
  assert.equal(classifyAdvisorPushDelivery(
    classifyBoardPushAttempt({ configured: true, statuses: [410] }),
  ), "rejected");
  assert.equal(classifyAdvisorPushDelivery(
    classifyBoardPushAttempt({ configured: true, statuses: [200, 500, 0] }),
  ), "partial");
  assert.equal(classifyAdvisorPushDelivery(
    classifyBoardPushAttempt({ configured: true, statuses: [0] }),
  ), "uncertain");
});

test("a delivery can be retried only after its lease expires", () => {
  const now = new Date("2026-09-27T22:00:00.000Z");
  assert.equal(advisorDeliveryLeaseIsAvailable({ leaseUntil: null }, now), true);
  assert.equal(advisorDeliveryLeaseIsAvailable({ leaseUntil: new Date(now.getTime() + 1) }, now), false);
  assert.equal(advisorDeliveryLeaseIsAvailable({ leaseUntil: new Date(now.getTime() - 1) }, now), true);
});

test("due board members are selected even behind more than 1,000 old non-due events", () => {
  const now = new Date("2026-09-27T22:00:00.000Z");
  const pendingKeys = new Set(
    Array.from({ length: 1_001 }, (_, index) => index < 1_000 ? "board-quiet:user-quiet" : "board-due:user-due"),
  );
  const selected = selectFairDigestCandidates({
    preferences: [
      {
        id: "quiet",
        boardId: "board-quiet",
        userId: "user-quiet",
        nonCriticalPushEnabled: true,
        nextDigestAt: new Date(now.getTime() + 60_000),
        digestLeaseUntil: null,
      },
      {
        id: "due",
        boardId: "board-due",
        userId: "user-due",
        nonCriticalPushEnabled: true,
        nextDigestAt: new Date(now.getTime() - 60_000),
        digestLeaseUntil: null,
      },
    ],
    pendingBoardMemberKeys: pendingKeys,
    now,
    limit: 1,
  });
  assert.deepEqual(selected.map((preference) => preference.id), ["due"]);
});

test("preference changes, board scope, and concurrent leases alter only the intended queue", () => {
  const now = new Date("2026-09-27T22:00:00.000Z");
  const changedDue = nextAdvisorDigestAt(now, "America/Los_Angeles", 20);
  assert.ok(changedDue);
  assert.equal(planAdvisorDelivery({
    urgent: false,
    isCurrentMember: true,
    nonCriticalPushEnabled: true,
    now,
    timeZone: "America/Los_Angeles",
    digestHourLocal: 20,
    nextDigestAt: changedDue,
  }), "wait");

  const selected = selectFairDigestCandidates({
    preferences: [
      {
        id: "board-a-due",
        boardId: "board-a",
        userId: "same-user",
        nonCriticalPushEnabled: true,
        nextDigestAt: new Date(now.getTime() - 1),
        digestLeaseUntil: null,
      },
      {
        id: "board-b-quiet",
        boardId: "board-b",
        userId: "same-user",
        nonCriticalPushEnabled: true,
        nextDigestAt: new Date(now.getTime() + 1),
        digestLeaseUntil: null,
      },
      {
        id: "board-c-leased",
        boardId: "board-c",
        userId: "same-user",
        nonCriticalPushEnabled: true,
        nextDigestAt: new Date(now.getTime() - 1),
        digestLeaseUntil: new Date(now.getTime() + 60_000),
      },
    ],
    pendingBoardMemberKeys: new Set([
      "board-a:same-user",
      "board-b:same-user",
      "board-c:same-user",
    ]),
    now,
    limit: 10,
  });
  assert.deepEqual(selected.map((preference) => preference.id), ["board-a-due"]);
});

test("the persistent queue is atomic, board scoped, and leased for overlap-safe delivery", () => {
  const root = process.cwd();
  const schema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
  const migration = readFileSync(resolve(root, "prisma/migrations/20260927121500_advisor_notification_diet/migration.sql"), "utf8");
  const proactive = readFileSync(resolve(root, "lib/advisor-proactive.ts"), "utf8");
  const delivery = readFileSync(resolve(root, "lib/advisor-notifications.ts"), "utf8");
  const nativeApp = readFileSync(resolve(root, "ios/HomeboardNative/HomeboardNative/Sources/HomeboardNativeApp.swift"), "utf8");
  const settingsUI = readFileSync(resolve(root, "ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift"), "utf8");
  const settingsRoute = readFileSync(resolve(root, "app/api/mobile/boards/[id]/notification-settings/route.ts"), "utf8");

  assert.match(schema, /fingerprint\s+String\s+@unique/);
  assert.match(schema, /@@unique\(\[eventId, userId\]\)/);
  assert.match(delivery, /leaseToken: token/);
  assert.match(delivery, /recipientUserIds: \[input\.userId\]/);
  assert.match(proactive, /advisorNotificationEvent\.create/);
  assert.match(proactive, /chatMessage\.create/);
  assert.match(migration, /ENABLE ROW LEVEL SECURITY/g);
  assert.match(migration, /REVOKE ALL ON TABLE "AdvisorNotificationEvent" FROM PUBLIC, anon, authenticated/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AdvisorNotificationEvent" TO service_role/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "BoardNotificationPreference" TO service_role/);
  assert.match(migration, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "AdvisorNotificationDelivery" TO service_role/);
  assert.doesNotMatch(migration, /GRANT[^;]+(?:anon|authenticated)/);
  assert.match(settingsRoute, /ensureBoard\(id, user\.id\)/);
  assert.match(settingsRoute, /advisorNotificationPreferenceKey\(access\.boardId, access\.user\.id\)/);
  assert.doesNotMatch(settingsRoute, /members:\s*true|include:\s*\{[^}]*user:/);
  assert.match(nativeApp, /"advisor_digest"/);
  assert.match(settingsUI, /homeboard\.notifications\.digest-toggle/);
  assert.match(settingsUI, /HomeboardPalette\.danger/);
});
