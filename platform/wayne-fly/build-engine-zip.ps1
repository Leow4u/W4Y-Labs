# ============================================================================
# Work4You engine ZIP builder
# ============================================================================
# Packages the Wayne engine source (wayne-agent/) from the current checkout
# into the distribution ZIP that scripts/install.ps1 consumes via
# WAYNE_SOURCE_ZIP_URL (see Get-EngineSourceFromZip there -- keep the layout
# contract in lockstep).
#
# Layout contract produced here:
#   wayne-engine-<date>.zip
#     wayne-agent/              <- single top-level folder (any name works)
#       pyproject.toml          <- REQUIRED at the folder root (installer probe)
#       uv.lock
#       README.md               <- placeholder created if the checkout has none
#                                  (pyproject's `readme =` makes uv/setuptools
#                                  stat it during dependency resolution; the
#                                  cloud Dockerfile does the same `touch`)
#       .wayne-engine-version   <- KEY=VALUE source pin (commit/branch/built);
#                                  read by install.ps1's Write-BootstrapMarker
#                                  since ZIP installs carry no .git metadata
#       agent/ tools/ wayne_cli/ (incl. web_dist) gateway/ tui_gateway/ ...
#
# Excluded from the package:
#   apps/      -- parked desktop app + shell; the app never installs itself
#   tests/     -- 71MB of test fixtures the runtime never imports
#   release/   -- build outputs (if present)
#   .git, node_modules, __pycache__, .venv/venv, caches, *.egg-info (any depth)
#   .env       -- real secrets live in the checkout root; NEVER ship them
#
# Usage:
#   pwsh platform/wayne-fly/build-engine-zip.ps1 [-OutputPath <file.zip>]
#
# The ZIP is then uploaded (manually, with the machine's GCP credentials) to
# the bucket whose public URL becomes WAYNE_SOURCE_ZIP_URL.
# ============================================================================

param(
    # Root of the engine source checkout. Defaults to the sibling wayne-agent/
    # relative to this script (platform/wayne-fly/ -> repo root -> wayne-agent).
    [string]$RepoRoot = "",
    # Destination ZIP path. Defaults to %TEMP%\wayne-engine-<yyyyMMdd>.zip.
    [string]$OutputPath = "",
    # Keep the staging directory around for inspection instead of deleting it.
    [switch]$KeepStage
)

$ErrorActionPreference = "Stop"

if (-not $RepoRoot) {
    $RepoRoot = Join-Path $PSScriptRoot "..\..\wayne-agent"
}
$RepoRoot = (Resolve-Path $RepoRoot).ProviderPath
if (-not (Test-Path (Join-Path $RepoRoot "pyproject.toml"))) {
    throw "Not an engine source checkout (pyproject.toml missing): $RepoRoot"
}

if (-not $OutputPath) {
    $OutputPath = Join-Path $env:TEMP ("wayne-engine-{0}.zip" -f (Get-Date -Format "yyyyMMdd"))
}

$stageRoot = Join-Path $env:TEMP "wayne-engine-stage"
$stageDir  = Join-Path $stageRoot "wayne-agent"
if (Test-Path $stageRoot) { Remove-Item -Recurse -Force $stageRoot }
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

Write-Host "-> Staging engine source from $RepoRoot"

# Top-level-only exclusions use full paths (a nested dir that happens to be
# called "tests" inside a skill/plugin still ships); cache/dependency dirs are
# excluded by bare name at ANY depth.
$xdTopLevel = @(
    (Join-Path $RepoRoot "apps"),
    (Join-Path $RepoRoot "tests"),
    (Join-Path $RepoRoot "release"),
    # UI SOURCES must not ship: the engine serves the prebuilt wayne_cli/web_dist,
    # and if web/ sources are present the serve startup's mtime staleness check
    # triggers an npm rebuild that fails on a user machine (no @wayne/shared —
    # apps/ is excluded — and no dev deps). Real incident: first 0.3.0 install
    # timed out on boot exactly this way. ui-tui/ ships out for the same reason.
    (Join-Path $RepoRoot "web"),
    (Join-Path $RepoRoot "ui-tui")
)
$xdAnyDepth = @(
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    ".pytest_cache", ".ruff_cache", ".mypy_cache",
    "wayne_agent.egg-info"
)
# Files excluded at any depth. `.env` holds real secrets in the checkout root
# and must never ship; `.env.example` is a different name and is kept.
$xfAnyDepth = @(".env", "*.pyc", "*.pyo", ".DS_Store")

