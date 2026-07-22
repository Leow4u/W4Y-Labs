# Work4You — Definição de plataforma (estrela-guia)

> **Status:** direção de produto alinhada com o CEO (22/07/2026), validada
> contra as [docs oficiais do Cursor](https://cursor.com/docs/cloud-agent)
> (Cloud Agents / ex–Background Agents).  
> **Este doc manda** quando houver tensão com auditorias, roadmaps ou notas
> históricas. Não é spec de implementação.

---

## Definição

**Work4You = UM produto, mesmas funcionalidades, em superfícies diferentes.**

| Superfície | Papel |
|------------|--------|
| **Nuvem** | O coração **24/7**. Agentes/subagentes rodam lá, independente do PC do usuário estar ligado (igual Cloud Agents do Cursor: VM na nuvem — “feche o notebook e veja depois”). Vale para **todo** usuário. |
| **Web** | Janela para essa nuvem. **Sem** execução local. |
| **Desktop** | Poder **local** (arquivos, terminal, offline) + **ponte** para a nuvem (lançar/acompanhar os agentes 24/7). Mapeia no “Local Agent × Cloud Agent” do Cursor. |

Superfícies do **mesmo produto**, **não** espelhos.  
A unificação é no **runtime** (um backend de agentes na nuvem, compartilhado), **não** no código da UI.

### Histórico e superfícies

- Desktop **pode** carregar / acompanhar histórico da **nuvem** (já há “Executar na nuvem” / `run=cloud`).
- Web **não** precisa (nem deve) carregar histórico do desktop — na web nada roda local.

### O que faz ser “um produto”

O runtime **24/7 na nuvem** alcançável de todas as superfícies — não a igualdade pixel a pixel das UIs.

---

## O que isso mata (não perseguir)

- Espelhar web e desktop pixel a pixel.
- Pacote `@wayne/ui` “build grande” como resposta à convergência — a UI do produto **já é uma só** (`wayne-agent/web` → `web_dist`; o desktop-shell reusa esse bundle). A premissa da Fase 10 §9 da auditoria era sobre `apps/desktop` (renderer Hermes), **removido** em `f9cad21` → **morta**.
- Transformar o desktop em “janela pro site” (perde o poder local). Escape `W4Y_CLOUD_SHELL=1` existe; **não** é o default nem a estratégia.

---

## O que é verdade hoje

- **UI já unificada** (`web_dist` compartilhado) = bônus de manutenção. Manter.
- A UI **pode divergir por superfície** onde fizer sentido (ex.: desktop mostra arquivos locais; web não). Continua um produto porque o que une é o runtime na nuvem.
- Desktop real = `wayne-agent/apps/desktop-shell` (casca Electron + motor local). Ver [BACKEND-MAP.md](./BACKEND-MAP.md) (“UMA UI SÓ”).
- Cloud dashboard = Fly `wayne-w4y`. Landing/billing = Cloud Run `w4y-web`. Ver [ARQUITETURA.md](./ARQUITETURA.md) v5.

### Benchmark Cursor (docs oficiais — o que usamos)

1. Cloud Agents **continuam** na nuvem com o app/laptop fechados.
2. Desktop e **cursor.com/agents** são entradas **de primeira classe** no mesmo backend de cloud agents (não “web = espelho do desktop”).
3. Docs **não** exigem um único codebase de UI; exigem **mesmo backend**. Nossa unificação de `web_dist` é vantagem nossa, não requisito do espelho Cursor.

---

## Duas trilhas que fluem daqui

### Trilha 1 — Ponte Cloud Agents no desktop (**valor**)

Desktop lança/acompanha agentes 24/7 na nuvem, mantendo o motor local para o que é local.  
Base S1/S2 já existe. **Ok CEO 22/07:** construir (1) paridade sessão-nuvem + (2) copy “neste PC vs nuvem 24/7”. Hand-off mid-session (#5) depois.

### Trilha 2 — Sincronia de UI (**higiene**, menor)

Trilho de release único (deploy Fly + engine ZIP no mesmo ciclo) + idealmente patch **UI-only** leve. Higiene separada — não bloqueia a Trilha 1.

---

## Já existe na ponte (evidência)

| Peça | Onde |
|------|------|
| Seletor Local × Nuvem | `RunTargetPicker`, `cloudRunAvailable()` |
| Sessão na nuvem na mesma SPA | `runTarget=cloud` / `?run=cloud` → WS ticketado |
| Bridge na casca | `w4y:cloud:wsUrl`, `w4y:cloud:api` |
| Recentes + Agenda mesclados (S2) | sidebar + CronPage |
| Mutações nuvem (0.3.5+) | `canMutate` + `cloudMutateJson` |

Detalhe: [BACKEND-MAP.md](./BACKEND-MAP.md) (S1 / S2 / 0.3.5).

---

## Decisões comerciais e de custo (CEO, 22/07/2026)

### #3 — Gating por plano (24/7 na nuvem = pago, em camadas)

| Camada | Comportamento |
|--------|----------------|
| **Trial** | Agente na nuvem **visível** (não esconder). **Pausa** quando o usuário sai (sem keep-alive). Prova a feature e bate no muro no momento de valor (“seu agente pausou — assine pra manter 24/7”). |
| **Pago (entrada)** | Agentes **24/7 agendados** (dorme e acorda). |
| **Premium** | Canais **sempre-conectados** (WhatsApp / Slack socket vivo) = tier de máquina sempre-ligada. |

### #4 — Suspend vs sempre-vivo

- **Default continua** `auto_stop_machines=suspend` + `min_machines_running=0`. **Não** ligar máquina sempre para todo tenant pago.
- **24/7 agendado** → suspend + **wake na hora** (Cloud Scheduler → acorda → roda) → paga o run, não custo fixo.
- **Sempre-ligado** (`min=1`, ~US$11/mês) → **só** tier premium de canal sempre-conectado; custo coberto pelo preço do premium.

### Verificação wake (obrigatória — não assumir pronto)

Com suspend, o scheduler de cron do Wayne roda **in-process** e congela com a máquina. Precisa de HTTP de entrada (ou job externo) para acordar.

**Status 22/07 (verificado):** job GCP `wayne-cron-wake` está **LIVE** — `*/15 * * * *` UTC → `GET https://wayne-w4y.fly.dev/api/auth/providers` (rota pública). Acorda a máquina e o ticker faz **catch-up** de jobs atrasados.

**Ainda GAP para “24/7 agendado pronto”:**
- Não é na hora exata (até ~15 min de atraso + tick ≤60s).
- Crons de alta frequência (ex. a cada 5 min) colapsam misses em um único fire.

**IaC (fantasma morto):** `platform/infra/wake-cron.ps1` reproduz o job vivo
(idempotente). Não roda no deploy — só DR/recreate.

→ Caminho barato = **PARTIAL** (wake existe; pontualidade/produto ainda não). Ver [BACKEND-MAP.md](./BACKEND-MAP.md).

### #5 — Hand-off local → nuvem mid-session

Depois (fora do escopo aprovado agora).

---

## Docs relacionados (e o que ficou obsoleto)

| Doc | Papel |
|-----|--------|
| Este arquivo | Estrela-guia de produto |
| [BACKEND-MAP.md](./BACKEND-MAP.md) | Fatos verificados: UMA UI SÓ, ponte S1/S2, GAP wake |
| [ARQUITETURA.md](./ARQUITETURA.md) | Onde roda cada superfície (v5) |
| [AUDITORIA-PRODUTO-WORK4YOU.md](./AUDITORIA-PRODUTO-WORK4YOU.md) Fase 10 §9 / PR-DESKTOP | **OBSOLETO** — premissa `apps/desktop` morta |
| `wayne-agent/AGENTS.md` (§ Electron) | Aponta para desktop-shell + este doc |
