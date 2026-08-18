# Curadoria da tela de Configuração — Work4You / Work4You

> Documento de trabalho da curadoria campo a campo da tela de Configuração do dashboard Wayne.
> Método: prints/leitura de código + conversa + benchmark (telas de configuração do Claude) → decisão → implementação em blocos.
> Ao final, este documento é consolidado em Word (.docx) para arquivo do Leonardo.
>
> **Legenda dos vereditos:**
> - ✅ **Usuário** — deve constar na experiência do usuário final (possivelmente repaginado).
> - ⚖️ **Candidato** — hoje fica no sistema; anotado para possível repaginação futura.
> - 🔒 **Sistema** — configuração interna; oculto do usuário final (segue existindo por baixo).
> - 🚨 **Sistema, urgente** — além de interno, expõe risco (credencial/segurança) — prioridade de ocultação.

## Contexto técnico

- A tela de Configuração é um editor visual do arquivo `/opt/data/config.yaml` da instância do tenant (volume persistente exclusivo por usuário; caminho igual em todas as instâncias, discos separados).
- Ela é dirigida pelo schema `/api/config/schema`, gerado automaticamente do `DEFAULT_CONFIG` ([work4you_cli/config.py](../wayne-agent/work4you_cli/config.py)) em [work4you_cli/web_server.py](../wayne-agent/work4you_cli/web_server.py): **~480 campos em ~36 categorias** (o menu exibe 15 na ordem fixa + extras em ordem alfabética).
- Categorias pequenas são fundidas (`_CATEGORY_MERGE`): updates→general; context/skills/cron/network/checkpoints/code_execution/prompt_caching/goals/onboarding/computer_use→agent; privacy/approvals→security; human_delay/dashboard→display; telegram→discord.

## Plano de blocos (aprovado 06/07/2026)

1. **Bloco 1 — Barra de ferramentas** ✅ implementado (fly12, commit 79f4345): ocultos caminho do arquivo, ⬇⬆ import/export JSON, ↺ reset e `<> YAML`; mantidos GUARDAR + busca. Racional: são affordances de editor de arquivo p/ desenvolvedor; backup do usuário é responsabilidade da plataforma (litestream→Tigris); YAML é modo dev; reset opera sobre centenas de campos técnicos.
2. **Bloco 2 — Tela enxuta do usuário** ✅ implementado (fly13, commit 65ad4f8): novo componente `ConfigUser` (menu lateral Geral/Aparência/Memória + conteúdo, estilo Claude) com só os 3 controles do usuário — Fuso horário, Memória entre conversas, Perfil pessoal — + Tema. Escreve nos mesmos campos do config.yaml. A tela técnica de 36 categorias sai da vista do usuário e fica atrás da escotilha interna `?full=1` (nós/suporte), no modal e na rota /config — resolve a exposição de credenciais. i18n `configUser` nos 16 idiomas.
3. **Bloco 3 — Auto-save estilo Claude**: salvar imediato em toggle/select e ao sair do campo em texto; GUARDAR sai. Só depois do Bloco 2 (auto-save é seguro na tela enxuta, perigoso na de 480 campos). **← próximo.**

**Rollout:** tudo somente na instância do Leonardo (`wayne-w4y`) até aprovação final; depois replica para todas as instâncias e vira padrão dos novos tenants.

---

# Seções curadas

## 1. Geral (19 campos) — topo do arquivo técnico + "updates"

| # | Campo | O que faz | Veredicto |
|---|---|---|---|
| 1 | Model | Modelo padrão de novas sessões (ID cru, ex. `anthropic/claude-sonnet-4.6`) | 🔒 Sistema — o usuário usa a página Modelos e o seletor do chat; texto livre aqui quebra o agente com um typo |
| 2 | Model Context Length | Força o tamanho da janela de contexto (0 = auto-detectar) | 🔒 Sistema |
| 3 | Fallback Providers | Provedores reserva se o principal falhar | 🔒 Sistema — resiliência é da plataforma |
| 4 | Toolsets | Pacotes de ferramentas carregados (`wayne-cli`) | 🔒 Sistema — errar = agente sem mãos |
| 5 | Max Concurrent Sessions | Teto global de sessões ativas (vazio = ilimitado) | 🔒 Sistema — capacidade/plano |
| 6 | Max Live Sessions | Agentes "vivos" na RAM antes de hibernar ociosos p/ disco (16) | 🔒 Sistema |
| 7 | Context File Max Chars | Quanto dos arquivos de contexto entra no prompt (vazio = dinâmico) | 🔒 Sistema |
| 8 | File Read Max Chars | Máximo de caracteres por leitura de arquivo (100.000) | 🔒 Sistema |
| 9 | MCP Discovery Timeout | Espera máxima ao descobrir servidores MCP no início da sessão (1,5s) | 🔒 Sistema |
| 10 | Prefill Messages File | Arquivo JSON de mensagens injetadas em toda chamada (priming de dev) | 🔒 Sistema |
| 11 | **Timezone** | Fuso IANA do usuário (vazio = hora do servidor, UTC). Afeta a noção de tempo do agente: crons, "amanhã às 9h", timestamps | ✅ **Usuário** — único da seção; formato final: dropdown "Fuso horário" |
| 12 | Command Allowlist | Comandos perigosos sempre permitidos; alimentada automaticamente pelo "sempre permitir" das aprovações no chat | 🔒 Sistema — o usuário interage via aprovações, não editando padrões |
| 13 | Hooks Auto Accept | Aceita registros de hooks de shell sem prompt | 🔒 Sistema |
| 14 | Updates → Pre Update Backup | Backup do código do Wayne antes de auto-update | 🔒 Sistema — auto-update não faz parte do nosso modelo (atualizamos por imagem) |
| 15 | Updates → Backup Keep | Quantos backups de update manter (5) | 🔒 Sistema |
| 16 | Updates → Non Interactive Local Changes | Destino de edições locais de código no update (stash/discard) | 🔒 Sistema |
| 17 | Paste Collapse Threshold | Nº de linhas coladas no terminal que viram "chip" recolhido (5) | 🔒 Sistema |
| 18 | Paste Collapse Threshold Fallback | Mesmo limiar p/ terminais sem bracketed paste (5) | 🔒 Sistema |
| 19 | Paste Collapse Char Threshold | Mesmo gatilho por nº de caracteres (2.000) | 🔒 Sistema |

