function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const css = `
:root {
  --bg0: #0b1214;
  --bg1: #122024;
  --ink: #e8f2f0;
  --muted: #8aa3a0;
  --line: rgba(232, 242, 240, 0.12);
  --accent: #2ec4b6;
  --accent-2: #f4a261;
  --danger: #e76f51;
  --ok: #2a9d8f;
  --font-display: "Fraunces", Georgia, serif;
  --font-body: "Sora", "Segoe UI", sans-serif;
}
* { box-sizing: border-box; }
html, body { margin: 0; min-height: 100%; }
body {
  font-family: var(--font-body);
  color: var(--ink);
  background:
    radial-gradient(1200px 600px at 10% -10%, rgba(46, 196, 182, 0.18), transparent 55%),
    radial-gradient(900px 500px at 100% 0%, rgba(244, 162, 97, 0.12), transparent 50%),
    linear-gradient(160deg, var(--bg0), var(--bg1) 55%, #0a1012);
  background-attachment: fixed;
}
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.shell { width: min(1080px, calc(100% - 2rem)); margin: 0 auto; }
.nav {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.25rem 0 0.5rem;
}
.brand {
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 1.35rem;
  letter-spacing: -0.02em;
}
.brand span { color: var(--accent); }
.hero {
  min-height: calc(100vh - 5rem);
  display: grid;
  align-items: center;
  grid-template-columns: 1.1fr 0.9fr;
  gap: 2.5rem;
  padding: 2rem 0 3rem;
}
@media (max-width: 860px) {
  .hero { grid-template-columns: 1fr; min-height: auto; padding-top: 1rem; }
}
.hero h1 {
  font-family: var(--font-display);
  font-weight: 550;
  font-size: clamp(2.4rem, 5vw, 4rem);
  line-height: 1.05;
  margin: 0.35rem 0 1rem;
  letter-spacing: -0.03em;
}
.lede { color: var(--muted); font-size: 1.05rem; max-width: 34rem; line-height: 1.55; }
.cta { display: flex; gap: 0.75rem; flex-wrap: wrap; margin-top: 1.75rem; }
.btn {
  appearance: none; border: 0; cursor: pointer;
  font: inherit; font-weight: 600; border-radius: 999px;
  padding: 0.75rem 1.2rem; transition: transform .2s ease, background .2s ease, color .2s ease;
}
.btn:hover { transform: translateY(-1px); }
.btn-primary { background: var(--accent); color: #06201d; }
.btn-ghost { background: transparent; color: var(--ink); border: 1px solid var(--line); }
.panel {
  border: 1px solid var(--line);
  background: rgba(8, 16, 18, 0.55);
  backdrop-filter: blur(10px);
  border-radius: 1.25rem;
  padding: 1.25rem;
  animation: rise .7s ease both;
}
@keyframes rise {
  from { opacity: 0; transform: translateY(12px); }
  to { opacity: 1; transform: none; }
}
@keyframes pulse-line {
  0%, 100% { opacity: .35; }
  50% { opacity: 1; }
}
.viz {
  display: grid; gap: .7rem;
}
.viz .row {
  display: flex; justify-content: space-between; gap: 1rem;
  padding: .7rem .85rem; border-radius: .8rem;
  border: 1px solid var(--line); color: var(--muted); font-size: .92rem;
}
.viz .row strong { color: var(--ink); font-weight: 600; }
.viz .accent-row { border-color: rgba(46,196,182,.45); animation: pulse-line 2.4s ease infinite; }
.form {
  width: min(420px, 100%);
  margin: 2.5rem auto 3rem;
  display: grid; gap: .85rem;
  animation: rise .55s ease both;
}
.form h1 {
  font-family: var(--font-display);
  font-size: 2rem; margin: 0 0 .25rem; letter-spacing: -0.02em;
}
label { display: grid; gap: .35rem; font-size: .9rem; color: var(--muted); }
input, select {
  font: inherit; color: var(--ink);
  background: rgba(255,255,255,0.03);
  border: 1px solid var(--line);
  border-radius: .7rem;
  padding: .75rem .85rem;
}
input:focus, select:focus {
  outline: 2px solid rgba(46,196,182,.35); border-color: rgba(46,196,182,.55);
}
.err { color: var(--danger); font-size: .9rem; min-height: 1.2rem; }
.ok { color: var(--ok); font-size: .9rem; }
.muted { color: var(--muted); }
.app-grid {
  display: grid; gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  margin: 1.5rem 0 3rem;
}
.mono { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .82rem; word-break: break-all; }
.section-title {
  font-family: var(--font-display);
  font-size: 1.35rem; margin: 0 0 .35rem;
}
`;

