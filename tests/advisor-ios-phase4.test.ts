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
const engineSource = source("lib/advisor-engine.ts");
const advisorTestAccess = source("lib/advisor-test-access.ts");
const fundingRoute = source("app/api/mobile/boards/[id]/wallet/fund/route.ts");
const walletRoute = source("app/api/mobile/boards/[id]/wallet/route.ts");
const messagesRoute = source("app/api/mobile/boards/[id]/messages/route.ts");

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

test("Advisor regeneration resends the stored original command, never assistant-rendered text", () => {
  const schedule = card.match(/private func scheduleRegeneration[\s\S]*?\n  }\n\n  private func sendViaEmail/)?.[0] ?? "";
  assert.match(models, /var originalCommand: String\? = nil/);
  assert.match(models, /originalCommand = try\? container\.decodeIfPresent\(String\.self/);
  assert.match(schedule, /payload\?\.originalCommand/);
  assert.match(schedule, /\^@advisor\\b/);
  assert.doesNotMatch(schedule, /originalCommand\s*=\s*message\.content/);
  assert.match(schedule, /next\.originalCommand = originalCommand/);
  assert.match(engineSource, /originalCommand: parsed\.originalCommand/);
});

test("Advisor regeneration always sends the current explicit Include filter", () => {
  const request = appModel.match(/func regenerateAdvisorDraft[\s\S]*?\n  }\n\n  @discardableResult/)?.[0] ?? "";
  assert.match(request, /let explicitInclusions = enabledLabels\.isEmpty \? "nothing" : enabledLabels/);
  assert.match(request, /return "\\\(baseCommand\)\\nInclude: \\\(explicitInclusions\)"/);
  assert.doesNotMatch(request, /enabledLabels\.isEmpty\s*\?\s*originalCommand/);
  assert.match(engineSource, /inclusionLabels\.length === 0 \? defaultOn : inclusionLabels\.includes/);
  assert.match(engineSource, /inclusionLabels\.includes\(label\.toLowerCase\(\)\)/);
});

test("PaymentSheet uses a server client secret and refreshes wallet only after completion", () => {
  assert.match(card, /createAdvisorFunding\(amountCents:/);
  assert.match(card, /PaymentSheet\(paymentIntentClientSecret: clientSecret/);
  assert.match(card, /case \.completed:[\s\S]*?refreshAdvisorWalletStatus\(\)/);

  const canceled = card.match(/case \.canceled:[\s\S]*?case \.failed/)?.[0] ?? "";
  assert.doesNotMatch(canceled, /refreshAdvisorWalletStatus/);
  const failed = card.match(/case \.failed\(let error\):[\s\S]*?\n        }/)?.[0] ?? "";
  assert.doesNotMatch(failed, /refreshAdvisorWalletStatus/);

  assert.match(config, /stripePublishableKey/);
  assert.doesNotMatch(`${card}\n${config}\n${api}`, /sk_(?:test|live)_/);
});

test("operator-only Advisor test mode simulates funding without Stripe", () => {
  assert.match(advisorTestAccess, /ADVISOR_TEST_MODE/);
  assert.match(advisorTestAccess, /isOperatorUser\(user\)/);
  assert.match(fundingRoute, /if \(testMode\)/);
  assert.match(fundingRoute, /simulated: true/);
  assert.match(walletRoute, /testMode \|\| Boolean\(validUntil && validUntil >= now\)/);
  assert.match(messagesRoute, /hasAdvisorTestAccess\(user\)/);
  assert.match(card, /if funding\.simulated == true/);
  assert.match(card, /Test contribution added\. No card was charged\./);
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
  assert.match(card, /struct AdvisorOnboardingView/);
  assert.match(card, /\$4 rolling threshold/);
  assert.match(card, /Seven days of access/);
  assert.match(card, /Nothing sends automatically/);
  assert.match(card, /Status follows the real send/);
  assert.match(card, /showsAdvisorOnboarding = true/);
});

test("unlocking Advisor launches persisted setup with a financial placeholder choice", () => {
  assert.match(card, /struct AdvisorSetupOnboardingView/);
  assert.match(card, /advisorWalletStatus\?\.isUnlocked == true/);
  assert.match(card, /profile\.advisorSetupCompletedAt == nil/);
  assert.match(card, /Leave placeholders/);
  assert.match(card, /\[INCOME MULTIPLE\]/);
  assert.match(card, /\[CREDIT SCORE\]/);
  assert.match(card, /does not use your income or credit information to approve, rank, or evaluate you/);
  assert.match(appModel, /func completeAdvisorSetup/);
  assert.match(appModel, /await saveBoardBrief\(\)/);
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

test("locked Advisor commands are stopped in-app before reaching the API", () => {
  const sharedView = source("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");
  assert.match(sharedView, /private var isAdvisorCommandBlocked/);
  assert.match(sharedView, /Advisor needs an active board week/);
  assert.match(sharedView, /\|\| isAdvisorCommandBlocked/);
  assert.match(sharedView, /private var isPartialAdvisorMention/);
  assert.match(sharedView, /"@advisor"\.hasPrefix\(text\)/);
  assert.match(sharedView, /Text\("Complete @advisor"\)/);
  assert.match(sharedView, /isCompleteAdvisorCommand\(updateDraft\) && !appModel\.isAdvisorAccessActive/);
  assert.match(sharedView, /else if isPartialAdvisorMention[\s\S]*?advisorMentionCompletionBar/);
  assert.match(appModel, /guard !isAdvisor \|\| isAdvisorAccessActive else/);
});

test("roommates can split one board week without overfunding it", () => {
  assert.match(card, /Stepper\(value: \$amountCents, in: 50\.\.\.maximumContributionCents, step: 50\)/);
  assert.match(card, /shared total unlocks one full week at \$4/);
  assert.match(fundingRoute, /ADVISOR_WEEK_CENTS/);
  assert.match(fundingRoute, /\.multipleOf\(MIN_CONTRIBUTION_CENTS/);
  assert.match(fundingRoute, /parsed\.data\.amountCents > remainingCents/);
  assert.match(fundingRoute, /validUntil >= now/);
});

test("Advisor onboarding content clears the page progress controls", () => {
  assert.match(card, /\.padding\(\.bottom, 36\)/);
});
