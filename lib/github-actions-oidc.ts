import { createPublicKey, verify } from "node:crypto";

const ISSUER = "https://token.actions.githubusercontent.com";
const JWKS_URL = `${ISSUER}/.well-known/jwks`;
const AUDIENCE = "homeboard-advisor-proactive";
const REPOSITORY = "smangat1/RealEstate";
const REPOSITORY_ID = "1270827998";
const WORKFLOW_REF = `${REPOSITORY}/.github/workflows/advisor-proactive.yml@refs/heads/main`;

type GitHubOidcHeader = {
  alg?: unknown;
  kid?: unknown;
  typ?: unknown;
};

export type GitHubOidcClaims = {
  iss?: unknown;
  aud?: unknown;
  exp?: unknown;
  nbf?: unknown;
  iat?: unknown;
  repository?: unknown;
  repository_id?: unknown;
  repository_visibility?: unknown;
  ref?: unknown;
  workflow_ref?: unknown;
  event_name?: unknown;
};

type GitHubJwk = JsonWebKey & { kid?: string; alg?: string; use?: string };

let cachedSigningKeys: { keys: GitHubJwk[]; expiresAt: number } | null = null;

function decodeJson<T>(segment: string): T | null {
  try {
    return JSON.parse(Buffer.from(segment, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function hasAudience(value: unknown) {
  return value === AUDIENCE
    || (Array.isArray(value) && value.some((entry) => entry === AUDIENCE));
}

export function validateGitHubActionsClaims(
  claims: GitHubOidcClaims,
  nowSeconds = Math.floor(Date.now() / 1_000),
) {
  const eventAllowed = claims.event_name === "schedule" || claims.event_name === "workflow_dispatch";
  return claims.iss === ISSUER
    && hasAudience(claims.aud)
    && claims.repository === REPOSITORY
    && claims.repository_id === REPOSITORY_ID
    && claims.repository_visibility === "public"
    && claims.ref === "refs/heads/main"
    && claims.workflow_ref === WORKFLOW_REF
    && eventAllowed
    && typeof claims.exp === "number"
    && claims.exp >= nowSeconds - 30
    && typeof claims.nbf === "number"
    && claims.nbf <= nowSeconds + 30
    && typeof claims.iat === "number"
    && claims.iat >= nowSeconds - 15 * 60
    && claims.iat <= nowSeconds + 30;
}

async function loadSigningKeys(forceRefresh = false) {
  if (!forceRefresh && cachedSigningKeys && cachedSigningKeys.expiresAt > Date.now()) {
    return cachedSigningKeys.keys;
  }
  const response = await fetch(JWKS_URL, {
    cache: "no-store",
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) return [];
  const body = await response.json().catch(() => null) as { keys?: GitHubJwk[] } | null;
  const keys = body?.keys?.filter((key) => key.use === "sig" && key.alg === "RS256") ?? [];
  cachedSigningKeys = { keys, expiresAt: Date.now() + 6 * 60 * 60 * 1_000 };
  return keys;
}

async function signingKey(kid: string) {
  const keys = await loadSigningKeys();
  const cachedMatch = keys.find((key) => key.kid === kid);
  if (cachedMatch) return cachedMatch;
  const refreshedKeys = await loadSigningKeys(true);
  return refreshedKeys.find((key) => key.kid === kid) ?? null;
}

export async function verifyGitHubActionsOidcToken(token: string) {
  if (!token || token.length > 16_384) return false;
  const segments = token.split(".");
  if (segments.length !== 3) return false;
  const [encodedHeader, encodedClaims, encodedSignature] = segments;
  const header = decodeJson<GitHubOidcHeader>(encodedHeader);
  const claims = decodeJson<GitHubOidcClaims>(encodedClaims);
  if (!header || !claims
      || header.alg !== "RS256"
      || header.typ !== "JWT"
      || typeof header.kid !== "string"
      || !validateGitHubActionsClaims(claims)) {
    return false;
  }

  try {
    const key = await signingKey(header.kid);
    if (!key) return false;
    return verify(
      "RSA-SHA256",
      Buffer.from(`${encodedHeader}.${encodedClaims}`),
      createPublicKey({ key, format: "jwk" }),
      Buffer.from(encodedSignature, "base64url"),
    );
  } catch {
    return false;
  }
}

export async function isAdvisorCronRequestAuthorized(request: Request) {
  const authorization = request.headers.get("authorization");
  if (!authorization?.startsWith("Bearer ")) return false;
  const token = authorization.slice("Bearer ".length).trim();
  const secret = process.env.CRON_SECRET?.trim();
  if (secret && token === secret) return true;
  return verifyGitHubActionsOidcToken(token);
}
