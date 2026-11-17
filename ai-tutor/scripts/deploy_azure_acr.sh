#!/usr/bin/env bash
# Build backend + frontend images in ACR and update Azure Container Apps.
#
# Prerequisites:
#   - Azure CLI logged in: az login
#   - .azure-deploy-vars with RG, ACR, BACKEND_APP, FRONTEND_APP
#
# Usage (from repo root):
#   ./scripts/deploy_azure_acr.sh              # build + deploy both
#   ./scripts/deploy_azure_acr.sh backend      # backend only
#   ./scripts/deploy_azure_acr.sh frontend     # frontend only
#
# Optional env:
#   IMAGE_TAG=latest                           # default: deploy-YYYYMMDDhhmmss
#   NEXT_PUBLIC_API_BASE=https://...           # default: live backend FQDN
#   USE_LOCAL_DOCKER=1                         # local docker build+push instead of az acr build
#
# Full pipeline (NCERT manifest + env sync + DB check + this script):
#   ./scripts/deploy_azure_full.sh
#
# NCERT PDFs are baked into the frontend image (web/public/ncert/manifest.json).
# Regenerate before deploy: ./scripts/publish_ncert_blob.py --manifest-only --yes
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .azure-deploy-vars ]]; then
  # shellcheck disable=SC1091
  source .azure-deploy-vars
fi

RG="${RG:-bixy-rg}"
ACR="${ACR:?Set ACR in .azure-deploy-vars (copy .azure-deploy-vars.example)}"
BACKEND_APP="${BACKEND_APP:-bixy-backend}"
FRONTEND_APP="${FRONTEND_APP:-bixy-frontend}"
IMAGE_TAG="${IMAGE_TAG:-deploy-$(date +%Y%m%d%H%M%S)}"

require_az() {
  if ! command -v az >/dev/null 2>&1; then
    echo "Azure CLI (az) not found." >&2
    exit 1
  fi
  if ! az account show >/dev/null 2>&1; then
    echo "Not logged in. Run: az login" >&2
    exit 1
  fi
}

require_az

if ! az acr show -n "$ACR" -g "$RG" >/dev/null 2>&1; then
  echo "ACR '${ACR}' not found in resource group '${RG}'." >&2
  echo "Check .azure-deploy-vars or create the registry in Azure Portal." >&2
  exit 1
fi

if [[ -z "${NEXT_PUBLIC_API_BASE:-}" ]]; then
  NEXT_PUBLIC_API_BASE="$(az containerapp show -n "$BACKEND_APP" -g "$RG" \
    --query "properties.configuration.ingress.fqdn" -o tsv 2>/dev/null || true)"
  if [[ -z "$NEXT_PUBLIC_API_BASE" ]]; then
    echo "Could not resolve backend FQDN. Set NEXT_PUBLIC_API_BASE explicitly." >&2
    exit 1
  fi
  NEXT_PUBLIC_API_BASE="https://${NEXT_PUBLIC_API_BASE}"
fi

REGISTRY="${ACR}.azurecr.io"
BACKEND_IMAGE="${REGISTRY}/bixy-backend:${IMAGE_TAG}"
FRONTEND_IMAGE="${REGISTRY}/bixy-frontend:${IMAGE_TAG}"

# az acr build still walks .dockerignore'd directories and calls tar.gettarinfo on
# every file before the ignore check. Unix sockets (local Postgres) then fail with:
#   tarfile: unsupported type ./data/postgres/pgdata/.s.PGSQL.5432
ACR_STASH_TMPDIR=""
ACR_CONTEXT_PREPARED=""
restore_acr_build_context() {
  if [[ -n "$ACR_STASH_TMPDIR" && -d "$ACR_STASH_TMPDIR/postgres" ]]; then
    rm -rf "${ROOT}/data/postgres"
    mkdir -p "${ROOT}/data"
    mv "$ACR_STASH_TMPDIR/postgres" "${ROOT}/data/postgres"
  fi
  if [[ -n "$ACR_STASH_TMPDIR" && -d "$ACR_STASH_TMPDIR/ncert_source" ]]; then
    rm -rf "${ROOT}/ncert_source"
    mv "$ACR_STASH_TMPDIR/ncert_source" "${ROOT}/ncert_source"
  fi
  if [[ -n "$ACR_STASH_TMPDIR" && -d "$ACR_STASH_TMPDIR/web-next" ]]; then
    rm -rf "${ROOT}/web/.next"
    mv "$ACR_STASH_TMPDIR/web-next" "${ROOT}/web/.next"
  fi
  if [[ -n "$ACR_STASH_TMPDIR" && -d "$ACR_STASH_TMPDIR" ]]; then
    rm -rf "$ACR_STASH_TMPDIR"
    ACR_STASH_TMPDIR=""
  fi
  ACR_CONTEXT_PREPARED=""
}

