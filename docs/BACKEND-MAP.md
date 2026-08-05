# Mapa do Backend — contratos verificados e factos duros

> **Regra de uso (reescrita a 29/07/2026).** Este documento guarda a *física* do
> sistema: contratos verificados em código, topologia de segurança, gotchas e
> incidentes que custaram a aprender. Factos de validade longa, não fotografias
> do estado da UI.
>
> **Onde escrever o que descobriste** — a regra antiga dizia só "escreve aqui", e
> essa ambiguidade fez nascer um terceiro documento a repetir metade deste:
>
> | Descobriste | Escreve em |
> |---|---|
> | Um contrato do motor, uma gotcha, um incidente | **aqui** |
> | Que a UI não expõe algo que o motor já tem | [`INVENTARIO-SUPERFICIES.md`](./INVENTARIO-SUPERFICIES.md) |
> | Uma decisão de produto, de público ou de âmbito | [`PRODUTO.md`](./PRODUTO.md) |
>
> Não abras um ficheiro novo para nenhum dos três. Lê o código uma vez e escreve
> no sítio certo.
>
> Linhas marcadas ✅ foram verificadas em código, na data indicada na secção.
> **App única (ago/2026):** UI de produto converge para `apps/desktop` (browser +
> Electron); `wayne-agent/web` será removida — ver [`PLANO-APP-UNICA.md`](./PLANO-APP-UNICA.md).
> Canais legados `ui-latest.json` / `desktop-shell` estão mortos.

## Contratos verificados (a "física" do sistema)