**Saldo: 1 usuário / 18 sistema.**

## 2. Agente (52 campos) — regulagem do comportamento de UM agente

> Esclarecimento registrado: não são 52 agentes — são 52 parafusos de ajuste do único Wayne do usuário. "Outros cérebros" no sistema: tarefas auxiliares (chamadas pequenas especializadas — ver seção Auxiliary) e subagentes de delegação (ver Delegação).

### Núcleo (`agent.*`, 22 campos)

| Campo | O que faz | Veredicto |
|---|---|---|
| Max Turns (90) | Teto de iterações de ferramentas por execução — freio anti-loop | 🔒 Sistema |
| Gateway Timeout (1800s) | Encerra execução só com o agente 30min ocioso | 🔒 Sistema |
| Restart Drain Timeout (0) | Janela de graça no /restart (proteção de corrida com systemd) | 🔒 Sistema |
| Api Max Retries (3) | Retentativas de chamada à API em falha transitória | 🔒 Sistema |
| Service Tier ("") | Camada de API do provedor (auto/flex) | 🔒 Sistema — custo/plataforma |
| Tool Use Enforcement (auto) | Instrução p/ famílias de modelo (GPT/Codex) que descrevem a ação em vez de CHAMAR a ferramenta: "invoque, não narre". Vale p/ todas as ferramentas (nativas e conectadas), é correção de comportamento, não permissão | 🔒 Sistema |
| Intent Ack Continuation (auto) | Corretivo irmão: se o modelo parar após anunciar a intenção, cutuca a continuar | 🔒 Sistema |
| Task Completion Guidance (on) | Bloco "termine o trabalho, não entregue esboço" | 🔒 Sistema |
| Parallel Tool Call Guidance (on) | Orienta agrupar chamadas independentes | 🔒 Sistema |
| Environment Probe (on) | Diagnóstico do ambiente Python no prompt | 🔒 Sistema |
| Environment Hint ("") | Texto que a plataforma hospedeira injeta descrevendo o ambiente | 🔒 Sistema — é nosso (podemos descrever o ambiente Fly) |
| Coding Context (auto) | Postura "modo programação" quando detecta trabalho de código | 🔒 Sistema |
| Coding Instructions ("") | Regras permanentes do usuário p/ trabalho de código | 🔒 Sistema por ora — ⚖️ candidato a "Instruções personalizadas" estilo Claude |
| Verify Guidance (on) | Orientação de verificação antes de declarar concluído | 🔒 Sistema |
| Max Verify Nudges (3) | Teto de cutucadas de verificação por turno | 🔒 Sistema |
| Verify On Stop (auto) | Verificação ao parar, sensível à superfície (on p/ coding, off p/ chat) | 🔒 Sistema |
| Gateway Timeout Warning (900s) | Aviso de inatividade antes do timeout | 🔒 Sistema |
| Clarify Timeout (3600s) | Quanto tempo uma pergunta do agente aguarda resposta | 🔒 Sistema |
| Gateway Notify Interval (180s) | Cadência do "ainda estou trabalhando…" | 🔒 Sistema |
| Gateway Auto Continue Freshness (3600s) | Janela p/ retomar tarefa interrompida por queda | 🔒 Sistema |
| Image Input Mode (auto) | Como imagens do usuário são processadas (pixels nativos vs descrição prévia) | 🔒 Sistema |
| Disabled Toolsets ([]) | Desliga pacotes de ferramentas | 🔒 Sistema — face amigável: Habilidades/Plugins |

### Checkpoints (8 campos) — "máquina do tempo" de arquivos em trabalho de código
`enabled` (off), `max_snapshots` (20), `max_total_size_mb` (500), `max_file_size_mb` (10), `auto_prune` (on), `retention_days` (7), `delete_orphans` (on), `min_interval_hours` (24). Snapshots locais para desfazer edições. **Todos 🔒 Sistema** — recurso de dev desligado por padrão.

### Skills (6 campos) — mecânica interna das Habilidades

| Campo | O que faz | Veredicto |
|---|---|---|
| External Dirs ([]) | Pastas externas de skills no disco | 🔒 Sistema |
| Template Vars (on) | Templating de caminhos em skills | 🔒 Sistema |
| Inline Shell (off) | Skills podem rodar shell ao serem lidas (segurança!) | 🔒 Sistema |
| Inline Shell Timeout (10s) | Timeout desses snippets | 🔒 Sistema |
| Guard Agent Created (off) | Escaneia skills criadas pelo agente | 🔒 Sistema |
| Write Approval (off) | Agente edita as próprias habilidades sozinho ou pede aprovação | ⚖️ **Candidato** — controle de autonomia ("meu funcionário aprende sozinho vs. me consulta") |

### Cron (9 campos) — mecânica interna dos agendamentos
`provider` (""), `chronos.portal_url/callback_url/expected_audience/nas_jwks_url` (provider gerenciado da Nous — não usamos), `wrap_response` (on), `mirror_delivery` (off), `max_parallel_jobs` (∅), `output_retention` (50). **Todos 🔒 Sistema** — a face do usuário é a página Cron.

### Diversos (7 campos)

