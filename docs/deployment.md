# Deployment

QuestLab runs as a single Docker container (FastAPI + React SPA) on **Azure Container Apps**,
backed by **Azure Postgres Flexible Server**.

---

## Architecture

```
Browser
  └─ HTTPS ──► Azure Container Apps (questlab-app)
                    │  port 8000 — uvicorn
                    │  FastAPI serves /api/* routes
                    │  FastAPI serves React SPA from frontend/dist/
                    └─ TCP 5432 ──► Azure Postgres Flexible Server
```

---

## First-time setup

See **`infra/README.md`** — the complete step-by-step runbook.

Short version:
1. `./infra/provision.sh` — create Azure resources
2. Add GitHub secrets (table in `infra/README.md`)
3. Push to `main` — GitHub Actions deploys automatically

---

## Environment variables (production)

| Variable | Description |
|---|---|
| `DB_BACKEND` | `postgres` |
| `PGHOST` | Postgres Flexible Server FQDN |
| `PGPORT` | `5432` |
| `PGDATABASE` | `questlab` |
| `PGUSER` | DB username |
| `PGPASSWORD` | DB password (stored as Container Apps secret) |
| `PGSSLMODE` | `require` |
| `CURRENT_USER_EMAIL` | Identity bypass — single user email for demo deploy |
| `BOOTSTRAP_ADMIN_EMAILS` | Seeded as admin on first run |
| `ANTHROPIC_API_KEY` | Claude API key (stored as Container Apps secret) |
| `CORS_ORIGINS` | Optional extra origins (comma-separated); not needed when frontend is same-origin |
| `LOG_LEVEL` | `INFO` |
| `ENV` | `production` |

---

## CI/CD pipeline

`.github/workflows/azure-deploy.yml` runs on every push to `main` that touches
`api/`, `frontend/src/`, `Dockerfile`, `requirements.txt`, or `alembic/`.

Steps:
1. Build multi-stage Docker image (Node → React build, Python → runtime)
2. Push to Azure Container Registry
3. `az containerapp update` (or `create` on first run)
4. On startup, container runs `alembic upgrade head` before uvicorn

---

## Alembic migrations (manual / emergency)

To run migrations manually against prod:

```bash
# Option 1 — exec into a running replica
az containerapp exec \
  --name questlab-app \
  --resource-group questlab-rg \
  --command "alembic upgrade head"

# Option 2 — run locally against prod DB (requires VPN or firewall rule)
export PGHOST=questlab-pg.postgres.database.azure.com
export PGPASSWORD=<password>
alembic upgrade head
```

---

## Auth model

**Current (demo):** `CURRENT_USER_EMAIL` env var — everyone who opens the URL is the same user.

**Future (multi-user):** Azure Front Door + Entra ID authentication.
Front Door injects `X-MS-CLIENT-PRINCIPAL-NAME` header; no app code changes needed.
Steps:
1. Provision Front Door profile with custom domain
2. Enable Entra ID provider on the Front Door security policy
3. Point Front Door origin to the Container App
4. Remove `CURRENT_USER_EMAIL` from Container App env vars

---

## Tearing down

```bash
az group delete --name questlab-rg --yes
```
