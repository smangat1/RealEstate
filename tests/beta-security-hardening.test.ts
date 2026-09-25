import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import test from "node:test";

import {
  listingImageStoragePath,
  signedListingImageUrl,
  verifyListingImageSignature,
} from "@/lib/listing-image-urls";
import { isSafeHttpUrl, safeRelativePath, sanitizePlainText } from "@/lib/input-safety";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

function routeFiles(directory: string): string[] {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? routeFiles(path) : entry.name === "route.ts" ? [path] : [];
  });
}

test("web listing mutations derive identity from the authenticated board member", () => {
  const actions = read("app/actions.ts");
  const voteAction = actions.slice(
    actions.indexOf("export async function saveListingVoteAction"),
    actions.indexOf("export async function addListingCommentAction"),
  );
  const commentAction = actions.slice(actions.indexOf("export async function addListingCommentAction"));

  assert.match(actions, /getBoardPageData\(boardId, currentUser\.id/);
  assert.match(actions, /updateBoardListingStatus\([\s\S]*?currentUser\.id/);
  assert.match(voteAction, /linkedUserId === currentUser\.id/);
  assert.doesNotMatch(voteAction, /formData\.get\("roommateId"\)/);
  assert.match(commentAction, /linkedUserId === currentUser\.id/);
  assert.doesNotMatch(commentAction, /formData\.get\("roommateId"\)/);
});

test("listing data mutations enforce board ownership inside the data layer", () => {
  const boardData = read("lib/board-data.ts");

  assert.match(boardData, /actorUserId: string;/);
  assert.match(boardData, /await ensureBoard\(boardId, input\.actorUserId\)/);
  assert.match(
    boardData,
    /updateBoardListingStatus\([\s\S]*?actorUserId: string[\s\S]*?ensureBoard\(existing\.boardId, actorUserId\)/,
  );
  assert.match(
    boardData,
    /saveBoardListingVote\([\s\S]*?roommate\.boardId !== boardListing\.boardId[\s\S]*?boardListingVote\.upsert/,
  );
  assert.match(
    boardData,
    /addBoardListingComment\([\s\S]*?roommate\.boardId !== boardListing\.boardId[\s\S]*?boardListingComment\.create/,
  );
});

test("native logout cancels local work and ignores stale authenticated responses", () => {
  const model = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");
  const api = read("ios/HomeboardNative/HomeboardNative/Sources/HomeboardAPI.swift");
  const pushRoute = read("app/api/mobile/push-devices/route.ts");

  assert.match(model, /sessionEpoch = UUID\(\)/);
  assert.match(model, /listingUploadTask\?\.cancel\(\)/);
  assert.match(model, /activeListingInventoryRequestID = nil/);
  assert.match(model, /authSession\?\.userId == session\.userId/);
  assert.match(model, /apiClient\.unregisterPushDevice/);
  assert.match(api, /func unregisterPushDevice/);
  assert.match(pushRoute, /export async function DELETE/);
  assert.match(pushRoute, /userId: user\.id, token:/);
});

test("shared listing saves use a durable non-destructive queue", () => {
  const store = read("ios/HomeboardNative/HomeboardNative/Shared/HomeboardSharedImportStore.swift");
  const app = read("ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift");

  assert.match(store, /queueDirectoryName = "homeboard-pending-listings-v2"/);
  assert.match(store, /maximumPendingImports = 100/);
  assert.match(store, /data\.write\(to: fileURL, options: \[\.atomic\]\)/);
  assert.match(store, /static func all\(\) -> \[PendingImport\]/);
  assert.match(store, /static func remove\(id: UUID\)/);
  assert.match(store, /migratedEveryLegacyImport/);
  const currentQueueWrite = store.slice(
    store.indexOf("static func save(_ pendingImport:"),
    store.indexOf("static func remove(id: UUID)"),
  );
  assert.doesNotMatch(currentQueueWrite, /synchronize\(\)/);
  assert.match(app, /HomeboardSharedImportStore\.all\(\)/);
  assert.match(
    app,
    /HomeboardSharedImportStore\.remove\(\s*id: shared\.id,\s*preservingPreviewImage: keepsCapturedPreview\s*\)/,
  );
});

test("uploaded listing images are bounded, decoded, and stripped of metadata", () => {
  const upload = read("app/api/mobile/boards/[id]/uploads/route.ts");
  const delivery = read("app/api/listing-images/[...path]/route.ts");
  const imageUrls = read("lib/listing-image-urls.ts");
  const imageStorage = read("lib/listing-image-storage.ts");
  const instrumentation = read("instrumentation.ts");

  assert.match(imageStorage, /MAX_LISTING_IMAGE_BYTES = 8 \* 1024 \* 1024/);
  assert.match(upload, /limitInputPixels: 50_000_000/);
  assert.match(upload, /\.rotate\(\)/);
  assert.match(upload, /\.resize\(\{ width: 4_096, height: 4_096, fit: "inside"/);
  assert.match(upload, /\.jpeg\(\{ quality: 88/);
  assert.doesNotMatch(upload, /\.withMetadata\(/);
  assert.match(imageStorage, /public: false/);
  assert.match(imageStorage, /updateBucket\(LISTING_IMAGE_BUCKET/);
  assert.match(instrumentation, /ensureListingImageBucketIsPrivate/);
  assert.match(upload, /ensureListingImageBucketIsPrivate\(\)/);
  assert.match(upload, /signedListingImageUrl\(path\)/);
  assert.doesNotMatch(upload, /getPublicUrl/);
  assert.match(delivery, /verifyListingImageSignature/);
  assert.match(delivery, /"X-Content-Type-Options": "nosniff"/);
  assert.match(imageUrls, /SIGNED_IMAGE_LIFETIME_SECONDS = 6 \* 60 \* 60/);
  assert.match(imageUrls, /timingSafeEqual/);
});

test("private listing image links are path-scoped, expiring, and backward compatible", () => {
  const previousSecret = process.env.LISTING_IMAGE_SIGNING_SECRET;
  process.env.LISTING_IMAGE_SIGNING_SECRET = "test-listing-image-secret";
  try {
    const path = "user_123/board_456/123e4567-e89b-12d3-a456-426614174000.jpg";
    const signed = new URL(signedListingImageUrl(path));
    const expiresAt = Number(signed.searchParams.get("expires"));
    const signature = signed.searchParams.get("signature") ?? "";

    assert.equal(listingImageStoragePath(signed.toString()), path);
    assert.equal(
      listingImageStoragePath(`https://example.supabase.co/storage/v1/object/public/listing-images/${path}`),
      path,
    );
    assert.equal(verifyListingImageSignature(path, expiresAt, signature), true);
    assert.equal(
      verifyListingImageSignature(
        "user_123/board_456/123e4567-e89b-12d3-a456-426614174001.jpg",
        expiresAt,
        signature,
      ),
      false,
    );
    assert.equal(verifyListingImageSignature(path, Math.floor(Date.now() / 1_000) - 1, signature), false);
  } finally {
    if (previousSecret === undefined) delete process.env.LISTING_IMAGE_SIGNING_SECRET;
    else process.env.LISTING_IMAGE_SIGNING_SECRET = previousSecret;
  }
});

test("high-growth mobile writes return rate-limit responses", () => {
  for (const path of [
    "app/api/mobile/boards/[id]/messages/route.ts",
    "app/api/mobile/boards/[id]/updates/route.ts",
    "app/api/mobile/boards/[id]/listings/route.ts",
    "app/api/mobile/boards/[id]/listings/[listingId]/comments/route.ts",
    "app/api/mobile/invitations/route.ts",
  ]) {
    const source = read(path);
    assert.match(source, /assertThrottle\(/, path);
    assert.match(source, /isThrottleError\(error\) \? 429/, path);
  }
});

test("in-memory throttling and board payloads have hard growth bounds", () => {
  const throttle = read("lib/action-throttle.ts");
  const boardData = read("lib/board-data.ts");

  assert.match(throttle, /MAX_THROTTLE_ENTRIES = 10_000/);
  assert.match(throttle, /throttleStore\.delete\(oldestKey\)/);
  assert.match(boardData, /chatMessages: \{ orderBy: \{ createdAt: "desc" \}, take: 250, include: \{ advisorPayload: true \} \}/);
  assert.match(boardData, /comments: \{ include: \{ roommate: true \}, orderBy: \{ createdAt: "desc" \}, take: 100 \}/);
  assert.match(boardData, /\[\.\.\.board\.chatMessages\]\.reverse\(\)/);
});

test("automatic Safari scanning stays idle on search and map pages", () => {
  const scanner = read("ios/HomeboardNative/HomeboardSafariExtension/Resources/content.js");
  assert.match(scanner, /if \(listingURLKind\(\) === "search"\) \{[\s\S]*?automaticScanAttempts = 0;[\s\S]*?return;/);
});

test("redirects remain same-origin even with encoded or backslash separators", () => {
  assert.equal(safeRelativePath("/boards/abc?tab=chat"), "/boards/abc?tab=chat");
  assert.equal(safeRelativePath("https://evil.example"), "/");
  assert.equal(safeRelativePath("//evil.example"), "/");
  assert.equal(safeRelativePath("/\\evil.example"), "/");
  assert.equal(safeRelativePath("/%2f%2fevil.example"), "/");
  assert.equal(safeRelativePath("/%5cevil.example"), "/");
  assert.equal(safeRelativePath("/boards/abc%0d%0aLocation:evil"), "/");
});

test("form text is bounded and stripped of unsafe control characters", () => {
  assert.equal(sanitizePlainText("  one\u0000   two  ", 100), "one two");
  assert.equal(sanitizePlainText("first\r\nsecond\u0007", 100, { multiline: true }), "first\nsecond");
  assert.equal(sanitizePlainText("123456", 4), "1234");
});

test("listing URLs allow only credential-free HTTP and HTTPS URLs", () => {
  assert.equal(isSafeHttpUrl("https://www.zillow.com/homedetails/123"), true);
  assert.equal(isSafeHttpUrl("http://localhost:3000/listing"), true);
  assert.equal(isSafeHttpUrl("javascript:alert(1)"), false);
  assert.equal(isSafeHttpUrl("data:text/html,test"), false);
  assert.equal(isSafeHttpUrl("https://user:password@example.com/listing"), false);
});

test("security boundary fails closed and applies rate, CORS, size, and header controls", () => {
  const operatorAccess = read("lib/operator-access.ts");
  const proxy = read("proxy.ts");
  const nextConfig = read("next.config.ts");
  const auth = read("lib/mobile-auth.ts");

  assert.match(operatorAccess, /operatorEmails\.length === 0[\s\S]*?return false/);
  assert.match(proxy, /Cross-origin request blocked/);
  assert.match(proxy, /scope: isWrite \? "api-write" : "api-read"/);
  assert.match(proxy, /Request body is too large/);
  assert.match(proxy, /"Retry-After": "60"/);
  assert.match(nextConfig, /Content-Security-Policy/);
  assert.match(nextConfig, /X-Content-Type-Options/);
  assert.match(nextConfig, /Strict-Transport-Security/);
  assert.match(nextConfig, /poweredByHeader: false/);
  assert.match(auth, /supabaseAdmin\.auth\.getUser\(token\)/);
});

test("database and tracked-file defaults are private", () => {
  const migration = read("supabase/migrations/202609090001_lock_down_public_schema.sql");
  const gitignore = read(".gitignore");

  assert.match(migration, /revoke all on all tables in schema public from public, anon, authenticated/);
  assert.match(migration, /revoke execute on all functions in schema public from public, anon, authenticated/);
  assert.match(migration, /alter default privileges in schema public/);
  assert.match(gitignore, /^\.env\*$/m);
  assert.match(gitignore, /^!\.env\.example$/m);
  assert.match(gitignore, /^\/output\/$/m);
});

test("mobile endpoints require verified auth except possession-based device pairing", () => {
  const pairingRoutes = new Set([
    "app/api/mobile/device-pairings/route.ts",
    "app/api/mobile/device-pairings/[id]/route.ts",
  ]);

  for (const path of routeFiles("app/api/mobile")) {
    const source = read(path);
    if (pairingRoutes.has(path)) {
      assert.match(source, /hashDevicePairingValue|matchesDevicePairingHash/, path);
      continue;
    }
    assert.match(source, /requireMobileAppUser/, path);
  }
});

test("API routes do not return raw caught server errors", () => {
  for (const path of routeFiles("app/api")) {
    assert.doesNotMatch(read(path), /\{\s*error:\s*message\s*\}/, path);
  }
});

test("passwords stay out of the application database and retain user whitespace", () => {
  const schema = read("prisma/schema.prisma");
  const actions = read("app/actions.ts");

  assert.doesNotMatch(schema, /password(?:Hash)?\s+/i);
  assert.match(actions, /supabase\.auth\.signUp\(\{[\s\S]*?password/);
  assert.match(actions, /supabase\.auth\.signInWithPassword\(\{ email, password \}\)/);
  assert.doesNotMatch(actions, /formData\.get\("password"\)[\s\S]{0,40}\.trim\(\)/);
});
