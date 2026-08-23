import { Hono } from "hono";
import { requireAuth, type AppEnv } from "../middleware/auth";
import { can, permissionsFor, type Permission } from "../lib/rbac";
import { emitEvent } from "../lib/events";
import { id, jsonError, nowIso } from "../lib/util";
import type { MembershipRow, OrgRow, Role } from "../types";

export const orgRoutes = new Hono<AppEnv>();

orgRoutes.use("*", requireAuth);

async function getMembership(env: AppEnv["Bindings"], orgId: string, userId: string) {
  return env.DB.prepare(
    "SELECT * FROM memberships WHERE org_id = ? AND user_id = ?",
  )
    .bind(orgId, userId)
    .first<MembershipRow>();
}

function forbid(permission: Permission) {
  return jsonError(403, "forbidden", `Missing permission: ${permission}`);
}

orgRoutes.get("/", async (c) => {
  const claims = c.get("user");
  const rows = await c.env.DB.prepare(
    `SELECT o.id, o.slug, o.name, o.created_at, m.role
     FROM organizations o
     JOIN memberships m ON m.org_id = o.id
     WHERE m.user_id = ?
     ORDER BY o.created_at ASC`,
  )
    .bind(claims.sub)
    .all();
  return c.json({ organizations: rows.results ?? [] });
});

