import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const appModel = readFileSync(
  resolve(root, "ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift"),
  "utf8",
);
const onboardingView = readFileSync(
  resolve(root, "ios/HomeboardNative/HomeboardNative/Sources/AccountOnboardingView.swift"),
  "utf8",
);
const nativeApi = readFileSync(
  resolve(root, "ios/HomeboardNative/HomeboardNative/Sources/HomeboardAPI.swift"),
  "utf8",
);
const mobileOnboardingRoute = readFileSync(
  resolve(root, "app/api/mobile/onboarding/route.ts"),
  "utf8",
);
const boardData = readFileSync(resolve(root, "lib/board-data.ts"), "utf8");
const prismaSchema = readFileSync(resolve(root, "prisma/schema.prisma"), "utf8");
const migration = readFileSync(
  resolve(root, "prisma/migrations/20260831025500_idempotent_board_creation/migration.sql"),
  "utf8",
);

test("onboarding interactions avoid synchronous full-state persistence", () => {
  const syncFlow = appModel.slice(
    appModel.indexOf("func syncBoardFromProfile"),
    appModel.indexOf("func createLocalBoard"),
  );

  assert.match(syncFlow, /scheduleOnboardingPersistence\(\)/);
  assert.match(syncFlow, /Task\.sleep\(nanoseconds: 350_000_000\)/);
  assert.doesNotMatch(
    syncFlow.slice(0, syncFlow.indexOf("func flushOnboardingDraft")),
    /persist\(\)/,
  );

  const answerButton = onboardingView.slice(
    onboardingView.indexOf("private func answerButton"),
    onboardingView.indexOf("private var otherAnswerFields"),
  );
  assert.match(answerButton, /contentShape\(RoundedRectangle/);
  assert.match(answerButton, /buttonStyle\(\.plain\)/);
  assert.doesNotMatch(answerButton, /AuthPressStyle/);
});

test("active onboarding exposes failures and offers a real retry", () => {
  const navigation = onboardingView.slice(
    onboardingView.indexOf("private var navigationBar"),
    onboardingView.indexOf("private var options"),
  );
  const finishFlow = appModel.slice(
    appModel.indexOf("func finishOnboarding"),
    appModel.indexOf("func syncBoardFromProfile"),
  );

  assert.match(navigation, /if let error = appModel\.onboardingError/);
  assert.match(navigation, /Try creating board again/);
  assert.match(navigation, /Creating your board…/);
  assert.match(finishFlow, /catch HomeboardAPIError\.unauthorized/);
  assert.match(finishFlow, /api\.refreshSession/);
  assert.match(finishFlow, /Your answers are saved\. Tap below to try again\./);
});

test("board confirmation retries are idempotent from iPhone through the database", () => {
  assert.match(nativeApi, /var creationRequestId: String/);
  assert.match(nativeApi, /creationRequestId: creationRequestId/);
  assert.match(appModel, /onboardingCreationRequestId \?\? UUID\(\)\.uuidString/);
  assert.match(appModel, /onboardingCreationRequestId: onboardingCreationRequestId/);
  assert.match(mobileOnboardingRoute, /creationRequestId: z\.string\(\)\.uuid\(\)\.optional\(\)/);
  assert.match(mobileOnboardingRoute, /creationRequestId: parsed\.data\.creationRequestId/);
  assert.match(boardData, /where: \{ creationRequestId: input\.creationRequestId \}/);
  assert.match(boardData, /error\.code === "P2002"/);
  assert.match(prismaSchema, /creationRequestId\s+String\?\s+@unique/);
  assert.match(migration, /CREATE UNIQUE INDEX "SearchBoard_creationRequestId_key"/);
});

test("opening Other never invalidates an already valid onboarding answer", () => {
  const continueRules = onboardingView.slice(
    onboardingView.indexOf("private var canContinue"),
    onboardingView.indexOf("private func advance"),
  );
  const commitFlow = onboardingView.slice(
    onboardingView.indexOf("private func commitCustomAnswer"),
    onboardingView.indexOf("private func setSelectedValues"),
  );

  assert.match(continueRules, /!appModel\.profile\.priorities\.isEmpty \|\| customPrimaryIsValid/);
  assert.match(continueRules, /!appModel\.profile\.budgetMax\.isEmpty \|\| customBudgetIsValid/);
  assert.match(commitFlow, /guard !secondary\.isEmpty else \{ return \}/);
  assert.match(commitFlow, /guard !primary\.isEmpty else \{ return \}/);
});
