# Plano Mestre de Execucao — Work4You sobre Hermes/Wayne

> Documento pronto para ser entregue ao Claude Fable 5 em um harness de desenvolvimento com acesso completo ao repositorio.

## 1. Instrucao principal ao agente

Voce e o Principal Engineer e Tech Lead responsavel por transformar o repositorio Work4You em um produto multiagente unico, seguro e pronto para producao.

Execute agora a Fase 0 e a Fase 1 de ponta a ponta. Nao entregue apenas analises, mockups ou TODOs: implemente as interfaces, adaptadores e testes necessarios para expor o backend existente. Ao concluir a Fase 1, pare no Gate de Produto e apresente o checkpoint para revisao. As Fases 2 a 7 formam o roadmap posterior e so devem comecar depois dessa validacao. Mantenha o sistema executavel ao final de cada work package e registre evidencias verificaveis.

O objetivo de produto e fazer com o Hermes/Wayne o que o Cursor fez com o VS Code:

- Hermes/Wayne e o motor de agentes, nao a experiencia final do cliente.
- Work4You e a camada de produto, identidade, controle, colaboracao, governanca e distribuicao.
- Web e desktop devem compartilhar a mesma interface, os mesmos dados e o mesmo modelo operacional.
- O desktop adiciona capacidades locais por uma bridge segura; nao deve possuir um segundo frontend ou um segundo modelo de estado.
- O usuario deve conseguir criar agentes e equipes, iniciar uma missao, acompanhar a execucao multiagente, responder pendencias, controlar workers e receber artefatos auditaveis.

Nao reescreva o runtime Hermes/Wayne. Preserve e integre as capacidades existentes de sessoes, delegacao, memoria, Kanban, cron, approvals, tools, MCP e worktrees.

### Prioridade de produto

O primeiro marco nao e uma rearquitetura enterprise. O primeiro marco e **extrair valor do backend que ja existe e coloca-lo na UX**.

Antes de criar novas entidades, novos sistemas ou novos fluxos administrativos:

1. Inventarie cada capacidade real do backend.
2. Verifique se ela possui API ou evento consumivel.
3. Crie somente o adaptador fino que estiver faltando.
4. Exponha a capacidade na interface atual.
5. Teste o fluxo real de ponta a ponta.

A experiencia padrao deve ser adequada a PMEs: simples, guiada, opinativa e com pouco setup. Recursos enterprise devem existir como camadas progressivas, sem ocupar a jornada principal de quem quer apenas criar um agente e executar uma tarefa.

## 2. Regras operacionais obrigatorias

1. Leia todos os arquivos `AGENTS.md` aplicaveis antes de modificar cada subprojeto.
2. Comece com `git status`, identifique alteracoes preexistentes e nunca use `git reset --hard`, `git checkout --` ou outra operacao destrutiva.
3. Nao sobrescreva nem inclua em commits alteracoes que ja pertencam ao usuario.
4. Trabalhe em uma branch isolada com prefixo `codex/` ou em worktree separado, se isso puder ser feito sem mover alteracoes existentes.
5. Antes de alterar contratos publicos, localize todos os consumidores com `rg` e mantenha compatibilidade temporaria quando necessaria.
6. Cada fase deve terminar com codigo compilando, testes passando e um checkpoint documentado.
7. Nao marque uma entrega como concluida por existir apenas uma tela. Ela precisa usar dados e comandos reais.
8. Nao use mocks no caminho de producao. Mocks sao permitidos somente em testes e Storybook.
9. Nao exponha secrets, prompts privados, conteudo de arquivos ou credenciais em logs, analytics ou mensagens de erro.
10. Nao implante em producao, nao altere DNS, nao rotacione secrets reais, nao execute migracoes destrutivas em dados reais e nao publique releases sem aprovacao humana explicita.
11. Migracoes devem ser aditivas, reversiveis quando possivel e acompanhadas de backfill e rollback documentados.
12. Toda autorizacao deve ser verificada no servidor. Nunca confie em `tenantId`, `workspaceId`, `email`, role ou plan enviados pelo cliente.
13. Use idempotency keys em provisionamento, billing, criacao de runs e consumo de creditos.
14. Se encontrar contradicao entre este plano e a implementacao, preserve seguranca e dados, registre a decisao em ADR e continue com a solucao de menor risco.
15. So interrompa para pedir decisao humana quando houver risco de perda de dados, custo externo real, mudanca irreversivel, credencial ausente ou duas opcoes de produto materialmente diferentes.

## 3. Estado atual que deve ser preservado

O repositorio ja possui capacidades reais. Reutilize-as:

- `wayne-agent/web`: frontend funcional com chat, sessoes, agents/profiles, cron, skills, arquivos, Kanban, approvals, governanca e subagentes.
- `wayne-agent/web/src/hooks/useChatSession.ts`: WebSocket, reconnect, resume, approvals, clarification, steering, interrupt, branch, context e eventos de subagentes.
- `wayne-agent/plugins/kanban`: tasks, dependencias, claims, workers, runs, logs, comentarios, anexos, eventos, recovery e inspect/terminate/reassign.
- `wayne-agent/tools/delegate_tool.py`: delegacao hierarquica e background.
- `wayne-agent/cron`: rotinas persistentes e concorrentes.
- `wayne-agent/wayne_state.py`: sessoes, custos, lineage e recovery.
- `wayne-agent/apps/desktop-shell`: shell Work4You com a mesma aplicacao web, filesystem, terminal, tray e bridge local.
- `platform/web`: login, onboarding, planos, billing e administracao do control plane.

As seguintes superficies nao devem virar produtos concorrentes:

- `wayne-agent/apps/desktop`: manter como referencia upstream Hermes; nao evoluir como cliente oficial W4Y.
- `model-experience-poc`: referencia visual; nao tratar como implementacao.
- `w4y-studio/dist`: artefato estatico sem fonte sustentavel; nao construir sobre ele.

## 4. Decisoes arquiteturais obrigatorias

As decisoes desta secao representam o destino arquitetural. Elas nao autorizam antecipar uma grande migracao antes de concluir a Fase 1 de paridade backend -> UX.

### 4.0 Principio PME-first

- O caminho principal deve funcionar sem o usuario entender runtime, provider, MCP, tenant, role, event stream ou politica de delegacao.
- Use defaults seguros e templates prontos.
- Mostre primeiro objetivo, progresso, pendencia e resultado.
- Coloque configuracoes tecnicas em `Avancado`.
- Nao exija organization, equipe, workflow ou governanca para executar o primeiro agente.
- Recursos enterprise devem ser ativados por plano, contexto ou permissao, sem poluir a experiencia PME.
- Toda tela deve responder: o que esta acontecendo, o que precisa de mim e qual foi o resultado.

### 4.1 Camadas

1. **Hermes/Wayne Runtime**: modelos, tools, memoria, sessoes, delegacao e execucao.
2. **W4Y Run Control Plane**: Task, Run, AgentRun, eventos, approvals, budget, checkpoints e artefatos.
3. **W4Y Platform Control Plane**: identidade, organizations, workspaces, memberships, RBAC, billing, feature flags, provisionamento e auditoria.
4. **W4Y Web**: unica superficie de produto.
5. **W4Y Desktop Shell**: W4Y Web mais capabilities locais negociadas.
6. **W4Y Contracts/SDK**: tipos, schemas, eventos e cliente compartilhado.

### 4.2 Entidades canonicas

Implemente e documente estas entidades:

| Entidade | Responsabilidade minima |
|---|---|
| `Organization` | Limite comercial e administrativo |
| `Workspace` | Limite de dados, politicas e colaboracao |
| `Membership` | Usuario, workspace, role e status |
| `Project` | Contexto persistente de trabalho |
| `AgentDefinition` | Identidade e configuracao logica do agente |
| `AgentVersion` | Snapshot imutavel e publicavel do agente |
| `Team` | Agentes, papeis, topologia e politicas de delegacao |
| `Task` | Intencao persistente do usuario |
| `Run` | Uma tentativa de executar uma Task |
| `AgentRun` | Execucao de um agente pai ou filho dentro da Run |
| `Approval` | Decisao humana pendente ou resolvida |
| `Artifact` | Entregavel produzido com lineage |
| `Schedule` | Gatilho recorrente ou programado |
| `Budget` | Limite de custo, tokens, tempo e iteracoes |
| `Checkpoint` | Estado recuperavel de uma Run |
| `AuditEvent` | Registro imutavel de acao humana ou automatica |

Mapeamento de compatibilidade:

- Profile atual -> `AgentDefinition`.
- Session -> conversa/contexto da `Task`.
- Chat turn, Kanban task ou cron fire -> origem de uma `Run`.
- Delegate child -> `AgentRun`.
- Managed file/output -> `Artifact`.

### 4.3 Estado e eventos

O servidor deve ser a fonte da verdade. Nao permita que o frontend seja o unico responsavel por reconstruir a arvore de agentes.

Cada evento persistido deve possuir:

```text
id
seq
occurred_at
tenant_id / organization_id
workspace_id
project_id opcional
task_id
run_id
agent_run_id opcional
actor_type
actor_id
causation_id
correlation_id
event_type
payload versionado
```

Eventos minimos:

```text
task.created | task.updated | task.assigned | task.blocked | task.completed
run.created | run.started | run.paused | run.resumed | run.completed
run.failed | run.cancelled
agent.spawned | agent.started | agent.progress | agent.completed
agent.failed | agent.cancelled
tool.started | tool.progress | tool.completed | tool.failed
message.delta | message.completed
approval.requested | approval.resolved | approval.expired
artifact.created | artifact.updated
usage.updated | budget.warning | budget.exhausted
checkpoint.created | checkpoint.restored
```

