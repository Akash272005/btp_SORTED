#!/usr/bin/env bash
# Full Azure production deploy: verify DB → sync env → build/push images → update Container Apps.
#
# Prerequisites:
#   az login
#   .azure-deploy-vars (copy from .azure-deploy-vars.example)
#   .env with DATABASE_URL, LMS_JWT_SECRET, API keys
#
# Usage (from repo root):
#   ./scripts/deploy_azure_full.sh              # NCERT manifest + sync env + deploy both
#   ./scripts/deploy_azure_full.sh --skip-sync  # images only (env already synced)
#   ./scripts/deploy_azure_full.sh --skip-db    # skip local DATABASE_URL check
#   ./scripts/deploy_azure_full.sh --skip-ncert # skip manifest regen from ncert_source
#   ./scripts/deploy_azure_full.sh --ncert-full # upload ncert_source to blob + manifest
#   ./scripts/deploy_azure_full.sh backend      # backend image only
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

SKIP_SYNC=0
SKIP_DB=0
SKIP_NCERT=0
NCERT_FULL=0
TARGET="all"
PYTHON="${PYTHON:-}"

for arg in "$@"; do
  case "$arg" in
    --skip-sync) SKIP_SYNC=1 ;;
    --skip-db) SKIP_DB=1 ;;
    --skip-ncert) SKIP_NCERT=1 ;;
    --ncert-full) NCERT_FULL=1 ;;
    backend|frontend|all) TARGET="$arg" ;;
    *)
      echo "Unknown argument: $arg" >&2
      echo "Usage: $0 [--skip-sync] [--skip-db] [--skip-ncert] [--ncert-full] [backend|frontend|all]" >&2
      exit 1
      ;;
  esac
done

if [[ -z "$PYTHON" ]]; then
  if [[ -x "$ROOT/.venv/bin/python" ]]; then
    PYTHON="$ROOT/.venv/bin/python"
  else
    PYTHON="python3"
  fi
fi

if ! command -v az >/dev/null 2>&1; then
  echo "Azure CLI (az) not found. Install: https://learn.microsoft.com/cli/azure/install-azure-cli" >&2
  exit 1
fi

if ! az account show >/dev/null 2>&1; then
  echo "Not logged in to Azure. Run: az login" >&2
  exit 1
fi

if [[ ! -f .azure-deploy-vars ]]; then
  echo "Missing .azure-deploy-vars — copy .azure-deploy-vars.example and set ACR, RG, app names." >&2
  exit 1
fi

# shellcheck disable=SC1091
source .azure-deploy-vars

echo "╔══════════════════════════════════════════════════════════╗"
echo "║  bixy_AiTutor — Azure Container Apps + ACR deploy       ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "  Subscription: $(az account show --query name -o tsv)"
echo "  Resource grp: ${RG}"
echo "  ACR:          ${ACR}.azurecr.io"
echo "  Target:       ${TARGET}"
echo ""

if [[ "$SKIP_NCERT" -eq 0 ]]; then
  echo "==> NCERT catalog (ncert_source → manifest.json)..."
  if [[ "$NCERT_FULL" -eq 1 ]]; then
    echo "    Mode: full (blob upload + manifest) — may take ~20 min on first run"
    "$PYTHON" scripts/publish_ncert_blob.py --yes
  else
    echo "    Mode: manifest-only (blob must already be current)"
    "$PYTHON" scripts/publish_ncert_blob.py --manifest-only --yes
  fi
  NCERT_COUNT="$("$PYTHON" -c "import json; m=json.load(open('web/public/ncert/manifest.json')); print(sum(len(v2) for v in m.values() for v2 in v.values()))" 2>/dev/null || echo '?')"
  echo "    manifest.json: ${NCERT_COUNT} PDF entries"
  echo ""
fi

if [[ "$SKIP_DB" -eq 0 ]]; then
  echo "==> Verifying DATABASE_URL (local .env)..."
  if ! python3 scripts/verify_database_url.py; then
    echo ""
    echo "DATABASE_URL check failed. Fix .env or use --skip-db to continue anyway." >&2
    exit 1
  fi
  echo ""
fi

if [[ "$SKIP_SYNC" -eq 0 && "$TARGET" != "frontend" ]]; then
  echo "==> Syncing secrets/env to ${BACKEND_APP}..."
  chmod +x scripts/sync_azure_production_env.sh
  ./scripts/sync_azure_production_env.sh
  echo ""
fi

chmod +x scripts/deploy_azure_acr.sh
./scripts/deploy_azure_acr.sh "$TARGET"

echo ""
echo "Next steps:"
echo "  1. Azure Portal → ${BACKEND_APP} → Log stream → look for 'LMS database initialized'"
echo "  2. Open frontend URL → student portal → verify NCERT chapter PDFs load"
echo "  3. Re-run ./scripts/deploy_azure_full.sh after any .env secret change"
echo "  4. After new PDFs in ncert_source: ./scripts/publish_ncert_blob.py --yes then redeploy"
