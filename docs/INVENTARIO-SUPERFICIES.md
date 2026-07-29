# Inventário de superfícies — motor, ACP, gateway, desktop

Levantamento só-leitura de **o que existe** e **o que está ligado**, superfície a superfície.

**Data:** 2026-07-29 · **Árvore:** `wayne-agent/` (pós-porte do desktop Hermes para `apps/desktop/`)

**Objetivo:** responder, por capacidade, se o buraco é *UI que falta*, *método que ninguém chama*, ou *coisa feita duas vezes* — para parar de reconstruir o que já existe.

**O que este doc não é:** não é plano nem recomendação. É estado. O eixo estratégico (nativo × construído, desperdício em dias) está em [`NATIVO-VS-CONSTRUIDO.md`](NATIVO-VS-CONSTRUIDO.md), auditoria de 22/07.

**Método:** três varreduras paralelas sobre `tools/`, `toolsets.py`, `wayne_cli/`, `acp_adapter/`, `tui_gateway/`, `wayne_cli/web_server.py`, `apps/desktop/{src,electron}`. "CHAMADO" = referência literal encontrada no cliente. Métodos montados dinamicamente escapariam à deteção.

---

## 1. Bugs confirmados

Verificados diretamente, não herdados de relatório.

### 1.1 Botão "Update Work4You" do Command Center está partido

| | |
|---|---|
| **Sintoma** | Clicar em Command Center → Sistema → "Update Work4You" falha sempre |
| **Chamada** | `apps/desktop/src/app/command-center/index.tsx:264` → `updateHermes()` |
| **Cliente** | `apps/desktop/src/hermes.ts:1147` → `POST /api/hermes/update` |
| **Servidor** | Define `POST /api/wayne/update` (`wayne_cli/web_server.py:4357`). `/api/hermes/*` não existe |
| **Gating** | Nenhum. Botão sempre visível e sempre clicável (`index.tsx:437-439`) |

**Causa:** fallout de rename. O upstream Hermes servia exatamente `POST /api/hermes/update` (registado em `NATIVO-VS-CONSTRUIDO.md` linha 35, `web_server.py:3306` no upstream). O fork renomeou a rota do servidor para `wayne`; o cliente desktop ficou para trás.

**Nota importante:** renomear a rota do cliente **não** conserta. Neste fork o `wayne update` está desativado de propósito (`wayne_cli/subcommands/update.py`) para não puxar o Nous. O self-update do motor por REST está morto por decisão. O caminho vivo é o updater Electron (`w4y-app-updater.cjs` + `w4y-wayne-resolve.cjs`).

O mesmo par de funções é usado por `store/updates.ts:333` (`checkBackendUpdates`) e `:562` (`applyBackendUpdate`). Essas só correm em **modo remoto** (`isRemoteMode()` guard em `:326`), portanto não afetam o utilizador local — mas em remoto o check falha sempre para `check-failed`.

### 1.2 Histórico de conectores nunca foi ligado

| | |
|---|---|
| **Função** | `getConnectorEventRuns()` — `apps/desktop/src/lib/connectors-api.ts:210` |
| **Rota** | `GET /api/connectors/events/recent` — **não existe** em nenhum ficheiro da árvore |
| **Callers** | **Nenhum.** Função exportada, zero utilizações |
| **Falha** | `try/catch` devolve `[]` em silêncio (`:217-219`) |

O comentário no código é honesto — *"Returns [] when the plugin/API is unreachable — Run History still shows cron runs alone."* O resultado é que o Run History mostra só cron, permanentemente, sem qualquer sinal ao utilizador.

Isto fecha o ciclo da primeira tarefa desta frente de trabalho: os *merges de eventos falsos* foram removidos (correto), mas a fonte real nunca foi construída.

---

## 2. Retrato consolidado por causa

