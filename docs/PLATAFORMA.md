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
Já existe base S1/S2 (“Executar na nuvem”, bridge WS/REST, merge de Recentes/Agenda).  
**Plano curto e gaps:** ver seção abaixo — **construção só após ok do CEO**.

### Trilha 2 — Sincronia de UI (**higiene**, menor)

Trilho de release único (deploy Fly + engine ZIP no mesmo ciclo) + idealmente patch **UI-only** leve (evitar re-mandar o motor Python a cada mudança de tela — risco de “motor local não subiu”).  
Não é o que define o produto; é disciplina de distribuição.

---

## Trilha 1 — plano curto (aguardando ok do CEO)

### Já existe (evidência)

| Peça | Onde |
|------|------|
| Seletor Local × Nuvem no composer | `RunTargetPicker`, `cloudRunAvailable()` — só desktop motor-local + bridge |
| Sessão na nuvem na mesma SPA | `runTarget=cloud` / `?run=cloud` → WS ticketado |
| Bridge na casca | `w4y:cloud:wsUrl`, `w4y:cloud:api` (`desktop-shell/main.cjs`, `web/src/lib/cloudSession.ts`) |
| Login → cookies → mint ticket | fluxo Entrar com Work4You / gate |
| Recentes + Agenda mesclados (S2) | sidebar + CronPage; criação de rotina → nuvem por padrão (24/7) |
| Mutações nuvem (0.3.5+) | rename/archive/delete sessão; edit/delete rotina (`canMutate`) |

Contratos e degradações: [BACKEND-MAP.md](./BACKEND-MAP.md) (blocos S1 / S2 / 0.3.5).

### O que ainda falta / está degradado (candidatos — priorizar com CEO)

1. **Paridade de sessão-nuvem no chat** — itens ainda “degradados” desde S1: ModePicker/TaskHeaderActions, visão de imagem, dock git/Files/projeto, espectador de subagente só-local, etc.
2. **Clareza de produto** — copy/UX que distinga “neste PC” vs “na nuvem 24/7” (sem parecer dois produtos).
3. **Gating comercial** (se aplicável) — hoje o seletor é capability da casca (`cloudRunAvailable`), não plano Stripe; decidir se Cloud Agents no desktop é free/Pro/Business.
4. **Confiabilidade 24/7 do tenant** — Fly `autostop=suspend` vs cron/agentes sempre-vivos (decisão de custo já anotada no BACKEND-MAP; afeta a promessa, não só a UI).
5. **Hand-off explícito** local → nuvem no meio da tarefa (hoje a escolha trava na 1ª mensagem) — só se o CEO quiser paridade com o handoff Cursor.

### Esforço estimado (ordem de grandeza)

| Fatia | Esforço | Nota |
|-------|---------|------|
| Inventário + AC da “paridade sessão-nuvem” | P | Lista fechada a partir do BACKEND-MAP S1 degradado |
| Fechar lacunas de UI/bridge já mapeadas | M | Incremental sobre S2 |
| Gating plano + copy | P | Se decisão comercial existir |
| Hand-off mid-session / multi-agent cloud rich | G | Só com ok explícito |

**Não construir** Trilha 1 além de doc/investigação até o CEO priorizar a fatia.

---

## Docs relacionados (e o que ficou obsoleto)

| Doc | Papel |
|-----|--------|
| Este arquivo | Estrela-guia de produto |
| [BACKEND-MAP.md](./BACKEND-MAP.md) | Fatos verificados: UMA UI SÓ, ponte S1/S2, updates |
| [ARQUITETURA.md](./ARQUITETURA.md) | Onde roda cada superfície (v5) |
| [AUDITORIA-PRODUTO-WORK4YOU.md](./AUDITORIA-PRODUTO-WORK4YOU.md) Fase 10 §9 / PR-DESKTOP | **OBSOLETO** — premissa `apps/desktop` morta |
| `wayne-agent/AGENTS.md` (§ Electron `apps/desktop`) | **OBSOLETO** no fork W4Y — apontar para desktop-shell + este doc |