prepare_acr_build_context() {
  [[ -n "$ACR_CONTEXT_PREPARED" ]] && return 0

  # Must stash outside the repo: az acr build tars the whole tree and still
  # walks ignored paths, so in-repo stash dirs hit the same socket error.
  rm -rf "${ROOT}/.deploy-stash"

  ACR_STASH_TMPDIR="$(mktemp -d "${TMPDIR:-/tmp}/bixy-acr-stash.XXXXXX")"
  local stashed=0

  local pg="${ROOT}/data/postgres"
  if [[ -e "$pg" ]]; then
    if [[ -S "${pg}/pgdata/.s.PGSQL.5432" ]]; then
      echo "==> Stashing data/postgres (local socket) outside repo for ACR upload."
      echo "    Restart local Postgres after deploy if you use the embedded dev database."
    else
      echo "==> Stashing data/postgres outside repo for ACR upload."
    fi
    mv "$pg" "$ACR_STASH_TMPDIR/postgres"
    stashed=1
  fi

  local ncert="${ROOT}/ncert_source"
  if [[ -d "$ncert" ]]; then
    echo "==> Stashing ncert_source/ (~11GB local PDFs) outside repo for ACR upload."
    echo "    Production serves PDFs from Azure Blob; image only needs web/public/ncert/*.json"
    mv "$ncert" "$ACR_STASH_TMPDIR/ncert_source"
    stashed=1
  fi

  local next_cache="${ROOT}/web/.next"
  if [[ -d "$next_cache" ]]; then
    echo "==> Stashing web/.next build cache outside repo for ACR upload."
    mv "$next_cache" "$ACR_STASH_TMPDIR/web-next"
    stashed=1
  fi

  if [[ "$stashed" -eq 1 ]]; then
    trap restore_acr_build_context EXIT INT TERM
  else
    rm -rf "$ACR_STASH_TMPDIR"
    ACR_STASH_TMPDIR=""
  fi
  ACR_CONTEXT_PREPARED=1
}

build_with_acr() {
  local dockerfile="$1"
  local image_name="$2"
  shift 2
  echo "==> ACR build: ${REGISTRY}/${image_name} (${dockerfile})"
  prepare_acr_build_context
  az acr build --registry "$ACR" --image "$image_name" -f "$dockerfile" "$@" .
}

build_with_docker() {
  local dockerfile="$1"
  local target="$2"
  shift 2
  echo "==> Docker build: ${target} (${dockerfile})"
  docker build -f "$dockerfile" -t "$target" "$@" .
  echo "==> Pushing ${target}"
  docker push "$target"
}

deploy_backend() {
  if [[ ! -f Dockerfile.azure.backend ]]; then
    echo "Missing Dockerfile.azure.backend" >&2
    exit 1
  fi
  if [[ "${USE_LOCAL_DOCKER:-}" == "1" ]]; then
    az acr login --name "$ACR"
    build_with_docker Dockerfile.azure.backend "$BACKEND_IMAGE"
  else
    build_with_acr Dockerfile.azure.backend "bixy-backend:${IMAGE_TAG}"
  fi
  echo "==> Updating container app: ${BACKEND_APP}"
  az containerapp update -n "$BACKEND_APP" -g "$RG" --image "$BACKEND_IMAGE"
}

deploy_frontend() {
  if [[ ! -f Dockerfile.azure.frontend ]]; then
    echo "Missing Dockerfile.azure.frontend" >&2
    exit 1
  fi
  if [[ "${USE_LOCAL_DOCKER:-}" == "1" ]]; then
    az acr login --name "$ACR"
    build_with_docker Dockerfile.azure.frontend "$FRONTEND_IMAGE" \
      --build-arg "NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}"
  else
    build_with_acr Dockerfile.azure.frontend "bixy-frontend:${IMAGE_TAG}" \
      --build-arg "NEXT_PUBLIC_API_BASE=${NEXT_PUBLIC_API_BASE}"
  fi
  echo "==> Updating container app: ${FRONTEND_APP}"
  az containerapp update -n "$FRONTEND_APP" -g "$RG" --image "$FRONTEND_IMAGE"
}

TARGET="${1:-all}"

echo "Azure ACR deploy"
echo "  RG:       ${RG}"
echo "  ACR:      ${REGISTRY}"
echo "  Tag:      ${IMAGE_TAG}"
echo "  API URL:  ${NEXT_PUBLIC_API_BASE}"
echo "  Mode:     $([[ "${USE_LOCAL_DOCKER:-}" == "1" ]] && echo 'local docker' || echo 'az acr build')"
echo ""

case "$TARGET" in
  backend)  deploy_backend ;;
  frontend) deploy_frontend ;;
  all)
    deploy_backend
    deploy_frontend
    ;;
  *)
    echo "Usage: $0 [backend|frontend|all]" >&2
    exit 1
    ;;
esac

echo ""
echo "Done."
BACKEND_FQDN="$(az containerapp show -n "$BACKEND_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv 2>/dev/null || echo '?')"
FRONTEND_FQDN="$(az containerapp show -n "$FRONTEND_APP" -g "$RG" --query properties.configuration.ingress.fqdn -o tsv 2>/dev/null || echo '?')"
echo "  Backend:  https://${BACKEND_FQDN}"
echo "  Frontend: https://${FRONTEND_FQDN}"
echo ""
echo "Images in ACR:"
echo "  ${BACKEND_IMAGE}"
echo "  ${FRONTEND_IMAGE}"
