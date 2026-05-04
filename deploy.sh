#!/usr/bin/env bash
# =============================================================================
# ChipIn — VPS deployment script
# Run as root on the Hetzner server:  bash /opt/kafotech/chipin/deploy.sh
# =============================================================================
set -euo pipefail

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; BOLD='\033[1m'; NC='\033[0m'
info()    { echo -e "${CYAN}▶ $*${NC}"; }
success() { echo -e "${GREEN}✔ $*${NC}"; }
warn()    { echo -e "${YELLOW}⚠ $*${NC}"; }
die()     { echo -e "${RED}✘ $*${NC}" >&2; exit 1; }

# ─── Config ───────────────────────────────────────────────────────────────────
APP_DIR="/opt/kafotech/chipin"
BACKEND="$APP_DIR/backend"
FRONTEND="$APP_DIR/frontend"
VENV="$BACKEND/venv"
APP_USER="kafotech"
DOMAIN="chipin.kafotech.io"
API_PORT="8002"
PYTHON="python3.12"
NGINX_CONF="/etc/nginx/sites-available/kafotech"
NGINX_ENABLED="/etc/nginx/sites-enabled/kafotech"

# ─── 0. Pre-flight ────────────────────────────────────────────────────────────
[[ $EUID -eq 0 ]] || die "Run this script as root (sudo bash deploy.sh)"
command -v "$PYTHON" >/dev/null 2>&1 || die "$PYTHON not found. Install python3.12 first."
command -v nginx    >/dev/null 2>&1 || die "nginx not found. Install it first."
command -v psql     >/dev/null 2>&1 || die "psql not found. Install postgresql first."
command -v node     >/dev/null 2>&1 || die "node not found. Install Node.js (>=18) first."
command -v npm      >/dev/null 2>&1 || die "npm not found."

success "Pre-flight checks passed"

# ─── 1. System user ───────────────────────────────────────────────────────────
info "Setting up system user '$APP_USER'…"
if ! id "$APP_USER" &>/dev/null; then
    useradd --system --no-create-home --shell /usr/sbin/nologin "$APP_USER"
    success "User '$APP_USER' created"
else
    success "User '$APP_USER' already exists"
fi
# Ensure app dir is owned by kafotech so the service can write logs
chown -R "$APP_USER":"$APP_USER" "$APP_DIR"

# ─── 2. Python virtualenv ─────────────────────────────────────────────────────
info "Creating / updating Python virtualenv…"
if [[ ! -d "$VENV" ]]; then
    "$PYTHON" -m venv "$VENV"
fi
"$VENV/bin/pip" install --quiet --upgrade pip wheel
"$VENV/bin/pip" install --quiet -r "$BACKEND/requirements.txt"
success "Python dependencies installed"

# ─── 3. .env file ─────────────────────────────────────────────────────────────
info "Checking backend .env…"
if [[ ! -f "$BACKEND/.env" ]]; then
    cp "$BACKEND/.env.example" "$BACKEND/.env"
    warn ".env created from .env.example — EDIT IT NOW before continuing!"
    warn "Required: DATABASE_URL, SECRET_KEY, STRIPE_*, META_*, FRONTEND_URL, ALLOWED_ORIGINS"
    echo
    read -r -p "Press ENTER once you have filled in $BACKEND/.env …"
fi
# Verify the minimum required vars are not empty stubs
for var in DATABASE_URL SECRET_KEY; do
    if ! grep -Eq "^${var}=.+" "$BACKEND/.env"; then
        die "$var is empty in .env — please fill it in and re-run."
    fi
done
success ".env looks populated"

# ─── 4. PostgreSQL ────────────────────────────────────────────────────────────
info "Setting up PostgreSQL…"
# Extract password from DATABASE_URL  (format: postgresql+asyncpg://user:pass@host/db)
DB_URL=$(grep "^DATABASE_URL=" "$BACKEND/.env" | cut -d= -f2-)
DB_USER=$(echo "$DB_URL" | sed -E 's|.*://([^:]+):.*|\1|')
DB_PASS=$(echo "$DB_URL" | sed -E 's|.*://[^:]+:([^@]+)@.*|\1|')
DB_NAME=$(echo "$DB_URL" | sed -E 's|.*/([^?]+).*|\1|')