| Causa | Escala | Exemplos confirmados |
|---|---|---|
| **Motor tem, UI não expõe** | Grande | `display.tool_progress`, `display.background_process_notifications`, `smart_model_routing`, `display.skin`, maior parte de `curator.*` e `logging.*`; RPC `session.compress`/`undo`/`branch`/`history`; `delegation.pause`, `subagent.interrupt`; billing RPC completo |
| **Feito duas vezes** | Médio | Git (Electron IPC **e** REST); terminal (PTY Electron **e** `/api/pty`); modelos (3 UIs); subagentes (2 conchas); aprovações (2 caminhos de escrita); "o que mudou" no git (2 sondas) |
| **Existe mas escondido** | Médio | Profiles, Starmap, Agent Studio, Command Center e Settings fora da navegação primária; `?tab=providers`, `?tab=keys`, `?tab=gateway`, `?tab=config:advanced` só por deep-link |
| **Declarado e morto** | Pequeno | §1.1 e §1.2; eventos `skin.changed` e `voice.*` emitidos sem ouvinte; blocos de áudio tipados no ACP sem conversão |

Ordem de grandeza: dos ~120 métodos JSON-RPC do gateway, o desktop chama pouco mais de metade. Boa parte do resto serve CLI e TUI legitimamente — mas explica a sensação recorrente de *"isto já existe e não aparece"*.

---

## 3. Motor — capacidades

### 3.1 Ferramentas de modelo

~70 ferramentas registadas estaticamente via `registry.register()`, mais `mcp_*` dinâmicas.

| Grupo | Ferramentas | Ficheiro | Gate |
|---|---|---|---|
| Web | `web_search`, `web_extract` | `tools/web_tools.py` | `check_web_api_key` |
| | `x_search` | `tools/x_search_tool.py` | `XAI_API_KEY` |
| Terminal | `terminal`, `process` | `tools/terminal_tool.py`, `process_registry.py` | `check_terminal_requirements` |
| | `read_terminal`, `close_terminal` | `tools/{read,close}_terminal_tool.py` | `WAYNE_DESKTOP` |
| Ficheiros | `read_file`, `write_file`, `patch`, `search_files` | `tools/file_tools.py` | `_check_file_reqs` |
| Visão / média | `vision_analyze`, `video_analyze` | `tools/vision_tools.py` | `check_vision_requirements` |
| | `image_generate`, `video_generate` | `tools/{image,video}_generation_tool.py` | provider disponível |
| | `xai_video_edit`, `xai_video_extend` | `tools/xai_video_tools.py` | xAI |
| Skills | `skills_list`, `skill_view`, `skill_manage` | `tools/skills_tool.py`, `skill_manager_tool.py` | sempre |
| Browser | `browser_navigate/snapshot/click/type/scroll/back/press/get_images/vision/console` | `tools/browser_tool.py` | `check_browser_requirements` |
| | `browser_cdp`, `browser_dialog` | `tools/browser_cdp_tool.py`, `browser_dialog_tool.py` | URL CDP |
| Agente | `todo`, `memory`, `clarify`, `session_search` | `tools/{todo,memory,clarify,session_search}_tool.py` | sempre / state.db |
| | `delegate_task` | `tools/delegate_tool.py` | sempre |
| | `execute_code` | `tools/code_execution_tool.py` | `check_sandbox_requirements` |
| | `cronjob` | `tools/cronjob_tools.py` | interativo / gateway |
| | `computer_use` | `tools/computer_use_tool.py` | SO + cua-driver |
| | `text_to_speech` | `tools/tts_tool.py` | provider TTS |
| Home Assistant | `ha_list_entities`, `ha_get_state`, `ha_list_services`, `ha_call_service` | `tools/homeassistant_tool.py` | `HASS_TOKEN` |
| Kanban | `kanban_show/complete/block/heartbeat/comment/create/link` | `tools/kanban_tools.py` | `WAYNE_KANBAN_TASK` |
| | `kanban_list`, `kanban_unblock` | idem | só orquestrador |
| Plataformas | `discord`, `discord_admin` | `tools/discord_tool.py` | `DISCORD_BOT_TOKEN` |
| | `feishu_doc_read`, `feishu_drive_*` (4) | `tools/feishu_*.py` | `lark_oapi` |
| | `yb_*` (5) | `tools/yuanbao_tools.py` | plataforma yuanbao |
| Desktop | `project_list`, `project_create`, `project_switch` | `tools/project_tools.py` | toolset |
| Plugin | `spotify_*` (7) | `plugins/spotify/` | `_check_spotify_available` |
| Dinâmico | `mcp_*` | `tools/mcp_tool.py` | por servidor |

