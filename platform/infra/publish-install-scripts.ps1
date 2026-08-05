# Upload public install one-liners to gs://w4y-engine-dist/
# Bootstrap scripts (install.ps1 / install.sh) resolve latest.json then invoke
# the full engine installers (work4you-install.ps1 / work4you-install.sh).
param(
    [string]$Bucket = 'gs://w4y-engine-dist'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
$webInstallers = Join-Path $root 'platform/web/installers'
$engineScripts = Join-Path $root 'wayne-agent/scripts'

$files = @(
    @{ Local = Join-Path $webInstallers 'bootstrap.ps1'; Remote = 'install.ps1'; ContentType = 'text/plain; charset=utf-8' },
    @{ Local = Join-Path $webInstallers 'bootstrap.sh';  Remote = 'install.sh';  ContentType = 'text/plain; charset=utf-8' },
    @{ Local = Join-Path $engineScripts 'install.ps1';  Remote = 'work4you-install.ps1'; ContentType = 'text/plain; charset=utf-8' },
    @{ Local = Join-Path $engineScripts 'install.sh';   Remote = 'work4you-install.sh';  ContentType = 'text/plain; charset=utf-8' }
)

foreach ($f in $files) {
    if (-not (Test-Path $f.Local)) {
        throw "Missing $($f.Local)"
    }
    $dest = "$Bucket/$($f.Remote)"
    Write-Host "-> $dest"
    gsutil -h "Cache-Control:no-store" -h "Content-Type:$($f.ContentType)" cp $f.Local $dest
}

Write-Host ''
Write-Host '[OK] Install scripts published to' $Bucket
Write-Host '     Windows: irm https://storage.googleapis.com/w4y-engine-dist/install.ps1 | iex'
Write-Host '     Unix:    curl -fsSL https://storage.googleapis.com/w4y-engine-dist/install.sh | bash'
