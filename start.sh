#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then
  set -a; source .env; set +a
fi

PORT=${PORT:-8080}
export PORT
export SESSION_SECRET=${SESSION_SECRET:-nw_fallback_secret_change_in_production}
export DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID:-}
export DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET:-}
export DISCORD_REDIRECT_URI=${DISCORD_REDIRECT_URI:-}
export ADMIN_DISCORD_USER_IDS=${ADMIN_DISCORD_USER_IDS:-}

# Warn if Discord not configured
if [ -z "$DISCORD_CLIENT_ID" ] || [ -z "$DISCORD_CLIENT_SECRET" ]; then
  echo "  [!] Warning: DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET not set in .env"
  echo "      Discord login will show a 503 error until configured."
fi

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   NEW WORLD  v6  —  starting             ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""
echo "  Port   : $PORT"
echo "  URL    : http://localhost:$PORT"
echo ""

# Re-wire frontend if rebuilt since last install
if [ -d "artifacts/new-world/dist/public" ]; then
  rm -rf artifacts/api-server/public
  cp -r artifacts/new-world/dist/public artifacts/api-server/public
fi

mkdir -p artifacts/api-server/data

cd artifacts/api-server

if [ -f "dist/index.mjs" ]; then
  exec node --enable-source-maps dist/index.mjs
else
  echo "  [!] dist/index.mjs not found — run install.sh first"
  exit 1
fi
