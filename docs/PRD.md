# Pulse Auth — Product Requirements Document

## Problem

Every Pulse product needs authentication. Plugging in Auth0 or Firebase is fine for quick MVPs, but it hides the complexity of security, token management, multi-tenancy, and MFA. To build a production-grade platform, Pulse needs an owned identity foundation.

## Solution

A standalone OAuth2/OIDC service on Cloudflare Workers that issues and validates identity for all other Pulse services.

## Personas

### End user
- Signs up with email/password or GitHub
- Optionally enables TOTP MFA
- Manages active sessions across devices
- Belongs to one or more organizations

### Admin / org owner
- Creates and renames workspaces
- Invites members and assigns roles (admin / member / viewer)
- Revokes compromised sessions quickly
- Trusts that stolen refresh tokens cannot be silently reused

## Success metrics

| Metric | Intent |
| --- | --- |
| Login success rate | Reliability of the auth path |
| MFA adoption rate | Security posture of the user base |
| Token refresh success rate | Health of the session lifecycle |
| Time to revoke a compromised session | Incident response capability |

## Scope (v1)

- Email/password, GitHub OAuth, TOTP MFA
- JWT access tokens + rotating refresh tokens
- Refresh token reuse detection (family revoke)
- Multi-tenant organizations + RBAC
- Session management via Durable Objects
- `user.created` / `user.login` (and related) events to queue + audit table

## Out of scope (later)

- Magic links / WebAuthn
- SCIM / SAML enterprise SSO
- Fine-grained resource permissions beyond org RBAC
- Hosted email delivery for invites
