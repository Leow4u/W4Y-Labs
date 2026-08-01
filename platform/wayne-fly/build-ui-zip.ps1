# ============================================================================
# Work4You UI-only package (web_dist)
# ============================================================================
# Builds a small ZIP of the CLI package's web_dist for the desktop UI-only
# channel (ui-latest.json). Does NOT include the Python motor — that stays on
# latest.json / work4you-engine-*.zip.
# Package rename (brand migration): web_dist lives under work4you_cli/ in the
# renamed tree and under wayne_cli/ in older checkouts — probe both, new first.
#
# Usage:
#   cd wayne-agent/web && npm run build
#   pwsh platform/wayne-fly/build-ui-zip.ps1 [-OutputPath <file.zip>]
# ============================================================================

param(
    [string]$RepoRoot = "",
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Join-Path $PSScriptRoot "..\..\wayne-agent"
}
$RepoRoot = (Resolve-Path $RepoRoot).ProviderPath
$webDist = $null
foreach ($cliPkg in @("work4you_cli", "wayne_cli")) {
    $candidate = Join-Path $RepoRoot (Join-Path $cliPkg "web_dist")
    if (Test-Path (Join-Path $candidate "index.html")) { $webDist = $candidate; break }
}
if (-not $webDist) {
    throw "web_dist missing or empty (run npm run build in wayne-agent/web first): looked in work4you_cli\web_dist and wayne_cli\web_dist under $RepoRoot"
}

if (-not $OutputPath) {
    $stamp = Get-Date -Format "yyyyMMddHHmm"
    $OutputPath = Join-Path $env:TEMP ("web_dist-{0}.zip" -f $stamp)
}

$stageRoot = Join-Path $env:TEMP "w4y-ui-zip-stage"
if (Test-Path $stageRoot) { Remove-Item -Recurse -Force $stageRoot }
$stageDist = Join-Path $stageRoot "web_dist"
New-Item -ItemType Directory -Force -Path $stageDist | Out-Null

Write-Host "-> Staging UI from $webDist"
& robocopy $webDist $stageDist /E /NFL /NDL /NJH /NJS /NP | Out-Null
$rc = $LASTEXITCODE
$global:LASTEXITCODE = 0
if ($rc -ge 8) { throw "robocopy staging failed (exit $rc)" }

Write-Host "-> Compressing to $OutputPath"
if (Test-Path $OutputPath) { Remove-Item -Force $OutputPath }
Add-Type -AssemblyName System.IO.Compression.FileSystem
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stageDist, $OutputPath,
    [System.IO.Compression.CompressionLevel]::Optimal, $true)

Remove-Item -Recurse -Force $stageRoot
$zipItem = Get-Item $OutputPath
$sizeMb = [Math]::Round($zipItem.Length / 1MB, 2)
Write-Host "[OK] UI package: $OutputPath ($sizeMb MB)"
Write-Host "     Publish to gs://w4y-engine-dist/ and point ui-latest.json zipUrl at it."