if ! sudo -u postgres psql -tAc "SELECT 1 FROM pg_roles WHERE rolname='$DB_USER'" | grep -q 1; then
    sudo -u postgres psql -c "CREATE USER $DB_USER WITH PASSWORD '$DB_PASS';"
    success "PostgreSQL user '$DB_USER' created"
else
    # Update password in case it changed
    sudo -u postgres psql -c "ALTER USER $DB_USER WITH PASSWORD '$DB_PASS';"
    success "PostgreSQL user '$DB_USER' already exists (password synced)"
fi

if ! sudo -u postgres psql -lqt | cut -d'|' -f1 | grep -qw "$DB_NAME"; then
    sudo -u postgres psql -c "CREATE DATABASE $DB_NAME OWNER $DB_USER;"
    success "Database '$DB_NAME' created"
else
    success "Database '$DB_NAME' already exists"
fi

# Grant connect / usage for safety
sudo -u postgres psql -d "$DB_NAME" -c "GRANT ALL PRIVILEGES ON DATABASE $DB_NAME TO $DB_USER;" >/dev/null

# ─── 5. Alembic migrations ────────────────────────────────────────────────────
info "Running database migrations…"
cd "$BACKEND"
"$VENV/bin/alembic" upgrade head
success "Migrations applied"

# ─── 6. Frontend build ────────────────────────────────────────────────────────
info "Building frontend…"
cd "$FRONTEND"
npm ci --silent
# VITE_API_URL must include /v1 — our axios base URL appends paths like /campaigns
VITE_API_URL="https://${DOMAIN}/api/v1" npm run build -- --mode production
success "Frontend built → $FRONTEND/dist"

# ─── 7. Systemd services ──────────────────────────────────────────────────────
info "Writing systemd service files…"

cat > /etc/systemd/system/chipin-api.service <<EOF
[Unit]
Description=ChipIn API (FastAPI/Uvicorn)
After=network.target postgresql.service

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$BACKEND
EnvironmentFile=$BACKEND/.env
ExecStart=$VENV/bin/uvicorn app.main:app \\
    --host 127.0.0.1 \\
    --port $API_PORT \\
    --workers 2 \\
    --proxy-headers \\
    --forwarded-allow-ips='127.0.0.1'
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

cat > /etc/systemd/system/chipin-worker.service <<EOF
[Unit]
Description=ChipIn ARQ Background Worker
After=network.target

[Service]
Type=simple
User=$APP_USER
WorkingDirectory=$BACKEND
EnvironmentFile=$BACKEND/.env
ExecStart=$VENV/bin/python -m arq app.workers.main.WorkerSettings
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now chipin-api chipin-worker
success "Services enabled and started"
sleep 2

# Quick health check
if curl -sf "http://127.0.0.1:${API_PORT}/api/health" | grep -q '"ok"'; then
    success "API health check passed ✔"
else
    warn "API health check failed — check: journalctl -u chipin-api -n 50"
fi

# ─── 8. Nginx ─────────────────────────────────────────────────────────────────
info "Writing Nginx server block to $NGINX_CONF…"

# Only append the chipin block if not already present
if grep -q "server_name ${DOMAIN}" "$NGINX_CONF" 2>/dev/null; then
    warn "Nginx block for $DOMAIN already present — skipping write"
else
    cat >> "$NGINX_CONF" <<'NGINX'

