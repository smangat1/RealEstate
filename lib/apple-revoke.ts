import { sign } from "node:crypto";

const APPLE_CLIENT_ID = "com.homeboard.native";
const APPLE_AUDIENCE = "https://appleid.apple.com";
const APPLE_TOKEN_URL = `${APPLE_AUDIENCE}/auth/token`;
const APPLE_REVOKE_URL = `${APPLE_AUDIENCE}/auth/revoke`;

type FetchImplementation = typeof fetch;

export type AppleRevokeConfiguration = {
  keyId: string;
  privateKey: string;
  teamId: string;
  clientId?: string;
};

type RevokeInput = AppleRevokeConfiguration & {
  authorizationCode: string;
  fetchImpl?: FetchImplementation;
  nowSeconds?: number;
};

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, "\n").trim();
}

export function createAppleClientSecret(
  configuration: AppleRevokeConfiguration,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const clientId = configuration.clientId ?? APPLE_CLIENT_ID;
  const header = { alg: "ES256", kid: configuration.keyId, typ: "JWT" };
  const claims = {
    iss: configuration.teamId,
    iat: nowSeconds,
    exp: nowSeconds + 5 * 60,
    aud: APPLE_AUDIENCE,
    sub: clientId,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(claims))}`;
  const signature = sign("sha256", Buffer.from(signingInput), {
    key: normalizePrivateKey(configuration.privateKey),
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64url(signature)}`;
}

export function getAppleRevokeConfiguration(): AppleRevokeConfiguration | null {
  const keyId = process.env.APPLE_SIWA_KEY_ID?.trim();
  const privateKey = process.env.APPLE_SIWA_PRIVATE_KEY?.trim();
  const teamId = process.env.APPLE_TEAM_ID?.trim() || "4SSAVHCM6U";
  if (!keyId || !privateKey) return null;
  return { keyId, privateKey, teamId, clientId: APPLE_CLIENT_ID };
}

async function postForm(
  fetchImpl: FetchImplementation,
  url: string,
  values: Record<string, string>,
) {
  return fetchImpl(url, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(values).toString(),
    signal: AbortSignal.timeout(8_000),
  });
}

export async function revokeAppleAuthorizationCode(input: RevokeInput) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const clientId = input.clientId ?? APPLE_CLIENT_ID;
  const clientSecret = createAppleClientSecret(input, input.nowSeconds);
  const tokenResponse = await postForm(fetchImpl, APPLE_TOKEN_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    code: input.authorizationCode,
    grant_type: "authorization_code",
  });
  if (!tokenResponse.ok) {
    throw new Error(`Apple token exchange failed with status ${tokenResponse.status}.`);
  }
  const tokenPayload = await tokenResponse.json() as { refresh_token?: unknown };
  if (typeof tokenPayload.refresh_token !== "string" || !tokenPayload.refresh_token) {
    throw new Error("Apple token exchange did not return a refresh token.");
  }

  const revokeResponse = await postForm(fetchImpl, APPLE_REVOKE_URL, {
    client_id: clientId,
    client_secret: clientSecret,
    token: tokenPayload.refresh_token,
    token_type_hint: "refresh_token",
  });
  if (!revokeResponse.ok) {
    throw new Error(`Apple token revocation failed with status ${revokeResponse.status}.`);
  }
}

