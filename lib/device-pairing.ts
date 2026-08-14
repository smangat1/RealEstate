import "server-only";

import { createHash, randomInt, timingSafeEqual } from "node:crypto";

export const DEVICE_PAIRING_LIFETIME_MS = 3 * 60 * 1000;
export const DEVICE_PAIRING_MAX_APPROVAL_ATTEMPTS = 5;

export function hashDevicePairingValue(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function matchesDevicePairingHash(value: string, expectedHash: string) {
  const actual = Buffer.from(hashDevicePairingValue(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function createDeviceApprovalCode() {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function devicePairingDeepLink(id: string, approvalCode: string, deviceName: string) {
  const query = new URLSearchParams({ id, code: approvalCode, device: deviceName });
  return `homeboard://connect-mac?${query.toString()}`;
}

export function requestFingerprint(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const value = forwarded || request.headers.get("x-real-ip")?.trim() || "unknown";
  return hashDevicePairingValue(value);
}

export function noStoreJsonHeaders() {
  return {
    "Cache-Control": "no-store, max-age=0",
    Pragma: "no-cache",
  };
}
