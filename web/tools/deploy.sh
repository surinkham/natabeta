#!/usr/bin/env bash
# Deploy the game to the VPS without losing anyone's character.
#   - Saves live in Postgres (database "beastkingdom"; before 2026-09-24 in /var/lib/beastkingdom files), outside the
#     code directory: the copy below never touches them.
#   - Every deploy first snapshots them to /var/backups/beastkingdom/ (the last 20 are kept):
#     db-<UTC>.sql.gz  restore: systemctl stop beastkingdom; runuser -u postgres -- dropdb beastkingdom;
#                      runuser -u postgres -- createdb -O bko beastkingdom; gunzip -c <dump> | runuser -u bko -- psql -q beastkingdom;
#                      systemctl start beastkingdom
#     data-<UTC>.tar.gz (file saves)  restore: systemctl stop beastkingdom && tar -xzf <snapshot> -C /var/lib && systemctl start beastkingdom
#   - The restart is systemd's SIGTERM: Colyseus shuts down gracefully and every online player is saved first.
# Usage: tools/deploy.sh [user@host]      (key: $BKO_KEY, default ~/.ssh/bko_deploy)
set -euo pipefail
HOST=${1:-root@151.246.242.122}
SSH="ssh -i ${BKO_KEY:-$HOME/.ssh/bko_deploy} -o BatchMode=yes"
cd "$(dirname "$0")/.."

npm run build

$SSH "$HOST" 'set -eo pipefail
  mkdir -p /var/backups/beastkingdom
  t=$(date -u +%Y%m%d-%H%M%S)
  if systemctl show beastkingdom -p Environment | grep -q DATABASE_URL; then
    f=/var/backups/beastkingdom/db-$t.sql.gz
    runuser -u postgres -- pg_dump beastkingdom | gzip > "$f"
    echo "backup: $f ($(runuser -u postgres -- psql -tAc "select count(*) from players" beastkingdom) records)"
  else
    f=/var/backups/beastkingdom/data-$t.tar.gz
    tar -czf "$f" -C /var/lib beastkingdom
    echo "backup: $f ($(tar -tzf "$f" | grep -c "\.json$") saves)"
  fi
  ls -1t /var/backups/beastkingdom/*.gz | tail -n +21 | xargs -r rm -f'

lock_before=$($SSH "$HOST" 'sha1sum /opt/beastkingdom/package-lock.json 2>/dev/null | cut -d" " -f1' || true)
# --delete only prunes inside the synced directories; node_modules and the saves are never touched
rsync -az --delete -e "$SSH" --exclude node_modules --exclude 'server/data' --exclude '*.test.ts' --exclude __tests__ \
  package.json package-lock.json tsconfig.json vite.config.ts server shared dist "$HOST:/opt/beastkingdom/"

$SSH "$HOST" "set -e
  cd /opt/beastkingdom
  if [ \"\$(sha1sum package-lock.json | cut -d' ' -f1)\" != '$lock_before' ]; then PATH=/opt/node20/bin:\$PATH npm ci --no-audit --no-fund; fi
  systemctl restart beastkingdom
  for i in \$(seq 30); do ss -ltn | grep -q ':8791 ' && break; sleep 1; done
  systemctl is-active beastkingdom"
curl -fsS -o /dev/null -w "site: %{http_code}\n" "http://${HOST#*@}/"
