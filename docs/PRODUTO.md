# Work4You — Definição de produto (canónico)

> **Status:** fonte única de verdade de produto (CEO, 23/07/2026).  
> **Qualquer alinhamento de produto anterior a este doc é LIXO** — não consultar
> para decisões de direção. Em tensão com roadmaps, auditorias, AGENT-STUDIO antigo,
> PLATAFORMA (secções de produto), PLANO-REPARO (fases de Studio/canvas), etc.,
> **este arquivo manda**.

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
| **Work** | Agente do dia a dia — chat, canais, ficheiros, rotina | Claude Cowork / ChatGPT “work” |
| **Agent Studio** | Criar e gerir outros agentes na mesma base | Copilot Agent Studio (lista + connected) |

**Enterprise** (organização → vários utilizadores) fica para **depois**. PME primeiro.
Não baratear o produto; também não meter complexidade multi-tenant org no v1.

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
- Comportamento = Hermes (sem mais nem menos), com **UI** ajustada (benchmark / PME).
- **Utilizadores não modificam** o Default como se fosse um agente Studio (sem “editar o Work” no Studio).
- **Invariante de UI/API:** o Default **nunca** aparece como agente editável no Agent Studio nem em Profiles (lista, SOUL.md, rename, delete). Pode aparecer como **Work** no dia a dia (sessões, switcher home) e como **fonte de clone** ao criar um agente Studio. Lapidação do Default = passo futuro interno — não self-service.
- Participa da orquestração: no chat ou num canal ligado ao Work, o utilizador pode pedir para consultar / delegar a um agente do Studio; o Work chama esse agente e devolve o resultado.
- Handoffs orquestrados pelo Default quando houver capacidade; **logs visíveis**.
- Treino / lapidação do Default = **passo futuro**, não bloqueia o v1.

---

## Produto 2 — Agent Studio

- Superfície para criar agentes **Hermes-class** (memória, skills, canais, etc.).
- Base técnica = mesma do Hermes (ex.: profiles como ilhas).
- UX de destino imediato: **lista** (roster) + indicação de **agentes connected** — não canvas, não workflow visual, não “times” nomeados no v1.
- Connected primeiro; times / canvas / workflows = **muito mais tarde**.
- Cada agente pode ter (ao longo do tempo) base de conhecimento, guardrails, fluxos próprios — sempre em cima da base Hermes, sem reinventar o core.
- Credenciais: Work e Studio são planos de identidade distintos; partilha (“Usar as minhas”) só **explícita**, nunca silenciosa.
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

## Público

- **Foco v1:** PME / empreendedor — IA no dia a dia, fácil e segura.
- **Depois:** Enterprise (conta organização + utilizadores) sem redefinir Work + Studio.

---

## Docs anteriores (LIXO para direção de produto)

Tratar como histórico / infra / notas — **não** como norte de produto:

- `docs/AGENT-STUDIO.md` (F1 NL→config, F2 canvas, F3 marketplace) — **obsoleto**
- Secções de produto em `docs/PLATAFORMA.md`, `docs/PLANO-REPARO.md` Fase Studio/canvas, `docs/ROADMAP.md` Agent Studio antigo, `docs/AUDITORIA-PRODUTO-WORK4YOU.md` — **não mandam** sobre Work vs Studio
- Experimentos `w4y-studio/`, `model-experience-poc/`, `PLANO-MESTRE-*` — **não** caminho oficial

Infra (cloud/web/desktop Hermes `apps/desktop`) pode continuar a ser referida noutros docs **só** como superfície técnica; a definição de **o que vendemos** é este ficheiro.

---

## Critério de alinhamento (checklist rápido)

Uma proposta está alinhada se:

- [ ] Serve Work e/ou Agent Studio (lista + connected)  
- [ ] Não introduz canvas/workflow/org no v1  
- [ ] Não trata Wayne/Hermes como marca de produto  
- [ ] Não edita o Default como agente Studio  
- [ ] Prefere reuso Hermes a motor novo  
- [ ] PME-first sem infantilizar  

Se falhar algum ponto → fora de escopo até nova decisão CEO neste doc.
