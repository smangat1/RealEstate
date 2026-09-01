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
const welcome = native("HomeboardNative/Sources/WelcomeView.swift");
const iphoneInfo = native("HomeboardNative/Info.plist");
const macInfo = native("HomeboardMac/Info.plist");

test("signed-out launches and sign-outs open the welcome flow without a preview board", () => {
  const initializer = appModel.slice(
    appModel.indexOf("init()"),
    appModel.indexOf("func bootstrap"),
  );
  const clearedSession = appModel.slice(
    appModel.indexOf("private func clearSessionState"),
    appModel.indexOf("func markLegacyProjectIgnored"),
  );

  assert.match(initializer, /if authSession == nil \{[\s\S]*currentScreen = \.welcome/);
  assert.doesNotMatch(initializer, /openPreviewBoard\(\)/);
  assert.match(clearedSession, /currentScreen = \.welcome/);
  assert.doesNotMatch(clearedSession, /openPreviewBoard\(\)/);
});

test("the welcome story keeps swipe entry and explains both account paths", () => {
  const hero = welcome.slice(
    welcome.indexOf("private var heroContent"),
    welcome.indexOf("private var welcomeAdvanceGesture"),
  );
  const access = welcome.slice(
    welcome.indexOf("private var accessContent"),
    welcome.indexOf("private var fullAccountButtons"),
  );

  assert.match(hero, /Swipe up to continue/);
  assert.doesNotMatch(hero, /homeboard\.welcome\.continue/);
  assert.match(access, /Existing users: click the key\. New accounts: sign in with Apple\./);
  assert.ok(access.indexOf("accessKeyButton") < access.indexOf("fullAccountButtons"));
});

test("iPhone and Mac bundles identify Homeboard as a Business app", () => {
  for (const plist of [iphoneInfo, macInfo]) {
    assert.match(
      plist,
      /<key>LSApplicationCategoryType<\/key>\s*<string>public\.app-category\.business<\/string>/,
    );
  }
});
