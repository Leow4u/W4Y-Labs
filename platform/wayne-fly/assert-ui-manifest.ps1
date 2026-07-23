# ============================================================================
# Assert public ui-latest.json matches GCS origin (and optional version).
# ============================================================================
# Exit 0 = OK. Exit 1 = mismatch / fetch failure.
#
#   pwsh platform/wayne-fly/assert-ui-manifest.ps1
#   pwsh platform/wayne-fly/assert-ui-manifest.ps1 -ExpectedVersion ui-202607222110
# ============================================================================

param(
    [string]$ExpectedVersion = "",
    [string]$PublicUrl = "https://storage.googleapis.com/w4y-engine-dist/ui-latest.json",
    [string]$GsUri = "gs://w4y-engine-dist/ui-latest.json"
)

$ErrorActionPreference = "Stop"

$origin = (gsutil cat $GsUri 2>&1 | Out-String).Trim()
if (-not $origin) { Write-Error "empty GCS origin: $GsUri"; exit 1 }

# Bust intermediary caches with a unique query; origin object itself must be no-store.
$bust = $PublicUrl + "?assert=" + [guid]::NewGuid().ToString("N")
$public = (curl.exe -sS $bust).Trim()
if (-not $public) { Write-Error "empty public fetch: $bust"; exit 1 }

function Get-Version([string]$json) {
    if ($json -match '"version"\s*:\s*"([^"]+)"') { return $Matches[1] }
    return ""
}

$originVer = Get-Version $origin
$publicVer = Get-Version $public

Write-Host "GCS origin : $origin"
Write-Host "Public URL : $public"

if ($originVer -ne $publicVer) {
    Write-Error "CDN/origin version mismatch: origin=$originVer public=$publicVer"
    exit 1
}

if ($ExpectedVersion -and $publicVer -ne $ExpectedVersion) {
    Write-Error "expected version $ExpectedVersion, got $publicVer"
    exit 1
}

# Soft check: warn if Cache-Control allows long caching (do not fail — headers
# can vary by edge; the body match is the hard gate).
$hdr = curl.exe -sS -D - -o NUL $PublicUrl 2>&1 | Out-String
if ($hdr -match 'Cache-Control:\s*(.+)') {
    $cc = $Matches[1].Trim()
    Write-Host "Cache-Control: $cc"
    if ($cc -match 'max-age=([1-9]\d{2,})' -and $cc -notmatch 'no-store|no-cache') {
        Write-Warning "ui-latest Cache-Control looks cacheable ($cc) — republish with no-store"
    }
}

Write-Host "[OK] ui-latest public == GCS (version=$publicVer)"
exit 0
