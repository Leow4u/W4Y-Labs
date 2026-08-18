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
  [string]$TenantTag = "fly254",
  [string]$ProvisionerTag = "p9",
  [string]$BaseTenantTag = "fly252",
  [switch]$SkipTenant,
  [switch]$SkipProvisioner
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"

# docker e fly escrevem o progresso em stderr. Com ErrorActionPreference=Stop cada
# uma dessas linhas vira erro terminante e o script morre antes de o trabalho
# arrancar. Dobrar stderr em stdout desarma isso; o veredito continua a ser o
# código de saída.
function Invoke-Native {
  param(
    [Parameter(Mandatory)][string]$Exe,
    [Parameter(Mandatory)][string[]]$Arguments,
    [Parameter(Mandatory)][string]$What
  )
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Exe @Arguments 2>&1 | Out-Host } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)" }
}

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
    $img = "registry.fly.io/provisioner-w4y:$ProvisionerTag"
    Invoke-Native docker @('build', '-t', $img, '.') 'provisioner docker build'
    Invoke-Native $fly @('auth', 'docker') 'fly auth docker'
    Invoke-Native docker @('push', $img) 'provisioner push'
    Invoke-Native $fly @('deploy', '--image', $img, '-a', 'provisioner-w4y', '--remote-only') 'provisioner deploy'
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
    # Stage F3 motor + SPA into ONE tree so Dockerfile.ui can COPY a single
    # layer. fly251 is at the overlayfs ceiling — a second COPY/RUN fails with
    # "invalid argument" on Depot too.
    $stage = Join-Path $engineRoot ".fly-ui-overlay"
    if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
    $toolsDst = Join-Path $stage "opt\wayne\tools"
    $gwDst = Join-Path $stage "opt\wayne\tui_gateway"
    $cliDst = Join-Path $stage "opt\wayne\wayne_cli"
    $authDst = Join-Path $cliDst "dashboard_auth"
    New-Item -ItemType Directory -Force -Path $toolsDst, $gwDst, $cliDst, $authDst | Out-Null
    # desktop_body has no work4you_* imports; the rest need .wayne.py renames
    # so the Fly base (wayne_cli / wayne_constants) can import them.
    Copy-Item (Join-Path $engineRoot "tools\desktop_body.py") $toolsDst
    Copy-Item (Join-Path $engineRoot "tools\file_tools.wayne.py") (Join-Path $toolsDst "file_tools.py")
    Copy-Item (Join-Path $engineRoot "tools\terminal_tool.wayne.py") (Join-Path $toolsDst "terminal_tool.py")
    Copy-Item (Join-Path $engineRoot "tui_gateway\server.wayne.py") (Join-Path $gwDst "server.py")
    Copy-Item (Join-Path $engineRoot "work4you_cli\app_dist") (Join-Path $cliDst "app_dist") -Recurse
    Copy-Item (Join-Path $engineRoot "work4you_cli\platform_tenant.wayne.py") (Join-Path $cliDst "platform_tenant.py")
    Copy-Item (Join-Path $engineRoot "work4you_cli\web_server.wayne.py") (Join-Path $cliDst "web_server.py")
    # Auth/SSO variants — fly252 shipped a corrupted platform_sso.py
    # (`function _secret` SyntaxError → 500 on /auth/platform-sso).
    foreach ($name in @(
      "platform_sso", "routes", "cookies", "middleware", "login_page", "ws_tickets"
    )) {
      Copy-Item (
        Join-Path $engineRoot "work4you_cli\dashboard_auth\$name.wayne.py"
      ) (Join-Path $authDst "$name.py")
    }
    Write-Host "Staged single-layer overlay at .fly-ui-overlay/" -ForegroundColor Cyan

    # Builds on Fly's remote builder, never locally. Each tag adds layers on top
    # of the previous one and the base crossed 496 layers in ago/2026: the local
    # docker driver then refuses the first COPY with "mount options is too long",
    # because overlayfs takes the lowerdir list in a single 4096-byte mount
    # option. The remote builder does not have that ceiling — but it still
    # rejects *additional* COPY/RUN on this base, so the stage above matters.
    Invoke-Native $fly @(
      'deploy', '--build-only', '--push', '--remote-only',
      '--dockerfile', (Join-Path $script:REPO_ROOT "platform\wayne-fly\Dockerfile.ui"),
      '--build-arg', "BASE_IMAGE=registry.fly.io/wayne-w4y:$BaseTenantTag",
      '--image-label', $TenantTag,
      '-c', (Join-Path $script:REPO_ROOT "platform\wayne-fly\fly.wayne-w4y.toml")
    ) 'tenant ui remote build'

    # `fly deploy --image` would try to CREATE a machine here: the wayne-w4y
    # machine predates Fly Launch and carries no process group, so deploy does
    # not recognise it as its own and fails on volume capacity in gru. Update
    # the machines that exist instead.
    $prevEap = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    $machinesJson = (& $fly machines list -a wayne-w4y --json 2>$null) -join "`n"
    $ErrorActionPreference = $prevEap
    $machines = @($machinesJson | ConvertFrom-Json)
    if (-not $machines) { throw "wayne-w4y has no machines to update" }
    foreach ($m in $machines) {
      Invoke-Native $fly @(
        'machine', 'update', $m.id, '--image', "registry.fly.io/wayne-w4y:$TenantTag",
        '-a', 'wayne-w4y', '-y'
      ) "machine $($m.id) update"
    }
    Write-Host "OK wayne-w4y:$TenantTag" -ForegroundColor Green
    Write-Host "Actualize TENANT_WAYNE_IMAGE / WAYNE_IMAGE para registry.fly.io/wayne-w4y:$TenantTag e corra deploy-web.ps1" -ForegroundColor Yellow
  } finally { Pop-Location }
}

Write-Host "Done." -ForegroundColor Green
