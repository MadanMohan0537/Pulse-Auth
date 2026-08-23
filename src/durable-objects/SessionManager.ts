import { DurableObject } from "cloudflare:workers";
import type { Env } from "../types";

export type SessionRecord = {
  id: string;
  userId: string;
  createdAt: string;
  lastSeenAt: string;
  userAgent: string | null;
  ip: string | null;
  orgId: string | null;
  revokedAt: string | null;
};

/**
 * One Durable Object per user — authoritative list of live sessions.
 * SQLite-backed so session revoke is immediate and consistent at the edge.
 */
export class SessionManager extends DurableObject<Env> {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT NOT NULL,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        user_agent TEXT,
        ip TEXT,
        org_id TEXT,
        revoked_at TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id);
    `);
  }

  async create(input: {
    id: string;
    userId: string;
    userAgent?: string | null;
    ip?: string | null;
    orgId?: string | null;
  }): Promise<SessionRecord> {
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `INSERT INTO sessions (id, user_id, created_at, last_seen_at, user_agent, ip, org_id, revoked_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
      input.id,
      input.userId,
      now,
      now,
      input.userAgent ?? null,
      input.ip ?? null,
      input.orgId ?? null,
    );
    return {
      id: input.id,
      userId: input.userId,
      createdAt: now,
      lastSeenAt: now,
      userAgent: input.userAgent ?? null,
      ip: input.ip ?? null,
      orgId: input.orgId ?? null,
      revokedAt: null,
    };
  }

  async touch(sessionId: string): Promise<boolean> {
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE sessions SET last_seen_at = ? WHERE id = ? AND revoked_at IS NULL`,
      now,
      sessionId,
    );
    const row = this.ctx.storage.sql
      .exec(`SELECT id FROM sessions WHERE id = ? AND revoked_at IS NULL`, sessionId)
      .toArray();
    return row.length > 0;
  }

  async revoke(sessionId: string): Promise<boolean> {
    const now = new Date().toISOString();
    this.ctx.storage.sql.exec(
      `UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
      now,
      sessionId,
    );
    return true;
  }

  async revokeAll(): Promise<number> {
    const now = new Date().toISOString();
    const before = this.ctx.storage.sql
      .exec(`SELECT COUNT(*) AS c FROM sessions WHERE revoked_at IS NULL`)
      .one() as { c: number };
    this.ctx.storage.sql.exec(
      `UPDATE sessions SET revoked_at = ? WHERE revoked_at IS NULL`,
      now,
    );
    return Number(before.c ?? 0);
  }

  async list(): Promise<SessionRecord[]> {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT id, user_id, created_at, last_seen_at, user_agent, ip, org_id, revoked_at
         FROM sessions ORDER BY created_at DESC`,
      )
      .toArray() as Array<{
      id: string;
      user_id: string;
      created_at: string;
      last_seen_at: string;
      user_agent: string | null;
      ip: string | null;
      org_id: string | null;
      revoked_at: string | null;
    }>;
    return rows.map((r) => ({
      id: r.id,
      userId: r.user_id,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      userAgent: r.user_agent,
      ip: r.ip,
      orgId: r.org_id,
      revokedAt: r.revoked_at,
    }));
  }

  async get(sessionId: string): Promise<SessionRecord | null> {
    const rows = this.ctx.storage.sql
      .exec(
        `SELECT id, user_id, created_at, last_seen_at, user_agent, ip, org_id, revoked_at
         FROM sessions WHERE id = ?`,
        sessionId,
      )
      .toArray() as Array<{
      id: string;
      user_id: string;
      created_at: string;
      last_seen_at: string;
      user_agent: string | null;
      ip: string | null;
      org_id: string | null;
      revoked_at: string | null;
    }>;
    const r = rows[0];
    if (!r) return null;
    return {
      id: r.id,
      userId: r.user_id,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      userAgent: r.user_agent,
      ip: r.ip,
      orgId: r.org_id,
      revokedAt: r.revoked_at,
    };
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    if (method === "POST" && url.pathname === "/create") {
      const body = (await request.json()) as {
        id: string;
        userId: string;
        userAgent?: string | null;
        ip?: string | null;
        orgId?: string | null;
      };
      const session = await this.create(body);
      return Response.json(session);
    }

    if (method === "POST" && url.pathname === "/touch") {
      const body = (await request.json()) as { sessionId: string };
      const ok = await this.touch(body.sessionId);
      return Response.json({ ok });
    }

    if (method === "POST" && url.pathname === "/revoke") {
      const body = (await request.json()) as { sessionId: string };
      await this.revoke(body.sessionId);
      return Response.json({ ok: true });
    }

    if (method === "POST" && url.pathname === "/revoke-all") {
      const count = await this.revokeAll();
      return Response.json({ revoked: count });
    }

    if (method === "GET" && url.pathname === "/list") {
      return Response.json({ sessions: await this.list() });
    }

    if (method === "GET" && url.pathname.startsWith("/get/")) {
      const sessionId = url.pathname.slice("/get/".length);
      const session = await this.get(sessionId);
      return session
        ? Response.json(session)
        : Response.json({ error: "not_found" }, { status: 404 });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  }
}

export function sessionStub(env: { SESSION_MANAGER: DurableObjectNamespace }, userId: string) {
  const doId = env.SESSION_MANAGER.idFromName(userId);
  return env.SESSION_MANAGER.get(doId);
}
