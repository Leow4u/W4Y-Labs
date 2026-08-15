#!/usr/bin/env bash
# Work4You one-liner bootstrap — published as gs://w4y-engine-dist/install.sh
# Resolves the engine ZIP from latest.json, then runs the full installer.
set -euo pipefail

FEED_URL='https://storage.googleapis.com/w4y-engine-dist/latest.json'
INSTALLER_URL='https://storage.googleapis.com/w4y-engine-dist/work4you-install.sh'

if [ -z "${WORK4YOU_SOURCE_ZIP_URL:-}" ] && [ -z "${WAYNE_SOURCE_ZIP_URL:-}" ]; then
    if command -v python3 >/dev/null 2>&1; then
        WORK4YOU_SOURCE_ZIP_URL="$(python3 -c "import json, urllib.request; print(json.load(urllib.request.urlopen('${FEED_URL}'))['zipUrl'])")"
    elif command -v python >/dev/null 2>&1; then
        WORK4YOU_SOURCE_ZIP_URL="$(python -c "import json, urllib.request; print(json.load(urllib.request.urlopen('${FEED_URL}'))['zipUrl'])")"
    else
        WORK4YOU_SOURCE_ZIP_URL="$(curl -fsSL "$FEED_URL" | sed -n 's/.*"zipUrl"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -1)"
    fi
    if [ -z "$WORK4YOU_SOURCE_ZIP_URL" ]; then
        echo "error: latest.json is missing zipUrl" >&2
        exit 1
    fi
    export WORK4YOU_SOURCE_ZIP_URL
fi

exec bash <(curl -fsSL "$INSTALLER_URL") "$@"
