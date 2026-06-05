#!/usr/bin/env bash
# DEPRECATED — do not use with headless/Railway. Use: npm run export-cookies
# Optional: copies main Chrome profile into bot data dir. Close Chrome first.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
set -a
[ -f "$ROOT/.env" ] && . "$ROOT/.env"
set +a

SOURCE_DATA="${CHROME_USER_DATA_DIR:-$HOME/.config/google-chrome}"
SOURCE_PROFILE="${CHROME_PROFILE:-Profile 1}"
BOT_DATA="${CHROME_BOT_DATA_DIR:-$HOME/.config/linkedin-bot-chrome}"
LOCK="$SOURCE_DATA/SingletonLock"

if [ -L "$LOCK" ]; then
  target="$(readlink "$LOCK" 2>/dev/null || true)"
  pid="${target##*-}"
  if [ -n "$pid" ] && kill -0 "$pid" 2>/dev/null; then
    echo "Close Chrome first, then run: ./scripts/sync-profile.sh"
    exit 1
  fi
fi

mkdir -p "$BOT_DATA"
echo "Syncing $SOURCE_PROFILE → $BOT_DATA/Default ..."
rsync -a --delete "$SOURCE_DATA/$SOURCE_PROFILE/" "$BOT_DATA/Default/"
if [ -f "$SOURCE_DATA/Local State" ]; then
  cp -a "$SOURCE_DATA/Local State" "$BOT_DATA/Local State"
fi
echo "Profile synced. Run: node index.js"
