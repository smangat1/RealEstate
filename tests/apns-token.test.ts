import assert from "node:assert/strict";
import { generateKeyPairSync, verify } from "node:crypto";
import test from "node:test";

import { createAPNsProviderToken } from "../lib/apns-token";

test("APNs provider tokens use a valid raw ES256 signature", () => {
  const { privateKey, publicKey } = generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
  });
  const privatePEM = privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  const token = createAPNsProviderToken(
    { keyId: "ABCDEFGHIJ", teamId: "4SSAVHCM6U", privateKey: privatePEM },
    1_788_200_000,
  );
  const [header, payload, signature] = token.split(".");

  assert.deepEqual(JSON.parse(Buffer.from(header, "base64url").toString("utf8")), {
    alg: "ES256",
    kid: "ABCDEFGHIJ",
  });
  assert.deepEqual(JSON.parse(Buffer.from(payload, "base64url").toString("utf8")), {
    iss: "4SSAVHCM6U",
    iat: 1_788_200_000,
  });
  assert.equal(Buffer.from(signature, "base64url").length, 64);
  assert.equal(
    verify(
      "SHA256",
      Buffer.from(`${header}.${payload}`),
      { key: publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    ),
    true,
  );
});
