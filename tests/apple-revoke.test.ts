import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  createAppleClientSecret,
  revokeAppleAuthorizationCode,
} from "../lib/apple-revoke";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const privateKeyPem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const escapedPrivateKey = privateKeyPem.replace(/\n/g, "\\n");
const configuration = {
  keyId: "KEY1234567",
  teamId: "4SSAVHCM6U",
  privateKey: escapedPrivateKey,
  clientId: "com.homeboard.native",
};

function decodeSegment(segment: string) {
  return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as Record<string, unknown>;
}

test("client secret uses the required ES256 header and Apple claims", () => {
  const now = 1_800_000_000;
  const jwt = createAppleClientSecret(configuration, now);
  const [headerPart, claimsPart, signaturePart] = jwt.split(".");
  assert.deepEqual(decodeSegment(headerPart), { alg: "ES256", kid: "KEY1234567", typ: "JWT" });
  assert.deepEqual(decodeSegment(claimsPart), {
    iss: "4SSAVHCM6U",
    iat: now,
    exp: now + 300,
    aud: "https://appleid.apple.com",
    sub: "com.homeboard.native",
  });
  assert.equal(verify(
    "sha256",
    Buffer.from(`${headerPart}.${claimsPart}`),
    { key: publicKey, dsaEncoding: "ieee-p1363" },
    Buffer.from(signaturePart, "base64url"),
  ), true);
});

test("authorization code exchange and refresh-token revocation use exact form fields", async () => {
  const requests: Array<{ url: string; form: URLSearchParams }> = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    requests.push({
      url: String(input),
      form: new URLSearchParams(String(init?.body ?? "")),
    });
    if (requests.length === 1) {
      return new Response(JSON.stringify({ refresh_token: "refresh-secret" }), { status: 200 });
    }
    return new Response(null, { status: 200 });
  };

  await revokeAppleAuthorizationCode({
    ...configuration,
    authorizationCode: "fresh-code",
    fetchImpl,
    nowSeconds: 1_800_000_000,
  });

  assert.equal(requests[0].url, "https://appleid.apple.com/auth/token");
  assert.equal(requests[0].form.get("client_id"), "com.homeboard.native");
  assert.equal(requests[0].form.get("code"), "fresh-code");
  assert.equal(requests[0].form.get("grant_type"), "authorization_code");
  assert.ok(requests[0].form.get("client_secret"));
  assert.equal(requests[1].url, "https://appleid.apple.com/auth/revoke");
  assert.equal(requests[1].form.get("token"), "refresh-secret");
  assert.equal(requests[1].form.get("token_type_hint"), "refresh_token");
});

test("Apple 400 errors fail without echoing response secrets", async () => {
  const fetchImpl: typeof fetch = async () => new Response(
    JSON.stringify({ error: "invalid_grant", leaked: "fresh-code" }),
    { status: 400 },
  );
  await assert.rejects(
    revokeAppleAuthorizationCode({
      ...configuration,
      authorizationCode: "fresh-code",
      fetchImpl,
    }),
    (error: Error) => {
      assert.equal(error.message, "Apple token exchange failed with status 400.");
      assert.doesNotMatch(error.message, /fresh-code|invalid_grant|PRIVATE KEY/);
      return true;
    },
  );
});

test("network failures propagate without application logging secrets", async () => {
  const logged: unknown[] = [];
  const originalError = console.error;
  console.error = (...values: unknown[]) => { logged.push(values); };
  try {
    await assert.rejects(
      revokeAppleAuthorizationCode({
        ...configuration,
        authorizationCode: "fresh-code",
        fetchImpl: async () => { throw new Error("network unavailable"); },
      }),
      /network unavailable/,
    );
  } finally {
    console.error = originalError;
  }
  assert.deepEqual(logged, []);
});

test("account deletion revokes only Apple identities and never blocks deletion on failure", () => {
  const route = readFileSync("app/api/mobile/account/route.ts", "utf8");
  const revokeIndex = route.indexOf("revokeAppleAuthorizationCode");
  const deletionIndex = route.indexOf("prepareAccountDeletion(user.id)");
  assert.match(route, /user\.authProviders\.includes\("apple"\)/);
  assert.ok(revokeIndex >= 0 && revokeIndex < deletionIndex);
  assert.match(route, /catch \{[\s\S]*operation: "revoke_apple_token"/);
  assert.match(route, /appleRevoked = true/);
  assert.match(route, /authCleanupPending, appleRevoked/);
});

test("native deletion requests a fresh no-scope code and skips the review session", () => {
  const appModel = readFileSync(
    "ios/HomeboardNative/HomeboardNative/Sources/AppModel.swift",
    "utf8",
  );
  const api = readFileSync(
    "ios/HomeboardNative/HomeboardNative/Sources/HomeboardAPI.swift",
    "utf8",
  );
  assert.match(appModel, /request\.requestedScopes = \[\]/);
  assert.match(appModel, /if session\.authProvider == "apple"/);
  assert.match(appModel, /error\.code == \.canceled/);
  assert.match(api, /session\.authProvider = "review"/);
  assert.match(api, /appleAuthorizationCode: appleAuthorizationCode/);
});
