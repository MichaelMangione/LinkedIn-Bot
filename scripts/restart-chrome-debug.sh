#!/usr/bin/env bash
# Chrome 145+ blocks remote debugging on ~/.config/google-chrome.
# Use quit-chrome.sh + node index.js instead.
echo "This project no longer uses remote debugging on your main Chrome profile."
echo "Run: ./scripts/quit-chrome.sh && node index.js"
exec "$(dirname "$0")/quit-chrome.sh"
