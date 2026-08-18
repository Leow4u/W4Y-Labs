# Deploy the Work4You image to Cloud Run (southamerica-east1).
# Idempotent: also grants the runtime SA read access to the secrets and the
# Cloud Run service agent read access to the Artifact Registry repo (both
# resource-level, so they work without project-level IAM admin).
#
# Secrets are injected as env vars from Secret Manager at run time — never
# baked into the image.
#
# Usage:  .\deploy-wayne-cloudrun.ps1 [-Image <uri-or-digest>]
[CmdletBinding()]
param([string]$Image)

. "$PSScriptRoot\_env.ps1"

if (-not $Image) {
    if (Test-Path "$PSScriptRoot\last-image.txt") {
        $Image = (Get-Content "$PSScriptRoot\last-image.txt" -Raw).Trim()
    } else {
        $Image = "${script:IMAGE_REPO}:latest"
    }
}

Write-Host "== Granting runtime SA read on the secrets ==" -ForegroundColor Cyan
foreach ($s in @(
    'openrouter-api-key', 'wayne-api-server-key',
    'wayne-dashboard-username', 'wayne-dashboard-password', 'wayne-dashboard-auth-secret'
)) {
    gcloud secrets add-iam-policy-binding $s `
        --member="serviceAccount:$script:RUNTIME_SA" `
        --role='roles/secretmanager.secretAccessor' --condition=None *> $null
}

Write-Host "== Granting Cloud Run service agent read on Artifact Registry ==" -ForegroundColor Cyan
gcloud artifacts repositories add-iam-policy-binding $script:REPO `
    --location=$script:REGION `
    --member="serviceAccount:$script:RUN_AGENT_SA" `
    --role='roles/artifactregistry.reader' --condition=None *> $null

# --- Exact deploy command (logged, then executed) ---
# Topology: Cloud Run port 8080 = Wayne DASHBOARD (s6 service, WAYNE_DASHBOARD=1);
# the gateway api_server stays internal on 127.0.0.1:8642 (overlay config.yaml).
# All credentials come from Secret Manager — nothing hardcoded.
$deployArgs = @(
    'run', 'deploy', $script:SERVICE,
    "--image=$Image",
    "--region=$script:REGION",
    '--platform=managed',
    '--port=8080',
    '--args=gateway,run',
    # FORWARDED_ALLOW_IPS=*: o uvicorn só confia em X-Forwarded-Proto de IPs
    # nesta lista (default 127.0.0.1 — e no Cloud Run o peer não é loopback).
    # Sem isso o detect_https() do dashboard vê http e emite cookies de sessão
    # sem Secure/__Host-. O Wayne já liga proxy_headers=True em modo gated.
    '--set-env-vars=WAYNE_DASHBOARD=1,WAYNE_DASHBOARD_HOST=0.0.0.0,WAYNE_DASHBOARD_PORT=8080,FORWARDED_ALLOW_IPS=*',
    ('--set-secrets=' + (@(
        'OPENROUTER_API_KEY=openrouter-api-key:latest',
        'API_SERVER_KEY=wayne-api-server-key:latest',
        'WAYNE_DASHBOARD_BASIC_AUTH_USERNAME=wayne-dashboard-username:latest',
        'WAYNE_DASHBOARD_BASIC_AUTH_PASSWORD=wayne-dashboard-password:latest',
        'WAYNE_DASHBOARD_BASIC_AUTH_SECRET=wayne-dashboard-auth-secret:latest'
    ) -join ',')),
    '--min-instances=0',
    '--max-instances=1',
    '--memory=2Gi',
    '--cpu=2',
    '--timeout=3600',
    '--allow-unauthenticated'
)

Write-Host ""
Write-Host "== Exact deploy command ==" -ForegroundColor Yellow
Write-Host ("gcloud " + ($deployArgs -join " `\`n  "))
Write-Host ""

gcloud @deployArgs
if ($LASTEXITCODE -ne 0) { throw "deploy failed" }

$url = (gcloud run services describe $script:SERVICE --region=$script:REGION --format='value(status.url)')
Write-Host ""
Write-Host "DEPLOYED" -ForegroundColor Green
Write-Host "IMAGE   : $Image"
Write-Host "REGION  : $script:REGION"
Write-Host "SERVICE : $script:SERVICE"
Write-Host "URL     : $url"
Write-Host "HEALTH  : $url/health"
