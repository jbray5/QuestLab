# Demo Deployment Runbook (Plan 54, Stage A)

Stand up the **public demo** — a fully separate stack so the real campaign
data, database, and API keys are never exposed. Everything code-side is
already merged; this is ~15 minutes of dashboard clicks.

## What you're creating
- `questlab-demo` — a second Render web service, same repo/branch
- `questlab-demo-db` — its own free Postgres (nothing shared with prod)
- A second Vercel project (same repo) serving the demo frontend
- A GitHub secret so the nightly reset workflow targets the demo

## 1. Render: demo API + DB (~7 min)
1. Render dashboard → **New → Postgres** → name `questlab-demo-db`, free
   tier, same region as prod (oregon).
2. **New → Web Service** → same GitHub repo, branch `main`:
   - Name: `questlab-demo`
   - Build command: `pip install -r requirements.txt && alembic upgrade head`
   - Start command: `uvicorn api.main:app --host 0.0.0.0 --port $PORT --workers 1`
   - Health check path: `/api/health`
3. Environment variables on `questlab-demo`:
   | Key | Value |
   |---|---|
   | `DB_BACKEND` | `postgres` |
   | `PGHOST`/`PGPORT`/`PGDATABASE`/`PGUSER`/`PGPASSWORD` | from `questlab-demo-db` (Connect → Internal) |
   | `PGSSLMODE` | `require` |
   | `AUTH_EMAIL_HEADER` | `X-MS-CLIENT-PRINCIPAL-NAME` |
   | `ENV` | `production` |
   | **`DEMO_MODE`** | **`true`** |
   | **`AI_GENERATION_ENABLED`** | **`false`** |
   | `BOOTSTRAP_ADMIN_EMAILS` | `demo@questlab.app` |
   - **Do NOT set** `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, or
     `BLOB_READ_WRITE_TOKEN` — the demo gets no keys at all (belt and
     braces on top of the kill switch).
4. Deploy; wait until `/api/health` answers.

## 2. Vercel: demo frontend (~4 min)
1. Vercel → **Add New Project** → import the same repo (this creates a
   second project alongside `quest`; name it `questlab-demo`).
2. Root directory: `frontend` (framework auto-detects from vercel.json).
3. Environment variables (Production):
   | Key | Value |
   |---|---|
   | `VITE_API_BASE_URL` | `https://questlab-demo.onrender.com/api` (your actual demo API URL) |
   | `VITE_DEMO_MODE` | `true` |
4. Deploy. The public link is `https://<project>.vercel.app/try`.

## 3. Seed the demo world (~2 min)
From the repo (any machine):
```bash
python scripts/seed_demo_world.py --api https://questlab-demo.onrender.com/api
```
Prints the demo board / players' 3D / market URLs when done.

## 4. Nightly reset (~2 min)
GitHub repo → Settings → Secrets and variables → Actions →
**New repository secret**: `DEMO_API_URL` =
`https://questlab-demo.onrender.com/api`.
The `demo-reset` workflow (09:00 UTC daily, or Actions → run manually)
re-seeds from scratch every night.

## 5. Sanity checklist before posting the link
- [ ] `https://<demo>.vercel.app/try` renders the landing, waitlist works
- [ ] "Enter the demo world" lands on the dashboard with the 🧪 banner
- [ ] Any AI button (🎨/🪄/✨) returns "AI generation is disabled…" — not a bill
- [ ] Prod (`quest-lab-tau.vercel.app`) still requires the email sign-in
      (DEMO_MODE never set there) and The Severance is untouched
- [ ] Waitlist signups appear: `SELECT * FROM waitlist_entries` on the
      **demo** DB (source `demo-landing`) — check before/after posting

## Safety model (why this is safe to put on Reddit)
- Separate DB: demo visitors can only ever touch demo data.
- No API keys on the service + `AI_GENERATION_ENABLED=false`: zero spend,
  double-enforced.
- `DEMO_MODE=true` pins all visitors to one shared identity server-side —
  the spoofable-header problem is moot because there is nothing to spoof
  into.
- Nightly reset bounds any vandalism to a single day of a sandbox.
- The Reddit post links `/try`, never the prod domain.