| Campo | O que faz | Veredicto |
|---|---|---|
| Prompt Caching → Cache TTL (5m) | Camada de cache Anthropic (custo) | 🔒 Sistema |
| Context → Engine (compressor) | Motor de gestão de contexto | 🔒 Sistema |
| Goals → Max Turns (20) | Freio de gasto em metas (/goal) | 🔒 Sistema |
| Code Execution → Mode (project) | Isolamento do executor de código | 🔒 Sistema |
| Network → Force IPv4 (off) | Contorno p/ IPv6 quebrado | 🔒 Sistema |
| Onboarding → Profile Build (ask) | Oferta de montar perfil na 1ª mensagem | 🔒 Sistema — onboarding é decisão nossa |
| Computer Use → Cua Telemetry (off) | Telemetria de componente de terceiros (desligada p/ todos) | 🔒 Sistema |

**Saldo: 0 usuário / 52 sistema (2 candidatos futuros: autonomia do agente, instruções personalizadas).**

## 3. Terminal (23 campos) — onde e como rodam as "mãos" do agente

### Backend de execução
| Campo | O que faz | Veredicto |
|---|---|---|
| Backend (local) | Onde comandos rodam: local/docker/ssh/modal/daytona/singularity | 🔒 Sistema — trocar quebra o agente; escolha é da arquitetura |
| Modal Mode (auto) | Submodo do backend Modal | 🔒 Sistema |
| Cwd (.) | Pasta de trabalho inicial | 🔒 Sistema |
| Timeout (180s) | Tempo máximo de um comando | 🔒 Sistema |
| Daemon Term Grace Seconds (2s) | Janela SIGTERM→SIGKILL p/ processos órfãos | 🔒 Sistema |
| Persistent Shell (on) | Shell vivo entre comandos (cwd/vars sobrevivem) | 🔒 Sistema |

### Ambiente do shell
| Campo | O que faz | Veredicto |
|---|---|---|
| Env Passthrough ([]) | Variáveis repassadas ao sandbox | 🔒 Sistema |
| Home Mode (auto) | Qual HOME o shell usa | 🔒 Sistema |
| Shell Init Files ([]) | Arquivos extras na inicialização do shell | 🔒 Sistema |
| Auto Source Bashrc (on) | Carrega ~/.bashrc automaticamente | 🔒 Sistema |

### Sandbox em container (não se aplica ao nosso backend local)
Docker/Singularity/Modal/Daytona Image (imagens), Docker Forward Env, Container Cpu (1) / Memory (5GB) / Disk (50GB), Container Persistent (on), Docker Volumes, Docker Mount Cwd To Workspace (off — segurança), Docker Extra Args, Docker Run As Host User (off). **Todos 🔒 Sistema** — recursos no nosso caso são definidos pelo plano na plataforma.

**Saldo: 0 usuário / 23 sistema.**

## 4. Visualização (65 campos) — como o trabalho do agente APARECE

### Retomada de sessão (recap)
Resume Display (full), Resume Exchanges (10), Resume Max User Chars (300), Resume Max Assistant Chars (200), Resume Max Assistant Lines (3), Resume Skip Tool Only (on), Tui Auto Resume Recent (off). **Todos 🔒 Sistema** — tuning do recap.

### Enquanto o agente trabalha
| Campo | O que faz | Veredicto |
|---|---|---|
| Busy Input Mode (interrupt) | Digitar com agente ocupado: interrompe/enfileira/redireciona | 🔒 Sistema |
| Interim Assistant Messages (on) | Mensagens naturais de status no meio da tarefa | 🔒 Sistema |
| Tool Progress Command (off) | Habilita /verbose nos canais | 🔒 Sistema |
| Tool Preview Length (0) | Corte dos previews de comandos | 🔒 Sistema |
| Friendly Tool Labels (on) | "Lendo arquivo…" em vez do nome cru da ferramenta | 🔒 Sistema |
| Tool Progress Grouping (accumulate) | Progresso numa bolha só vs. mensagem por ferramenta | 🔒 Sistema |
| Tui Agents Nudge (on) | Dica única "subagentes trabalhando · /agents" | 🔒 Sistema |
| Turn Completion Explainer (on) | Explica turno que termina sem resposta útil | 🔒 Sistema |
| File Mutation Verifier (on) | Confere se edições de arquivo aconteceram de fato | 🔒 Sistema — proteção |
| Inline Diffs (on) | Prévia das mudanças ao escrever arquivos | 🔒 Sistema |

### Raciocínio e resposta
| Campo | O que faz | Veredicto |
|---|---|---|
| Show Reasoning (off) | Exibe o "pensamento" do modelo no chat | ⚖️ **Candidato** — preferência legítima de chat (Claude expõe) |
| Reasoning Full (off) | Pensamento completo vs. recolhido (10 linhas) | 🔒 Sistema |
| Reasoning Style (code) | Formato visual do raciocínio | 🔒 Sistema |
| Streaming (off) | Resposta token a token no CLI | 🔒 Sistema |
| Final Response Markdown (strip) | Renderizar/limpar markdown na resposta final | 🔒 Sistema |
| Memory Notifications (on) | Linha "💾 Memória atualizada" no chat | 🔒 Sistema (limítrofe — futura preferência de notificação) |

