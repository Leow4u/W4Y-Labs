# Provisiona um TENANT completo da Work4You (Fase 3 — multi-tenant):
#   1 app Fly (fronteira de secrets) + 1 volume (GRU) + 1 máquina Wayne
#   + bucket Tigris próprio (litestream) + credenciais de dashboard próprias
#   + runtime key OpenRouter com limite (trial/plano) + linhas em
#   users/instances no registry.
#
# Uso:  .\provision-tenant.ps1 -Slug acme -Email cliente@dominio.com
#         [-Plan base|premium] [-TrialUsd 1] [-Image <ref>]
#
# Pré-requisitos: flyctl logado; cloud-sql-proxy acessível; secrets em
# C:\DEV\W4Y Labs\.secrets (openrouter-provisioning-key.txt); node no PATH.
# Idempotência: se o app já existe, o script aborta (reconciliar é manual).
[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][ValidatePattern('^[a-z0-9-]{2,24}$')][string]$Slug,
    [Parameter(Mandatory = $true)][string]$Email,
    [ValidateSet('base', 'premium')][string]$Plan = 'base',
    [double]$TrialUsd = 1,
    [string]$Image = 'registry.fly.io/wayne-w4y:fly229',
    [int]$ProxyPort = 5434,
    # Retomar um provisionamento interrompido (pula recursos já criados).
    [switch]$Reconcile
)
$ErrorActionPreference = 'Stop'
$FLY = "$env:USERPROFILE\.fly\bin\flyctl.exe"
$APP = "wayne-$Slug"
$TENANT = "t-$Slug"
$ROOT = Split-Path $PSScriptRoot -Parent | Split-Path -Parent

Write-Host "== Provisionando tenant '$TENANT' (app $APP, plano $Plan) ==" -ForegroundColor Cyan

# -- 0. guarda de idempotência ------------------------------------------------
$existing = & $FLY apps list 2>$null | Select-String -SimpleMatch $APP
if ($existing -and -not $Reconcile) { throw "app $APP já existe — use -Reconcile para retomar" }

# -- 1. app + volume ----------------------------------------------------------
if (-not $existing) {
    & $FLY apps create $APP --org personal | Out-Null
    Write-Host "app criado: $APP"
} else { Write-Host "app já existe: $APP (reconcile)" }
$hasVol = & $FLY volumes list -a $APP 2>$null | Select-String -SimpleMatch 'wayne_data'
if (-not $hasVol) {
    & $FLY volumes create wayne_data --region gru --size 3 -a $APP --yes | Out-Null
    Write-Host "volume wayne_data (3GB, gru)"
} else { Write-Host "volume já existe (reconcile)" }

# -- 2. bucket Tigris próprio (litestream) — secrets AWS_* entram no app -------
$hasBucket = & $FLY secrets list -a $APP 2>$null | Select-String -SimpleMatch 'BUCKET_NAME'
if (-not $hasBucket) {
    & $FLY storage create -a $APP -n "$APP-state" --yes | Out-Null
    Write-Host "bucket Tigris: $APP-state"
} else { Write-Host "bucket Tigris já configurado (reconcile)" }

# -- 3. credenciais do tenant --------------------------------------------------
function New-RandomToken([int]$bytes) {
    $b = New-Object byte[] $bytes
    [Security.Cryptography.RandomNumberGenerator]::Fill($b)
    $s = [Convert]::ToBase64String($b) -replace '[/+=]', ''
    $s.Substring(0, [Math]::Min($s.Length, 43))
}
$dashUser = "w4y-$Slug"
$dashPass = New-RandomToken 24
$dashSecret = New-RandomToken 32
$apiKey = New-RandomToken 24

# runtime key OpenRouter com limite (trial ou crédito do plano)
$orProv = (Get-Content "$ROOT\.secrets\openrouter-provisioning-key.txt" -Raw).Trim()
$orResp = Invoke-RestMethod -Uri 'https://openrouter.ai/api/v1/keys' -Method Post `
    -Headers @{ Authorization = "Bearer $orProv" } -ContentType 'application/json' `
    -Body (@{ name = "tenant:$TENANT"; limit = $TrialUsd } | ConvertTo-Json)
$orKey = $orResp.key
$orHash = if ($orResp.data) { $orResp.data.hash } else { $orResp.hash }
Write-Host "runtime key OpenRouter: limite US`$$TrialUsd (hash $($orHash.Substring(0,12))…)"

