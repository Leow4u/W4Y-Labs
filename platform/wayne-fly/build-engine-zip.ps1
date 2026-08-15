# ============================================================================
# Work4You engine ZIP builder
# ============================================================================
# Packages the Work4You engine source (wayne-agent/) from the current checkout
# into the distribution ZIP that scripts/install.ps1 consumes via
# WORK4YOU_SOURCE_ZIP_URL (legacy WAYNE_SOURCE_ZIP_URL still accepted; see
# Get-EngineSourceFromZip there -- keep the layout contract in lockstep)
# and that the desktop in-app updater downloads via
# latest.json's zipUrl (apps/work4you/electron/w4y-wayne-resolve.cjs).
#
# Layout contract produced here:
#   work4you-engine-<date>.zip
#     wayne-agent/              <- single top-level folder. THE NAME IS A
#                                  PUBLISHED CONTRACT — DO NOT REBRAND IT.
#                                  Shells <=1.0.45 promote the extracted
#                                  wrapper dir by an ALLOWLIST of names
#                                  (wayne-agent, wayne-agent-main). A zip
#                                  whose wrapper is called anything else
#                                  fails promotion, and the updater leaves
#                                  the engine junction dangling — the app
#                                  then dies with "motor not found" and the
#                                  user cannot start it at all. This is not
#                                  hypothetical: it happened on 02/08/2026
#                                  with work4you-engine-20260802.zip.
#                                  The rename may only happen once no shell
#                                  older than the dual-name resolver is left
#                                  in the field. Content is already fully
#                                  rebranded; only the wrapper name waits.
#       pyproject.toml          <- REQUIRED at the folder root (installer probe)
#       uv.lock
#       README.md               <- placeholder created if the checkout has none
#                                  (pyproject's `readme =` makes uv/setuptools
#                                  stat it during dependency resolution; the
#                                  cloud Dockerfile does the same `touch`)
#       .wayne-engine-version   <- KEY=VALUE source pin (commit/branch/built);
#                                  read by install.ps1's Write-BootstrapMarker
#                                  since ZIP installs carry no .git metadata.
#                                  NAME STAYS .wayne-engine-version. The reader
#                                  now accepts BOTH names (it tries
#                                  .work4you-engine-version first), so the
#                                  rename is unblocked on the install side --
#                                  but every install.ps1 already published in
#                                  the field reads only the old name, so the
#                                  produced file keeps it until those cascas
#                                  are gone.
#       agent/ tools/ work4you_cli/ (incl. app_dist) wayne_cli/ (compat stub)
#       gateway/ tui_gateway/ ...
#
# Feed-cut compatibility (verified 01/08 against the published field state):
#   - The updater NEVER inspects the artifact filename or the inner dir name.
#     It fetches latest.json, compares version/builtAt against the local
#     engine-version.json marker, and blindly downloads zipUrl. Renaming the
#     artifact is inert by itself; the update fires when latest.json's
#     version/builtAt changes (every publish does that anyway).
#   - CONTENT is the cliff, not the name: cascas <= 1.0.45 validate the
#     extracted tree by probing wayne_cli/main.py. A ZIP built from a checkout
#     where the CLI package is work4you_cli/ (wayne_cli/ reduced to a stub
#     without main.py) is REJECTED by those cascas (fail-safe: the old engine
#     stays live). Do NOT point latest.json at a renamed-tree build until the
#     casca containing the dual-spelling resolver (commit ee28fea) has been
#     published AND applied by users -- or a wayne_cli/main.py shim ships in
#     the package.
#
# Excluded from the package:
#   apps/      -- the desktop app; the app never installs itself
#   tests/     -- 71MB of test fixtures the runtime never imports
#   release/   -- build outputs (if present)
#   .git, node_modules, __pycache__, checkout .venv/venv, caches, *.egg-info
#   .env       -- real secrets live in the checkout root; NEVER ship them
#   *.wayne.py -- Fly-overlay module copies; cloud-only, inert on the desktop
#
# Ready runtime (Windows, default):
#   After staging source, this script copies a standalone CPython into
#   wayne-agent/runtime/python/ and runs `uv sync --extra all --locked` into
#   wayne-agent/.venv/. The desktop first-run extracts this tree and starts —
#   no uv sync on the user's machine (Cursor-like). Marker: runtime-ready.json.
#   Use -SourceOnly to emit the old source-only ZIP (Fly/docs/non-Windows).
#
# Usage:
#   pwsh platform/wayne-fly/build-engine-zip.ps1 [-OutputPath <file.zip>]
#   pwsh platform/wayne-fly/build-engine-zip.ps1 -SourceOnly
#
# The ZIP is then uploaded (manually, with the machine's GCP credentials) to
# the bucket whose public URL becomes WORK4YOU_SOURCE_ZIP_URL / latest.json zipUrl.
# ============================================================================

