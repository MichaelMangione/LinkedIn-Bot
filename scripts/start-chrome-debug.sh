#!/usr/bin/env bash
# If Chrome is already open, flags are ignored — use restart-chrome-debug.sh instead.
exec "$(dirname "$0")/restart-chrome-debug.sh" "$@"
