import { Hono } from "hono";
import { cors } from "hono/cors";
import type { AppEnv } from "./middleware/auth";
import { requireAuth } from "./middleware/auth";
import { authRoutes } from "./routes/auth";
import { mfaRoutes } from "./routes/mfa";
import { githubRoutes } from "./routes/github";
import { orgRoutes } from "./routes/orgs";
import { sessionRoutes } from "./routes/sessions";
import { oidcRoutes } from "./routes/oidc";
import { landingPage, loginPage, registerPage, appPage } from "./ui/pages";
import { toPublicUser } from "./lib/util";
import type { UserRow } from "./types";
export { SessionManager } from "./durable-objects/SessionManager";

const app = new Hono<AppEnv>();

app.use(
  "*",
  cors({
    origin: "*",
    allowHeaders: ["Authorization", "Content-Type"],
    allowMethods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
  }),
);

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "pulse-auth",
    issuer: c.env.ISSUER,
  }),
);

app.route("/", oidcRoutes);
app.route("/v1/auth", authRoutes);
app.route("/v1/mfa", mfaRoutes);
app.route("/v1/oauth/github", githubRoutes);
app.route("/v1/orgs", orgRoutes);
app.route("/v1/sessions", sessionRoutes);

app.get("/v1/me", requireAuth, async (c) => {
  const claims = c.get("user");
  const user = await c.env.DB.prepare("SELECT * FROM users WHERE id = ?")
    .bind(claims.sub)
    .first<UserRow>();
  if (!user) return c.json({ error: { code: "not_found", message: "User not found" } }, 404);
  return c.json({
    user: toPublicUser(user),
    session_id: claims.sid,
    org_id: claims.org_id ?? null,
    role: claims.role ?? null,
    scope: claims.scope,
  });
});

app.get("/", (c) => c.html(landingPage()));
app.get("/login", (c) => c.html(loginPage()));
app.get("/register", (c) => c.html(registerPage()));
app.get("/app", (c) => c.html(appPage()));

app.notFound((c) =>
  c.json({ error: { code: "not_found", message: "Route not found" } }, 404),
);

app.onError((err, c) => {
  console.error(err);
  return c.json(
    { error: { code: "internal_error", message: "Unexpected server error" } },
    500,
  );
});

export default app;