**Ambiguidade:** `send_message` aparece nos mapas de polish do ACP (`acp_adapter/tools.py`) mas não é ferramenta registada no core — mensagens de saída ficam fora do loop do agente.

### 3.2 Toolsets

Categorias: `web`, `search`, `x_search`, `vision`, `video`, `image_gen`, `video_gen`, `computer_use`, `terminal`, `skills`, `browser`, `browser-cdp`, `cronjob`, `file`, `tts`, `todo`, `memory`, `context_engine`, `session_search`, `project`, `clarify`, `code_execution`, `delegation`, `homeassistant`, `kanban`, `discord`, `discord_admin`, `yuanbao`, `feishu_doc`, `feishu_drive`, `spotify`.

Cenário: `debugging`, `safe`, e `coding` (postura, selecionada por `agent/coding_context.py`).

Plataforma: `wayne-cli`, `wayne-cron`, `wayne-gateway`, `wayne-api-server`, `wayne-acp`, `wayne-webhook` (restrito a `_WAYNE_WEBHOOK_SAFE_TOOLS`), mais um por canal de mensagens (telegram, discord, whatsapp, slack, signal, bluebubbles, homeassistant, email, mattermost, matrix, dingtalk, feishu, weixin, qqbot, wecom, wecom-callback, yuanbao, sms).

### 3.3 Subcomandos CLI

`chat` (default), `acp`, `auth`, `backup`, `bundles`, `checkpoints`, `claw`, `completion`, `computer-use`, `config`, `console`, `cron`, `curator`, `dashboard`/`serve`/`portal`, `debug`, `doctor`, `dump`, `fallback`, `gateway`, `gui`/`desktop`, `hooks`, `import`, `insights`, `journey`/`memory-graph`/`learning`, `kanban`, `login`/`logout`, `logs`, `lsp`, `mcp`, `memory`, `migrate`, `moa`, `model`, `pairing`, `pets`, `plugins`, `postinstall`, `profile`, `project`, `prompt-size`, `proxy`, `secrets`, `security`, `send`, `sessions`, `setup`, `skills`, `slack`, `status`, `tools`, `uninstall`, `update` (desativado neste fork), `version`, `webhook`, `whatsapp`/`whatsapp-cloud`.

### 3.4 Comandos slash

`COMMAND_REGISTRY` em `wayne_cli/commands.py` — cerca de 90 comandos.

| Escopo | Comandos |
|---|---|
| Só CLI/TUI | `/clear`, `/redraw`, `/history`, `/save`, `/prompt`, `/handoff`, `/snapshot`, `/config`, `/statusbar`, `/timestamps`, `/skin`, `/indicator`, `/busy`, `/tools`, `/toolsets`, `/cron`, `/reload`, `/browser`, `/plugins`, `/billing`, `/platforms`, `/copy`, `/paste`, `/image`, `/quit`, `/journey`, `/pet`, `/hatch` |
| Só gateway | `/start`, `/topic`, `/approve`, `/deny`, `/sethome`, `/commands`, `/restart`, `/platform` |
| Gated por config | `/verbose` (`display.tool_progress_command`), `/skills` (`skills.write_approval`) |
| Ambos | `/new`, `/retry`, `/undo`, `/title`, `/branch`, `/compress`, `/rollback`, `/stop`, `/background`, `/agents`, `/queue`, `/steer`, `/goal`, `/moa`, `/subgoal`, `/status`, `/whoami`, `/profile`, `/resume`, `/sessions`, `/model`, `/codex-runtime`, `/personality`, `/footer`, `/yolo`, `/reasoning`, `/fast`, `/voice`, `/memory`, `/bundles`, `/learn`, `/suggestions`, `/blueprint`, `/curator`, `/kanban`, `/reload-mcp`, `/reload-skills`, `/help`, `/usage`, `/credits`, `/insights`, `/update`, `/version`, `/debug` |

