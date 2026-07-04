# platform/web — Work4You (landing pública + casca fina)

**A raiz é produto, não painel** (direção 2026-07-04): `/` é a landing oficial da
Work4You. A plataforma NÃO recria o dashboard do Wayne — Chat, Files, Cron,
Skills, Logs vivem **dentro da instância Wayne** (Cloud Run, dashboard na 8080).

```
PÚBLICO (domínio único work4you.ai, sem subdomínios no MVP)
  /            landing — hero "O que você quer delegar hoje?" + seções
  /plataforma  /solucoes  /modelos  /clientes  /precos  /recursos
  /login       login provisório (dev-auth) — Identity Platform na próxima fase

AUTENTICADO
  /chat        experiência Work4You: retoma o prompt delegado (sessionStorage
               `w4y_delegation_prompt`) e faz a ponte p/ o workspace do tenant
  /instancias  rota INTERNA (admin/dev) — usuário final não escolhe instância
  /admin       cross-tenant (role=admin): frota + uso por tenant

REGISTRY (Cloud SQL): instances (+ runs/agents/artifacts históricos)
```

**Gesto de delegação** (`components/DelegationInput.tsx`): na landing NÃO
executa LLM — salva o prompt em sessionStorage → `/login?next=/chat` → `/chat`
reabre com o prompt preenchido e o botão "Continuar no meu workspace".

**Linguagem pública**: funcionário digital, agente, trabalho, rotina,
conectores, arquivos, aprovação humana, histórico, controle. NUNCA na landing:
MCP, OpenRouter, Cloud Run, runtime, fork, Hermes, stack técnica.

- **Registry de instâncias**: tabela `instances` (tenant_id, name, url, notes).
  M0: registrada manualmente (seed). Fase 2: orchestrator provisiona por tenant.
- **Saúde**: `src/lib/instance-health.ts` sonda `GET {url}/api/auth/providers`
  (rota pública de bootstrap do dashboard — o `/health` fica atrás do gate e o
  runtime não é alterado). 200 = online.
- **Branding**: wordmark Work4You em Cascadia Mono (`font-brand`, woff2 vendorada).

## Dev local

```powershell
# 1. Cloud SQL Auth Proxy (binário em google-cloud-sdk/bin)
cloud-sql-proxy --credentials-file "..\..\.secrets\gcp-w4y-mvp-dev-agent.json" `
  project-67a4bd4d-a990-406b-9e7:southamerica-east1:w4y-registry --port 5432

# 2. .env.local: DATABASE_URL=postgres://w4y_app:<secret>@127.0.0.1:5432/w4y_registry
#    (ADMIN_EMAILS opcional; default leonardo@dutelog.com.br)

npm run db:push   # schema
npm run dev       # http://localhost:3000
```

Histórico: as páginas Next dos 7 módulos + BFF de chat (`/api/chat/*`) foram
aposentadas nesta fase (superadas pela decisão de servir o dashboard do fork);
as tabelas `runs`/`messages`/`run_events`/`agents`/`artifacts` permanecem no
registry com os dados históricos.
