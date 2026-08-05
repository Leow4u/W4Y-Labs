# Wake multi-tenant — teste de integração (H4)

Valida o fluxo **suspend → wake HTTP → cron catch-up** num tenant base (free/starter).

## Pré-requisitos

- Tenant `wayne-{slug}` em regime **base** (`auto_stop_machines=suspend`, `min=0`)
- Secret `GATEWAY_RELAY_WAKE_URL` injectado (provisioner pós-H3)
- Job `w4y-wake-tenants` ou curl manual

## 1. Confirmar regime base

```powershell
flyctl config show -a wayne-<slug> | Select-String autostop,min_machines
# auto_stop_machines = suspend
# min_machines_running = 0
```

## 2. Forçar suspend

Esperar idle (~5 min sem tráfego) ou:

```powershell
flyctl machine list -a wayne-<slug>
flyctl machine stop <id> -a wayne-<slug>
```

## 3. Wake manual (mesmo path do cron)

```powershell
curl -s -o NUL -w "%{http_code}" https://wayne-<slug>.fly.dev/api/auth/providers
# 200 ou 401 — ambos indicam máquina acordada
```

## 4. Wake via casca (multi-tenant)

```powershell
$secret = (gcloud secrets versions access latest --secret=wake-secret).Trim()
curl -X POST https://work4you.ai/internal/wake-tenants -H "x-wake-secret: $secret"
# acordados[] deve incluir t-<slug>
```

## 5. Cron catch-up

Com job agendado (`setup-wake-tenants-cron.ps1`, */5 UTC):

1. Crie job de teste no tenant: `work4you cron add --schedule "*/10 * * * *" --prompt "wake test"`
2. Suspenda a máquina (passo 2)
3. Aguarde até 5 min + tick interno (≤60s)
4. Verifique logs: `flyctl logs -a wayne-<slug>` — deve mostrar execução do cron

## Premium (Plus/Max)

- `min_machines_running=1` — **não** entra no wake cron
- Upgrade/downgrade: webhook Stripe chama `/reconfigure` → autostop + secrets

## IaC

| Script | Job | Intervalo |
|--------|-----|-----------|
| `wake-cron.ps1` | `wayne-cron-wake` | */15 — legacy `wayne-w4y` só |
| `setup-wake-tenants-cron.ps1` | `w4y-wake-tenants` | */5 — todos base |

## Falhas comuns

| Sintoma | Causa |
|---------|--------|
| Cron atrasa ~15 min | Só job legacy activo — deploy `setup-wake-tenants-cron.ps1` |
| Wake 404 | App destruído ou slug errado |
| Scale-to-zero não suspende | Falta `WAYNE_SCALE_TO_ZERO=1` ou `GATEWAY_RELAY_WAKE_URL` — redeploy provisioner + reconfigure |
