# Nativo × Construído — auditoria independente

Auditoria só-leitura: quanto do Work4You **já existia** no upstream Hermes vs o que foi reconstruído, estendido ou criado do zero.

**Objetivo:** verdade com evidência de código — sem lealdade a decisões passadas, docs internos ou quem construiu. Docs podem estar errados; a evidência final é o repositório.

## Referência da comparação

| | |
|---|---|
| **Upstream** | Clone local `C:\DEV\hermes-upstream` |
| **Commit** | `65372395eb2975152727013ad1df6977745f52f4` |
| **Versão** | Hermes Agent **0.18.2** (`hermes_cli/__init__.py:17`, release `2026.7.7.2`) |
| **Fork** | `wayne-agent/` (+ `platform/`) — rename Hermes→Wayne, 2026-07-03 (`wayne-agent/FORK-NOTES.md:3–6`) |
| **Data da auditoria** | 2026-07-22 |

## Legenda de vereditos

| Código | Significado |
|---|---|
| **A** | Nativo e reusado (correto) |
| **B** | Nativo mas reconstruído/duplicado (desperdício) |
| **C** | Não-nativo, construído e necessário (novo legítimo) |
| **D** | Não-nativo, construído mas desnecessário/inflado (desperdício de outro tipo) |

---

## 1. Tabela (capacidade × veredito)

| Capacidade | (1) Upstream TEM? | (2) Work4You fez | (3) Veredito | (4) Desperdício se B/D |
|---|---|---|---|---|
| **Gateway + API + dashboard SPA** | **SIM.** Gateway `gateway/run.py`; API `gateway/platforms/api_server.py`; FastAPI dashboard `hermes_cli/web_server.py:117` (`WEB_DIST`), SPA `web/` → `hermes_cli/web_dist` (`web/vite.config.ts`), rotas `web/src/App.tsx:133-153` | **Reusou** o tronco (rename). Overlay Fly só troca `web_dist`. Casca Next.js `platform/web` é outra superfície | **A** (runtime web); **C** (landing Next.js) | — |
| **Multi-sessão / `session_key` / profiles** | **SIM.** `gateway/session.py:870+` `build_session_key`; profiles `hermes_cli/profiles.py` | **Reusou** (Wayne). Isolamento de *sessão* ≠ isolamento de *cliente* | **A** | — |
| **Multi-tenant / conta / billing / chave por tenant / provisioner** | **NÃO** como SaaS. Há auth local do dashboard + billing/créditos do *Nous Portal* (`hermes_cli/nous_billing.py`), não Stripe multi-tenant | **Criou do zero** `platform/` (Stripe, registry, provisioner, router `fly-replay`, `device/engine-key`) | **C** | — |
| **UPDATER (linha crítica)** | **SIM, nativo git/`hermes update`.** CLI `hermes_cli/subcommands/update.py:17-20`; API `POST /api/hermes/update` `web_server.py:3306`; desktop **só em git checkout** `apps/desktop/electron/main.cjs:1913`, aplica via `hermes update` (~2216-2250). **Não** há `electron-updater` / `latest.json` | **Desligou** o nativo (`FORK-NOTES.md:24-27`; `wayne_cli/subcommands/update.py:17-27` — correto p/ não puxar Nous). **Construiu outro sistema:** `shell-updater.cjs` (electron-updater→GCS), engine ZIP + `latest.json`, `ui-update.cjs`, chip/`unified-check`. Distribuição ZIP ≠ git — o nativo **não cobria** o modelo W4Y | **C** (canal ZIP/exe necessário) + **D** (máquina de estados do chip/slots/venv — overbuild) | **D ≈ 15–25 dias** de churn (preparing/pending, 4 min venv, falhas de chip). **Não é B puro:** o updater Hermes *não* atualiza motor ZIP em máquina de cliente |
| **Desktop Electron** | **SIM.** `apps/desktop/` completo (Electron + React + nanostores + update store `apps/desktop/src/store/updates.ts`) | Fork **excluiu** `apps/desktop` de propósito (`FORK-NOTES.md:13`). Depois **construiu** `apps/desktop-shell` (motor local, bridge, updaters). Reusou só padrões/módulos pontuais (git/fs) | **B** (casca/chat desktop refeitos em vez de forkar `apps/desktop`) + **C** (bootstrap ZIP+venv + bridge conta) | **B ≈ 20–35 dias** de shell/UI Electron que poderiam ter partido do desktop Hermes e sido adaptados. O motor-local ZIP ainda seria C (~10–20 dias) |
| **Motor local no cliente (ZIP+venv/slot)** | **NÃO** nesse formato. Distribui via `scripts/install.sh`, pip/pipx/uv/git (`hermes update`) | **Criou** `platform/wayne-fly/build-engine-zip.ps1`, `scripts/install.ps1`, slots em `%LOCALAPPDATA%\wayne\e\…` | **C** | — |
| **Sessões / histórico / projects** | **SIM.** Sessions API + `SessionsPage`; projects `hermes_cli/projects_db.py`; pins no desktop Hermes | **Reusou** store/API; UI “Entregas”/sidebar é camada de produto | **A** + **C** (curadoria Entregas) | — |
| **MCP** | **SIM.** `hermes mcp`, `McpPage`, catalog | **Reusou** | **A** | — |
| **Composio (conectores OAuth PME)** | **NÃO** como produto (MCP genérico sim) | **Criou** marketplace + provision Composio + `web_server` REST — por cima do MCP nativo | **C** | — |
| **Canais Telegram/Slack/WhatsApp/Discord** | **SIM.** `plugins/platforms/*` | **Reusou** (+ UI Canais) | **A** | — |
| **Cron / skills / memória** | **SIM.** `cron/`, `skills/`, `plugins/memory/` + páginas dashboard | **Reusou** (Agenda/Skills reskin) | **A** | — |
| **Auth login / planos / Stripe / plataforma** | Auth dashboard local **SIM**; Stripe SaaS / planos Work4You **NÃO** | **Criou** `platform/web` login+planos+Stripe+webhook | **C** | — |
| **UI React: telas** | Hub técnico: Sessions, Files, Cron, Skills, MCP, Channels, Profiles, Config, Chat TUI embutido (`App.tsx:133-153`) | **Reskin + shells de produto** em cima do mesmo SPA: Agentes/Equipe/Governança, Integrações, Entregas, NativeChat, bridge conta (`wayne-agent/web/src/App.tsx` ~177-301). Não reconstruiu o servidor SPA do zero | **A** (base) + **C** (IA PME) + **D** parcial (canvas/workflow/admin X-ray densos) | **D ≈ 10–20 dias** em superfícies “enterprise X-ray” pouco usadas na jornada PME |
| **TUI / gateway messaging / agent loop** | **SIM** (núcleo do produto Hermes) | **Reusou** (rename) | **A** | — |

