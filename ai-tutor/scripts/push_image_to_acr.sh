#!/usr/bin/env bash
# Legacy wrapper — use deploy_azure_acr.sh for split backend/frontend images.
#
# This script now delegates to deploy_azure_acr.sh (recommended for Azure Container Apps).
#
# Usage:
#   ./scripts/push_image_to_acr.sh              # deploy both (same as deploy_azure_acr.sh all)
#   ./scripts/push_image_to_acr.sh backend
#   ./scripts/push_image_to_acr.sh frontend
#
# For env sync + DB verify + deploy:
#   ./scripts/deploy_azure_full.sh
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TARGET="${1:-all}"

echo "Note: push_image_to_acr.sh delegates to deploy_azure_acr.sh" >&2
echo "      For full production deploy use: ./scripts/deploy_azure_full.sh" >&2
echo "" >&2

chmod +x scripts/deploy_azure_acr.sh
exec ./scripts/deploy_azure_acr.sh "$TARGET"
