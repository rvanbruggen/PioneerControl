#!/usr/bin/env bash
# deploy.sh — Sync RixPioneerControl to the NAS and restart the proxy.
#
# Usage (from anywhere inside the repo):
#   ./deploy.sh
#
# First-time setup:
#   Copy your SSH public key to the NAS so you're not prompted for a
#   password on every deploy:
#     ssh-copy-id rikvanbruggen@192.168.68.79
#
# NOTE: sources.md is intentionally excluded from the sync.
#   It is meant to be edited directly on the NAS to change default input
#   sources for all users.  Deploy it manually the very first time:
#     scp sources.md rikvanbruggen@192.168.68.79:/volume1/homes/rikvanbruggen/RixPioneerControl/

set -euo pipefail

# ---- Settings — update here if your network layout changes ----
NAS_USER="rikvanbruggen"
NAS_HOST="192.168.68.79"
NAS_DIR="/volume1/homes/rikvanbruggen/RixPioneerControl"
AMP_IP="192.168.68.60"
PROXY_PORT="8080"

# ---- Resolve project root from this script's location ----
LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

SSH="ssh -i $HOME/.ssh/id_ed25519"
# -n redirects stdin from /dev/null; needed for non-interactive (scripted) use
# so SSH never blocks waiting for terminal input.  The tar pipe uses $SSH without
# -n because it needs to read the archive from stdin.
SSHN="ssh -n -i $HOME/.ssh/id_ed25519"

# ----------------------------------------------------------------
echo "==> Copying files to NAS (${NAS_HOST})..."
# Synology blocks both rsync-over-SSH (PAM auth layer) and scp (SFTP subsystem
# disabled). Piping tar over a plain SSH channel works on all Synology setups.
$SSHN "${NAS_USER}@${NAS_HOST}" "mkdir -p '${NAS_DIR}'"
cd "${LOCAL_DIR}"
COPYFILE_DISABLE=1 tar cf - \
    index.html app.js style.css proxy.py \
    manifest.json icon.svg sw.js README.md \
    | $SSH "${NAS_USER}@${NAS_HOST}" "tar xf - -C '${NAS_DIR}' 2>/dev/null"

echo ""
echo "==> Restarting proxy on NAS..."
# Stop the old proxy by killing the process listening on the proxy port.
# We look up the PID via netstat rather than using pkill -f, because pkill -f
# matches the SSH shell itself (whose argv contains "proxy.py") and would kill
# the SSH session before the new proxy can start.
$SSHN "${NAS_USER}@${NAS_HOST}" "
  PID=\$(netstat -tlnp 2>/dev/null | grep ':${PROXY_PORT} ' | awk '{print \$7}' | cut -d/ -f1)
  if [ -n \"\$PID\" ]; then
    kill \"\$PID\" && echo \"Stopped old proxy (PID \$PID).\"
    sleep 1
  fi
  cd '${NAS_DIR}'
  nohup /usr/bin/python3 proxy.py '${AMP_IP}' '${PROXY_PORT}' 0.0.0.0 < /dev/null >> proxy.log 2>&1 &
  sleep 2
  netstat -tlnp 2>/dev/null | grep -q ':${PROXY_PORT} ' && echo 'Proxy running on port ${PROXY_PORT}.' || echo 'WARNING: proxy did not start — check proxy.log on NAS'
"

echo ""
echo "==> Deployment complete."
echo "    App: http://${NAS_HOST}:${PROXY_PORT}/"
