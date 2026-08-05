# Wayne Agent — Notas do Fork (hermes-agent → wayne-agent)

Fork realizado em 2026-07-03 a partir de `NousResearch/hermes-agent@main` (MIT).
Rename global case-preserving `hermes→wayne` em conteúdo e caminhos, preservando
URLs de crédito upstream (`github.com/NousResearch/hermes-agent`,
`hermes-agent.nousresearch.com`).

## O que ficou de fora (existe no upstream, não copiado)

| Upstream | Motivo |
|---|---|
| `website/` | Site de docs Docusaurus da Nous (o gerador do skills-index vive lá: `website/scripts/extract-skills.py` — portar se hospedarmos índice próprio) |
| `apps/work4you` (Electron), `apps/bootstrap-installer` | Distribuição/UX da Nous; a UX da W4Y é a plataforma web proprietária |
| `.github/` | CI da Nous (gates em `github.repository == NousResearch/hermes-agent`, upload a PyPI, contributor-check) — CI da W4Y será própria |
| `packaging/` (homebrew), `nix/`, `flake.*`, `.envrc` | Canais de distribuição da Nous / dev-shell Nix |
| `acp_registry/` | Registro do agente para o ecossistema ACP/Zed da Nous |
| `infographic/`, `assets/` | Branding da Nous |
| `package-lock.json` (raiz) | Removido — regenerar com `npm install` após poda dos workspaces |
| `README/CONTRIBUTING/SECURITY` (+ traduções) | Substituídos por docs da W4Y |
| `.plans/`, `hermes-already-has-routines.md`, `.mailmap` | Notas internas da Nous |

## Adaptações funcionais aplicadas no fork (além do rename)

1. **Self-update desativado** — `wayne update` / checagem de versão no banner /
   `_update_via_zip` / oferta de `git remote add upstream` neutralizados: no
   upstream eles baixam e aplicam o código da **Nous** por cima do checkout
   (perigoso num fork). Atualização do Wayne = fluxo de deploy da W4Y.
2. **`wayne debug share` não sobe mais logs para paste públicos por padrão**
   (paste.rs/dpaste) — risco de vazamento de dados de tenant.
3. **Skills aceitam os dois namespaces de metadata** — `metadata.wayne` (fork) e
   `metadata.hermes` (ecossistema agentskills.io/hubs externos), idem
   `${WAYNE_SKILL_DIR}`/`${HERMES_SKILL_DIR}`.
   3b. **Bug do dashboard basic-auth (login page 500) corrigido** —
   `wayne_cli/dashboard_auth/middleware.py`: `_auto_sso_response` auto-redirecionava
   para `/auth/login?provider=basic` (fluxo OAuth) quando havia 1 provider; o provider
   `basic` é password-only (`start_login` lança NotImplementedError) → a página de login
   dava 500. Fix: pular o auto-SSO quando `provider.supports_password` (cai na página
   `/login` com formulário usuário/senha). **Precisa entrar no próximo build da imagem**
   (a imagem no Cloud Run ainda não tem esse fix). Bug provável do upstream Hermes p/
   quem usa o provider basic em bind não-loopback.
3c. **Temas do dashboard reduzidos + idioma padrão PT (produto W4Y, 2026-07-04)** —
   `web/src/themes/presets.ts`: só `white` (novo, light neutro, **padrão**), `mono`
   (relabel "Black"), `cyberpunk`, `rose`; removidos Wayne Teal/(Large)/Nous Blue/
   Midnight/Ember. Aliases de migração em `themes/context.tsx` (default→white,
   midnight/ember→mono etc.). Sincronizado com `_BUILTIN_DASHBOARD_THEMES` no
   `wayne_cli/web_server.py`. `web/src/i18n/context.tsx`: locale padrão `pt`
   (escolha do usuário persiste; demais idiomas mantidos). Fontes intactas.
   Pendências de rebrand anotadas: banner ASCII do terminal ainda desenha
   "HERMES-AGENT"; tradução pt é pt-PT ("Registos", "Competências", "A executar")
   — revisar para pt-BR na fase de rebrand.