function layout(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} · Pulse Auth</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=Sora:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>${css}</style>
</head>
<body>
  <div class="shell">
    <nav class="nav">
      <a class="brand" href="/">Pulse <span>Auth</span></a>
      <div>
        <a href="/login">Sign in</a>
        &nbsp;·&nbsp;
        <a href="/register">Create account</a>
      </div>
    </nav>
    ${body}
  </div>
</body>
</html>`;
}

export function landingPage(): string {
  return layout(
    "Identity for Pulse",
    `<section class="hero">
      <div>
        <p class="muted" style="letter-spacing:.08em;text-transform:uppercase;font-size:.75rem;margin:0">Pulse platform foundation</p>
        <h1>Pulse Auth</h1>
        <p class="lede">Production-minded OAuth2/OIDC on Cloudflare Workers — email login, GitHub, TOTP MFA, rotating refresh tokens with reuse detection, multi-tenant RBAC, and Durable Object sessions.</p>
        <div class="cta">
          <a class="btn btn-primary" href="/register">Create an account</a>
          <a class="btn btn-ghost" href="/login">Sign in</a>
          <a class="btn btn-ghost" href="/.well-known/openid-configuration">OIDC discovery</a>
        </div>
      </div>
      <aside class="panel viz" aria-label="Security flow">
        <div class="row"><span>Access token</span><strong>RS256 · 15m</strong></div>
        <div class="row accent-row"><span>Refresh rotation</span><strong>family revoke on reuse</strong></div>
        <div class="row"><span>Sessions</span><strong>Durable Objects</strong></div>
        <div class="row"><span>Tenancy</span><strong>org RBAC</strong></div>
        <div class="row"><span>Events</span><strong>user.created · user.login</strong></div>
      </aside>
    </section>`,
  );
}

export function registerPage(): string {
  return layout(
    "Create account",
    `<form class="form panel" id="form">
      <div>
        <h1>Create account</h1>
        <p class="muted">Starts a personal workspace you own.</p>
      </div>
      <label>Name<input name="name" required autocomplete="name" /></label>
      <label>Email<input name="email" type="email" required autocomplete="email" /></label>
      <label>Password<input name="password" type="password" required minlength="10" autocomplete="new-password" /></label>
      <label>Workspace name<input name="org_name" placeholder="Optional" /></label>
      <div class="err" id="err"></div>
      <button class="btn btn-primary" type="submit">Create account</button>
      <p class="muted">Already have an account? <a href="/login">Sign in</a></p>
    </form>
    <script>
      const form = document.getElementById('form');
      const err = document.getElementById('err');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        const data = Object.fromEntries(new FormData(form).entries());
        const res = await fetch('/v1/auth/register', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (!res.ok) {
          err.textContent = json.error?.message || 'Registration failed';
          return;
        }
        localStorage.setItem('pulse_tokens', JSON.stringify(json));
        location.href = '/app';
      });
    </script>`,
  );
}

export function loginPage(): string {
  return layout(
    "Sign in",
    `<form class="form panel" id="form">
      <div>
        <h1>Sign in</h1>
        <p class="muted">Email/password, optional TOTP, or GitHub.</p>
      </div>
      <label>Email<input name="email" type="email" required autocomplete="email" /></label>
      <label>Password<input name="password" type="password" required autocomplete="current-password" /></label>
      <label>MFA code <span class="muted">(if enabled)</span><input name="mfa_code" inputmode="numeric" autocomplete="one-time-code" /></label>
      <div class="err" id="err"></div>
      <button class="btn btn-primary" type="submit">Sign in</button>
      <a class="btn btn-ghost" style="text-align:center" href="/v1/oauth/github/start">Continue with GitHub</a>
      <p class="muted">New here? <a href="/register">Create an account</a></p>
    </form>
    <script>
      const form = document.getElementById('form');
      const err = document.getElementById('err');
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        err.textContent = '';
        const raw = Object.fromEntries(new FormData(form).entries());
        const data = {
          email: raw.email,
          password: raw.password,
          ...(raw.mfa_code ? { mfa_code: raw.mfa_code } : {}),
        };
        const res = await fetch('/v1/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(data),
        });
        const json = await res.json();
        if (res.status === 401 && json.mfa_required) {
          err.textContent = json.message || 'MFA code required';
          return;
        }
        if (!res.ok) {
          err.textContent = json.error?.message || 'Sign in failed';
          return;
        }
        localStorage.setItem('pulse_tokens', JSON.stringify(json));
        location.href = '/app';
      });
    </script>`,
  );
}

export function appPage(): string {
  return layout(
    "Console",
    `<section style="padding:1rem 0 2rem">
      <h1 class="section-title">Session console</h1>
      <p class="muted">Inspect tokens, organizations, sessions, and MFA for the signed-in user.</p>
      <div class="app-grid">
        <div class="panel">
          <h2 class="section-title">Identity</h2>
          <pre class="mono" id="me">Loading…</pre>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem">
            <button class="btn btn-ghost" id="refreshBtn" type="button">Rotate refresh</button>
            <button class="btn btn-ghost" id="logoutBtn" type="button">Sign out</button>
          </div>
          <p class="err" id="err"></p>
        </div>
        <div class="panel">
          <h2 class="section-title">Organizations</h2>
          <pre class="mono" id="orgs">Loading…</pre>
        </div>
        <div class="panel">
          <h2 class="section-title">Sessions</h2>
          <pre class="mono" id="sessions">Loading…</pre>
          <button class="btn btn-ghost" id="revokeOthers" type="button" style="margin-top:.8rem">Revoke other sessions</button>
        </div>
        <div class="panel">
          <h2 class="section-title">MFA</h2>
          <p class="muted" id="mfaStatus">—</p>
          <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-top:.8rem">
            <button class="btn btn-primary" id="enrollMfa" type="button">Enroll TOTP</button>
            <button class="btn btn-ghost" id="confirmMfa" type="button">Confirm code</button>
          </div>
          <pre class="mono" id="mfaOut"></pre>
        </div>
      </div>
    </section>
    <script>
      const err = document.getElementById('err');
      const params = new URLSearchParams(location.search);
      if (params.get('access_token')) {
        const payload = {
          access_token: params.get('access_token'),
          refresh_token: params.get('refresh_token'),
          expires_in: Number(params.get('expires_in') || 900),
          user: JSON.parse(params.get('user') || '{}'),
        };
        localStorage.setItem('pulse_tokens', JSON.stringify(payload));
        history.replaceState({}, '', '/app');
      }

      function tokens() {
        return JSON.parse(localStorage.getItem('pulse_tokens') || 'null');
      }
      function authHeaders() {
        const t = tokens();
        if (!t?.access_token) throw new Error('Not signed in');
        return { Authorization: 'Bearer ' + t.access_token, 'content-type': 'application/json' };
      }

      async function load() {
        const t = tokens();
        if (!t) { location.href = '/login'; return; }
        const meRes = await fetch('/v1/me', { headers: authHeaders() });
        if (!meRes.ok) { localStorage.removeItem('pulse_tokens'); location.href = '/login'; return; }
        const me = await meRes.json();
        document.getElementById('me').textContent = JSON.stringify(me, null, 2);
        document.getElementById('mfaStatus').textContent = me.user.mfa_enabled ? 'MFA enabled' : 'MFA off';

        const [orgs, sessions] = await Promise.all([
          fetch('/v1/orgs', { headers: authHeaders() }).then(r => r.json()),
          fetch('/v1/sessions', { headers: authHeaders() }).then(r => r.json()),
        ]);
        document.getElementById('orgs').textContent = JSON.stringify(orgs, null, 2);
        document.getElementById('sessions').textContent = JSON.stringify(sessions, null, 2);
      }

      document.getElementById('refreshBtn').onclick = async () => {
        err.textContent = '';
        const t = tokens();
        const res = await fetch('/v1/auth/refresh', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refresh_token: t.refresh_token }),
        });
        const json = await res.json();
        if (!res.ok) { err.textContent = json.error?.message || 'Refresh failed'; return; }
        localStorage.setItem('pulse_tokens', JSON.stringify({ ...t, ...json }));
        await load();
      };

      document.getElementById('logoutBtn').onclick = async () => {
        try {
          await fetch('/v1/auth/logout', { method: 'POST', headers: authHeaders(), body: '{}' });
        } catch {}
        localStorage.removeItem('pulse_tokens');
        location.href = '/';
      };

      document.getElementById('revokeOthers').onclick = async () => {
        const data = await fetch('/v1/sessions', { headers: authHeaders() }).then(r => r.json());
        await Promise.all(
          (data.sessions || [])
            .filter(s => !s.current && !s.revokedAt)
            .map(s => fetch('/v1/sessions/' + s.id, { method: 'DELETE', headers: authHeaders() }))
        );
        await load();
      };

      let pendingSecret = null;
      document.getElementById('enrollMfa').onclick = async () => {
        const res = await fetch('/v1/mfa/enroll', { method: 'POST', headers: authHeaders() });
        const json = await res.json();
        document.getElementById('mfaOut').textContent = JSON.stringify(json, null, 2);
        pendingSecret = json.secret;
      };
      document.getElementById('confirmMfa').onclick = async () => {
        const code = prompt('Enter the 6-digit authenticator code');
        if (!code) return;
        const res = await fetch('/v1/mfa/confirm', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ code }),
        });
        const json = await res.json();
        document.getElementById('mfaOut').textContent = JSON.stringify(json, null, 2);
        await load();
      };

      load().catch((e) => { err.textContent = e.message; });
    </script>`,
  );
}
