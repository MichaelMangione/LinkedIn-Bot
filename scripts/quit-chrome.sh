#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
set +a

CHROME="${CHROME_PATH:-/opt/google/chrome/google-chrome}"
USER_DATA="${CHROME_USER_DATA_DIR:-$HOME/.config/google-chrome}"
LOCK="$USER_DATA/SingletonLock"

echo "Closing Chrome..."

if [ -L "$LOCK" ]; then
  target="$(readlink "$LOCK" 2>/dev/null || true)"
  pid="${target##*-}"
  if [ -n "$pid" ] && [ "$pid" -eq "$pid" ] 2>/dev/null; then
    kill "$pid" 2>/dev/null || true
    sleep 1
    kill -9 "$pid" 2>/dev/null || true
  fi
fi

pkill -f "$CHROME" 2>/dev/null || true
pkill -f google-chrome 2>/dev/null || true
pkill -x chrome 2>/dev/null || true

is_lock_alive() {
  [ ! -L "$LOCK" ] && [ ! -e "$LOCK" ] && return 1
  if [ -L "$LOCK" ]; then
    target="$(readlink "$LOCK" 2>/dev/null || true)"
    pid="${target##*-}"
    if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
      return 0
    fi
    rm -f "$LOCK" "$USER_DATA/SingletonSocket" "$USER_DATA/SingletonCookie" 2>/dev/null || true
    return 1
  fi
  return 0
}

for _ in $(seq 1 80); do
  is_lock_alive || break
  sleep 0.25
done

if is_lock_alive; then
  echo "Chrome is still running. Use the menu: Chrome → Exit (or kill from System Monitor)."
  exit 1
fi

echo "Chrome closed."
