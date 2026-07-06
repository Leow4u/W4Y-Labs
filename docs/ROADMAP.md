# W4Y Labs — Roadmap por Módulo

> Ler junto com [ARQUITETURA.md](./ARQUITETURA.md). Fases:
> **Fase 0 — Fundação** · **Fase 1 — MVP** · **Fase 2 — V1** · **Fase 3 — Escala**.

> **Revisão 2026-07-03 (v3):** infra em **Google Cloud**; runtime **Wayne Agent** em **Cloud Run**
> com **estado externalizado** (Cloud SQL + Cloud Storage + Secret Manager). Mantidos:
> **OpenRouter**, **Composio**, **ReactFlow**. Cobrança: **Stripe**.

> **Revisão 2026-07-05 (v4):** runtime Wayne em **Fly.io** (máquina + volume por tenant,
> suspend/wake nativo — ver ARQUITETURA v4); Google mantém plataforma (domínio/LB, IdP,
> registry, secrets, custo, CI, Scheduler). A entrega "estado externalizado" do M0 é
> **substituída pelo volume Fly** (feito); durabilidade extra (litestream→Tigris) na fase 2.
> M0 concluído em 2026-07-05: instância `wayne-w4y` em GRU atrás de work4you.ai, SSO,
> despertador de cron (Cloud Scheduler `wayne-cron-wake`).

Ordem: **Fundação → Novo Trabalho → Conectores → Artefatos → Uso/Observabilidade → Rotinas → Agent Studio.**

---

## Fase 0 — Fundação (pré-requisito de tudo)

**Objetivo:** esqueleto multi-tenant no GCP com uma instância Wayne real e **estado externalizado**.

**Reusar:** Wayne Agent · Cloud Run · Identity Platform · Cloud SQL · Cloud Storage · Secret Manager · Artifact Registry + Cloud Build · OpenRouter.

**Entregáveis:**
- ✅ Wayne Agent forkado e operacional (`wayne-agent/` — rename + 4 adaptações; compila; créditos MIT).
- **Adaptação #5 (estado externalizado)** — a peça-chave do M0:
  - session/run store do Wayne → **Cloud SQL (Postgres)** (FTS5 → Postgres FTS);
  - memória/skills → **Cloud Storage** (hidrata no boot, persiste no SIGTERM);
  - config/chaves → **Secret Manager**.
- Imagem do Wayne no **Artifact Registry** (build via **Cloud Build**).
- 1 serviço **Cloud Run** (Wayne) conversando via **OpenRouter**, `max-instances=1`/`min=0`.
- `platform/web`: Next.js + **Identity Platform** (login + seletor de tenant) no **Firebase App Hosting**.
- **Cloud SQL** com o registry (`tenants, users, instances, agents, runs, sessions, artifacts, connectors, routines, usage_events`).
- `platform/orchestrator` v0 (Cloud Run): sobe/derruba serviço Wayne por usuário e registra em `instances`.

**Cola a construir:** middleware de tenant (token Identity Platform → registry); provisionador de serviço Cloud Run por tenant (Service Account + Cloud SQL + bucket + segredos); adaptador de estado do Wayne.

---

## 1. Novo Trabalho — Copiloto Operacional Universal

**Motor:** a instância **Wayne (Cloud Run)** do usuário, acessada pela UI via API/WebSocket do gateway do Wayne.

### Capacidade → peça
| Capacidade | Como entrega |
|---|---|
| Conversar / pesquisar / escrever / documentos | Wayne (loop + skills) + **OpenRouter** |
| Programar / analisar arquivos / processar dados | tools de terminal do Wayne (no container Cloud Run) + **Cloud Storage** p/ arquivos |
| Automatizar (browser, formulários) | browser tools do Wayne |
| **Tarefa longa (fecha o navegador, roda na nuvem)** | **Cloud Run Jobs** (até 24h) via **Cloud Tasks/Pub/Sub**; notifica pelo gateway ao terminar |
| Voz/imagem/arquivos de entrada | multimodal via OpenRouter; uploads em Cloud Storage |
| **Memória / aprende com a experiência** | nativo do Wayne, persistido em **Cloud SQL/Cloud Storage** |
| Acionar agentes da conta | delegação/subagentes do Wayne |

