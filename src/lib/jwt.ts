import {
  SignJWT,
  jwtVerify,
  importJWK,
  exportJWK,
  generateKeyPair,
  type JWK,
} from "jose";
import type { AccessTokenClaims, Env, Role } from "../types";
import { nowIso } from "./util";

type ActiveKey = {
  kid: string;
  privateKey: CryptoKey;
  publicJwk: JWK;
};

let memoryCache: ActiveKey | null = null;

async function ensureActiveKey(env: Env): Promise<ActiveKey> {
  if (memoryCache) return memoryCache;

  const row = await env.DB.prepare(
    "SELECT kid, private_jwk, public_jwk FROM signing_keys WHERE active = 1 ORDER BY created_at DESC LIMIT 1",
  ).first<{ kid: string; private_jwk: string; public_jwk: string }>();

  if (row) {
    const privateJwk = JSON.parse(row.private_jwk) as JWK;
    const publicJwk = JSON.parse(row.public_jwk) as JWK;
    const privateKey = (await importJWK(privateJwk, "RS256")) as CryptoKey;
    memoryCache = { kid: row.kid, privateKey, publicJwk };
    return memoryCache;
  }

  const { publicKey, privateKey } = await generateKeyPair("RS256", {
    extractable: true,
  });
  const privateJwk = await exportJWK(privateKey);
  const publicJwk = await exportJWK(publicKey);
  const kid = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  privateJwk.kid = kid;
  privateJwk.alg = "RS256";
  privateJwk.use = "sig";
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  await env.DB.prepare(
    "INSERT INTO signing_keys (kid, private_jwk, public_jwk, created_at, active) VALUES (?, ?, ?, ?, 1)",
  )
    .bind(kid, JSON.stringify(privateJwk), JSON.stringify(publicJwk), nowIso())
    .run();

  memoryCache = {
    kid,
    privateKey,
    publicJwk,
  };
  return memoryCache;
}

export async function issueAccessToken(
  env: Env,
  claims: AccessTokenClaims,
): Promise<{ token: string; expires_in: number }> {
  const ttl = Number(env.ACCESS_TOKEN_TTL_SECONDS || 900);
  const key = await ensureActiveKey(env);
  const token = await new SignJWT({
    email: claims.email,
    name: claims.name,
    org_id: claims.org_id,
    role: claims.role,
    sid: claims.sid,
    scope: claims.scope,
  })
    .setProtectedHeader({ alg: "RS256", kid: key.kid, typ: "JWT" })
    .setIssuer(env.ISSUER)
    .setAudience("pulse")
    .setSubject(claims.sub)
    .setIssuedAt()
    .setExpirationTime(`${ttl}s`)
    .sign(key.privateKey);
  return { token, expires_in: ttl };
}

export async function verifyAccessToken(env: Env, token: string) {
  const key = await ensureActiveKey(env);
  const { payload } = await jwtVerify(token, key.privateKey, {
    issuer: env.ISSUER,
    audience: "pulse",
  });
  return {
    sub: String(payload.sub),
    email: String(payload.email ?? ""),
    name: String(payload.name ?? ""),
    org_id: payload.org_id ? String(payload.org_id) : undefined,
    role: payload.role as Role | undefined,
    sid: String(payload.sid ?? ""),
    scope: String(payload.scope ?? "openid profile email"),
  } satisfies AccessTokenClaims;
}

export async function getJwks(env: Env) {
  const rows = await env.DB.prepare(
    "SELECT public_jwk FROM signing_keys WHERE active = 1",
  ).all<{ public_jwk: string }>();
  if (!rows.results?.length) {
    await ensureActiveKey(env);
    return getJwks(env);
  }
  return {
    keys: rows.results.map((r) => JSON.parse(r.public_jwk) as JWK),
  };
}