### 3.5 Subsistemas

| Subsistema | Núcleo | CLI | Config |
|---|---|---|---|
| Cron / automações | `cron/jobs.py`, `cron/scheduler.py`, `tools/blueprints.py` | `wayne cron` | scheduler tick |
| Kanban | `tools/kanban_tools.py`, `plugins/kanban/` | `wayne kanban` | `kanban.*` |
| Curator | `agent/curator.py`, `agent/curator_backup.py` | `wayne curator` | `curator.*` |
| Memória (providers) | ABC `agent/memory_provider.py`, orquestrador `agent/memory_manager.py`, 8 providers em `plugins/memory/` | `wayne memory` | `memory.provider` |
| Cliente MCP | `tools/mcp_tool.py` | `wayne mcp` | servidores + OAuth |
| Skills | `skills/` (~77) + `optional-skills/` (~97) | `wayne skills` | enable + `platforms:` |
| Delegação | `tools/delegate_tool.py`, `tools/async_delegation.py` | — | `delegation.*` |
| Ambientes de terminal | `tools/environments/{local,local_desktop,docker,ssh,singularity,modal,managed_modal,daytona}.py` | — | `terminal.backend` |
| Registos de providers | `agent/{image_gen,video_gen,browser,web_search,tts,transcription}_registry.py` | — | credenciais |
| Providers de modelo | `plugins/model-providers/` | `wayne model`, `wayne login` | auth |

---

## 4. ACP — cobertura do adaptador

Sessões ACP usam o toolset **`wayne-acp`** (`acp_adapter/session.py:630`): focado em código, **sem** clarify, TTS, image_gen, cron, HA, kanban, computer_use, project.

| Funcionalidade | Estado | Onde |
|---|---|---|
| `initialize` (handshake) | Completo | `server.py:865-897` |
| `authenticate` | Completo | `server.py:899-919`, `auth.py:41-79` |
| `session/new` | Completo | `server.py:1113-1131` |
| `session/load` | Completo | `server.py:1133-1178` |
| `session/resume` | Completo | `server.py:1180-1213` |
| `session/fork` | Completo | `server.py:1229-1247` |
| `session/list` (paginado) | Completo | `server.py:1249-1292` |
| `cancel` | Completo | `server.py:1215-1227` |
| Modos (`default`/`accept_edits`/`dont_ask`) | Completo | `server.py:534-565`, `2029-2043` |
| Seleção de modelo | Completo | `server.py:583-643`, `1995-2027` |
| Streaming de mensagem / pensamento / utilizador | Completo | `events.py:266-279`, `189-202` |
| Blocos de imagem e de recurso | Completo | `server.py:216-351`, `418-436` |
| Ciclo de vida de ferramenta | Completo | `events.py:114-259` |
| Plano / todo | Completo | `events.py:39-84` |
| Uso de tokens + medidor de contexto | Completo | `server.py:1665-1678`, `665-696` |
| Pedidos de permissão | Completo | `permissions.py:107+`, ligado em `server.py:~1488` |
| Aprovação de edições / diff | Completo | `edit_approval.py`, `server.py:1398-1542` |
| Servidores MCP vindos do cliente | Completo | `server.py:792-861` |
| Fila de prompts / steer | Completo | `server.py:1369+`, `1962-1979` |
| `set_config_option` | **Parcial** | `server.py:2045-2065` — aceita qualquer id para um dict; anuncia `config_options=[]` |
| Mapeamento de tipo de ferramenta | **Parcial** | `tools.py:21-56` — subconjunto; desconhecido cai em `"other"` |
| Localizações de ferramenta | **Parcial** | `tools.py:1282-1291` — só `path` |
| `available_commands` | **Parcial** | `server.py:453-505` — **9 comandos** dos ~90 do registry |
| Blocos de áudio | **Declarado, sem implementação** | Tipado em `server.py:368,403,1301`; sem ramo de conversão |
| Filesystem nativo ACP | **Ausente** | Sem capacidade anunciada; ficheiros só por ferramentas de modelo |
| Terminal nativo ACP | **Ausente** | Sem capacidade anunciada; shell só por ferramenta `terminal` |
| Custo / faturação | **Ausente** | Só tokens e contexto |

