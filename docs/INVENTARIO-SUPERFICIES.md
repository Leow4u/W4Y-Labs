# Inventário de superfícies — motor, ACP, gateway, desktop

Levantamento só-leitura de **o que existe** e **o que está ligado**, superfície a superfície.

**Data:** 2026-07-29 · **Árvore:** `wayne-agent/` (pós-porte do desktop Hermes para `apps/desktop/`)

**Objetivo:** responder, por capacidade, se o buraco é *UI que falta*, *método que ninguém chama*, ou *coisa feita duas vezes* — para parar de reconstruir o que já existe.

**O que este doc não é:** não é plano nem recomendação. É estado — a fotografia de hoje.

| Para saber | Ler |
|---|---|
| Contratos do motor, gotchas, incidentes (validade longa) | [`BACKEND-MAP.md`](BACKEND-MAP.md) |
| O que o produto é e para quem | [`PRODUTO.md`](PRODUTO.md) |
| Nativo × construído, desperdício em dias (22/07) | [`arquivo/NATIVO-VS-CONSTRUIDO.md`](arquivo/NATIVO-VS-CONSTRUIDO.md) |

Se descobrires um **contrato** do motor em vez de um buraco na UI, escreve-o no `BACKEND-MAP.md`, não aqui.

**Método:** três varreduras paralelas sobre `tools/`, `toolsets.py`, `wayne_cli/`, `acp_adapter/`, `tui_gateway/`, `wayne_cli/web_server.py`, `apps/desktop/{src,electron}`. "CHAMADO" = referência literal encontrada no cliente. Métodos montados dinamicamente escapariam à deteção.

---

## 1. Bugs confirmados

Verificados diretamente, não herdados de relatório.

### 1.1 Botão "Update Work4You" do Command Center — RESOLVIDO 29/07

**Era:** o botão chamava `updateHermes()` directamente, saltando o store de updates, contra `POST /api/hermes/update` — rota que não existe. Fallout de rename: o upstream Hermes servia `/api/hermes/update`; o fork renomeou para `/api/wayne/update` e o cliente desktop ficou para trás. Sem gating: sempre visível, sempre clicável, sempre a falhar.

**Decisão do dono (29/07): caminho único de update = o chip ao lado do nome da conta.** Removidas as duas portas divergentes:

| Removido | Porquê |
|---|---|
| Botão em Command Center → Sistema | Chamava a REST directamente, sem estado de progresso nem recuperação |
| Entrada `cc-update-hermes` na paleta de comandos | Forçava o alvo `backend` independentemente do modo em execução |

About e Settings → General **ficaram**: chamam `startActiveUpdate()`, a mesma função do chip, portanto são atalhos para o caminho único, não rivais dele.

**Endereços corrigidos** em `hermes.ts` (`/api/hermes/update*` → `/api/wayne/update*`). Isto importa no modo remoto: o alvo realista é o nosso tenant na Fly, que corre em contentor, onde `_dashboard_local_update_managed_externally()` devolve `can_apply: false` e o `mapBackendCheck` traduz isso em "não suportado". Antes o mesmo cenário dava `check-failed` por 404.

**Resíduo conhecido:** um desktop em modo remoto apontado a uma instalação git fora de contentor chega a executar `wayne update`, que neste fork imprime um aviso de desativado e sai com código 0 — o store leria isso como sucesso. Cenário de programador, não de utilizador. A cura definitiva é apagar o conceito de "update do backend" do desktop, que pertence à unificação mais ampla.

### 1.2 Histórico de conectores nunca foi ligado

| | |
|---|---|
| **Função** | `getConnectorEventRuns()` — `apps/desktop/src/lib/connectors-api.ts:210` |
| **Rota** | `GET /api/connectors/events/recent` — **não existe** em nenhum ficheiro da árvore |
| **Callers** | **Nenhum.** Função exportada, zero utilizações |
| **Falha** | `try/catch` devolve `[]` em silêncio (`:217-219`) |

O comentário no código é honesto — *"Returns [] when the plugin/API is unreachable — Run History still shows cron runs alone."* O resultado é que o Run History mostra só cron, permanentemente, sem qualquer sinal ao utilizador.

Isto fecha o ciclo da primeira tarefa desta frente de trabalho: os *merges de eventos falsos* foram removidos (correto), mas a fonte real nunca foi construída.

### 1.3 A UI prometia aprovação que o agente não ia pedir — RESOLVIDO 29/07

O caso mais literal de *"o que o motor tem versus o que a UI expõe"*: aqui a UI expunha **errado**, e num controlo de permissão. Três defeitos independentes, todos com o mesmo efeito — o ecrã dizia que ia perguntar enquanto o agente não perguntava.