param(
    # Root of the engine source checkout. Defaults to the sibling wayne-agent/
    # relative to this script (platform/wayne-fly/ -> repo root -> wayne-agent).
    [string]$RepoRoot = "",
    # Destination ZIP path. Defaults to %TEMP%\work4you-engine-<yyyyMMdd>.zip.
    [string]$OutputPath = "",
    # Keep the staging directory around for inspection instead of deleting it.
    [switch]$KeepStage,
    # Force a Windows-ready ZIP (CPython + .venv). Default on Windows.
    [switch]$IncludeRuntime,
    # Source tree only — no Python runtime. Default on non-Windows.
    [switch]$SourceOnly
)

$ErrorActionPreference = "Stop"

if ($IncludeRuntime -and $SourceOnly) {
    throw "Use either -IncludeRuntime or -SourceOnly, not both."
}
$buildRuntime = $false
if ($SourceOnly) {
    $buildRuntime = $false
} elseif ($IncludeRuntime) {
    $buildRuntime = $true
} else {
    $buildRuntime = [bool]($env:OS -eq "Windows_NT")
}

if (-not $RepoRoot) {
    $RepoRoot = Join-Path $PSScriptRoot "..\..\wayne-agent"
}
$RepoRoot = (Resolve-Path $RepoRoot).ProviderPath
if (-not (Test-Path (Join-Path $RepoRoot "pyproject.toml"))) {
    throw "Not an engine source checkout (pyproject.toml missing): $RepoRoot"
}

if (-not $OutputPath) {
    $OutputPath = Join-Path $env:TEMP ("work4you-engine-{0}.zip" -f (Get-Date -Format "yyyyMMdd"))
}

$stageRoot = Join-Path $env:TEMP "work4you-engine-stage"
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
    # UI SOURCES must not ship: the engine serves the prebuilt app_dist, and if
    # apps/work4you sources are present the serve startup's mtime staleness check
    # triggers an npm rebuild that fails on a user machine (apps/ is excluded
    # wholesale — no workspace shared package — and no dev deps). Real incident:
    # first 0.3.0 install timed out on boot exactly this way. ui-tui/ ships out
    # for the same reason.
    (Join-Path $RepoRoot "ui-tui")
)
$xdAnyDepth = @(
    ".git", "node_modules", "__pycache__", ".venv", "venv",
    # Both spellings exist in the wild: pytest's own dir is .pytest_cache, but
    # the checkout also carries a .pytest-cache (hyphen) that used to ship.
    ".pytest_cache", ".pytest-cache", ".ruff_cache", ".mypy_cache",
    # Both spellings: the dist name is migrating wayne-agent -> work4you-agent,
    # and a checkout may carry either (or both) egg-info dirs.
    "wayne_agent.egg-info", "work4you_agent.egg-info"
)
# Files excluded at any depth. `.env` holds real secrets in the checkout root
# and must never ship; `.env.example` is a different name and is kept.
# `*.wayne.py` are Fly-overlay artifacts (renamed module copies laid over the
# cloud image by Dockerfile.ui); a dot in the stem makes them unimportable, so
# shipping them only duplicates web_server.py for every desktop user.
$xfAnyDepth = @(".env", "*.pyc", "*.pyo", ".DS_Store", "*.wayne.py")

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
# desktop bootstrap marker valid without git metadata. Current install.ps1
# reads .work4you-engine-version first and falls back to this name, so the
# FILE NAME stays .wayne-engine-version for the benefit of the install.ps1
# copies already published in the field.
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