**Fases:** (1) chat web ↔ instância Wayne (streaming WS), upload→GCS, custo por run em BigQuery. (2) acionar agentes + tarefas longas (Cloud Run Jobs) + browser. (3) roteamento de modelo por custo, voz completa, memória cross-agente.

**Cola:** cliente TS da API/WS do gateway; ponte run→Cloud SQL/GCS/BigQuery; notificações.

---

## 2. Agent Studio — Criar agentes (NL + templates)

**Reusar:** Wayne (blueprints/subagentes) · **ReactFlow** (canvas) · **Cloud SQL** (config) · **Cloud Run** (deploy do agente) · OpenRouter · Composio.

**Fases:** (1) criar agente por linguagem natural → config Wayne (prompt, modelo OpenRouter, skills, MCPs) salva em Cloud SQL; catálogo de templates (seed dos blueprints) com 1-clique para Ativar (provisiona serviço/perfil Cloud Run). (2) **canvas ReactFlow** → compila workflow p/ config + delegação; testar no Studio. (3) versionamento, A/B, marketplace.

**Cola:** gerador "NL → config"; compilador ReactFlow → config/delegação.

---

## 3. Rotinas — CRON e execuções agendadas

**Reusar:** **Cloud Scheduler** (cron gerenciado) · **Pub/Sub** (gatilhos por evento) · Cloud Run Jobs.

**Fases:** (1) UI cria job no **Cloud Scheduler** que acorda a instância/Job do agente; espelho em `routines`; histórico em `runs`. (2) gatilhos por evento (webhook Composio → **Pub/Sub** → Cloud Run); entrega no canal escolhido. (3) rotinas encadeadas; pausa por orçamento (integra **Uso**); wake-on-schedule com scale-to-zero.

**Cola:** UI de agendamento; sync `routines` ↔ Cloud Scheduler; ponte Pub/Sub → instância.

---

## 4. Artefatos — Artefatos gerados

**Reusar:** **Cloud Storage** (arquivos) + **Cloud SQL** (metadados) · busca semântica futura via **Vertex AI Vector Search** ou pgvector.

**Fases:** (1) coletor pós-run detecta saídas → `artifacts` + Cloud Storage; galeria por tenant; download. (2) versionamento, preview inline, vínculo artefato↔run↔agente, link compartilhável. (3) busca semântica; reuso como input; export p/ Drive/Notion via Composio.

**Cola:** serviço `artifact.collect()` (hook pós-run); retenção; ACL de compartilhamento.

---

## 5. Conectores — Composio

**Reusar:** **Composio** (250+ apps) via **MCP** (nativo no Wayne) · **Secret Manager** (tokens) · **Pub/Sub** (webhooks).

**Fases:** (1) catálogo de apps; OAuth por usuário; injeta MCP do Composio na config da instância; `connectors` no registry. (2) escopo por agente; health/reconexão. (3) conectores de tenant vs. pessoais; auditoria.

**Cola:** UI de conectores; mapeamento usuário ↔ Composio ↔ MCP da instância.

---

## 6. Uso — Custo de uso em tempo real

**Reusar:** **BigQuery** (eventos de uso do OpenRouter + Cloud Billing export) + **Looker Studio** (dashboards) · **Stripe** (cobrança).

**Fases:** (1) instância emite `usage_event` por chamada → **BigQuery**; painel Looker por tenant/usuário/agente. (2) somar custo de runtime (Cloud Run) e ferramentas; limites/orçamento por plano; alertas (Cloud Monitoring). (3) cobrança **Stripe** (assinatura + consumo); corte automático ao estourar orçamento.

**Cola:** hook de instrumentação (OpenRouter → BigQuery); agregação; painel; sync → Stripe.

---

## 7. Observabilidade

**Reusar:** **Cloud Trace** (spans do loop via **OpenTelemetry**) · **Cloud Logging** · **Cloud Monitoring** · **BigQuery** (traces de LLM por run).

**Fases:** (1) instrumentar Wayne com OpenTelemetry → Cloud Trace (prompt, passos, ferramentas, latência); logs em Cloud Logging; tudo por tenant/agente/run. (2) dashboards por agente/rotina; taxa de erro; feedback 👍/👎. (3) LLM-as-judge; alertas de regressão; SLOs por tenant.

