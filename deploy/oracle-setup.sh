#!/usr/bin/env bash
# One-shot setup for Bage on an Oracle Cloud "Always Free" Ubuntu VM (Ampere A1 / ARM or AMD).
# Usage (on the VM):   curl -fsSL https://raw.githubusercontent.com/harshpriyegit/Bage/main/deploy/oracle-setup.sh | sudo bash
# Re-running it later updates the app to the latest commit on GitHub. Your data is kept.
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/harshpriyegit/Bage.git}"
APP_DIR=/opt/bage
DATA_DIR=/var/lib/bage
APP_USER=bage
PORT=3001

if [ "$(id -u)" -ne 0 ]; then echo "Run with sudo"; exit 1; fi

echo "==> Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git ca-certificates gnupg debian-keyring debian-archive-keyring apt-transport-https iptables-persistent

if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "==> Installing Node.js 24"
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi

if ! command -v caddy >/dev/null; then
  echo "==> Installing Caddy (automatic HTTPS)"
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "==> Creating app user and folders"
id -u "$APP_USER" >/dev/null 2>&1 || useradd --system --create-home --shell /usr/sbin/nologin "$APP_USER"
mkdir -p "$DATA_DIR" && chown -R "$APP_USER:$APP_USER" "$DATA_DIR"

echo "==> Fetching code"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" fetch --depth 1 origin main && git -C "$APP_DIR" reset --hard origin/main
else
  git clone --depth 1 "$REPO_URL" "$APP_DIR"
fi
chown -R "$APP_USER:$APP_USER" "$APP_DIR"

echo "==> Installing dependencies and building"
sudo -u "$APP_USER" bash -c "cd $APP_DIR && npm ci && npm run build"

echo "==> Creating service"
cat > /etc/systemd/system/bage.service <<EOF
[Unit]
Description=Bage dashboard
After=network.target

[Service]
User=$APP_USER
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=DATA_DIR=$DATA_DIR
Environment=TRUST_PROXY=1
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable bage
systemctl restart bage

echo "==> Opening ports 80/443 in the VM firewall"
for p in 80 443; do
  iptables -C INPUT -p tcp --dport $p -j ACCEPT 2>/dev/null || iptables -I INPUT 6 -m state --state NEW -p tcp --dport $p -j ACCEPT
done
netfilter-persistent save

PUBLIC_IP=$(curl -fsSL https://api.ipify.org || curl -fsSL https://ifconfig.me)
DOMAIN="${DOMAIN:-${PUBLIC_IP//./-}.sslip.io}"

echo "==> Configuring HTTPS for $DOMAIN"
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
  encode gzip
  request_body {
    max_size 50MB
  }
  reverse_proxy 127.0.0.1:$PORT
}
EOF
systemctl reload caddy || systemctl restart caddy

sleep 3
CODE=$(curl -sS "http://127.0.0.1:$PORT/api/me" -o /dev/null -w '%{http_code}' 2>/dev/null || true)
if [ "$CODE" = "200" ] || [ "$CODE" = "401" ]; then
  echo "App is running."
else
  echo "App status:"; systemctl --no-pager status bage | tail -n 20
fi

echo
echo "======================================================"
echo " Done!  Open:  https://$DOMAIN"
echo " First visit: create your account on the sign-up screen."
echo " Logs:   sudo journalctl -u bage -f"
echo " Update: run this same command again."
echo "======================================================"
