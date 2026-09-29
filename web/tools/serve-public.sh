#!/usr/bin/env bash
# Run the whole game from this machine and hand out a public https link.
#
#   web/tools/serve-public.sh            build if needed, serve, print the URL
#   PORT=9000 web/tools/serve-public.sh  use another local port
#
# One node process serves the built client AND the Colyseus server (mounted at /ws), so a single
# cloudflared quick tunnel covers both — the client finds the server on its own origin. Ctrl+C stops
# everything. The link dies with this process; it is for playtests, not for production.
set -euo pipefail
web=$(cd "$(dirname "$0")/.." && pwd)
port=${PORT:-8791}
bin="$web/tools/bin"
mkdir -p "$bin" "$web/server/data"

if [ ! -x "$bin/cloudflared" ]; then
  echo "· downloading cloudflared"
  curl -sSL -o "$bin/cloudflared" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
  chmod +x "$bin/cloudflared"
fi
if [ ! -f "$web/dist/index.html" ]; then
  echo "· building the client"
  (cd "$web" && npm run build >/dev/null)
fi

game=""
if curl -fsS -o /dev/null "http://localhost:$port/" 2>/dev/null; then
  echo "· a game server is already running on :$port — tunnelling to that one"
  echo "  (stop it with: fuser -k $port/tcp)"
else
  echo "· starting game server on :$port"
  ( cd "$web" && BKO_BASE_PATH=/ws BKO_STATIC="$web/dist" BKO_DATA="$web/server/data" PORT="$port" npx tsx server/index.ts ) &
  game=$!
  for _ in $(seq 60); do curl -fsS -o /dev/null "http://localhost:$port/" 2>/dev/null && break; sleep 1; done
  curl -fsS -o /dev/null "http://localhost:$port/" 2>/dev/null || { echo "!! the server did not come up — is :$port taken by something else? (fuser -k $port/tcp)"; exit 1; }
fi
trap 'kill ${game:-} $tunnel 2>/dev/null || true' EXIT INT TERM   # tsx needs a few seconds to boot

log=$(mktemp)
"$bin/cloudflared" tunnel --url "http://localhost:$port" --no-autoupdate > "$log" 2>&1 &
tunnel=$!
for _ in $(seq 60); do
  url=$(grep -o 'https://[a-z0-9-]*\.trycloudflare\.com' "$log" | head -1) && [ -n "$url" ] && break
  sleep 0.5
done

echo
echo "  PLAY:  ${url:-<tunnel failed, see $log>}"
echo "  local: http://localhost:$port/"
echo "  saves: $web/server/data   ·  Ctrl+C to stop"
echo
if [ -n "$game" ]; then wait $game; else wait $tunnel; fi
