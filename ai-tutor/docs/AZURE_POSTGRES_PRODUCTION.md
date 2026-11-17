# Azure PostgreSQL — Production Runbook

Production database and deployment guide for **VidyaSetu LMS** on Azure Container Apps.

See also: [VIDYASETU.md](./VIDYASETU.md) (local dev, demo accounts, smoke tests).

---

## Overview

| Component | Name | Region |
|-----------|------|--------|
| Resource group | `bixy-rg` | Central India |
| PostgreSQL server | `bixy-pg-prod` | Central India |
| Database | `AiTutor` | — |
| Backend | `bixy-backend` | Central India |
| Frontend | `bixy-frontend` | Central India |
| Container registry | `bixyacr1777288905` | Central India |

**Production URLs**

| Service | URL |
|---------|-----|
| Backend API | `https://bixy-backend.jollybay-27d8f37d.centralindia.azurecontainerapps.io` |
| Frontend | `https://bixy-frontend.jollybay-27d8f37d.centralindia.azurecontainerapps.io` |

**Repo tooling**

| File | Purpose |
|------|---------|
| `scripts/verify_database_url.py` | Verify `DATABASE_URL` connectivity |
| `scripts/sync_azure_production_env.sh` | Push `.env` to `bixy-backend` |
| `scripts/deploy_azure_acr.sh` | Build images in ACR + update Container Apps |
| `scripts/deploy_azure_full.sh` | DB verify + env sync + `deploy_azure_acr.sh` |
| `.env.example` | Local vs production variable template |
| `.azure-deploy-vars` | `RG`, `ACR`, `BACKEND_APP`, `FRONTEND_APP` (see `.azure-deploy-vars.example`) |

---

## Deployment checklist

- [ ] PostgreSQL server and `AiTutor` database created
- [ ] `DATABASE_URL` set in `.env` and verified (`verify_database_url.py`)
- [ ] `LMS_JWT_SECRET` set (no trailing commas on numeric env vars)
- [ ] Env synced to Container App (`sync_azure_production_env.sh`)
- [ ] Backend + frontend images built and pushed
- [ ] Container Apps updated to new images
- [ ] Backend logs show `LMS database initialized`
- [ ] Login works on production frontend

---

## 1. Create PostgreSQL (Portal)

1. [Azure Portal](https://portal.azure.com) → **Azure Database for PostgreSQL flexible server**
2. **Basics:** `bixy-rg` · Central India · server `bixy-pg-prod` · PostgreSQL **16** · admin user (e.g. `aitutoradmin`)
3. **Networking:** public access on · allow Azure services · add dev machine IP for local testing
4. **Create**, then **Databases** → add **`AiTutor`**

Reset password: server **Overview** → **Reset password**.

---

## 2. Configure environment

Add to `.env` (see `.env.example` production block):

```env
DATABASE_URL=postgresql+psycopg2://ADMIN_USER:PASSWORD@bixy-pg-prod.postgres.database.azure.com:5432/AiTutor?sslmode=require
LMS_JWT_SECRET=<long-random-string>
LMS_JWT_EXPIRE_HOURS=72
PRODUCTION_MODE=true
TRANSCRIPT_LIVE_FETCH=false
NEXT_PUBLIC_API_BASE=https://bixy-backend.jollybay-27d8f37d.centralindia.azurecontainerapps.io
```

Notes:

- `sslmode=require` is mandatory on Azure.
- URL-encode special characters in the password (`@` → `%40`).
- Password in `.env` must match the Portal admin password exactly.

---

## 3. Verify connection

```bash
python3 scripts/verify_database_url.py
```

Expected output:

```text
OK — connected
database: AiTutor
```

If this fails, check firewall rules and password before continuing.

### Optional: test LMS against Azure DB locally

Keep Azure `DATABASE_URL`, but point the frontend at the local backend:

```env
NEXT_PUBLIC_API_BASE=http://localhost:8001
```

```bash
python3 scripts/start_web.py
```

Confirm backend log contains `LMS database initialized`, then test login at `http://localhost:4004/login`.

---

## 4. Sync secrets to Azure backend

Requires Azure CLI login (`az login` — separate from Portal browser session).

```bash
az account show
chmod +x scripts/sync_azure_production_env.sh
./scripts/sync_azure_production_env.sh
```

Updates `bixy-backend` secrets/env and restarts the revision. Re-run after any `.env` change.

---

## 5. Deploy container images (ACR)

Env sync does **not** update application code. Build in **Azure Container Registry** and roll out to Container Apps:

```bash
# One-shot: verify DB → sync .env → build in ACR → update both apps
chmod +x scripts/deploy_azure_full.sh scripts/deploy_azure_acr.sh
./scripts/deploy_azure_full.sh
```

Images only (skip env sync):

```bash
export NEXT_PUBLIC_API_BASE=https://bixy-backend.jollybay-27d8f37d.centralindia.azurecontainerapps.io
./scripts/deploy_azure_acr.sh              # backend + frontend
./scripts/deploy_azure_acr.sh backend      # backend only
./scripts/deploy_azure_acr.sh frontend     # frontend only
```

Optional:

```bash
IMAGE_TAG=latest ./scripts/deploy_azure_acr.sh
USE_LOCAL_DOCKER=1 ./scripts/deploy_azure_acr.sh   # docker build + push (needs Docker)
```

Dockerfiles: `Dockerfile.azure.backend`, `Dockerfile.azure.frontend`.

---

## 6. Verify production

1. **bixy-backend** → Log stream → `LMS database initialized`
2. Open production frontend URL → login with demo accounts in [VIDYASETU.md](./VIDYASETU.md)

On first startup against an empty database, `init_db()` creates tables and seeds demo users automatically.

---

## 7. Restore local development

```env
DATABASE_URL=postgresql+psycopg2://AiTutor:aitutor123@localhost:5432/AiTutor
NEXT_PUBLIC_API_BASE=http://localhost:8001
PRODUCTION_MODE=false
TRANSCRIPT_LIVE_FETCH=true
```

Production Container Apps keep their own secrets — local `.env` changes do not affect Azure.

---

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| `password authentication failed` | Reset password in Portal; update `.env` |
| Connection timeout from Mac | Add current public IP to server firewall |
| `LMS database initialized` missing (live) | Deploy new backend image (section 5) |
| Login 404 (production) | Deploy backend + frontend images (section 5) |
| Login 404 (`localhost:4004`) | Set `NEXT_PUBLIC_API_BASE=http://localhost:8001` |
| `invalid literal for int(): '72,'` | Remove trailing comma from `LMS_JWT_EXPIRE_HOURS` |

---

## Architecture

| Client | Database access |
|--------|-----------------|
| `bixy-backend` (production) | `DATABASE_URL` secret → SQLAlchemy → Azure Postgres |
| `bixy-frontend` | API calls only — never connects to Postgres |
| Local dev | `localhost:5432` (or Azure URL for integration testing) |
