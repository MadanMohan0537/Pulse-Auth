-- Pulse Auth schema: users, MFA, refresh token families, multi-tenant RBAC, audit events

CREATE TABLE users (
  id TEXT PRIMARY KEY NOT NULL,
  email TEXT NOT NULL COLLATE NOCASE,
  password_hash TEXT,
  name TEXT NOT NULL,
  github_id TEXT,
  mfa_enabled INTEGER NOT NULL DEFAULT 0,
  mfa_secret TEXT,
  mfa_recovery_codes TEXT,
  email_verified INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (email),
  UNIQUE (github_id)
);

CREATE INDEX idx_users_email ON users (email);

CREATE TABLE organizations (
  id TEXT PRIMARY KEY NOT NULL,
  slug TEXT NOT NULL COLLATE NOCASE,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE (slug)
);

CREATE TABLE memberships (
  id TEXT PRIMARY KEY NOT NULL,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  created_at TEXT NOT NULL,
  UNIQUE (org_id, user_id),
  FOREIGN KEY (org_id) REFERENCES organizations (id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_memberships_user ON memberships (user_id);
CREATE INDEX idx_memberships_org ON memberships (org_id);

-- Refresh token families with rotation + reuse detection
CREATE TABLE refresh_tokens (
  id TEXT PRIMARY KEY NOT NULL,
  family_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  parent_id TEXT,
  session_id TEXT NOT NULL,
  org_id TEXT,
  reused_at TEXT,
  revoked_at TEXT,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_refresh_family ON refresh_tokens (family_id);
CREATE INDEX idx_refresh_user ON refresh_tokens (user_id);
CREATE INDEX idx_refresh_hash ON refresh_tokens (token_hash);

CREATE TABLE oauth_states (
  state TEXT PRIMARY KEY NOT NULL,
  code_verifier TEXT,
  redirect_uri TEXT,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE auth_events (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  user_id TEXT,
  org_id TEXT,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_auth_events_type ON auth_events (type);
CREATE INDEX idx_auth_events_created ON auth_events (created_at);
