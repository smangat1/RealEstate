import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), "utf8");

const config = read("ios/HomeboardNative/HomeboardNative/Sources/HomeboardConfig.swift");
const model = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
const shell = read("ios/HomeboardNative/HomeboardNative/Sources/BoardShellView.swift");
const shared = read("ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift");
const rootView = read("ios/HomeboardNative/HomeboardNative/Sources/RootView.swift");
const app = read("ios/HomeboardNative/HomeboardNative/Sources/HomeboardNativeApp.swift");
const fixtureBase = read("ios/HomeboardNative/HomeboardNativeUITests/FixtureUITestCase.swift");
const advisorUITests = read("ios/HomeboardNative/HomeboardNativeUITests/HomeboardNativeAdvisorChatUITests.swift");
const coreUITests = read("ios/HomeboardNative/HomeboardNativeUITests/HomeboardNativeCoreFlowUITests.swift");
const webBoard = read("components/board-experience.tsx");

test("Advisor has one release-off native flag with only a DEBUG override", () => {
  const flag = config.match(/static var advisorEnabled: Bool \{([\s\S]*?)\n  \}/)?.[1] ?? "";
  assert.match(flag, /#if DEBUG[\s\S]*HOMEBOARD_ADVISOR_ENABLED[\s\S]*#endif/);
  assert.match(flag, /return false/);
  assert.doesNotMatch(flag, /ADVISOR_TEST_MODE|wallet|subscription/i);
  assert.match(read("ios/HomeboardNative/README.md"), /HomeboardConfig\.advisorEnabled[\s\S]*production default to `true`/);
});

test("flag-off blocks Advisor sends, fetches, extraction, and optimistic insertion", () => {
  const send = model.slice(model.indexOf("func sendBoardMessage()"), model.indexOf("func beginChatReply"));
  assert.ok(send.indexOf("guard !isAdvisor || isAdvisorFeatureEnabled") < send.indexOf('boardMessageDraft = ""'));
  assert.ok(send.indexOf("guard !isAdvisor || isAdvisorFeatureEnabled") < send.indexOf("board.chatMessages.append"));
  assert.match(send, /isAdvisorFeatureEnabled, !isAdvisor/);
  assert.match(model, /func refreshAdvisorWalletStatus\(\) async \{\s*guard isAdvisorFeatureEnabled else/);
  assert.match(model, /func refreshAdvisorPreferenceProposal\(\) async \{\s*guard isAdvisorFeatureEnabled else/);
  assert.match(model, /if isAdvisorFeatureEnabled,[\s\S]*Task \{ await refreshAdvisorWalletStatus\(\) \}/);
  assert.match(model, /visibleBoardMessages/);
});

test("all reachable native presentation surfaces use the Advisor flag", () => {
  assert.match(shell, /if appModel\.isAdvisorFeatureEnabled[\s\S]*AdvisorWalletPanel/);
  assert.match(shell, /appModel\.isAdvisorFeatureEnabled \? appModel\.pendingPreferenceProposal : nil/);
  assert.match(shared, /if appModel\.isAdvisorFeatureEnabled \{\s*AdvisorWalletPanel/);
  assert.match(shared, /Message your roommates\.\.\./);
  assert.match(shared, /advisorEnabled: appModel\.isAdvisorFeatureEnabled/);
  assert.match(shared, /if appModel\.isAdvisorFeatureEnabled \{[\s\S]*Advisor notifications/);
  assert.match(rootView, /HomeboardConfig\.advisorEnabled[\s\S]*one daily Advisor digest/);
  assert.match(app, /NativeNotificationPresentationPolicy\.shouldPresent[\s\S]*HomeboardConfig\.advisorEnabled/);
  assert.match(app, /NativeNotificationPresentationPolicy\.shouldRouteToBoard[\s\S]*HomeboardConfig\.advisorEnabled/);
});

test("DEBUG fixtures prove flag-off hiding and flag-on restoration without losing roommate replies", () => {
  assert.match(fixtureBase, /HOMEBOARD_ADVISOR_ENABLED"\] = "1"/);
  assert.match(advisorUITests, /testReplyToRoommateRendersQuoteAndNavigatesToOriginal[\s\S]*HOMEBOARD_ADVISOR_ENABLED": "0"/);
  assert.match(coreUITests, /testAdvisorBetaFlagOffHidesActiveWalletAndKeepsRoommateChat/);
  assert.match(coreUITests, /testAdvisorBetaFlagOffHidesInactiveWallet/);
  assert.match(coreUITests, /testWalletProgressAndFundTriggerWithoutOpeningPayment/);
});

test("web remains roommates-only without a second Advisor flag", () => {
  assert.match(webBoard, /localMessages\.filter\(\(message\) => message\.role === "user"\)/);
  assert.doesNotMatch(webBoard, /HOMEBOARD_ADVISOR_ENABLED|advisorEnabled/);
});
