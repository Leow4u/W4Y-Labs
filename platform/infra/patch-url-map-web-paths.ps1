# Patch GCP URL map w4y-urlmap — route platform (Cloud Run w4y-web) paths that
# would otherwise fall through to Fly (wayne-fly-backend) and hit Wayne auth.
#
# Run after adding new public routes under platform/web (e.g. /download/*).
# Usage: .\patch-url-map-web-paths.ps1 [-DryRun]
param(
    [string]$UrlMap = 'w4y-urlmap',
    [string]$PathMatcher = 'main',
    [switch]$DryRun
)

. "$PSScriptRoot\_env.ps1"

$webBackend = "https://www.googleapis.com/compute/v1/projects/$($script:PROJECT_ID)/global/backendServices/w4y-web-backend"

$ExtraWebPaths = @(
    '/download',
    '/download/*',
    '/device',
    '/device/*',
    '/abrir',
    '/legal',
    '/legal/*',
    '/internal',
    '/internal/*'
)

$tmpDir = Join-Path $env:TEMP "w4y-urlmap-patch-$(Get-Date -Format 'yyyyMMddHHmmss')"
New-Item -ItemType Directory -Path $tmpDir -Force | Out-Null
$src = Join-Path $tmpDir 'w4y-urlmap.yaml'
$dst = Join-Path $tmpDir 'w4y-urlmap.patched.yaml'
$extraJson = Join-Path $tmpDir 'extra-paths.json'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($extraJson, ($ExtraWebPaths | ConvertTo-Json), $utf8NoBom)

Write-Host "== export $UrlMap ==" -ForegroundColor Cyan
& $script:GcloudExe compute url-maps export $UrlMap `
    --project=$script:PROJECT_ID `
    --destination=$src
if ($LASTEXITCODE -ne 0) { throw 'export failed' }

$patchJs = Join-Path $tmpDir 'patch-url-map.cjs'
[System.IO.File]::WriteAllText($patchJs, @'
const fs = require("fs");
const src = process.argv[2];
const dst = process.argv[3];
const extra = JSON.parse(fs.readFileSync(process.argv[4], "utf8"));

let text = fs.readFileSync(src, "utf8").replace(/\r\n/g, "\n");
const missing = extra.filter((p) => !text.includes("\n    - " + p + "\n"));
if (missing.length === 0) {
  fs.writeFileSync(dst, text, "utf8");
  console.log(JSON.stringify({ added: [], note: "already present" }));
  process.exit(0);
}

const insertBlock = missing.map((p) => "    - " + p).join("\n") + "\n";
const anchor = "    - /device/*\n    service: https://www.googleapis.com/compute/v1/projects/";
const idx = text.indexOf(anchor);
if (idx === -1) {
  const fallback = "    - /carreiras/*\n    service: https://www.googleapis.com/compute/v1/projects/";
  const idx2 = text.indexOf(fallback);
  if (idx2 === -1) throw new Error("anchor not found in url map export");
  const patched = text.slice(0, idx2 + "    - /carreiras/*\n".length) + insertBlock + text.slice(idx2 + "    - /carreiras/*\n".length);
  fs.writeFileSync(dst, patched, "utf8");
} else {
  const patched = text.slice(0, idx + "    - /device/*\n".length) + insertBlock + text.slice(idx + "    - /device/*\n".length);
  fs.writeFileSync(dst, patched, "utf8");
}
console.log(JSON.stringify({ added: missing }));
'@, $utf8NoBom)

node $patchJs $src $dst $extraJson
if ($LASTEXITCODE -ne 0) { throw 'patch failed' }

if ($DryRun) {
    Write-Host "DryRun: would import $dst" -ForegroundColor Yellow
    Select-String -Path $dst -Pattern '/download|/device|/abrir|/legal'
    exit 0
}

Write-Host "== import $UrlMap ==" -ForegroundColor Cyan
& $script:GcloudExe compute url-maps import $UrlMap `
    --project=$script:PROJECT_ID `
    --source=$dst `
    --quiet
if ($LASTEXITCODE -ne 0) { throw 'import failed' }

Write-Host "[OK] URL map patched." -ForegroundColor Green
