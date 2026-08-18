#!/usr/bin/env bash
# Publish wayne-w4y UI overlay when Dockerfile.ui COPY fails (overlayfs layer ceiling).
# Prerequisites: fly auth, crane (go-containerregistry), build:web + staged .fly-ui-overlay.
#
# Usage:
#   cd wayne-agent && node ../platform/wayne-fly/prepare-fly-overlay.mjs
#   # stage .fly-ui-overlay like publish-fly.ps1
#   BASE=fly255 TAG=fly256 ./platform/infra/publish-fly-ui-crane.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENGINE="$ROOT/wayne-agent"
STAGE="$ENGINE/.fly-ui-overlay"
BASE_TAG="${BASE:-fly255}"
TAG="${TAG:-fly256}"
IMAGE_BASE="registry.fly.io/wayne-w4y:${BASE_TAG}"
IMAGE_OUT="registry.fly.io/wayne-w4y:${TAG}"

if ! command -v crane >/dev/null 2>&1; then
  echo "crane not found — install from https://github.com/google/go-containerregistry" >&2
  exit 1
fi
if [[ ! -f "$STAGE/opt/wayne/wayne_cli/app_dist/index.html" ]]; then
  echo "missing $STAGE — stage overlay (see publish-fly.ps1) after build:web" >&2
  exit 1
fi

fly auth docker >/dev/null

LAYER="$(mktemp /tmp/w4y-overlay-XXXXXX.tar)"
trap 'rm -f "$LAYER"' EXIT
tar -cf "$LAYER" -C "$STAGE" .
echo "Appending overlay onto ${IMAGE_BASE} → ${IMAGE_OUT}"
crane append -f "$LAYER" -b "$IMAGE_BASE" -t "$IMAGE_OUT"
crane digest "$IMAGE_OUT"
echo "OK ${IMAGE_OUT}"
echo "Next: fly machine update <id> -a wayne-w4y --image ${IMAGE_OUT} --yes"