if ($buildRuntime) {
    if ($env:OS -ne "Windows_NT") {
        throw "-IncludeRuntime requires Windows (CPython + .venv are win-x64)."
    }
    Write-Host "-> Building ready Windows runtime (CPython + uv sync --extra all)"

    $uvCmd = $null
    $uvFound = Get-Command uv -ErrorAction SilentlyContinue
    if ($uvFound) { $uvCmd = $uvFound.Source }
    if (-not $uvCmd) {
        $managedUv = Join-Path $env:LOCALAPPDATA "wayne\bin\uv.exe"
        if (Test-Path $managedUv) { $uvCmd = $managedUv }
    }
    if (-not $uvCmd) {
        throw "uv not found. Install from https://astral.sh/uv or %LOCALAPPDATA%\wayne\bin\uv.exe"
    }

    $prevUvPython = $env:UV_PYTHON
    $prevUvProject = $env:UV_PROJECT_ENVIRONMENT
    $env:UV_PYTHON = $null

    try {
        Write-Host "   uv python install 3.11"
        & $uvCmd python install 3.11
        if ($LASTEXITCODE -ne 0) { throw "uv python install 3.11 failed (exit $LASTEXITCODE)" }

        $pythonExe = (& $uvCmd python find 3.11 2>$null)
        if (-not $pythonExe) { throw "uv python find 3.11 returned no interpreter" }
        $pythonExe = "$pythonExe".Trim()
        if (-not (Test-Path $pythonExe)) { throw "Python interpreter missing: $pythonExe" }
        $pythonHome = Split-Path $pythonExe -Parent
        $hasDll = (Test-Path (Join-Path $pythonHome "python311.dll")) -or (Test-Path (Join-Path $pythonHome "python3.dll"))
        if (-not $hasDll) {
            $managedRoot = Join-Path $env:APPDATA "uv\python"
            $managedHit = Get-ChildItem $managedRoot -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -like "cpython-3.11-*" } |
                Select-Object -First 1
            if ($managedHit -and (Test-Path (Join-Path $managedHit.FullName "python.exe"))) {
                $pythonHome = $managedHit.FullName
                $pythonExe = Join-Path $pythonHome "python.exe"
            }
        }
        if (-not (Test-Path (Join-Path $pythonHome "python311.dll"))) {
            throw "Standalone CPython 3.11 not found (python311.dll missing near $pythonExe). uv python install 3.11 and retry."
        }

        $runtimePython = Join-Path $stageDir "runtime\python"
        if (Test-Path $runtimePython) { Remove-Item -Recurse -Force $runtimePython }
        New-Item -ItemType Directory -Force -Path $runtimePython | Out-Null
        Write-Host "   Copying standalone CPython from $pythonHome"
        & robocopy $pythonHome $runtimePython /E /NFL /NDL /NJH /NJS /NP /XD "__pycache__" | Out-Null
        $rcPy = $LASTEXITCODE
        $global:LASTEXITCODE = 0
        if ($rcPy -ge 8) { throw "robocopy CPython failed (exit $rcPy)" }
        $stagePython = Join-Path $runtimePython "python.exe"
        if (-not (Test-Path $stagePython)) { throw "Staged python.exe missing: $stagePython" }

        $stageVenv = Join-Path $stageDir ".venv"
        if (Test-Path $stageVenv) { Remove-Item -Recurse -Force $stageVenv }
        Write-Host "   uv venv --relocatable"
        & $uvCmd venv --relocatable --python $stagePython $stageVenv
        if ($LASTEXITCODE -ne 0) { throw "uv venv failed (exit $LASTEXITCODE)" }

        $env:UV_PROJECT_ENVIRONMENT = $stageVenv
        Write-Host "   uv sync --extra all --locked (this is the slow step; runs here, not on the user machine)"
        Push-Location $stageDir
        try {
            & $uvCmd sync --extra all --locked
            if ($LASTEXITCODE -ne 0) { throw "uv sync --extra all --locked failed (exit $LASTEXITCODE)" }
        } finally {
            Pop-Location
        }

        $venvPython = Join-Path $stageVenv "Scripts\python.exe"
        if (-not (Test-Path $venvPython)) { throw "Ready venv missing $venvPython" }

        $cfgPath = Join-Path $stageVenv "pyvenv.cfg"
        if (Test-Path $cfgPath) {
            $cfg = [System.IO.File]::ReadAllText($cfgPath)
            $cfg = [regex]::Replace($cfg, '(?im)^home\s*=\s*.*$', "home = $runtimePython")
            [System.IO.File]::WriteAllText($cfgPath, $cfg, $utf8NoBom)
        }

        $runtimeReady = @{
            schema   = 1
            platform = "win32"
            arch     = "x64"
            python   = "3.11"
            extra    = "all"
            builtAt  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            commit   = $commit
        } | ConvertTo-Json -Compress
        [System.IO.File]::WriteAllText((Join-Path $stageDir "runtime-ready.json"), $runtimeReady + "`n", $utf8NoBom)
        Write-Host "   runtime-ready.json written (win32-x64, extra=all)"
    } finally {
        if ($null -ne $prevUvPython) { $env:UV_PYTHON = $prevUvPython } else { Remove-Item Env:UV_PYTHON -ErrorAction SilentlyContinue }
        if ($null -ne $prevUvProject) { $env:UV_PROJECT_ENVIRONMENT = $prevUvProject } else { Remove-Item Env:UV_PROJECT_ENVIRONMENT -ErrorAction SilentlyContinue }
        $global:LASTEXITCODE = 0
    }
} else {
    Write-Host "-> Source-only ZIP (no bundled Python runtime)"
}