3d. **Rebrand mínimo W4Y (2026-07-04)** — hierarquia de marca: **Work4You** = produto
   (logo = a palavra em **Cascadia Mono**, vendorada em `web/public/fonts/CascadiaMono.woff2`,
   SIL OFL); **Wayne Agent** = o agente (tagline "The Digital Employee of the Gods");
   **W4Y-Labs** = quem desenvolve (rodapé). Mudanças: wordmark sidebar/header
   (`web/src/App.tsx`, i18n `app.brand`→"Work4You", `brandShort`→"W4Y",
   `footer.org`→"W4Y-Labs" nos 16 locales; rodapé sem link p/ nousresearch.com);
   `web/index.html` (title "Work4You", lang pt-BR); página de login
   (`wayne_cli/dashboard_auth/login_page.py`: paleta clara alinhada ao tema White,
   logo Work4You em Cascadia, textos pt-BR); TUI (`ui-tui/src/banner.ts` arte
   "WORK4YOU" no lugar de "HERMES-AGENT"; `branding.tsx` tagline nova + "· Work4You");
   pt.ts revisado pt-PT→pt-BR (Registros, Habilidades, Executando, Conectado).
   "Wayne Agent" permanece onde se refere ao AGENTE (ex.: tweets de achievements).
4. **Workspaces npm podados** — raiz mantém `apps/shared`, `ui-tui`, `ui-tui/packages/*`, `web`.
   `apps/shared` (`@wayne/shared`, ex-`@hermes/shared`) foi **recuperado** do clone
   original depois do corte inicial de `apps/*`: `web/` depende dele
   (`file:../apps/shared`) para o cliente WebSocket/JSON-RPC de baixo nível
   (`websocket-url.ts`, `json-rpc-gateway.ts`) — é a peça que faltava para o
   dashboard nativo (e a UI própria da W4Y) falarem com o gateway. Só o pacote
   `shared`; `apps/work4you` e `apps/bootstrap-installer` continuam de fora.
   **Dois ajustes de build por causa disso:** (a) o `Dockerfile` precisou de
   `COPY apps/shared/ apps/shared/` antes do `npm install` (senão o build do `web`
   dentro da imagem falha com `Cannot find module '@wayne/shared'`); (b) o
   `.dockerignore`/`.gcloudignore` passaram a excluir só `apps/work4you/` e
   `apps/bootstrap-installer/`, não `apps/` inteiro.

## Adaptação #5 — Estado externalizado para Cloud Run (planejada, M0)

O Wayne guarda estado em disco local (`~/.wayne`), mas **Cloud Run é efêmero** (o filesystem
some no scale-to-zero). Redirecionar (ver `docs/ARQUITETURA.md` §4.1):
- session/run store (`state.db`, SQLite+FTS5) → **Cloud SQL (Postgres)**; FTS5 → Postgres FTS;
- memória/skills (`MEMORY.md`, `USER.md`, `skills/`) → **Cloud Storage** (hidrata no boot, flush no SIGTERM);
- credential pool/config → **Secret Manager**; telemetria → **BigQuery/Cloud Trace** (OpenTelemetry).
Serviço Cloud Run por tenant com `max-instances=1` (escritor único) / `min-instances=0`.
Única adaptação não-trivial: troca de backend de estado, reusando serviços prontos — não constrói store.

## Pontes que continuam apontando para infra da Nous (inertes ou aceitáveis no protótipo)

- **Catálogo de modelos**: `wayne_cli/config.py` busca
  `hermes-agent.nousresearch.com/docs/api/model-catalog.json` (fallback gracioso
  para listas embutidas). Repontar para catálogo próprio depois.
- **Índice de skills** (`WAYNE_INDEX_URL`): idem — serve o catálogo da Nous.
- **Atribuição OpenRouter** (`HTTP-Referer` no auxiliary client): URL upstream.
- **Provisionamento gerenciado de bot Telegram**
  (`setup.hermes-agent.nousresearch.com`): serviço da Nous; não usar — gateway
  manual com token próprio funciona.
- **Módulos Nous inertes sem credenciais Nous** (falham gracioso / caem no
  fallback): `agent/credits_tracker.py` (+`nous_rate_guard`) — lê headers
  `x-nous-credits-*` que a OpenRouter não emite; provider de cron gerenciado
  "chronos" (cai no scheduler embutido); `plugins/dashboard_auth/nous`;
  `wayne_cli/proxy/adapters/nous_portal.py`; fluxos `--portal`.
  O medidor de custo da W4Y é BigQuery/Looker Studio (ver `docs/ARQUITETURA.md`), não o credits_tracker.
- **Imagem Docker**: referências viraram `nousresearch/wayne-agent` (inexistente
  de propósito) — **buildar imagem própria** com o `Dockerfile` do repo.

## Estado/configuração

- Diretório de estado: `~/.wayne` (Windows: `%LOCALAPPDATA%\wayne`), env `WAYNE_HOME`.
- Env vars: `HERMES_*` → `WAYNE_*` em todo o código, scripts e Docker.
- Entry points CLI: `wayne`, `wayne-agent`, `wayne-acp`.
- Grupo de entry points de plugins pip: `wayne_agent.plugins` (plugins de
  terceiros compilados para hermes não autocarregam — intencional).
