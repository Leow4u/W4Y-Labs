# Actualiza apps Fly de tenants existentes para a imagem pinada (cérebro).
# Contas novas já nascem no pin do provisioner; contas velhas ficam atrasadas
# até este roll (sintoma típico: SSO 500 em app.work4you.ai/auth/platform-sso).
#
# Uso:
#   cd platform/infra
#   .\roll-tenant-image.ps1 -Apps wayne-rafael-santos-558b29b,wayne-flavia-xxxx
#   .\roll-tenant-image.ps1 -EmailHints rafael,flavia   # resolve via `fly apps list`
#   .\roll-tenant-image.ps1 -Image registry.fly.io/wayne-w4y:fly252 -AllWayneApps
#
[CmdletBinding()]
param(
  [string]$Image = 'registry.fly.io/wayne-w4y:fly252',
  [string[]]$Apps = @(),
  [string[]]$EmailHints = @(),
  [switch]$AllWayneApps,
  [switch]$DryRun
)

$ErrorActionPreference = 'Stop'
$fly = (Get-Command fly -ErrorAction SilentlyContinue).Source
if (-not $fly) { $fly = (Get-Command flyctl -ErrorAction SilentlyContinue).Source }
if (-not $fly) { throw 'fly CLI not found' }

& $fly auth whoami | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'fly not authenticated — run fly auth login' }

function Invoke-Native {
  param([string]$Exe, [string[]]$Arguments, [string]$What)
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { & $Exe @Arguments 2>&1 | Out-Host } finally { $ErrorActionPreference = $prev }
  if ($LASTEXITCODE -ne 0) { throw "$What failed (exit $LASTEXITCODE)" }
}

$targets = [System.Collections.Generic.List[string]]::new()
foreach ($a in $Apps) {
  $n = ($a -replace '^wayne-', 'wayne-').Trim()
  if ($n -and $n -notmatch '^wayne-') { $n = "wayne-$n" }
  if ($n) { [void]$targets.Add($n) }
}

if ($EmailHints.Count -gt 0 -or $AllWayneApps) {
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $json = (& $fly apps list --json 2>$null) -join "`n"
  $ErrorActionPreference = $prev
  $all = @($json | ConvertFrom-Json)
  foreach ($row in $all) {
    $name = [string]$row.Name
    if ($name -notmatch '^wayne-') { continue }
    if ($name -eq 'wayne-w4y') { continue } # frota de clientes, não o motor partilhado interno
    if ($AllWayneApps) {
      [void]$targets.Add($name)
      continue
    }
    foreach ($h in $EmailHints) {
      $hint = ($h -replace '@.*$', '' -replace '[^a-z0-9]+', '-').ToLower()
      if ($hint -and $name -like "wayne-$hint*") {
        [void]$targets.Add($name)
      }
    }
  }
}

$unique = $targets | Select-Object -Unique
if (-not $unique -or $unique.Count -eq 0) {
  throw 'Nenhuma app alvo. Passa -Apps ou -EmailHints (rafael, flavia) ou -AllWayneApps.'
}

Write-Host "== Roll tenant image -> $Image ==" -ForegroundColor Cyan
Write-Host ("Apps: " + ($unique -join ', '))

foreach ($app in $unique) {
  Write-Host "-- $app" -ForegroundColor Yellow
  $prev = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  $machinesJson = (& $fly machines list -a $app --json 2>$null) -join "`n"
  $ErrorActionPreference = $prev
  $machines = @()
  try { $machines = @($machinesJson | ConvertFrom-Json) } catch { $machines = @() }
  if (-not $machines -or $machines.Count -eq 0) {
    Write-Host "  (sem máquinas — skip)" -ForegroundColor DarkYellow
    continue
  }
  foreach ($m in $machines) {
    if ($DryRun) {
      Write-Host "  DRY machine $($m.id) -> $Image"
      continue
    }
    Invoke-Native $fly @(
      'machine', 'update', $m.id, '--image', $Image, '-a', $app, '-y'
    ) "machine $($m.id) on $app"
  }
  Write-Host "OK $app" -ForegroundColor Green
}

Write-Host 'Done.' -ForegroundColor Green
