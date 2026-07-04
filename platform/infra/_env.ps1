# Shared config + tool resolution for the W4Y infra scripts.
# Dot-sourced by build/push/deploy scripts. Not meant to be run directly.
$ErrorActionPreference = 'Stop'

# ---- Project / registry config (single source of truth) ----
$script:PROJECT_ID = 'project-67a4bd4d-a990-406b-9e7'
$script:REGION     = 'southamerica-east1'
$script:REPO       = 'w4y'
# NOTE: named IMAGE_NAME (not IMAGE) on purpose — PowerShell variables are
# case-insensitive, so a bare $IMAGE would collide with the deploy script's
# -Image parameter ($Image) and silently overwrite it on dot-source.
$script:IMAGE_NAME = 'wayne-agent'
$script:SERVICE    = 'wayne-agent'
$script:AR_HOST    = "$script:REGION-docker.pkg.dev"
$script:IMAGE_REPO = "$script:AR_HOST/$script:PROJECT_ID/$script:REPO/$script:IMAGE_NAME"

# Runtime SA Cloud Run uses by default (compute default SA). Granted
# secretmanager.secretAccessor by the deploy script. The Cloud Run service
# agent (image pull) is also granted AR reader there.
$script:PROJECT_NUMBER = '444206830924'
$script:RUNTIME_SA      = "$script:PROJECT_NUMBER-compute@developer.gserviceaccount.com"
$script:RUN_AGENT_SA    = "service-$script:PROJECT_NUMBER@serverless-robot-prod.iam.gserviceaccount.com"

# ---- Repo root (this file lives at platform/infra/_env.ps1) ----
$script:REPO_ROOT = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

# ---- Resolve gcloud: PATH first, else the portable install on this machine ----
$script:GcloudExe = (Get-Command gcloud -ErrorAction SilentlyContinue).Source
if (-not $script:GcloudExe) { $script:GcloudExe = Join-Path $env:USERPROFILE 'google-cloud-sdk\bin\gcloud.cmd' }
# gcloud needs a Python interpreter; use the standalone one if present and unset.
if ((-not $env:CLOUDSDK_PYTHON) -and (Test-Path (Join-Path $env:USERPROFILE 'Python312\python.exe'))) {
    $env:CLOUDSDK_PYTHON = Join-Path $env:USERPROFILE 'Python312\python.exe'
}
$env:CLOUDSDK_CORE_DISABLE_PROMPTS = '1'

function gcloud { & $script:GcloudExe @args }

# Image tag = short git SHA (with -dirty if the tree has uncommitted changes),
# falling back to a UTC timestamp when git isn't available.
function Get-ImageTag {
    Push-Location $script:REPO_ROOT
    try {
        $sha = (git rev-parse --short HEAD 2>$null)
        if ($LASTEXITCODE -eq 0 -and $sha) {
            $dirty = ''
            if (git status --porcelain) { $dirty = '-dirty' }
            return "$sha$dirty"
        }
    } catch { }
    finally { Pop-Location }
    return (Get-Date -Format 'yyyyMMdd-HHmmss')
}
