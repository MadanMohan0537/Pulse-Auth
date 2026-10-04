# Pulse Auth

**Standalone OAuth2 / OIDC identity for the Pulse platform** — email/password, GitHub OAuth, TOTP MFA, rotating refresh tokens with reuse detection, multi-tenant RBAC, and Durable Object sessions — all on Cloudflare Workers.

[![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-F38020?logo=cloudflare&logoColor=white)](https://workers.cloudflare.com/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

> Every other Pulse service (dashboards, feature flags, analytics, notifications) validates JWTs issued here. Auth events like `user.created` and `user.login` flow to a queue that feeds analytics and notifications.

---

## Verify the security workflow locally

After migrations and startup, register a test account, inspect its sessions, rotate a refresh token and confirm that reuse of the old token revokes the family. Enable MFA with a test authenticator and keep the returned recovery codes. Use disposable credentials during development.

```bash
npm run typecheck
npm test
```

These commands check types and the configured Vitest suite. They do not constitute a production security audit. Before deployment, review issuer settings, secret management, database migrations, OAuth callbacks, event retention and account-recovery behavior for your application.

For implementation review, begin with [JWT handling](src/lib/jwt.ts), [routes](src/routes/) and [migrations](migrations/).

## Why I built this

Every product needs authentication. Most developers plug in Auth0 or Firebase — fine for quick MVPs, but it hides the complexity of security, token management, multi-tenancy, and MFA.

To build a **production-grade platform**, I wanted to understand and control this foundation myself: token lifecycle, session revocation, org isolation, and edge constraints on Cloudflare Workers (no long-lived connections; Durable Objects for state).

## What problem it solves

Pulse Auth is the identity backbone for Pulse. Without it, nothing else works — every service needs identity and permissions. It gives you:

| Capability | Detail |
| --- | --- |
| **Sign-in** | Email/password (PBKDF2), GitHub OAuth, TOTP MFA + recovery codes |
| **Tokens** | RS256 JWT access tokens · rotating refresh tokens |
| **Hardening** | Refresh **reuse detection** revokes the entire token family |
| **Tenancy** | Organizations + RBAC (`owner` / `admin` / `member` / `viewer`) |
| **Sessions** | Per-user Durable Object store (create / touch / revoke) |
| **OIDC** | Discovery document + JWKS for other Pulse services |
| **Events** | `user.created`, `user.login`, `token.reuse_detected`, … → D1 + Queue |

## Why this is advanced

- **Token rotation + reuse detection** — the same class of control used by Google, Auth0, and other mature IdPs. If a stolen refresh token is replayed after rotation, the whole family is revoked and sessions are cleared.
- **Multi-tenant RBAC** — careful data isolation and permission checks per organization.
- **Edge-native design** — Workers + D1 + SQLite-backed Durable Objects, built for Cloudflare’s constraints rather than a classic always-on Node server.

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
2. Every `POST /v1/auth/refresh` **revokes** the presented token and mints a child.
3. If that revoked parent is presented again, the **whole family is revoked**, Durable Object sessions for the user are cleared, and `token.reuse_detected` is emitted.

## Product angle

See [`docs/PRD.md`](./docs/PRD.md) for personas (end user, admin) and success metrics:

- Login success rate  
- MFA adoption rate  
- Token refresh success rate  
- Time to revoke a compromised session  

## Quick start

**Requirements:** Node.js 20+, npm

```bash
git clone https://github.com/MadanMohan0537/Pulse-Auth.git
cd Pulse-Auth
npm install
cp .dev.vars.example .dev.vars
# Edit .dev.vars — set a long JWT_SECRET (GitHub OAuth vars are optional)

npm run db:migrate:local
npm run dev
```

Open **http://127.0.0.1:4545** for the console (register, sign-in, sessions, MFA).

> Events always persist to the `auth_events` D1 table. The `AUTH_EVENTS` queue binding is used when available (including local Wrangler simulation).

### Optional: GitHub OAuth

1. Create a GitHub OAuth App.  
2. Callback URL: `http://127.0.0.1:4545/v1/oauth/github/callback`  
3. Set `GITHUB_CLIENT_ID` and `GITHUB_CLIENT_SECRET` in `.dev.vars`.

## API surface

### Auth

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/v1/auth/register` | Create user + owner workspace, return tokens |
| `POST` | `/v1/auth/login` | Password login (`mfa_required` when MFA is on) |
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
| `GET` / `POST` | `/v1/orgs` | List / create organizations |
| `GET` / `PATCH` | `/v1/orgs/:id` | Read / update (permission-gated) |
| `*` | `/v1/orgs/:id/members` | List / invite / change role / remove |
| `GET` / `DELETE` | `/v1/sessions` | List or revoke sessions |
| `GET` | `/v1/me` | Current user + org context |

### Discovery

| Method | Path |
| --- | --- |
| `GET` | `/.well-known/openid-configuration` |
| `GET` | `/.well-known/jwks.json` |
| `GET` | `/health` |

### Examples

```bash
# Register
curl -s http://127.0.0.1:4545/v1/auth/register \
  -H 'content-type: application/json' \
  -d '{"email":"you@example.com","password":"CorrectHorse1","name":"You"}' | jq

# Refresh (rotation)
curl -s http://127.0.0.1:4545/v1/auth/refresh \
  -H 'content-type: application/json' \
  -d '{"refresh_token":"<token>"}' | jq

# Current user
curl -s http://127.0.0.1:4545/v1/me \
  -H "Authorization: Bearer <access_token>" | jq
```

## RBAC

| Permission | viewer | member | admin | owner |
| --- | --- | --- | --- | --- |
| `org:read` | ✓ | ✓ | ✓ | ✓ |
| `org:update` |  |  | ✓ | ✓ |
| `org:delete` |  |  |  | ✓ |
| `members:*` | read | read | full | full |
| `billing:*` |  |  | read | full |

## Deploy to Cloudflare

```bash
npx wrangler login
npx wrangler d1 create pulse-auth
# Paste database_id into wrangler.jsonc

npx wrangler queues create pulse-auth-events
npx wrangler d1 migrations apply pulse-auth --remote
npx wrangler secret put JWT_SECRET
# optional:
npx wrangler secret put GITHUB_CLIENT_SECRET

# Set production ISSUER / GITHUB_CLIENT_ID in wrangler.jsonc or the dashboard
npm run deploy
```

## Project layout

```
src/
  index.ts              # Hono app entry
  durable-objects/      # SessionManager (SQLite Durable Object)
  lib/                  # password, jwt, refresh, totp, rbac, events
  routes/               # auth, mfa, github, orgs, sessions, oidc
  ui/                   # Landing + session console
migrations/             # D1 SQL migrations
docs/PRD.md             # Product requirements & metrics
```

## Tech stack

- **Runtime:** Cloudflare Workers  
- **Router:** Hono  
- **Data:** D1 (users, orgs, refresh families), Durable Objects (sessions)  
- **Crypto:** Web Crypto + `jose` (RS256 JWT), `otpauth` (TOTP)  
- **Messaging:** Cloudflare Queues (`AUTH_EVENTS`)

## Tests

```bash
npm test
```

## License

MIT © [Madan Mohan](https://github.com/MadanMohan0537)
