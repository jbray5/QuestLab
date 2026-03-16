# QuestLab — Azure Deployment Runbook

One-time setup to get QuestLab running on Azure Container Apps.

---

## Prerequisites

- [Azure CLI](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) installed and logged in (`az login`)
- Your GitHub repo has the code pushed to `main`
- You have Owner or Contributor rights on your Azure subscription

---

## Step 1 — Provision Azure resources

```bash
chmod +x infra/provision.sh
./infra/provision.sh
```

This creates:
| Resource | Name | Notes |
|---|---|---|
| Resource Group | `questlab-rg` | East US (change in script if preferred) |
| Container Registry | `questlab-acr` | Stores Docker images |
| Postgres Flexible Server | `questlab-pg` | Burstable B1ms, ~$15/mo |
| Container Apps Environment | `questlab-env` | Shared networking layer |

The script prints your ACR and Postgres credentials at the end — **save them**.

---

## Step 2 — Create an Azure service principal for GitHub Actions

```bash
az ad sp create-for-rbac \
  --name "questlab-github-actions" \
  --role contributor \
  --scopes /subscriptions/<YOUR_SUBSCRIPTION_ID>/resourceGroups/questlab-rg \
  --json-auth
```

Copy the JSON output — you'll need `clientId`, `tenantId`, and `subscriptionId` from it.

---

## Step 3 — Add GitHub repository secrets

Go to your repo → **Settings → Secrets and variables → Actions → New repository secret**.

Add every secret in this table:

| Secret name | Where to find the value |
|---|---|
| `AZURE_CLIENT_ID` | `clientId` from Step 2 JSON |
| `AZURE_TENANT_ID` | `tenantId` from Step 2 JSON |
| `AZURE_SUBSCRIPTION_ID` | `subscriptionId` from Step 2 JSON |
| `ACR_LOGIN_SERVER` | Printed by `provision.sh` (e.g. `questlabacr.azurecr.io`) |
| `ACR_USERNAME` | Printed by `provision.sh` |
| `ACR_PASSWORD` | Printed by `provision.sh` |
| `PGHOST` | Printed by `provision.sh` (e.g. `questlab-pg.postgres.database.azure.com`) |
| `PGDATABASE` | `questlab` |
| `PGUSER` | `questlab` |
| `PGPASSWORD` | Password you entered when running `provision.sh` |
| `CURRENT_USER_EMAIL` | Email you want to log in as (e.g. `you@gmail.com`) |
| `BOOTSTRAP_ADMIN_EMAILS` | Same email — makes you the admin on first run |
| `ANTHROPIC_API_KEY` | Your key from console.anthropic.com |

---

## Step 4 — Trigger the first deploy

Push any commit to `main` (or re-run the workflow from the Actions tab).

The workflow:
1. Builds a Docker image (React frontend + FastAPI backend)
2. Pushes it to ACR
3. Creates the Container App on first run (updates it on subsequent runs)
4. The app runs `alembic upgrade head` automatically on startup

Watch the **Actions** tab — the last step prints the public URL.

---

## Step 5 — Open the app

```bash
az containerapp show \
  --name questlab-app \
  --resource-group questlab-rg \
  --query properties.configuration.ingress.fqdn -o tsv
```

Open `https://<that-fqdn>` in your browser.

---

## Subsequent deploys

Push to `main` → GitHub Actions builds and deploys automatically. No manual steps needed.

---

## Estimated cost (idle / light use)

| Resource | Cost |
|---|---|
| Container App (scales to 0) | ~$0 when idle; ~$5–10/mo with light use |
| Postgres Flexible Server B1ms | ~$15/mo |
| Container Registry Basic | ~$5/mo |
| **Total** | **~$20–30/mo** |

---

## Tearing it all down

```bash
az group delete --name questlab-rg --yes
```

This deletes everything in one command.

---

## Future: add real auth (Entra ID)

When ready to move beyond the single-user `CURRENT_USER_EMAIL` bypass:
1. Add Azure Front Door in front of the Container App
2. Configure Entra ID authentication on the Front Door profile
3. Front Door injects the `X-MS-CLIENT-PRINCIPAL-NAME` header — no app code changes needed
4. Remove `CURRENT_USER_EMAIL` from the Container App env vars

See `docs/deployment.md` for the full auth upgrade path.