| # | Era | Motor |
|---|---|---|
| a | `readApprovalsMode` (`mode-chip.tsx`) procurava `'smart'` e chamava manual a tudo o resto | `_normalize_approval_mode` (`tools/approval.py`) devolve **três** valores — `manual`, `smart`, `off` — e `off` é bypass equivalente ao YOLO (`approval.py:2376,2770`) |
| b | Settings escrevia `approvals.mode` e mais nada | `/yolo` e o chip armam um bypass **por sessão** que se sobrepõe ao `config.yaml`. Escolher "perguntar sempre" na página deixava a sessão a correr sem perguntar |
| c | `if (!current) return` no `persistApprovalsMode` | Falha silenciosa: o menu fechava no modo escolhido e o motor ficava no antigo |

**(a)** O chip passa a representar `off`, incluindo o caso em que o YAML 1.1 lê `mode: off` como o booleano `False` — o motor mapeia isso de volta para `'off'`, e o chip agora também. `off` tem precedência sobre o YOLO na etiqueta, porque é o mais largo dos dois: vale em todas as conversas, na CLI e no cron. É oferecido no menu com o mesmo armar-em-dois-cliques do YOLO — as Settings já o ofereciam num select sem fricção nenhuma (`settings/constants.ts:268`), portanto escondê-lo no chip era incoerente, não era segurança.

**(b)** `savePermission` passa a chamar `disarmSessionYolo()` quando o modo escolhido não é `off`. A função vive em `lib/yolo-session.ts`, junto do `setSessionYolo` que já lá estava, e lê o gateway e a sessão activa dos stores — as Settings não têm nenhum dos dois em mãos. É o caminho único: o chip já fazia isto, faltava à página.

**(c)** Passa a avisar. Falha ao ler config e falha ao gravar dão notificação; a de gravar recua o cache partilhado como antes.

**Etiquetas.** `Off` no select das Settings passou a `Never ask` / `Nunca perguntar` — "Off" num campo chamado "Approval mode" tanto pode ler-se "não pergunta" como "modo por definir".

**Resíduo:** `setGlobalYolo()` em `lib/yolo-session.ts` continua sem chamadores. A documentação da função descreve um relâmpago na barra de estado que se activa com Shift+clique; esse relâmpago não existe no desktop. É precisamente a função que escreveria `approvals.mode: off` — deixada como está por ser código original do Hermes.

### 1.4 O guarda de ficheiros sensíveis só existia no ACP — RESOLVIDO 29/07

O `acp_adapter/edit_approval.py` recusa auto-aprovar edições a `.env`, chaves SSH e ao interior de `.git` — *"sensitive paths still ask even under autonomous policies"*. Essa regra nunca correu fora do ACP: o requester é preso num `ContextVar` durante uma execução ACP e, como o próprio ficheiro documenta na linha 5, *"CLI, gateway, and other sessions leave it unset and therefore bypass this guard"*.

O que isso queria dizer na prática, e é maior do que parecia: **`tools/file_tools.py` não tem portão de aprovação nenhum.** A sua única proteção é uma recusa dura em caminhos de sistema e no `~/.wayne/config.yaml`. Editar o `.env` de um projeto pelo desktop nunca pediu autorização — em modo nenhum, não só em bypass.

A regra foi colhida para `tools/approval.py` como **piso**, não como modo: corre antes da verificação de bypass, porque YOLO e `approvals.mode: off` compram trabalho não vigiado no projeto, não reescritas silenciosas das credenciais lá dentro. Fica acima do piso de ficheiros de política, que recusa em absoluto o `config.yaml`/`.env` do próprio Wayne — um `.env` de projeto é do utilizador, por isso este pergunta em vez de recusar. Ligado em `model_tools.py` ao lado do gancho ACP, e saltado quando o requester ACP está preso, para não perguntar duas vezes no mesmo editor.

O ACP passou a consumir a mesma função em vez da sua cópia. A cópia enumerava três grafias de `.env` (`.env`, `.env.local`, `.env.production`), pelo que um `.env.staging` era auto-aprovado; a regra partilhada cobre qualquer sufixo. Aprovação nunca passa da sessão — uma entrada permanente na allowlist levaria o bypass para lá do reinício, que é o buraco que isto fecha. Contratos fixados em `tests/tools/test_sensitive_edit_approval.py`.

**Alcance assumido:** só `write_file` e `patch`, as duas únicas ferramentas do toolset `file` que escrevem. Apagar um `.env` passa pelo `terminal`, que tem os seus próprios guardas. Em sessão sem superfície de pergunta (headless, sem gateway, fora do cron) aprova e regista aviso — mesma limitação documentada do `execute_code`.

### 1.5 Duas apps Electron a disputar o mesmo feed de atualização — RESOLVIDO 29/07

