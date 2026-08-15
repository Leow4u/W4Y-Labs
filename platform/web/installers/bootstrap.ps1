# Work4You one-liner bootstrap — published as gs://w4y-engine-dist/install.ps1
# Resolves the engine ZIP from latest.json, then runs the full installer.
$ErrorActionPreference = 'Stop'

$FeedUrl = 'https://storage.googleapis.com/w4y-engine-dist/latest.json'
$InstallerUrl = 'https://storage.googleapis.com/w4y-engine-dist/work4you-install.ps1'

if (-not $env:WORK4YOU_SOURCE_ZIP_URL -and -not $env:WAYNE_SOURCE_ZIP_URL) {
    $meta = Invoke-RestMethod -Uri $FeedUrl -UseBasicParsing
    if (-not $meta.zipUrl) {
        throw 'latest.json is missing zipUrl'
    }
    $env:WORK4YOU_SOURCE_ZIP_URL = [string]$meta.zipUrl
}

$installer = (Invoke-WebRequest -Uri $InstallerUrl -UseBasicParsing).Content
Invoke-Expression $installer
