#!/usr/bin/env bash
# One-command launcher for the Free To Use audio spike.
#
# It (1) builds the server, (2) opens a public Cloudflare tunnel (no account
# needed), (3) starts the MCP server wired to that tunnel address, and (4)
# prints the URL to paste into Claude. Press Ctrl+C to stop everything.
#
# The tunnel address is RANDOM and changes every run, so each time you start
# this you must update the connector URL in Claude.
set -uo pipefail
cd "$(dirname "$0")"

# Clear any leftover server/tunnel from a previous run. A stale server still
# holding port 3000 is the usual cause of a fresh launch "not connecting".
echo "Clearing any leftovers from a previous run..."
PIDS="$(lsof -ti:3000 2>/dev/null)"; [ -n "$PIDS" ] && kill $PIDS 2>/dev/null || true
pkill -f "cloudflared tunnel --url http://localhost:3000" 2>/dev/null || true
sleep 1

echo "1/3  Building the server + widget..."
npm run build

echo "2/3  Opening a public tunnel (this takes ~15 seconds)..."
LOG="$(mktemp)"
npx -y cloudflared tunnel --url http://localhost:3000 >"$LOG" 2>&1 &
TUNNEL_PID=$!
trap 'kill "$TUNNEL_PID" 2>/dev/null' EXIT INT TERM

URL=""
for _ in $(seq 1 45); do
  URL="$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$LOG" | head -1)"
  [ -n "$URL" ] && break
  sleep 1
done

if [ -z "$URL" ]; then
  echo "Tunnel failed to start. Details:"
  cat "$LOG"
  exit 1
fi

echo "3/3  Starting the server..."
echo
echo "=================================================================="
echo "  PASTE THIS INTO CLAUDE as the connector URL (keep the /mcp):"
echo
echo "      $URL/mcp"
echo
echo "  Leave this window open while testing. Ctrl+C stops everything."
echo "=================================================================="
echo
PUBLIC_URL="$URL" node dist/server.js
