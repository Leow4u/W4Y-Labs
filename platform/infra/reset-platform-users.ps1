# Wipe all platform users/tenants (Cloud SQL + secrets + shared motor data).
# Usage: .\reset-platform-users.ps1 [-SkipFlyWipe] [-DestroyDedicatedFlyApps]
[CmdletBinding()]
param(
  [switch]$SkipFlyWipe,
  [switch]$DestroyDedicatedFlyApps
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\_env.ps1"

$FLY = "$env:USERPROFILE\.fly\bin\flyctl.exe"
if (-not (Test-Path $FLY)) { $FLY = (Get-Command flyctl -ErrorAction SilentlyContinue).Source }
$proxyBin = Join-Path $env:USERPROFILE 'google-cloud-sdk\bin\cloud-sql-proxy.exe'
if (-not (Test-Path $proxyBin)) { $proxyBin = (Get-Command cloud-sql-proxy -ErrorAction SilentlyContinue).Source }

function Invoke-Sql([string]$Query) {
  if (-not (Get-Command psql -ErrorAction SilentlyContinue)) { throw 'psql not found' }
  $out = psql $script:LocalDbUrl -t -A -c $Query 2>&1
  if ($LASTEXITCODE -ne 0) { throw "SQL failed: $out" }
  return ($out | Where-Object { $_ -match '\S' })
}

function Start-SqlProxy {
  $conn = "$script:PROJECT_ID`:southamerica-east1:w4y-registry"
  $proc = Start-Process -FilePath $proxyBin -ArgumentList @($conn, '--port=5432') -PassThru -WindowStyle Hidden
  Start-Sleep -Seconds 4
  if ($proc.HasExited) { throw 'cloud-sql-proxy exited early' }
  return $proc
}

function Local-DatabaseUrl([string]$Raw) {
  if ($Raw -match '^postgres(ql)://([^:]+):([^@]+)@[^/]+/(.+)$') {
    return "postgresql://$($Matches[2]):$($Matches[3])@127.0.0.1:5432/$($Matches[4])"
  }
  return $Raw
}

Write-Host '== [1/4] Cloud SQL list ==' -ForegroundColor Cyan
$rawUrl = (gcloud secrets versions access latest --secret=w4y-web-database-url).Trim()
$script:LocalDbUrl = Local-DatabaseUrl $rawUrl
$proxy = Start-SqlProxy
try {
  $tenantIds = @(Invoke-Sql 'SELECT DISTINCT tenant_id FROM users ORDER BY 1')
  $emails = @(Invoke-Sql 'SELECT email FROM users ORDER BY 1')
  $flyApps = @(Invoke-Sql "SELECT DISTINCT fly_app FROM instances WHERE fly_app IS NOT NULL AND fly_app <> '' ORDER BY 1")
  Write-Host ("users: {0}" -f ($emails -join ', '))
  Write-Host ("tenants: {0}" -f ($tenantIds -join ', '))
  Write-Host ("fly apps: {0}" -f ($flyApps -join ', '))
  Write-Host '== [2/4] Cloud SQL wipe ==' -ForegroundColor Cyan
  psql $script:LocalDbUrl -f (Join-Path $PSScriptRoot 'reset-platform-users.sql') | Out-Host
  $left = Invoke-Sql 'SELECT COUNT(*) FROM users'
  if ($left -ne '0') { throw "users still has $left rows" }
  Write-Host 'registry empty' -ForegroundColor Green
}
finally {
  if ($proxy -and -not $proxy.HasExited) { Stop-Process -Id $proxy.Id -Force -ErrorAction SilentlyContinue }
}

Write-Host '== [3/4] Secret Manager ==' -ForegroundColor Cyan
$secretNames = @(gcloud secrets list --filter='name:w4y-tenant-or OR name:w4y-tenant-dash' --format='value(name)' 2>$null) | Where-Object { $_ }
foreach ($name in $secretNames) {
  $id = ($name -split '/')[-1]
  Write-Host "  delete $id"
  gcloud secrets delete $id --quiet 2>&1 | Out-Null
}
Write-Host ("secrets removed: {0}" -f $secretNames.Count) -ForegroundColor Green

if (-not $SkipFlyWipe -and (Test-Path $FLY)) {
  Write-Host '== [4/4] Fly wayne-w4y tenant dirs ==' -ForegroundColor Cyan
  & $FLY ssh console -a wayne-w4y -C 'sh -lc "rm -rf /opt/data/tenants/* 2>/dev/null; ls -la /opt/data/tenants 2>/dev/null || echo empty"' 2>&1 | Out-Host
} else { Write-Host '== [4/4] Fly wipe skipped ==' -ForegroundColor Yellow }

if ($DestroyDedicatedFlyApps -and (Test-Path $FLY)) {
  foreach ($app in ($flyApps | Where-Object { $_ -and $_ -ne 'wayne-w4y' })) {
    Write-Host "destroy fly app $app" -ForegroundColor DarkYellow
    & $FLY apps destroy $app --yes 2>&1 | Out-Host
  }
}
Write-Host 'RESET COMPLETE' -ForegroundColor Green