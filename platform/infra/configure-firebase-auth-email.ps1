# Configure Firebase Auth emails for Work4You at platform scale:
#   - branded HTML templates (verify + reset) - button CTA, no raw giant URL in body
#   - optional custom SMTP from noreply@work4you.ai (Hostinger) for deliverability
#
# Usage:
#   # templates only (uses Firebase default sender until SMTP is set)
#   .\configure-firebase-auth-email.ps1
#
#   # templates + SMTP (password from env or Secret Manager)
#   $env:W4Y_AUTH_SMTP_PASSWORD = '...'
#   .\configure-firebase-auth-email.ps1 -WithSmtp
#
#   # persist password then apply
#   .\configure-firebase-auth-email.ps1 -WithSmtp -StoreSecret
#
[CmdletBinding()]
param(
  [switch]$WithSmtp,
  [switch]$StoreSecret,
  [string]$ProjectId = "project-67a4bd4d-a990-406b-9e7",
  [string]$SenderEmail = "noreply@work4you.ai",
  [string]$SmtpHost = "smtp.hostinger.com",
  [int]$SmtpPort = 465,
  [string]$SecretName = "w4y-auth-smtp-password"
)

$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_env.ps1"

$verifyPath = Join-Path $PSScriptRoot "auth-email\verify-email.html"
$resetPath = Join-Path $PSScriptRoot "auth-email\reset-password.html"
foreach ($p in @($verifyPath, $resetPath)) {
  if (-not (Test-Path -LiteralPath $p)) { throw "Missing template: $p" }
}

$verifyBody = [IO.File]::ReadAllText($verifyPath)
$resetBody = [IO.File]::ReadAllText($resetPath)

$token = & gcloud auth print-access-token
if (-not $token) { throw "gcloud auth print-access-token failed" }
$headers = @{
  Authorization = "Bearer $token"
  "Content-Type" = "application/json; charset=utf-8"
  "x-goog-user-project" = $ProjectId
}

$sendEmail = @{
  method = if ($WithSmtp) { "CUSTOM_SMTP" } else { "DEFAULT" }
  callbackUri = "https://work4you.ai/login"
  verifyEmailTemplate = @{
    senderLocalPart = "noreply"
    senderDisplayName = "Work4You"
    subject = "Confirme o seu email - Work4You"
    body = $verifyBody
    bodyFormat = "HTML"
    replyTo = "contato@work4you.ai"
  }
  resetPasswordTemplate = @{
    senderLocalPart = "noreply"
    senderDisplayName = "Work4You"
    subject = "Redefinir palavra-passe - Work4You"
    body = $resetBody
    bodyFormat = "HTML"
    replyTo = "contato@work4you.ai"
  }
}

$updateMask = @(
  "notification.sendEmail.method",
  "notification.sendEmail.callbackUri",
  "notification.sendEmail.verifyEmailTemplate",
  "notification.sendEmail.resetPasswordTemplate"
) -join ","

if ($WithSmtp) {
  $password = $env:W4Y_AUTH_SMTP_PASSWORD
  if (-not $password) {
    try {
      $password = (& gcloud secrets versions access latest --secret=$SecretName --project=$ProjectId 2>$null)
    } catch { $password = $null }
  }
  if (-not $password) {
    throw "SMTP password missing. Set W4Y_AUTH_SMTP_PASSWORD or create secret $SecretName (mailbox $SenderEmail on Hostinger)."
  }
  if ($StoreSecret) {
    $tmp = Join-Path $env:TEMP "w4y-auth-smtp-$([guid]::NewGuid().ToString('N')).txt"
    [IO.File]::WriteAllText($tmp, $password.Trim(), (New-Object System.Text.UTF8Encoding $false))
    $exists = & gcloud secrets describe $SecretName --project=$ProjectId 2>$null
    if ($LASTEXITCODE -ne 0) {
      & gcloud secrets create $SecretName --project=$ProjectId --replication-policy=automatic | Out-Null
    }
    & gcloud secrets versions add $SecretName --project=$ProjectId --data-file=$tmp | Out-Null
    Remove-Item -Force $tmp -ErrorAction SilentlyContinue
    Write-Host "Stored SMTP password in Secret Manager: $SecretName"
  }

  $sendEmail.smtp = @{
    senderEmail = $SenderEmail
    host = $SmtpHost
    port = $SmtpPort
    username = $SenderEmail
    password = $password.Trim()
    securityMode = "SSL"
  }
  $updateMask = $updateMask + ",notification.sendEmail.smtp"
}

$bodyObj = @{ notification = @{ sendEmail = $sendEmail } }
$bodyJson = $bodyObj | ConvertTo-Json -Depth 12 -Compress
$uri = "https://identitytoolkit.googleapis.com/admin/v2/projects/$ProjectId/config?updateMask=$updateMask"

Write-Host "PATCH Identity Toolkit config (project=$ProjectId, smtp=$WithSmtp)..."
try {
  $resp = Invoke-RestMethod -Method Patch -Uri $uri -Headers $headers -Body $bodyJson
} catch {
  $msg = $_.Exception.Message
  if ($_.ErrorDetails.Message) { $msg = "$msg`n$($_.ErrorDetails.Message)" }
  throw "Identity Toolkit config update failed: $msg"
}

$method = $resp.notification.sendEmail.method
$verifyCustom = $resp.notification.sendEmail.verifyEmailTemplate.customized
$resetCustom = $resp.notification.sendEmail.resetPasswordTemplate.customized
Write-Host ""
Write-Host "[OK] Firebase Auth email configured"
Write-Host "  method              : $method"
Write-Host "  verify customized   : $verifyCustom"
Write-Host "  reset customized    : $resetCustom"
Write-Host "  callbackUri         : $($resp.notification.sendEmail.callbackUri)"
if ($WithSmtp) {
  Write-Host "  smtp host           : $SmtpHost`:$SmtpPort"
  Write-Host "  smtp sender         : $SenderEmail"
} else {
  Write-Host "  note: templates applied; run again with -WithSmtp after noreply@ mailbox password is set"
}