Havia duas árvores Electron: `apps/desktop` (`com.work4you.app`, 1.0.19) e `apps/desktop-shell` (`com.work4you.desktop`, 0.3.18). As duas apontavam `build.publish` para `https://storage.googleapis.com/w4y-engine-dist/` com o mesmo `artifactName` (`Work4You-${version}-${os}-${arch}.${ext}`). O provider `generic` do electron-updater mantém **um** `latest.yml` na raiz do bucket, portanto as duas partilhavam o mesmo feed.

Duas consequências, e a segunda é a séria. Quem publicasse por último passava a mandar na atualização das duas. E como o `appId` difere, o NSIS não substitui: uma atualização "bem-sucedida" instalava uma **segunda** Work4You ao lado da primeira em vez de atualizar a que estava.

Na prática nunca chegou a colidir, porque a shell nunca foi publicada — o `latest.yml` lido a 29/07 dava `1.0.19` / `Work4You-1.0.19-win-x64.exe` / `2026-07-29T03:22Z`, ou seja `apps/desktop`. A shell já estava congelada pelo seu próprio `STOP-SHIP.md` (*"frozen permanently"*, *"Never publish this shell as Work4You"*), estava fora dos `workspaces` do monorepo e nenhum workflow de CI lhe tocava. O que ela produzia não era risco de build: era a pergunta recorrente *"qual das apps é que eu estou a testar?"* a cada sessão.

Apagada a 29/07; o histórico do git guarda-a. Foram com ela os dez ficheiros vitest em `web/src/lib/` que faziam `require()` de módulos da shell — viviam ali, como um deles explicava, porque *"the shell has no test runner of its own"* — e o `web/src/lib/boot-preview.ts`, cuja flag só era carimbada pela shell: sem ela `isBootPreview()` era permanentemente `false`, pelo que o seu único consumidor em `NativeChatPage.tsx` perdeu a condição sem alteração de comportamento. Os comentários *"ported from desktop-shell"* que restam em `w4y-cloud.cjs`, `w4y-composio.cjs` e `preload.cjs` são proveniência, não dependência. Depois da remoção: `web` com 153 testes em 11 ficheiros a passar, typecheck limpo em `web` e em `apps/desktop`.

**Resto por limpar, sem urgência:** o bucket tem três canais e a app viva só lê dois — `latest.yml` (casca, via electron-updater) e `latest.json` (motor). O terceiro, `ui-latest.json`, era o canal `web_dist` da shell e continua a ser servido por `platform/wayne-fly/publish-ui.ps1`. Do lado da app sobra `w4y-deltas.cjs`, que ainda o declara em `DEFAULT_UI_LATEST` e o devolve pelo IPC `w4y:distribution:get`; o handler está tipado em `global.d.ts` e **nenhum ecrã o chama**. Anuncia um canal que a app nunca vai buscar.

**Risco residual, que apagar a árvore não resolve:** uma instalação antiga de `com.work4you.desktop` que ainda exista numa máquina continua a ler este mesmo `latest.yml`, vê `1.0.19` como mais recente que `0.3.18` e, se atualizar, instala a app nova ao lado em vez de substituir a velha. Não há migração entre `appId` — teria de ser desinstalação manual da antiga. Assumido como aceitável enquanto não houver notícia de instalações legadas em uso.

---

## 2. Retrato consolidado por causa

| Causa | Escala | Exemplos confirmados |
|---|---|---|
| **Motor tem, UI não expõe** | Grande | `display.tool_progress`, `display.background_process_notifications`, `smart_model_routing`, `display.skin`, maior parte de `curator.*` e `logging.*`; RPC `session.compress`/`undo`/`branch`/`history`; `delegation.pause`, `subagent.interrupt`; billing RPC completo |
| **Feito duas vezes** | Médio | §1.5 — duas árvores Electron a partilhar um `latest.yml`; Git (Electron IPC **e** REST); terminal (PTY Electron **e** `/api/pty`); modelos (3 UIs); subagentes (2 conchas); aprovações (2 caminhos de escrita); "o que mudou" no git (2 sondas) |
| **Existe mas escondido** | Médio | Profiles, Starmap, Agent Studio, Command Center e Settings fora da navegação primária; `?tab=providers`, `?tab=keys`, `?tab=gateway`, `?tab=config:advanced` só por deep-link |
| **UI expõe errado** | Pequeno mas caro | §1.3 — controlo de permissão a prometer aprovação que o agente não ia pedir |
| **Uma superfície tem, as outras não** | Pequeno | §1.4 — guarda de ficheiros sensíveis preso ao ACP; `file_tools` sem portão de aprovação nenhum |
| **Declarado e morto** | Pequeno | §1.1 e §1.2; `setGlobalYolo()` sem chamadores; eventos `skin.changed` e `voice.*` emitidos sem ouvinte; blocos de áudio tipados no ACP sem conversão |

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