Requisitos:

- `seq` monotonicamente crescente por Run.
- Escrita idempotente.
- Replay a partir de `after_seq`.
- Snapshot periodico para reduzir tempo de reidratacao.
- Autorizacao antes da leitura e da escrita.
- Retencao, redaction e exclusao segundo politica do workspace.

### 4.4 API canonica

Implemente uma API versionada e uma SDK TypeScript compartilhada. Adaptadores antigos podem permanecer durante a migracao, mas web e desktop devem terminar consumindo o contrato canonico.

| Operacao | Contrato minimo |
|---|---|
| Criar Task | `POST /v1/tasks` |
| Listar/ler Tasks | `GET /v1/tasks`, `GET /v1/tasks/{id}` |
| Iniciar Run | `POST /v1/tasks/{id}/runs` |
| Estado da Run | `GET /v1/runs/{id}` |
| Arvore autoritativa | `GET /v1/runs/{id}/tree` |
| Stream/replay | `GET /v1/runs/{id}/events?after_seq=` |
| Steering | `POST /v1/runs/{id}/steer` |
| Pause/resume/cancel | `POST /v1/runs/{id}/{action}` |
| Controlar worker | `POST /v1/runs/{id}/agents/{agent_run_id}/{action}` |
| Resolver approval | `POST /v1/approvals/{id}/resolve` |
| Configurar budget | `PUT /v1/runs/{id}/budget` |
| Listar artefatos | `GET /v1/runs/{id}/artifacts` |
| Agentes e versoes | `/v1/agents`, `/v1/agents/{id}/versions` |
| Equipes | `/v1/teams` |
| Rotinas | `/v1/schedules` |
| Attention Inbox | `/v1/attention` |

Defina schemas com validacao em runtime, erros tipados, idempotency key, pagination, filtering, optimistic concurrency e versionamento explicito.

## 5. Arquitetura de informacao e UX final

Web e desktop devem possuir a mesma navegacao, terminologia e estado:

| Area | Experiencia obrigatoria |
|---|---|
| Inicio | Pendencias, tarefas recentes, rotinas, consumo e atalhos |
| Tarefas | Todas as missoes com status, projeto, equipe, custo e filtros |
| Agentes | Agentes publicados, drafts, saude e uso recente |
| Studio | Criar, testar, versionar e publicar agentes |
| Equipes | Compor agentes, papeis e politicas de colaboracao |
| Rotinas | Agendamentos, historico, resultados e falhas |
| Artefatos | Entregaveis, previews, versoes, fontes e lineage |
| Conectores | MCP, canais, credenciais, permissoes e health check |
| Uso | Custos, creditos, budgets, limites e previsoes |
| Configuracoes | Workspace, membros, seguranca, dados e billing |

### 5.1 Tela de Task/Mission Control

Preserve a estrutura de tres zonas:

- Esquerda: tarefas, projetos, agentes e equipes.
- Centro: conversa, plano, progresso e resultado.
- Direita: contexto, arvore de agentes, approvals, arquivos, terminal, diffs, eventos e custos.

A tela deve mostrar:

- Estado atual e tempo decorrido.
- Plano e dependencias.
- Agente pai e workers filhos.
- Quem esta executando cada etapa.
- Tools em uso e operacoes relevantes.
- Custo, tokens, tempo e budget restante.
- Pendencias humanas.
- Artefatos e fontes produzidas.
- Pause, resume, cancel, retry, steer e reassign.
- Recovery apos refresh, queda de WebSocket e reinicio do backend.

### 5.2 Attention Inbox

Unifique em uma caixa persistente:

- Approval de operacao sensivel.
- Clarification.
- Task bloqueada.
- Falha de agente.
- Falha de rotina.
- Budget perto do limite ou esgotado.
- Credencial/conector expirado.

Cada item deve ter severidade, SLA, origem, resumo seguro, acoes validas e audit trail.

### 5.3 Agent Studio

Construa um fluxo progressivo, sem expor toda a complexidade de uma vez:

1. Objetivo e identidade.
2. Instrucoes e comportamento.
3. Modelo ou politica Auto.
4. Conhecimento e memoria.
5. Tools, skills e conectores.
6. Permissoes e ambientes.
7. Budget e limites.
8. Gatilhos e rotinas.
9. Delegacao e equipe.
10. Testes/evals.
11. Versionamento, publicacao e rollback.

O Quickstart em linguagem natural deve continuar existindo, mas gerar um draft editavel e explicar as escolhas realizadas.

### 5.4 Team Builder

Nao trate cards posicionados sem edges como equipe operacional. Implemente:

- Agentes e papeis.
- Topologia pai/filhos ou peer team.
- Politica de delegacao.
- Ferramentas e dados permitidos por papel.
- Limites de concorrencia.
- Budget coletivo e individual.
- Regras de escalonamento humano.
- Contrato de handoff e formato de resultado.
- Preview e dry-run antes de publicar.

