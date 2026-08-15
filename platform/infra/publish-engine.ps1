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

# One build produces BOTH artefacts so they can never drift apart: the feed ZIP
# (for in-app updates) and the engine tree the desktop installer ships via
# extraResources. They used to come from separate steps, which is how an
# installer could carry a different engine than the feed advertised.
$bundledDir = Join-Path $repoRoot 'wayne-agent\apps\work4you\build\engine-runtime'

if (-not $SkipBuild) {
    & node (Join-Path $engineRoot 'scripts/build-engine-runtime.mjs') `
        --repo-root $engineRoot `
        --out-zip $ZipPath `
        --out-dir $bundledDir
    if ($LASTEXITCODE -ne 0) { throw "build-engine-runtime.mjs failed (exit $LASTEXITCODE)" }
}

if (-not (Test-Path $ZipPath)) {
    throw "ZIP not found: $ZipPath"
}

$builtAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
$zipUrl = "https://storage.googleapis.com/w4y-engine-dist/$artifact"

# Take the platform from the runtime the build actually produced rather than
# hardcoding it — a mislabelled feed is exactly what sent Windows binaries to
# every Mac.
$markerPath = Join-Path $bundledDir 'runtime-ready.json'
if (-not (Test-Path $markerPath)) {
    throw "runtime-ready.json missing at $markerPath — refusing to publish a feed with an unverified platform."
}
$marker = Get-Content $markerPath -Raw | ConvertFrom-Json
$feedPlatform = "$($marker.platform)-$($marker.arch)"

$feed = @{
    version      = $Version
    zipUrl       = $zipUrl
    builtAt      = $builtAt
    runtimeReady = $true
    platform     = $feedPlatform
} | ConvertTo-Json -Compress

$feedPath = Join-Path $env:TEMP 'latest.json'
$utf8NoBom = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText($feedPath, $feed, $utf8NoBom)

$signScript = Join-Path $repoRoot 'scripts/sign-engine-manifest.mjs'
if ($env:W4Y_ENGINE_SIGNING_PRIVATE_KEY -and (Test-Path $signScript)) {
    Write-Host '-> Signing latest.json (Ed25519)'
    & node $signScript --zip $ZipPath --manifest $feedPath
    if ($LASTEXITCODE -ne 0) { throw 'Engine manifest signing failed' }
    $feed = Get-Content $feedPath -Raw
}

Write-Host "-> $Bucket/$artifact"
gsutil -h 'Cache-Control:no-store' cp $ZipPath "$Bucket/$artifact"

# Per-platform feed: the engine carries native binaries, so each platform+arch
# needs its own manifest. The desktop asks for latest-<platform>-<arch>.json
# first and REJECTS a manifest built for anything else — that rejection is what
# stops a Mac from downloading this Windows engine, as it did until 14/08.
$platformFeed = "latest-$($feedPlatform).json"
Write-Host "-> $Bucket/$platformFeed"
gsutil -h 'Cache-Control:no-store' -h 'Content-Type:application/json; charset=utf-8' cp $feedPath "$Bucket/$platformFeed"

# The legacy global feed still serves win32-x64 shells published before
# per-platform manifests existed. Only ever write it from a win32-x64 build.
if ($feedPlatform -eq 'win32-x64') {
    Write-Host "-> $Bucket/latest.json (legacy shells)"
    gsutil -h 'Cache-Control:no-store' -h 'Content-Type:application/json; charset=utf-8' cp $feedPath "$Bucket/latest.json"
}

$repoFeed = Join-Path $repoRoot 'platform/wayne-fly/latest.json'
[System.IO.File]::WriteAllText($repoFeed, ($feed + "`n"), $utf8NoBom)

Write-Host ''
Write-Host "[OK] Engine $Version published"
Write-Host "     zipUrl=$zipUrl"
Write-Host "     builtAt=$builtAt"
Write-Host "     platform=$feedPlatform"
Write-Host "     casca extraResources: $bundledDir"