- Contêiner precisa iniciar como root (contrato do s6/stage2-hook) — atenção em
  K8s com `runAsNonRoot`.

## Validado localmente (2026-07-03) — `api_server` end-to-end via OpenRouter

Rodamos `wayne gateway run` local (Windows nativo) e conversamos de ponta a
ponta através do `platform/web` (proxy Next.js → `api_server` real →
OpenRouter). Funcionou 100% igual ao Hermes original — mesmo contrato SSE,
streaming, tool events, uso de tokens, memória de sessão entre turnos.
Descobertas a levar para o Dockerfile/orchestrator do M0:

1. **`WAYNE_HOME` no Windows nativo é `%LOCALAPPDATA%\wayne`, não `~/.wayne`**
   (`~/.wayne` só é usado no fallback genérico/Linux/container). Escrever
   `config.yaml` no lugar errado falha silenciosamente — o gateway sobe com
   "0 platforms enabled" sem nenhum erro.
2. **`api_server` exige o extra `messaging`** (traz `aiohttp`) —
   `uv sync --extra messaging` localmente; no Dockerfile, instalar com
   `.[messaging]` (ou um extra próprio menor, se quisermos evitar puxar
   telegram/discord/slack só para o `api_server` — não investigado ainda).
3. **Config do adapter fica em `platforms.api_server.extra`**, não no nível
   do bloco da plataforma: `host`, `port` e `key` (=`API_SERVER_KEY`) vão
   dentro de `extra:`. `enabled: true` fica um nível acima, fora de `extra`.
4. **Sessões têm título único** — o servidor rejeita (`400`) criar uma
   sessão com um título já em uso. Clientes (nossa UI) devem gerar títulos
   únicos por sessão, não reusar um literal fixo — ver
   `platform/web/src/app/novo-trabalho/Chat.tsx`.
5. **Dois servidores, propósitos diferentes** — `api_server` (porta 8642,
   gateway platform adapter, HTTP+SSE, é o motor de chat) vs. `wayne_cli/web_server.py`
   (porta 9119, dashboard completo via `wayne dashboard`/`wayne serve`). A
   plataforma W4Y só precisa do primeiro.

## Deploy no Cloud Run (2026-07-04) — armadilhas encontradas

Build local (Docker Desktop) → push Artifact Registry → deploy Cloud Run. Ver
`platform/infra/` (scripts reproduzíveis) e `platform/wayne-cloudrun/` (camada).

1. **CRLF quebra o s6 (CRÍTICO, específico de build no Windows).** Clonar/copiar
   o fork no Windows com `core.autocrlf=true` converteu os arquivos do s6
   (`docker/s6-rc.d/*/type`, `run`, `finish` — sem extensão, então as regras
   `*.sh eol=lf` do `.gitattributes` não os pegam) para CRLF. Resultado no boot:
   `s6-rc-compile: fatal: invalid .../type: must be oneshot, longrun, or bundle`
   → o init morre → o container nunca escuta na porta → Cloud Run falha com
   "container failed to start and listen on PORT". Corrigido: normalizado LF no
   disco + regra `.gitattributes` (`docker/s6-rc.d/**`, `docker/cont-init.d/**`)
   + rede de segurança no `platform/wayne-cloudrun/Dockerfile` (um `sed` que tira
   CR dos arquivos do s6). **Ao rodar no Windows, sempre verificar CRLF** (o
   `grep -lU` via `find -exec` dá falso positivo — usar leitura de bytes/Python).
2. **Dockerfile precisou de `COPY apps/shared/ apps/shared/`** antes do
   `npm install` (senão o build do `web` falha com `Cannot find module '@wayne/shared'`).
3. **Cloud Run = porta 8080 + host 0.0.0.0.** A camada `platform/wayne-cloudrun`
   semeia `config.yaml` com `api_server.extra.host=0.0.0.0`/`port=8080` e roda
   `gateway run` (args do Cloud Run). O `api_server` default é `127.0.0.1` — não
   funcionaria no Cloud Run.
4. **IAM:** a SA `w4y-mvp-dev-agent` começou só com `editor`+`serviceAccountUser`
   (cria recursos, mas não gerencia IAM). Deploy precisou do dono conceder mais
   (viramos `projectIamAdmin`+admins). Runtime SA (compute default) precisa de
   `secretAccessor` nos secrets; service agent do Cloud Run precisa de
   `artifactregistry.reader` no repo — o `deploy-wayne-cloudrun.ps1` concede.
5. **Colisão de variável no PowerShell:** parâmetro `-Image` colide com a config
   `$IMAGE` (case-insensitive) — renomeado para `IMAGE_NAME` no `_env.ps1`.
