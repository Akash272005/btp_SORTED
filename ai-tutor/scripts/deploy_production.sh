#!/bin/bash
# =============================================================================
# bixy_AiTutor — India Data Center Production Deployment Script
# =============================================================================
# Tested on: Ubuntu 22.04 LTS with NVIDIA GPU
# Suitable for: 500 concurrent students, India data residency
#
# Usage:
#   chmod +x scripts/deploy_production.sh
#   sudo ./scripts/deploy_production.sh
#
# For Azure Container Apps + ACR (cloud), use instead:
#   ./scripts/publish_ncert_blob.py --yes          # blob + manifest (first time / PDF update)
#   ./scripts/deploy_azure_full.sh                 # manifest regen + env sync + ACR deploy
#   ./scripts/deploy_azure_acr.sh
#
# Recommended servers (India):
#   - E2E Networks (Mumbai):  RTX 3090  ~₹15,000/month  (cheapest)
#   - AWS ap-south-1 Mumbai:  g4dn.xlarge (T4 GPU) ~₹25,000/month
#   - Azure Central India:    NC4as_T4_v3 ~₹28,000/month
# =============================================================================

set -euo pipefail

# ─── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; NC='\033[0m'

log()  { echo -e "${GREEN}[✔]${NC} $1"; }
warn() { echo -e "${YELLOW}[⚠]${NC} $1"; }
err()  { echo -e "${RED}[✖]${NC} $1"; exit 1; }
info() { echo -e "${BLUE}[i]${NC} $1"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║        bixy_AiTutor — Production Deploy (India DC)          ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# ─── Step 1: System Check ─────────────────────────────────────────────────────
info "Checking system requirements..."
[[ "$EUID" -eq 0 ]] || err "Please run as root: sudo ./scripts/deploy_production.sh"

OS=$(lsb_release -si 2>/dev/null || echo "Unknown")
info "OS: $OS"

# ─── Step 2: Install Docker ───────────────────────────────────────────────────
if ! command -v docker &>/dev/null; then
    log "Installing Docker..."
    curl -fsSL https://get.docker.com | sh
    usermod -aG docker "$SUDO_USER" 2>/dev/null || true
    log "Docker installed."
else
    log "Docker already installed: $(docker --version)"
fi

# ─── Step 3: Install NVIDIA Container Toolkit (for vLLM) ─────────────────────
if command -v nvidia-smi &>/dev/null; then
    log "GPU detected: $(nvidia-smi --query-gpu=name --format=csv,noheader | head -1)"
    if ! dpkg -l | grep -q nvidia-container-toolkit; then
        info "Installing NVIDIA Container Toolkit..."
        distribution=$(. /etc/os-release; echo "$ID$VERSION_ID")
        curl -fsSL https://nvidia.github.io/libnvidia-container/gpgkey | \
            gpg --dearmor -o /usr/share/keyrings/nvidia-container-toolkit-keyring.gpg
        curl -s -L "https://nvidia.github.io/libnvidia-container/$distribution/libnvidia-container.list" | \
            sed 's#deb https://#deb [signed-by=/usr/share/keyrings/nvidia-container-toolkit-keyring.gpg] https://#g' | \
            tee /etc/apt/sources.list.d/nvidia-container-toolkit.list
        apt-get update -qq
        apt-get install -y nvidia-container-toolkit
        systemctl restart docker
        log "NVIDIA Container Toolkit installed."
    else
        log "NVIDIA Container Toolkit already installed."
    fi
else
    warn "No GPU detected. vLLM profile will be unavailable. Using CPU-only mode."
fi

# ─── Step 4: Configure Firewall ───────────────────────────────────────────────
if command -v ufw &>/dev/null; then
    info "Configuring firewall (UFW)..."
    ufw --force enable
    ufw allow 22/tcp    # SSH — always keep open!
    ufw allow 80/tcp    # HTTP (Nginx, for Let's Encrypt challenge)
    ufw allow 443/tcp   # HTTPS
    # Block direct access to internal service ports
    ufw deny 8001/tcp   # Backend — only Nginx should talk to it
    ufw deny 3782/tcp   # Frontend — only Nginx should talk to it
    ufw deny 8000/tcp   # vLLM — internal only
    log "Firewall configured. Open ports: 22, 80, 443"
fi

# ─── Step 5: Set up .env ─────────────────────────────────────────────────────
ENV_FILE="$PROJECT_ROOT/.env"
if [[ ! -f "$ENV_FILE" ]]; then
    cp "$PROJECT_ROOT/.env.example" "$ENV_FILE"
    warn ".env created from .env.example — EDIT IT before starting services!"
    warn "Required: LLM_API_KEY, EMBEDDING_API_KEY"
    warn "Optional: TTS_API_KEY, YOUTUBE_API_KEY"
    echo ""
    echo "  nano $ENV_FILE"
    echo ""
    read -r -p "Press ENTER after editing .env to continue..." _
fi

# ─── Step 6: Set sysctl for high concurrency ──────────────────────────────────
info "Tuning kernel params for high concurrency..."
cat >> /etc/sysctl.conf <<'EOF'
# bixy_AiTutor high-concurrency tuning
net.core.somaxconn = 65535
net.ipv4.tcp_max_syn_backlog = 65535
fs.file-max = 2097152
EOF
sysctl -p

# ─── Step 7: Start Docker Services ───────────────────────────────────────────
cd "$PROJECT_ROOT"

USE_VLLM=${1:-"no"}
if [[ "$USE_VLLM" == "--vllm" ]]; then
    log "Starting bixy_AiTutor + vLLM (GPU mode)..."
    docker compose --profile vllm up -d --build
else
    log "Starting bixy_AiTutor (standard mode)..."
    docker compose up -d --build
fi

# ─── Step 8: Install Nginx + SSL (Certbot) ───────────────────────────────────
if ! command -v nginx &>/dev/null; then
    info "Installing Nginx..."
    apt-get install -y nginx certbot python3-certbot-nginx
    log "Nginx installed."
fi

info "Writing Nginx reverse proxy config..."
NGINX_CONF="/etc/nginx/sites-available/bixy_aitutor"
cat > "$NGINX_CONF" <<'NGINX'
server {
    listen 80;
    server_name _;

    # Frontend
    location / {
        proxy_pass http://127.0.0.1:3782;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }

    # Backend API
    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        client_max_body_size 50M;
    }

    # WebSocket for real-time updates
    location /ws {
        proxy_pass http://127.0.0.1:8001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_read_timeout 600s;
    }
}
NGINX

ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/bixy_aitutor
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
log "Nginx configured."

# ─── Step 9: SSL Certificate ─────────────────────────────────────────────────
echo ""
info "To enable HTTPS, run:"
echo "  certbot --nginx -d your-domain.in"
echo "  (Gets a free SSL cert from Let's Encrypt)"
echo ""

# ─── Step 10: Health Check ───────────────────────────────────────────────────
info "Waiting for services to start..."
sleep 10

if curl -sf "http://localhost:8001/" > /dev/null; then
    log "Backend API is running ✔"
else
    warn "Backend API not responding yet (may still be starting). Check: docker compose logs"
fi

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                  Deployment Complete! 🎉                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║  Frontend:  http://localhost:3782                           ║"
echo "║  Backend:   http://localhost:8001/docs                      ║"
echo "║                                                              ║"
echo "║  Logs:      docker compose logs -f                          ║"
echo "║  Status:    docker compose ps                               ║"
echo "║  vLLM:      docker compose --profile vllm up -d             ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
