import type { Role } from "../types";

const RANK: Record<Role, number> = {
  viewer: 1,
  member: 2,
  admin: 3,
  owner: 4,
};

export type Permission =
  | "org:read"
  | "org:update"
  | "org:delete"
  | "members:read"
  | "members:invite"
  | "members:remove"
  | "members:role"
  | "billing:read"
  | "billing:manage";

const ROLE_PERMS: Record<Role, Permission[]> = {
  viewer: ["org:read", "members:read"],
  member: ["org:read", "members:read"],
  admin: [
    "org:read",
    "org:update",
    "members:read",
    "members:invite",
    "members:remove",
    "members:role",
    "billing:read",
  ],
  owner: [
    "org:read",
    "org:update",
    "org:delete",
    "members:read",
    "members:invite",
    "members:remove",
    "members:role",
    "billing:read",
    "billing:manage",
  ],
};

export function can(role: Role, permission: Permission): boolean {
  return ROLE_PERMS[role].includes(permission);
}

export function assertCan(role: Role, permission: Permission): void {
  if (!can(role, permission)) {
    throw new Error(`Forbidden: missing permission ${permission}`);
  }
}

export function roleAtLeast(role: Role, minimum: Role): boolean {
  return RANK[role] >= RANK[minimum];
}

export function permissionsFor(role: Role): Permission[] {
  return ROLE_PERMS[role];
}