Write-Host "-> Compressing to $OutputPath"
if (Test-Path $OutputPath) { Remove-Item -Force $OutputPath }
Add-Type -AssemblyName System.IO.Compression.FileSystem
# includeBaseDirectory=$true wraps everything in a single work4you-agent/
# folder, the layout install.ps1's Get-EngineSourceFromZip resolves first.
[System.IO.Compression.ZipFile]::CreateFromDirectory(
    $stageDir, $OutputPath,
    [System.IO.Compression.CompressionLevel]::Optimal, $true)

$zipItem = Get-Item $OutputPath
$sizeMb = [Math]::Round($zipItem.Length / 1MB, 1)
Write-Host ""
Write-Host "[OK] Engine package built: $OutputPath ($sizeMb MB)"
Write-Host "     commit=$commit branch=$branch"

# Optional Ed25519 signing for latest.json (see scripts/sign-engine-manifest.mjs)
$manifestPath = Join-Path (Split-Path $OutputPath -Parent) "latest.json"
if (Test-Path $manifestPath) {
    $node = Get-Command node -ErrorAction SilentlyContinue
    if ($node -and $env:W4Y_ENGINE_SIGNING_PRIVATE_KEY) {
        & node (Join-Path (Split-Path $RepoRoot -Parent) "scripts/sign-engine-manifest.mjs") --zip $OutputPath --manifest $manifestPath
    } else {
        Write-Host "[i] Skipping engine manifest signature (set W4Y_ENGINE_SIGNING_PRIVATE_KEY to enable)"
    }
}

# Publish-time guardrail for the field cut (see header): cascas <= 1.0.45
# probe wayne_cli/main.py in the extracted tree. Warn loudly when this build
# would be rejected by them so nobody points latest.json at it by accident.
$legacyEntry = Join-Path $stageDir "wayne_cli\main.py"
$newEntry    = Join-Path $stageDir "work4you_cli\main.py"
if ((Test-Path $newEntry) -and -not (Test-Path $legacyEntry)) {
    Write-Warning ("This package has work4you_cli/main.py but NO wayne_cli/main.py: " +
        "desktop cascas <= 1.0.45 will REJECT it as an engine update. " +
        "Publish (and get applied) a casca with the dual-spelling resolver first.")
}

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
