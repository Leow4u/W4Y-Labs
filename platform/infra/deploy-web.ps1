# Build + push + deploy da CASCA PÚBLICA Work4You (platform/web, Next.js)
# para Cloud Run. Reproduzível, pinado por digest.
#
# Região: us-east1 (Cloud Run domain mappings não cobrem southamerica-east1;
# a landing é global e o Wayne continua em São Paulo). O serviço liga no
# Cloud SQL de São Paulo via connector (--add-cloudsql-instances).
#
# Usage: .\deploy-web.ps1 [-Tag <tag>] [-LaunchDesktop]
[CmdletBinding()]
param(
  [string]$Tag,
  [switch]$LaunchDesktop
)

. "$PSScriptRoot\_env.ps1"
if (-not $Tag) { $Tag = "web-" + (Get-ImageTag) }

$WEB_SERVICE = 'w4y-web'
$WEB_REGION  = 'us-east1'
$imageRepo   = "$script:AR_HOST/$script:PROJECT_ID/$script:REPO/w4y-web"
$image       = "${imageRepo}:$Tag"
$sqlConn     = "$script:PROJECT_ID`:southamerica-east1:w4y-registry"

# Claude v1: L0 revogado. Signup sempre provisiona Fly dedicada; motor partilhado
# wayne-w4y NÃO é caminho de cliente. -LaunchDesktop fica só como aviso legado.
$launchMode = ''
$sharedMotor = '0'
$appSubdomain = '1'
if ($LaunchDesktop) {
  Write-Host "== -LaunchDesktop ignorado (L0 revogado; ver docs/PLANO-CLAUDE-V1.md) ==" -ForegroundColor Yellow
}

Write-Host "== [1/3] build (linux/amd64) -> $image ==" -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
docker build --platform linux/amd64 -t $image "$script:REPO_ROOT\platform\web" 2>&1 | Out-Host
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -ne 0) { throw "build failed" }

Write-Host "== [2/3] push ==" -ForegroundColor Cyan
$token = (gcloud auth print-access-token).Trim()
$token | docker login -u oauth2accesstoken --password-stdin "https://$script:AR_HOST" | Out-Null
$ErrorActionPreference = 'Continue'
docker push $image 2>&1 | Out-Host
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -ne 0) { throw "push failed" }
$repoDigest = (docker inspect --format '{{index .RepoDigests 0}}' $image)
Set-Content -Path "$PSScriptRoot\last-web-image.txt" -Value $repoDigest -NoNewline

Write-Host "== [3/3] deploy (pinado por digest) ==" -ForegroundColor Cyan
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
gcloud secrets add-iam-policy-binding w4y-web-database-url `
    --member="serviceAccount:$script:RUNTIME_SA" `
    --role='roles/secretmanager.secretAccessor' --condition=None 2>&1 | Out-Null
gcloud secrets add-iam-policy-binding w4y-session-secret `
    --member="serviceAccount:$script:RUNTIME_SA" `
    --role='roles/secretmanager.secretAccessor' --condition=None 2>&1 | Out-Null
gcloud secrets add-iam-policy-binding resend-api-key `
    --member="serviceAccount:$script:RUNTIME_SA" `
    --role='roles/secretmanager.secretAccessor' --condition=None 2>&1 | Out-Null
# Auto-provision Free: cria secrets w4y-tenant-or-* por tenant no bootstrap.
gcloud projects add-iam-policy-binding $script:PROJECT_ID `
    --member="serviceAccount:$script:RUNTIME_SA" `
    --role='roles/secretmanager.admin' --condition=None 2>&1 | Out-Null
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
        'TURNSTILE_SECRET=turnstile-secret:latest',
        'W4Y_SESSION_SECRET=w4y-session-secret:latest',
        # Auth mail (verify/reset) via Resend API — branded HTML for all signups.
        'RESEND_API_KEY=resend-api-key:latest'
    ) -join ',')),
    ('--set-env-vars=' + (@(
        'ADMIN_EMAILS=leonardo@dutelog.com.br',
        'ALLOW_ALL_EMAILS=1',
        'WAYNE_INTERNAL_URL=https://app.work4you.ai',
        'PROVISIONER_URL=https://provisioner-w4y.fly.dev',
        'FREE_OPEN=1',
        "W4Y_LAUNCH_MODE=$launchMode",
        "NEXT_PUBLIC_W4Y_LAUNCH_MODE=$launchMode",
        "W4Y_SHARED_MOTOR=$sharedMotor",
        'W4Y_SHARED_FLY_APP=wayne-w4y',
        'NEXT_PUBLIC_PLATFORM_ORIGIN=https://work4you.ai',
        'NEXT_PUBLIC_APP_ORIGIN=https://app.work4you.ai',
        "W4Y_APP_SUBDOMAIN=$appSubdomain",
        'W4Y_COOKIE_DOMAIN=.work4you.ai',
        'TENANT_WAYNE_IMAGE=registry.fly.io/wayne-w4y:fly255',
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
# O gcloud escreve o progresso do deploy em stderr e, com ErrorActionPreference
# em Stop, a primeira dessas linhas aborta o script com a revisão por publicar —
# sem falhar nada, o que engana. Dobrar stderr em stdout e julgar pelo exit code.
$prevEap = $ErrorActionPreference
$ErrorActionPreference = 'Continue'
gcloud @deployArgs 2>&1 | Out-Host
$ErrorActionPreference = $prevEap
if ($LASTEXITCODE -ne 0) { throw "deploy failed" }

$url = (gcloud run services describe $WEB_SERVICE --region=$WEB_REGION --format='value(status.url)')
Write-Host ""
Write-Host "DEPLOYED" -ForegroundColor Green
Write-Host "IMAGE  : $repoDigest"
Write-Host "REGION : $WEB_REGION"
Write-Host "URL    : $url"