### 5.5 Workflow Builder

O ReactFlow deve editar uma definicao versionada e executavel, com:

- Schema formal.
- Tipos de node e edge.
- Validacao estrutural e semantica.
- Parametros e outputs tipados.
- Condicoes, retries, timeout e fallback.
- Approval gates.
- Dry-run.
- Checkpoints.
- Historico de versoes.
- Compilacao para os primitives reais do Wayne.

Se o fluxo nao puder ser executado, nao o apresente como workflow; use o nome "mapa" ate a conclusao dessa fase.

### 5.6 Web e desktop

`wayne-agent/apps/desktop-shell` e o unico cliente desktop oficial.

O desktop deve carregar a mesma aplicacao e negociar capabilities:

```text
filesystem.read
filesystem.write
terminal.execute
git.read
git.write
notifications.native
credentials.local
```

Cada capability deve possuir escopo, origem, expiracao, confirmacao, revogacao e audit event. Pastas devem ser canonicalizadas. Operacoes de terminal devem respeitar approval e sandbox; apenas validar path nao torna comandos shell confinados.

Entregas desktop obrigatorias:

- Deep links `work4you://` reais.
- Code signing Windows.
- Notarizacao macOS.
- Updater assinado.
- Canais stable/beta.
- Minimum supported version.
- Rollback.
- Crash reporting com redaction e consentimento.
- Testes da bridge e de autorizacao por origem.

## 6. Plano de execucao completo

Execute os work packages na ordem abaixo. A Fase 1 e a primeira entrega de produto e tem prioridade sobre rearquitetura, Studio, billing avancado e funcionalidades enterprise.

### Fase 0 — Baseline e seguranca minima inadiavel

Esta fase deve ser curta. Ela existe para proteger o codigo atual e eliminar apenas os riscos que tornam inseguro demonstrar ou liberar a UX existente.

| ID | Entrega | Implementacao | Criterio de aceite |
|---|---|---|---|
| W4Y-000 | Inventario tecnico | Estado Git, apps, comandos, bancos, contratos e ownership | Documento reproduzivel sem alterar arquivos do usuario |
| W4Y-001 | Baseline | Rodar typecheck, lint e testes atuais; registrar falhas preexistentes | Relatorio distingue falha preexistente de regressao |
| W4Y-002 | Test harness | Fixtures isoladas, test DB e primeiro fluxo E2E | Suite executa sem dados ou servicos de producao |
| W4Y-003 | Sessao segura | Substituir cookie JSON confiado por sessao server-side assinada | Alterar email, tenant ou role no cliente nunca concede acesso |
| W4Y-004 | Fronteira de tenant | Validar tenant no servidor nos fluxos atualmente expostos | Teste negativo prova que tenant A nao acessa tenant B |
| W4Y-005 | Handoff Wayne seguro | Token curto, one-time e vinculado ao usuario/tenant | Replay falha e nenhuma senha compartilhada chega ao cliente |

Nao implemente nesta fase SAML, SCIM, RBAC enterprise, policy engine ou uma nova hierarquia organizacional.

### Fase 1 — Extrair o backend existente para a UX

Objetivo: fazer o usuario enxergar e controlar tudo que o produto ja sabe fazer. Nao criar um novo motor, uma nova ontologia ou uma nova plataforma administrativa.

Regra da fase: reutilize o backend existente. Crie apenas endpoints/adaptadores finos quando a capacidade existir internamente, mas ainda nao estiver acessivel ao frontend.

