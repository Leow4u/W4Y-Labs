# ============================================================================
# Work4You UI-only package (web_dist)
# ============================================================================
# Builds a small ZIP of wayne_cli/web_dist for the desktop UI-only channel
# (apps/desktop-shell/ui-update.cjs + ui-latest.json). Does NOT include the
# Python motor — that stays on latest.json / wayne-engine-*.zip.
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
$webDist = Join-Path $RepoRoot "wayne_cli\web_dist"
if (-not (Test-Path (Join-Path $webDist "index.html"))) {
    throw "web_dist missing or empty (run npm run build in wayne-agent/web first): $webDist"
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