### 4.1 O que o motor tem e o ACP não representa

Cron/automações/blueprints, kanban, curator, gateway de mensagens e conectores, Home Assistant, computer use, projetos de desktop, `read_terminal`/`close_terminal`, TTS, geração de imagem e vídeo, `x_search`, `clarify` (omitido de propósito — não há UI), o registry completo de slash, edição de config, git/review, filesystem e terminal nativos do protocolo, áudio multimodal, custo, setup de providers de memória, profiles, pets, journey, MoA, webhooks, pairing, backup/import, Spotify.

### 4.2 Correção de modelo mental

**O ACP não está no caminho do desktop Work4You.** O `acp_adapter/` só entra quando um editor externo (Zed, VS Code, JetBrains) é o cliente.

- **Aprovações no desktop** vêm do evento `approval.request` do gateway e respondem por `approval.respond` — código distinto de `acp_adapter/permissions.py`. Mesmo conceito, caminhos separados.
- **Git no desktop** é Electron IPC (`hermes:git:*`) em local, ou REST `/api/git/*` em remoto. O ACP não tem superfície git nenhuma.

Ligar o ACP não recupera nada do que está visível no desktop hoje. Dá o Work4You a correr *dentro* do editor de terceiros. É produto novo, não é reparação.

---

## 5. Transporte desktop ↔ motor

### 5.1 Como se ligam

| Facto | Evidência |
|---|---|
| Desktop lança `serve --host 127.0.0.1 --port 0` | `electron/backend-command.cjs:20-23`; spawn em `main.cjs:5486`, `5703-5750` |
| Fallback para `dashboard --no-open` | `backend-command.cjs:31-35` |
| `serve` e `dashboard` partilham handler → `web_server.start_server` | `wayne_cli/subcommands/dashboard.py:1-22`, `86-95` |
| REST `/api/*` | `wayne_cli/web_server.py` (FastAPI) via IPC `hermes:api` (`main.cjs:6697`) |
| JSON-RPC `WS /api/ws` | `web_server.py:16410` → `tui_gateway.ws.handle_ws` → `dispatch` |
| WS não usados pelo desktop | `/api/pty`, `/api/pub`, `/api/events`, `/api/console` |

O filho Electron **é** o servidor FastAPI. O `tui_gateway` não corre como processo separado para o desktop.

### 5.2 RPC chamados pelo desktop

`session.create`, `session.resume`, `session.cwd.set`, `session.title`, `session.close`, `session.interrupt`, `session.steer`, `session.usage`, `session.context_breakdown`, `prompt.submit`, `llm.oneshot`, `handoff.request`/`state`/`fail`, `image.attach`/`attach_bytes`/`detach`, `file.attach`, `preview.restart`, `clarify.respond`, `terminal.read.respond`, `sudo.respond`, `secret.respond`, `approval.respond`, `config.set`, `config.get`, `projects.list`/`create`/`update`/`add_folder`/`delete`/`set_active`/`record_repos`/`tree`/`project_sessions`, `setup.status`, `setup.runtime_check`, `process.list`/`kill`, `reload.mcp`, `reload.env`, `commands.catalog`, `command.dispatch`, `complete.path`, `complete.slash`, `model.options`, `slash.exec`, `browser.manage`, `usage.account`, e a família `pet.*`.