orgRoutes.post("/", async (c) => {
  const claims = c.get("user");
  const body = await c.req.json<{ name?: string; slug?: string }>();
  const name = body.name?.trim();
  if (!name) return jsonError(400, "invalid_request", "name is required");

  const slug =
    body.slug?.trim().toLowerCase() ||
    `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}-${id("x").slice(-4)}`;

  const taken = await c.env.DB.prepare(
    "SELECT id FROM organizations WHERE slug = ?",
  )
    .bind(slug)
    .first();
  if (taken) return jsonError(409, "slug_taken", "Organization slug already exists");

  const orgId = id("org");
  const created = nowIso();
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO organizations (id, slug, name, created_at, updated_at) VALUES (?, ?, ?, ?, ?)`,
    ).bind(orgId, slug, name, created, created),
    c.env.DB.prepare(
      `INSERT INTO memberships (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, 'owner', ?)`,
    ).bind(id("mem"), orgId, claims.sub, created),
  ]);

  await emitEvent(
    c.env,
    "org.created",
    { slug, name },
    { userId: claims.sub, orgId },
  );

  return c.json({ id: orgId, slug, name, role: "owner" }, 201);
});

orgRoutes.get("/:orgId", async (c) => {
  const claims = c.get("user");
  const orgId = c.req.param("orgId");
  const membership = await getMembership(c.env, orgId, claims.sub);
  if (!membership || !can(membership.role, "org:read")) return forbid("org:read");

  const org = await c.env.DB.prepare("SELECT * FROM organizations WHERE id = ?")
    .bind(orgId)
    .first<OrgRow>();
  if (!org) return jsonError(404, "not_found", "Organization not found");

  return c.json({
    ...org,
    role: membership.role,
    permissions: permissionsFor(membership.role),
  });
});

orgRoutes.patch("/:orgId", async (c) => {
  const claims = c.get("user");
  const orgId = c.req.param("orgId");
  const membership = await getMembership(c.env, orgId, claims.sub);
  if (!membership || !can(membership.role, "org:update")) return forbid("org:update");

  const body = await c.req.json<{ name?: string }>();
  if (!body.name?.trim()) {
    return jsonError(400, "invalid_request", "name is required");
  }

  await c.env.DB.prepare(
    "UPDATE organizations SET name = ?, updated_at = ? WHERE id = ?",
  )
    .bind(body.name.trim(), nowIso(), orgId)
    .run();

  return c.json({ ok: true });
});

orgRoutes.get("/:orgId/members", async (c) => {
  const claims = c.get("user");
  const orgId = c.req.param("orgId");
  const membership = await getMembership(c.env, orgId, claims.sub);
  if (!membership || !can(membership.role, "members:read")) {
    return forbid("members:read");
  }

  const rows = await c.env.DB.prepare(
    `SELECT m.id, m.role, m.created_at, u.id AS user_id, u.email, u.name
     FROM memberships m
     JOIN users u ON u.id = m.user_id
     WHERE m.org_id = ?
     ORDER BY m.created_at ASC`,
  )
    .bind(orgId)
    .all();

  return c.json({ members: rows.results ?? [] });
});

orgRoutes.post("/:orgId/members", async (c) => {
  const claims = c.get("user");
  const orgId = c.req.param("orgId");
  const membership = await getMembership(c.env, orgId, claims.sub);
  if (!membership || !can(membership.role, "members:invite")) {
    return forbid("members:invite");
  }

  const body = await c.req.json<{ email?: string; role?: Role }>();
  const email = body.email?.trim().toLowerCase();
  const role: Role = body.role ?? "member";
  if (!email) return jsonError(400, "invalid_request", "email is required");
  if (!["admin", "member", "viewer"].includes(role)) {
    return jsonError(400, "invalid_role", "role must be admin, member, or viewer");
  }

  const user = await c.env.DB.prepare("SELECT id, email, name FROM users WHERE email = ?")
    .bind(email)
    .first<{ id: string; email: string; name: string }>();
  if (!user) {
    return jsonError(404, "user_not_found", "Invitee must already have a Pulse account");
  }

  const existing = await getMembership(c.env, orgId, user.id);
  if (existing) return jsonError(409, "already_member", "User is already a member");

  await c.env.DB.prepare(
    `INSERT INTO memberships (id, org_id, user_id, role, created_at) VALUES (?, ?, ?, ?, ?)`,
  )
    .bind(id("mem"), orgId, user.id, role, nowIso())
    .run();

  await emitEvent(
    c.env,
    "org.member_added",
    { email, role },
    { userId: claims.sub, orgId },
  );

  return c.json({ ok: true, user_id: user.id, role }, 201);
});

orgRoutes.patch("/:orgId/members/:userId", async (c) => {
  const claims = c.get("user");
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");
  const membership = await getMembership(c.env, orgId, claims.sub);
  if (!membership || !can(membership.role, "members:role")) {
    return forbid("members:role");
  }

  const body = await c.req.json<{ role?: Role }>();
  if (!body.role || !["admin", "member", "viewer"].includes(body.role)) {
    return jsonError(400, "invalid_role", "role must be admin, member, or viewer");
  }

  const target = await getMembership(c.env, orgId, targetUserId);
  if (!target) return jsonError(404, "not_found", "Membership not found");
  if (target.role === "owner") {
    return jsonError(400, "immutable_owner", "Cannot change the owner role");
  }

  await c.env.DB.prepare(
    "UPDATE memberships SET role = ? WHERE org_id = ? AND user_id = ?",
  )
    .bind(body.role, orgId, targetUserId)
    .run();

  return c.json({ ok: true, role: body.role });
});

orgRoutes.delete("/:orgId/members/:userId", async (c) => {
  const claims = c.get("user");
  const orgId = c.req.param("orgId");
  const targetUserId = c.req.param("userId");
  const membership = await getMembership(c.env, orgId, claims.sub);
  if (!membership || !can(membership.role, "members:remove")) {
    return forbid("members:remove");
  }

  const target = await getMembership(c.env, orgId, targetUserId);
  if (!target) return jsonError(404, "not_found", "Membership not found");
  if (target.role === "owner") {
    return jsonError(400, "immutable_owner", "Cannot remove the organization owner");
  }

  await c.env.DB.prepare(
    "DELETE FROM memberships WHERE org_id = ? AND user_id = ?",
  )
    .bind(orgId, targetUserId)
    .run();

  return c.json({ ok: true });
});
