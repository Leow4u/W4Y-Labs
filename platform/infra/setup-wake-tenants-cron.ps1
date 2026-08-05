# Cloud Scheduler — wake multi-tenant (H1)
#
# Substitui/complementa o wake global wayne-w4y: POST /internal/wake-tenants
# acorda TODAS as instâncias base (free/starter, suspend/min=0). Premium ignora.
#
# Usage: .\setup-wake-tenants-cron.ps1 [-WebUrl https://work4you.ai] [-Schedule "*/5 * * * *"]

[CmdletBinding()]
param(
  [string]$WebUrl = "https://work4you.ai",
  [string]$JobName = "w4y-wake-tenants",
  [string]$Schedule = "*/5 * * * *",
  [string]$Region = "us-east1"
)

. "$PSScriptRoot\_env.ps1"

$secret = (gcloud secrets versions access latest --secret=wake-secret 2>$null)
if (-not $secret) {
  $secret = (gcloud secrets versions access latest --secret=recycle-secret 2>$null)
}
if (-not $secret) { throw "Secret wake-secret ou recycle-secret necessário." }
$secret = $secret.Trim()
$uri = "$($WebUrl.TrimEnd('/'))/internal/wake-tenants"

Write-Host "Job: $JobName | URI: $uri | Cron: $Schedule UTC" -ForegroundColor Cyan

$exists = gcloud scheduler jobs describe $JobName --location=$Region 2>$null
if ($LASTEXITCODE -eq 0) {
  gcloud scheduler jobs update http $JobName `
    --location=$Region --schedule=$Schedule --uri=$uri --http-method=POST `
    --headers="x-wake-secret=$secret" --attempt-deadline=180s --time-zone=UTC
} else {
  gcloud scheduler jobs create http $JobName `
    --location=$Region --schedule=$Schedule --uri=$uri --http-method=POST `
    --headers="x-wake-secret=$secret" --attempt-deadline=180s --time-zone=UTC
}
if ($LASTEXITCODE -ne 0) { throw "scheduler failed" }

Write-Host "OK — wake multi-tenant agendado." -ForegroundColor Green
Write-Host "Legacy wayne-cron-wake (wayne-w4y só) pode manter-se até migrar todos os tenants."
