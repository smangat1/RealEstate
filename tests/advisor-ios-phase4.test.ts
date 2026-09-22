import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

function source(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const api = source("ios/HomeboardNative/HomeboardNative/Sources/HomeboardAPI.swift");
const appModel = source("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
const card = source("ios/HomeboardNative/HomeboardNative/Sources/AdvisorCardView.swift");
const models = source("ios/HomeboardNative/HomeboardNative/Sources/HomeboardModels.swift");
const dispatcher = source("ios/HomeboardNative/HomeboardNative/Sources/MessageDispatcher.swift");
const config = source("ios/HomeboardNative/HomeboardNative/Sources/HomeboardConfig.swift");
const stripeWebhook = source("app/api/webhook/stripe/route.ts");
const fundingRoute = source("app/api/mobile/boards/[id]/wallet/fund/route.ts");

test("iOS decodes Advisor data from the standard board response envelope", () => {
  const response = api.match(/struct MobileBoardLoadResponse[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(response, /var board: MobileBoard/);
  assert.match(response, /var profile: RemoteRentalProfilePayload/);
  assert.match(response, /var missingFields: \[String\]/);
  assert.match(response, /var advisorPayload: AdvisorMessagePayload\?/);
  assert.doesNotMatch(api, /MobileAdvisorMessageResponse/);
});

test("Advisor regeneration applies only the latest debounced response", () => {
  const request = appModel.match(/func regenerateAdvisorDraft[\s\S]*?\n  }\n\n  @discardableResult/)?.[0] ?? "";
  assert.doesNotMatch(request, /board\s*=\s*response\.board/);
  assert.match(card, /regenerationRevision \+= 1/);
  assert.match(card, /guard revision == regenerationRevision, !Task\.isCancelled else \{ return \}/);
  assert.match(appModel, /guard board\.id == expectedBoardId, response\.board\.id == expectedBoardId/);
  assert.doesNotMatch(card, /selectedTone\s*=\s*next\.tone/);
  assert.doesNotMatch(card, /toggles\s*=\s*next\.toggleOptions/);
});

test("PaymentSheet uses a server client secret and refreshes wallet only after completion", () => {
  assert.match(card, /advisorFundingClientSecret\(amountCents:/);
  assert.match(card, /PaymentSheet\(paymentIntentClientSecret: clientSecret/);
  assert.match(card, /case \.completed:[\s\S]*?refreshAdvisorWalletStatus\(\)/);

  const canceled = card.match(/case \.canceled:[\s\S]*?case \.failed/)?.[0] ?? "";
  assert.doesNotMatch(canceled, /refreshAdvisorWalletStatus/);
  const failed = card.match(/case \.failed\(let error\):[\s\S]*?\n        }/)?.[0] ?? "";
  assert.doesNotMatch(failed, /refreshAdvisorWalletStatus/);

  assert.match(config, /stripePublishableKey/);
  assert.doesNotMatch(`${card}\n${config}\n${api}`, /sk_(?:test|live)_/);
});

test("Outreach status changes only after a compose delegate confirms sent", () => {
  assert.match(dispatcher, /case \.sent:\s*dispatchResult = \.sent/);
  assert.match(dispatcher, /case \.cancelled, \.saved:\s*dispatchResult = \.cancelled/);

  const handler = card.match(/private func handleDispatchResult[\s\S]*?\n  }\n\n  private func isDraftReady/)?.[0] ?? "";
  assert.match(handler, /case \.sent:[\s\S]*?markAdvisorOutreachSent/);
  assert.doesNotMatch(handler.match(/case \.cancelled:[\s\S]*?case \.failed/)?.[0] ?? "", /markAdvisorOutreachSent/);
  assert.doesNotMatch(handler.match(/case \.failed[\s\S]*?\n    }/)?.[0] ?? "", /markAdvisorOutreachSent/);
});

test("legacy or malformed Advisor payloads fall back without fabricating controls", () => {
  assert.match(models, /init\(from decoder: Decoder\) throws \{\s*self\.init\(\)/);
  assert.match(models, /toggleOptions = \(try\? container\.decodeIfPresent/);
  assert.doesNotMatch(card, /message\.advisorPayload \?\? AdvisorMessagePayload/);
  assert.match(card, /if let payload, !payload\.draftText\.trimmingCharacters/);
  assert.match(card, /legacyMessage/);
});

test("Advisor has a separate replayable onboarding with the funding and send contract", () => {
  assert.match(card, /homeboard\.advisor\.onboarding\.v2\.completed/);
  assert.match(card, /struct AdvisorOnboardingView/);
  assert.match(card, /\$4 rolling threshold/);
  assert.match(card, /Seven days of access/);
  assert.match(card, /Nothing sends automatically/);
  assert.match(card, /Status follows the real send/);
  assert.match(card, /showsAdvisorOnboarding = true/);
});

test("required Advisor facts cannot be toggled off or sent while input is missing", () => {
  assert.match(card, /guard !isRequired else \{ return \}/);
  assert.match(card, /\.disabled\(isRequired\)/);
  assert.match(card, /payload\.executionStatus != "needs_input"/);
});

test("canceled launch refreshes stay out of the group chat", () => {
  assert.match(api, /case \.cancelled:\s*throw CancellationError\(\)/);
  assert.match(appModel, /func refreshAdvisorWalletStatus[\s\S]*?catch is CancellationError/);
});

test("successful funding renews an existing subscription expiry", () => {
  assert.match(stripeWebhook, /update:\s*\{\s*isActive: true,\s*validUntil,/);
});

test("locked Advisor commands are stopped in-app before reaching the API", () => {
  const sharedView = source("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");
  assert.match(sharedView, /private var isAdvisorCommandBlocked/);
  assert.match(sharedView, /Advisor needs an active board week/);
  assert.match(sharedView, /\|\| isAdvisorCommandBlocked/);
  assert.match(sharedView, /hasPrefix\("@advisor"\), !appModel\.isAdvisorAccessActive/);
  assert.match(appModel, /guard !isAdvisor \|\| isAdvisorAccessActive else/);
});

test("roommates can split one board week without overfunding it", () => {
  assert.match(card, /Stepper\(value: \$amountCents, in: 50\.\.\.maximumContributionCents, step: 50\)/);
  assert.match(card, /shared total unlocks one full week at \$4/);
  assert.match(fundingRoute, /const ADVISOR_WEEK_CENTS = 400/);
  assert.match(fundingRoute, /\.multipleOf\(MIN_CONTRIBUTION_CENTS/);
  assert.match(fundingRoute, /parsed\.data\.amountCents > remainingCents/);
  assert.match(fundingRoute, /validUntil >= now/);
});

test("Advisor onboarding content clears the page progress controls", () => {
  assert.match(card, /\.padding\(\.bottom, 36\)/);
});