| ID | Entrega | Backend existente a aproveitar | UX e criterio de aceite |
|---|---|---|---|
| W4Y-100 | Matriz de paridade | Rotas, RPCs, tools, plugins e eventos existentes | Documento `backend-capability-matrix.md` lista capacidade, backend, API, UX, teste e gap; nenhuma capacidade relevante fica sem classificacao |
| W4Y-101 | Navegacao funcional | Rotas ja presentes em `wayne-agent/web/src/App.tsx` | Todas as areas uteis ficam acessiveis por navegacao PME; ferramentas tecnicas ficam em `Avancado` |
| W4Y-102 | Controles completos do chat | stop, interrupt, steer, undo, compress, branch, reconnect, resume, prompt queue e local environment | Usuario usa cada comando real, recebe feedback e nao perde sessao no refresh |
| W4Y-103 | Painel de subagentes | eventos de start/progress/complete, status, spawn tree, pause e interrupt | Mostrar arvore/lista, objetivo, status, tempo, custo disponivel e output; controles nao suportados ficam claramente desabilitados |
| W4Y-104 | Operacoes/Kanban completo | task detail, comments, events, attachments, dependencies, runs, workers, inspect, terminate, reclaim, specify, reassign, decompose e logs | Usuario cria, detalha, decompõe, atribui, acompanha, recupera e encerra trabalho sem recorrer a API/CLI |
| W4Y-105 | Rotinas completas | cron CRUD, locks, concorrencia, timeout, sessoes e outputs | Criar/editar/pausar/executar, ver proxima execucao, historico, output e erro real |
| W4Y-106 | Sessoes e recuperacao | busca/FTS, lineage, historico, custos, branch e recovery | Buscar, fixar, renomear, ramificar, arquivar e retomar sessoes reais |
| W4Y-107 | Arquivos e entregaveis atuais | managed files, outputs, attachments e filesystem tools | Preview, download, origem da sessao/task e acoes seguras sobre arquivos existentes |
| W4Y-108 | Terminal, Git e worktrees | terminal tools, git status/diff/stage/commit/push/PR e worktrees existentes | Fluxo guiado mostra ambiente, diff e confirmacao; funcoes exclusivas do desktop exibem capability badge |
| W4Y-109 | Skills, plugins e MCP | catalogos, OAuth, reconnect, circuit breaker e configuracoes existentes | Instalar/configurar/testar/remover; status real `pronto`, `requer configuracao`, `indisponivel` ou `com erro` |
| W4Y-110 | Memoria e contexto | memory manager, context breakdown e arquivos de contexto | Usuario entende memoria/contexto usado e pode gerenciar o que o backend ja permite, sem expor prompt interno |
| W4Y-111 | Custos e governanca atual | usage events, custos de sessao/filhos, modelos e approval policies | Exibir consumo compreensivel, modelo em uso e permissoes efetivas sem exigir configuracao enterprise |
| W4Y-112 | Pendencias humanas atuais | approval e clarification ja entregues no stream | Uma caixa simples reúne pedidos ativos; resolver abre o contexto correto e aciona o mecanismo real |
| W4Y-113 | Desktop com a mesma UX | `desktop-shell`, folder bridge, executor, tray e notificacoes | O mesmo frontend funciona no shell; recursos locais aparecem apenas quando disponiveis |
| W4Y-114 | Estados de interface | erros e estados reais das APIs existentes | Cada fluxo possui loading, empty, success, error, reconnect e permission denied |
| W4Y-115 | Cobertura da paridade | testes unitarios atuais e novos testes de componente/E2E | Cada linha da matriz possui teste ou justificativa explicita; nenhum botao e apenas decorativo |

#### Gate de saida da Fase 1

A fase termina quando a matriz demonstrar que todas as capacidades relevantes existentes estao em uma destas situacoes:

1. Exposta e testada na UX.
2. Deliberadamente administrativa e colocada em `Avancado`.
3. Interna e nao apropriada ao usuario, com justificativa.
4. Quebrada/incompleta no backend, registrada para fase posterior.

Nao iniciar uma reconstrucao arquitetural para esconder gaps desta matriz.

Este e um **Gate de Produto obrigatorio**. Ao concluir W4Y-100 a W4Y-115:

1. Demonstre os fluxos implementados.
2. Entregue a matriz final backend -> API/evento -> UX -> teste.
3. Liste apenas os gaps que exigem backend novo.
4. Pare e aguarde validacao humana antes de iniciar a Fase 2.

### Fase 2 — Simplificar e unificar a experiencia PME

Objetivo: transformar as capacidades expostas em uma jornada simples, sem retirar poder de usuarios avancados.

| ID | Entrega | Implementacao | Criterio de aceite |
|---|---|---|---|
| W4Y-200 | Home PME | Continuar tarefa, criar agente, executar template, pendencias e resultados recentes | Novo usuario entende o proximo passo sem treinamento |
| W4Y-201 | Linguagem de produto | Padronizar Tarefa, Agente, Equipe, Rotina, Entregavel e Conector | Termos internos como profile, run ID e MCP nao dominam o caminho principal |
| W4Y-202 | Progressive disclosure | Modo simples por padrao e configuracoes tecnicas em `Avancado` | Primeira tarefa exige apenas objetivo e confirmacao de permissoes necessarias |
| W4Y-203 | Onboarding por resultado | Templates por funcao/segmento e primeira execucao guiada | Usuario conclui uma tarefa util antes de configurar detalhes |
| W4Y-204 | Mission view | Consolidar chat, plano, subagentes, pendencias e entregaveis | Usuario responde: o que ocorre, quem trabalha e o que foi entregue |
| W4Y-205 | Sincronizacao basica | Preferencias, pins, drafts e layout por usuario | Web e desktop restauram a mesma experiencia |
| W4Y-206 | Notificacoes | Centro interno, browser e native quando disponivel | Eventos sao deduplicados e levam ao contexto correto |
| W4Y-207 | Acessibilidade | Keyboard, focus, screen reader, contraste e reduced motion | WCAG 2.2 AA nos fluxos principais |
| W4Y-208 | Feedback e metricas | TTFT, primeira tarefa concluida, erro, abandono e satisfacao | Metricas sem conteudo sensivel orientam a proxima melhoria |

