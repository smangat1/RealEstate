import { createSign } from "node:crypto";

export type APNsTokenCredentials = {
  keyId: string;
  teamId: string;
  privateKey: string;
};

function base64URL(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function createAPNsProviderToken(
  configuration: APNsTokenCredentials,
  issuedAt = Math.floor(Date.now() / 1_000),
) {
  const encodedHeader = base64URL(JSON.stringify({ alg: "ES256", kid: configuration.keyId }));
  const encodedPayload = base64URL(JSON.stringify({ iss: configuration.teamId, iat: issuedAt }));
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  const signature = signer.sign({
    key: configuration.privateKey,
    dsaEncoding: "ieee-p1363",
  });
  return `${signingInput}.${base64URL(signature)}`;
}
