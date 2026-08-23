import type { Env, RefreshTokenRow, Role } from "../types";
import { id, nowIso, randomToken, sha256Hex } from "./util";

export type TokenPairMeta = {
  userId: string;
  sessionId: string;
  orgId?: string | null;
  role?: Role;
  familyId?: string;
  parentId?: string | null;
};

export async function mintRefreshToken(env: Env, meta: TokenPairMeta) {
  const raw = randomToken(48);
  const tokenHash = await sha256Hex(raw);
  const familyId = meta.familyId ?? id("rtf");
  const tokenId = id("rt");
  const ttl = Number(env.REFRESH_TOKEN_TTL_SECONDS || 2_592_000);
  const expires = new Date(Date.now() + ttl * 1000).toISOString();
  const created = nowIso();

  await env.DB.prepare(
    `INSERT INTO refresh_tokens
      (id, family_id, user_id, token_hash, parent_id, session_id, org_id, reused_at, revoked_at, expires_at, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?)`,
  )
    .bind(
      tokenId,
      familyId,
      meta.userId,
      tokenHash,
      meta.parentId ?? null,
      meta.sessionId,
      meta.orgId ?? null,
      expires,
      created,
    )
    .run();

  return {
    refresh_token: raw,
    refresh_token_id: tokenId,
    family_id: familyId,
    expires_at: expires,
  };
}

export async function rotateRefreshToken(env: Env, presentedRaw: string) {
  const presentedHash = await sha256Hex(presentedRaw);
  const row = await env.DB.prepare(
    "SELECT * FROM refresh_tokens WHERE token_hash = ?",
  )
    .bind(presentedHash)
    .first<RefreshTokenRow>();

  if (!row) {
    return { ok: false as const, reason: "invalid" as const };
  }

  if (row.revoked_at) {
    // Reuse detection only when a rotated (parent) token is presented again.
    const child = await env.DB.prepare(
      "SELECT id FROM refresh_tokens WHERE parent_id = ? LIMIT 1",
    )
      .bind(row.id)
      .first<{ id: string }>();

    if (child) {
      await env.DB.prepare(
        "UPDATE refresh_tokens SET reused_at = COALESCE(reused_at, ?) WHERE id = ?",
      )
        .bind(nowIso(), row.id)
        .run();
      await revokeFamily(env, row.family_id);
      return {
        ok: false as const,
        reason: "reuse_detected" as const,
        family_id: row.family_id,
        user_id: row.user_id,
        session_id: row.session_id,
      };
    }

    return { ok: false as const, reason: "invalid" as const };
  }

  if (new Date(row.expires_at).getTime() < Date.now()) {
    return { ok: false as const, reason: "expired" as const };
  }

  // Mark current token revoked (rotated) and mint child.
  await env.DB.prepare(
    "UPDATE refresh_tokens SET revoked_at = ? WHERE id = ?",
  )
    .bind(nowIso(), row.id)
    .run();

  const next = await mintRefreshToken(env, {
    userId: row.user_id,
    sessionId: row.session_id,
    orgId: row.org_id,
    familyId: row.family_id,
    parentId: row.id,
  });

  return {
    ok: true as const,
    user_id: row.user_id,
    session_id: row.session_id,
    org_id: row.org_id,
    family_id: row.family_id,
    refresh: next,
  };
}

export async function revokeFamily(env: Env, familyId: string): Promise<number> {
  const when = nowIso();
  const result = await env.DB.prepare(
    `UPDATE refresh_tokens
     SET revoked_at = COALESCE(revoked_at, ?)
     WHERE family_id = ? AND revoked_at IS NULL`,
  )
    .bind(when, familyId)
    .run();
  return result.meta.changes ?? 0;
}

export async function revokeSessionTokens(env: Env, sessionId: string) {
  await env.DB.prepare(
    "UPDATE refresh_tokens SET revoked_at = ? WHERE session_id = ? AND revoked_at IS NULL",
  )
    .bind(nowIso(), sessionId)
    .run();
}

export async function revokeAllUserTokens(env: Env, userId: string) {
  await env.DB.prepare(
    "UPDATE refresh_tokens SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL",
  )
    .bind(nowIso(), userId)
    .run();
}