### Fase 3 — Tornar o control plane duravel e coerente

Somente agora consolide as entidades e contratos necessarios para a experiencia crescer sem divergencia.

| ID | Entrega | Implementacao | Criterio de aceite |
|---|---|---|---|
| W4Y-300 | `@w4y/contracts` | Schemas, tipos, erros, eventos e feature flags | Web, desktop, Platform e Wayne compartilham contratos versionados |
| W4Y-301 | Task/Run model | Adaptar chat, cron e Kanban para Task/Run/AgentRun | Fluxos atuais continuam funcionando durante a migracao |
| W4Y-302 | Event log | Persistencia, seq, replay, snapshot e idempotencia | Estado e identico apos desconexao e restart |
| W4Y-303 | Arvore autoritativa | AgentRun tree e lineage no servidor | Frontend nao e a unica fonte da arvore multiagente |
| W4Y-304 | Comandos duraveis | Pause/resume/cancel/steer/retry/reassign por escopo | Comandos persistem, sao autorizados e auditados |
| W4Y-305 | Approval duravel | Persistencia, expiracao e resolucao idempotente | Restart nao perde pedidos ou decisoes |
| W4Y-306 | Budgets | Limites e warnings por tarefa, equipe e agente | Excesso segue politica simples: parar, degradar ou pedir extensao |
| W4Y-307 | Artefatos e checkpoints | Lineage, versoes, snapshot e restore | Entregavel e recuperacao apontam para a execucao produtora |
| W4Y-308 | Protocol cleanup | Unificar REST/JSON-RPC/eventos divergentes | Web e desktop possuem a mesma semantica operacional |

### Fase 4 — Agent Studio, equipes e workflows

| ID | Entrega | Implementacao | Criterio de aceite |
|---|---|---|---|
| W4Y-400 | Agent Studio | Draft, clone, teste, versao, publicacao e rollback | PME cria agente por objetivo; avancado edita detalhes |
| W4Y-401 | Quickstart explicavel | Linguagem natural gera draft e explica escolhas | Nenhuma configuracao e publicada sem preview |
| W4Y-402 | Readiness de tools | Health, auth, scopes e teste de conexao | Catalogo nao promete integracao indisponivel |
| W4Y-403 | Team entity | Papeis, topologia, delegacao e budget | Equipe publicada produz execucao reproduzivel |
| W4Y-404 | Team Builder | Edicao visual conectada ao runtime real | Edges e politicas alteram a execucao efetivamente |
| W4Y-405 | Workflow schema/runtime | Nodes, edges, validacao, dry-run, gates e checkpoints | Workflow visual e executavel e versionado |
| W4Y-406 | Evals simples | Casos, assertions, score, custo e regressao | Usuario pode testar antes de publicar sem montar infraestrutura |

### Fase 5 — Desktop unico e continuidade local/cloud

| ID | Entrega | Implementacao | Criterio de aceite |
|---|---|---|---|
| W4Y-500 | Desktop consolidation | Oficializar `desktop-shell`; congelar cliente Hermes paralelo | Pipeline gera apenas o cliente W4Y |
| W4Y-501 | Capability protocol | Handshake, scopes, expiry, revoke e origin checks | Web nao invoca capability nao concedida |
| W4Y-502 | Local environments | Folder, terminal e Git associados ao projeto/tarefa | Usuario ve local vs cloud e pode desconectar |
| W4Y-503 | Handoff | Abrir no desktop, continuar na web e retornar | Uma unica tarefa sem duplicacao ou perda de estado |
| W4Y-504 | Distribuicao | Deep links, signing, notarization, updater e rollback | Instalacao/update E2E em Windows e macOS |
| W4Y-505 | Desktop QA | Bridge, executor, paths, origins e approvals | Traversal e origem invalida sao bloqueados |

### Fase 6 — Operacao comercial confiavel

| ID | Entrega | Implementacao | Criterio de aceite |
|---|---|---|---|
| W4Y-600 | Planos simples | Catalogo compartilhado, limites e feature flags | Uma PME entende o plano sem conhecer modelos/tokens internos |
| W4Y-601 | Billing idempotente | Webhook, ledger, reserva, consumo, estorno e reconciliacao | Retry nao duplica credito nem assinatura |
| W4Y-602 | Provisioner duravel | Job persistido, state machine, retries e compensacoes | Reinicio nao cria recursos duplicados/orfaos |
| W4Y-603 | Recovery de tenant | Backup, restore, suspend e delete | Tenant de staging pode ser restaurado e auditado |
| W4Y-604 | Direitos de dados | Export, delete, retencao e claims legais coerentes | Produto cumpre exatamente o que comunica |

### Fase 7 — Enterprise e escala, sem burocratizar a PME