& $FLY secrets set -a $APP --stage `
    "OPENROUTER_API_KEY=$orKey" `
    "API_SERVER_KEY=$apiKey" `
    "WAYNE_DASHBOARD_BASIC_AUTH_USERNAME=$dashUser" `
    "WAYNE_DASHBOARD_BASIC_AUTH_PASSWORD=$dashPass" `
    "WAYNE_DASHBOARD_BASIC_AUTH_SECRET=$dashSecret" `
    "GATEWAY_RELAY_WAKE_URL=https://$APP.fly.dev/api/auth/providers" `
    $(if ($Plan -eq 'premium') { @() } else { @("WAYNE_SCALE_TO_ZERO=1") }) | Out-Null
Write-Host "secrets do tenant staged"

# Conectores (Composio, projeto compartilhado — Onda 5): mesma project key em
# todo tenant; isolamento = prefixo de tenant no user_id (FLY_APP_NAME).
# Opcional: sem a env, o tenant nasce sem conectores e nada mais quebra.
if ($env:COMPOSIO_API_KEY) {
    & $FLY secrets set -a $APP --stage "COMPOSIO_API_KEY=$($env:COMPOSIO_API_KEY)" | Out-Null
    Write-Host "conectores: COMPOSIO_API_KEY staged (projeto compartilhado)"
}

# -- 4. fly.toml do tenant (plano → autostop) ----------------------------------
$autostop = if ($Plan -eq 'premium') { '"off"' } else { '"suspend"' }
$minRun = if ($Plan -eq 'premium') { 1 } else { 0 }
$toml = @"
app = "$APP"
primary_region = "gru"

[build]
  image = "$Image"

[processes]
  app = "gateway run"

[env]
  WAYNE_DASHBOARD = "1"
  WAYNE_DASHBOARD_HOST = "0.0.0.0"
  WAYNE_DASHBOARD_PORT = "8080"
  FORWARDED_ALLOW_IPS = "*"

[mounts]
  source = "wayne_data"
  destination = "/opt/data"

[http_service]
  processes = ["app"]
  internal_port = 8080
  force_https = true
  auto_stop_machines = $autostop
  auto_start_machines = true
  min_machines_running = $minRun

[[vm]]
  size = "shared-cpu-2x"
  memory = "2048mb"
"@
$tomlPath = Join-Path $env:TEMP "fly.$APP.toml"
Set-Content -Path $tomlPath -Value $toml -NoNewline
& $FLY deploy -c $tomlPath -a $APP --ha=false --regions gru
if ($LASTEXITCODE -ne 0) { throw "deploy do tenant falhou" }
Write-Host "máquina no ar: https://$APP.fly.dev"

# -- 5. registro no registry (users + instances + billing trial) ---------------
$env:PGSLUG = $Slug; $env:PGTENANT = $TENANT; $env:PGEMAIL = $Email.ToLower()
$env:PGAPP = $APP; $env:PGUSER2 = $dashUser; $env:PGPASS2 = $dashPass; $env:PGORHASH = $orHash
Push-Location "$ROOT\platform\web"
node -e @'
const fs=require("fs");
const url=fs.readFileSync(".env.local","utf8").match(/DATABASE_URL=["']?([^"'\r\n]+)/)[1]
  .replace(/127\.0\.0\.1:\d+/,"127.0.0.1:PORT").replace(/localhost:\d+/,"localhost:PORT")
  .replace("PORT",process.env.PGPORT||"5434");
const {Pool}=require("pg"); const pool=new Pool({connectionString:url,connectionTimeoutMillis:8000});
(async()=>{
  const t=process.env.PGTENANT, app=process.env.PGAPP;
  await pool.query("INSERT INTO users (email,tenant_id,role) VALUES ($1,$2,'admin') ON CONFLICT (email) DO UPDATE SET tenant_id=EXCLUDED.tenant_id",[process.env.PGEMAIL,t]);
  await pool.query(`INSERT INTO instances (tenant_id,name,url,fly_app,dashboard_username,dashboard_password,notes)
    VALUES ($1,$2,$3,$4,$5,$6,'Fly.io GRU · provisionado automaticamente')`,
    [t,`Work4You — ${process.env.PGSLUG}`,`https://${app}.fly.dev`,app,process.env.PGUSER2,process.env.PGPASS2]);
  await pool.query(`INSERT INTO billing (tenant_id,plan,status,openrouter_key_hash,monthly_credits_usd)
    VALUES ($1,'free','active',$2,$3) ON CONFLICT (tenant_id) DO UPDATE SET openrouter_key_hash=EXCLUDED.openrouter_key_hash`,
    [t,process.env.PGORHASH,String(process.env.PGTRIAL||1)]);
  console.log("registry OK: users+instances+billing para",t);
  await pool.end();
})().catch(e=>{console.error("ERRO registry:",e.message);process.exit(1)});
'@
Pop-Location

Write-Host ""
Write-Host "TENANT PRONTO" -ForegroundColor Green
Write-Host "  tenant : $TENANT"
Write-Host "  e-mail : $Email"
Write-Host "  app    : https://$APP.fly.dev  (roteado por work4you.ai via w4y_route)"
Write-Host "  plano  : $Plan (trial US`$$TrialUsd de créditos)"
