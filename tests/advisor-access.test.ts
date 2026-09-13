import assert from "node:assert/strict";
import test from "node:test";
import { demoAdvisorSubscription, isDemoAdvisorAccount } from "../lib/advisor-access";

test("explicit demo label grants access independently of email; new accounts do not inherit it", () => {
  assert.equal(isDemoAdvisorAccount({ isDemoAccount: true, email: "tester@example.com" }), true);
  assert.equal(isDemoAdvisorAccount({ isDemoAccount: false, email: "real@example.com" }), false);
  assert.equal(isDemoAdvisorAccount({ email: "  TOUR@HOMEBOARD.LOCAL  " }), true);
  assert.equal(isDemoAdvisorAccount(null), false);
});
test("demo access stays stable and never pretends a payment occurred", () => {
  const subscription = demoAdvisorSubscription("board-1");
  assert.deepEqual(subscription, demoAdvisorSubscription("board-1"));
  assert.equal(subscription.status, "active");
  assert.equal(subscription.amountCents, 0);
  assert.equal(subscription.fundedCents, 0);
  assert.equal(subscription.expiresAt, null);
  assert.deepEqual(subscription.contributions, []);
});