| ID | Entrega | Implementacao | Criterio de aceite |
|---|---|---|---|
| W4Y-700 | Organizations/RBAC avancado | Organizations, workspaces, memberships, roles e invitations | Recursos aparecem apenas quando colaboracao/admin forem necessarios |
| W4Y-701 | Enterprise identity | SSO/SAML, SCIM e policy enforcement | Provisionamento e revogacao auditaveis |
| W4Y-702 | Governance | Retention, policy packs, audit explorer e data controls | Admin governa sem alterar a jornada do membro comum |
| W4Y-703 | Auto Router | Roteamento por qualidade, custo, latencia e disponibilidade | Escolha e fallback sao explicaveis e medidos |
| W4Y-704 | Crew | Decomposicao de objetivo, proposta de equipe, plano e budget | Usuario aprova equipe e custo antes da execucao |
| W4Y-705 | Observability/SLO | Tracing, custos e falhas com redaction e consentimento | Operacao e debuggable sem capturar conteudo indevido |
| W4Y-706 | PWA | Manifest, service worker, push e retomada segura | App instalavel e pendencias chegam com pagina fechada |
| W4Y-707 | Marketplace | Templates assinados/versionados, scopes e rollback | Instalacao mostra origem e permissoes em linguagem simples |

## 7. Estrategia de implementacao

### 7.1 Primeira vertical slice: backend existente -> UX

Antes de rearquitetar o control plane, entregue uma fatia completa usando os primitives atuais:

```text
usuario autenticado
  -> abre ou cria uma sessao existente
  -> envia um objetivo ao agente
  -> agente delega trabalho pelo mecanismo atual
  -> usuario ve o subagente, objetivo, progresso e ferramentas
  -> uma operacao existente solicita Approval ou Clarification
  -> usuario resolve pela interface
  -> acompanha custo, arquivos e resultado produzidos
  -> usa stop/steer/branch ou outro controle existente
  -> usuario recarrega a pagina
  -> a sessao e retomada com o maximo de estado que o backend atual suporta
  -> o desktop shell apresenta a mesma experiencia e adiciona capabilities locais
```

Essa fatia deve cobrir autenticacao, API/eventos atuais, frontend, reconexao e teste E2E. Registre separadamente o que nao sobrevive a restart ou nao possui contrato de backend; esses itens alimentam a Fase 3, sem bloquear a captura do valor ja existente.

Depois da primeira fatia, aplique o mesmo metodo ao Kanban, cron, sessoes, arquivos, worktrees, skills, MCP, memoria e custos.

### 7.2 Estrangulamento dos contratos antigos

- Nao faça um big bang no runtime.
- Crie adaptadores dos eventos atuais para o contrato W4Y.
- Adicione metricas de uso dos endpoints antigos.
- Migre o frontend por fluxo.
- Remova o caminho antigo apenas depois de testes de paridade e zero consumidores conhecidos.

### 7.3 Divisao de arquivos centrais

Reduza gradualmente responsabilidades de:

- `wayne_cli/web_server.py`
- `tui_gateway/server.py`
- `gateway/run.py`
- `gateway/platforms/api_server.py`
- `run_agent.py`
- `agent/conversation_loop.py`

Extraia modulos de protocolo, auth, lifecycle, event persistence e comandos. Evite refatoracao cosmetica sem teste de comportamento.

## 8. Testes e gates de release

### 8.1 Piramide minima

- Unitarios: reducers, policies, schemas, budget e autorizacao.
- Contrato: Platform <-> Wayne, API <-> SDK, bridge desktop <-> web.
- Integracao: DB, event store, billing, provisioner e recovery.
- Componentes: Mission Control, Inbox, Agent Studio e Team Builder.
- E2E: jornadas criticas em web e desktop.
- Seguranca: tenant isolation, replay, IDOR, privilege escalation, traversal e origin spoofing.
- Resiliencia: restart, disconnect, duplicate event, delayed event, worker crash e webhook retry.

### 8.2 Jornadas E2E obrigatorias

1. Signup/login -> workspace -> primeira Task -> resultado.
2. Convite -> member -> permissao negada para operacao de admin.
3. Tenant A tentando acessar IDs de Tenant B.
4. Run com dois subagentes, approval e artifact.
5. Refresh e queda de WebSocket durante Run.
6. Restart do backend durante Run recuperavel.
7. Pause, resume, cancel e retry de worker.
8. Rotina criando Run e notificando falha.
9. Compra -> credito -> consumo -> estorno/retry.
10. Provisionamento interrompido e retomado.
11. Desktop conectando pasta, executando comando aprovado e revogando acesso.
12. Web -> desktop -> web na mesma Task.
13. Publicar AgentVersion, executar e fazer rollback.
14. Workflow dry-run, approval gate e execucao final.
15. Exportar e excluir dados conforme politica.

### 8.3 Gates

Uma fase so esta concluida quando:

- Typecheck, lint e testes passam nos pacotes alterados.
- Nao ha regressao nos testes existentes.
- Novas APIs possuem schemas e testes de autorizacao.
- Migracoes foram testadas em banco vazio e banco com dados anteriores.
- UX possui loading, empty, error, offline/reconnect e permission denied.
- Acessibilidade dos fluxos criticos foi verificada.
- Logs nao contem secrets ou conteudo sensivel indevido.
- Documentacao e ADRs foram atualizados.
- Existe uma demonstracao reproduzivel ou screenshot/video do fluxo.
- O checkpoint da fase lista arquivos, comandos, resultados, riscos restantes e proxima fase.

## 9. Observabilidade e metricas de produto

Implemente telemetria somente com consentimento, redaction e politica de retencao. Separe metadados operacionais de conteudo do cliente.

Metricas minimas:

- Time to First Successful Task.
- Task success rate.
- Run completion/failure/cancel rate.
- Approval response time.
- Recovery success after reconnect/restart.
- Custo medio por Task e por AgentVersion.
- Percentual de runs dentro do budget.
- Artifact acceptance/reuse rate.
- Agent/connector failure rate.
- Provisioning success and recovery rate.
- Billing reconciliation discrepancies.
- Web/desktop handoff success rate.

## 10. Documentacao final obrigatoria

Ao final, entregue:

- `docs/architecture/overview.md`
- ADRs das decisoes estruturais.
- Modelo de dados e diagrama de entidades.
- Catalogo de eventos.
- OpenAPI ou equivalente da API canonica.
- Guia da SDK TypeScript.
- Runbook de provisionamento e recovery.
- Runbook de billing/reconciliacao.
- Threat model multi-tenant e desktop.
- Matriz de RBAC.
- Politica de dados, retencao, export e delete.
- Guia de release web e desktop.
- Guia de migracao dos contratos antigos.
- Relatorio final de testes e riscos residuais.

Atualize `docs/ARQUITETURA.md`, `docs/ROADMAP.md`, READMEs e documentacao que ainda misture Fly.io com arquiteturas antigas, sem apagar historico util.

## 11. Formato de checkpoint para cada fase

Ao terminar cada fase, responda exatamente com:

```markdown
## Checkpoint — Fase N

### Entregue
- IDs concluidos e resumo.

### Evidencias
- Arquivos principais.
- Migracoes.
- APIs e telas.
- Comandos de teste e resultados.

### Decisoes
- ADRs criados ou atualizados.

### Compatibilidade
- Caminhos antigos preservados/removidos.

### Riscos restantes
- Risco, impacto e mitigacao.

### Proxima fase
- IDs que serao iniciados.
```

Faça commits pequenos e intencionais por work package. Nao misture formatacao massiva ou alteracoes nao relacionadas.

## 12. Definicao global de concluido

O trabalho completo so pode ser declarado concluido quando:

1. Nao existe sessao confiada ao cliente nem credencial Wayne compartilhada no fluxo do usuario.
2. Isolamento entre tenants e RBAC possuem testes automatizados negativos e positivos.
3. Task, Run, AgentRun, Approval e Artifact sao entidades persistentes e autorizadas.
4. Arvore e eventos multiagente sobrevivem a refresh, desconexao e restart.
5. Chat, Kanban e cron originam execucoes no mesmo control plane.
6. Usuario controla run e worker com pause, resume, cancel, retry, steer e reassign.
7. Attention Inbox e persistente e unificada.
8. Agentes e equipes sao versionados, testaveis e publicaveis.
9. Workflow visual e executavel ou esta claramente rotulado apenas como mapa.
10. Web e desktop utilizam o mesmo frontend, SDK, entidades e eventos.
11. Desktop possui permissions, signing, updater, rollback e testes da bridge.
12. Billing e provisionamento sao idempotentes, recuperaveis e reconciliaveis.
13. Preferencias e estado do usuario sincronizam entre dispositivos.
14. Todos os fluxos E2E criticos passam no CI.
15. Documentacao corresponde ao sistema realmente implementado.
16. Nao restam P0 conhecidos. P1 residuais possuem owner, prazo e mitigacao.

## 13. Primeira acao

Comece agora pela Fase 0.

Mantenha a Fase 0 curta: proteja o worktree, estabeleca o baseline e corrija somente a seguranca minima inadiavel. Em seguida execute integralmente a Fase 1, comecando pela matriz de paridade e pela primeira vertical slice do backend existente para a UX.

Nao antecipe Organizations/RBAC avancado, SSO, SCIM, policy engine, marketplace ou uma nova arquitetura de eventos para bloquear essa entrega. Registre os limites encontrados e resolva-os nas fases posteriores, na ordem deste documento.

Continue autonomamente entre os work packages da Fase 0 e da Fase 1 enquanto os gates estiverem verdes. Quando um gate falhar, investigue, corrija e execute novamente. Nao substitua implementacao por um novo plano. Depois do checkpoint da Fase 1, pare e aguarde a revisao de produto antes de continuar.
