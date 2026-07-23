# Work4You — Definição de plataforma (estrela-guia)

> **Produto (Work + Agent Studio):** a fonte canónica é [`PRODUTO.md`](./PRODUTO.md)
> (23/07/2026). Alinhamentos de produto **anteriores** a esse doc são **LIXO**.
> Este ficheiro fica só para **superfícies técnicas** (nuvem / web / desktop Hermes).
> Em tensão de *o que é o produto*, manda `PRODUTO.md`.

> **Status (infra):** direção de superfície alinhada com o CEO (22/07/2026), **corrigida
> 22/07/2026 (noite)** — opção A: desktop = renderer Hermes.  
> Validada contra as [docs oficiais do Cursor](https://cursor.com/docs/cloud-agent)
> (Cloud Agents / ex–Background Agents).  
> **Não é spec de implementação de produto.**

---

## Definição

**Work4You = UM produto, mesmas funcionalidades, em superfícies diferentes.**

| Superfície | Papel |
|------------|--------|
| **Nuvem** | O coração **24/7**. Agentes/subagentes rodam lá, independente do PC do usuário estar ligado (igual Cloud Agents do Cursor: VM na nuvem — “feche o notebook e veja depois”). Vale para **todo** usuário. |
| **Web** | **Janela** para essa nuvem. Sem execução local. Superfície secundária — não é o app principal do produto no PC. |
| **Desktop** | **App principal no PC.** Linhagem Hermes `apps/desktop` (Electron + React nativo): poder local (arquivos, terminal, offline) + ponte para a nuvem 24/7. Base a melhorar (linguagem acessível PME), depois **Agent Studio**. |

Superfícies do **mesmo produto**, **não** espelhos pixel a pixel.  
A unificação é no **runtime** (backend de agentes na nuvem compartilhado), **não** em forçar o desktop a ser um `loadURL` do `web_dist`.

### Modelo mental de negócio (CEO — trilha correta)

> **Superseded:** ver [`PRODUTO.md`](./PRODUTO.md). O bloco abaixo é histórico.

1. **Base = Hermes** — capacidades + UI desktop nativa (`apps/desktop`).
2. **Dois produtos:** **Work** (Default) + **Agent Studio** (lista + connected) — não “Studio = canvas”.
3. **Deltas C** — login Work4You, Stripe/tenant, motor ZIP/slots, ponte nuvem, update GCS.

O desvio (`desktop-shell` + “UMA UI SÓ = web_dist”) foi atalho; **não** é a estrela-guia de superfície.

### Histórico e superfícies

- Desktop **pode** carregar / acompanhar histórico da **nuvem** (ponte Cloud Agents).
- Web **não** precisa (nem deve) carregar histórico do desktop — na web nada roda local.

### O que faz ser “um produto”

O runtime **24/7 na nuvem** alcançável de todas as superfícies — não a igualdade pixel a pixel das UIs.

---

## O que isso mata (não perseguir)

- Tratar `desktop-shell` + `web_dist` como UI definitiva do desktop.
- Feature nova no `desktop-shell` (stop-ship: só sangria até o port Hermes shipar).
- Espelhar web e desktop pixel a pixel.
- Transformar o desktop em “janela pro site” como default (`W4Y_CLOUD_SHELL=1` é escape, não estratégia).
- Nova state-machine de update; reescrever o agent core.

---

## O que é verdade / destino

| Hoje (transição) | Destino (estrela-guia) |
|---|---|
| Produção ainda no `apps/desktop-shell` + motor ZIP | App instalável = `wayne-agent/apps/desktop` (Hermes) + deltas W4Y |
| `web_dist` = SPA do dashboard (nuvem + shell legado) | Web continua como janela da nuvem; **não** é a UI primária do desktop |
| Notas “renderer Hermes morto” (Fase 10 §9 / f9cad21) | **OBSOLETAS** — renderer Hermes é a base de novo |

- Cloud dashboard = Fly `wayne-w4y`. Landing/billing = Cloud Run `w4y-web`. Ver [ARQUITETURA.md](./ARQUITETURA.md).
- Plano de execução: [PLANO-REPARO.md](./PLANO-REPARO.md).

### Benchmark Cursor (docs oficiais — o que usamos)

1. Cloud Agents **continuam** na nuvem com o app/laptop fechados.
2. Desktop e web são entradas **de primeira classe** no mesmo backend de cloud agents (não “web = espelho do desktop”).
3. Docs **não** exigem um único codebase de UI; exigem **mesmo backend**. O desktop Hermes React e o dashboard web podem divergir — o que une é a nuvem.

---

## Trilhas

### Trilha 1 — Restaurar desktop Hermes + deltas W4Y (**estrutura**)

Ver [PLANO-REPARO.md](./PLANO-REPARO.md): PR1 árvore → login/ZIP/bridge/update GCS → deprecar `desktop-shell`.

### Trilha 2 — Linguagem acessível PME (**produto**)

Passada de copy/nav/fluxo no renderer Hermes — não reinventar telas do zero.

### Trilha 3 — Agent Studio (**construção nova**)

Após base A+C estável. Spec de produto em [ROADMAP.md](./ROADMAP.md) §2 e [AGENT-STUDIO.md](./AGENT-STUDIO.md).

### Trilha 4 — Ponte Cloud Agents (**valor contínuo**)

Desktop lança/acompanha agentes 24/7 na nuvem, mantendo motor local. Hand-off mid-session depois.

---

## Já existe na ponte (evidência — shell legado / nuvem)

| Peça | Onde |
|------|------|
| Seletor Local × Nuvem | `RunTargetPicker`, `cloudRunAvailable()` (web_dist) |
| Sessão na nuvem | `runTarget=cloud` / `?run=cloud` → WS ticketado |
| Bridge na casca legada | `w4y:cloud:wsUrl`, `w4y:cloud:api` |
| Recentes + Agenda mesclados | sidebar + CronPage |
| Mutações nuvem | `canMutate` + `cloudMutateJson` |

Essas peças **migram** para o desktop Hermes na Fase de deltas W4Y; não são desculpa para manter o shell como produto.

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
| Este arquivo | Estrela-guia de produto (**opção A**) |
| [PLANO-REPARO.md](./PLANO-REPARO.md) | Execução do port desktop Hermes + sangria |
| [NATIVO-VS-CONSTRUIDO.md](./NATIVO-VS-CONSTRUIDO.md) | Auditoria A/B/C/D |
| [AGENT-STUDIO.md](./AGENT-STUDIO.md) | Próxima construção de produto |
| [BACKEND-MAP.md](./BACKEND-MAP.md) | Fatos verificados; trechos “UMA UI SÓ / renderer morto” = **legado** |
| [ARQUITETURA.md](./ARQUITETURA.md) | Onde roda cada superfície |
| [AUDITORIA-PRODUTO-WORK4YOU.md](./AUDITORIA-PRODUTO-WORK4YOU.md) Fase 10 §9 “apps/desktop morto” | **OBSOLETO** sob esta estrela |
| `wayne-agent/AGENTS.md` (§ Electron) | Atualizar apontando para `apps/desktop` |