---

## 2. Resumo executivo

### A conta, sem drama e sem absolvição

A acusação **“a estrutura web já existia”** está **certa no núcleo**: gateway, API, dashboard React, sessões, profiles, MCP, canais, cron, skills, memória — **já estavam no Hermes 0.18.2** e o fork **reusou** (veredito **A**). Isso não é opinião de doc; está em `web/`, `hermes_cli/web_server.py`, `gateway/`, `plugins/platforms/`.

O que **não** existia no upstream e **precisa** existir para o produto Work4You (**C**):

- Multi-tenant Fly + provisioner + router de sessão
- Stripe / planos / registry
- Motor **ZIP por máquina** + canais de update para exe/ZIP/UI (o update nativo é **git/`hermes update`**, e o desktop Hermes **recusa** update fora de checkout git — `apps/desktop/electron/main.cjs:1913`)
- Composio como catálogo PME
- Casca Next.js (landing/login)

### Onde houve desperdício real

1. **Desktop (B) — maior buraco estrutural**  
   O fork **deixou de fora** o Electron Hermes (`FORK-NOTES.md:13`) e **depois reconstruiu** `desktop-shell`. Parte do trabalho (janela, preload, packaging, UX de update) **já existia** em `apps/desktop/`.  
   **Estimativa: ~20–35 dias** que poderiam ter sido adaptação, não greenfield.  
   *Caveat honesto:* o desktop Hermes não entrega motor ZIP local; isso seria trabalho novo de qualquer forma (~10–20 dias).

2. **Updater (D, não B puro) — maior buraco de dor recente**  
   Desligar `wayne update` para não puxar Nous foi **correto** (`FORK-NOTES` / `wayne_cli/subcommands/update.py`).  
   Construir feed GCS + ZIP + UI-only é **necessário** para o modelo de distribuição escolhido (**C**).  
   O desperdício está na **complexidade da máquina de estados** (chip preparing/pending, slots, venv de 4 min, idas e vindas) — overbuild em cima de um problema que pedía canal simples.  
   **Estimativa: ~15–25 dias** de churn.

3. **UI produto (D parcial)**  
   Shells Agentes/Integrações/Entregas são **C** legítimo para PME.  
   Camadas densas tipo workflow canvas / X-ray admin em cima do que o usuário não usa na jornada principal: **D ≈ 10–20 dias**.

### O que **não** foi “reconstruir o Hermes”

- Não reinventaram o loop do agente, gateway, tools, cron, skills, memória.
- Não inventaram “sessão” — inventaram **conta/tenant/billing**.
- Docs internos (ex.: `docs/ARQUITETURA.md` §5.1) acertam o *disable* do self-update; erram se forem lidos como “Hermes não tinha update nenhum” — **tinha**, só que **outro contrato** (git/fonte).

### Totais (ordem de grandeza)

| Classe | Peso no esforço do produto | Notas |
|---|---|---|
| **A — reuso correto** | Maior fatia do `wayne-agent` runtime | Coração Hermes, rename |
| **C — novo legítimo** | `platform/` + ZIP/motor + Composio + shells PME | Obrigatório pro negócio |
| **B — nativo mas reconstruído** | Desktop shell vs `apps/desktop` | **~20–35 dias** |
| **D — inflado** | Updater state-machine + UI X-ray | **~25–45 dias** somados |

**Maiores desperdícios nomeados:** (1) desktop reconstruído em vez de forkar Hermes desktop; (2) over-engineering do updater custom depois de desligar o nativo certo-mas-incompatível.
