# Work4You — Definição de produto (canónico)

> **Status:** fonte única de verdade de produto. Actualizado 29/07/2026.
>
> **Se outro documento contradiz este, o outro está caduco.** Sem excepção.
>
> **Regra de manutenção:** um novo alinhamento **actualiza este ficheiro**. Não
> se cria um documento novo ao lado. Se um alinhamento substituir outro
> documento por inteiro, esse documento vai para `docs/arquivo/` no mesmo
> momento — não fica em `docs/` com um aviso no cabeçalho. Já provámos que
> avisos no topo não impedem ninguém de ler e absorver.

---

## Público

**Programadores e utilizadores técnicos — o mesmo público do Claude Code e do
Cursor.**

Escrevem código. Vivem no terminal. Sabem o que é um branch, um diff, um
merge, uma chave de API. Escolheram esta ferramenta por competência, não por
falta de alternativa.

O que decorre disto, e vale para todas as decisões de UI e de copy:

- **Não se explica o básico.** Nada de texto a ensinar o que é um commit ou
  para que serve uma branch.
- **Não se edita a fórmula do produto.** Capacidades nativas (image gen, web
  research, video, vision, ficheiros, terminal…) são a receita Work4You — o
  utilizador usa-as no chat; não escolhe providers nem desliga toolsets. Contas
  e potenciais *dele* entram só por **Conectores**. Ver secção
  [Fórmula vs Conectores](#fórmula-vs-conectores).
- **Humanizar ≠ infantilizar.** Copy clara e directa, sim. Copy condescendente,
  não.
- **A referência de UX é o Cursor**, não uma ferramenta para quem tem medo de
  computadores.

**Depois:** Enterprise (conta de organização com vários utilizadores), sem
redefinir Work + Studio.

### O que não somos

Não servimos PME nem "empreendedores não-técnicos". Esta premissa esteve
escrita em vários documentos, foi revertida, e continuou a ressuscitar porque
ficou escrita em sítios que os agentes liam como verdade. Está morta. Os
documentos que a continham estão em `docs/arquivo/`.

---

## Analogia (não negociável)

**Work4You está para o Hermes como o Cursor está para o VS Code.**

- Reutilizamos a infraestrutura e o backend que já funcionam (Hermes / runtime interno).
- Construímos **características próprias de produto e UX** em cima — não reescrevemos o motor.
- Nomes internos do motor (**Wayne**, **Hermes**) **não** são o produto para o utilizador.

---

## O que é a Work4You

Uma plataforma com **dois produtos iniciais** (mesma app, mesma base técnica):

| Produto | O que é para o utilizador | Analogia de mercado |
|--------|---------------------------|---------------------|
| **Work** | Agente do dia a dia — chat, canais, ficheiros, rotina | Claude Cowork / ChatGPT "work" |
| **Agent Studio** | Criar e gerir outros agentes na mesma base | Copilot Agent Studio (lista + connected) |

**Enterprise** (organização → vários utilizadores) fica para **depois**. Não
baratear o produto; também não meter complexidade multi-tenant org no v1.

---

## Motor (invisível)

- A plataforma / runtime por baixo é Work4You; tecnicamente é o stack Hermes (fork interno).
- **Wayne Agent** = nome **interno** do orquestrador. Nunca marca de produto.
- Regra de construção: se a capacidade já existe no Hermes (profile, canal, cron, memória, `delegate_task`, conectores), o trabalho é **UI + copy + polish** — não uma camada nova de plataforma.

### Guardrail anti-complexidade

Antes de qualquer feature:

1. Isto já existe no Hermes?
2. Serve **Work** ou **Agent Studio** (lista + connected) no v1?
3. Se não for crítico e exigir motor novo / canvas / workflow / org → **não construir** sem aprovação explícita.

Já queimámos tempo a empilhar camadas em cima de um upstream que funciona. Não repetir.

---

## Produto 1 — Work

- É o agente **Default** de todos os utilizadores.
- Comportamento = Hermes (sem mais nem menos), com **UI** ajustada ao benchmark (Cursor).
- **Utilizadores não modificam** o Default como se fosse um agente Studio (sem "editar o Work" no Studio).
- **Invariante de UI/API:** o Default **nunca** aparece como agente editável no Agent Studio nem em Profiles (lista, SOUL.md, rename, delete). Pode aparecer como **Work** no dia a dia (sessões, switcher home) e como **fonte de clone** ao criar um agente Studio. Lapidação do Default = passo futuro interno — não self-service.
- Participa da orquestração: no chat ou num canal ligado ao Work, o utilizador pode pedir para consultar / delegar a um agente do Studio; o Work chama esse agente e devolve o resultado.
- Handoffs orquestrados pelo Default quando houver capacidade; **logs visíveis**.
- Treino / lapidação do Default = **passo futuro**, não bloqueia o v1.

---

## Produto 2 — Agent Studio

- Superfície para criar agentes **Hermes-class** (memória, skills, canais, etc.).
- Base técnica = mesma do Hermes (ex.: profiles como ilhas).
- UX de destino imediato: **lista** (roster) + indicação de **agentes connected** — não canvas, não workflow visual, não "times" nomeados no v1.
- Connected primeiro; times / canvas / workflows = **muito mais tarde**.
- Cada agente pode ter (ao longo do tempo) base de conhecimento, guardrails, fluxos próprios — sempre em cima da base Hermes, sem reinventar o core.
- Credenciais: Work e Studio são planos de identidade distintos; partilha ("Usar as minhas") só **explícita**, nunca silenciosa.
- Studio **não** se constrói em cima de um único agente-exemplo (LinkedIn, stock, etc.). Exemplos só ilustram o **nível de simplicidade** do v1 (um agente útil que faz o seu trabalho), não o roadmap do produto.

### Fora do Studio no v1

- Canvas / ReactFlow
- Compilador de workflow
- Times nomeados como entidade
- Marketplace / A-B de agentes
- Enterprise org

---

## Modelo mental em uma imagem

```
Utilizador
    │
    ▼
┌─────────┐     delega (logs)     ┌──────────────────┐
│  Work   │ ───────────────────► │ Agentes Studio   │
│ Default │ ◄─────────────────── │ (lista+connected)│
└─────────┘                       └──────────────────┘
    │
    └── UI Work4You  ·  motor Hermes (invisível)
```

- Lista no Studio = **quem existe** (+ quem está connected).
- Colaboração = Work (e depois connected) — **não** um diagrama obrigatório.

---

## Fórmula vs Conectores

> Alinhamento 29/07/2026. Aplica-se ao **Work**; o Studio herda a mesma
> separação (fórmula do produto vs contas do agente). Não existe “modo
> avançado” da receita — a Coca-Cola não deixa o cliente editar a fórmula.

### Quatro camadas

| Camada | O que é | O utilizador faz |
|--------|---------|------------------|
| **Fórmula Work4You** | Capacidades nativas do produto (image gen, web research, video gen, vision, ficheiros, terminal, browser, memória, delegação…) | Usa — pede no chat. Zero toggles, zero lista de APIs, zero escolha de provider. |
| **Conectores** | Contas e potenciais *do utilizador* (Gmail, Notion, Slack… e BYO como Firecrawl se quiser potenciar research) | Uma rota: **Conectar**. |
| **Skills (métodos)** | Playbooks: learned do projeto + o que instalar do Hub | Criar / editar / arquivar learned; instalar extras no Hub. Kit bundled operacional = parte da fórmula (já on, sem toggle). |
| **Canais** | Onde pessoas falam *com* o agente (WhatsApp, Telegram…) | Superfície própria — mensageria inbound, não “API de research”. |

MCP como ecrã de `mcp.json` / catálogo de servers **não é produto**. É
tubagem: Composio e similares alimentam **Conectores**; um servidor custom,
se existir no futuro, entra como “adicionar conector”, não como editor da
fórmula.

```
Utilizador pede no chat
        │
        ├── Fórmula Work4You  →  image / video / research / vision / files / terminal
        ├── Conectores        →  OAuth (Composio) + BYO (ex. Firecrawl)
        └── Skills            →  método / playbook (learned ou Hub)
```

### Regras de classificação

1. **Já existe nativo no fork e a plataforma pode pagar/gerir** (Nous / W4Y
   managed) → **fórmula**. Some da UI de Tools/providers. O default activo
   fica no motor; o utilizador não “liga Image Generation”.
2. **Exige conta ou chave do utilizador para potenciar** (Firecrawl próprio,
   Gmail, Notion…) → **só Conectores**. Não aparece como painel de provider
   dentro de Tools.
3. **É um jeito de trabalhar** (procedimento, learned, Hub) → **Skills**.
   Bundled operacionais = fórmula (sempre disponíveis). Learned = superfície
   principal da aba.
4. **É mensageria inbound** → **Canais**, não Conectores.
5. **Proibido:** segundo caminho (toggle de toolset, picker de N APIs, aba
   “avançado” da mesma capacidade) para o que já é fórmula.

Exemplo: research web nativo = fórmula. Se quiser Firecrawl → Conectores →
conectar Firecrawl. Uma porta.

### Alvo da UI “Habilidades” (sidebar)

Hoje (espelho Hermes admin): Skills | Tools | Conectores | MCP | Browse Hub.

| Entrada | Destino |
|---------|---------|
| **Skills** | Learned + criar/editar/arquivar. Kit bundled não listado com toggle (está na fórmula). |
| **Conectores** | Única porta para contas e BYO (incl. potenciais de research/imagem se forem conta do user). Featured + catálogo. |
| **Browse Hub** | Instalar métodos novos (skills). Não instalar “APIs”. |
| **Tools** | Remover da face do produto. Toolsets = decisão de plataforma no motor. |
| **MCP** | Remover como aba. Plumbing sob Conectores / motor. |

A fotografia actual da app (abas Tools/MCP ainda visíveis) está em
`docs/INVENTARIO-SUPERFICIES.md` — estado, não destino. Destino = esta secção.

Billing do que a fórmula inclui por plano: `docs/BILLING-ARQUITETURA.md`
(passo separado).

**Skills conector-disfarçado:** as 12 skills que pediam API/conta do
utilizador (Notion, Airtable, Google Workspace, …) foram tiradas do kit
bundled → `optional-skills/` + `skills.disabled` (migrate v34). Contas =
só Conectores. Ver `docs/SKILLS-AUDITORIA.md`.

**Anthropic skills:** example-skills Apache 2.0 (frontend-design, theme-factory,
doc-coauthoring, …) entram no kit/Hub com crédito + LICENSE. Document skills
proprietárias (docx/pdf/pptx/xlsx) **não** se redistribuem — o `powerpoint` do
kit foi removido (migrate v35). Decks/planilhas = `pptx-author` + `excel-author`
(OSS). Ver `docs/SKILLS-AUDITORIA.md`.

---

## Onde está o resto da verdade

Este ficheiro define **o que vendemos e para quem**. Os documentos abaixo são
vivos e mandam cada um na sua área técnica:

| Área | Documento |
|---|---|
| Superfícies (cloud, web, desktop) | `docs/PLATAFORMA.md` |
| Infra e stack | `docs/ARQUITETURA.md` |
| Contratos de backend verificados | `docs/BACKEND-MAP.md` |
| O que existe vs o que está ligado | `docs/INVENTARIO-SUPERFICIES.md` |
| Plano de reparação do desktop | `docs/PLANO-REPARO.md` |
| Planos, preços, faturação | `docs/BILLING-ARQUITETURA.md` |
| Copy do site público | `docs/BRIEF-SITE-WORK4YOU.md` |
| Linguagem e glossário da app | `docs/LINGUAGEM.md` |
| Curadoria do ecrã de configuração | `docs/CONFIG-CURADORIA.md` |
| Skills operacionais no contentor | `docs/SKILLS-AUDITORIA.md` |

**`docs/arquivo/`** é registo histórico. Nunca é instrução. Não se tira uma
decisão de produto de lá.

Experimentos como `w4y-studio/` e `model-experience-poc/` não são caminho
oficial.

---

## Critério de alinhamento (checklist rápido)

Uma proposta está alinhada se:

- [ ] Serve Work e/ou Agent Studio (lista + connected)
- [ ] Não introduz canvas/workflow/org no v1
- [ ] Não trata Wayne/Hermes como marca de produto
- [ ] Não edita o Default como agente Studio
- [ ] Prefere reuso Hermes a motor novo
- [ ] Trata o utilizador como técnico competente — sem explicar o básico
- [ ] Não põe a fórmula (providers, toolsets nativos) na cara do utilizador
- [ ] Contas / BYO do utilizador entram só por Conectores (uma porta)
- [ ] Skills na face = learned + Hub; kit bundled não é grelha de toggles

Se falhar algum ponto → fora de escopo até nova decisão registada **neste** ficheiro.
