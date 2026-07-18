# Deployment — Vercel (frontend) + Render (backend)

This guide gets QuestLab live in ~30 minutes. The deployment splits the
React frontend from the FastAPI backend, which is the cleanest fit for
serverless edge hosting (Vercel) plus a long-running Python service
(Render).

```
  ┌──────────────┐ HTTPS   ┌────────────────────┐ TLS  ┌──────────────┐
  │ Browser      │────────►│ Vercel (frontend)  │      │              │
  │ player / DM  │         │ React + Vite build │      │              │
  └──────────────┘         └────────────────────┘      │              │
         │                          │  fetch           │              │
         │  ──────────────────────► │  ─────────────►  │  Render Web  │
         │                          │                  │  questlab-api│
         │                          │                  │  (FastAPI)   │
         └──────────────────────────┴─────────────────►│              │
                                                       └──────┬───────┘
                                                              │ SSL
                                                              ▼
                                                       ┌──────────────┐
                                                       │ Render PG    │
                                                       │ questlab-db  │
                                                       └──────────────┘
```

> The previous Azure Container Apps deploy plan is preserved in
> git history (`docs/deployment.md` before this commit). When you return
> from the road and can update Azure Postgres firewall rules, you can
> swap Render Postgres → Azure Postgres by just changing PG env vars in
> Render and running `alembic upgrade head`.

## Prerequisites

- GitHub repo pushed: this repo, on the `main` branch
- Vercel account: <https://vercel.com>
- Render account: <https://render.com>
- Anthropic API key (Claude) for runbook generation: <https://console.anthropic.com>

---

## Part 1 — Backend on Render (do this first)

The frontend needs the backend's URL, so the backend has to exist first.

### 1. Connect the repo to Render

1. Render dashboard → **New +** → **Blueprint**
2. **Connect a GitHub repository**, pick this repo
3. Render reads `render.yaml` at the repo root and proposes:
   - Web service: `questlab-api` (Python, free plan)
   - Database: `questlab-db` (Postgres 16, free plan)
4. Click **Apply**

The first deploy takes 5–10 minutes (build + alembic migrations).

### 2. Fill in three sync-false env vars

Once the web service is up, open **questlab-api → Environment** and set:

| Key | Value | Notes |
|---|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-…` | Required for `/api/sessions/{id}/runbook` |
| `BOOTSTRAP_ADMIN_EMAILS` | `you@example.com` | Seeded into admins table on first boot only |
| `CORS_ORIGINS` | _leave blank until Part 2_ | Comma-separated origins (no trailing slash) |
| `OPENAI_API_KEY` | `sk-…` _(optional)_ | Required for AI portrait generation (Plan 34). Without it, the "🎨 Generate Portrait" button surfaces a friendly error. |
| `BLOB_READ_WRITE_TOKEN` | `vercel_blob_rw_…` _(optional)_ | Required alongside `OPENAI_API_KEY`. Generated portraits upload here for permanent URLs. Create a store at Vercel → Storage → Blob → API tokens. |

After saving, click **Manual Deploy → Deploy latest commit** so the new env vars take effect.

### 3. Smoke-test the backend

The Render dashboard shows the public URL — something like
`https://questlab-api.onrender.com`. Hit:

```bash
curl https://questlab-api.onrender.com/api/health
# expected: {"ok": true}
```

If you get a 5xx, check **questlab-api → Logs** for the stack trace.
Common first-deploy issues:

- `alembic.util.exc.CommandError: Can't locate revision identified by …`
  → ensure all migrations under `alembic/versions/` were committed
- `psycopg2.OperationalError: SSL connection has been closed`
  → `PGSSLMODE=require` is set; if errors persist, the DB is still
    provisioning. Wait 2 min and redeploy.

> ⏱ **Free tier sleeps after 15 min idle.** First request after sleep
> takes 30–50s. Fine for prep, painful at the table. Upgrade to Starter
> ($7/mo) for always-on if needed.

---

## Part 2 — Frontend on Vercel

### 1. Connect the repo to Vercel

1. Vercel dashboard → **Add New… → Project**
2. Import this GitHub repo
3. **Root Directory: `frontend`** (critical — Vite is in a sub-folder)
4. Framework Preset: **Vite** (auto-detected from `vercel.json`)
5. Don't deploy yet — set env vars first

