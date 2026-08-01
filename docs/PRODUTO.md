# Work4You — Definição de produto (canónico)

> **Status:** fonte única de verdade de produto. Actualizado 30/07/2026.
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
redefinir o produto Work.

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

Uma plataforma com **um produto** no v1 (mesma app, mesma base técnica):

| Produto | O que é para o utilizador | Analogia de mercado |
|--------|---------------------------|---------------------|
| **Work** | O agente do dia a dia — chat, canais, ficheiros, rotina, Personalizar | Cursor (Customize + agent) / Claude Code |

**Agent Studio está morto.** Não há segundo produto “criar agentes Hermes por
profile / lista + connected”. Não se constrói módulo Studio, roster de perfis
como agentes, nem orquestração Work→Studio. Código ou rotas que ainda digam
`agent-studio` / “Agentes Studio” foram removidos da app; docs satélites
que ainda digam Studio nesta parte estão caducos até limpeza.

**Enterprise** (organização → vários utilizadores) fica para **depois**. Não
baratear o produto; também não meter complexidade multi-tenant org no v1.

A extensão do Work no sentido Cursor (“o utilizador define especialistas a que
o agente delega”) é **Personalizar → Subagentes**: templates leves
(`delegate_task`), não ilhas de profile. Ver estudo de desenho em curso; a
decisão de produto aqui é só: **Studio fora; Subagentes = caminho correcto**.

---

## Motor (invisível)

- A plataforma / runtime por baixo é Work4You; tecnicamente é o stack Hermes (fork interno).
- **Wayne Agent** = nome **interno** do orquestrador. Nunca marca de produto.
- Regra de construção: se a capacidade já existe no Hermes (canal, cron, memória, `delegate_task`, conectores, skills), o trabalho é **UI + copy + polish** — não uma camada nova de plataforma.
- **Profiles** no motor (= `WORK4YOU_HOME` isolado) podem existir como mecanismo interno / multi-instância. **Não** são o produto “criar agentes” nem justificação para reabrir Studio.

### Guardrail anti-complexidade

Antes de qualquer feature:

1. Isto já existe no Hermes?
2. Serve o **Work** (incluindo Personalizar: Skills, Conectores, MCPs, e no futuro Subagentes)?
3. Se não for crítico e exigir motor novo / canvas / workflow / org / Studio → **não construir** sem aprovação explícita.

Já queimámos tempo a empilhar camadas em cima de um upstream que funciona. Não repetir.

---

## Produto — Work

- É o agente **Default** de todos os utilizadores.
- Comportamento = Hermes (sem mais nem menos), com **UI** ajustada ao benchmark (Cursor).
- **Utilizadores não “editam o Work” como se fosse um agente configurável à la Studio** — a lapidação do Default é passo futuro interno, não self-service de SOUL/profile.
- **Invariante:** não expor o Default como agente editável num roster Studio (lista, rename, delete de “agente Work”). Sessões e home mostram **Work**; Personalizar estende capacidades (Skills, Conectores, Subagentes…), não clona o Default.
- Delegação no turno: o modelo usa `delegate_task` (e, quando existir a aba, defs de Subagentes do utilizador). **Não** há handoff para “outro agente Studio”.
- Treino / lapidação do Default = **passo futuro**, não bloqueia o v1.

---

## Morto — Agent Studio (não construir)

Alinhamento **30/07/2026:** Agent Studio **não** é produto. Não há:

- Módulo / rota de produto “Agent Studio”
- Agentes separados por profile como face do utilizador
- Lista + connected de “agentes Hermes-class” como segundo produto
- Canvas, times nomeados, marketplace de agentes, workflow visual

Specs antigas (`docs/arquivo/AGENT-STUDIO.md`, planos com Fase Studio) são
arquivo. Se `PLATAFORMA.md` / `LINGUAGEM.md` / `BRIEF-SITE-*` ainda falarem em
Studio, estão caducos nesta parte até limpeza — **manda este ficheiro**.

---

## Modelo mental em uma imagem

```
Utilizador
    │
    ▼
┌──────────────────────────────────────────┐
│  Work (Default)                          │
│  chat · canais · ficheiros · rotina      │
│  Personalizar: Skills · Conectores · …   │
│  (+ Subagentes = defs leves p/ delegar)  │
└──────────────────────────────────────────┘
    │
    └── UI Work4You  ·  motor Hermes (invisível)
```

Um produto. Especialistas do utilizador = **Subagentes** (quando existirem),
não um segundo produto Studio.

---

## Fórmula vs Conectores

> Alinhamento 29/07/2026 (fórmula/conectores). Alinhamento 30/07/2026: **só
> Work** — Agent Studio morto; esta secção aplica-se ao Work. Não existe “modo
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
        └── Skills            →  método / playbook (learned ou <projeto>/.work4you/skills)
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

Face do produto (estilo Cursor): **Skills | Conectores**. Sem Browse Hub / Tools / MCP.

| Entrada | Destino |
|---------|---------|
| **Skills** | Receitas: learned (`~/.work4you/skills`) + ficheiros do projeto (`<cwd>/.work4you/skills/**/SKILL.md`; o scan aceita também o legado `.wayne/skills`). Kit bundled = fórmula (não listado com toggle). |
| **Conectores** | Única porta para contas e BYO (Gmail, GitHub, Notion, Firecrawl…). Featured + catálogo. |
| **Browse Hub** | **Fora da face.** Loja Hermes não compete com Conectores nem com o kit. |
| **Tools / MCP** | Fora da face. Toolsets / MCP = motor / plumbing sob Conectores. |

**ELI5:** Conectores = as tuas contas. Skills = receitas (já no app ou no repo). Não há loja a meio.

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

- [ ] Serve o **Work** (não reabre Agent Studio / agentes-por-profile)
- [ ] Não introduz canvas/workflow/org/Studio no v1
- [ ] Não trata Wayne/Hermes como marca de produto
- [ ] Não expõe o Default como agente editável tipo Studio
- [ ] Prefere reuso Hermes a motor novo
- [ ] Trata o utilizador como técnico competente — sem explicar o básico
- [ ] Não põe a fórmula (providers, toolsets nativos) na cara do utilizador
- [ ] Contas / BYO do utilizador entram só por Conectores (uma porta)
- [ ] Skills na face = learned + métodos; kit bundled não é grelha de toggles
- [ ] “Agentes do utilizador” = Subagentes (Personalizar), não profiles/Studio

Se falhar algum ponto → fora de escopo até nova decisão registada **neste** ficheiro.