### Aparência e idioma do chat
| Campo | O que faz | Veredicto |
|---|---|---|
| Skin (default) | Tema visual do chat/TUI (default/ares/mono/slate) | ⚖️ **Candidato** — par do Tema do painel na futura seção Aparência |
| Language (en) | Idioma das mensagens estáticas de sistema no chat (8 idiomas) | 🔒 Sistema — **ação de plataforma: sincronizar automaticamente com o idioma do chip** (hoje são dois mundos) |
| Timestamps (off) | Hora [HH:MM] nas mensagens | 🔒 Sistema |
| Compact (off) | Menos espaço em branco na saída | 🔒 Sistema |
| Personality ("") | Aplica "personalidade" predefinida ao agente | 🔒 Sistema no campo cru — conceito é candidato a produto futuro |
| Tui Status Indicator (kaomoji) | Estilo do indicador "trabalhando" | 🔒 Sistema |
| Show Cost (off) | $ na barra de status | 🔒 Sistema — billing é da plataforma |
| Credits Notices (on) | Avisos de créditos no chat (faixas de uso, esgotado, restaurado) | 🔒 Sistema — hoje inerte (fonte = créditos Nous, que não usamos). **Decisão de produto aprovada:** manter o FORMATO Hermes apontado ao nosso billing (uso/limite da chave OpenRouter; faixas 50/75/90%; 402 vira mensagem amigável com link de upgrade; "restaurado" após pagamento). Funcionalidade de onda futura, pós-curadoria |

### Encanamento fino do CLI clássico
Interface (cli), Bell On Complete (off), Persistent Output (on) + Max Lines (200), Persist Prompts (on), Cli Refresh Interval (1s), User Message Preview First/Last Lines (2/2), Ephemeral System Ttl (0), Copy Shortcut (auto). **Todos 🔒 Sistema.**

### Streaming por plataforma e rodapé
Platforms → Telegram Streaming (on), Platforms → Discord Streaming (off), Runtime Footer Enabled (off), Runtime Footer Fields ([model, context_pct, cwd]). **Todos 🔒 Sistema.**

### Pet — mascote do terminal (5 campos)
Pet Enabled (off), Slug (""), Render Mode (auto), Scale (0.33), Unicode Cols (0). **Todos 🔒 Sistema** — easter egg de dev.

### `dashboard.*` — o próprio painel (12 campos)
| Campo | O que faz | Veredicto |
|---|---|---|
| Theme (default) | Tema do painel (default/midnight/ember/mono/cyberpunk/rose) | 🔒 Sistema — ⚖️ verificar redundância com o card Tema (mecanismo distinto) na implementação |
| Show Token Analytics (off) | Reexibe números de tokens/custo (estimativa local que diverge da fatura) | 🔒 Sistema — decisão de produto: não mostrar números enganosos |
| Oauth → Client Id / Portal Url | SSO do painel via portal Nous | 🔒 Sistema — nosso SSO é a casca |
| **Basic Auth → Username / Password Hash / Password / Secret / Session Ttl (5)** | **Credenciais de login do painel do tenant** — as mesmas que a plataforma gera e usa no SSO | 🚨 **Sistema, urgente** — visíveis/editáveis hoje; usuário pode se trancar fora (SSO usa a credencial registrada na plataforma) |
| Drain Auth → Scope / Min Secret Chars | Auth do endpoint interno de drenagem/deploy | 🔒 Sistema |
| Public Url ("") | URL pública canônica p/ redirects de login | 🔒 Sistema |

### Human Delay (3 campos)
Mode (off), Min Ms (800), Max Ms (2500) — atraso simulado "digitando…" nos canais. **Todos 🔒 Sistema** — persona é decisão de produto.

**Saldo: 0 usuário / 65 sistema (candidatos: Mostrar raciocínio, Tema do chat; ação: sincronizar idioma; alerta: credenciais expostas).**

## 5. Delegação (14 campos) — subagentes (divisão de trabalho)

| Campo | O que faz | Veredicto |
|---|---|---|
| Model ("") | Modelo dos subagentes (vazio = herda o do pai) | 🔒 Sistema |
| Provider ("") | Provedor dos subagentes | 🔒 Sistema |
| Base Url ("") | Endpoint alternativo p/ subagentes | 🔒 Sistema |
| Api Key ("") | Chave de API desse endpoint | 🚨 Sistema — campo de credencial exposto na UI |
| Api Mode ("") | Protocolo do endpoint | 🔒 Sistema |
| Inherit Mcp Toolsets (on) | Subagente herda ferramentas MCP do pai | 🔒 Sistema |
| Max Iterations (50) | Orçamento de passos por subagente | 🔒 Sistema |
| Max Summary Chars (24.000) | Teto do resumo devolvido ao pai | 🔒 Sistema |
| Child Timeout Seconds (0) | Limite de tempo por subagente | 🔒 Sistema |
| Reasoning Effort ("") | Raciocínio dos subagentes (herda) | 🔒 Sistema |
| Max Concurrent Children (3) | Subagentes em paralelo | 🔒 Sistema — nota: futura alavanca de plano (plataforma) |
| Max Spawn Depth (1) | Profundidade da árvore de delegação | 🔒 Sistema — cada nível multiplica custo |
| Orchestrator Enabled (on) | Interruptor do papel orquestrador | 🔒 Sistema |
| Subagent Auto Approve (off) | Subagente auto-aprova comandos perigosos (senão nega e audita) | 🔒 Sistema — segurança |

**Saldo: 0 usuário / 14 sistema.**

## 6. Memória (6 campos) — o que o agente lembra entre conversas

| Campo | O que faz | Veredicto |
|---|---|---|
| Memory Enabled (on) | Interruptor mestre: memórias duráveis entre sessões | ✅ **Usuário** — privacidade/controle; benchmark Claude expõe |
| User Profile Enabled (on) | Perfil do usuário (fatos/preferências) injetado nas conversas | ✅ **Usuário** — mesmo grupo repaginado ("Memória e perfil") |
| Write Approval (off) | Memória grava sozinha vs. fila de aprovação (/memory pending) | ⚖️ Candidato — família "autonomia do agente" |
| Memory Char Limit (2.200) | Orçamento de caracteres da memória no prompt | 🔒 Sistema |
| User Char Limit (1.375) | Orçamento do perfil no prompt | 🔒 Sistema |
| Provider ("") | Plugin externo de memória (mem0, honcho…) | 🔒 Sistema |

