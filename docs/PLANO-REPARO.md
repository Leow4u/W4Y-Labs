# Plano de reparo Work4You

Premissas: núcleo Hermes (**A**) não se reescreve; plataforma (**C**) se endurece; desperdício **B/D** se simplifica ou se funde de volta ao upstream. CEO sem ritual manual — gates automáticos + report.

Referências: [`NATIVO-VS-CONSTRUIDO.md`](./NATIVO-VS-CONSTRUIDO.md) · [`PLATAFORMA.md`](./PLATAFORMA.md).

---

## Decisão 0 — Desktop (travada)

**Escolhida: D0-B — Adaptar o desktop Hermes como base da casca.**

| | |
|---|---|
| **O quê** | Partir de `apps/desktop` do upstream (Hermes), encaixar só o que é W4Y: login Work4You, bridge conta, motor ZIP/slots, canais de update GCS |
| **Por quê** | O fork excluiu o desktop nativo e reconstruiu `desktop-shell` (**B**). Com D0-B a casca volta a ser linhagem upstream + deltas W4Y — não um segundo produto paralelo |
| **Clarificação** | D0-B **não** “elimina o upstream”. Faz o contrário: **passa a usar** o desktop nativo que estava de fora. O que some com o tempo é o paralelo `desktop-shell` (e a dívida B), não o Hermes. Runtime (gateway, agent, web dashboard) já é A. Depois do port, o que sobra como construção nova é sobretudo **C** (plataforma, ZIP, billing, Composio, shells PME) |

**Fora de escopo nesta quinzena:** reescrever agent core; nova state-machine de update; experimentos (`PLANO-MESTRE-*`, `model-experience-poc/`, `w4y-studio/`).

---

## Push automático (trilho de release)

Cada fase que fecha com gates verdes **commita e faz push** para o remote da branch de trabalho (sem pedir de novo).

| Momento | Ação |
|---|---|
| Fim de cada fase (1–5) | `git push -u origin HEAD` (ou push da branch já tracking) |
| Deploy | Fly + canal UI (+ engine ZIP só se motor mudou), como hoje |
| Proteções | Sem `--force` em `main`/`master`; sem pular hooks; sem push de secrets (`.env`) |
| Report | Após push: URL da branch/PR se houver, commits, versões no ar |

Branch de trabalho: `integ/billing-merge` (ou `fix/reparo-plataforma` se bifurcarmos — uma por vez).

---

## Fases

### Fase 0 — Spike D0-B (dias 0–3) ← **agora**

**Objetivo:** mapa honesto Hermes `apps/desktop` × W4Y `desktop-shell` + go/no-go de encaixe.

#### 0.1 Mapa (evidência — spike 2026-07-22)

| Superfície | Hermes `apps/desktop` (`hermes-upstream@65372395`) | W4Y `desktop-shell` 0.3.18 | No port D0-B |
|---|---|---|---|
| **Forma do app** | Electron + **renderer React próprio** (Vite, `@assistant-ui`, stores) | Electron **fino** + `loadURL` no `web_dist` do motor (mesmo SPA do cloud) | **Manter modelo W4Y de conteúdo** (um SPA = web_dist). Trazer do Hermes a **casca Electron** (janela, pack, hardening, probes), não o segundo chat React |
| **Backend** | Spawna `hermes serve` / dashboard a partir de install git/pip local | Baixa **engine ZIP**, venv/slots, spawna Wayne local | **C W4Y obrigatório** — Hermes não tem ZIP/slots |
| **Login** | OAuth/dashboard token no fluxo Hermes | Janela `work4you.ai/login` + `POST /device/engine-key` + Composio bootstrap | **C W4Y obrigatório** |
| **Update** | Git / `hermes update` — **só se `.git`** (`main.cjs:1913`) | electron-updater (casca) + `latest.json` ZIP + `ui-latest` | Substituir git-only pelo feed GCS; **reusar** padrões de chip/relaunch/boot do Hermes, **sem** nova state-machine |
| **Bridge conta** | Não (sim produto SaaS) | `w4y:cloud:wsUrl` / `w4y:cloud:api` | **C W4Y obrigatório** |
| **Packaging** | electron-builder maduro + testes `test:desktop:*` | NSIS simples `dist:win` | **Reusar** pipeline/testes Hermes |
| **Git/fs/worktree** | Módulos electron cobertos por teste | Já portados em parte no shell | Alinhar 1:1 com Hermes |

#### 0.2 Deltas W4Y que entram no desktop Hermes (obrigatórios)

1. Login Work4You + engine-key + connector-bootstrap  
2. Resolução/install do motor via ZIP + slots + venv reuse  
3. `loadURL` → dashboard do motor (`web_dist`), não o renderer chat Hermes como UI primária  
4. Bridge `w4y:cloud:*` (um cérebro)  
5. Update: GCS (shell/engine/UI) no lugar de git-only — trilho mínimo  

#### 0.3 O que o Hermes desktop já resolve (não reinventar)

Packaging multi-OS, boot progress, backend probes/ready/env, window state, hardening, update relaunch/marker patterns, suite de testes electron, resolução de runtime.