- **Aprovações no desktop** vêm do evento `approval.request` do gateway e respondem por `approval.respond` — código distinto de `acp_adapter/permissions.py`. Mesmo conceito, caminhos separados. Caminhos separados custam: a regra de ficheiros sensíveis existia só do lado ACP e nenhuma outra superfície a tinha — ver **§1.4**.
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

Coluna **Proveniência** apurada em 29/07 por comparação ficheiro-a-ficheiro com o checkout upstream em `C:/DEV/hermes-upstream`: o que existe lá é original do Hermes, o que só existe cá construímos nós. Isto importa porque a instrução do dono é *unificar na estrutura original* — e a maior parte destas duplicações **veio de fábrica**, não fomos nós que as criámos.

| Conceito | A | B | Proveniência |
|---|---|---|---|
| Escolher modelo | `ModelMenuPanel` (composer) | `ModelPickerDialog` (overlay) + Settings → Models | Ambas originais — unificado 29/07 |
| Visibilidade de modelos | `ModelVisibilityDialog` | Toggles em Settings → Models | Ambas originais — unificado 29/07 |
| Modo de aprovação | Settings General (`approvals.mode`) | `ModeChip` no composer (+ YOLO por sessão) | A original, **B nosso** — unificado 29/07 |
| Ver subagentes | Aba Agents do Ambiente | Overlay `/agents` | Ambas originais — **não é duplicação**, ver abaixo |
| Terminal | Linhas de ferramenta no chat | PTY embutido no Ambiente | Ambas originais |
| Browser / preview HTML | Preview rail | Aba Browser do Ambiente | Preview original, aba Browser nossa |
| Diffs | `inline_diff` → `$toolDiffs` (payload da ferramenta) | Review (árvore de trabalho) | Ambas originais |

**Nosso, em modelos:** `lib/w4y-featured-models.ts`, `settings/models-settings.tsx` (invólucro que compõe o `ModelSettings` original com um painel nosso) e `settings/models-runtime-settings.tsx`. O menu do composer, o overlay de picker, o `model-picker` e o diálogo de visibilidade são originais quase intactos (+23, 0 e +5 linhas).

**Subagentes — não era duplicação (verificado 29/07).** A aba Agents do Ambiente e o overlay `/agents` são **o mesmo componente com duas molduras**: `app/agents/index.tsx` exporta `AgentsPanelBody` (usado pelo `right-sidebar/index.tsx:167`) e `AgentsView` (usado pelo `desktop-controller.tsx:1097`), e ambos constroem a árvore com a mesma linha — `buildSubagentTree(allSubagents(subagentsBySession))` — a partir do mesmo atom. Não há estado rival nem derivador próprio. Esta linha da tabela estava mal classificada; fica registada para não voltar a gerar trabalho.

**Modelos — resolvido 29/07.** A duplicação não estava nas UIs (todas originais) mas em **quem decide como pedir o catálogo**. Existe um ajudante partilhado original, `lib/model-options.ts` → `requestModelOptions()`, que encapsula "gateway ou REST + `explicit_only`" e tem testes a fixar esse contrato (*"Pickers ask for explicitly configured providers only (#56974)"*). O `app/chat/index.tsx` e o `components/model-visibility-dialog.tsx` reimplementavam esse ramo à mão, cada um com uma regra diferente de quando usar o gateway — a razão pela qual a fuga da Anthropic/Copilot teve de ser tapada duas vezes. Ambos passaram a chamar o ajudante. Delta de comportamento aceite pelo dono: com gateway ligado mas sem sessão, os dois passam a perguntar ao gateway em vez de irem pelo REST. Os chamadores que só pedem o catálogo global (Settings, prefetch) não decidem nada e ficaram como estavam; o onboarding usa `explicitOnly: false` de propósito e não deve ser unificado.

**Aprovações — resolvido 29/07.** O `ModeChip` era nosso e ignorava o cache partilhado de config: lia `approvals.mode` uma vez ao montar para estado local do componente e gravava com `saveHermesConfig()` **sem** `setHermesConfigCache()`. Resultado: mudar pelo chip deixava as Settings a mostrar o valor antigo, e vice-versa. Passou a ler por `useHermesConfigRecord()` e a escrever pelo cache partilhado com recuo em caso de falha — o mesmo padrão que o `mcp-tab.tsx` usa para acções discretas. O ficheiro `app/hooks/use-config-record.ts` diz no cabeçalho que *toda* a superfície de definições lê e escreve por esta chave; o chip era a excepção.

Sincronizar o cache não chegou: as duas superfícies concordavam no valor e continuavam a descrever mal o que o motor ia fazer. O resto — `off` colapsado em `manual`, YOLO de sessão que as Settings não desarmavam, falha silenciosa — está em **§1.3**.

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
