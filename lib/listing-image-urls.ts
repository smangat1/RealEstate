import { createHmac, timingSafeEqual } from "node:crypto";

import { getSiteUrl } from "@/lib/site-url";

export const LISTING_IMAGE_BUCKET = "listing-images";
const SIGNED_IMAGE_LIFETIME_SECONDS = 6 * 60 * 60;
const imageRoutePrefix = "/api/listing-images/";

function signingSecret() {
  const value = process.env.LISTING_IMAGE_SIGNING_SECRET ?? process.env.SUPABASE_SECRET_KEY;
  if (!value) throw new Error("Missing listing image signing secret.");
  return value;
}

function validStoragePath(path: string) {
  const parts = path.split("/");
  return parts.length === 3
    && parts.every((part) => /^[a-zA-Z0-9_-]{1,180}(?:\.jpg)?$/.test(part))
    && /^[a-f0-9-]{36}\.jpg$/i.test(parts[2]);
}

function decodePath(value: string) {
  try {
    const decoded = value
      .split("/")
      .map((part) => decodeURIComponent(part))
      .join("/");
    return validStoragePath(decoded) ? decoded : null;
  } catch {
    return null;
  }
}

export function listingImageStoragePath(value: string) {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }

  const privateRouteIndex = url.pathname.indexOf(imageRoutePrefix);
  if (privateRouteIndex >= 0) {
    return decodePath(url.pathname.slice(privateRouteIndex + imageRoutePrefix.length));
  }

  const legacyPublicPrefix = `/storage/v1/object/public/${LISTING_IMAGE_BUCKET}/`;
  const legacyIndex = url.pathname.indexOf(legacyPublicPrefix);
  if (legacyIndex >= 0) {
    return decodePath(url.pathname.slice(legacyIndex + legacyPublicPrefix.length));
  }
  return null;
}

function signature(path: string, expiresAt: number) {
  return createHmac("sha256", signingSecret())
    .update(`${path}\n${expiresAt}`)
    .digest("base64url");
}

export function signedListingImageUrl(path: string, now = Date.now()) {
  if (!validStoragePath(path)) throw new Error("Invalid listing image path.");
  const expiresAt = Math.floor(now / 1_000) + SIGNED_IMAGE_LIFETIME_SECONDS;
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const url = new URL(`${imageRoutePrefix}${encodedPath}`, getSiteUrl());
  url.searchParams.set("expires", String(expiresAt));
  url.searchParams.set("signature", signature(path, expiresAt));
  return url.toString();
}

export function refreshListingImageUrl(value: string) {
  const path = listingImageStoragePath(value);
  return path ? signedListingImageUrl(path) : value;
}

export function verifyListingImageSignature(path: string, expiresAt: number, supplied: string) {
  if (!validStoragePath(path) || !Number.isSafeInteger(expiresAt)) return false;
  const now = Math.floor(Date.now() / 1_000);
  if (expiresAt <= now || expiresAt > now + SIGNED_IMAGE_LIFETIME_SECONDS + 60) return false;
  const expected = Buffer.from(signature(path, expiresAt));
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