#### 0.4 Ordem de PRs (Fase 5)

1. Restaurar `apps/desktop` no tree Wayne (from upstream, rename hermes→wayne onde couber)  
2. Trocar spawn “serve from git install” → boot ZIP/slots W4Y + `loadURL` web_dist  
3. Login Work4You + engine-key  
4. Bridge cloud  
5. Update GCS (shell/engine/UI) — simples  
6. Deprecar `desktop-shell` (stop-ship features; doc; depois remover)

#### 0.5 Go/no-go

**GO D0-B.** Viável: o desalinhamento real é **conteúdo** (Hermes = chat React próprio; W4Y = SPA dashboard) e **distribuição** (git vs ZIP). Estratégia: casca Electron Hermes + conteúdo/distribuição W4Y.  
Fallback D0-A só se o PR1 (árvore desktop no monorepo) bloquear build por mais de 3 dias.

| Entrega | Critério |
|---|---|
| Mapa de superfícies | ✅ seção 0.1 |
| Deltas W4Y obrigatórios | ✅ seção 0.2 |
| O que Hermes já resolve | ✅ seção 0.3 |
| Plano de PRs | ✅ seção 0.4 |
| Go/no-go | ✅ GO D0-B |

---

### Fase 1 — Parar a sangria (dias 1–4, overlap com spike)

| # | Item | Pronto quando |
|---|---|---|
| 1.1 | Canal UI / CDN | Manifesto público = GCS; publish com `Cache-Control: no-store` |
| 1.2 | Chip plano desktop | Igual web quando logado |
| 1.3 | Inventário residual loopback | Call sites restantes via account/inventory |
| 1.4 | Chip update honesto | Sem sumir no meio; sem nova state-machine |

**Gates:** `npm run typecheck && npm run build` (web). **Push** + deploy UI/Fly se couber.

---

### Fase 2 — Updater mínimo (dias 3–7)

| Regra | Detalhe |
|---|---|
| UI | `ui-latest` → segundos, sem venv |
| Motor | ZIP só se mudou; reuse venv; `uv sync` se `uv.lock` mudou |
| Casca | No port D0-B: preferir adaptar o fluxo de update do desktop Hermes ao feed GCS/ZIP — **não** nova máquina de estados |
| Código | Bug = patch no trilho; proibido novo desired-store |

**Gates:** typecheck+build; script assert manifesto CDN=GCS. **Push** + deploy.

---

### Fase 3 — Um cérebro só (dias 5–10)

Defaults (CEO pode vetar depois): histórico na conta; projeto = registro conta + cwd opcional; conector = inventário conta.

Varredura `api.*` vs `accountApi`/`inventory`. Worker = FS/terminal/execução.

**Gates:** typecheck+build; commit web escopado. **Push** + deploy UI.

---

### Fase 4 — Cortar o D da UI (dias 8–12)

Manter: Chat, Entregas, Integrações, Agentes (Equipe), Agenda, Config lean.  
Recolher: workflow canvas / X-ray admin → `?full=1` ou fora da nav default.

**Gates:** typecheck+build. **Push** + deploy UI.

---

### Fase 5 — Port desktop Hermes (pós-spike, PRs pequenos)

Ordem sugerida (cada PR = push):

1. Trazer / restaurar árvore `apps/desktop` (ou submodule/worktree do upstream) sob branding W4Y mínimo  
2. Login Work4You + cookies/session (paridade com shell atual)  
3. Bridge `w4y:cloud:*` / um cérebro  
4. Motor ZIP + slots + boot (o C que o Hermes não tem)  
5. Update: GCS shell/engine/UI no lugar do git-only — **simples**  
6. Deprecar `desktop-shell` (doc + stop-ship de features nele)

**Gates:** pack Windows; asar contém bridge/ZIP paths; typecheck do renderer. **Push** por PR.

---

### Contínuo — endurecer C

Gates automáticos: Stripe/plan, provisioner/engine-key, bridge `/api/account/plan`, publish UI no-store. Paralelo leve; não bloqueia 0–4.

---

## Ritmo

```text
Dias 0–3   Fase 0 spike D0-B (+ sangria 1.x em paralelo se bloqueante)
Dias 1–4   Fase 1 sangria
Dias 3–7   Fase 2 updater mínimo
Dias 5–10  Fase 3 um cérebro
Dias 8–12  Fase 4 cortar D UI
Semana 2–4 Fase 5 port desktop (PRs), conforme go do spike
```

Cada fase: gates verdes → commit escopado → **push** → deploy se aplicável → report (commits, versões, o que ficou de fora).

## Definição de “reparado”

1. UI update &lt; ~30s no desktop logado; motor raro e curto.  
2. Plano + inventário iguais web/desktop logado.  
3. Chat/cron/canais/sessão (A) sem regressão óbvia.  
4. Casca = linhagem desktop Hermes + deltas W4Y; `desktop-shell` em depreciação.  
5. Construções novas restantes são **C** (plataforma/ZIP/billing/Composio/PME), não um segundo desktop paralelo.
