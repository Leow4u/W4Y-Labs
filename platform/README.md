# W4Y Platform — UX proprietária + cola de orquestração

Aqui vive tudo que é **nosso** (thin glue, conforme [ARQUITETURA.md](../docs/ARQUITETURA.md)).
Infra 100% **Google Cloud**; runtime dos agentes fica em [`../wayne-agent/`](../wayne-agent/).

- `web/` — **casca fina Work4You** (Next.js): login + tenant router (`/instancias`,
  com saúde e "Entrar no Work4You") + admin cross-tenant. Os módulos de trabalho
  (Chat, Files, Cron, Skills, Logs...) NÃO são recriados aqui — vivem no dashboard
  da instância Wayne (decisão 2026-07-04, ver `web/README.md`). Deploy futuro em
  **Firebase App Hosting**; login via **Identity Platform** na próxima fase. *(M0)*
- `orchestrator/` — serviço **Cloud Run** que provisiona e gerencia **1 instância
  Wayne (Cloud Run) por tenant/usuário**: cria Service Account, schema no **Cloud SQL**,
  bucket no **Cloud Storage** e segredos no **Secret Manager**; registra em `instances`. *(M0)*

Serviços GCP usados pela plataforma: Identity Platform · Cloud SQL · Cloud Storage ·
Secret Manager · Cloud Run · Cloud Scheduler · Pub/Sub · Cloud Tasks · BigQuery ·
Looker Studio · Cloud Trace/Logging/Monitoring · Artifact Registry · Cloud Build.
Mantidos fora do GCP: **OpenRouter** (modelos), **Composio** (conectores), **Stripe** (cobrança).
