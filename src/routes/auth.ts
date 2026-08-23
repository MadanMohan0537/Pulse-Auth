import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { hashPassword, validatePassword } from "../lib/password";
import { verifyPassword } from "../lib/password";
import { emitEvent } from "../lib/events";
import { issueSessionTokens } from "../lib/tokens";
import { rotateRefreshToken, revokeSessionTokens } from "../lib/refresh";
import { issueAccessToken } from "../lib/jwt";
import { id, jsonError, nowIso, toPublicUser } from "../lib/util";
import type { MembershipRow, UserRow } from "../types";
import { sessionStub } from "../durable-objects/SessionManager";
import { verifyTotp, consumeRecoveryCode } from "../lib/totp";

export const authRoutes = new Hono<AppEnv>();

authRoutes.post("/register", async (c) => {
  const body = await c.req.json<{
    email?: string;
    password?: string;
    name?: string;
    org_name?: string;
  }>();

  const email = body.email?.trim().toLowerCase();
  const password = body.password ?? "";
  const name = body.name?.trim();

  if (!email || !name) {
    return jsonError(400, "invalid_request", "email and name are required");
  }
  const pwErr = validatePassword(password);
  if (pwErr) return jsonError(400, "weak_password", pwErr);

  const existing = await c.env.DB.prepare(
    "SELECT id FROM users WHERE email = ?",
  )
    .bind(email)
    .first();
  if (existing) {
    return jsonError(409, "email_taken", "An account with that email already exists");
  }

  const userId = id("usr");
  const orgId = id("org");
  const membershipId = id("mem");
  const created = nowIso();
  const passwordHash = await hashPassword(password);
  const orgName = body.org_name?.trim() || `${name}'s Workspace`;
  const slugBase = orgName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
  const slug = `${slugBase || "org"}-${userId.slice(-6)}`;

  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO users (id, email, password_hash, name, github_id, mfa_enabled, mfa_secret, mfa_recovery_codes, email_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 0, NULL, NULL, 0, ?, ?)`,
    ).bind(userId, email, passwordHash, name, created, created),
    c.env.DB.prepare(
      `INSERT INTO organizations (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(orgId, slug, orgName, created, created),
    c.env.DB.prepare(
      `INSERT INTO memberships (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`,
    ).bind(membershipId, orgId, userId, created),
  ]);

  const user = (await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(userId)
    .first()) as UserRow;

  await emitEvent(
    c.env,
    "user.created",
    { email, name, org_id: orgId },
    { userId, orgId },
  );
  await emitEvent(
    c.env,
    "org.created",
    { slug, name: orgName },
    { userId, orgId },
  );

  const tokens = await issueSessionTokens(c.env, user, {
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
    orgId,
    role: "owner",
  });

  await emitEvent(
    c.env,
    "user.login",
    { method: "password", session_id: tokens.session_id },
    { userId, orgId },
  );

  return c.json(
    {
      user: toPublicUser(user),
      organization: { id: orgId, slug, name: orgName, role: "owner" },
      ...tokens,
    },
    201,
  );
});

authRoutes.post("/login", async (c) => {
  const body = await c.req.json<{
    email?: string;
    password?: string;
    mfa_code?: string;
    recovery_code?: string;
    org_id?: string;
  }>();

  const email = body.email?.trim().toLowerCase();
  if (!email || !body.password) {
    return jsonError(400, "invalid_request", "email and password are required");
  }

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
    .bind(email)
    .first<UserRow>();

  if (!user?.password_hash) {
    return jsonError(401, "invalid_credentials", "Invalid email or password");
  }

  const ok = await verifyPassword(body.password, user.password_hash);
  if (!ok) {
    return jsonError(401, "invalid_credentials", "Invalid email or password");
  }

  if (user.mfa_enabled) {
    if (!body.mfa_code && !body.recovery_code) {
      return c.json(
        {
          mfa_required: true,
          methods: ["totp", "recovery"],
          message: "Enter your authenticator code to finish signing in",
        },
        401,
      );
    }

    let mfaOk = false;
    if (body.mfa_code && user.mfa_secret) {
      mfaOk = verifyTotp(user.mfa_secret, body.mfa_code);
    } else if (body.recovery_code && user.mfa_recovery_codes) {
      const result = await consumeRecoveryCode(
        user.mfa_recovery_codes,
        body.recovery_code,
      );
      if (result.ok) {
        mfaOk = true;
        await c.env.DB.prepare(
          "UPDATE users SET mfa_recovery_codes = ?, updated_at = ? WHERE id = ?",
        )
          .bind(JSON.stringify(result.remaining), nowIso(), user.id)
          .run();
      }
    }

    if (!mfaOk) {
      return jsonError(401, "invalid_mfa", "Invalid MFA or recovery code");
    }
  }

  let orgId = body.org_id ?? null;
  let role: MembershipRow["role"] | undefined;
  if (orgId) {
    const membership = await c.env.DB.prepare(
      "SELECT * FROM memberships WHERE org_id = ? AND user_id = ?",
    )
      .bind(orgId, user.id)
      .first<MembershipRow>();
    if (!membership) {
      return jsonError(403, "not_a_member", "You are not a member of that organization");
    }
    role = membership.role;
  } else {
    const membership = await c.env.DB.prepare(
      "SELECT * FROM memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
    )
      .bind(user.id)
      .first<MembershipRow>();
    if (membership) {
      orgId = membership.org_id;
      role = membership.role;
    }
  }

  const tokens = await issueSessionTokens(c.env, user, {
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
    orgId,
    role,
  });

  await emitEvent(
    c.env,
    "user.login",
    { method: "password", session_id: tokens.session_id, mfa: Boolean(user.mfa_enabled) },
    { userId: user.id, orgId: orgId ?? undefined },
  );

  return c.json({ user: toPublicUser(user), ...tokens });
});

