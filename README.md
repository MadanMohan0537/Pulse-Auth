# Pulse Auth

Standalone **OAuth2 / OIDC** identity service for the Pulse platform — built on Cloudflare Workers, D1, Durable Objects, and Queues.

Other Pulse services (dashboards, feature flags, analytics, notifications) validate JWT access tokens issued here. Auth events such as `user.created` and `user.login` are persisted and published to a queue for downstream consumers.

## Why this exists

Most teams bolt on Auth0 or Firebase for MVPs. That works — and hides the hard parts. Pulse Auth is the foundation layer I wanted to **own**: token lifecycle, multi-tenancy, MFA, and session revocation under edge constraints.

## Features

| Area | What you get |
| --- | --- |
| Sign-in | Email/password (PBKDF2), GitHub OAuth, TOTP MFA + recovery codes |
| Tokens | RS256 JWT access tokens · rotating refresh tokens |
| Hardening | Refresh **reuse detection** revokes the entire token family |
| Tenancy | Organizations + RBAC (`owner` / `admin` / `member` / `viewer`) |
| Sessions | Per-user **Durable Object** session store (create / touch / revoke) |
| OIDC | `/.well-known/openid-configuration` + JWKS |
| Events | `user.created`, `user.login`, `token.reuse_detected`, … → D1 + Queue |

## Architecture

```
┌─────────────┐     JWT / refresh      ┌──────────────────────┐
│ Pulse apps  │ ─────────────────────► │  pulse-auth Worker   │
└─────────────┘                        │  Hono routes         │
                                       └─────────┬────────────┘
                    ┌────────────────────────────┼────────────────────────┐
                    ▼                            ▼                        ▼
              ┌──────────┐            ┌──────────────────┐      ┌─────────────────┐
              │ D1       │            │ SessionManager DO│      │ AUTH_EVENTS     │
              │ users,   │            │ (SQLite / user)  │      │ Queue (+ D1 log)│
              │ orgs,    │            └──────────────────┘      └─────────────────┘
              │ refresh  │
              │ families │
              └──────────┘
```

### Refresh rotation & reuse detection

1. Each login creates a **refresh token family**.
2. Every `/v1/auth/refresh` **revokes** the presented token and mints a child.
3. If a revoked token is presented again (theft + race), the **whole family is revoked**, all Durable Object sessions for that user are cleared, and `token.reuse_detected` is emitted.

This is the same class of control used by mature IdPs (Auth0, Google, etc.).

## Quick start

### Prerequisites

- Node.js 20+
- npm

### Install & run locally

```bash
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars — JWT_SECRET is required; GitHub vars are optional

npm run db:migrate:local
npm run dev
```

Open **[http://127.0.0.1:4545](http://127.0.0.1:4545)** for the branded console (register / sign-in / sessions / MFA).

> Queues: local `wrangler dev` will attempt to bind `AUTH_EVENTS`. If the queue producer is unavailable, events still land in the `auth_events` D1 table.

### Optional: GitHub OAuth

1. Create a GitHub OAuth App.
2. Set callback URL to `http://127.0.0.1:4545/v1/oauth/github/callback`.
3. Put `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.dev.vars`.

## API surface

### Auth

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/v1/auth/register` | Create user + owner workspace, return tokens |
| `POST` | `/v1/auth/login` | Password login (returns `mfa_required` when needed) |
| `POST` | `/v1/auth/refresh` | Rotate refresh token; reuse → family revoke |
| `POST` | `/v1/auth/logout` | Revoke current session |
| `GET` | `/v1/oauth/github/start` | Begin GitHub OAuth |
| `GET` | `/v1/oauth/github/callback` | OAuth callback |

### MFA

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/v1/mfa/enroll` | Create TOTP secret + `otpauth://` URL |
| `POST` | `/v1/mfa/confirm` | Verify code, enable MFA, return recovery codes |
| `POST` | `/v1/mfa/disable` | Disable MFA with a valid TOTP |

### Tenancy & sessions

| Method | Path | Description |
| --- | --- | --- |
| `GET/POST` | `/v1/orgs` | List / create organizations |
| `GET/PATCH` | `/v1/orgs/:id` | Read / update (permission-gated) |
| `*` | `/v1/orgs/:id/members` | List / invite / role change / remove |
| `GET/DELETE` | `/v1/sessions` | List or revoke sessions |
| `GET` | `/v1/me` | Current user + org context |

### Discovery

| Method | Path |
| --- | --- |
| `GET` | `/.well-known/openid-configuration` |
| `GET` | `/.well-known/jwks.json` |
| `GET` | `/health` |

### Example: register

```bash
curl -s http://127.0.0.1:4545/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"CorrectHorse1","name":"You"}' | jq
```

### Example: refresh

```bash
curl -s http://127.0.0.1:4545/v1/auth/refresh \
  -H 'content-type: application/json' \
  -d '{"refresh_token":"<token>"}' | jq
```

## RBAC

| Permission | viewer | member | admin | owner |
| --- | --- | --- | --- | --- |
| `org:read` | ✓ | ✓ | ✓ | ✓ |
| `org:update` |  |  | ✓ | ✓ |
| `org:delete` |  |  |  | ✓ |
| `members:*` | read | read | full | full |
| `billing:*` |  |  | read | full |

## Product metrics (from the PRD)

Tracked conceptually via `auth_events` (and the queue):

- Login success rate  
- MFA adoption rate (`user.mfa_enabled` / active users)  
- Token refresh success rate  
- Time to revoke a compromised session (DO revoke + refresh family revoke)

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler d1 create pulse-auth
# Paste the database_id into wrangler.jsonc

npx wrangler queues create pulse-auth-events
npx wrangler d1 migrations apply pulse-auth --remote
npx wrangler secret put JWT_SECRET
# optional:
npx wrangler secret put GITHUB_CLIENT_SECRET

# Set ISSUER / GITHUB_CLIENT_ID vars for production in wrangler.jsonc or the dashboard
npm run deploy
```

## Project layout

```
src/
  index.ts                 # Hono app
  durable-objects/         # SessionManager (SQLite DO)
  lib/                     # password, jwt, refresh, totp, rbac, events
  routes/                  # auth, mfa, github, orgs, sessions, oidc
  ui/                      # Landing + console pages
migrations/                # D1 SQL migrations
```

## Tests

```bash
npm test
```

## License

MIT
