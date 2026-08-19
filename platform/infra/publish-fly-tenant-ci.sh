#!/usr/bin/env bash
# CI port of publish-fly.ps1 (tenant overlay only). Requires FLY_API_TOKEN.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENGINE="$ROOT/wayne-agent"
TOML="$ROOT/platform/wayne-fly/fly.wayne-w4y.toml"

BASE_IMAGE="$(grep -E 'BASE_IMAGE\s*=' "$TOML" | head -1 | sed -E 's/.*"(registry[^"]+)".*/\1/')"
BASE_TAG="${BASE_IMAGE##*:}"
TENANT_TAG="fly$(( ${BASE_TAG#fly} + 1 ))"

echo "Fly tenant overlay: base=$BASE_TAG → publish=$TENANT_TAG"

node "$ROOT/platform/wayne-fly/prepare-fly-overlay.mjs"

STAGE="$ENGINE/.fly-ui-overlay"
rm -rf "$STAGE"
mkdir -p "$STAGE/opt/wayne/tools" "$STAGE/opt/wayne/tui_gateway" "$STAGE/opt/wayne/wayne_cli"

cp "$ENGINE/tools/desktop_body.py" "$STAGE/opt/wayne/tools/"
cp "$ENGINE/tools/file_tools.py" "$STAGE/opt/wayne/tools/"
cp "$ENGINE/tools/terminal_tool.py" "$STAGE/opt/wayne/tools/"
cp "$ENGINE/tui_gateway/server.py" "$STAGE/opt/wayne/tui_gateway/"
cp -r "$ENGINE/work4you_cli/app_dist" "$STAGE/opt/wayne/wayne_cli/"
cp "$ENGINE/work4you_cli/platform_tenant.wayne.py" "$STAGE/opt/wayne/wayne_cli/platform_tenant.py"
cp "$ENGINE/work4you_cli/web_server.wayne.py" "$STAGE/opt/wayne/wayne_cli/web_server.py"

cd "$ENGINE"
flyctl deploy --build-only --push --remote-only \
  --dockerfile "$ROOT/platform/wayne-fly/Dockerfile.ui" \
  --build-arg "BASE_IMAGE=registry.fly.io/wayne-w4y:$BASE_TAG" \
  --image-label "$TENANT_TAG" \
  -c "$ROOT/platform/wayne-fly/fly.wayne-w4y.toml"

IMAGE="registry.fly.io/wayne-w4y:$TENANT_TAG"
MACHINES="$(flyctl machines list -a wayne-w4y --json)"
echo "$MACHINES" | node -e "
const ids = JSON.parse(require('fs').readFileSync(0,'utf8')).map(m => m.id);
if (!ids.length) process.exit(2);
console.log(ids.join(' '));
" | while read -r -a IDS; do
  for id in "${IDS[@]}"; do
    flyctl machine update "$id" --image "$IMAGE" -a wayne-w4y -y
  done
done

echo "OK wayne-w4y:$TENANT_TAG"
echo "tenant_fly_tag=$TENANT_TAG"
