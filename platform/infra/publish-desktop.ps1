# Upload desktop NSIS artefacts to gs://w4y-engine-dist/
param(
    [string]$Bucket = 'gs://w4y-engine-dist',
    [string]$ReleaseDir = '',
    [string]$Version = ''
)

$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
if (-not $ReleaseDir) {
    $ReleaseDir = Join-Path $repoRoot 'wayne-agent\apps\work4you\release'
}

if (-not $Version) {
    $pkg = Get-Content (Join-Path $repoRoot 'wayne-agent\apps\work4you\package.json') -Raw | ConvertFrom-Json
    $Version = $pkg.version
}

$exe = Join-Path $ReleaseDir "Work4You-$Version-win-x64.exe"
$blockmap = "$exe.blockmap"
$latestYml = Join-Path $ReleaseDir 'latest.yml'

foreach ($f in @($exe, $blockmap, $latestYml)) {
    if (-not (Test-Path $f)) { throw "Missing artefact: $f" }
}

Write-Host "-> $Bucket/Work4You-$Version-win-x64.exe"
gsutil -h 'Cache-Control:no-store' cp $exe "$Bucket/Work4You-$Version-win-x64.exe"

Write-Host "-> $Bucket/Work4You-$Version-win-x64.exe.blockmap"
gsutil -h 'Cache-Control:no-store' cp $blockmap "$Bucket/Work4You-$Version-win-x64.exe.blockmap"

Write-Host "-> $Bucket/latest.yml"
gsutil -h 'Cache-Control:no-store' -h 'Content-Type:text/yaml; charset=utf-8' cp $latestYml "$Bucket/latest.yml"

Write-Host ''
Write-Host "[OK] Desktop casca $Version published to $Bucket"