### 5.3 RPC expostos e não consumidos

| Grupo | Métodos |
|---|---|
| Sessão | `session.list`, `.history`, `.undo`, `.compress`, `.save`, `.branch`, `.delete`, `.status`, `.activate`, `.active_list`, `.most_recent` |
| Entrada | `prompt.background`, `pdf.attach`, `clipboard.paste`, `input.detect_drop`, `paste.collapse` |
| Executor local | `local.exec.result`, `local.executor.register`/`unregister`, `local.session.set`, `local.fs.read`, evento `local.exec.request` |
| Faturação | `billing.state`/`charge`/`charge_status`/`auto_reload`/`step_up`, `credits.view` |
| Delegação | `delegation.status`, `delegation.pause`, `subagent.interrupt`, `spawn_tree.save`/`list`/`load` |
| Outros | `cli.exec`, `command.resolve`, `process.stop`, `terminal.resize`, `voice.toggle`, `model.save_key`, `model.disconnect`, `pet.cells`, `verification.status`, `project.facts` |
| Projetos | `projects.get`, `.remove_folder`, `.set_primary`, `.archive`, `.for_cwd`, `.discover_repos` |

Eventos emitidos sem ouvinte confirmado: `skin.changed`, `voice.transcript`, `voice.status`, `local.exec.request`.

### 5.4 Lacunas REST

Não consumidos: portal, pairing, pool de credenciais, knowledge, agent-trace, temas/plugins do dashboard, `system/stats`, onboarding do Telegram, `gateway/start|stop|drain`, `ops/import|hooks|checkpoints`, `config/raw`, conteúdo de skills, `analytics/models`, aprovações por REST, e boa parte da administração de sessões (`bulk-delete`, `empty`, `stats`, `export`, `prune`).

### 5.5 Implementado duas vezes

| Capacidade | Electron | Motor | Como escolhe |
|---|---|---|---|
| Git (status, worktrees, branches, review, PR) | `hermes:git:*` → `git-review-ops.cjs`, `git-worktree-ops.cjs` | REST `/api/git/*` | `desktop-git.ts`: local → IPC; remoto → REST |
| Descoberta de repos | `hermes:git:scanRepos` | RPC `projects.discover_repos` | IPC sempre; RPC nunca chamado |
| Filesystem | `hermes:fs:*`, `readFileDataUrl` | REST `/api/fs/*` | `desktop-fs.ts`, local vs remoto |
| Terminal interativo | `hermes:terminal:*` (node-pty) | `WS /api/pty` + `terminal.resize` | Sempre Electron; PTY do agente vem por eventos |
| Clipboard | `hermes:writeClipboard` | RPC `clipboard.paste` | Sempre Electron |
| Updates | `hermes:updates:check/apply` | `/api/wayne/update*` | Ver §1.1 |
| Projetos | — | RPC `projects.*` **e** REST `/api/projects*` | Local → RPC; cloud W4Y → REST |
| Renomear sessão | RPC `session.title` | REST `PATCH /api/sessions/{id}` | RPC preferido, REST fallback |
| Opções de modelo | RPC `model.options` | REST `/api/model/options` | Ambos em uso |

**Duas sondas de git.** O chip Changes e o painel Review já partilham `$reviewFiles` (unificado depois da falha de ontem), mas `$repoStatus` continua a ser uma segunda leitura independente, usada para branch, ahead/behind, worktrees e para pintar a árvore de ficheiros.

---