**Saldo: 2 usuário / 4 sistema (1 candidato).** Desenho final: seção "Memória" (ou dentro de Privacidade) com toggles em linguagem humana.

## 7. Compressão (9 campos) — como conversas longas continuam cabendo

Quando o histórico enche a janela do modelo, o agente resume os trechos antigos e preserva o recente.

| Campo | O que faz | Veredicto |
|---|---|---|
| Enabled (on) | Interruptor da compressão | 🔒 Sistema — desligar quebra sessões longas |
| Threshold (0.5) | Comprime ao passar de 50% da janela | 🔒 Sistema |
| Target Ratio (0.2) | Fração preservada como cauda recente | 🔒 Sistema |
| Protect Last N (20) | Últimas mensagens nunca comprimidas | 🔒 Sistema |
| Protect First N (3) | Primeiras mensagens sempre preservadas | 🔒 Sistema |
| Hygiene Hard Message Limit (5.000) | Força compressão por contagem de mensagens | 🔒 Sistema |
| Abort On Summary Failure (off) | Resumo falhou: congela a sessão vs. segue | 🔒 Sistema |
| Codex Gpt55 Autoraise (on) | Correção específica p/ modelo que comprimia cedo demais | 🔒 Sistema |
| In Place (on) | Compactação reescreve o histórico no lugar | 🔒 Sistema |

**Saldo: 0 usuário / 9 sistema.**

## 8. Segurança (17 campos) — guarda-corpos + privacidade + aprovações

### Guarda-corpos de execução (`security.*`)
| Campo | O que faz | Veredicto |
|---|---|---|
| Allow Private Urls (off) | Acesso a IPs internos/localhost (anti-SSRF) | 🔒 Sistema — crítico em multi-tenant |
| Redact Secrets (on) | Censura segredos em saídas | 🔒 Sistema |
| Tirith Enabled (on) / Path / Timeout (5s) | Scanner pré-execução de comandos | 🔒 Sistema (×3) |
| Tirith Fail Open (on) | Scanner falhou → comando passa (nota ops: avaliar fail-closed) | 🔒 Sistema |
| Website Blocklist Enabled/Domains/Shared Files | Sites que o agente se recusa a visitar | 🔒 Sistema (×3) |
| Acked Advisories ([]) | Alertas de supply-chain reconhecidos | 🔒 Sistema |
| Allow Lazy Installs (on) | Instalar pacotes opcionais sob demanda | 🔒 Sistema |

### Privacidade (`privacy.*`)
| Campo | O que faz | Veredicto |
|---|---|---|
| Redact Pii (off) | Anonimiza IDs/telefones no contexto enviado ao modelo | 🔒 Sistema — ⚖️ candidato p/ futura seção "Privacidade" (ligar degrada personalização) |

### Aprovações (`approvals.*`) — mecanismo do "Permitir?" no chat
| Campo | O que faz | Veredicto |
|---|---|---|
| Mode (manual) | Política p/ comandos perigosos: perguntar/yolo/negar | 🔒 Sistema — usuário vive isso pelos prompts do chat; nota: família "autonomia" |
| Timeout (60s) | Espera do pedido antes de negar | 🔒 Sistema |
| Cron Mode (deny) | Comando perigoso em agendamento: negar vs auto-aprovar | 🔒 Sistema |
| Mcp Reload Confirm (on) | Confirmação do /reload-mcp (custo de cache) | 🔒 Sistema |
| Destructive Slash Confirm (on) | Confirmação de /clear e /undo | 🔒 Sistema |

**Saldo: 0 usuário / 17 sistema (1 candidato: Redact PII).**

## 9. Áudio — Voz (6) + TTS (21) + STT (10) = 37 campos

Permite mandar áudio ao Wayne (STT transcreve) e ouvi-lo responder (TTS fala). Experiência-alvo: canais (WhatsApp/Telegram).

### Voz (`voice.*`) — captura de microfone no CLI local
Record Key (ctrl+b), Max Recording Seconds (120), Auto Tts (off), Beep Enabled (on), Silence Threshold (200), Silence Duration (3s). **Todos 🔒 Sistema** — mecânica do CLI desktop; a experiência de voz nos canais será desenhada como produto.

### TTS (`tts.*`) — a fala do Wayne
| Campo | O que faz | Veredicto |
|---|---|---|
| Provider (edge) | Gerador de voz: edge (grátis), elevenlabs (premium), openai, gemini, xai, mistral, neutts/piper (locais) | 🔒 Sistema — nota: voz premium é alavanca natural de plano |
| Edge Voice (en-US-AriaNeural) | Voz do provedor grátis | 🔒 Sistema — ⚠️ default em inglês; definir padrão PT-BR quando voz virar produto |
| Elevenlabs Voice Id / Model Id · Openai Model / Voice · Gemini Model / Voice / Audio Tags / Persona Prompt File · Xai Voice Id / Language / Sample Rate / Bit Rate · Mistral Model / Voice Id · Neutts Ref Audio / Ref Text / Model / Device · Piper Voice | Vozes e parâmetros por provedor (19 campos) | 🔒 Sistema (×19) |

⚖️ Candidato de produto: **"Voz do assistente"** — seleção amigável de 2–3 vozes PT-BR curadas (benchmark: Claude mobile).

### STT (`stt.*`) — o ouvido do Wayne
| Campo | O que faz | Veredicto |
|---|---|---|
| Enabled (on) | Transcrever áudios recebidos | 🔒 Sistema — sempre ligado p/ áudio nos canais |
| Provider (local) | local (whisper na máquina), groq, openai, elevenlabs | 🔒 Sistema — nota infra: local consome RAM da instância (teto 2GB); avaliar API como padrão |
| Local Model (base) / Local Language (auto) | Whisper local; idioma auto detecta PT | 🔒 Sistema (×2) |
| Openai Model / Mistral Model / Elevenlabs Model Id / Language Code / Tag Audio Events / Diarize | Modelos e extras das APIs | 🔒 Sistema (×6) |

