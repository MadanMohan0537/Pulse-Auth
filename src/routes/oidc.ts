import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { getJwks } from "../lib/jwt";

export const oidcRoutes = new Hono<AppEnv>();

oidcRoutes.get("/.well-known/openid-configuration", (c) => {
  const issuer = c.env.ISSUER.replace(/\/$/, "");
  return c.json({
    issuer,
    authorization_endpoint: `${issuer}/v1/oauth/github/start`,
    token_endpoint: `${issuer}/v1/auth/refresh`,
    userinfo_endpoint: `${issuer}/v1/me`,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    revocation_endpoint: `${issuer}/v1/auth/logout`,
    response_types_supported: ["code"],
    subject_types_supported: ["public"],
    id_token_signing_alg_values_supported: ["RS256"],
    token_endpoint_auth_methods_supported: ["none"],
    scopes_supported: ["openid", "profile", "email", "offline_access"],
    claims_supported: [
      "sub",
      "email",
      "name",
      "org_id",
      "role",
      "sid",
    ],
    grant_types_supported: ["refresh_token", "password", "authorization_code"],
  });
});

oidcRoutes.get("/.well-known/jwks.json", async (c) => {
  return c.json(await getJwks(c.env));
});
