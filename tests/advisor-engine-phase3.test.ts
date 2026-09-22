import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { resolve } from "node:path";

const engineSource = readFileSync(resolve(process.cwd(), "lib/advisor-engine.ts"), "utf8");
const messagesRouteSource = readFileSync(
  resolve(process.cwd(), "app/api/mobile/boards/[id]/messages/route.ts"),
  "utf8",
);
const walletRouteSource = readFileSync(
  resolve(process.cwd(), "app/api/mobile/boards/[id]/wallet/route.ts"),
  "utf8",
);

test("Advisor compiles group profile, commute, and listing analysis into one grounded context", () => {
  assert.match(engineSource, /from "@\/lib\/group-profile"/);
  assert.match(engineSource, /from "@\/lib\/commute-service"/);
  assert.match(engineSource, /from "@\/lib\/listing-analysis"/);
  assert.match(engineSource, /leverage:/);
  assert.match(engineSource, /requirements:/);
  assert.match(engineSource, /You MUST include the group's exact income multiple/);
  assert.match(engineSource, /You MUST include the group's exact credit score/);
  assert.match(engineSource, /polished, broker-appropriate/);
  assert.match(engineSource, /brief, friendly, like texting a peer/);
  assert.match(engineSource, /direct, no-nonsense corporate, urgency/);
  assert.match(engineSource, /notes the recipient's lack of response while reiterating readiness/);
  assert.match(engineSource, /draftText:/);
  assert.match(engineSource, /toggleOptions:/);
  assert.match(engineSource, /executionStatus:/);
});

test("Advisor messages gate on expiry and persist the exact structured response", () => {
  assert.match(messagesRouteSource, /\^@advisor\\b/i);
  assert.match(messagesRouteSource, /subscription\.validUntil >= now/);
  assert.doesNotMatch(messagesRouteSource, /subscription\.isActive/);
  assert.match(messagesRouteSource, /advisorPayload:\s*\{/);
  assert.match(messagesRouteSource, /draftText/);
  assert.match(messagesRouteSource, /executionStatus/);
  assert.match(messagesRouteSource, /return NextResponse\.json\(payload\)/);
});

test("Advisor wallet reports a rolling seven-day threshold without trusting isActive", () => {
  assert.match(walletRouteSource, /7 \* 24 \* 60 \* 60 \* 1_000/);
  assert.match(walletRouteSource, /createdAt: \{ gte: windowStart \}/);
  assert.match(walletRouteSource, /ADVISOR_THRESHOLD_CENTS - rolling7DayTotalCents/);
  assert.match(walletRouteSource, /validUntil && validUntil >= now/);
  assert.doesNotMatch(walletRouteSource, /isActive/);
});