**Saldo: 0 usuário / 37 sistema (candidato: "Voz do assistente").**

## 10. Navegação e busca — Browser (16) + Web (4) + X Search (3) = 23 campos

### Browser (`browser.*`)
| Campo | O que faz | Veredicto |
|---|---|---|
| Inactivity Timeout (120s) / Command Timeout (30s) | Ociosidade e prazo por ação | 🔒 Sistema (×2) |
| Record Sessions (off) | Grava navegação em WebM | 🔒 Sistema |
| Allow Private Urls (off) | IPs internos (anti-SSRF) | 🔒 Sistema — crítico multi-tenant |
| Engine (auto) | Chrome vs Lightpanda | 🔒 Sistema |
| Auto Local For Private Urls (on) / Cdp Url ("") | Roteamento local e acoplagem a Chrome externo | 🔒 Sistema (×2) |
| Allow Unsafe Evaluate (off) | JS com acesso a cookies/clipboard | 🔒 Sistema — segurança |
| Dialog Policy (must_respond) / Dialog Timeout (300s) | Popups da página | 🔒 Sistema (×2) |
| Camofox (6 campos) | Navegador anti-detecção (perfis persistentes) | 🔒 Sistema (×6) |

### Web (`web.*`)
Backend / Search Backend / Extract Backend (motores de busca/extração), Extract Char Limit (15.000). **Todos 🔒 Sistema (×4).**

### X Search (`x_search.*`)
Model (grok-4.20-reasoning), Timeout (180s), Retries (2). **Todos 🔒 Sistema (×3).**

**Saldo: 0 usuário / 23 sistema.**

## 11. Canais de mensagem — Discord+Telegram (25) + Slack/Matrix/Mattermost (9) = 34 campos

Comportamento do Wayne dentro dos apps de mensagem. Face amigável: página **Channels** da sidebar.

### Discord (`discord.*`, 21)
Require Mention (on), Free Response Channels, Allowed Channels, Auto Thread (on), Thread Require Mention (off), Bots Require Inline Mention (off), History Backfill (on) + Limit (50), Reactions (on), Dm Role Auth Guild, Server Actions, Allow Any Attachment (off), Max Attachment Bytes (32MB), Voice Fx ×8 (mixer de voz: ambiente, ducking, frases de confirmação — em inglês). **Todos 🔒 Sistema.**

### Telegram (`telegram.*`, 4)
Reactions (off), Allowed Chats, Rich Messages (off), Rich Drafts (off). **Todos 🔒 Sistema.**

### Slack / Matrix / Mattermost (9)
Require Mention (on) + Free Response + Allowed, por plataforma. **Todos 🔒 Sistema.**

**Saldo: 0 usuário / 34 sistema.** Nota de produto: "responder só quando mencionado" e afins podem virar preferências POR CANAL dentro da página Channels — nunca na Config global.

## 12. Auxiliary (83 campos) — as 16 tarefas auxiliares ("estagiários")

Estrutura repetida: 16 tarefas × ~5 campos (provider `auto` = usa o modelo principal; model / base_url / **api_key** / timeout) + `transient_retries` (2).

As 16 tarefas: vision (descrever imagens), web_extract (resumir páginas), compression (comprimir contexto), skills_hub (buscar habilidades), approval (avaliar comandos perigosos), mcp (auxiliar MCP), title_generation (títulos de sessão — tem `language` próprio), tts_audio_tags (emoção na fala), triage_specifier e kanban_decomposer (especificar/decompor tarefas do Kanban), profile_describer (descrever perfis), curator (curadoria de skills), monitor (pontuar monitoramentos), background_review (revisão de fundo p/ memória), moa_reference e moa_aggregator (Mixture of Agents).

**Veredicto: 83 🔒 Sistema.** Face amigável já existe: card "Auxiliary Tasks" da página Modelos. Notas: 🚨 16 campos de api_key a mais na UI; `title_generation.language` entra na ação de sincronizar idioma.

## 13. Infra restante (98 campos em 17 seções)

| Seção | O que regula | Veredicto |
|---|---|---|
| Gateway (11) | Conexão de canais/API: scale-to-zero (5min), guarda de restart, mídia ≤128MB, 10 execuções simultâneas | 🔒 Sistema |
| Kanban (11) | Despachante do quadro: tick 60s, auto-decompor, limite de falhas | 🔒 Sistema — face = página Kanban |
| Curator (9) | Faxina semanal de skills (168h; arquiva 90d; backup ×5) | 🔒 Sistema |
| Sessions (5) | Retenção do histórico (auto-prune off, 90 dias) | 🔒 Sistema |
| Streaming (6) | Respostas em tempo real nos canais (off — custo extra) | 🔒 Sistema |
| MoA (9) | Presets Mixture of Agents (refs gpt-5.5+deepseek, agregador opus-4.8) | 🔒 Sistema — face = página Modelos |
| OpenRouter (3) | Cache de respostas (300s), nota mínima coding | 🔒 Sistema |
| Model Catalog (3) | Catálogo que alimenta a página Modelos (URL Nous, TTL 1h) | 🔒 Sistema |
| LSP (4) | Servidores de linguagem p/ código (auto-instala) | 🔒 Sistema |
| Desktop (2) | Flags do app Electron (não usamos) | 🔒 Sistema |
| Bedrock (8) + Vertex (2) | Provedores AWS/GCP alternativos (não usamos) | 🔒 Sistema |
| Tools (4) | Busca dinâmica de ferramentas | 🔒 Sistema |
| Tool Output (3) | Tetos de saída (50KB / 2.000 linhas) | 🔒 Sistema |
| Tool Loop Guardrails (8) | Freios anti-repetição de falha (avisa 2ª-3ª; hard-stop off) | 🔒 Sistema |
| Logging (3) | agent.log: INFO, rotação 5MB ×3 | 🔒 Sistema — face = página Registros |
| Secrets (7) | Bitwarden Secrets Manager (off; segredos nossos vão por env/Fly) | 🔒 Sistema |

