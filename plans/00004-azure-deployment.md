# Plan 00004 — Azure Deployment

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-03-15
**Last updated:** 2026-03-15
**Implemented by:** Claude Sonnet 4.6

---

## Purpose

Deploy QuestLab to Azure so the DM can share it with a friend via a public URL.
The app (FastAPI + React SPA) is containerised, pushed to Azure Container Registry,
and run on Azure Container Apps (scales to zero → near-zero idle cost).
Azure Postgres Flexible Server is the database.
Auth uses the `CURRENT_USER_EMAIL` env-var bypass for this first deployment
(no Azure Front Door / Entra ID required — that is a future upgrade path).
When done, a public HTTPS URL exists and the app is reachable by anyone given the link.

---

## Progress

- [x] Step 1: Write `Dockerfile` (multi-stage: Node build → Python runtime)
- [x] Step 2: Write `.dockerignore`
- [x] Step 3: Update CORS in `api/main.py` to allow Container Apps wildcard domain
- [x] Step 4: Write `infra/provision.sh` — one-time Azure resource creation
- [x] Step 5: Write `.github/workflows/azure-deploy.yml` — build + push + deploy on push to main
- [x] Step 6: Write `infra/README.md` — first-time setup runbook
- [x] Step 7: Update `docs/deployment.md`

---

## Surprises and Discoveries

None so far.

---

## Decision Log

| Date | Decision | Options | Chosen | Reason |
|---|---|---|---|---|
| 2026-03-15 | Container service | App Service, Container Apps, ACI | Container Apps | Scales to zero (cheap), HTTPS built-in, rolling deploys |
| 2026-03-15 | Auth model | Entra ID + Front Door, CURRENT_USER_EMAIL bypass | Bypass for now | Simplest path to share; Entra ID is a noted future upgrade |
| 2026-03-15 | Docker strategy | Single-stage, multi-stage | Multi-stage | Keeps final image small; Node not needed at runtime |
| 2026-03-15 | CI/CD | GitHub Actions, manual push | GitHub Actions | Push to main = auto-deploy; matches existing CI pattern |

---

## Context and Orientation

### Architecture layers involved
- Infrastructure only (new `infra/` directory)
- `api/main.py` — CORS update
- `Dockerfile`, `.dockerignore` — new at repo root
- `.github/workflows/` — new CI/CD workflow

### Key terms defined
- **ACR** — Azure Container Registry: private Docker image store
- **Container Apps** — Azure managed container runtime, scales to zero, built-in HTTPS + custom domains
- **Flexible Server** — Azure managed Postgres; already the target DB in stack design
- **Revision** — Container Apps term for a deployed version; new image = new revision
- **`CURRENT_USER_EMAIL` bypass** — env var that lets the FastAPI auth middleware resolve
  identity without Azure Front Door headers; documented as dev-only but functional for demo use

### Files touched (full paths from repo root)
```
Dockerfile
.dockerignore
api/main.py
infra/provision.sh
infra/README.md
.github/workflows/azure-deploy.yml
docs/deployment.md
```

---

## Concrete Steps

### Step 1: `Dockerfile` (multi-stage)
**File:** `Dockerfile`
**Action:** Create

Stage 1 (`builder`) — Node 22 alpine:
- `COPY frontend/ ./`
- `RUN npm ci && npm run build`
- Output: `/app/frontend/dist/`

Stage 2 (`runtime`) — Python 3.11 slim:
- Copy `requirements.txt`, `pip install --no-cache-dir -r requirements.txt`
- Copy entire repo (excluding .dockerignore)
- Copy `--from=builder /app/frontend/dist ./frontend/dist`
- Expose 8000
- `CMD ["uvicorn", "api.main:app", "--host", "0.0.0.0", "--port", "8000"]`

**Verify:** `docker build -t questlab:local .` completes without error.

---

### Step 2: `.dockerignore`
**File:** `.dockerignore`
**Action:** Create

Exclude: `.venv`, `__pycache__`, `*.pyc`, `.env`, `data/`, `frontend/node_modules`,
`frontend/dist` (builder stage produces it fresh), `.git`, `tests/`.

**Verify:** Build image, confirm size is reasonable (< 600 MB).

---

### Step 3: CORS update
**File:** `api/main.py`
**Action:** Modify

Add `*.azurecontainerapps.io` pattern to `allow_origins`. FastAPI's CORSMiddleware
does not support wildcards in the origins list, so we'll add a regex-based check or
simply set `allow_origins=["*"]` gated behind an env var
(`CORS_ALLOW_ALL=true` in prod, unset in dev leaves the current explicit list).

