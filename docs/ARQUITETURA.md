# W4Y Labs — Arquitetura Geral (Reuse-First)

> **Protótipo da plataforma Work4You.**
> Princípio inegociável: **nunca construímos infraestrutura própria**. Nós **orquestramos** serviços gerenciados e maduros. O único código "nosso" é a **cola de orquestração** + a **UI** + o **modelo de tenancy**.

> **Revisão 2026-07-03 (v3):** a infraestrutura passa a ser **Google Cloud** para tudo que
> precisar. Mantidos: **OpenRouter** (motor de modelos), **Composio** (conectores),
> **ReactFlow** (workflow UI) e o runtime **Wayne Agent** (fork do
> [Hermes Agent](https://github.com/NousResearch/hermes-agent), Nous Research, MIT —
> ver [`wayne-agent/CREDITS.md`](../wayne-agent/CREDITS.md)). Único ponto fora do Google:
> **Stripe** para cobrança B2C (o Google Cloud não faz billing de revenda).

> **Revisão 2026-07-05 (v4 — HÍBRIDO, decisão executada):** a **camada de instâncias Wayne
> migra para o Fly.io** (1 Fly Machine por tenant + volume persistente em GRU,
> `autostop=suspend`) — é o ambiente nativo do upstream (o código do fork foi desenhado para
> Fly: suspend/wake, volume em `/opt/data`, proxy TLS). O Google segue dono da **plataforma**:
> domínio único + Global External ALB (construído; o §4.0 v3 abaixo está superado nisso),
> Identity Platform (planejado), Cloud SQL (registry), Secret Manager, BigQuery (custo),
> Cloud Scheduler (despertador de cron → o ticker do Wayne faz catch-up ao acordar), CI/CD.
> PoC medido: RSS ocioso 438MB (cabe no teto de 2GB do suspend); wake por HTTP 0,67s;
> estado intacto através de suspend→resume. A "Adaptação #5" (externalizar session store
> p/ Cloud SQL etc.) fica **dispensada no MVP** — o volume Fly resolve; durabilidade extra
> via snapshots diários + litestream→Tigris (fase 2). Canais de mensageria persistentes
> (WhatsApp/Slack socket/Discord) = tier premium sempre-aceso (`min=1`); o relay/connector
> do upstream é fechado e não será reconstruído no MVP. Entrypoint próprio para Fly em
> `platform/wayne-fly/` (s6-overlay exige PID 1, que no Fly Machines é do init deles).
> Roteamento multi-tenant sob domínio único: por sessão (estilo Manus), roteador na fase
> do provisionador. Modelo de negócio: tiers + créditos + top-up via Stripe (cliente de
> billing já existe no fork; lado servidor = Stripe + OpenRouter Provisioning por tenant).

---

## 1. O que é a Work4You

Plataforma **multi-tenant, multi-usuário** de **agentes de IA autônomos e persistentes** que:
- aprendem continuamente com a experiência (memória de longo prazo),
- executam tarefas em múltiplos ambientes (chat, browser, código, dados),
- integram-se a dezenas de ferramentas e modelos,
- funcionam como um **assistente operacional sempre ativo** (tarefas longas rodam na nuvem mesmo com o navegador fechado).

---

## 2. Regra de ouro: reusar vs. construir (agora em Google Cloud)

| Capacidade | ❌ NÃO construir | ✅ Reusar (decisão) |
|---|---|---|
| Runtime de agente (loop, tools, memória, skills) | Loop/runtime próprio | **Wayne Agent** (fork do Hermes Agent, MIT) |
| Hospedagem das instâncias (1 por tenant) | Servidor/VM próprio | **Cloud Run** (scale-to-zero) + **Cloud Run Jobs** (tarefas longas) |
| Autenticação + Organizações (tenants) | Login/RBAC próprio | **Identity Platform** (multi-tenancy nativo) + Firebase Auth |
| Registry + estado de sessão/run | ORM/DB próprio | **Cloud SQL (PostgreSQL)** |
| Storage de artefatos/uploads/memória | Storage próprio | **Cloud Storage** |
| Segredos / chaves por tenant | Cofre próprio | **Secret Manager** |
| Agendamento (rotinas/CRON) | Scheduler próprio | **Cloud Scheduler** |
| Eventos / filas / webhooks | Broker próprio | **Pub/Sub** + **Cloud Tasks** |
| Gateway de LLM (todos os modelos) | Cliente por provedor | **OpenRouter** (first-class no Wayne) |
| Conectores de ferramentas (OAuth por usuário) | Integrações uma a uma | **Composio** (250+ apps) via **MCP** |
| Editor visual de workflow | Canvas próprio | **ReactFlow** |
| Uso: custo/consumo em tempo real | Metering próprio | **BigQuery** + **Looker Studio** |
| Observabilidade (traces/logs/métricas) | Logging próprio | **Cloud Trace + Cloud Logging + Cloud Monitoring** (via OpenTelemetry) |
| Front-end (`platform/web`) | — | **Firebase App Hosting** (Next.js SSR) |
| Imagens de container / CI | — | **Artifact Registry** + **Cloud Build** |
| Cobrança ao cliente (B2C) | Billing próprio | **Stripe** *(único fora do Google)* |

**O que É nosso (thin glue) — vive em `platform/`:**
1. **UI** (Next.js) — os 7 módulos + **console Admin** (visão da plataforma: tenants, usuários, instâncias, runs, custo — restrito a operadores W4Y).
2. **Orchestrator** — provisiona/gerencia **um serviço Cloud Run (instância Wayne) por tenant** (ver §4 — granularidade dimensionada p/ 2.000 usuários).
3. **Registry** — quais agentes/rotinas/conectores/uso cada tenant tem (Cloud SQL).
4. **Modelo de tenancy** — tenant → usuário → instância → run.

---

## 3. Diagrama lógico (camadas)

```
┌──────────────────────────────────────────────────────────────────┐
│  APRESENTAÇÃO — platform/web (Next.js → Firebase App Hosting)     │
│  Novo Trabalho · Agent Studio · Rotinas · Artefatos ·             │
│  Conectores · Uso · Observabilidade        (ReactFlow no Studio)  │
└───────────────┬──────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────┐
│  IDENTIDADE & REGISTRY                                             │
│  Identity Platform (tenant nativo) · Cloud SQL (Postgres)         │
└───────────────┬──────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────┐
│  ORCHESTRATOR (platform/orchestrator — Cloud Run, nossa cola)     │
│  provisiona 1 serviço Cloud Run (Wayne) por usuário/tenant        │
└───────────────┬──────────────────────────────────────────────────┘
                │
┌───────────────▼──────────────────────────────────────────────────┐
│  WAYNE AGENT — Cloud Run (max-instances=1, min-instances=0)       │
│  loop · context engine · skills · gateway · tools · browser       │
│  ESTADO EXTERNALIZADO (Cloud Run é efêmero):                      │
│   sessão/run → Cloud SQL · artefatos/memória → Cloud Storage      │
│   segredos → Secret Manager · uso/trace → BigQuery/Cloud Trace    │
│  tarefa longa (>60min) → Cloud Run Jobs (via Cloud Tasks/PubSub)  │
└──────┬───────────────────────────┬────────────────────────────────┘
       │                           │
┌──────▼──────────┐   ┌────────────▼────────────────┐
│ MODELOS         │   │ FERRAMENTAS EXTERNAS         │
│ OpenRouter      │   │ Composio via MCP             │
└─────────────────┘   └──────────────────────────────┘

  Rotinas: Cloud Scheduler → dispara instância/Job
  Uso/Observ.: BigQuery + Looker Studio + Cloud Trace/Monitoring
  Cobrança: Stripe
```

---

## 4. Multi-tenancy (isolamento por serviço Cloud Run)

> **Escala-alvo: 2.000 usuários** (multi-tenant). Requisito registrado em 2026-07-04.

O Wayne Agent é **single-user por instância**. A plataforma vira multi-tenant por **isolamento de serviço**:

- **Granularidade da instância — decisão de Fase 2 (dimensionada para 2.000 usuários):**
  - *M0 (atual):* 1 serviço Cloud Run compartilhado de desenvolvimento.
  - *"1 serviço por usuário" NÃO escala até 2.000* (quota default do Cloud Run ~1.000 serviços/região + overhead de gestão/deploy).
  - *Direção:* **1 serviço por TENANT** com **sessões por usuário** (o gateway do Wayne já isola conversas por `session_id`/`session_key` — é o modelo dele para Telegram/Slack multi-usuário), reservando instância dedicada para tenants/planos premium. Ponto de atenção do modelo compartilhado: a memória pessoal (`MEMORY.md`/`USER.md`) é por instância — escopar por usuário via session-key/Honcho ou por prefixo no GCS.
- Serviços com `max-instances=1` (escritor único, sem corrupção de estado) e `min-instances=0` (scale-to-zero → custo ~zero ocioso, "sempre ativo" sem pagar idle).
- **Isolamento** por serviço/identidade GCP — mais forte que isolamento lógico. Cada instância tem sua **Service Account**, seu banco/schema no Cloud SQL, seu bucket/prefixo no Cloud Storage e seus segredos no Secret Manager.
- **Tenancy de auth**: **Identity Platform** tem *tenants* nativos; o `tenant_id` sai do token e amarra o registry.
- **Ferramentas**: Composio guarda o OAuth **por usuário/tenant** e expõe como **MCP**; cada instância recebe só os MCPs do dono.
- **Modelos**: conta OpenRouter da plataforma; custo atribuído por tenant via metadata/chaves derivadas por instância.

### 4.0 Topologia de deploy e regiões (decisão 2026-07-04)

| Componente | Região | Motivo |
|---|---|---|
| **Casca pública `w4y-web`** (landing + roteamento) | **us-east1** | **Cloud Run domain mappings não suporta southamerica-east1** — o domínio custom `work4you.ai` exige uma região suportada; us-east1 é a mais próxima do BR na lista |
| **Runtime Wayne** (o produto: chat, files, cron…) | **southamerica-east1** | Região principal; o usuário acessa a instância **direto** em SP → baixa latência no produto real |
| **Cloud SQL `w4y-registry`** | **southamerica-east1** | Registry da plataforma; a casca us-east1 conecta cross-region via connector (unix socket) |

- **Latência medida:** landing us-east1 ~0,27s TTFB; rota autenticada da casca (registry cross-region) ~0,5-0,7s; produto Wayne em SP ~0,2s (quente). O cross-region só afeta a antessala, não o produto.
- **`run.app` = fallback técnico**; a experiência pública é o domínio `work4you.ai`. Sem subdomínios de app no MVP.
- **Migração futura (se necessário):** Global External Application Load Balancer + Serverless NEG para servir o domínio custom com backend em SP, ou réplica do registry em us-east1. Não justificado no MVP.

### 4.1 Externalização de estado (o ponto crítico do Cloud Run)

Cloud Run não persiste filesystem. O estado que o Wayne guardava em `~/.wayne` é redirecionado:

| Estado do Wayne | Vai para | Observação |
|---|---|---|
| Sessões / histórico / run state (`state.db` SQLite+FTS5) | **Cloud SQL (Postgres)** | backend do session store adaptado; FTS5 → Postgres FTS (`tsvector`/`pg_trgm`) |
| Artefatos / uploads / saídas de arquivo | **Cloud Storage** | bucket/prefixo por tenant |
| Skills + memória (`MEMORY.md`, `USER.md`, `skills/`) | **Cloud Storage** | markdown/arquivos (sem locking → seguro em GCS); hidrata no boot, persiste no shutdown |
| Credential pool / config / chaves | **Secret Manager** | injetado como env no start |
| Caches (OpenRouter/models.dev) | efêmero | descartável, rebusca no cold start |
| Rotinas (`jobs.json`) | **Cloud SQL** + **Cloud Scheduler** | plataforma passa a ser dona das rotinas |
| Uso / traces | **BigQuery** / **Cloud Trace** | via OpenTelemetry / streaming insert |

**Ciclo de vida:** *boot* hidrata (GCS + Cloud SQL + Secret Manager) → *runtime* escreve sessão/run continuamente no Cloud SQL → *SIGTERM* (Cloud Run avisa antes de parar) faz flush do que é GCS-backed.

### 4.2 Registry (Cloud SQL) — esboço
```
tenants(id, gcip_tenant_id, name, plan, created_at)
users(id, tenant_id, gcip_uid, role)
instances(id, tenant_id, user_id, cloud_run_service, status, endpoint)
agents(id, tenant_id, instance_id, name, type[copilot|studio], model, config_json, workflow_json)
connectors(id, tenant_id, user_id, composio_connection_id, app, status)
runs(id, tenant_id, agent_id, trigger[chat|cron|event], status, cost_cents, started_at, ended_at)
sessions(id, tenant_id, instance_id, ...)          -- session store externalizado do Wayne
artifacts(id, tenant_id, run_id, kind, gcs_uri, meta_json)
routines(id, tenant_id, agent_id, cron, timezone, enabled, scheduler_job)
usage_events(id, tenant_id, run_id, kind[llm|tool|runtime], units, cost_cents, ts)  -- espelho/stream p/ BigQuery
```

---

## 5. Fronteiras dos pilares (sem sobreposição)

- **Wayne Agent = runtime.** Loop, memória/aprendizado, skills, tools, gateway. Roda em Cloud Run.
- **OpenRouter = único gateway de modelos.** First-class no Wayne; agentes do Studio escolhem model IDs do OpenRouter. Nunca chamamos provedores direto (e por isso **não** usamos Vertex AI Agent Engine, que é Gemini-cêntrico).
- **Composio = braços externos**, via MCP, OAuth por usuário.
- **Google Cloud = toda a infra** (hospedagem, identidade, dados, storage, segredos, agendamento, eventos, uso, observabilidade, front, CI).
- **Stripe = cobrança** ao cliente final.

## 5.1 Adaptações do fork Wayne Agent

1–4 (higiene do rename, já aplicadas): self-update desativado, `debug share` sem egress público, skills dual-namespace, npm workspaces. Ver [`wayne-agent/FORK-NOTES.md`](../wayne-agent/FORK-NOTES.md).
5. **(nova, GCP) Estado externalizado para Cloud Run** — session store → Cloud SQL; memória/skills/artefatos → Cloud Storage; segredos → Secret Manager; telemetria → BigQuery/Cloud Trace (OpenTelemetry). É a **única adaptação não-trivial** (troca de backend de estado; reusa serviços prontos, não constrói store).

---

## 6. Stack travada (resumo)

| Camada | Serviço |
|---|---|
| Runtime de agentes | **Wayne Agent** (fork Hermes Agent, MIT) |
| Hospedagem | **Cloud Run** + **Cloud Run Jobs** |
| Front | **Firebase App Hosting** (Next.js) |
| Auth + Tenancy | **Identity Platform** + Firebase Auth |
| Registry / sessão / run state | **Cloud SQL (PostgreSQL)** |
| Storage (artefatos/memória) | **Cloud Storage** |
| Segredos | **Secret Manager** |
| Rotinas | **Cloud Scheduler** |
| Eventos/filas | **Pub/Sub** + **Cloud Tasks** |
| Modelos | **OpenRouter** |
| Conectores | **Composio** (via MCP) |
| Workflow UI | **ReactFlow** |
| Uso (custo tempo real) | **BigQuery** + **Looker Studio** |
| Observabilidade | **Cloud Trace + Logging + Monitoring** (OpenTelemetry) |
| Imagens / CI | **Artifact Registry** + **Cloud Build** |
| Cobrança | **Stripe** |

### Removidos na revisão v3
- ~~Clerk~~ → Identity Platform · ~~Supabase~~ → Cloud SQL + Cloud Storage · ~~Vercel~~ → Firebase App Hosting · ~~Daytona/Modal~~ → Cloud Run · ~~Inngest~~ → Cloud Scheduler/Pub/Sub · ~~Langfuse~~ → BigQuery + Cloud Trace.

---

## 7. Decisões travadas (2026-07-03)

1. ✅ **Infra = Google Cloud** para tudo que precisar.
2. ✅ **Runtime = Wayne Agent em Cloud Run** (scale-to-zero, max-instances=1), com **estado externalizado**.
3. ✅ **Registry/sessão/run = Cloud SQL (PostgreSQL)**.
4. ✅ **Uso + Observabilidade = 100% Google** (BigQuery + Looker Studio + Cloud Trace/Monitoring).
5. ✅ **Mantidos:** OpenRouter (modelos), Composio (conectores/MCP), ReactFlow (workflow), Stripe (cobrança).

---

## 8. Riscos & mitigação

- **Cloud Run é efêmero** → estado externalizado (§4.1); `max-instances=1` por tenant garante escritor único; SIGTERM faz flush.
- **Troca do session store SQLite→Cloud SQL** (a adaptação mais pesada) → interface do `wayne_state` é isolada; FTS5→Postgres FTS é bem trilhado; testar recall cross-sessão.
- **Manutenção do fork** → divergência mínima (rename + 5 adaptações documentadas); rebase periódico.
- **Custo descontrolado** → BigQuery/Looker desde M1; orçamentos por plano; scale-to-zero corta idle.
- **Isolamento de tenant** → serviço + Service Account + schema + bucket + segredos por tenant.
