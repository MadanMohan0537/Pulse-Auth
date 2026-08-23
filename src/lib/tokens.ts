import type { Env, Role, UserRow } from "../types";
import { issueAccessToken } from "./jwt";
import { mintRefreshToken } from "./refresh";
import { id } from "./util";
import { sessionStub } from "../durable-objects/SessionManager";

export async function issueSessionTokens(
  env: Env,
  user: UserRow,
  opts: {
    userAgent?: string | null;
    ip?: string | null;
    orgId?: string | null;
    role?: Role;
  } = {},
) {
  const sessionId = id("ses");
  const stub = sessionStub(env, user.id);
  await stub.fetch("https://session/create", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      id: sessionId,
      userId: user.id,
      userAgent: opts.userAgent ?? null,
      ip: opts.ip ?? null,
      orgId: opts.orgId ?? null,
    }),
  });

  const access = await issueAccessToken(env, {
    sub: user.id,
    email: user.email,
    name: user.name,
    org_id: opts.orgId ?? undefined,
    role: opts.role,
    sid: sessionId,
    scope: "openid profile email offline_access",
  });

  const refresh = await mintRefreshToken(env, {
    userId: user.id,
    sessionId,
    orgId: opts.orgId,
    role: opts.role,
  });

  return {
    token_type: "Bearer" as const,
    access_token: access.token,
    expires_in: access.expires_in,
    refresh_token: refresh.refresh_token,
    session_id: sessionId,
    scope: "openid profile email offline_access",
  };
}