### 2. Set the environment variable

Project → **Settings → Environment Variables**, add (Production scope):

| Key | Value |
|---|---|
| `VITE_API_BASE_URL` | `https://questlab-api.onrender.com/api` |

Note the trailing `/api`. The frontend prepends this to every path.

### 3. Deploy

Hit **Deploy**. Vercel builds and ships in ~2 min. You get a URL like
`https://<project>-<scope>.vercel.app`.

> ⚠ **The live project is named `quest` (scope `justins-projects-16b34fc4`).**
> `questlab.vercel.app` is NOT ours — it belongs to an unrelated
> "Quest Labs" product; never share links on that domain. The public
> production domain is **`https://quest-lab-tau.vercel.app`** (confirmed
> logged-out 2026-07-18; all player routes reachable, no login wall).
> Per-deployment `quest-<hash>-…vercel.app` URLs sit behind Vercel SSO
> (Deployment Protection) and will show players a login wall — share only
> the public domain.

### 4. Wire CORS

Copy the Vercel URL and paste it into Render → **questlab-api →
Environment → CORS_ORIGINS**:

```
https://<your-real-vercel-domain>
```

No trailing slash. Multiple origins are comma-separated. (The API also
allows any `https://*.vercel.app` origin via regex for branch previews.)
Save, then
**Manual Deploy → Deploy latest commit** so the API trusts the new origin.

### 5. First-load identity

Open the Vercel URL. The app shows "Welcome to QuestLab — enter your DM
email." This becomes your identity for authz (campaign ownership). It
persists in browser localStorage; you can change it any time from the
sidebar.

---

## Part 3 — Verifying it works

1. Set your DM email
2. Create a test campaign — should appear on the dashboard
3. Create a PC — should round-trip
4. Open the HUD for a session, generate a runbook (tests the Claude API key)

If the dashboard shows "API unreachable", inspect the browser's
DevTools → Network → look at the failed `/campaigns` call:

- **CORS error** → `CORS_ORIGINS` doesn't include your Vercel domain
- **404** → `VITE_API_BASE_URL` is missing `/api` at the end
- **5xx** → backend error, check Render logs

---

## Auth model

Identity is just the email the DM types on first load, sent in
`X-MS-CLIENT-PRINCIPAL-NAME` on every request. The backend uses this for
authz (DM owns campaign → owns its PCs).

This is **MVP-level** trust: anyone who knows another DM's email can
impersonate them. Fine for an in-person table where you control the URL,
not fine for public hosting. Plan 25 will add real player auth.

If you need to lock down the deployed instance now: put it behind a
Cloudflare Access policy or Vercel's password protection (Pro plan).

---

## Updating after a code change

Both Render and Vercel auto-deploy on every push to `main`:

- Push → Vercel rebuilds frontend (~2 min)
- Push → Render rebuilds backend + runs `alembic upgrade head` (~5 min)

For DB-schema changes:

1. Write the migration locally: `alembic revision --autogenerate -m "…"`
2. Test against local DuckDB / Postgres
3. Commit and push — Render runs the migration on deploy

For frontend-only changes the Render deploy is skipped (no relevant
files changed).

---

## Cost summary (current)

| Service | Plan | Cost | Limit |
|---|---|---|---|
| Vercel | Hobby | $0 | 100GB bandwidth / month |
| Render Web | Free | $0 | 750h/mo, sleeps after 15min idle |
| Render Postgres | Free | $0 | 1GB storage, **deleted after 90 days** |
| Claude API | Pay-as-you-go | $$ | ~$0.01–0.05 per runbook |

> 🪙 **Render free Postgres expires after 90 days.** Before then, either
> upgrade to a paid plan, swap to Azure Postgres (set the PG env vars
> in Render to your Azure instance and redeploy), or `pg_dump` to a
> new instance.

---

## Rollback

- **Vercel:** Project → Deployments → click any previous deploy →
  "Promote to Production"
- **Render:** Service → Manual Deploy → pick an earlier commit
- **DB:** Render Postgres has automatic daily backups (paid plans only).
  Free tier: run `pg_dump` periodically into local storage.
