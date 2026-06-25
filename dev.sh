#!/usr/bin/env bash
set -euo pipefail

if [ -f .env ]; then set -a; source .env; set +a; fi

API_PORT=${PORT:-8080}
FRONTEND_PORT=${FRONTEND_PORT:-3000}
export PORT=$API_PORT API_PORT=$API_PORT FRONTEND_PORT=$FRONTEND_PORT
export SESSION_SECRET=${SESSION_SECRET:-nw_fallback_secret}
export DISCORD_CLIENT_ID=${DISCORD_CLIENT_ID:-}
export DISCORD_CLIENT_SECRET=${DISCORD_CLIENT_SECRET:-}
export DISCORD_REDIRECT_URI=${DISCORD_REDIRECT_URI:-}
export ADMIN_DISCORD_USER_IDS=${ADMIN_DISCORD_USER_IDS:-}

echo ""
echo "  NEW WORLD v6 — dev mode"
echo "  Frontend : http://localhost:$FRONTEND_PORT  (Vite HMR)"
echo "  API      : http://localhost:$API_PORT/api"
echo "  (Ctrl+C stops both)"
echo ""

mkdir -p artifacts/api-server/data

cleanup() { kill 0 2>/dev/null; }
trap cleanup SIGINT SIGTERM

(cd artifacts/api-server && node build.mjs --silent 2>/dev/null && \
  PORT=$API_PORT node --enable-source-maps dist/index.mjs) &

(cd artifacts/new-world && \
  FRONTEND_PORT=$FRONTEND_PORT API_PORT=$API_PORT pnpm run dev) &

wait
