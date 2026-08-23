export type Role = "owner" | "admin" | "member" | "viewer";

export type Env = {
  DB: D1Database;
  SESSION_MANAGER: DurableObjectNamespace;
  AUTH_EVENTS?: Queue;
  JWT_SECRET: string;
  ISSUER: string;
  ACCESS_TOKEN_TTL_SECONDS: string;
  REFRESH_TOKEN_TTL_SECONDS: string;
  GITHUB_CLIENT_ID: string;
  GITHUB_CLIENT_SECRET: string;
  APP_NAME: string;
};

export type UserRow = {
  id: string;
  email: string;
  password_hash: string | null;
  name: string;
  github_id: string | null;
  mfa_enabled: number;
  mfa_secret: string | null;
  mfa_recovery_codes: string | null;
  email_verified: number;
  created_at: string;
  updated_at: string;
};

export type OrgRow = {
  id: string;
  slug: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type MembershipRow = {
  id: string;
  org_id: string;
  user_id: string;
  role: Role;
  created_at: string;
};

export type RefreshTokenRow = {
  id: string;
  family_id: string;
  user_id: string;
  token_hash: string;
  parent_id: string | null;
  session_id: string;
  org_id: string | null;
  reused_at: string | null;
  revoked_at: string | null;
  expires_at: string;
  created_at: string;
};

export type AccessTokenClaims = {
  sub: string;
  email: string;
  name: string;
  org_id?: string;
  role?: Role;
  sid: string;
  scope: string;
};

export type PublicUser = {
  id: string;
  email: string;
  name: string;
  mfa_enabled: boolean;
  email_verified: boolean;
  created_at: string;
};
