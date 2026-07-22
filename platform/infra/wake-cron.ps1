# platform/infra/wake-cron.ps1
#
# Codifica o job Cloud Scheduler `wayne-cron-wake` que JA EXISTE e esta LIVE
# no GCP (criado 2026-07-05). NAO e um deploy de mudanca de prod — e
# reprodutibilidade / DR: se o job sumir ou um ambiente novo precisar do
# despertador, este script recria o MESMO contrato.
#
# Contrato vivo (gcloud describe, 22/07/2026):
#   name:     wayne-cron-wake
#   location: southamerica-east1  (projeto project-67a4bd4d-a990-406b-9e7)
#   schedule: */15 * * * *
#   timeZone: Etc/UTC
#   http:     GET https://wayne-w4y.fly.dev/api/auth/providers
#   headers:  User-Agent: Google-Cloud-Scheduler
#   auth:     nenhuma (rota publica do dashboard)
#   deadline: 60s
#   desc:     Despertador do cron do Wayne: acorda a maquina Fly; o ticker
#             interno dispara jobs vencidos (catch-up)
#
# Limitacao de produto: intervalo de 15 min → rotina pode atrasar ate ~15 min
# (+ tick interno <=60s). Ver docs/PLATAFORMA.md e docs/BACKEND-MAP.md.
#
# IDEMPOTENTE: update se o job existe; create se nao.
# NAO re-aplica automaticamente no prod a partir do CI — rode a mao quando
# precisar recriar. Este script NAO e chamado pelos deploys Fly/web.
#
# Usage:
#   cd platform/infra
#   .\wake-cron.ps1              # create-or-update (idempotente)
#   .\wake-cron.ps1 -Describe    # so imprime o job vivo (leitura)
#
[CmdletBinding()]
param(
    [switch]$Describe
)

. "$PSScriptRoot\_env.ps1"

$JOB_NAME   = 'wayne-cron-wake'
$JOB_LOC    = 'southamerica-east1'
$SCHEDULE   = '*/15 * * * *'
$TIME_ZONE  = 'Etc/UTC'
$URI        = 'https://wayne-w4y.fly.dev/api/auth/providers'
$METHOD     = 'GET'
$ATTEMPT_DL = '60s'
$DESCRIPTION = 'Despertador do cron do Wayne: acorda a maquina Fly; o ticker interno dispara jobs vencidos (catch-up)'

# Ensure we talk to the W4Y project (not whatever is active in the shell).
gcloud config set project $script:PROJECT_ID | Out-Null

if ($Describe) {
    Write-Host "== describe $JOB_NAME ($JOB_LOC) ==" -ForegroundColor Cyan
    gcloud scheduler jobs describe $JOB_NAME --location=$JOB_LOC --format=yaml
    if ($LASTEXITCODE -ne 0) { throw "describe failed (job missing?)" }
    return
}

Write-Host "== ensure Cloud Scheduler job $JOB_NAME ==" -ForegroundColor Cyan
Write-Host "project : $script:PROJECT_ID"
Write-Host "location: $JOB_LOC"
Write-Host "schedule: $SCHEDULE ($TIME_ZONE)"
Write-Host "target  : $METHOD $URI"
Write-Host ""
Write-Host "NOTE: job is already LIVE in prod. This script is for DR/recreate only." -ForegroundColor Yellow
Write-Host "      It does NOT change Fly min_machines / suspend defaults." -ForegroundColor Yellow

# Does it exist?
$exists = $false
gcloud scheduler jobs describe $JOB_NAME --location=$JOB_LOC --format='value(name)' 2>$null | Out-Null
if ($LASTEXITCODE -eq 0) { $exists = $true }

if ($exists) {
    Write-Host "-> update (idempotent)" -ForegroundColor Cyan
    gcloud scheduler jobs update http $JOB_NAME `
        --location=$JOB_LOC `
        --schedule=$SCHEDULE `
        --time-zone=$TIME_ZONE `
        --uri=$URI `
        --http-method=$METHOD `
        --attempt-deadline=$ATTEMPT_DL `
        --description=$DESCRIPTION `
        --update-headers='User-Agent=Google-Cloud-Scheduler'
    if ($LASTEXITCODE -ne 0) { throw "update failed" }
} else {
    Write-Host "-> create (job was missing)" -ForegroundColor Cyan
    gcloud scheduler jobs create http $JOB_NAME `
        --location=$JOB_LOC `
        --schedule=$SCHEDULE `
        --time-zone=$TIME_ZONE `
        --uri=$URI `
        --http-method=$METHOD `
        --attempt-deadline=$ATTEMPT_DL `
        --description=$DESCRIPTION `
        --headers='User-Agent=Google-Cloud-Scheduler'
    if ($LASTEXITCODE -ne 0) { throw "create failed" }
}

Write-Host ""
Write-Host "OK" -ForegroundColor Green
gcloud scheduler jobs describe $JOB_NAME --location=$JOB_LOC `
    --format='table(name.basename(),schedule,timeZone,state,httpTarget.uri,httpTarget.httpMethod)'
