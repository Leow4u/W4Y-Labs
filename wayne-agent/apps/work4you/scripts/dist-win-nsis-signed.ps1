# Work4You — NSIS build with SSL.com eSigner (thumbprint, not .pfx)
#
# Prerequisites:
#   1. SSL.com Code Signing cert enrolled in eSigner
#   2. eSigner CKA installed and running
#   3. Thumbprint in certmgr.msc → Personal → Certificates
#
# Usage:
#   .\scripts\dist-win-nsis-signed.ps1 -Thumbprint "A1B2C3..."
#   # or
#   $env:W4Y_CODE_SIGN_SHA1 = "A1B2..."
#   .\scripts\dist-win-nsis-signed.ps1

param(
    [string]$Thumbprint = $env:W4Y_CODE_SIGN_SHA1
)

$ErrorActionPreference = "Stop"
$Root = Split-Path $PSScriptRoot -Parent
Set-Location $Root

if (-not $Thumbprint) {
    Write-Error @"
Missing certificate thumbprint.

1. Open certmgr.msc → Personal → Certificates
2. SSL.com Code Signing → Details → Thumbprint (remove spaces)
3. Run: .\scripts\dist-win-nsis-signed.ps1 -Thumbprint '<thumbprint>'

See docs/SECURITY-SIGNING-SSLCOM.md
"@
}

$Thumbprint = ($Thumbprint -replace '\s', '').ToUpperInvariant()
Write-Host "Using code signing thumbprint: $Thumbprint"
Write-Host "Ensure eSigner CKA is running before the build signs files."

npm run build
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run builder -- --win nsis `
    -c.win.certificateSha1=$Thumbprint `
    -c.win.signAndEditExecutable=true `
    -c.win.rfc3161TimeStampServer=http://ts.ssl.com

if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$exe = Get-ChildItem -Path (Join-Path $Root "release") -Filter "Work4You-*-win-x64.exe" -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if ($exe) {
    Write-Host ""
    Write-Host "Verifying signature on $($exe.Name)..."
    Get-AuthenticodeSignature $exe.FullName | Format-List Status, SignerCertificate, TimeStamp
}
