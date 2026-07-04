# Authenticate Docker to Artifact Registry (via the active gcloud SA token)
# and push the Wayne Agent image. Records the immutable by-digest URI so the
# deploy script can pin to it.
#
# Usage:  .\push-wayne-image.ps1 [-Tag <tag>]
[CmdletBinding()]
param([string]$Tag)

. "$PSScriptRoot\_env.ps1"
if (-not $Tag) { $Tag = Get-ImageTag }

$image  = "${script:IMAGE_REPO}:$Tag"
$latest = "${script:IMAGE_REPO}:latest"

Write-Host "== Authenticating Docker to $script:AR_HOST (gcloud SA token) ==" -ForegroundColor Cyan
$token = (gcloud auth print-access-token).Trim()
$token | docker login -u oauth2accesstoken --password-stdin "https://$script:AR_HOST"
if ($LASTEXITCODE -ne 0) { throw "docker login failed" }

Write-Host "== Pushing $image ==" -ForegroundColor Cyan
docker push $image
if ($LASTEXITCODE -ne 0) { throw "push failed" }
# Convenience 'latest' tag (only if it exists locally).
docker image inspect $latest *> $null
if ($LASTEXITCODE -eq 0) { docker push $latest | Out-Null }

# Immutable by-digest reference (what we deploy).
$repoDigest = (docker inspect --format '{{index .RepoDigests 0}}' $image)
$digest = ($repoDigest -split '@')[-1]
Set-Content -Path "$PSScriptRoot\last-image.txt" -Value $repoDigest -NoNewline

Write-Host ""
Write-Host "IMAGE URI : $image"          -ForegroundColor Green
Write-Host "BY DIGEST : $repoDigest"     -ForegroundColor Green
Write-Host "DIGEST    : $digest"
Write-Host "REGION    : $script:REGION"
Write-Host "Next:  .\deploy-wayne-cloudrun.ps1   (uses the digest above)"
