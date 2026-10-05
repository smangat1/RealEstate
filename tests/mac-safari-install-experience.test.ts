import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const setupPage = read("app/mac/page.tsx");
const setupLayout = read("app/mac/layout.tsx");
const nextConfig = read("next.config.ts");
const shareButton = read("components/share-to-mac-button.tsx");
const installExperience = read("app/install-experience.tsx");
const marketingHeader = read("app/marketing-header.tsx");
const phonePairing = read(
  "ios/HomeboardNative/HomeboardNative/Sources/MacDevicePairingView.swift",
);
const macApp = read("ios/HomeboardNative/HomeboardMac/HomeboardMacApp.swift");
const environmentExample = read(".env.example");

test("the website gives the Mac companion a dedicated shareable setup page", () => {
  assert.match(setupPage, /Homeboard for Mac: Save rentals from your laptop/);
  assert.match(setupPage, /const handleShareClick = async \(\) =>/);
  assert.match(setupPage, /navigator\.share/);
  assert.match(setupPage, /navigator\.clipboard\.writeText\(window\.location\.href\)/);
  assert.match(setupPage, /Share \/ Install/);
  assert.match(setupPage, /Download Homeboard/);
  assert.match(setupLayout, /title: "Homeboard for Mac/);
  assert.match(nextConfig, /source: "\/safari"[\s\S]*destination: "\/mac"[\s\S]*permanent: true/);
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