# ── ChipIn ────────────────────────────────────────────────────────────────────
# SSE streams — no buffering (must be before the generic /api/ block)
# Nginx prefix match: longer prefix /api/v1/p/ beats /api/
server {
    listen 443 ssl;
    server_name chipin.kafotech.io;

    ssl_certificate     /etc/letsencrypt/live/kafotech.io/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/kafotech.io/privkey.pem;
    include             /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam         /etc/letsencrypt/ssl-dhparams.pem;

    # Real-time SSE — disable all buffering
    location /api/v1/p/ {
        proxy_pass         http://127.0.0.1:8002;
        proxy_http_version 1.1;
        proxy_set_header   Connection '';
        proxy_buffering    off;
        proxy_cache        off;
        proxy_read_timeout 86400s;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        chunked_transfer_encoding on;
    }

    # Stripe webhook — raw body passthrough (signature verification needs it)
    location = /api/v1/webhooks/stripe {
        proxy_pass              http://127.0.0.1:8002;
        proxy_request_buffering off;
        proxy_set_header        Host              $host;
        proxy_set_header        X-Real-IP         $remote_addr;
        proxy_set_header        X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header        X-Forwarded-Proto $scheme;
    }

    # All other API requests — URI is passed unchanged (no trailing slash on proxy_pass)
    location /api/ {
        proxy_pass         http://127.0.0.1:8002;
        proxy_set_header   Host              $host;
        proxy_set_header   X-Real-IP         $remote_addr;
        proxy_set_header   X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
    }

    # React SPA — all non-API paths serve index.html
    location / {
        root       /opt/kafotech/chipin/frontend/dist;
        try_files  $uri /index.html;
        add_header Cache-Control "public, max-age=3600";
    }

    # Cache hashed assets forever
    location ~* \.(js|css|woff2?|png|svg|ico)$ {
        root       /opt/kafotech/chipin/frontend/dist;
        expires    1y;
        add_header Cache-Control "public, immutable";
    }
}

server {
    listen 80;
    server_name chipin.kafotech.io;
    return 301 https://$host$request_uri;
}
NGINX
    success "Nginx block written"
fi

# ─── 9. SSL ───────────────────────────────────────────────────────────────────
info "Checking SSL certificate…"
CERT_PATH="/etc/letsencrypt/live/kafotech.io/fullchain.pem"
if [[ -f "$CERT_PATH" ]]; then
    success "Wildcard / existing cert found at $CERT_PATH — no certbot needed"
else
    warn "No cert found. Running certbot for $DOMAIN…"
    command -v certbot >/dev/null 2>&1 || apt-get install -y certbot python3-certbot-nginx -q
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "admin@kafotech.io"
fi

# Ensure site is enabled
if [[ ! -L "$NGINX_ENABLED" ]]; then
    ln -sf "$NGINX_CONF" "$NGINX_ENABLED"
fi

# Validate and reload
nginx -t && systemctl reload nginx
success "Nginx reloaded"

# ─── 10. Smoke test checklist ─────────────────────────────────────────────────
echo
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Deployment complete — smoke test checklist   ${NC}"
echo -e "${BOLD}═══════════════════════════════════════════════${NC}"
echo
echo -e "  ${CYAN}Services${NC}"
echo    "  systemctl status chipin-api"
echo    "  systemctl status chipin-worker"
echo    "  journalctl -u chipin-api -f"
echo
echo -e "  ${CYAN}Manual checks${NC}"
echo    "  [ ] https://chipin.kafotech.io            → React app loads"
echo    "  [ ] /login → enter email → magic link arrives"
echo    "  [ ] Log in, create a campaign, copy public link"
echo    "  [ ] Open /p/{slug} in mobile browser → board shows"
echo    "  [ ] Click 'Chip In', use test card 4242 4242 4242 4242"
echo    "  [ ] Board updates in real time (SSE flash)"
echo    "  [ ] WhatsApp confirmation received on contributor's phone"
echo    "  [ ] Organizer earnings tab shows platform fee"
echo
echo -e "  ${CYAN}Stripe webhook${NC}"
echo    "  Register: https://chipin.kafotech.io/api/v1/webhooks/stripe"
echo    "  Events:   checkout.session.completed"
echo    "            payment_intent.payment_failed"
echo    "            charge.refunded"
echo    "  Copy STRIPE_WEBHOOK_SECRET → $BACKEND/.env → restart chipin-api"
echo
echo -e "  ${CYAN}Meta webhook${NC}"
echo    "  Register: https://chipin.kafotech.io/api/v1/webhooks/meta"
echo    "  Verify token: value of META_VERIFY_TOKEN in .env"
echo
echo -e "  ${YELLOW}After updating .env:${NC}"
echo    "  systemctl restart chipin-api chipin-worker"
echo