**Cola:** instrumentação OpenTelemetry única (span já carrega custo → alimenta **Uso**); propagação de IDs.

---

## 8. Admin — console da plataforma (requisito 2026-07-04)

Visão da W4Y sobre **todos os tenants** (escala-alvo: **2.000 usuários**): tenants, usuários,
instâncias (saúde/custo), runs agregadas, falhas. Restrito a operadores (role admin).

- ✅ **v0 entregue**: `/admin` em `platform/web` — saúde da instância Wayne (Cloud Run),
  agregados cross-tenant do registry (tenants/usuários/runs/custo), tabela por tenant;
  role derivado por e-mail no dev-auth (vira custom claim no Identity Platform); acesso
  não-admin → 404.
- **v1 (M2+)**: gestão de tenants/usuários (Identity Platform Admin SDK), controle das
  instâncias por tenant (orchestrator: criar/pausar/reciclar), quotas e limites por plano,
  billing por tenant (Stripe), auditoria.

---

## Marcos

| Marco | Escopo |
|---|---|
| **M0** | Fork Wayne + **estado externalizado** (Cloud SQL/GCS/Secret Manager) · instância Cloud Run via OpenRouter · Identity Platform + Cloud SQL + orchestrator v0 · `platform/web` no Firebase App Hosting |
| **M1** | Novo Trabalho F1 (chat→instância) + Conectores F1 (Composio/MCP) + Uso/Observ. F1 (BigQuery + Cloud Trace) + Admin v1 (gestão de tenants) |
| **M2** | Artefatos F1 + Rotinas F1 (Cloud Scheduler) + tarefas longas (Cloud Run Jobs) |
| **M3** | Agent Studio F1 (NL + templates) + Novo Trabalho F2 (delegação de agentes) |
| **M4** | Agent Studio F2 (ReactFlow) + Uso F3 (Stripe) + endurecimento multi-tenant |
| **M5+** | Fases 3 (marketplace, evals, voz, escala) |

---

## Riscos & mitigação

- **Cloud Run efêmero** → estado externalizado (ARQUITETURA §4.1); `max-instances=1`/tenant; SIGTERM flush.
- **Swap SQLite→Cloud SQL** (adaptação mais pesada) → interface isolada; FTS5→Postgres FTS; testar recall.
- **Manutenção do fork** → rename + 5 adaptações documentadas; rebase periódico.
- **Custo** → BigQuery/Looker desde M1; orçamentos; scale-to-zero.
- **Isolamento** → serviço + Service Account + schema + bucket + segredos por tenant.

---

## Backlog — features futuras (produto/UX)

> Ideias flagueadas durante a curadoria de Configuração (benchmark Manus web). Concept aprovado, implementação futura.

- **Wayne no navegador local** (estilo "Claude in Chrome") — extensão **própria** (Manifest V3, auditável, permissões mínimas, consentimento explícito) que deixa o agente **ver e controlar o Chrome LOCAL do usuário ao vivo**. Encaixe já existente: toolset de navegador do Wayne suporta `browser.cdp_url` (dirige navegador por Chrome DevTools Protocol) + gateway/WebSocket + página de Pairing → ponte nuvem↔cliente local por relay autenticado. **NÃO** usar o repo BrowserKing (repack pirata da extensão proprietária da Anthropic, com `auth-bypass.js`, "MIT" inválida, bundle inauditável — descartado por copyright + circumvenção + supply-chain). Esforço = funcionalidade própria de semanas, barra de segurança altíssima (controla navegador logado). Distinto da "Navegador na nuvem", que já é o browser headless da instância.
- **Avisos de uso no chat** (formato Hermes, fonte OpenRouter) — faixas 50/75/90% + 402 amigável com link de upgrade; ver memória billing-usage-notices.
- **Controlo de dados** (seção de settings) — limpar memória (`/api/memory/reset`) + excluir sessões (`deleteSession`/bulk-delete); lastro real.
- **Privacidade** (seção de settings) — toggles memória/perfil + anonimizar (`privacy.redact_pii`).
- **Bloco 3 — auto-save** no Config do usuário (remove o botão Salvar; estilo Manus/Claude).
- **Mail** (canal) — plugin de e-mail do Wayne (IMAP/SMTP; conecta conta existente, não hospeda `@wayne`).