## 6. Desktop — superfícies

### 6.1 Alcance

| Alcance | Superfícies |
|---|---|
| Navegação primária | Chat, sidebar, composer, Ambiente (Files/Agents/Browser/Terminal), Review, Preview, Capabilities, Messaging, Artifacts, Automations |
| Só paleta / atalho / deep-link | Settings, Command Center, Agents (overlay), Profiles, Starmap, Agent Studio, Model picker, Model visibility, Pet generate, Keybinds |
| Settings na navegação principal | General, Account, Appearance, Voice, Notifications, Browser & Network, Memory, Models, About |
| Settings só por deep-link | `?tab=providers`, `?tab=gateway`, `?tab=keys`, `?tab=config:advanced` |

A ausência do roster de agentes na navegação primária é deliberada (comentário em `sidebar/index.tsx:144-145`).

### 6.2 Veredito das superfícies recentes

Tudo o que foi acrescentado ao composer está de facto ligado: `ProjectChip`, `RunTargetChip` (degrada para "Local" sem menu quando a cloud não responde), `CodingStatusRow`, chip Changes (lê `$reviewFiles`), Commit & PR (`git.review.*`), `ModelPill`, `ModeChip`, `ConnectorsPicker`, e a pilha de estado (todos, subagentes, processos, fila).

### 6.3 Duplicações de UI

| Conceito | A | B |
|---|---|---|
| Escolher modelo | `ModelMenuPanel` (composer) | `ModelPickerDialog` (overlay) + Settings → Models |
| Visibilidade de modelos | `ModelVisibilityDialog` | Toggles em Settings → Models |
| Modo de aprovação | Settings General (`approvals.mode`) | `ModeChip` no composer (+ YOLO por sessão) |
| Ver subagentes | Aba Agents do Ambiente | Overlay `/agents` |
| Terminal | Linhas de ferramenta no chat | PTY embutido no Ambiente |
| Browser / preview HTML | Preview rail | Aba Browser do Ambiente |
| Diffs | `inline_diff` → `$toolDiffs` (payload da ferramenta) | Review (árvore de trabalho) |

Nota conceptual: "Agents" significa três coisas diferentes no produto — subagentes (delegação), Agent Studio (roster de perfis) e Profiles (CRUD/SOUL).

### 6.4 Persistência das definições

Escrevem `config.yaml`: General (personality, `approvals.mode`, `security.redact_secrets`, `checkpoints.enabled`, `display.show_reasoning`, `voice.auto_tts`), Voice, Browser & Network, Memory, Models, About (`updates.non_interactive_local_changes`), Advanced.

Só no dispositivo: tema, modo, zoom, translucidez, modo de visualização de ferramentas, consentimento de embed, notificações nativas, som de conclusão, lista de visibilidade de modelos.

Chaves do motor sem UI nenhuma: `display.tool_progress`, `display.tool_progress_command`, `display.skin`, `display.background_process_notifications`, `smart_model_routing`, maior parte de `curator.*` e `logging.*`, `stt.local.language`, `stt.elevenlabs.language_code`, `voice.record_key`, boa parte de `delegation.*` e dos knobs de plataforma do gateway.

---

## 7. Incertezas assumidas

1. Handlers de `tool.progress`, `notification.*`, `moa.*` e `browser.progress` — emitidos, mas o tratamento pode estar dobrado em caminhos genéricos em vez de ramos dedicados.
2. Se a aba Browser do Ambiente recebe sempre screenshots CDP ao vivo com browser remoto — depende do payload do evento.
3. Cobertura botão-a-botão dentro de Cron, Messaging, Artifacts, Skills Hub e MCP — verificado ao nível da página, não do controlo.
4. Diff exaustivo de `DEFAULT_CONFIG` contra todos os campos de UI — precisaria de script de cobertura de chaves.
5. Métodos RPC construídos dinamicamente escapariam à deteção por literal.
