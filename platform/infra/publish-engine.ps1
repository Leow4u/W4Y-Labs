# Build (optional) + upload engine ZIP + latest.json to gs://w4y-engine-dist/
param(
    [string]$Bucket = 'gs://w4y-engine-dist',
    [Parameter(Mandatory = $true)]
    [string]$Version,
    [string]$ZipPath = '',
    [switch]$SkipBuild
)

$ErrorActionPreference = 'Stop'
$repoRoot = Join-Path (Split-Path $PSScriptRoot -Parent) '..'
$engineRoot = Join-Path $repoRoot 'wayne-agent'
$artifact = "wayne-engine-$Version.zip"

if (-not $ZipPath) {
    $ZipPath = Join-Path $env:TEMP $artifact
}

if (-not $SkipBuild) {
    & (Join-Path $repoRoot 'platform/wayne-fly/build-engine-zip.ps1') -OutputPath $ZipPath
}

if (-not (Test-Path $ZipPath)) {
    throw "ZIP not found: $ZipPath"
}

$builtAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$zipUrl = "https://storage.googleapis.com/w4y-engine-dist/$artifact"
$feed = @{
    version = $Version
    zipUrl  = $zipUrl
    builtAt = $builtAt
} | ConvertTo-Json -Compress

$feedPath = Join-Path $env:TEMP 'latest.json'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($feedPath, $feed, $utf8NoBom)

Write-Host "-> $Bucket/$artifact"
gsutil -h 'Cache-Control:no-store' cp $ZipPath "$Bucket/$artifact"

Write-Host "-> $Bucket/latest.json"
gsutil -h 'Cache-Control:no-store' -h 'Content-Type:application/json; charset=utf-8' cp $feedPath "$Bucket/latest.json"

$repoFeed = Join-Path $repoRoot 'platform/wayne-fly/latest.json'
[System.IO.File]::WriteAllText($repoFeed, ($feed + "`n"), $utf8NoBom)

Write-Host ''
Write-Host "[OK] Engine $Version published"
Write-Host "     zipUrl=$zipUrl"
Write-Host "     builtAt=$builtAt"
