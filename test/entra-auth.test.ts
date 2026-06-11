import { describe, expect, it } from "vitest";
import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair } from "jose";
import { entraIssuer, verifyEntraToken } from "../src/lib/entra-auth.js";
import type { EntraConfig } from "../src/config.js";

const CFG: EntraConfig = {
  tenantId: "11111111-2222-3333-4444-555555555555",
  clientId: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
};

const { publicKey, privateKey } = await generateKeyPair("RS256");
const jwks = createLocalJWKSet({
  keys: [{ ...(await exportJWK(publicKey)), alg: "RS256", use: "sig", kid: "test-key" }],
});

function buildToken(overrides: { issuer?: string; audience?: string; expiresAt?: number } = {}) {
  const jwt = new SignJWT({ scp: "access_as_user", name: "Pat Tester" })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuedAt()
    .setIssuer(overrides.issuer ?? entraIssuer(CFG))
    .setAudience(overrides.audience ?? `api://${CFG.clientId}`)
    .setSubject("user-object-id")
    .setExpirationTime(overrides.expiresAt ?? "5m");
  return jwt.sign(privateKey);
}

describe("verifyEntraToken", () => {
  it("accepts a token with the right issuer and audience", async () => {
    const payload = await verifyEntraToken(await buildToken(), CFG, jwks);
    expect(payload.sub).toBe("user-object-id");
  });

  it("accepts the bare client id as audience", async () => {
    const token = await buildToken({ audience: CFG.clientId });
    await expect(verifyEntraToken(token, CFG, jwks)).resolves.toBeTruthy();
  });

  it("rejects a token for a different audience", async () => {
    const token = await buildToken({ audience: "api://some-other-app" });
    await expect(verifyEntraToken(token, CFG, jwks)).rejects.toThrow();
  });

  it("rejects a token from a different tenant", async () => {
    const token = await buildToken({
      issuer: "https://login.microsoftonline.com/99999999-0000-0000-0000-000000000000/v2.0",
    });
    await expect(verifyEntraToken(token, CFG, jwks)).rejects.toThrow();
  });

  it("rejects an expired token", async () => {
    const token = await buildToken({ expiresAt: Math.floor(Date.now() / 1000) - 600 });
    await expect(verifyEntraToken(token, CFG, jwks)).rejects.toThrow();
  });

  it("rejects garbage", async () => {
    await expect(verifyEntraToken("not-a-jwt", CFG, jwks)).rejects.toThrow();
  });
});
