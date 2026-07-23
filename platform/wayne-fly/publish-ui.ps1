# ============================================================================
# Publish UI-only channel to gs://w4y-engine-dist
# ============================================================================
# Builds web_dist zip (via build-ui-zip.ps1), uploads immutable zip object,
# then writes ui-latest.json with Cache-Control: no-store so CDN/edge never
# serves a stale pointer (the failure mode that hid the plan-chip fix).
#
# Usage (from repo root, after npm run build in wayne-agent/web):
#   pwsh platform/wayne-fly/publish-ui.ps1
#   pwsh platform/wayne-fly/publish-ui.ps1 -Version ui-202607230100
#
# Gates: ends with assert that public URL body == GCS origin body.
# ============================================================================

param(
    [string]$RepoRoot = "",
    [string]$Version = "",
    [string]$Bucket = "gs://w4y-engine-dist",
    [switch]$SkipBuildZip
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).ProviderPath
}

if (-not $Version) {
    $Version = "ui-" + (Get-Date -Format "yyyyMMddHHmm")
}
if ($Version -notmatch '^ui-') {
    $Version = "ui-$Version"
}

$publicBase = "https://storage.googleapis.com/w4y-engine-dist"
$zipName = "web_dist-$Version.zip"
$zipGs = "$Bucket/$zipName"
$zipUrl = "$publicBase/$zipName"
$manifestGs = "$Bucket/ui-latest.json"
$manifestUrl = "$publicBase/ui-latest.json"

$zipLocal = Join-Path $env:TEMP $zipName
if (-not $SkipBuildZip) {
    $buildScript = Join-Path $PSScriptRoot "build-ui-zip.ps1"
    & pwsh -File $buildScript -RepoRoot (Join-Path $RepoRoot "wayne-agent") -OutputPath $zipLocal
    if ($LASTEXITCODE -ne 0) { throw "build-ui-zip.ps1 failed" }
} elseif (-not (Test-Path $zipLocal)) {
    throw "SkipBuildZip set but zip missing: $zipLocal"
}

Write-Host "-> Upload $zipGs"
gsutil -h "Cache-Control:public,max-age=3600" -h "Content-Type:application/zip" cp $zipLocal $zipGs
if ($LASTEXITCODE -ne 0) { throw "gsutil cp zip failed" }

$builtAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
$manifest = @{
    version = $Version
    zipUrl  = $zipUrl
    builtAt = $builtAt
} | ConvertTo-Json -Compress

$manPath = Join-Path $env:TEMP "ui-latest-publish.json"
# UTF-8 no BOM — Electron JSON.parse is picky about BOM.
[System.IO.File]::WriteAllText($manPath, $manifest, (New-Object System.Text.UTF8Encoding $false))

Write-Host "-> Upload $manifestGs (Cache-Control: no-store)"
gsutil -h "Cache-Control:no-store" -h "Content-Type:application/json" cp $manPath $manifestGs
if ($LASTEXITCODE -ne 0) { throw "gsutil cp ui-latest.json failed" }
gsutil setmeta -h "Cache-Control:no-store" $manifestGs 2>$null | Out-Null

# Assert public URL == GCS origin (fail the publish if CDN still lies).
$assert = Join-Path $PSScriptRoot "assert-ui-manifest.ps1"
& pwsh -File $assert -ExpectedVersion $Version
if ($LASTEXITCODE -ne 0) { throw "assert-ui-manifest failed — CDN/origin mismatch" }

Write-Host "[OK] UI channel $Version"
Write-Host "     zip=$zipUrl"
Write-Host "     manifest=$manifestUrl"
