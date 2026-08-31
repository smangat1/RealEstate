import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const root = process.cwd();
const native = (path: string) => readFileSync(
  resolve(root, "ios/HomeboardNative", path),
  "utf8",
);

const appModel = native("HomeboardNative/Sources/AppModel.swift");
const boardShell = native("HomeboardNative/Sources/BoardShellView.swift");
const workspace = native("HomeboardNative/Sources/SharedWorkspaceView.swift");
const iphoneInfo = native("HomeboardNative/Info.plist");
const macInfo = native("HomeboardMac/Info.plist");

test("release builds expose a guarded sample board before authentication", () => {
  const previewBuilder = appModel.slice(
    appModel.indexOf("private func openPreviewBoard"),
    appModel.indexOf("private func parseAmount"),
  );

  assert.match(appModel, /var isGuestPreview: Bool/);
  assert.match(appModel, /if authSession == nil \{\s*openPreviewBoard\(\)/);
  assert.match(previewBuilder, /id: "preview-workspace"/);
  assert.match(previewBuilder, /shortlist: \[astoria, hamilton, brooklyn\]/);
  assert.doesNotMatch(previewBuilder, /#if DEBUG/);
});

test("guest preview is one real app screen that gates every interaction", () => {
  const guestPreview = boardShell.slice(
    boardShell.indexOf("private struct GuestPreviewBoardView"),
  );

  assert.match(boardShell, /if appModel\.isGuestPreview \{[\s\S]*GuestPreviewBoardView\(\)/);
  assert.match(guestPreview, /SharedSearchMapView\(\)/);
  assert.match(guestPreview, /DragGesture\(minimumDistance: 0/);
  assert.match(guestPreview, /Make this search yours/);
  assert.match(guestPreview, /appModel\.openWelcomeAccessFromGuestPreview\(\)/);
  assert.match(guestPreview, /homeboard\.preview\.interaction/);
  assert.doesNotMatch(guestPreview, /scrollTargetBehavior\(\.paging\)/);
  assert.doesNotMatch(guestPreview, /SharedShortlistView\(\)|SharedUpdatesView\(\)/);
  assert.doesNotMatch(guestPreview, /DEMO MODE|Hi—this is Homeboard’s demo|GuestPreviewPrompt/);
  assert.doesNotMatch(guestPreview, /GuestPreviewAccountBar/);
  assert.match(workspace, /if !appModel\.isGuestPreview \{/);
});

test("iPhone and Mac bundles identify Homeboard as a Business app", () => {
  for (const plist of [iphoneInfo, macInfo]) {
    assert.match(
      plist,
      /<key>LSApplicationCategoryType<\/key>\s*<string>public\.app-category\.business<\/string>/,
    );
  }
});
