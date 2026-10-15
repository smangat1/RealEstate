import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

import { isAdvisorPushEnabled } from "../lib/advisor-push";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

test("Advisor push delivery is off unless HOMEBOARD_ADVISOR_ENABLED is exactly true", (t) => {
  const original = process.env.HOMEBOARD_ADVISOR_ENABLED;
  delete process.env.HOMEBOARD_ADVISOR_ENABLED;
  t.after(() => {
    if (original === undefined) delete process.env.HOMEBOARD_ADVISOR_ENABLED;
    else process.env.HOMEBOARD_ADVISOR_ENABLED = original;
  });

  assert.equal(isAdvisorPushEnabled(), false);
  assert.equal(isAdvisorPushEnabled("false"), false);
  assert.equal(isAdvisorPushEnabled("TRUE"), false);
  assert.equal(isAdvisorPushEnabled(" true "), false);
  assert.equal(isAdvisorPushEnabled("true"), true);
});

test("Advisor delivery entry points return before delivery when the switch is off", () => {
  const notifications = read("lib/advisor-notifications.ts");

  assert.match(
    notifications,
    /deliverUrgentAdvisorNotification[^]*?if \(!isAdvisorPushEnabled\(\)\) return 0;[^]*?advisorNotificationEvent\.findUnique/,
  );
  assert.match(
    notifications,
    /flushDueAdvisorDigests[^]*?if \(!isAdvisorPushEnabled\(\)\)[^]*?return \{[^]*?retriedUrgent: 0[^]*?flushPendingUrgentNotifications/,
  );
});

test("the APNs guard covers Advisor types without disabling board_chat", () => {
  const apns = read("lib/apns.ts");
  const guard = apns.match(
    /export async function notifyBoardMembers[^]*?const configuration = credentials\(\);/,
  )?.[0] ?? "";

  assert.match(guard, /input\.type !== "board_chat" && !isAdvisorPushEnabled\(\)/);
  assert.match(guard, /return classifyBoardPushAttempt\(\{ configured: false, statuses: \[\] \}\)/);
});
