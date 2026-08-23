import { Hono } from "hono";
import type { AppEnv } from "../middleware/auth";
import { emitEvent } from "../lib/events";
import { issueSessionTokens } from "../lib/tokens";
import { id, jsonError, nowIso, randomToken, toPublicUser } from "../lib/util";
import type { MembershipRow, UserRow } from "../types";

export const githubRoutes = new Hono<AppEnv>();

githubRoutes.get("/start", async (c) => {
  const clientId = c.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return jsonError(
      501,
      "github_not_configured",
      "Set GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET in .dev.vars to enable GitHub OAuth.",
    );
  }

  const state = randomToken(24);
  const created = nowIso();
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();
  const redirectUri = `${c.env.ISSUER}/v1/oauth/github/callback`;

  await c.env.DB.prepare(
    `INSERT INTO oauth_states (state, code_verifier, redirect_uri, created_at, expires_at)
     VALUES (?, NULL, ?, ?, ?)`,
  )
    .bind(state, redirectUri, created, expires)
    .run();

  const url = new URL("https://github.com/login/oauth/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("scope", "read:user user:email");
  url.searchParams.set("state", state);

  return c.redirect(url.toString(), 302);
});

githubRoutes.get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const oauthError = c.req.query("error");

  if (oauthError) {
    return c.redirect(`/?error=${encodeURIComponent(oauthError)}`);
  }
  if (!code || !state) {
    return jsonError(400, "invalid_request", "Missing code or state");
  }

  const stored = await c.env.DB.prepare(
    "SELECT * FROM oauth_states WHERE state = ?",
  )
    .bind(state)
    .first<{
      state: string;
      redirect_uri: string;
      expires_at: string;
    }>();

  await c.env.DB.prepare("DELETE FROM oauth_states WHERE state = ?")
    .bind(state)
    .run();

  if (!stored || new Date(stored.expires_at).getTime() < Date.now()) {
    return jsonError(400, "invalid_state", "OAuth state is invalid or expired");
  }

  if (!c.env.GITHUB_CLIENT_ID || !c.env.GITHUB_CLIENT_SECRET) {
    return jsonError(501, "github_not_configured", "GitHub OAuth is not configured");
  }

  const tokenRes = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: c.env.GITHUB_CLIENT_ID,
      client_secret: c.env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: stored.redirect_uri,
    }),
  });
  const tokenJson = (await tokenRes.json()) as {
    access_token?: string;
    error?: string;
  };
  if (!tokenJson.access_token) {
    return jsonError(401, "oauth_failed", tokenJson.error || "GitHub token exchange failed");
  }

  const [profileRes, emailsRes] = await Promise.all([
    fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "pulse-auth",
      },
    }),
    fetch("https://api.github.com/user/emails", {
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "pulse-auth",
      },
    }),
  ]);

  const profile = (await profileRes.json()) as {
    id: number;
    login: string;
    name: string | null;
    email: string | null;
  };
  const emails = (await emailsRes.json()) as Array<{
    email: string;
    primary: boolean;
    verified: boolean;
  }>;

  const primary =
    emails.find((e) => e.primary && e.verified)?.email ||
    emails.find((e) => e.verified)?.email ||
    profile.email;

  if (!primary) {
    return jsonError(400, "email_required", "GitHub account has no verified email");
  }

  const githubId = String(profile.id);
  let user = await c.env.DB.prepare("SELECT * FROM users WHERE github_id = ?")
    .bind(githubId)
    .first<UserRow>();

  let createdNew = false;
  if (!user) {
    user = await c.env.DB.prepare("SELECT * FROM users WHERE email = ?")
      .bind(primary.toLowerCase())
      .first<UserRow>();
    if (user) {
      await c.env.DB.prepare(
        "UPDATE users SET github_id = ?, email_verified = 1, updated_at = ? WHERE id = ?",
      )
        .bind(githubId, nowIso(), user.id)
        .run();
      user.github_id = githubId;
    } else {
      const userId = id("usr");
      const orgId = id("org");
      const created = nowIso();
      const name = profile.name || profile.login;
      const slug = `gh-${profile.login.toLowerCase()}-${userId.slice(-6)}`;
      await c.env.DB.batch([
        c.env.DB.prepare(
          `INSERT INTO users (id, email, password_hash, name, github_id, mfa_enabled, mfa_secret, mfa_recovery_codes, email_verified, created_at, updated_at)
           VALUES (?, ?, NULL, ?, ?, 0, NULL, NULL, 1, ?, ?)`,
        ).bind(userId, primary.toLowerCase(), name, githubId, created, created),
        c.env.DB.prepare(
          `INSERT INTO organizations (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
        ).bind(orgId, slug, `${name}'s Workspace`, created, created),
        c.env.DB.prepare(
          `INSERT INTO memberships (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`,
        ).bind(id("mem"), orgId, userId, created),
      ]);
      user = (await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
        .bind(userId)
        .first()) as UserRow;
      createdNew = true;
      await emitEvent(
        c.env,
        "user.created",
        { email: user.email, name: user.name, provider: "github", org_id: orgId },
        { userId, orgId },
      );
    }
  }

  const membership = await c.env.DB.prepare(
    "SELECT * FROM memberships WHERE user_id = ? ORDER BY created_at ASC LIMIT 1",
  )
    .bind(user.id)
    .first<MembershipRow>();

  const tokens = await issueSessionTokens(c.env, user, {
    userAgent: c.req.header("user-agent"),
    ip: c.req.header("cf-connecting-ip") ?? c.req.header("x-forwarded-for"),
    orgId: membership?.org_id,
    role: membership?.role,
  });

  await emitEvent(
    c.env,
    "user.login",
    { method: "github", session_id: tokens.session_id, new_user: createdNew },
    { userId: user.id, orgId: membership?.org_id },
  );

  // Hand tokens to the browser UI via fragment-less query for the demo console.
  const redirect = new URL("/app", c.env.ISSUER);
  redirect.searchParams.set("access_token", tokens.access_token);
  redirect.searchParams.set("refresh_token", tokens.refresh_token);
  redirect.searchParams.set("expires_in", String(tokens.expires_in));
  redirect.searchParams.set("user", JSON.stringify(toPublicUser(user)));
  return c.redirect(redirect.toString(), 302);
});
