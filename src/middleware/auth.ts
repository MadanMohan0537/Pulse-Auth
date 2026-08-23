import type { Context, Next } from "hono";
import { verifyAccessToken } from "../lib/jwt";
import { jsonError, parseBearer } from "../lib/util";
import type { AccessTokenClaims, Env } from "../types";
import { sessionStub } from "../durable-objects/SessionManager";

export type AppVars = {
  user: AccessTokenClaims;
};

export type AppEnv = {
  Bindings: Env;
  Variables: AppVars;
};

export async function requireAuth(c: Context<AppEnv>, next: Next) {
  const token = parseBearer(c.req.header("Authorization"));
  if (!token) return jsonError(401, "unauthorized", "Missing bearer token");

  try {
    const claims = await verifyAccessToken(c.env, token);
    if (!claims.sid) {
      return jsonError(401, "unauthorized", "Token missing session");
    }

    const stub = sessionStub(c.env, claims.sub);
    const res = await stub.fetch("https://session/get/" + claims.sid);
    if (!res.ok) {
      return jsonError(401, "session_revoked", "Session is no longer valid");
    }
    const session = (await res.json()) as { revokedAt: string | null };
    if (session.revokedAt) {
      return jsonError(401, "session_revoked", "Session is no longer valid");
    }

    await stub.fetch("https://session/touch", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sessionId: claims.sid }),
    });

    c.set("user", claims);
    await next();
  } catch (err) {
    console.error("requireAuth failed", err);
    return jsonError(401, "unauthorized", "Invalid or expired access token");
  }
}
