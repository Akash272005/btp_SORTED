#!/usr/bin/env bash
# Push environment variables from .env (or env/azure-production.env) to bixy-backend.
#
# Prerequisites: Azure CLI logged in (`az login`), PostgreSQL server created, DATABASE_URL set.
#
# Usage:
#   ./scripts/sync_azure_production_env.sh
#   ./scripts/sync_azure_production_env.sh env/azure-production.env
#
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${1:-.env}"
if [[ ! -f "$ENV_FILE" ]]; then
  echo "Env file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ -f .azure-deploy-vars ]]; then
  # shellcheck disable=SC1091
  source .azure-deploy-vars
fi

RG="${RG:-bixy-rg}"
BACKEND_APP="${BACKEND_APP:-bixy-backend}"

if [[ -z "${ACR:-}" ]]; then
  echo "Warning: ACR not set in .azure-deploy-vars (image deploy is separate)." >&2
fi

python3 - "$ENV_FILE" "$RG" "$BACKEND_APP" <<'PY'
import os
import re
import subprocess
import sys
from pathlib import Path

from dotenv import dotenv_values

env_file = Path(sys.argv[1])
rg = sys.argv[2]
app = sys.argv[3]

values = {k: v for k, v in dotenv_values(env_file).items() if v is not None and str(v).strip() != ""}

db_url = values.get("DATABASE_URL", "")
if not db_url:
    sys.exit("DATABASE_URL missing in env file")
if "YOUR_PASSWORD" in db_url or "REPLACE" in db_url.upper():
    sys.exit("DATABASE_URL still has placeholders — create Azure Postgres first (docs/AZURE_POSTGRES_PRODUCTION.md)")

jwt = values.get("LMS_JWT_SECRET", "")
if not jwt or jwt.startswith("generate-with"):
    sys.exit("Set LMS_JWT_SECRET in env file before syncing")

# Never push local-only paths to cloud
skip_prefixes = ("SSL_CERT_FILE",)
skip_exact = {"BACKEND_PORT", "FRONTEND_PORT", "GOOGLE_VISION_CREDENTIALS_PATH"}

secret_keys = {
    "DATABASE_URL",
    "LMS_JWT_SECRET",
    "LLM_API_KEY",
    "EMBEDDING_API_KEY",
    "SPEECH_KEY",
    "TAVILY_API_KEY",
    "AZURE_SEARCH_KEY",
    "AZURE_STORAGE_CONNECTION_STRING",
    "AZURE_BLOB_ACCOUNT_KEY",
    "YOUTUBE_API_KEY",
    "YOUTUBE_TRANSCRIPT_HTTPS_PROXY",
    "GOOGLE_VISION_API_KEY",
    "IMAGE_GEN_API_KEY",
    "SEARCH_API_KEY",
}

secrets = []
env_vars = []

for key, val in sorted(values.items()):
    if key in skip_exact or key.startswith(skip_prefixes):
        continue
    slug = key.lower().replace("_", "-")
    if key in secret_keys:
        secrets.append(f"{slug}={val}")
        env_vars.append(f"{key}=secretref:{slug}")
    else:
        env_vars.append(f"{key}={val}")

print(f"Syncing {len(values)} keys from {env_file} → {app} ({rg})")

subprocess.run(
    ["az", "containerapp", "secret", "set", "-n", app, "-g", rg, "--secrets", *secrets],
    check=True,
)

subprocess.run(
    [
        "az",
        "containerapp",
        "update",
        "-n",
        app,
        "-g",
        rg,
        "--set-env-vars",
        *env_vars,
    ],
    check=True,
)

safe_db = re.sub(r":([^:@/]+)@", ":****@", db_url)
print("Done. DATABASE_URL:", safe_db[:120])
print("Backend will restart with new revision. Check logs for: LMS database initialized")
PY
