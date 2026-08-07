# Create a dedicated GCP service account for GitHub Actions -> gs://w4y-engine-dist/
#
# Run locally:
#   .\platform\infra\setup-github-publish-sa.ps1
#
# Output: .secrets/github-w4y-engine-publish.json (gitignored)

param(
    [string]$ProjectId = 'project-67a4bd4d-a990-406b-9e7',
    [string]$Bucket = 'gs://w4y-engine-dist',
    [string]$SaId = 'github-w4y-engine-publish',
    [string]$SaDisplayName = 'GitHub Actions w4y-engine-dist publish'
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$secretsDir = Join-Path $repoRoot '.secrets'
$keyPath = Join-Path $secretsDir "$SaId.json"
$saEmail = "$SaId@$ProjectId.iam.gserviceaccount.com"

$gcloud = Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd'
$gsutil = Join-Path $env:LOCALAPPDATA 'Google\Cloud SDK\google-cloud-sdk\bin\gsutil.cmd'
if (-not (Test-Path $gcloud)) { throw 'gcloud not found. Install Google Cloud SDK first.' }

$devKey = Join-Path $secretsDir 'gcp-w4y-mvp-dev-agent.json'
if (Test-Path $devKey) {
    $env:GOOGLE_APPLICATION_CREDENTIALS = $devKey
    Write-Host "Using GOOGLE_APPLICATION_CREDENTIALS=$devKey"
} elseif (-not $env:GOOGLE_APPLICATION_CREDENTIALS) {
    throw 'Set GOOGLE_APPLICATION_CREDENTIALS or place gcp-w4y-mvp-dev-agent.json in .secrets/'
}

$env:GOOGLE_CLOUD_PROJECT = $ProjectId
& $gcloud config set project $ProjectId | Out-Null

Write-Host "Project: $ProjectId"
Write-Host "Bucket:  $Bucket"
Write-Host "SA:      $saEmail"

$saList = & $gcloud iam service-accounts list --filter="email:$saEmail" --format='value(email)' 2>$null
if (-not $saList) {
    Write-Host '-> Creating service account...'
    & $gcloud iam service-accounts create $SaId --display-name=$SaDisplayName
} else {
    Write-Host '-> Service account already exists.'
}

Write-Host "-> Granting Storage Object Admin on $Bucket ..."
if (Test-Path $gsutil) {
    & $gsutil iam ch "serviceAccount:${saEmail}:roles/storage.objectAdmin" $Bucket
} else {
    & $gcloud storage buckets add-iam-policy-binding $Bucket `
        --member="serviceAccount:$saEmail" `
        --role='roles/storage.objectAdmin'
}

New-Item -ItemType Directory -Force -Path $secretsDir | Out-Null
if (Test-Path $keyPath) {
    Write-Host "-> Key file already exists: $keyPath"
    Write-Host '   Delete it first if you need a new key.'
} else {
    Write-Host "-> Creating JSON key -> $keyPath"
    & $gcloud iam service-accounts keys create $keyPath --iam-account=$saEmail
}

Write-Host ''
Write-Host '[OK] Service account ready.'
Write-Host ''
Write-Host 'Next - GitHub secret:'
Write-Host '  1. Repo github.com/Leow4u/W4Y-Labs -> Settings -> Secrets and variables -> Actions'
Write-Host '  2. New repository secret'
Write-Host '     Name:  GCP_W4Y_PUBLISH_SA_JSON'
Write-Host '     Value: paste ENTIRE contents of:'
Write-Host "           $keyPath"
Write-Host ''
Write-Host '  3. Actions -> Desktop macOS -> Run workflow (unsigned=true, publish=true)'