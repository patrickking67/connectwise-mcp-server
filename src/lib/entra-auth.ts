import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import type { EntraConfig } from "../config.js";

let cachedJwks: JWTVerifyGetKey | undefined;

export function entraIssuer(cfg: EntraConfig): string {
  return `https://login.microsoftonline.com/${cfg.tenantId}/v2.0`;
}

/**
 * Validate a Microsoft Entra ID (v2.0) access token: signature against the
 * tenant JWKS, issuer, expiry, and audience (api://<clientId> or the bare id).
 */
export async function verifyEntraToken(
  token: string,
  cfg: EntraConfig,
  getKey?: JWTVerifyGetKey,
): Promise<JWTPayload> {
  const key =
    getKey ??
    (cachedJwks ??= createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${cfg.tenantId}/discovery/v2.0/keys`),
    ));
  const { payload } = await jwtVerify(token, key, {
    issuer: entraIssuer(cfg),
    audience: [`api://${cfg.clientId}`, cfg.clientId],
  });
  return payload;
}
