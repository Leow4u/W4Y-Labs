# Cloud Scheduler — reconciliador de chaves capadas (G1)
#
# Chama POST /internal/reconcile-keys a cada 5 minutos. Idempotente: cria o job
# se não existir; actualiza URI/headers se já existir.
#
# Pré-requisitos:
#   - Secret `reconcile-secret` no Secret Manager (mesmo valor que RECONCILE_SECRET)
#   - Casca web deployada com RECONCILE_SECRET montado (deploy-web.ps1)
#
# Usage: .\setup-reconcile-cron.ps1 [-WebUrl https://work4you.ai]

[CmdletBinding()]
param(
  [string]$WebUrl = "https://work4you.ai",
  [string]$JobName = "w4y-reconcile-keys",
  [string]$Schedule = "*/5 * * * *",
  [string]$Region = "us-east1"
)

. "$PSScriptRoot\_env.ps1"

$secret = (gcloud secrets versions access latest --secret=reconcile-secret 2>$null)
if (-not $secret) {
  throw "Secret reconcile-secret não encontrado — crie no Secret Manager antes."
}
$secret = $secret.Trim()
$uri = "$($WebUrl.TrimEnd('/'))/internal/reconcile-keys"

Write-Host "Job: $JobName" -ForegroundColor Cyan
Write-Host "URI:  $uri" -ForegroundColor Cyan
Write-Host "Cron: $Schedule (UTC)" -ForegroundColor Cyan

$exists = gcloud scheduler jobs describe $JobName --location=$Region 2>$null
if ($LASTEXITCODE -eq 0) {
  gcloud scheduler jobs update http $JobName `
    --location=$Region `
    --schedule=$Schedule `
    --uri=$uri `
    --http-method=POST `
    --headers="x-reconcile-secret=$secret" `
    --attempt-deadline=120s `
    --time-zone=UTC
} else {
  gcloud scheduler jobs create http $JobName `
    --location=$Region `
    --schedule=$Schedule `
    --uri=$uri `
    --http-method=POST `
    --headers="x-reconcile-secret=$secret" `
    --attempt-deadline=120s `
    --time-zone=UTC
}
if ($LASTEXITCODE -ne 0) { throw "scheduler failed" }

Write-Host ""
Write-Host "OK — reconciliador agendado." -ForegroundColor Green
Write-Host "Alertas: Cloud Logging filtra [reconcile-keys] CRITICAL; HTTP 503 quando falhas/stale."
