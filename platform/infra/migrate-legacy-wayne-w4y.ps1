# Migração one-off: utilizadores no tenant legado dev-tenant / wayne-w4y → tenant próprio.
#
# NÃO apaga wayne-w4y. Para cada e-mail em users WHERE tenant_id='dev-tenant':
#   1. Gera slug + tenantId t-{slug}
#   2. INSERT users (ou UPDATE tenant_id)
#   3. INSERT instances (provisioning) + billing free
#   4. POST provisioner /provision
#
# Dry-run por defeito. -Apply executa de verdade.
#
# Usage:
#   .\migrate-legacy-wayne-w4y.ps1              # lista o que faria
#   .\migrate-legacy-wayne-w4y.ps1 -Apply       # executa

[CmdletBinding()]
param(
  [switch]$Apply,
  [string]$LegacyTenant = "dev-tenant",
  [string]$WebApi = "https://work4you.ai"
)

. "$PSScriptRoot\_env.ps1"

$databaseUrl = $env:DATABASE_URL
if (-not $databaseUrl) {
  Write-Host "Defina DATABASE_URL (Cloud SQL proxy ou secret local)." -ForegroundColor Yellow
  Write-Host "Ex.: `$env:DATABASE_URL = (gcloud secrets versions access latest --secret=w4y-web-database-url)"
  exit 1
}

# psql via docker se disponível, senão psql local
function Invoke-Sql($query) {
  if (Get-Command psql -ErrorAction SilentlyContinue) {
    psql $databaseUrl -t -A -c $query
  } else {
    throw "psql não encontrado — instale PostgreSQL client ou use Cloud SQL proxy + psql."
  }
}

$emails = @(Invoke-Sql "SELECT email FROM users WHERE tenant_id='$LegacyTenant' ORDER BY email")
if (-not $emails.Count) {
  Write-Host "Nenhum utilizador em tenant_id=$LegacyTenant." -ForegroundColor Green
  exit 0
}

Write-Host "Utilizadores legacy ($LegacyTenant): $($emails.Count)" -ForegroundColor Cyan
foreach ($email in $emails) {
  if (-not $email) { continue }
  $local = ($email -split '@')[0] -replace '[^a-z0-9]+','-' -replace '^-|-$',''
  $suffix = -join ((48..57) + (97..102) | Get-Random -Count 6 | ForEach-Object { [char]$_ })
  $slug = "$($local.Substring(0, [Math]::Min(14, $local.Length)))-$suffix"
  $tenantId = "t-$slug"
  $flyApp = "wayne-$slug"
  Write-Host "  $email -> $tenantId ($flyApp)" -ForegroundColor White
  if (-not $Apply) { continue }

  Invoke-Sql "INSERT INTO users (email, tenant_id, role) VALUES ('$email', '$tenantId', 'owner') ON CONFLICT (email) DO UPDATE SET tenant_id=EXCLUDED.tenant_id"
  $exists = Invoke-Sql "SELECT 1 FROM instances WHERE tenant_id='$tenantId' LIMIT 1"
  if (-not $exists) {
    Invoke-Sql "INSERT INTO instances (tenant_id, name, url, fly_app, status, notes) VALUES ('$tenantId', 'Work4You — $slug', '', '$flyApp', 'provisioning', 'Migrado de $LegacyTenant')"
  }
  Invoke-Sql "INSERT INTO billing (tenant_id, plan, status, monthly_credits_usd) VALUES ('$tenantId', 'free', 'active', 1.5) ON CONFLICT (tenant_id) DO NOTHING"
  Write-Host "    DB ok — dispare provision via casca (login do user) ou provisioner manual." -ForegroundColor DarkGray
}

if (-not $Apply) {
  Write-Host ""
  Write-Host "Dry-run. Repita com -Apply para executar." -ForegroundColor Yellow
}