authRoutes.post("/refresh", async (c) => {
  const body = await c.req.json<{ refresh_token?: string }>();
  if (!body.refresh_token) {
    return jsonError(400, "invalid_request", "refresh_token is required");
  }

  const result = await rotateRefreshToken(c.env, body.refresh_token);
  if (!result.ok) {
    if (result.reason === "reuse_detected") {
      const stub = sessionStub(c.env, result.user_id);
      await stub.fetch("https://session/revoke-all", { method: "POST" });
      await emitEvent(
        c.env,
        "token.reuse_detected",
        { family_id: result.family_id, session_id: result.session_id },
        { userId: result.user_id },
      );
      return jsonError(
        401,
        "token_reuse_detected",
        "Refresh token reuse detected. All sessions in this family were revoked.",
      );
    }
    return jsonError(401, "invalid_grant", "Refresh token is invalid or expired");
  }

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(result.user_id)
    .first<UserRow>();
  if (!user) return jsonError(401, "invalid_grant", "User no longer exists");

  let role: MembershipRow["role"] | undefined;
  if (result.org_id) {
    const membership = await c.env.DB.prepare(
      "SELECT role FROM memberships WHERE org_id = ? AND user_id = ?",
    )
      .bind(result.org_id, user.id)
      .first<{ role: MembershipRow["role"] }>();
    role = membership?.role;
  }

  const access = await issueAccessToken(c.env, {
    sub: user.id,
    email: user.email,
    name: user.name,
    org_id: result.org_id ?? undefined,
    role,
    sid: result.session_id,
    scope: "openid profile email offline_access",
  });

  return c.json({
    token_type: "Bearer",
    access_token: access.token,
    expires_in: access.expires_in,
    refresh_token: result.refresh.refresh_token,
    session_id: result.session_id,
  });
});

authRoutes.post("/logout", async (c) => {
  const body = await c.req.json<{ refresh_token?: string; session_id?: string }>().catch(() => ({}));
  // Prefer authenticated logout when bearer present; otherwise refresh/session hint.
  const auth = c.req.header("Authorization");
  if (auth?.toLowerCase().startsWith("bearer ")) {
    try {
      const { verifyAccessToken } = await import("../lib/jwt");
      const claims = await verifyAccessToken(c.env, auth.slice(7).trim());
      await revokeSessionTokens(c.env, claims.sid);
      const stub = sessionStub(c.env, claims.sub);
      await stub.fetch("https://session/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: claims.sid }),
      });
      await emitEvent(
        c.env,
        "user.logout",
        { session_id: claims.sid },
        { userId: claims.sub, orgId: claims.org_id },
      );
      return c.json({ ok: true });
    } catch {
      // fall through
    }
  }

  if (body.session_id && body.refresh_token) {
    const rotated = await rotateRefreshToken(c.env, body.refresh_token);
    if (rotated.ok) {
      await revokeSessionTokens(c.env, rotated.session_id);
      const stub = sessionStub(c.env, rotated.user_id);
      await stub.fetch("https://session/revoke", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sessionId: rotated.session_id }),
      });
    }
  }

  return c.json({ ok: true });
});