| Contrato | Onde | Verificado |
|---|---|---|
| Projeto = LINHA que possui N pastas; membership = prefixo mais longo por SEGMENTOS (aceita `/` e `\`) | `work4you_cli/projects_db.py` (`project_for_path`), `tui_gateway/project_tree.py` (`_FolderIndex`) | ✅ |
| `projects_db` é agnóstico de filesystem — caminho Windows numa linha funciona em host Linux (fix `_WIN_ABS_RE` em `_normalize_path`) | `projects_db.py:142` | ✅ |
| cwd da sessão vai no `session.create` e é **IGNORADO no resume** — a pasta se decide ao iniciar | `web/src/hooks/useChatSession.ts:250` (contrato documentado) | ✅ |
| `session.info` carrega `cwd` — o servidor é a autoridade; quando o cwd muda, o servidor **anuncia** (`_emit`) | `tui_gateway/server.py` ~3252 (payload), :3818 (precedente do emit) | ✅ |
| "default" NÃO é agente — é a instalação (*"default (pre-profile) WAYNE_HOME"* — grafia interna do código; a interface pública do env é `WORK4YOU_HOME`); perfis são lista PLANA, sem hierarquia | `work4you_cli/profiles.py:260`, `:604` (`ProfileInfo` sem campo de projeto) | ✅ |
| ⛔ NÃO vincular agente a projeto — eixos ortogonais; o cruzamento nativo é a TAREFA do kanban (`project_id` + assignee) | `profiles.py:604`, `kanban_db.py:1111` | ✅ |
| Scanner de skills: `Finding{pattern_id, severity, category, file, line, match, description}`; endpoint serializa tudo MENOS `match` e `pattern_id`; `scanned_at` também fica de fora | `tools/skills_guard.py:70-90`, `web_server.py:11562-11573` | ✅ |
| Política de instalação: **4 tiers** — builtin (tudo), trusted (bloqueia dangerous), community (bloqueia caution+dangerous), agent-created (dangerous → **ask**). Trusted = openai, anthropics, huggingface, NVIDIA | `skills_guard.py:51-61` (`INSTALL_POLICY`), `TRUSTED_REPOS` | ✅ |
| Veredito: critical→dangerous, high→caution, **medium/low sozinhos→safe** | `skills_guard.py:1064` (`_determine_verdict`) | ✅ |
| Install do dashboard roda `skills install --yes` SEM `--force` → `policy: "block"` do scan é previsão verdadeira | `web_server.py:11142`, `skills_hub.py:655` | ✅ |
| `_heal_dead_cwd` sonda o disco e REESCREVE `session["cwd"]`; pasta Windows em host Linux só sobrevive porque `dirname` POSIX quebra na 1ª volta — **sorte, não projeto; não "melhorar" esse loop** | `server.py:1428-1465` | ✅ |
| `COPY` do Docker MESCLA `web_dist` (não substitui) — sem `rm -rf` antes, bundles acumulam (82 no fly193) e enganam grep | `platform/wayne-fly/Dockerfile.ui` e `.projects` (já corrigidos) | ✅ |
| Gateway aparece no `ps` como `wayne gateway run` (NÃO "tui_gateway"; grafia legada da imagem actual — com o CLI rebrandado passa a `work4you gateway run`); traceback `gateway-default.tmp` no boot é benigno | diagnóstico fly189 | ✅ |

## Segurança / multi-tenant — o que foi verificado (16/07)

| Achado | Onde | Verificado |
|---|---|---|
| Auth do dashboard = **UM `_SESSION_TOKEN` por processo**, comparado com `hmac.compare_digest`. Autentica o DASHBOARD, não o USUÁRIO — não há auth por-usuário dentro de um tenant | `web_server.py:314` (`_has_valid_session_token`), `dashboard_auth.py` | ✅ |
| A camada de auth **NÃO conhece tenant** — só `_connector_tenant_id` (conectores). Tenant não é parâmetro de request | `web_server.py:2062` | ✅ |
| Isolamento entre tenants = **1 app Fly por tenant** (`wayne-w4y` = "tenant W4Y"; nome legado, migração de infra pendente), processo próprio, token próprio, WORK4YOU_HOME próprio → **isolamento FÍSICO** | `platform/wayne-fly/fly.wayne-w4y.toml:1` | ✅ |
| **Recalibração:** a alegação de "cross-tenant crítico / falsificação de sessão" pressupõe multi-tenant de PROCESSO COMPARTILHADO (um app, N tenants por param). Nossa topologia é 1 app por tenant → a versão "crítica" cross-tenant **não se sustenta hoje**. O limite REAL é: sem auth por-usuário DENTRO de um tenant | análise 16/07 | ⚠️ parcial |
| **NÃO verificado:** posse de sessão INTRA-tenant (um usuário do mesmo tenant acessa sessão de outro?); modo gated/OAuth (`auth_required=True`) na prática. Precisa de UMA revisão de segurança com alvo — não repo-wide | — | ❌ |


## Knowledge/RAG — auditoria 19/07 (agente Explore, file:line verificados)

- **NÃO existe primitivo de "base de conhecimento" de documentos** (upload→chunk→embed→retrieve
  estilo Dify/Stack AI). O CORE (agent/, tools/, work4you_cli/) tem ZERO embeddings neurais e ZERO
  vector DB — todo vetor/semântica vive nos plugins de memória opt-in.
- **Memória curada nativa** (MEMORY.md+USER.md por profile): snapshot CONGELADO injetado no system
  prompt (budget em chars ~800 tokens; `tools/memory_tool.py:55-1129`, `agent/system_prompt.py:428`)
  — é context-injection, SEM retrieval em query-time. UI: memoryTab no ConfigUser (exposta).
- **Plugins MemoryProvider (native-hidden, só ?full=1):** `holographic` = FTS5+Jaccard+HRR sobre
  memory_store.db POR PROFILE, zero deps externas (`plugins/memory/holographic/retrieval.py:22-336`);
  `mem0` = embeddings REAIS + Qdrant/cloud (`plugins/memory/mem0/_backend.py:9-140`). LIMITE DURO:
  só UM provider externo ativo por vez (`agent/memory_manager.py:353-441`).
- **Busca de histórico**: FTS5 sobre state.db — tool `session_search` (`tools/session_search_tool.py:619`)
  + REST `GET /api/sessions/search` (`web_server.py:4630-4790`). Keyword, sem embeddings.
- Uploads (`/api/files/upload*`, web_server.py:1749+) NÃO são indexados como conhecimento; context
  files (WAYNE.md/AGENTS.md) são cwd-bound. Caminho de reuso p/ KB por agente = holographic (local+
  nuvem sem custo) ou mem0 (embeddings de verdade, infra extra); ingestão/chunking/citação = construir.

## Canais nativos — auditoria 19/07 (agente Explore; baseline conferida vs hermes-upstream)

- **~30 adapters nativos, TODOS por profile e TODOS aparecem como card em /channels** (catálogo
  dinâmico enum+plugin registry: `gateway/config.py:136-167`, `web_server.py:6408-6446`; per-profile
  `:7089-7107`). Redes: Telegram, Discord, Slack, WhatsApp (bridge + Cloud/Meta), Signal, iMessage
  (BlueBubbles+Photon), Email IMAP/SMTP, SMS Twilio, Teams (+MS Graph), Matrix, Mattermost, IRC,
  LINE, ntfy, SimpleX, Google Chat, DingTalk, Feishu, WeCom (×2), WeChat pessoal, QQ, Yuanbao,
  Home Assistant, Raft, webhook genérico, api_server. Quase todos BIDIRECIONAIS (inbound → turno).
- **API pública OpenAI-compatível nativa**: platform `api_server` (`gateway/platforms/api_server.py`)
  — /v1/chat/completions, /v1/responses, /v1/runs+SSE, sessions CRUD. MAS: UMA `API_SERVER_KEY`
  compartilhada por instalação (sem chave por agente/app) e loopback por default (`API_SERVER_HOST`).
- **Webhook genérico inbound → prompt** por profile (`gateway/platforms/webhook.py:107`; rota
  `/p/<profile>/`; GitHub/GitLab/Stripe; página /webhooks é ?full=1). Composio triggers→kanban =
  NOSSO (web_server.py:2539-2783). `send_message` alcança 18+ plataformas (`tools/send_message_tool.py:628-980`).
- **AUSENTE**: widget de chat embarcável pra site de terceiro; chaves de API por agente/app.
- **GOTCHA 24/7**: canais de polling/socket (Telegram, Slack Socket, Discord, IMAP) exigem gateway
  vivo — colide com min_machines_running=0 (ver seção billing); canais webhook (LINE, Teams,
  WhatsApp Cloud, WeCom callback, Composio events) ACORDAM a máquina via HTTP inbound.
- Polish barato: `whatsapp_cloud` e `msgraph_webhook` sem entrada em `_PLATFORM_OVERRIDES` (rótulo cru).


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


## Nome de tool MCP + espectador de subagente — verificados 16/07 (D2.1)

> Chamava-se "contratos do dock reativo". O dock era da SPA antiga; **estes dois
> contratos são do motor e continuam a valer** — o segundo é a forma correcta de
> assistir a um subagente sem roubar o transporte da sessão-mãe.

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


## ⚠️ GOTCHA update do motor: BOM no `latest.json` parte o `JSON.parse` (incidente 29/07)

O canal do motor (`https://storage.googleapis.com/w4y-engine-dist/latest.json`) esteve a servir um
manifesto que começava com um BOM UTF-8 (`EF BB BF`). O leitor da app faz
`JSON.parse(Buffer.concat(chunks).toString("utf8"))` em `w4y-wayne-resolve.cjs`, e `JSON.parse`
rebenta em `U+FEFF` — `Unexpected token '\ufeff'`. Resultado: **toda a verificação de atualização do
motor falhava**, com um ficheiro que a olho nu é JSON perfeitamente válido. Reproduzido com o código
exacto da app antes de corrigir; `charCodeAt(0)` dava `65279`.

Causa de raiz: não há script de publicação para este canal (só existe `publish-ui.ps1`, para o canal
`web_dist`), por isso o `latest.json` é escrito à mão — e o `Set-Content`/`Out-File` do PowerShell 5.1
mete BOM por omissão. Escrever sempre com `New-Object System.Text.UTF8Encoding $false`, como o
`publish-ui.ps1` já faz e documenta (*"Electron JSON.parse is picky about BOM"*).

Dois lados corrigidos: o manifesto publicado passou a ser BOM-less, e o leitor passa a tolerar um BOM
à cabeça (`parseManifestJson`, contratos em `electron/engine-manifest-parse.test.cjs`) — um BOM no
meio do corpo continua a falhar, para um corpo corrompido nunca ser reinterpretado como válido.

**Armadilha de cache, na mesma passada:** o objecto antigo tinha sido publicado com
`Cache-Control: public, max-age=3600`, por isso a borda continuou a servir a versão com BOM durante o
resto do TTL mesmo depois de a origem estar corrigida (`gsutil stat` mostrava o objecto novo;
`Invoke-WebRequest` devolvia `Age: 1315` e o `Content-Length` antigo). Manifestos vão com
`Cache-Control: no-store`; artefactos com `max-age=3600`. É a mesma falha que o cabeçalho do
`publish-ui.ps1` descreve.

## Toggle de conectores por sessão — o gate é nosso, não é nativo (19/07)

> O **motor** desta secção continua válido. As referências de **UI**
> (`useChatSession`, `NativeChatPage`, `ConnectorsPicker.tsx`) são da SPA antiga:
> o `apps/desktop` tem de re-implementar a persistência e o reenvio no resume,
> porque o registo do motor vive em memória e morre com o processo.

O composer ganhou o controle "Conectores" com switch on/off por app,
escopo = A CONVERSA. Antes de construir foi verificado: **NÃO existe** liga/desliga nativo por
toolkit (a API só tem catalog/status/connect/attach/DELETE account) — então o gate foi construído:
- **Registro por sessão**: `tools/approval.py` `_session_disabled_connectors` (ao lado do
  `_session_yolo` DE PROPÓSITO — herda o ciclo de vida: `clear_session` limpa, e o re-anchor de
  session_key em `tui_gateway/server.py` (~:3060, único helper de rename) transplanta o set).
- **Set**: RPC `config.set {key:"connectors.disabled", value:[slugs], scope:"session"}` (branch
  ao lado do yolo, server.py ~:10420). Aceita lista ou CSV; sem sessão → erro 4002. UI:
  `useChatSession.setSessionConnectorsDisabled`; NativeChatPage persiste em localStorage
  `wayne:connectors-off:<storedSessionId>` e REENVIA em todo sessionReady (o registro do motor é
  em memória — morre com o processo; o reenvio re-arma no resume).
- **Enforcement**: `tools/mcp_tool.py` `_blocked_connector_for_call` no TOPO do `_handler`
  (porta única de toda chamada MCP, server composio apenas). Cobre os DOIS formatos: nome direto
  `GMAIL_*` (nuvem) e ferramentas-mestre com toolkit nos ARGS (chaves allowlist `tool_slug/
  toolkits/...` em qualquer nível — texto livre NUNCA casa, sem falso positivo em query). Erro
  claro pro modelo ("switched OFF for this session... do not retry"). Testado 9 casos unit.
- **Entrega**: Dockerfile.projects agora COPIA `tools/approval.py` + `tools/mcp_tool.py`.
- **GOTCHA install.ps1**: `WORK4YOU_SOURCE_ZIP_URL` (nome canónico; `WAYNE_SOURCE_ZIP_URL` ainda
  é aceite como fallback) NÃO aceita `file:///` ("scheme not supported") —
  refresh in-place usa a URL https do bucket. Após refresh manual, atualizar TAMBÉM o marcador
  `%LOCALAPPDATA%\wayne\engine-version.json` (senão o chip oferece o mesmo update de novo;
  nome verificado em `apps/desktop/electron/w4y-wayne-resolve.cjs` — o doc dizia
  `engine-source.json`, ficheiro que não existe em código nenhum).
  Nota: este é o root de CÓDIGO, que fica no caminho legado por agora — a migração de home
  para `%LOCALAPPDATA%\work4you` move só os DADOS.
- UI: `components/chat/ConnectorsPicker.tsx` (some quando 0 contas ACTIVE — tela não promete;
  logos via catalog + LogoTile). i18n `connectorsLabel/connectorsSession` ×16.

## Factos duráveis salvos do pivô do desktop (17–18/07)

A narrativa completa do pivô foi para
[`arquivo/BACKEND-MAP-legado-web-shell.md`](./arquivo/BACKEND-MAP-legado-web-shell.md).
O que sobrevive são estes factos, que continuam verdadeiros e continuam a custar
caro se forem reaprendidos.

**Conectores locais exigem três elos, não um.** Ter a chave do Composio não
chega. (1) A chave no `.env` — o motor relê o `.env` **por request**
(`load_wayne_dotenv override=True`), portanto chave nova vale sem reiniciar.
(2) A entrada `mcp_servers.composio` no `config.yaml` — a página de plugins usa
REST/env, mas as **ferramentas** vêm do MCP; um motor local nasce sem esta
entrada. (3) Uma sessão de tool-router **própria**: as sessões `trs_…` são
stateful e mono-consumidor, portanto copiar a URL da nuvem dá *"Session
terminated"*. Cada motor tem de mintar a sua com
`POST /api/v3.1/tool_router/session {user_id:"global"}`.

**Duas paredes do Composio, verificadas ao vivo por sondas de dentro do
provisioner.** O endpoint de chave *adicional* não existe sob autenticação por
org-key (404 nas quatro variantes de path; o do dashboard exige sessão de
navegador). E `regenerate_api_key` devolve **403 "API key regeneration is not
enabled for this organization"** — a rotação coordenada está morta. Consequência
de desenho: o caminho durável é *tenant-as-broker*, um endpoint no `web_server`
do tenant atrás do auth do dashboard, com os cookies do login.
⚠️ `regenerate` **invalida todas as chaves do projeto**, incluindo a do Fly.

**Nunca reutilizar tag de imagem.** Incidente real confirmado no Fly/GCP: o
deploy de 11/07 reutilizou a tag `p3` por cima da imagem de billing de 07/07. O
provisioner em produção ficou **sem `/ensure-key`**, o Cloud Scheduler continuou
a chamá-lo, e a rota devolvia 200 com `falhas[]` — **404 silencioso durante
dias**. A injeção da chave capada na activação Stripe falhava do mesmo modo, e
o tenant pago ficava sem tecto. A imagem antiga do `p3` foi sobrescrita e já não
existe: **rollback só por digest**. Sempre tag nova.

**A mesma classe de erro em forma de ficheiro:** subir a `version` **antes** do
electron-builder. Build sem bump sobrescreve o `.exe` anterior com conteúdo novo.

**O proxy de modelo existe, está parqueado, e o flip foi revertido no próprio
dia.** App Fly `w4y-model-proxy` (LiteLLM, gru, **2 GB — faz OOM em 512 MB e em
1 GB**, ~850 MB RSS no boot), a dormir com `suspend`/`min=0`, custo ~zero. Foi
ligado em todas as superfícies a 18/07 com de-risking correcto e **revertido
horas depois**: o salto extra somou latência sensível ao TTFB e o primeiro uso
real foi "pensou um tempão". **Lição:** o hop do LiteLLM não é "dezenas de ms"
na prática. Antes de re-ligar, medir TTFB directo × proxy com um modelo **pago**
(não o gratuito, que já era lento) e considerar região do proxy = região do
tenant. Gotcha do flip: com `base_url` fora da openrouter.ai, o runtime prefere
`OPENAI_API_KEY` antes de `OPENROUTER_API_KEY` (`cli.py:3841`).

**Gotchas de empacotamento do motor.** `work4you update` **não funciona** em
instalação por ZIP (update = re-correr o estágio `repository`), e
`-IncludeDesktop` é incompatível com ZIP. `WORK4YOU_SOURCE_ZIP_URL` (legado
`WAYNE_SOURCE_ZIP_URL` ainda aceite) **não aceita
`file:///`** ("scheme not supported") — o refresh in-place usa a URL https do
bucket. Depois de um refresh manual, actualizar também o marcador
`engine-source.json`, senão o chip volta a oferecer o mesmo update.
`build-engine-zip.ps1` no PowerShell 5 gera nomes de entrada com **contrabarras**
e parte o unzip POSIX — sempre pwsh 7.

**Refresh in-place mescla, não substitui.** O `robocopy` sem `/MIR` deixa órfãos:
bundles antigos acumulam-se em `web_dist` na máquina do utilizador, tal como o
`COPY` do Docker os acumulava na imagem. Inertes, mas enganam qualquer grep.

## ⚠️ 24/7 agendado — wake PARTIAL (atualizado 22/07)

`platform/wayne-fly/fly.wayne-w4y.toml:30-32`: `auto_stop_machines = "suspend"` +
`min_machines_running = 0`. A máquina **dorme quando ociosa**; o scheduler de rotinas roda
**IN-PROCESS** → congela junto.

**Decisão CEO (22/07):** default **permanece** suspend/min=0. `min=1` (~US$11/mês) só no
**tier premium** de canal sempre-conectado. 24/7 do plano pago = **agendado** via wake,
não máquina sempre ligada. Provisioner já espelha: premium → `min=1` / autostop off
(`platform/provisioner/server.js`).

**Wake verificado (GCP, 22/07):** job `wayne-cron-wake` **ENABLED**, cron `*/15`,
`GET https://wayne-w4y.fly.dev/api/auth/providers` → acorda Fly → ticker catch-up.
**LIVE**, mas **não pontual** (até ~15 min late). IaC: `platform/infra/wake-cron.ps1`
(idempotente create-or-update; **não** re-aplica no deploy — só DR/recreate).

→ Produto “24/7 agendado barato” = **PARTIAL**, não pronto. Ver [`PLATAFORMA.md`](./PLATAFORMA.md).

## Backlog canônico de paridade do chat
Ver memória `desktop-parity-checklist` (upstream em `C:/DEV/hermes-upstream`).

## Pendências operacionais
- fly195 (item 1) — deploy.
- #102 — AgentWorkflowPage ainda escreve "Default" no cabeçalho (alcançável só por URL).
- #103 — bundles acumulados: **corrigido** nos 2 Dockerfiles, provado no fly194 (1 bundle).
- **Wake cron** — `platform/infra/wake-cron.ps1` captura o job vivo; apertar intervalo
  (hoje `*/15`) se quiser pontualidade = PARTIAL → mais perto de “na hora”.

## Residuais da migração de marca Wayne→Work4You (01/08/2026)

A onda de migração está completa do lado do utilizador. O que resta com o nome
antigo fica **de propósito**, por uma destas razões:

**Interface interna de env.** O código lê `WAYNE_*` (≈380 variáveis, `WAYNE_HOME`
sozinha em ~3.000 sítios). A interface pública é `WORK4YOU_*`:
`work4you_constants.apply_work4you_env_aliases()` espelha `WORK4YOU_*` → `WAYNE_*`
no arranque e depois do `.env`, com precedência para `WAYNE_*` quando ambos
existem — spawners internos injectam `WAYNE_HOME` por perfil e a grafia nova não
pode quebrar o isolamento. ⚠️ A ponte vive **dentro do processo Python**: shell
scripts e hooks de boot (ex. `docker/stage2-hook.sh`) precisam da cadeia escrita à
mão.

**Compatibilidade com o que já está instalado.** Alias `wayne` (deprecado, avisa
só em TTY — a maquinaria de update/serviços ainda o executa); `wayne-agent` e
`wayne-acp` (editores ACP configurados); stubs `wayne_cli`/`wayne_*` com troca em
`sys.modules`; **`wayne_cli/main.py` físico** — cascas desktop ≤1.0.45 sondam esse
caminho literal antes de arrancar o motor; symlink `/opt/wayne` na imagem;
launcher `wayne` dentro do contentor; `_LEGACY_SERVICE_NAMES` e o matcher de
unidades systemd; matchers de processo `wayne.exe`; headers `X-Wayne-*`
(dual-accept); `/wayne` no Slack; `hermes://` a par de `work4you://`.

**Contratos persistidos que um rename órfã.** `metadata.wayne` (frontmatter de
todas as SKILL.md, incluindo cópias já instaladas nas homes dos utilizadores);
ids instaláveis de skills e plugins; `_GATEWAY_KIND="wayne-gateway"` nos registos
de PID; toolset `wayne-cli` em `config.yaml` existentes; `DEFAULT_PROJECT_NAME`
do Photon (chave find-or-create do serviço).

**Identificadores externos registados** — mudar parte a integração:
`DEFAULT_NOUS_CLIENT_ID='wayne-cli'` (OAuth do Nous Portal), `X-Title: Wayne Agent`
enviado ao OpenRouter, fórmula Homebrew `wayne-agent`.

**Família de modelos da Nous.** `nousresearch/wayne-3-*` e `wayne-4-*` são modelos
de terceiros, não a nossa marca. ⚠️ Cuidado ao varrer: `optional-skills/security/godmode/SKILL.md`
mistura as duas leituras no mesmo ficheiro.

**Atribuição upstream (MIT).** `FORK-NOTES.md`, `LICENSE-UPSTREAM`, `CREDITS.md`,
autores Nous/Teknium, URLs de docs `hermes-agent.nousresearch.com` ainda citadas
no `--help`.

**Infra por migrar em janela própria** (fora do âmbito desta onda): apps Fly
`wayne-<slug>` e `wayne-w4y` (renomear = reprovisionar tenants; `APP_RE` em
`login/enter/route.ts` só aceita `^wayne-`), colunas `wayne_run_id`/`wayne_session_id`,
cookies `wayne_session_*`, workspace npm `@wayne/shared`, e o artefacto
`.wayne-engine-version` (o `install.ps1` lê o nome fixo).

### ⚠️ INCIDENTE 02/08 — o nome da pasta DENTRO do zip do motor é contrato

`work4you-engine-20260802.zip` foi publicado com o wrapper renomeado para
`work4you-agent/`. As cascas ≤1.0.45 promovem o wrapper extraído por uma
**allowlist de nomes** (`wayne-agent`, `wayne-agent-main`). A promoção falhou, o
updater deixou o **junction do motor pendurado** (`…\wayne\wayne-agent` →
`…\wayne\e\<id>` inexistente) e a app deixou de arrancar: *"Work4You motor
não encontrado"*. Sem motor, sem recuperação pela própria app.

O que eu tinha assumido e estava errado: o stub físico `wayne_cli/main.py`
protege a sonda de **conteúdo** (`isWayneSourceRoot`), mas a promoção acontece
**antes**, e é por **nome de pasta**. Publicar a casca 1.0.46 primeiro também não
chegava — quem ainda estivesse na 1.0.45 apanhava o motor novo primeiro.

Correcção: `build-engine-zip.ps1` volta a emitir o wrapper `wayne-agent/` com o
conteúdo já rebrandizado (`work4you-engine-20260802b.zip`). O rename do wrapper
só pode acontecer quando não houver casca antiga no terreno.

Recuperação de uma máquina apanhada: recriar o alvo do junction
(`%LOCALAPPDATA%\wayne\e\<id>`), extrair lá o conteúdo do zip, correr
`uv sync` no checkout e alinhar `engine-version.json`.

### Decisões fechadas (02/08)

1. **Perfis sobrevivem a `docker restart`** — corrigido de raiz. O
   `container_boot` deixou de exigir `SOUL.md` (que o fork nunca cria) e passou
   a usar a **mesma definição de perfil que o resto do CLI**: a forma do id
   (`_PROFILE_ID_RE`). Dirs de backup (`coder.bak`, `Coder`, `.tmp`) continuam
   filtrados. Os dois testes em `tests/docker/test_container_restart.py` passam.
2. **`LICENSE`** — o fork passa a ter o seu (MIT, com o copyright da Nous
   preservado); `LICENSE-UPSTREAM` fica intacto como cópia do original. Isto
   também reparava a metadata: o `pyproject` já declarava
   `license-files = ["LICENSE"]` para um ficheiro que não existia.
3. **Homebrew — residual assumido.** `format_managed_message()` não cita a
   fórmula `wayne-agent` porque é um **id publicado upstream**: mandar o
   utilizador correr `brew upgrade wayne-agent` instalaria o pacote da Nous por
   cima do Work4You. Enquanto não existir fórmula própria, a mensagem manda usar
   a fórmula que ele tiver. O ramo NixOS mantém identificadores porque são
   *dele* (`services.wayne-agent.settings` é config local, não um pacote remoto).