**Saldo: 0 usuário / 181 sistema (Auxiliary + Infra restante).**

---

# Placar acumulado

| Seção | Campos | Usuário | Candidatos |
|---|---|---|---|
| Barra de ferramentas (Bloco 1) | 6 itens | 1 (Guardar, até o auto-save) | — |
| Geral | 19 | 1 (Fuso horário) | — |
| Agente | 52 | 0 | autonomia do agente; instruções personalizadas |
| Terminal | 23 | 0 | — |
| Visualização | 65 | 0 | mostrar raciocínio; tema do chat |
| Delegação | 14 | 0 | — |
| Memória | 6 | 2 (memória, perfil) | aprovação de escrita da memória |
| Compressão | 9 | 0 | — |
| Segurança | 17 | 0 | redact PII (privacidade futura) |
| Áudio (Voz/TTS/STT) | 37 | 0 | "Voz do assistente" (vozes curadas) |
| Navegação/busca (Browser/Web/X) | 23 | 0 | — |
| Canais (Discord/Telegram/Slack/Matrix/Mattermost) | 34 | 0 | prefs por canal na página Channels |
| Auxiliary (16 tarefas) | 83 | 0 | — (face = página Modelos) |
| Infra restante (17 seções) | 98 | 0 | — |
| **TOTAL FINAL** | **480** | **3 (0,6%)** | **8** |

## Resultado

**480 campos → 3 de usuário:** Fuso horário · Memória ligada/desligada · Perfil do usuário ligado/desligado. (+ o card Tema do painel, que já vive na Config.)

**Os 8 candidatos futuros:** aprovação de escrita de memória, aprovação de escrita de skills e modo de aprovações (família "autonomia do agente") · instruções personalizadas · mostrar raciocínio · tema do chat (skin) · redact PII (privacidade) · voz do assistente (vozes curadas).

**Achados de segurança (urgência do Bloco 2):** credenciais do painel (dashboard.basic_auth.*) visíveis/editáveis · delegation.api_key · 16× auxiliary.*.api_key.

# Decisões de produto colhidas no caminho

1. **Auto-save estilo Claude** (Bloco 3): imediato em toggle/select, ao sair do campo em texto; GUARDAR aposentado.
2. **Avisos de uso estilo Hermes com fonte OpenRouter** (onda futura): faixas 50/75/90% no chat + 402 amigável com link de upgrade + "restaurado" após pagamento.
3. **Sincronizar `display.language`** com o idioma escolhido no chip (plataforma decide, usuário não configura dois idiomas).
4. **Régua visual de uso no painel/chip** (ideia irmã do item 2, dados via Provisioning API pela casca).
5. **i18n sempre nos 16 idiomas** para qualquer texto novo criado na curadoria.

# Status

- ✅ **Descoberta completa** — 36 categorias / 480 campos (06/07/2026).
- ✅ **Bloco 1** — barra de ferramentas só com Guardar (fly12).
- ✅ **Bloco 2** — tela enxuta do usuário: menu lateral Geral/Aparência/Memória, técnica atrás de `?full=1` (fly13). Layout aprovado: menu lateral + conteúdo; tela técnica totalmente oculta.
- ⏭️ **Bloco 3** — auto-save estilo Claude (remove o Guardar). Próximo.

Tudo só na instância `wayne-w4y` até aprovação final do pacote.

---

# Tela "Geral" do usuário — mapeamento ao sistema (investigação 06/07/2026)

> Benchmark: Claude. Regra: **ligar ao que existe, sem inventar**. Investigação multi-agente (7 subsistemas) com verificação dos valores exatos relendo o código. Aqui a Config deixa de esconder o sistema e passa a **oferecer** o que é do usuário.

## Com lastro real (ligável hoje)

| Controle (usuário) | Backing exato | Como ligar |
|---|---|---|
| **Instruções para a Work4You** (texto livre) | `SOUL.md` em WORK4YOU_HOME — slot de identidade nº1 do system prompt, injetado em TODA conversa (global, não só-código) | `api.updateProfileSoul('default', texto)` / `getProfileSoul('default')` (PUT /api/profiles/default/soul). **NÃO** é config.yaml. Efeito na próxima sessão; passa por filtro anti-injeção |
| **Aparência — tema** (botões) | `setTheme(chave)` do `useTheme()` → localStorage + PUT /api/dashboard/theme `{name}` | Chaves REAIS: `white`(Claro) · `mono`(Escuro) · `cyberpunk` · `rose`. Reusa hooks do ThemeSwitcher |
| **Fonte** (dropdown) | `setFont(id)` → PUT /api/dashboard/font `{font}`; allow-list `FONT_CHOICES` | 14 fontes + `theme`(padrão do tema). Reusa `useTheme()`. NÃO é config.yaml dot-path |
| **Notificações — memória** | `display.memory_notifications` (config.yaml) — enum `off`/`on`/`verbose`, default `on` | getConfig/saveConfig. Dropdown Desligado/Breve/Detalhado (NÃO toggle) |
| Voz — falar respostas (auto-TTS) | `voice.auto_tts` (config.yaml, bool) | getConfig/saveConfig. ⚠️ só afeta canais (CLI/mensageria); **não** o chat do dashboard ainda |
| Notificações — créditos | `display.credits_notices` (config.yaml, bool) | getConfig/saveConfig. ⚠️ inerte hoje (fonte = créditos Nous, não usados); vale após a onda de billing OpenRouter |
| Identidade (só exibir) | GET /api/auth/me (read-only, do SSO) | Exibir iniciais + nome/email; **não** editável |

