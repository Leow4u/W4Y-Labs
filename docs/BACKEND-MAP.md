# Mapa do Backend — o que é nativo e o que a UX usa

> **Regra de uso (16/07/2026):** leia ISTO antes de construir qualquer coisa.
> Se a capacidade não está aqui, leia o código UMA vez e escreva aqui — nunca duas.
> A tela NUNCA inventa, nunca decide, nunca promete o que o backend não faz.
> Toda linha marcada ✅ foi verificada em código com arquivo:linha em 15/07/2026.

## Contratos verificados (a "física" do sistema)

| Contrato | Onde | Verificado |
|---|---|---|
| Projeto = LINHA que possui N pastas; membership = prefixo mais longo por SEGMENTOS (aceita `/` e `\`) | `wayne_cli/projects_db.py` (`project_for_path`), `tui_gateway/project_tree.py` (`_FolderIndex`) | ✅ |
| `projects_db` é agnóstico de filesystem — caminho Windows numa linha funciona em host Linux (fix `_WIN_ABS_RE` em `_normalize_path`) | `projects_db.py:142` | ✅ |
| cwd da sessão vai no `session.create` e é **IGNORADO no resume** — a pasta se decide ao iniciar | `web/src/hooks/useChatSession.ts:250` (contrato documentado) | ✅ |
| `session.info` carrega `cwd` — o servidor é a autoridade; quando o cwd muda, o servidor **anuncia** (`_emit`) | `tui_gateway/server.py` ~3252 (payload), :3818 (precedente do emit) | ✅ |
| "default" NÃO é agente — é a instalação (*"default (pre-profile) WAYNE_HOME"*); perfis são lista PLANA, sem hierarquia | `wayne_cli/profiles.py:260`, `:604` (`ProfileInfo` sem campo de projeto) | ✅ |
| ⛔ NÃO vincular agente a projeto — eixos ortogonais; o cruzamento nativo é a TAREFA do kanban (`project_id` + assignee) | `profiles.py:604`, `kanban_db.py:1111` | ✅ |
| Scanner de skills: `Finding{pattern_id, severity, category, file, line, match, description}`; endpoint serializa tudo MENOS `match` e `pattern_id`; `scanned_at` também fica de fora | `tools/skills_guard.py:70-90`, `web_server.py:11562-11573` | ✅ |
| Política de instalação: **4 tiers** — builtin (tudo), trusted (bloqueia dangerous), community (bloqueia caution+dangerous), agent-created (dangerous → **ask**). Trusted = openai, anthropics, huggingface, NVIDIA | `skills_guard.py:51-61` (`INSTALL_POLICY`), `TRUSTED_REPOS` | ✅ |
| Veredito: critical→dangerous, high→caution, **medium/low sozinhos→safe** | `skills_guard.py:1064` (`_determine_verdict`) | ✅ |
| Install do dashboard roda `skills install --yes` SEM `--force` → `policy: "block"` do scan é previsão verdadeira | `web_server.py:11142`, `skills_hub.py:655` | ✅ |
| `_heal_dead_cwd` sonda o disco e REESCREVE `session["cwd"]`; pasta Windows em host Linux só sobrevive porque `dirname` POSIX quebra na 1ª volta — **sorte, não projeto; não "melhorar" esse loop** | `server.py:1428-1465` | ✅ |
| `COPY` do Docker MESCLA `web_dist` (não substitui) — sem `rm -rf` antes, bundles acumulam (82 no fly193) e enganam grep | `platform/wayne-fly/Dockerfile.ui` e `.projects` (já corrigidos) | ✅ |
| Gateway aparece no `ps` como `wayne gateway run` (NÃO "tui_gateway"); traceback `gateway-default.tmp` no boot é benigno | diagnóstico fly189 | ✅ |

## Segurança / multi-tenant — o que foi verificado (16/07)

| Achado | Onde | Verificado |
|---|---|---|
| Auth do dashboard = **UM `_SESSION_TOKEN` por processo**, comparado com `hmac.compare_digest`. Autentica o DASHBOARD, não o USUÁRIO — não há auth por-usuário dentro de um tenant | `web_server.py:314` (`_has_valid_session_token`), `dashboard_auth.py` | ✅ |
| A camada de auth **NÃO conhece tenant** — só `_connector_tenant_id` (conectores). Tenant não é parâmetro de request | `web_server.py:2062` | ✅ |
| Isolamento entre tenants = **1 app Fly por tenant** (`wayne-w4y` = "tenant W4Y"), processo próprio, token próprio, WAYNE_HOME próprio → **isolamento FÍSICO** | `platform/wayne-fly/fly.wayne-w4y.toml:1` | ✅ |
| **Recalibração:** a alegação de "cross-tenant crítico / falsificação de sessão" pressupõe multi-tenant de PROCESSO COMPARTILHADO (um app, N tenants por param). Nossa topologia é 1 app por tenant → a versão "crítica" cross-tenant **não se sustenta hoje**. O limite REAL é: sem auth por-usuário DENTRO de um tenant | análise 16/07 | ⚠️ parcial |
| **NÃO verificado:** posse de sessão INTRA-tenant (um usuário do mesmo tenant acessa sessão de outro?); modo gated/OAuth (`auth_required=True`) na prática. Precisa de UMA revisão de segurança com alvo — não repo-wide | — | ❌ |

## Capacidades nativas AINDA NÃO ligadas na UX

> **Executado em 16/07 (fly196 — Ondas 0+1):** itens **1** (scan, fly195), **2** (árvore
> do servidor via `GET /api/projects/tree`; sidebar = renderizadora, regra cliente vira
> fallback), **3** (colunas name/icon/color assumem; sidecar = legado somente-leitura com
> backfill), **4** (CRUD por linha: PATCH/archive/DELETE; projeto LOCAL = só linha, nunca
> toca disco), **8** (`match` serializado + trecho na modal), **10** (facts = perfil Code),
> **11** (aninhamento └ via `parent_session_id`). Restam: 5, 6, 7, 9, 12 (só leitura do
> gravado — sem discovery ativo), 13. Gotcha novo: `scoped_session_ids` do builder mistura
> tiers (explícito+auto+descoberto) — o endpoint REST recorta só os explícitos, senão
> sessões de projeto-auto SOMEM de Recentes (comentado no endpoint).
>
> **fly197:** auto-projetos (tier 2, `isAuto`) agora RENDERIZADOS na sidebar como linhas
> adotáveis — clique = adota (`projects.create` idempotente via `registerFolderProject`)
> e entra no projeto; até adotar, sem menu/meta (não há linha pra operar). Com isso o
> recorte de scoped voltou a cobrir TODOS os nós da árvore (todo escopado tem casa visível).
> Padrão nativo confirmado: upstream `workspace-groups.ts` — *"isAuto... Deletable =
> dismissable"*; o "dismiss" do desktop NÃO foi replicado (mecanismo não verificado).

| # | Capacidade | Onde vive | Hoje na UX | Custo p/ ligar |
|---|---|---|---|---|
| 1 | **Scan de segurança na modal do marketplace** (veredito + achados + política) | `GET /api/skills/hub/scan` (web_server.py:11490) | **CONSTRUÍDA e verificada (tsc+build), aguardando deploy — fly195.** O console `?full=1` já usava; a tela do usuário não | só deploy |
| 2 | **Árvore de projetos do servidor** — membership autoritativo, contagens, previews | `projects.tree` / `projects.project_sessions` (server.py:10952/10979) + `project_tree.py` (558 linhas) | sidebar agrupa no CLIENTE (regra portada; o motor não) | M |
| 3 | **Nome/ícone/cor do projeto nas colunas do projects_db** | `projects_db.py` (`icon`, `color`, `description`) | web guarda num arquivo sidecar paralelo (`project-meta.ts`) — **duplicação de estado real** | P |
| 4 | **CRUD de projeto por linha** — archive/delete/update/set_primary | `projects.archive/delete/update/set_primary` (server.py:10662-10718) | menus da sidebar operam PASTAS via `/api/files` | P–M |
| 5 | **Raias de git** (branch/worktree por sessão) | `project_tree` lanes + `git_branch`/`git_repo_root` gravados por sessão | não renderiza. Dado JÁ é gravado p/ repos de nuvem; p/ pasta local NUNCA existirá (probe roda no host) | M — só p/ perfil "Code" |
| 6 | **Worktrees de tarefa do kanban** — branch determinístico ancorado no repo do projeto | `kanban_db.py` (`workspace_kind`, `branch_name`, `project_id`), `branch_name_for` | Operações não expõe | M–G |
| 7 | **Orquestração cross-agente** — assignee/decompose/dispatcher/swarm | kanban nativo *(da memória 10/07 — NÃO re-verificado em código)* | não exposta | G |
| 8 | **Trecho ofensor no scan** (`Finding.match`) | existe no scanner; endpoint não serializa | UI mostra `arquivo:linha` sem o trecho | 1 linha de BACKEND |
| 9 | **Épico billing** — Stripe, /planos, provisioner | branch própria *(memória 10/07)* | só avisos 50/75/90 + medidor foram pro ar (fly128) | M |
| 10 | ~~`project.facts`~~ **RESOLVIDO 16/07**: detecção de workspace de código (manifests, package manager, comandos de verify) pro surface de verify do desktop; par com `verification.status` (server.py:5257). NÃO é gap de v0 — pertence ao perfil "Code" (junto das raias, item 6) | server.py:5239 | — | — |
| 11 | **Aninhamento de ramificações** — sessão-filha sob a mãe (conector └─) via `parent_session_id`/`_lineage_root_id` | `_project_tree_row` (server.py:~10880); o desktop Hermes desenha via `flattenSessionsWithBranches` | nossa sidebar lista tudo plano — "Ramificar" existe mas a filha não aninha | P–M |
| 12 | **Descoberta de repos** — repos com histórico mas sem sessão carregada viram projeto | `projects.discover_repos`/`record_repos` (server.py:10820/10832) | web não chama | P |
| 13 | **Overlay /journey nativo** + profundidade do kanban (runs/logs/claims/dependências/anexos) | ui-tui overlays; `kanban_db.py` *(memória/plano — não re-verificado)* | Operações expõe o básico curado | M |

## Kanban — verificado 16/07 (prints do Leonardo + greps)

- **Estados nativos (9):** `triage, todo, scheduled, ready, running, blocked, review, done, archived`
  (`kanban_db.py:102`). `blocked` tem semântica rica: motivos `needs_input`/`capability` são
  "verdadeiramente bloqueados"; re-bloqueio repetido (`BLOCK_RECURRENCE_LIMIT`) escala pra `triage`.
- **Nossa Operações É uma lente, não um fork** (`OperationsPage.tsx:46-50`): 5 colunas dobram os 8
  ativos — backlog=triage+todo+scheduled · queued=ready · running=running+blocked (âmbar +
  block_reason) · review · done. **Arrastar pra "Na fila" seta `ready` e o dispatcher nativo
  ACORDA na hora e spawna workers** (comentário do próprio arquivo, :6-8) — a Operações já
  dirige o dispatcher hoje.
- **Visível na UI nativa do plugin** (Plugins → Kanban): `Orchestration: Auto` + settings,
  botão "Despertar o dispatcher", multi-quadro, filtro por tenant, faixas por perfil, claims
  ("Reivindicado por um worker"), e a Triagem descreve um **specifier** ("um specifier vai
  detalhar a especificação"). O swarm do item 7 está MAIS verificado do que o mapa dizia;
  resta não-verificado: só o conteúdo das Orchestration settings.
- **Decompose VERIFICADO** (`kanban_tools.py:1390-1399`, descrição do `kanban_create`, verbatim):
  *"Used by orchestrator workers to fan out — decompose work into child tasks with specific
  assignees, link them into a pipeline, then complete your own task. The dispatcher picks up
  the new tasks on its next tick and spawns the assigned profiles."* Não é RPC separada — é o
  agente usando `kanban_create` com filhos+assignees.
- **Ferramentas de kanban do AGENTE** (verificadas): show, list, create, complete, block,
  unblock, comment, link, heartbeat. **Gate por perfil/modo**: `_profile_has_kanban_toolset`
  (:52) e `_check_kanban_mode` (:65) — o toolset precisa estar habilitado pro agente.
- **Campos da TAREFA (verificados, kanban_db.py):** `priority INTEGER DEFAULT 0` (:1102);
  **`goal_mode`** (:897-903) = worker em LOOP com juiz — repete até o juiz aprovar, estourar
  `goal_max_turns` ou bloquear (default False = um tiro só) — *"insiste até conseguir"*, feature
  de venda; `workspace_kind` scratch|dir|**worktree** (:135 — a porta do kanban profundo);
  `parents` = pipeline; skills por tarefa ≠ toolsets do perfil (o código valida e corrige, :2530).

## Fontes = qual app/web o agente usou — RESOLVIDO fly203 (2 palpites falharam antes)

- **NÃO existe** evento `connector.*` nem campo `toolkit` numa EXECUÇÃO de tool. O único sinal é o
  NOME da tool, cru: `mcp_composio_GMAIL_FETCH_EMAILS` (contrato `mcp_<server>_<tool>` acima).
- **`ConnectorEventsPanel` NÃO serve de reconhecedor** — ele lida com TRIGGERS (config de eventos),
  lê `getConnectorTriggers` e o `toolkit` que só existe em objetos de TRIGGER (api.ts:1629), nunca
  numa execução. Não confundir.
- **Reconhecedor certo (fly203):** INVERTER — pegar os apps CONECTADOS (`getConnectorsStatus`,
  `accounts[].toolkit` ACTIVE = slug tipo `gmail`, api.ts:1589) e marcar usado se o slug aparece como
  substring (case-insensitive) num nome `mcp_composio*`. Testa contra o conjunto CONHECIDO, não
  adivinha onde `<TOOLKIT>` termina (o que quebrou os regexes). "Internet" = categoria `toolWeb` do
  ToolLine (`isWebSourceTool`, exportada), excluindo `mcp_composio*`. Gap conhecido: só escopo global —
  app conectado só por-agente não entra (igual ao submenu de conectar do dock).

## Contratos do dock reativo — verificados 16/07 (D2.1)

- **Nome de tool MCP no `tool.start`:** `mcp_<server>_<tool>` (`tools/mcp_tool.py:3941`, caixa
  preservada). Ação de conector = `mcp_composio_GMAIL_FETCH_EMAILS` (escopos `composio` e
  `composio_agente`, web_server.py:2001-2002). Heurísticas de UI DEVEM prever o prefixo.
- **Espectador de subagente (nativo e SEGURO):** `session.resume {session_id: <filho>, lazy: true,
  close_on_disconnect: true}` cria sessão-watch própria SEM construir agente e SEM roubar o
  transporte da mãe (server.py:5479-5532); `_mirror_subagent_to_child` (:3659-3717) traduz
  `subagent.*` em eventos de chat no sid da watch; espectador SEMPRE em conexão WS própria
  (o fast-path :5878 rebinda transporte — jamais reusar a conexão do chat); desanexo =
  drop do socket ou `session.close` (:7888, idempotente). `child_session_id` vem no
  `subagent.start` (:3579). Serve igual pra assistir workers do kanban no futuro.

## Desktop: casca fina × Hermes desktop completo (verificado 17/07)

Nossa casca `apps/desktop-shell/` = 1048 linhas, 7 .cjs (carrega work4you.ai da NUVEM + executor
local). O Hermes desktop COMPLETO `apps/desktop/electron/` está PARQUEADO no repo (dezenas de
módulos). Reaproveitável por balde:

- **Balde 1 — NÃO trazer (arquitetura, é o cérebro local):** `backend-command/ready/probes`,
  `bootstrap-platform/runner` = sobem o Python NA MÁQUINA. Reversão cara (instalador 150-250MB,
  ver [[mvp-v0-scope]]). O híbrido já resolve o que precisamos sem isso.
- **Balde 2 — TRAZER (UX desktop, compatível com nuvem):** `desktop-uninstall`,
  deep-link/protocol (`work4you://` no package.json, fiação a confirmar), `oauth-net-request`,
  `hardening`. Já TEMOS: Tray, globalShortcut (main.cjs).
  ⚠️ **AUTO-UPDATE — CORREÇÃO 17/07 (afirmei "reuso puro" e ERREI):** o `update-*.cjs` do Hermes
  é **git self-update** (git fetch + rebuild `--build-only` + relaunch; ver update-remote.cjs) —
  pressupõe repo clonado + Node + git na máquina. NÃO serve pra `.exe` empacotado (usuário final
  não tem repo). Auto-update da nossa casca fina = **electron-updater + feed GitHub Releases** =
  CONSTRUÇÃO, não port. Sem assinatura, cada update mostra aviso do Windows (funciona). Por isso
  saiu do Desktop-1 e virou decisão à parte.
- **Balde 3 — perfil "Code" (pós-validação):** `git-worktree-ops`, `git-repo-scan`, `git-root`,
  `git-review-ops`, `fs-read-dir`, `vscode-marketplace`, `session-windows`.

**Plano desktop (aprovado 17/07):**
- **Desktop-1:** DL-01..07 (inverter padrão: desktop sem projeto = pasta local `~/Work4You`;
  web sem projeto = nuvem). SÓ isso — auto-update saiu (é construção electron-updater, não port).
- **Desktop-2 (APROVADO 17/07, incluído no plano):** git worktree local (`git-worktree-ops`,
  `git-repo-scan`, `git-root`, `git-review-ops`) + fs-read-dir (navegação de arquivos local nativa).
  Perfil "Code". Chega via auto-update — SEM reinstalação manual (por isso Desktop-1 traz o
  auto-update primeiro). Conecta com raias/kanban-profundo LOCAL.
- Regras DL: DL-01 criar `%USERPROFILE%\Work4You` no 1º boot + registrar no cofre
  (`folders.cjs`: list/add/remove em userData/authorized-folders.json). DL-04 fail-closed JÁ existe
  (terminal_tool). DL-05 lock JÁ existe. DL-07 rotina→nuvem é NATURAL (scheduler vive na nuvem,
  usa WAYNE_HOME dela) — só blindar que criar rotina não carimbe cwd local. "Sem projeto" sai do
  menu (é estado organizacional, não ambiente); "Executar na nuvem" vira escolha explícita no desktop.
- Rebuild da casca = ação do Leonardo (baixar+reinstalar 1x); overlay web/backend = automático.

## Preview de HTML no dock: EXISTE e auto-abre — mas só enxerga a NUVEM (verificado 17/07)
A pré-visualização já está construída (RightDock.tsx `PreviewTab` ~:1330: iframe sandbox
allow-scripts, toggle mobile/desktop, refresh, abrir em aba, botão Code). Auto-abre no fim do
turno: NativeChatPage ~:742 procura um `.html` NOVO em `dockChanges` e emite
`openSignal {tab:"preview", path}`. Contratos: `dockChanges` = inline_diff dos tool.complete
(diffs por arquivo); `dockOutputs` (Saídas) = parser MEDIA:/@session/bare-path do texto do chat
(rota INDEPENDENTE — por isso Saídas acha arquivo que o preview não abre). Leitura de bytes:
`readDataUrlSmart` → `/api/fs/read-data-url` (+ `pathCandidates` p/ cwd relativo) — lê o root
gerenciado DO SERVIDOR. **GAP modo Local: RESOLVIDO fly207 (17/07), sem mudar a casca.**
Contrato: RPC `local.fs.read {session_id, path}` → `{ok, data_url, mime, size, name}`
(server.py ~:10092; em `_LONG_HANDLERS` p/ não travar o read loop) — proxy pela op `read_file`
do executor (executor.cjs:164, a ÚNICA com cofre por path; nunca usar op `shell` pra ler) via
`local_exec(session_key, ...)` (server.py:1993). Web: seam `lib/localFile.ts`
(normalizeLocalPath cobre `/c/…` MSYS e `C:\`/UNC; registry de reader — a página registra o
reader da sessão viva); readDataUrlSmart/readTextSmart do RightDock roteiam path local pelo
executor; gatilho de auto-preview ampliado pra Saídas (dockOutputs) além de dockChanges.
LIMITES (próxima casca 0.2.2 resolve): `read_file` é utf-8 → binário local (png/pdf/office)
recusado com erro limpo — precisa de op base64 na casca; `shell.openExternal` não está no
preload → botão "Abrir no navegador" adiado pro mesmo slot; cap 10MB é pós-transferência
(read_file não tem probe de tamanho).

## ⚠️ GOTCHA modo Local: sessão NASCE na nuvem — a 1ª msg do hero corre contra o `local.session.set` (fly206)
`env_type=local-desktop` só é setado por `local.session.set` (server.py:9977) — o `session.create`
NÃO carrega env_type (nasce cloud). No hero, a 1ª mensagem fica em fila (`pendingSendRef`) e o
drain dispara `prompt.submit` ANTES do `local.session.set` chegar → o turno roda em /opt/data com
o chip dizendo "Work4You" (e SEM fail-closed, porque env_type nunca virou local). Conserto
(fly206): portão `beforeSubmit` no `useChatSession` — awaited antes de TODO `prompt.submit`
(caminho direto E da fila); a página injeta via ref o arm de Local (`desk.setLocal` +
`local.session.set`). Regra geral: qualquer side-effect que precise valer NO turno tem que passar
por esse portão, não por effect solto (effects perdem a corrida contra a fila). Bug 1 junto: o
default `~/Work4You` no desktop era gated em `getLastProject()===undefined` (só valia pra usuário
virgem); agora vale sempre, opt-out = "Executar na nuvem" explícito (sentinela NONE).

## ⚠️ GOTCHA electron-builder: `.cjs` novo TEM que entrar no `build.files` (fly/0.2.0→0.2.1)
Adicionar módulo `.cjs` na casca NÃO basta — o electron-builder só empacota o que está na lista
EXPLÍCITA `package.json > build.files`. Fora dela → `Cannot find module` em RUNTIME (o `.exe`
instala e crasha no boot). `node --check` valida sintaxe do FONTE, não prova o empacotamento.
Verificar o pacote de verdade: `npx asar list release/win-unpacked/resources/app.asar | grep <arquivo>`
ANTES de declarar o instalador pronto. (Erro real 17/07: os 5 módulos portados fs-read-dir/
git-*/hardening ficaram fora da lista; 0.2.0 crashou; 0.2.1 os incluiu.)

## PIVÔ DESKTOP (17/07) — fatos verificados p/ o desktop com motor local (Cursor×VS Code)
Decisão do Leonardo: desktop = Hermes COMPLETO local com marca Work4You; o que é nosso protegido
na nuvem. Fatos que sustentam o plano (2 investigações 17/07, arquivo:linha nos transcripts):
- **UMA UI SÓ — CONFIRMADO:** o gateway local serve o MESMO web_dist da nuvem (web_server.py:121,
  :15113-15140) e injeta `window.__WAYNE_SESSION_TOKEN__` no index.html servido (:15055-15075) —
  api.ts:102 já lê. Electron → `loadURL(http://127.0.0.1:<porta>)` e auth resolve sozinha. O
  frontend próprio do apps/desktop (287 arquivos) DESCARTA-SE. Prontidão: linha
  `WAYNE_DASHBOARD_READY port=N` (web_server.py:16439) ou ready-file (:16188).
- **Motor de boot transplantável:** ~1.300 linhas em 5 módulos puros/testados do apps/desktop
  (backend-command/ready/probes + bootstrap-runner) — instalam uv+Python3.11+PortableGit+ffmpeg/
  ripgrep+clone+`uv sync --extra all` via scripts/install.ps1 (já meio-Wayne; URLs do repo em
  :139-140 ainda NousResearch). Renames HERMES_*→WAYNE_* obrigatórios (~30 vars; backend lê WAYNE_).
  1º boot: ~0,5-1,5GB download, 5-20 min (instalação guiada, não esconder). Instalador shell
  ~100-150MB NSIS.
- **Update upstream:** .exe é consumidor puro; git self-update via app Tauri separado
  (hermes-setup) + `hermes update`; PRESSUPÕE repo público. Nosso repo é privado → decisão de
  distribuição: mirror público × ZIP no nosso domínio (install.ps1 já tem fallback ZIP :1488) ×
  payload embutido.
- **Proteção (caixa "modelo na nuvem"):** NENHUM segredo-mestre chega ao tenant hoje (provisioning
  keys/org Composio/Stripe = só provisioner+casca). Ao dispositivo iriam 2 chaves JÁ per-user:
  OpenRouter capada (teto server-side na criação, server.js:39-48) + Composio do projeto DEDICADO
  do tenant. **Proxy estilo Cursor é config-only no cliente:** runtime aceita base_url custom
  (cli.py:3833-3837, auxiliary_client.py:2054+, cita LiteLLM) → construir depois, por gatilho.
- **Cron local roda DENTRO do app** (WAYNE_DESKTOP=1): app fechado = agente local parado → 24/7
  continua argumento da NUVEM (híbrido preservado).
- **v1 NÃO leva:** renderer próprio, pool multi-perfil, updater Tauri, MSI, WSL, VS Code ext.

**L1 ENTREGUE (17/07, casca 0.3.0) — contratos:** modo motor-local é o DEFAULT; escape `W4Y_CLOUD_SHELL=1` (e botão "Usar na nuvem" na tela de erro). `WAYNE_HOME=%LOCALAPPDATA%\wayne`; motor instalado em `<WAYNE_HOME>\wayne-agent` (venv preservado em updates). Fonte do motor: env `WAYNE_SOURCE_ZIP_URL` (setada pelo main.cjs; default `DEFAULT_ENGINE_ZIP_URL` no topo do main.cjs → bucket público `gs://w4y-engine-dist`, ZIP gerado por `platform/wayne-fly/build-engine-zip.ps1` — layout: 1 pasta top-level c/ pyproject+uv.lock+README+`.wayne-engine-version`+web_dist; **rodar `uv lock` antes de gerar release**). Boot: escada W4Y_DEV_SOURCE_ROOT→instalado→bootstrap (install.ps1 empacotado em resources/scripts); spawn `venv\python -m wayne_cli.main serve --host 127.0.0.1 --port 0` c/ `WAYNE_DESKTOP=1`+token+ready-file; prontidão = ready-file × `WAYNE_DASHBOARD_READY port=N` (90s). Chave: `<WAYNE_HOME>\.env` `OPENROUTER_API_KEY` (campo mascarado no boot.html; interim até /device/engine-key da casca ir pro ar). IPC boot: `w4y:boot:event` + invokes state/key/retry/cloud. GOTCHAS ativos: `wayne update` NÃO funciona em instalação ZIP (update = re-rodar estágio repository); `-IncludeDesktop` incompatível c/ ZIP; SOUL.md ainda Nous (rebrand em lockstep c/ default_soul.py, pendente). Provisioner — INCIDENTE REAL confirmado (investigação 17/07, ao vivo no Fly/GCP): o deploy de 11/07 22:24 (opção A Composio, commit 8a8751c) **reutilizou a tag de imagem `p3`** por cima da imagem billing de 07/07 — o `provisioner-w4y` em produção (release v10, digest `2b2dcd74…`) NÃO tem `/ensure-key` desde então. A casca em produção É a feat/billing (Cloud Run digest `61f0fb09…`, go-live 07/07) e o Cloud Scheduler `wayne-reconcile-keys` (ENABLED, `*/5min` → `/internal/reconcile-keys`) segue chamando `/ensure-key` → 404 **silencioso** (a rota devolve 200 c/ `falhas[]`); a injeção de chave capada na ativação Stripe (`webhooks/stripe`) falha igual → tenant pago fica na chave antiga sem teto. CONSERTO: merge `integ/billing-merge` (server.js unificado: /provision /archive /reconfigure /ensure-key /device-key + Composio A + redact + HMAC constant-time); deploy DEVE sair dessa branch. REGRA NOVA: **NUNCA reutilizar tag de imagem** (`p3` 2× = causa-raiz; sempre tag nova `p4, p5…` ou digest; rollback só por digest — a imagem billing do `p3` foi sobrescrita e não existe mais). Pós-deploy: conferir se alguma ativação paga ocorreu entre 11/07 e o fix (`billing_events`/logs).

## ⚠️ 24/7 NÃO FUNCIONA HOJE — decisão de custo pendente (verificado 17/07)

`platform/wayne-fly/fly.wayne-w4y.toml:30-32`: `auto_stop_machines = "suspend"` +
`min_machines_running = 0`. A máquina da nuvem **DORME quando ocioso** e só acorda com request
HTTP de ENTRADA. O agendador de rotinas roda IN-PROCESS → congela junto; timer não gera tráfego,
não se auto-acorda. **Consequência: rotina noturna / agente 24h NÃO dispara com ninguém acessando**
— quebra o diferencial central do produto ("nuvem sempre ligada que Cursor/Codex não têm").
**Conserto:** `min_machines_running = 1` (1 máquina sempre viva). Trade-off = custo: hoje paga por
rajada (escala a zero, barato); com min=1 paga compute contínuo. Recomendação CTO: ligar no MVP
(custo modesto, sem isso o 24/7 não existe pra validar). DECISÃO DO LEONARDO (custo).

## Backlog canônico de paridade do chat
Ver memória `desktop-parity-checklist` (upstream em `C:/DEV/hermes-upstream`).

## Pendências operacionais
- fly195 (item 1) — deploy.
- #102 — AgentWorkflowPage ainda escreve "Default" no cabeçalho (alcançável só por URL).
- #103 — bundles acumulados: **corrigido** nos 2 Dockerfiles, provado no fly194 (1 bundle).
