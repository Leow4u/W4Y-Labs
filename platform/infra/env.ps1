$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")
$credentialPath = Join-Path $repoRoot ".secrets\gcp-w4y-mvp-dev-agent.json"

if (-not (Test-Path $credentialPath)) {
    throw "GCP credential file not found at $credentialPath"
}

$env:GOOGLE_APPLICATION_CREDENTIALS = $credentialPath
$env:GOOGLE_CLOUD_PROJECT = "project-67a4bd4d-a990-406b-9e7"

$gcloudPath = Join-Path $env:LOCALAPPDATA "Google\Cloud SDK\google-cloud-sdk\bin\gcloud.cmd"
if (Test-Path $gcloudPath) {
    $env:GCLOUD = $gcloudPath
    $gcloudBin = Split-Path $gcloudPath -Parent
    if (($env:Path -split ";") -notcontains $gcloudBin) {
        $env:Path = "$gcloudBin;$env:Path"
    }
}

Write-Host "GOOGLE_APPLICATION_CREDENTIALS=$env:GOOGLE_APPLICATION_CREDENTIALS"
Write-Host "GOOGLE_CLOUD_PROJECT=$env:GOOGLE_CLOUD_PROJECT"
if ($env:GCLOUD) {
    Write-Host "GCLOUD=$env:GCLOUD"
}
