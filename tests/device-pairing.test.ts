import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

const schema = read("prisma/schema.prisma");
const migration = read("prisma/migrations/20260813130000_device_pairing/migration.sql");
const pairingLibrary = read("lib/device-pairing.ts");
const createRoute = read("app/api/mobile/device-pairings/route.ts");
const statusRoute = read("app/api/mobile/device-pairings/[id]/route.ts");
const approvalRoute = read("app/api/mobile/device-pairings/[id]/approve/route.ts");
const completionRoute = read("app/api/mobile/device-pairings/[id]/complete/route.ts");
const sharedClient = read(
  "ios/HomeboardNative/HomeboardNative/Shared/HomeboardExtensionSync.swift",
);
const macApp = read("ios/HomeboardNative/HomeboardMac/HomeboardMacApp.swift");
const phonePairingView = read(
  "ios/HomeboardNative/HomeboardNative/Sources/MacDevicePairingView.swift",
);
const appModel = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
const workspace = read(
  "ios/HomeboardNative/HomeboardNative/Sources/SharedWorkspaceView.swift",
);
const infoPlist = read("ios/HomeboardNative/HomeboardNative/Info.plist");
const packageManifest = read("package.json");

test("device pairing persists only hashed short-lived challenge secrets", () => {
  assert.match(schema, /enum DevicePairingStatus/);
  assert.match(schema, /model DevicePairing/);
  assert.match(schema, /clientSecretHash\s+String\s+@unique/);
  assert.match(schema, /approvalCodeHash\s+String/);
  assert.match(schema, /expiresAt\s+DateTime/);
  assert.match(schema, /approvalAttempts\s+Int\s+@default\(0\)/);
  assert.match(migration, /CREATE TABLE "DevicePairing"/);
  assert.match(pairingLibrary, /3 \* 60 \* 1000/);
  assert.match(pairingLibrary, /timingSafeEqual/);
  assert.match(pairingLibrary, /DEVICE_PAIRING_MAX_APPROVAL_ATTEMPTS = 5/);
});

test("deployments regenerate Prisma after schema changes", () => {
  assert.match(packageManifest, /"prebuild": "prisma generate"/);
  assert.match(packageManifest, /"postinstall": "prisma generate"/);
});

test("the QR never contains the Mac polling secret or an existing phone session", () => {
  assert.match(createRoute, /clientSecretHash: z\.string\(\)\.regex/);
  assert.match(createRoute, /approvalCodeHash: hashDevicePairingValue\(approvalCode\)/);
  assert.match(createRoute, /deepLink: devicePairingDeepLink/);
  assert.match(pairingLibrary, /new URLSearchParams\(\{ id, code: approvalCode, device: deviceName \}\)/);
  assert.doesNotMatch(pairingLibrary, /clientSecret/);
  assert.match(sharedClient, /SecRandomCopyBytes/);
  assert.match(sharedClient, /clientSecretHash: sha256Hex\(clientSecret\)/);
  assert.match(sharedClient, /X-Homeboard-Pairing-Secret/);
  assert.match(statusRoute, /matchesDevicePairingHash\(clientSecret, pairing\.clientSecretHash\)/);
});

test("phone approval mints a separate one-time Supabase session for the Mac", () => {
  assert.match(approvalRoute, /requireMobileAppUser\(request\)/);
  assert.match(approvalRoute, /status: "approving"/);
  assert.match(approvalRoute, /auth\.admin\.generateLink/);
  assert.match(approvalRoute, /type: "magiclink"/);
  assert.match(approvalRoute, /data\.properties\.hashed_token/);
  assert.match(sharedClient, /path: "auth\/v1\/verify"/);
  assert.match(sharedClient, /var type = "magiclink"/);
  assert.match(sharedClient, /HomeboardSharedAuthStore\.save\(context\)/);
  assert.match(completionRoute, /requireMobileAppUser\(request\)/);
  assert.match(completionRoute, /pairing\.userId !== user\.id/);
  assert.match(completionRoute, /tokenHash: null/);
});

test("Mac and iPhone expose the complete QR pairing workflow", () => {
  assert.match(macApp, /CIFilter\.qrCodeGenerator\(\)/);
  assert.match(macApp, /startDevicePairing\(\)/);
  assert.match(macApp, /pollDevicePairing/);
  assert.match(macApp, /MATCH CODE/);
  assert.match(macApp, /Open Homeboard → Settings → Connect a Mac/);
  assert.match(phonePairingView, /DataScannerViewController/);
  assert.match(phonePairingView, /\.barcode\(symbologies: \[\.qr\]\)/);
  assert.match(phonePairingView, /MAKE SURE THIS MATCHES THE MAC/);
  assert.match(phonePairingView, /ShareLink/);
  assert.match(phonePairingView, /Send Mac setup link/);
  assert.match(phonePairingView, /appModel\.approveMacPairing/);
  assert.match(appModel, /MacDevicePairingRequest\(url: url\)/);
  assert.match(workspace, /title: "Connect a Mac"/);
  assert.match(infoPlist, /NSCameraUsageDescription/);
});
