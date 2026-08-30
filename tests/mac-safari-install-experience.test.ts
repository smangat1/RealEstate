import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const setupPage = read("app/safari/page.tsx");
const shareButton = read("components/share-to-mac-button.tsx");
const installExperience = read("app/install-experience.tsx");
const marketingHeader = read("app/marketing-header.tsx");
const phonePairing = read(
  "ios/HomeboardNative/HomeboardNative/Sources/MacDevicePairingView.swift",
);
const macApp = read("ios/HomeboardNative/HomeboardMac/HomeboardMacApp.swift");
const environmentExample = read(".env.example");

test("the website gives the Safari companion a dedicated shareable setup page", () => {
  assert.match(setupPage, /Homeboard for Safari — Save rentals from your Mac/);
  assert.match(setupPage, /Open the companion/);
  assert.match(setupPage, /Scan the QR/);
  assert.match(setupPage, /Enable in Safari/);
  assert.match(setupPage, /Save a rental/);
  assert.match(setupPage, /api\/og\?slide=product/);
  assert.match(setupPage, /NEXT_PUBLIC_MAC_INSTALL_URL/);
  assert.match(environmentExample, /NEXT_PUBLIC_MAC_INSTALL_URL=/);
});

test("mobile visitors can send the setup page to their Mac", () => {
  assert.match(shareButton, /navigator\.share/);
  assert.match(shareButton, /navigator\.clipboard/);
  assert.match(shareButton, /AirDrop|send it to your Mac/i);
  assert.match(installExperience, /ShareToMacButton/);
  assert.match(installExperience, /Set up Safari on Mac/);
  assert.match(marketingHeader, /Safari for Mac/);
  assert.match(phonePairing, /ShareLink/);
  assert.match(phonePairing, /Send Mac setup link/);
  assert.match(phonePairing, /\/safari/);
});

test("the Mac companion reports whether Safari is actually enabled", () => {
  assert.match(macApp, /getStateOfSafariExtension/);
  assert.match(macApp, /safariExtensionIsEnabled/);
  assert.match(macApp, /Open Safari Settings/);
  assert.match(macApp, /Safari extension enabled/);
  assert.match(macApp, /openSetupGuide/);
});
