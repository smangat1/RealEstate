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