## Sem lastro — exigiria criar backend novo (NÃO ligar)

- **Nome completo editável** — `display_name` é read-only do SSO; sem campo/endpoint de escrita (vem vazio no provedor Nous).
- **"Como te chamar?" (apelido)** — sem campo estruturado; USER.md é texto livre escrito pelo agente, sem escrita pelo dashboard.
- **"O que descreve seu trabalho?" (dropdown ocupação)** — 100% novo: não há presets nem armazenamento. Falsos-amigos: `onboarding.profile_build` (modo ask/off) e a ProfileBuilderPage (= perfis de AGENTE).
- **Botão de tema "Sistema"** — sem `prefers-color-scheme` no caminho de tema.
- **Movimento (reduzir animações)** — sem campo; seria novo, mas trivial e 100% frontend (data-attr + CSS + localStorage).
- **Notificações do navegador (push)** — sem Web Notifications API / service worker.
- **Sino ao concluir** (`display.bell_on_complete`) — só terminal, inerte no navegador.

## Correções críticas (valores verificados relendo o código)

- Tema "Escuro" = chave **`mono`** (label "Black"), NÃO `black` (salvar `black` cai em fallback `white`).
- Instruções = **SOUL.md**, NÃO `agent.coding_instructions` (só-código, seria ignorado em chat comum) nem `display.personality` (não injeta no prompt).
- Endpoints de aparência: tema usa body `{name}`, fonte usa `{font}`.
- `memory_notifications` é **enum de 3 valores**, não booleano.
- O schema `dashboard.theme` no config está DESATUALIZADO (lista default/midnight/ember…); a verdade viva são as 4 chaves de `BUILTIN_THEMES` (white/mono/cyberpunk/rose).

## Desenho honesto proposto (a alinhar)

- **Perfil**: identidade read-only (iniciais + nome do login) + **um** campo "Instruções para a Work4You" (SOUL.md) — que no nosso sistema absorve "como me chamar / meu trabalho / persona". Os 3 campos separados do Claude (nome/apelido/ocupação) **não** têm lastro e ficam de fora.
- **Preferências**: Aparência (4 botões reais, sem "Sistema") · Fonte (14 + padrão do tema) · Movimento (decisão: omitir vs frontend-only trivial).
- **Voz**: deferir (único controle real não afeta o chat do dashboard).
- **Notificações**: Memória (funciona) + Créditos (decisão: incluir com ressalva vs deferir, inerte hoje).

---

# Revisão (benchmark → Manus web) — Conta · Geral · Personalização (06/07/2026)

Pivô: benchmark passa a ser **Manus web**; estrutura vira **Conta · Geral · Personalização**. Uso/faturamento fica **FORA** (intocado — nem settings, nem dashboard agora). 2ª investigação multi-agente (5 frentes) confirmou:

## CONTA — fina e honesta
- Identidade **read-only** (iniciais + nome/e-mail/user_id via /api/auth/me) + **Logout** (já existe). ✅
- Editar nome/e-mail, senha, métodos de login, eliminar conta → **casca/IdP**, sem endpoint no Wayne. Não construir. Plano/créditos → fora de escopo.

## GERAL
- **Idioma** ✅ — 16 locales, persiste em localStorage, default já `pt`. **Descoberta:** só existe UM locale `pt` e as strings estão em **português EUROPEU** (Guardar/Eliminar/A carregar). Para pt-BR de verdade: relabel "Português (Brasil)" + **brasileirizar pt.ts** (Salvar/Excluir/Carregando…). Tarefa própria.
- **Tema** ✅ — **exatamente 4 paletas reais**: `white`(Claro) · `mono`(Escuro) · `cyberpunk` · `rose`. **NÃO existe** modo Claro/Escuro/Automático nem as paletas Midnight/Ember/Slate/Nous (apelidos mortos → mono/white). O modelo rico do Hermes é **desktop**; no web seria net-new (recriar paletas + camada de modo). Honesto: mostrar as 4 agrupadas por luminosidade (1 clara / 3 escuras), sem "Automático".
- **Comunicação** — quase sem lastro no web: só **avisos de memória no chat** (dropdown off/on/verbose) tem efeito real (e é uma linha no chat, não notificação do SO). Sino sonoro = chave existe mas é só-terminal (precisaria de player WebAudio novo). Push do navegador / atualizações de produto / e-mail = sem lastro (casca / net-new pesado).

## PERSONALIZAÇÃO
- **Instruções personalizadas** ✅ — UM textarea = SOUL.md cru (PUT /api/profiles/default/soul), injetado como identidade em toda conversa. Absorve apelido/profissão/"mais sobre você"/persona em linguagem natural. Recomendado.
- Campos separados (Apelido/Profissão/Mais sobre você) = net-new frágil (template+parse sobre o mesmo arquivo, com 2 editores). Não recomendado.
- **Importar memória de outra AI** = sem lastro (só `work4you claw migrate` do OpenClaw via CLI). Workaround: colar no textarea de instruções. Deferir.

## Correções de valores (verificadas)
- Tema "Escuro" = `mono` (não `black`); schema config `dashboard.theme` está STALE (não usar sua lista).
- Idioma da UI (i18n/localStorage) ≠ `display.language` (TUI/gateway, 8 locales sem pt).
- `memory_notifications` = enum de 3 valores, não booleano.
- Sob provider Nous, e-mail/nome vêm vazios → rótulo cai para user_id (no nosso IdP próprio, o e-mail deve vir).
