#!/bin/bash
# ── QuestLab — one-time Azure resource provisioning ───────────────────────────
# Run once from your local machine after `az login`.
# All commands are idempotent: safe to re-run if interrupted.
#
# Usage:
#   chmod +x infra/provision.sh
#   ./infra/provision.sh
#
# Customise the variables below before running.
# ──────────────────────────────────────────────────────────────────────────────
set -euo pipefail

# ── CONFIG — edit these ────────────────────────────────────────────────────────
RG="questlab-rg"
LOCATION="eastus"
ACR="questlabacr"           # must be globally unique; change if taken
PG_SERVER="questlab-pg"     # must be globally unique
PG_DB="questlab"
PG_USER="questlab"
PG_PASSWORD=""              # set below or export PGPASSWORD before running
CA_ENV="questlab-env"
CA_APP="questlab-app"

# Prompt for PG password if not set
if [[ -z "${PG_PASSWORD:-}" ]]; then
  read -rsp "Postgres password for user '$PG_USER': " PG_PASSWORD
  echo
fi

echo "==> Resource group"
az group create --name "$RG" --location "$LOCATION" --output none

echo "==> Container Registry (Basic)"
az acr create \
  --resource-group "$RG" \
  --name "$ACR" \
  --sku Basic \
  --admin-enabled true \
  --output none

ACR_LOGIN_SERVER=$(az acr show --name "$ACR" --query loginServer -o tsv)
ACR_USERNAME=$(az acr credential show --name "$ACR" --query username -o tsv)
ACR_PASSWORD=$(az acr credential show --name "$ACR" --query "passwords[0].value" -o tsv)

echo "==> Postgres Flexible Server (Burstable B1ms)"
az postgres flexible-server create \
  --resource-group "$RG" \
  --name "$PG_SERVER" \
  --location "$LOCATION" \
  --admin-user "$PG_USER" \
  --admin-password "$PG_PASSWORD" \
  --sku-name "Standard_B1ms" \
  --tier "Burstable" \
  --storage-size 32 \
  --version 16 \
  --public-access 0.0.0.0 \
  --output none 2>/dev/null || echo "  (server already exists, skipping)"

echo "==> Postgres database"
az postgres flexible-server db create \
  --resource-group "$RG" \
  --server-name "$PG_SERVER" \
  --database-name "$PG_DB" \
  --output none 2>/dev/null || echo "  (database already exists, skipping)"

PG_FQDN=$(az postgres flexible-server show \
  --resource-group "$RG" \
  --name "$PG_SERVER" \
  --query fullyQualifiedDomainName -o tsv)

echo "==> Container Apps environment"
az containerapp env create \
  --name "$CA_ENV" \
  --resource-group "$RG" \
  --location "$LOCATION" \
  --output none 2>/dev/null || echo "  (environment already exists, skipping)"

# ── Print summary ──────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo " QuestLab Azure resources ready"
echo "══════════════════════════════════════════════════════════"
echo " ACR login server : $ACR_LOGIN_SERVER"
echo " ACR username     : $ACR_USERNAME"
echo " ACR password     : $ACR_PASSWORD"
echo " Postgres host    : $PG_FQDN"
echo " Postgres user    : $PG_USER"
echo " Postgres db      : $PG_DB"
echo "══════════════════════════════════════════════════════════"
echo ""
echo "Next: add the values above as GitHub repository secrets."
echo "See infra/README.md for the full list."
