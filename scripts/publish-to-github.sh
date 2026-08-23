#!/usr/bin/env bash
# Publish this tree to https://github.com/MadanMohan0537/Pulse-Auth
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
REMOTE_URL="https://github.com/MadanMohan0537/Pulse-Auth.git"

if git remote get-url github >/dev/null 2>&1; then
  git remote set-url github "$REMOTE_URL"
else
  git remote add github "$REMOTE_URL"
fi

git push -u github main
echo "Published to $REMOTE_URL"
