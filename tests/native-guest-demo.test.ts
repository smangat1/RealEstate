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
const welcome = native("HomeboardNative/Sources/WelcomeView.swift");
const workspace = native("HomeboardNative/Sources/SharedWorkspaceView.swift");
const iphoneInfo = native("HomeboardNative/Info.plist");
const macInfo = native("HomeboardMac/Info.plist");

test("release builds expose a guarded sample board before authentication", () => {
  const previewBuilder = appModel.slice(
    appModel.indexOf("private func openPreviewBoard"),
    appModel.indexOf("private func parseAmount"),
  );

  assert.match(appModel, /func openGuestPreview\(\)/);
  assert.match(appModel, /var isGuestPreview: Bool/);
  assert.match(previewBuilder, /id: "preview-workspace"/);
  assert.match(previewBuilder, /shortlist: \[astoria, hamilton, brooklyn\]/);
  assert.doesNotMatch(previewBuilder, /#if DEBUG/);
  assert.match(welcome, /Text\("Explore the demo"\)/);
  assert.match(welcome, /appModel\.openGuestPreview\(\)/);
});

test("guest preview replaces tabs and gates every board touch", () => {
  assert.match(boardShell, /if appModel\.isGuestPreview \{[\s\S]*GuestPreviewBoardView\(\)/);
  assert.match(boardShell, /GuestPreviewAccountBar/);
  assert.match(boardShell, /guestButton\("Sign in", mode: \.signIn/);
  assert.match(boardShell, /guestButton\("Create account", mode: \.createAccount/);
  assert.match(boardShell, /homeboard\.demo\.interactionGate/);
  assert.match(boardShell, /appModel\.requestGuestAuthentication\(\)/);
  assert.match(boardShell, /Hi—this is Homeboard’s demo\./);
  assert.match(boardShell, /Ready to make it yours\?/);
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
