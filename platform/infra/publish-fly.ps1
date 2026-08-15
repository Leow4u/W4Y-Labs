# Publica imagens Fly (provisioner + tenant UI overlay) após build:web.
# Requer: fly auth login, docker, gcloud (para nada aqui — só fly registry).
#
# Usage:
#   cd platform/infra
#   .\publish-fly.ps1 [-TenantTag fly230] [-ProvisionerTag p4] [-SkipTenant] [-SkipProvisioner]
#
# Ordem: build:web (apps/work4you) → este script → deploy-web.ps1 (se TENANT_WAYNE_IMAGE mudou).

[CmdletBinding()]
param(
  [string]$TenantTag = "fly238",
  [string]$ProvisionerTag = "p4",
  [string]$BaseTenantTag = "fly230",
  [switch]$SkipTenant,
  [switch]$SkipProvisioner
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"

$fly = (Get-Command fly -ErrorAction SilentlyContinue).Source
if (-not $fly) { throw "fly CLI not found" }
& $fly auth whoami | Out-Null
if ($LASTEXITCODE -ne 0) { throw "fly not authenticated - run fly auth login" }

$engineRoot = Join-Path $script:REPO_ROOT "wayne-agent"
$appDist = Join-Path $engineRoot "work4you_cli\app_dist\index.html"
if (-not (Test-Path $appDist)) {
  throw "app_dist missing - run: cd wayne-agent/apps/work4you; npm run build:web"
}

if (-not $SkipProvisioner) {
  Write-Host "== Provisioner $ProvisionerTag ==" -ForegroundColor Cyan
  Push-Location (Join-Path $script:REPO_ROOT "platform\provisioner")
  try {
    docker build -t "registry.fly.io/provisioner-w4y:$ProvisionerTag" .
    if ($LASTEXITCODE -ne 0) { throw "provisioner docker build failed" }
    & $fly auth docker
    docker push "registry.fly.io/provisioner-w4y:$ProvisionerTag"
    if ($LASTEXITCODE -ne 0) { throw "provisioner push failed" }
    & $fly deploy --image "registry.fly.io/provisioner-w4y:$ProvisionerTag" -a provisioner-w4y --remote-only
    if ($LASTEXITCODE -ne 0) { throw "provisioner deploy failed" }
    Write-Host "OK provisioner-w4y:$ProvisionerTag" -ForegroundColor Green
  } finally { Pop-Location }
}

if (-not $SkipTenant) {
  Write-Host "== Tenant UI overlay wayne-w4y:$TenantTag (base $BaseTenantTag) ==" -ForegroundColor Cyan

  # Dockerfile.ui copies GENERATED `.wayne.py` variants (the base image still
  # uses the pre-rebrand package names). Regenerate before the build: without
  # this, editing work4you_cli/web_server.py fixes the desktop while the cloud
  # keeps serving the stale copy, with nothing to signal the divergence.
  $overlayGen = Join-Path $script:REPO_ROOT "platform\wayne-fly\prepare-fly-overlay.mjs"
  & node $overlayGen | Out-Host
  if ($LASTEXITCODE -ne 0) { throw "Fly overlay variant generation failed" }
  # Plain `*.wayne.py`: git pathspec `**/` would miss the top-level
  # wayne_state.wayne.py, and that is one of the variants Dockerfile.ui ships.
  $drifted = (& git -C $script:REPO_ROOT status --porcelain -- "*.wayne.py")
  if ($drifted) {
    Write-Host "Variantes do overlay estavam DESACTUALIZADAS e foram regeneradas - faca commit:" -ForegroundColor Yellow
    $drifted | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
  }

  Push-Location $engineRoot
  try {
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    docker build -f (Join-Path $script:REPO_ROOT "platform\wayne-fly\Dockerfile.ui") `
      --build-arg "BASE_IMAGE=registry.fly.io/wayne-w4y:$BaseTenantTag" `
      -t "registry.fly.io/wayne-w4y:$TenantTag" . 2>&1 | Out-Host
    $ErrorActionPreference = $prevEap
    if ($LASTEXITCODE -ne 0) { throw "tenant ui docker build failed" }
    & $fly auth docker
    docker push "registry.fly.io/wayne-w4y:$TenantTag"
    if ($LASTEXITCODE -ne 0) { throw "tenant push failed" }
    & $fly deploy --image "registry.fly.io/wayne-w4y:$TenantTag" `
      -c (Join-Path $script:REPO_ROOT "platform\wayne-fly\fly.wayne-w4y.toml") --remote-only
    if ($LASTEXITCODE -ne 0) { throw "wayne-w4y deploy failed" }
    Write-Host "OK wayne-w4y:$TenantTag" -ForegroundColor Green
    Write-Host "Actualize TENANT_WAYNE_IMAGE / WAYNE_IMAGE para registry.fly.io/wayne-w4y:$TenantTag e corra deploy-web.ps1" -ForegroundColor Yellow
  } finally { Pop-Location }
}

Write-Host "Done." -ForegroundColor Green
