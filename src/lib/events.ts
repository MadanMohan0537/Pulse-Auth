import type { Env } from "../types";
import { id, nowIso } from "./util";

export type AuthEventType =
  | "user.created"
  | "user.login"
  | "user.logout"
  | "user.mfa_enabled"
  | "session.revoked"
  | "token.reuse_detected"
  | "org.created"
  | "org.member_added";

export async function emitEvent(
  env: Env,
  type: AuthEventType,
  payload: Record<string, unknown>,
  opts?: { userId?: string; orgId?: string },
) {
  const event = {
    id: id("evt"),
    type,
    user_id: opts?.userId ?? null,
    org_id: opts?.orgId ?? null,
    payload: JSON.stringify(payload),
    created_at: nowIso(),
  };

  await env.DB.prepare(
    "INSERT INTO auth_events (id, type, user_id, org_id, payload, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(
      event.id,
      event.type,
      event.user_id,
      event.org_id,
      event.payload,
      event.created_at,
    )
    .run();

  if (env.AUTH_EVENTS) {
    try {
      await env.AUTH_EVENTS.send({
        id: event.id,
        type: event.type,
        user_id: event.user_id,
        org_id: event.org_id,
        payload,
        created_at: event.created_at,
      });
    } catch (err) {
      console.warn("AUTH_EVENTS queue send failed; event persisted to D1", err);
    }
  }

  return event;
}
