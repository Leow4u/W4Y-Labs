#!/usr/bin/env bash
# Cursor Cloud Agent Build install — tools needed to publish Fly overlays.
# Secrets (FLY_API_TOKEN) come from the Cloud Agents Secrets tab, not this file.
set -euo pipefail

echo "== Cloud tools: flyctl =="
if ! command -v fly >/dev/null 2>&1; then
  curl -L https://fly.io/install.sh | sh
  export PATH="$HOME/.fly/bin:$PATH"
  if ! grep -q '.fly/bin' "$HOME/.bashrc" 2>/dev/null; then
    echo 'export PATH="$HOME/.fly/bin:$PATH"' >> "$HOME/.bashrc"
  fi
fi
fly version || true

echo "== Cloud tools: node (if missing) =="
if ! command -v node >/dev/null 2>&1; then
  echo "node not found — Cloud Agent image should ship Node; aborting install" >&2
  exit 1
fi
node -v

echo "OK cloud tools ready (auth via FLY_API_TOKEN Runtime Secret)"