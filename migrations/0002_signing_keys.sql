-- Signing keys for RS256 access tokens (JWKS)

CREATE TABLE signing_keys (
  kid TEXT PRIMARY KEY NOT NULL,
  private_jwk TEXT NOT NULL,
  public_jwk TEXT NOT NULL,
  created_at TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1
);
