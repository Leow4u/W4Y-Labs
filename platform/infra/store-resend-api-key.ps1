# Store Resend API key for branded Work4You auth emails (all signups).
# Usage:
#   $env:RESEND_API_KEY = "re_..."
#   .\store-resend-api-key.ps1
# Then: .\deploy-web.ps1 -LaunchDesktop
#
[CmdletBinding()]
param(
  [string]$ProjectId = "project-67a4bd4d-a990-406b-9e7",
  [string]$SecretName = "resend-api-key"
)
$ErrorActionPreference = "Stop"
$key = $env:RESEND_API_KEY
if (-not $key -or -not $key.StartsWith("re_")) {
  throw "Set RESEND_API_KEY to a Resend key (re_...). Dashboard: https://resend.com/api-keys"
}
$tmp = Join-Path $env:TEMP ("w4y-resend-" + [guid]::NewGuid().ToString("N") + ".txt")
[IO.File]::WriteAllText($tmp, $key.Trim(), (New-Object System.Text.UTF8Encoding $false))
try {
  gcloud secrets describe $SecretName --project=$ProjectId 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    gcloud secrets create $SecretName --project=$ProjectId --replication-policy=automatic | Out-Null
  }
  gcloud secrets versions add $SecretName --project=$ProjectId --data-file=$tmp | Out-Null
} finally {
  Remove-Item -Force $tmp -ErrorAction SilentlyContinue
}
Write-Host "[OK] Stored $SecretName - redeploy w4y-web to pick it up."