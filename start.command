#!/bin/bash
# Double-click this file on macOS to start the Pioneer Amp Control app.
# It starts the local proxy and opens the browser automatically.
# Close this terminal window (or press Ctrl-C) to stop.

cd "$(dirname "$0")"

AMP_IP="${1:-192.168.68.60}"
PORT="${2:-8080}"
URL="http://localhost:$PORT/"

# Check Python is available
if ! command -v python3 &>/dev/null; then
    echo "Error: python3 is not installed."
    read -p "Press Enter to close."
    exit 1
fi

echo "Starting Pioneer Amp Control..."
echo "Amp IP  : $AMP_IP"
echo "App URL : $URL"
echo ""
echo "Press Ctrl-C to stop."
echo ""

# Open the browser after a short delay (gives the server time to start)
(sleep 1 && open "$URL") &

python3 proxy.py "$AMP_IP" "$PORT"
