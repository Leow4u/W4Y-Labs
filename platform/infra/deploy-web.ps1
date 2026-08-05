# Build + push + deploy da CASCA PÚBLICA Work4You (platform/web, Next.js)
# para Cloud Run. Reproduzível, pinado por digest.
#
# Região: us-east1 (Cloud Run domain mappings não cobrem southamerica-east1;
# a landing é global e o Wayne continua em São Paulo). O serviço liga no
# Cloud SQL de São Paulo via connector (--add-cloudsql-instances).
#
# Usage: .\deploy-web.ps1 [-Tag <tag>]
[CmdletBinding()]
param([string]$Tag)

. "$PSScriptRoot\_env.ps1"
if (-not $Tag) { $Tag = "web-" + (Get-ImageTag) }

$WEB_SERVICE = 'w4y-web'
$WEB_REGION  = 'us-east1'
$imageRepo   = "$script:AR_HOST/$script:PROJECT_ID/$script:REPO/w4y-web"
$image       = "${imageRepo}:$Tag"
$sqlConn     = "$script:PROJECT_ID`:southamerica-east1:w4y-registry"

Write-Host "== [1/3] build (linux/amd64) -> $image ==" -ForegroundColor Cyan
docker build --platform linux/amd64 -t $image "$script:REPO_ROOT\platform\web"
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host "== [2/3] push ==" -ForegroundColor Cyan
$token = (gcloud auth print-access-token).Trim()
$token | docker login -u oauth2accesstoken --password-stdin "https://$script:AR_HOST" | Out-Null
docker push $image
if ($LASTEXITCODE -ne 0) { throw "push failed" }
$repoDigest = (docker inspect --format '{{index .RepoDigests 0}}' $image)
Set-Content -Path "$PSScriptRoot\last-web-image.txt" -Value $repoDigest -NoNewline

Write-Host "== [3/3] deploy (pinado por digest) ==" -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
gcloud secrets add-iam-policy-binding w4y-web-database-url `
    --member="serviceAccount:$script:RUNTIME_SA" `
    --role='roles/secretmanager.secretAccessor' --condition=None 2>&1 | Out-Null
$ErrorActionPreference = $prevEap
$deployArgs = @(
    'run', 'deploy', $WEB_SERVICE,
    "--image=$repoDigest",
    "--region=$WEB_REGION",
    '--platform=managed',
    '--port=8080',
    "--add-cloudsql-instances=$sqlConn",
    ('--set-secrets=' + (@(
        'DATABASE_URL=w4y-web-database-url:latest',
        # Credenciais do Wayne para o SSO (login unificado no /login/enter).
        'WAYNE_DASHBOARD_USERNAME=wayne-dashboard-username:latest',
        'WAYNE_DASHBOARD_PASSWORD=wayne-dashboard-password:latest',
        # Billing: assinatura Stripe + provisioning OpenRouter (crédito/tenant).
        'STRIPE_SECRET_KEY=stripe-secret-key:latest',
        'STRIPE_WEBHOOK_SECRET=stripe-webhook-secret:latest',
        'OPENROUTER_PROVISIONING_KEY=openrouter-provisioning-key:latest',
        # Multi-tenant: provisionador (auto-provision Free) + reciclagem + reconciliador de chaves.
        'PROVISIONER_SHARED_SECRET=provisioner-shared-secret:latest',
        'RECYCLE_SECRET=recycle-secret:latest',
        'RECONCILE_SECRET=reconcile-secret:latest',
        'WAKE_SECRET=wake-secret:latest',
        # Chave publica da Stripe (pk_test) — nao e segredo, mas fica no SM p/ consistencia.
        'NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=stripe-publishable-key:latest',
        # Turnstile (Cloudflare): anti-robô no registro/auto-provisionamento.
        'TURNSTILE_SITEKEY=turnstile-sitekey:latest',
        'TURNSTILE_SECRET=turnstile-secret:latest'
    ) -join ',')),
    ('--set-env-vars=' + (@(
        'ADMIN_EMAILS=leonardo@dutelog.com.br',
        'ALLOWED_EMAILS=leonardo@dutelog.com.br',
        'WAYNE_INTERNAL_URL=https://wayne-w4y.fly.dev',
        'PROVISIONER_URL=https://provisioner-w4y.fly.dev',
        'FREE_OPEN=1',
        'NEXT_PUBLIC_PLATFORM_ORIGIN=https://work4you.ai',
        'NEXT_PUBLIC_APP_ORIGIN=https://app.work4you.ai',
        'W4Y_APP_SUBDOMAIN=1',
        'W4Y_COOKIE_DOMAIN=.work4you.ai',
        'TENANT_WAYNE_IMAGE=registry.fly.io/wayne-w4y:fly229',
        'STRIPE_PRICE_STARTER=price_1TqadkCn608ngT3WOPRy6FXx',
        'STRIPE_PRICE_STARTER_YEAR=price_1TqadkCn608ngT3WfLm7zvbk',
        'STRIPE_PRICE_PRO=price_1TqadlCn608ngT3WHgbjXtP8',
        'STRIPE_PRICE_PRO_YEAR=price_1TqadlCn608ngT3WBSa9jKMb',
        'STRIPE_PRICE_MAX=price_1TqadmCn608ngT3WEWLIoznD',
        'STRIPE_PRICE_MAX_YEAR=price_1TqadmCn608ngT3W1TyH0tDQ',
        # Metered on-demand overage ($0.01/unit) — Billing Meter event w4y_ondemand_overage_cent
        'STRIPE_PRICE_OVERAGE=price_1Twvq8Cn608ngT3WHeZov3BZ'
    ) -join ',')),
    # Landing pública sempre quente — visitante nunca espera cold start.
    '--min-instances=1',
    '--max-instances=2',
    '--memory=512Mi',
    '--cpu=1',
    '--timeout=60',
    '--allow-unauthenticated'
)
Write-Host ("gcloud " + ($deployArgs -join ' '))
gcloud @deployArgs
if ($LASTEXITCODE -ne 0) { throw "deploy failed" }

$url = (gcloud run services describe $WEB_SERVICE --region=$WEB_REGION --format='value(status.url)')
Write-Host ""
Write-Host "DEPLOYED" -ForegroundColor Green
Write-Host "IMAGE  : $repoDigest"
Write-Host "REGION : $WEB_REGION"
Write-Host "URL    : $url"
