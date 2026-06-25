#!/usr/bin/env bash
set -euo pipefail

echo ""
echo "  ╔══════════════════════════════════════════╗"
echo "  ║   NEW WORLD  v6  —  install              ║"
echo "  ╚══════════════════════════════════════════╝"
echo ""

# ── 1. Node check ──────────────────────────────────────────────────────────────
NODE_MIN=20
if command -v node &>/dev/null; then
  NODE_VER=$(node -e "process.stdout.write(process.versions.node.split('.')[0])")
  if [ "$NODE_VER" -lt "$NODE_MIN" ]; then
    echo "[!] Node $NODE_MIN+ required (found $NODE_VER)."
    exit 1
  fi
  echo "[ok] Node $(node --version)"
else
  echo "[!] Node.js not found — install from https://nodejs.org"
  exit 1
fi

# ── 2. pnpm ────────────────────────────────────────────────────────────────────
if ! command -v pnpm &>/dev/null; then
  echo "[..] Installing pnpm..."
  npm install -g pnpm@latest --silent
fi
echo "[ok] pnpm $(pnpm --version)"

# ── 3. Deps ────────────────────────────────────────────────────────────────────
echo "[..] Installing workspace dependencies..."
pnpm install --no-frozen-lockfile

# ── 4. Build frontend ──────────────────────────────────────────────────────────
echo "[..] Building frontend..."
pnpm --filter @workspace/new-world run build
echo "[ok] Frontend → artifacts/new-world/dist/public/"

# ── 5. Build API server ────────────────────────────────────────────────────────
echo "[..] Building API server..."
(cd artifacts/api-server && node build.mjs)
echo "[ok] API server → artifacts/api-server/dist/"

# ── 6. Wire frontend into API server ──────────────────────────────────────────
echo "[..] Wiring frontend into API server..."
rm -rf artifacts/api-server/public
cp -r artifacts/new-world/dist/public artifacts/api-server/public
echo "[ok] Wired at artifacts/api-server/public/"

# ── 7. Seed data directory ─────────────────────────────────────────────────────
mkdir -p artifacts/api-server/data
for f in bubbles.json watchlists.json maintenance.json; do
  if [ ! -f "artifacts/api-server/data/$f" ]; then
    case "$f" in
      bubbles.json)    echo '{"byUser":{}}' > "artifacts/api-server/data/$f" ;;
      watchlists.json) echo '{}' > "artifacts/api-server/data/$f" ;;
      maintenance.json) echo '{"enabled":false,"message":"","eta":""}' > "artifacts/api-server/data/$f" ;;
    esac
    echo "[ok] Seeded $f"
  fi
done

# sitedata.json — only seed if missing
if [ ! -f "artifacts/api-server/data/sitedata.json" ]; then
  cp "artifacts/api-server/data/sitedata.json.seed" "artifacts/api-server/data/sitedata.json" 2>/dev/null || \
  echo '{"members":[{"id":"m1","handle":"@Paxjest","role":"Founder & Admiral","name":"Paxjest","quote":"Creating chaos since day one.","traits":["Strategy","Leadership","Chaos"],"avatar":"","kanji":"覇","colors":["#a855f7","#ec4899"],"isAwaiting":false},{"id":"m2","handle":"","role":"","name":"","quote":"","traits":["","",""],"avatar":"","kanji":"力","colors":["#3b82f6","#06b6d4"],"isAwaiting":true},{"id":"m3","handle":"","role":"","name":"","quote":"","traits":["","",""],"avatar":"","kanji":"力","colors":["#10b981","#84cc16"],"isAwaiting":true}],"timeline":[{"id":"t1","date":"Jan 2024","label":"New World founded.","icon":"🌊"},{"id":"t2","date":"Mar 2024","label":"First 50 members joined.","icon":"⚔️"},{"id":"t3","date":"Jun 2024","label":"Major alliance formed.","icon":"🤝"},{"id":"t4","date":"Dec 2024","label":"Reached the top of the leaderboard.","icon":"👑"},{"id":"t5","date":"Jun 2025","label":"Season 2 begins.","icon":"🚀"}],"news":[{"id":"n1","date":"Jun 2026","title":"Season 3 Announcement","body":"The crew sets sail once more."},{"id":"n2","date":"May 2026","title":"Recruitment Open","body":"We are looking for skilled fighters."}],"discordInvite":"https://discord.gg/5N9J8Y3atM"}' > "artifacts/api-server/data/sitedata.json"
  echo "[ok] Seeded sitedata.json"
fi

# users.json
if [ ! -f "artifacts/api-server/data/users.json" ]; then
  echo '[]' > "artifacts/api-server/data/users.json"
  echo "[ok] Seeded users.json"
fi

# ── 8. .env ────────────────────────────────────────────────────────────────────
if [ ! -f .env ]; then
  SECRET=$(node -e "const c=require('crypto');process.stdout.write(c.randomBytes(32).toString('hex'))")
  cat > .env << ENV
# New World v6 — environment config
PORT=8080
SESSION_SECRET=$SECRET

# Discord OAuth — fill these in from https://discord.com/developers/applications
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
DISCORD_REDIRECT_URI=https://YOUR_CODESPACE_URL-8080.app.github.dev/api/auth/discord/callback

# Comma-separated Discord user IDs that get admin access automatically
# Find your ID: Discord Settings > Advanced > Developer Mode > right-click your name > Copy User ID
ADMIN_DISCORD_USER_IDS=
ENV
  echo "[ok] .env created — edit DISCORD_* and ADMIN_DISCORD_USER_IDS before starting."
else
  echo "[ok] .env exists — skipping"
fi

echo ""
echo "  ✅  Done! Next steps:"
echo "      1. Edit .env — fill in DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET,"
echo "         DISCORD_REDIRECT_URI, and ADMIN_DISCORD_USER_IDS"
echo "      2. Run: bash start.sh"
echo ""