Simpler: read `CORS_ORIGINS` env var (comma-separated) and merge with defaults.

**Verify:** After deploy, browser fetch to `/api/health` succeeds with no CORS error.

---

### Step 4: `infra/provision.sh`
**File:** `infra/provision.sh`
**Action:** Create

Idempotent Azure CLI commands (all use `--query` + `|| true` so re-running is safe):

```
RG=questlab-rg
LOCATION=eastus
ACR=questlabacr          # must be globally unique — user renames if taken
PG_SERVER=questlab-pg
PG_DB=questlab
CA_ENV=questlab-env
CA_APP=questlab-app
```

Commands in order:
1. `az group create`
2. `az acr create --sku Basic`
3. `az postgres flexible-server create` (Burstable B1ms, 32 GB, public access)
4. `az postgres flexible-server db create`
5. `az containerapp env create`
6. (Container App created by GitHub Actions on first deploy — not here)

Also prints the ACR login server, PG FQDN, and instructions for next steps.

**Verify:** All `az` commands exit 0; resources visible in Azure Portal.

---

### Step 5: `.github/workflows/azure-deploy.yml`
**File:** `.github/workflows/azure-deploy.yml`
**Action:** Create

Trigger: `push` to `main` (paths: `api/**`, `frontend/src/**`, `Dockerfile`, `requirements.txt`)

Jobs:
1. `build-and-push`:
   - Login to ACR via `azure/docker-login`
   - `docker build -t $ACR_LOGIN_SERVER/questlab:$SHA .`
   - `docker push`
2. `deploy`:
   - `az containerapp update --image $ACR_LOGIN_SERVER/questlab:$SHA`
   - If app doesn't exist yet: `az containerapp create` with all env vars

Required GitHub secrets (documented in `infra/README.md`):
```
AZURE_CLIENT_ID
AZURE_TENANT_ID
AZURE_SUBSCRIPTION_ID
ACR_LOGIN_SERVER
ACR_USERNAME
ACR_PASSWORD
PGHOST / PGPORT / PGDATABASE / PGUSER / PGPASSWORD
PGSSLMODE
CURRENT_USER_EMAIL        # demo auth bypass
BOOTSTRAP_ADMIN_EMAILS
ANTHROPIC_API_KEY
```

Uses OIDC federation (`azure/login` with `client-id/tenant-id/subscription-id`) —
no long-lived credentials needed for Azure login.

**Verify:** Push a trivial commit; GitHub Actions green; new revision appears in Container Apps.

---

### Step 6: `infra/README.md`
**File:** `infra/README.md`
**Action:** Create

Step-by-step runbook:
1. Prerequisites (Azure CLI installed + logged in, GitHub repo linked)
2. Run `infra/provision.sh`
3. Run Alembic migration once (via `az containerapp exec` or directly)
4. Add GitHub secrets (table with name + where to find value)
5. Push to main to trigger first deploy
6. Get public URL: `az containerapp show --query properties.configuration.ingress.fqdn`

---

### Step 7: `docs/deployment.md`
**File:** `docs/deployment.md`
**Action:** Create (or overwrite if exists)

Architecture summary, env var reference, Alembic runbook for prod, upgrade path to
Entra ID auth + Front Door.

---

## Validation and Acceptance

- [ ] `docker build -t questlab:local .` succeeds locally
- [ ] `docker run -e CURRENT_USER_EMAIL=test@test.com -e DB_BACKEND=duckdb -p 8000:8000 questlab:local` → `curl localhost:8000/api/health` returns `{"ok":true}`
- [ ] `infra/provision.sh` runs without error against a real Azure sub
- [ ] GitHub Actions workflow goes green on push to main
- [ ] `https://<app>.azurecontainerapps.io` loads the React app
- [ ] Friend can open the URL in their browser and use the app

---

## Idempotence and Recovery

- `provision.sh` is idempotent — re-running creates resources that don't exist, skips those that do.
- GitHub Actions deploys on every push — to redeploy without a code change, push an empty commit.
- Alembic migration: `alembic upgrade head` is idempotent (no-ops if already at head).

---

## Interfaces and Dependencies

**Produces:** Public HTTPS URL, GitHub Actions CI/CD pipeline, Azure resource set
**Depends on:** Azure subscription, GitHub repo, existing `api/` and `frontend/` code

---

## Outcomes and Retrospective

_Fill in after completion._
