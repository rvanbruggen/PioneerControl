#!/usr/bin/env bash
# deploy.sh — Sync RixPioneerControl to the NAS and restart the proxy.
#
# Usage (from anywhere inside the repo):
#   ./deploy.sh
#
# First-time setup:
#   Copy your SSH public key to the NAS so you're not prompted for a
#   password on every deploy:
#     ssh-copy-id rikvanbruggen@192.168.68.80
#
# NOTE: sources.md is intentionally excluded from the sync.
#   It is meant to be edited directly on the NAS to change default input
#   sources for all users.  Deploy it manually the very first time:
#     scp sources.md rikvanbruggen@192.168.68.80:/volume1/homes/rikvanbruggen/RixPioneerControl/

set -euo pipefail

# ---- Settings — update here if your network layout changes ----
NAS_USER="rikvanbruggen"
NAS_HOST="192.168.68.80"
NAS_DIR="/volume1/homes/rikvanbruggen/RixPioneerControl"
AMP_IP="192.168.68.60"
PROXY_PORT="8080"

# ---- Resolve project root from this script's location ----
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# ----------------------------------------------------------------
echo "==> Syncing files to NAS (${NAS_HOST})..."
rsync -av --delete \
    --exclude='.git/' \
    --exclude='.DS_Store' \
    --exclude='CLAUDE.md' \
    --exclude='PioneerSources/' \
    --exclude='deploy.sh' \
    --exclude='sources.md' \
    "${LOCAL_DIR}/" \
    "${NAS_USER}@${NAS_HOST}:${NAS_DIR}/"

echo ""
echo "==> Restarting proxy on NAS..."
ssh "${NAS_USER}@${NAS_HOST}" "
    pkill -f 'proxy.py' || true
    sleep 1
    nohup python3 '${NAS_DIR}/proxy.py' '${AMP_IP}' '${PROXY_PORT}' 0.0.0.0 \
        >> '${NAS_DIR}/proxy.log' 2>&1 &
    sleep 1
    echo 'Proxy started (PID: '$(pgrep -f proxy.py || echo unknown)')'
"

echo ""
echo "==> Deployment complete."
echo "    App: http://${NAS_HOST}:${PROXY_PORT}/"
