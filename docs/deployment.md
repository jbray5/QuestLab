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
| `BOOTSTRAP_ADMIN_EMAILS` | `you@example.com` | Seeded into admins table on first boot only |
| `CORS_ORIGINS` | _leave blank until Part 2_ | Comma-separated origins (no trailing slash) |
| `BLOB_READ_WRITE_TOKEN` | `vercel_blob_rw_…` | Uploaded portraits, battle maps and `.glb` figures are stored here (Render's disk is ephemeral; Plan 128 moved portraits off it). Create a store at Vercel → Storage → Blob → API tokens. |

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
4. Open the HUD for a session, start a blank runbook and roll initiative

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

## Pricing and Patreon (Plan 130)

Players never pay. During the beta nothing is capped. Pricing is in `docs/PRICING.md`; the
code is `services/plan_service.py`.

### Env vars (questlab-api → Environment)

| Key | Value | Notes |
|---|---|---|
| `PRICING` | `off` (default) or `on` | `render.yaml` sets `off`. `on` enforces the Free plan's 2 campaigns and 250 MB. Admins are never capped. Changing it needs no code change, just a redeploy. |
| `PATREON_URL` | `https://www.patreon.com/<page>` | QuestLab's public Patreon page. It shows "Support QuestLab" in the menu and on `/plan`, and the plan page's "Become a Patron" button. |
| `PATREON_CAMPAIGN_ID` | e.g. `1234567` | QuestLab's campaign id. A DM is a Patron when their membership of **this** campaign is active. Without it, memberships aren't read at all. |
| `PATREON_CLIENT_ID` / `PATREON_CLIENT_SECRET` | from the Patreon client | Already used by "Sign in with Patreon"; "Link your Patreon" uses the same client. |
| `OAUTH_REDIRECT_BASE` / `FRONTEND_ORIGIN` / `APP_SECRET` | as for sign-in | The link's signed state and result need `APP_SECRET`. The callback lands on `FRONTEND_ORIGIN/plan`. |

### Patreon setup (once)

1. **Tier.** On QuestLab's Patreon page, make one paid tier called **Patron** at **$4/month**.
   Turn on annual billing at **$40/year** (Patreon calls the yearly price a discount).
   A membership counts when it's worth at least $4 a month, or at least $40 paid yearly
   (`PATRON_MIN_CENTS` and `PATRON_MIN_ANNUAL_CENTS`).
2. **Client.** At <https://www.patreon.com/portal/registration/register-clients>, under the
   same creator account as the campaign, create or reuse the OAuth client:
   - Redirect URI: `https://<render-api-host>/api/auth/patreon/callback`, exactly
     `OAUTH_REDIRECT_BASE` + `/auth/patreon/callback`. Sign-in and linking share it.
   - Scopes requested: sign-in asks for `identity identity[email]`; "Link your Patreon" asks
     for `identity identity.memberships`. Patreon shows them on its consent screen; nothing
     else has to be set in the portal.
3. **Campaign id.** Find it in the creator portal, or read it from the API with the client's
   creator access token:
   `curl -H "Authorization: Bearer <creator token>" https://www.patreon.com/api/oauth2/v2/campaigns`.
   Put the `data[0].id` value in `PATREON_CAMPAIGN_ID`.
4. Set `PATREON_URL`, then redeploy.

### How a DM becomes a Patron

- **Patreon:** they join the tier on Patreon, then press **Link your Patreon** (or **Check my
  Patreon again**) on `/plan`, or sign in with Patreon. Each check counts for **40 days**.
  Patreon tokens expire and nothing polls in the background, so a lapsed membership stops
  counting at most 40 days after the last check. Signing in with Patreon renews it.
- **Comp:** in Admin → Beta → DMs, press **Give Patron** (`POST /api/admin/users/{email}/comp`).
  It works without Patreon, until it's removed.
- **Admins** (`BOOTSTRAP_ADMIN_EMAILS`) have no caps.

### Switching pricing on (when the beta ends, around 50 active DMs)

1. Make sure the Patreon setup above is done and `/plan` shows "Link your Patreon".
2. Set `PRICING=on` and redeploy.
3. Check `/plan` on a free test account: it should say **Free**, with the meters against
   2 campaigns and 250 MB. A third campaign should answer 402 with "Free DMs run two campaigns…".
4. Nothing is deleted or hidden for DMs already over a limit. They just can't add more.
   Comp anyone who should keep going.

Storage counts every upload since migration 0060 (the uploads ledger). Older files count as 0,
and replacing or deleting a picture doesn't lower the count yet (see TD-130a in `docs/QUALITY.md`).

---

## Updating after a code change

Both Render and Vercel auto-deploy on every push to `main`:

- Push → Vercel rebuilds frontend (~2 min)
- Push → Render rebuilds backend + runs `alembic upgrade head` (~5 min)

For DB-schema changes:

1. Write the migration locally: `alembic revision --autogenerate -m "…"`
2. Test against local DuckDB / Postgres
3. Commit and push — Render runs the migration on deploy

Catalog data that a migration doesn't carry is synced at API startup (`api/main.py` lifespan), by
name, inserting only what's missing and never editing a row. That covers class features
(`feature_service.seed_and_backfill`) and the SRD 5.1 magic weapons
(`item_service.seed_missing_magic_items`, Plan 135). A deploy needs no extra step for them.

For frontend-only changes the Render deploy is skipped (no relevant
files changed).

---

## Cost summary (current)

| Service | Plan | Cost | Limit |
|---|---|---|---|
| Vercel | Hobby | $0 | 100GB bandwidth / month |
| Render Web | Free | $0 | 750h/mo, sleeps after 15min idle |
| Render Postgres | Free | $0 | 1GB storage, **deleted after 90 days** |

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
