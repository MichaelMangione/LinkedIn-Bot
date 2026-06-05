#!/usr/bin/env bash
# Run the v1.1 daemon (5 cycles/day, active hours, verify every 30 min).
# Use with systemd or: nohup ./scripts/run-daemon.sh >> logs/daemon.log 2>&1 &
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p logs

if [[ -f "$ROOT/.env" ]]; then
  set -a
  # shellcheck disable=SC1091
  source "$ROOT/.env"
  set +a
fi

export DISPLAY="${DISPLAY:-:0}"

# Optional: force Chrome to use bot profile dir from .env
export CHROME_PATH="${CHROME_PATH:-/opt/google/chrome/google-chrome}"

echo "=== $(date -Iseconds) LinkedIn bot daemon starting ==="
echo "Project: $ROOT"
echo "DISPLAY=$DISPLAY"

exec node src/daemon.js