& robocopy $RepoRoot $stageDir /E /NFL /NDL /NJH /NJS /NP `
    /XD @($xdTopLevel + $xdAnyDepth) /XF @($xfAnyDepth) | Out-Null
$rc = $LASTEXITCODE
$global:LASTEXITCODE = 0
if ($rc -ge 8) { throw "robocopy staging failed (exit $rc)" }

# pyproject.toml declares `readme = "README.md"` but the fork carries no
# README; uv/setuptools stat the file during dependency resolution, so ship
# an empty placeholder (mirrors the cloud Dockerfile's `touch ./README.md`).
$readmePath = Join-Path $stageDir "README.md"
if (-not (Test-Path $readmePath)) {
    New-Item -ItemType File -Path $readmePath | Out-Null
    Write-Host "-> Created README.md placeholder (required by pyproject readme=)"
}

# Source pin for ZIP-managed installs (no .git in the package). KEY=VALUE
# lines; install.ps1's Write-BootstrapMarker reads `commit=` to keep the
# desktop bootstrap marker valid without git metadata.
$commit = ""
$branch = ""
try {
    $commit = (& git -C $RepoRoot rev-parse HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) { $commit = "" }
    $branch = (& git -C $RepoRoot rev-parse --abbrev-ref HEAD 2>$null)
    if ($LASTEXITCODE -ne 0) { $branch = "" }
} catch { }
$global:LASTEXITCODE = 0
# Coerce to trimmed strings (git output may be $null on failure). Plain ifs,
# not the ternary operator, so the script also runs under PowerShell 5.1.
$commit = if ($commit) { "$commit".Trim() } else { "" }
$branch = if ($branch) { "$branch".Trim() } else { "" }
if (-not $commit) {
    Write-Warning "Could not resolve the checkout's git commit; .wayne-engine-version will have an empty pin."
}
$versionLines = @(
    "commit=$commit",
    "branch=$branch",
    "built=$((Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ'))"
)
# BOM-less UTF-8 so any consumer (PowerShell 5.1, Python, Node) parses it raw.
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText((Join-Path $stageDir ".wayne-engine-version"), ($versionLines -join "`n") + "`n", $utf8NoBom)

Write-Host "-> Compressing to $OutputPath"
if (Test-Path $OutputPath) { Remove-Item -Force $OutputPath }
Add-Type -AssemblyName System.IO.Compression.FileSystem
# includeBaseDirectory=$true wraps everything in a single wayne-agent/ folder,
# the layout install.ps1's Get-EngineSourceFromZip resolves first.
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stageDir, $OutputPath,
    [System.IO.Compression.CompressionLevel]::Optimal, $true)

$zipItem = Get-Item $OutputPath
$sizeMb = [Math]::Round($zipItem.Length / 1MB, 1)
Write-Host ""
Write-Host "[OK] Engine package built: $OutputPath ($sizeMb MB)"
Write-Host "     commit=$commit branch=$branch"
Write-Host ""
Write-Host "Top-level contents:"
Get-ChildItem $stageDir | Sort-Object { -not $_.PSIsContainer }, Name | ForEach-Object {
    $kind = if ($_.PSIsContainer) { "dir " } else { "file" }
    Write-Host ("  [{0}] {1}" -f $kind, $_.Name)
}

if (-not $KeepStage) {
    Remove-Item -Recurse -Force $stageRoot
} else {
    Write-Host ""
    Write-Host "Staging kept at: $stageDir"
}
