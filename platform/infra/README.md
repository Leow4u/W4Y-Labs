# platform/infra — build & deploy do Work4You (M0)

Fluxo **reproduzível** para publicar o Work4You no Cloud Run **sem Cloud Build**
(build local com Docker Desktop → push para Artifact Registry → deploy no Cloud Run).
Alvo de plataforma: **linux/amd64**.

## Pré-requisitos
- **Docker Desktop** rodando (backend linux/amd64).
- **gcloud** autenticado como uma conta com acesso ao projeto. Nesta máquina o
  gcloud portátil e o Python são resolvidos automaticamente pelo `_env.ps1`
  (ver [gcp-access](../../../) na memória do projeto).
- Segredos já criados no Secret Manager: `openrouter-api-key`, `wayne-api-server-key`.

## Config (fonte única: `_env.ps1`)
| | valor |
|---|---|
| Project | `project-67a4bd4d-a990-406b-9e7` (nº `444206830924`) |
| Região | `southamerica-east1` |
| Artifact Registry | repo `w4y`, imagem `wayne-agent` |
| Cloud Run service | `wayne-agent` |
| Image URI | `southamerica-east1-docker.pkg.dev/project-67a4bd4d-a990-406b-9e7/w4y/wayne-agent:<tag>` |

`<tag>` = short SHA do git (com `-dirty` se houver mudanças não commitadas), ou timestamp UTC como fallback.

## Scripts
| Script | Papel |
|--------|--------|
| `build-wayne-local.ps1` / `push-wayne-image.ps1` / `deploy-wayne-cloudrun.ps1` | Imagem Wayne → Artifact Registry → Cloud Run (legado M0) |
| `deploy-web.ps1` | Casca pública Next.js → Cloud Run `w4y-web` |
| `configure-app-subdomain-dns.ps1` | DNS `app` na Hostinger → Fly `router-w4y` + `fly certs check`. |
| `configure-firebase-auth-email.ps1` | Templates/SMTP Firebase (legado). Produto usa Resend API via `platform/web` + secret `resend-api-key`. |
| `patch-url-map-web-paths.ps1` | Whitelist de paths `work4you.ai` no URL map `w4y-urlmap` → `w4y-web-backend`. |
| `wake-cron.ps1` | **IaC do despertador** Cloud Scheduler `wayne-cron-wake` (`*/15` UTC → GET Fly). Idempotente; **não** re-aplica no fluxo de deploy — só DR/recreate. Ver docs/BACKEND-MAP.md. |
| `setup-reconcile-cron.ps1` | Cloud Scheduler `w4y-reconcile-keys` (POST `/internal/reconcile-keys`, */5 UTC). Ver G1. |
| `setup-wake-tenants-cron.ps1` | Cloud Scheduler `w4y-wake-tenants` (POST `/internal/wake-tenants`, */5 UTC). Ver H1 + `wake-tenants-integration.md`. |
| `migrate-legacy-wayne-w4y.ps1` | One-off: `dev-tenant` → tenant próprio. Ver `legacy-tenant-migration.md`. |
| `publish-fly.ps1` | Provisioner (`p4`) + overlay UI tenant (`fly230`) no Fly. Requer `fly auth login`. |

## Passos
```powershell
cd "C:\DEV\W4Y Labs\platform\infra"

# 1. Build local (base + camada Cloud Run) para linux/amd64
.\build-wayne-local.ps1                 # ou -Tag <tag>

# 2. Login no Artifact Registry (token da SA) + push. Grava o digest em last-image.txt
.\push-wayne-image.ps1                   # ou -Tag <tag>

# 3. Deploy no Cloud Run (pina pelo digest de last-image.txt)
.\deploy-wayne-cloudrun.ps1              # ou -Image <uri-ou-digest>
```

Cada script imprime **image URI, digest, região e o comando exato de deploy**.

## Segurança (não-negociável)
- Segredos **nunca** entram na imagem. `wayne-agent/.dockerignore` exclui `.env`/`.env.*`;
  `platform/wayne-cloudrun/.dockerignore` exclui `.env`, `*.key`, `.secrets/`, etc.;
  a pasta `.secrets/` do repo fica **fora** de qualquer contexto de build.
- As chaves (`OPENROUTER_API_KEY`, `API_SERVER_KEY`) são injetadas em runtime pelo
  Secret Manager (`--set-secrets`), não bakadas.

## Notas de arquitetura
- **Topologia v2 (dashboard-first):** a porta 8080 do Cloud Run serve o **dashboard
  do Wayne** (SPA + `/api/*`, s6 service via `WAYNE_DASHBOARD=1`, basic-auth com
  credenciais do Secret Manager: `wayne-dashboard-username/password/auth-secret`);
  o gateway/`api_server` roda **interno** em `127.0.0.1:8642`. Login programático:
  `POST /auth/password-login` `{provider:"basic",username,password}` → cookie.
- A camada `platform/wayne-cloudrun/` mantém a imagem base próxima do upstream;
  todo o específico de Cloud Run (semear `config.yaml`, portas, `gateway run`) vive nela.
- Cloud Run é efêmero → estado não persiste entre cold starts nesta fase (M0/Fase 1).
  A externalização de estado (Cloud SQL/Storage) é a Fase 2.
- Deploy atual: `--min-instances=0 --max-instances=1` (escritor único + scale-to-zero),
  `--allow-unauthenticated` na borda (a autenticação real é o Bearer `API_SERVER_KEY`
  do próprio `api_server`). Endurecer para IAM + ID token é item de hardening.
