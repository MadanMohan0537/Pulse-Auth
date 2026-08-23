import { Hono } from "hono";
import { requireAuth, type AppEnv } from "../middleware/auth";
import { emitEvent } from "../lib/events";
import { revokeSessionTokens, revokeAllUserTokens } from "../lib/refresh";
import { jsonError } from "../lib/util";
import { sessionStub } from "../durable-objects/SessionManager";

export const sessionRoutes = new Hono<AppEnv>();

sessionRoutes.use("*", requireAuth);

sessionRoutes.get("/", async (c) => {
  const claims = c.get("user");
  const stub = sessionStub(c.env, claims.sub);
  const res = await stub.fetch("https://session/list");
  const data = (await res.json()) as {
    sessions: Array<{
      id: string;
      createdAt: string;
      lastSeenAt: string;
      userAgent: string | null;
      ip: string | null;
      orgId: string | null;
      revokedAt: string | null;
    }>;
  };

  return c.json({
    current_session_id: claims.sid,
    sessions: data.sessions.map((s) => ({
      ...s,
      current: s.id === claims.sid,
    })),
  });
});

sessionRoutes.delete("/:sessionId", async (c) => {
  const claims = c.get("user");
  const sessionId = c.req.param("sessionId");
  const stub = sessionStub(c.env, claims.sub);
  const existing = await stub.fetch(`https://session/get/${sessionId}`);
  if (!existing.ok) return jsonError(404, "not_found", "Session not found");

  await stub.fetch("https://session/revoke", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ sessionId }),
  });
  await revokeSessionTokens(c.env, sessionId);
  await emitEvent(
    c.env,
    "session.revoked",
    { session_id: sessionId },
    { userId: claims.sub, orgId: claims.org_id },
  );

  return c.json({ ok: true, revoked: sessionId });
});

sessionRoutes.delete("/", async (c) => {
  const claims = c.get("user");
  const stub = sessionStub(c.env, claims.sub);
  const result = await stub.fetch("https://session/revoke-all", { method: "POST" });
  const body = (await result.json()) as { revoked: number };
  await revokeAllUserTokens(c.env, claims.sub);
  await emitEvent(
    c.env,
    "session.revoked",
    { all: true, count: body.revoked },
    { userId: claims.sub, orgId: claims.org_id },
  );
  return c.json({ ok: true, revoked: body.revoked });
});
