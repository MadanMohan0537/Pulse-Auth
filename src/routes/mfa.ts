import { Hono } from "hono";
import { requireAuth, type AppEnv } from "../middleware/auth";
import {
  createTotpSecret,
  mintRecoveryCodes,
  verifyTotp,
} from "../lib/totp";
import { emitEvent } from "../lib/events";
import { jsonError, nowIso } from "../lib/util";
import type { UserRow } from "../types";

export const mfaRoutes = new Hono<AppEnv>();

mfaRoutes.use("*", requireAuth);

mfaRoutes.post("/enroll", async (c) => {
  const claims = c.get("user");
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(claims.sub)
    .first<UserRow>();
  if (!user) return jsonError(404, "not_found", "User not found");
  if (user.mfa_enabled) {
    return jsonError(409, "already_enabled", "MFA is already enabled");
  }

  const { secret, uri } = createTotpSecret(user.email, c.env.APP_NAME || "Pulse Auth");
  await c.env.DB.prepare(
    "UPDATE users SET mfa_secret = ?, updated_at = ? WHERE id = ?",
  )
    .bind(secret, nowIso(), user.id)
    .run();

  return c.json({
    secret,
    otpauth_url: uri,
    message: "Scan the otpauth URL with an authenticator app, then call /v1/mfa/confirm",
  });
});

mfaRoutes.post("/confirm", async (c) => {
  const claims = c.get("user");
  const body = await c.req.json<{ code?: string }>();
  if (!body.code) return jsonError(400, "invalid_request", "code is required");

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(claims.sub)
    .first<UserRow>();
  if (!user?.mfa_secret) {
    return jsonError(400, "not_enrolled", "Call /v1/mfa/enroll first");
  }
  if (!verifyTotp(user.mfa_secret, body.code)) {
    return jsonError(401, "invalid_mfa", "Invalid authenticator code");
  }

  const recovery = await mintRecoveryCodes();
  await c.env.DB.prepare(
    `UPDATE users SET mfa_enabled = 1, mfa_recovery_codes = ?, updated_at = ? WHERE id = ?`,
  )
    .bind(JSON.stringify(recovery.hashed), nowIso(), user.id)
    .run();

  await emitEvent(
    c.env,
    "user.mfa_enabled",
    { method: "totp" },
    { userId: user.id, orgId: claims.org_id },
  );

  return c.json({
    mfa_enabled: true,
    recovery_codes: recovery.plain,
    message: "Store these recovery codes securely. They will not be shown again.",
  });
});

mfaRoutes.post("/disable", async (c) => {
  const claims = c.get("user");
  const body = await c.req.json<{ code?: string }>();
  if (!body.code) return jsonError(400, "invalid_request", "code is required");

  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(claims.sub)
    .first<UserRow>();
  if (!user?.mfa_enabled || !user.mfa_secret) {
    return jsonError(400, "not_enabled", "MFA is not enabled");
  }
  if (!verifyTotp(user.mfa_secret, body.code)) {
    return jsonError(401, "invalid_mfa", "Invalid authenticator code");
  }

  await c.env.DB.prepare(
    `UPDATE users SET mfa_enabled = 0, mfa_secret = NULL, mfa_recovery_codes = NULL, updated_at = ? WHERE id = ?`,
  )
    .bind(nowIso(), user.id)
    .run();

  return c.json({ mfa_enabled: false });
});
