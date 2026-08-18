# Build the Work4You image locally for linux/amd64 (Cloud Run target).
# Two stages: the upstream-close base image, then the thin Cloud Run overlay
# (platform/wayne-cloudrun) that seeds config.yaml + runs `gateway run`.
#
# Secrets are NEVER baked in: wayne-agent/.dockerignore excludes .env/.env.*,
# and .secrets/ lives outside the build context entirely.
#
# Usage:  .\build-wayne-local.ps1 [-Tag <tag>]
[CmdletBinding()]
param([string]$Tag)

. "$PSScriptRoot\_env.ps1"
if (-not $Tag) { $Tag = Get-ImageTag }

$baseTag      = "wayne-agent-base:$Tag"
$overlayImage = "${script:IMAGE_REPO}:$Tag"
$overlayLatest = "${script:IMAGE_REPO}:latest"

Write-Host "== [1/2] base image  -> $baseTag  (linux/amd64) ==" -ForegroundColor Cyan
docker build --platform linux/amd64 `
    -t $baseTag `
    -f "$script:REPO_ROOT\wayne-agent\Dockerfile" `
    "$script:REPO_ROOT\wayne-agent"
if ($LASTEXITCODE -ne 0) { throw "base build failed" }

Write-Host "== [2/2] Cloud Run overlay -> $overlayImage  (linux/amd64) ==" -ForegroundColor Cyan
docker build --platform linux/amd64 `
    --build-arg "BASE_IMAGE=$baseTag" `
    -t $overlayImage -t $overlayLatest `
    -f "$script:REPO_ROOT\platform\wayne-cloudrun\Dockerfile" `
    "$script:REPO_ROOT\platform\wayne-cloudrun"
if ($LASTEXITCODE -ne 0) { throw "overlay build failed" }

Write-Host ""
Write-Host "BUILT: $overlayImage" -ForegroundColor Green
Write-Host "       $overlayLatest (convenience tag)"
Write-Host "TAG:   $Tag"
Write-Host "Next:  .\push-wayne-image.ps1 -Tag $Tag"
