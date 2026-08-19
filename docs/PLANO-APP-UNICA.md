# Work4You — Plano app única (web + desktop)

> **Status:** plano de execução activo (ago/2026).  
> Substitui `PLANO-REPARO.md` e qualquer doc em `docs/arquivo/`.  
> Produto: [`PRODUTO.md`](./PRODUTO.md). Superfícies: [`PLATAFORMA.md`](./PLATAFORMA.md).

---

## Norte

**Uma UI de produto** (`apps/work4you`), **dois sítios onde corre** (browser + Electron), **um motor Python** com **CLI, TUI, gateway e terminal** intactos, **Fly = computador na nuvem** por utilizador, **`platform/web` = só plataforma** (login, billing, SEO).

Modelo Claude/Cursor: browser e desktop são **first-class**; a unificação é **mesmo bundle React + mesmo tenant cloud**, não duas árvores UI.

---

## Arquitectura alvo

```
work4you.ai              platform/web          login · billing · onboarding
app.work4you.ai          apps/work4you (web)   mesma SPA que Electron
Electron (com.work4you)  apps/work4you (electron) + PTY/git/fs local
work4you / --tui / gateway                     motor Python
wayne-{slug}.fly.dev     tenant Fly + volume   motor + gateway + SPA estática
```

---

## PR backlog (ordem de merge)

| ID | PR | Trilha |
|----|-----|--------|
| A1 | docs PLANO + PLATAFORMA + apagar arquivo | A |
| A2 | gitignore artefactos | A |
| A3 | BACKEND-MAP + INVENTARIO + AGENTS | A |
| A4 | dead code ui-latest / IPC distribution | A ✅ |
| B1 | adapter types + ProductRuntime | B |
| B2 | createRuntime() factory | B |
| B3 | electron adapter (IPC) | B |
| B4 | browser adapter | B |
| B5 | vite.config.web + build:web | B |
| B6 | motor serve app_dist (spike) | B |
| B7 | eslint no electron em src partilhado | B |
| C1 | shared: plans + relay-free-model | C ✅ (relay-free-model; plans helpers ficam no renderer — fetchers usam bridge desktop) |
| C2 | tabela paridade INVENTARIO | C |
| C3–C4 | portar gaps web → desktop | C ✅ (aceites: achievements, docs in-app, plugin tabs) |
| C5 | terminal browser (PTY remoto) | C ✅ (`/api/pty` WS no browser + pane terminal) |
| C6 | auth browser SSO | C ✅ |
| D1 | dashboard Python → app_dist | D ✅ |
| D2 | apagar wayne-agent/web | D ✅ |
| D3 | remover publish-ui pipeline | D ✅ |
| D4 | Fly Dockerfile app_dist | D ✅ |
| E1 | redirect login → app.work4you.ai | E ✅ |
| E2 | DNS/LB app subdomain | E ✅ |
| E3 | marketing /baixar desktop + web | E ✅ |
| E4 | provisioner bundle version | E ✅ |
| F1–F4 | desktop cloud-first + Conta | F ✅ |
| G1–G6 | billing + tenant hardening | G ✅ |
| H1–H4 | 24/7 wake + premium | H ✅ |
| I1 | rename apps/desktop → apps/work4you | I ✅ |
| I2 | handoff local ↔ cloud mid-session | I ✅ (nova sessão + transcript; chip run-target) |
| I3 | deprecate ui-latest.json no bucket | I ✅ |

**Milestones:** M1 pós-B6 (spike browser) · M2 pós-D2 (web apagada) · M3 pós-E2 (prod browser) · M4 pós-F3+G3.

---

## Fase L0 — REVOGADA (18/08/2026)

L0 congelava o browser e punha o motor no PC. Isso **não** é o produto.
Norte vigente: [`PLANO-CLAUDE-V1.md`](./PLANO-CLAUDE-V1.md).

O texto abaixo fica só como histórico do que **não** se volta a fazer.

<details>
<summary>Texto L0 (caduco — não executar)</summary>

## Fase L0 — Lançamento desktop-first (ago/2026) [CADUCO]

> **Objectivo:** primeiros ~50 utilizadores só na **app instalada**; site = conta + billing + download.  
> **Flag:** `W4Y_LAUNCH_MODE=desktop` (+ `W4Y_SHARED_MOTOR=0`, `W4Y_APP_SUBDOMAIN=0`).  
> **Deploy:** `platform/infra/deploy-web.ps1 -LaunchDesktop`

### O que fica live (site)

| Rota | Papel |
|------|--------|
| `work4you.ai` | Landing, `#install`, marketing |
| `/login`, `/device` | Conta + handoff para app desktop (`/device/engine-key`) |
| `/planos`, `/instancias`, Stripe | Billing e gestão |
| `/baixar` | Redirect → `/#install` |

### O que congela (não expor a utilizadores)

| Item | Motivo |
|------|--------|
| `app.work4you.ai` → chat browser | Isolamento multi-tenant + paridade ainda instável |
| Motor partilhado `wayne-w4y` para Free | Complexidade; desktop usa motor **local** |
| SSO `/login/enter` → SPA cloud | Redirecciona para `/baixar` em L0 |
| Provision Fly por signup Free | Registo cria conta + chave OR; `instances.status=desktop` |

### Fluxo utilizador L0

1. Registo/login no site → `/baixar` (ou `/device` se veio da app).
2. Instala Work4You (GCS `latest.yml`).
3. Login na app → browser em `work4you.ai/login?next=/device` → chave injectada.
4. Motor local **já empacotado no instalador** (CPython + `.venv`); first-run
   só extrai — sem `uv sync` na máquina do utilizador. Sessões em `~/.work4you/`.

### Checklist — pronto para 50 utilizadores

- [ ] `deploy-web.ps1 -LaunchDesktop` em produção
- [ ] Casca publicada GCS (versão em `product-download.ts` + `/baixar`)
- [ ] Motor ZIP + `latest.json` alinhados com renderer (`build:web` se UI mudou)
- [ ] Smoke: signup novo → `/baixar` → instalar → login app → chat local
- [ ] Smoke: plano pago Stripe → `/instancias` (sem botão browser em L0)
- [ ] Suporte: `contato@work4you.ai` + playbook “só app desktop nesta fase”

### Saída de L0 (Fase 2) — caduco

Claude v1 revogou L0 e o motor partilhado. Browser + app usam Fly **dedicada**
`wayne-<slug>` (`W4Y_SHARED_MOTOR` nunca volta a ser caminho de cliente).

</details>

---

## Apagar (lixo legado)

| Item | Quando |
|------|--------|
| `docs/PLANO-REPARO.md`, `docs/arquivo/` | A1 ✅ |
| `wayne-agent/web/` | D2 ✅ |
| `publish-ui.ps1`, `build-ui-zip.ps1`, `ui-latest.json` | D3 ✅ |
| IPC `w4y:distribution:get` ui feed | A4 |
| Agent Studio UI/docs | já morto em PRODUTO |

---

## Definition of Done

- [x] Só existe uma árvore UI de produto (`apps/work4you`)
- [x] `npm run build:web` → `work4you_cli/app_dist/` servido no Fly
- [x] Browser e Electron partilham bundle; CLI/TUI/gateway inalterados
- [x] Signup → tenant Fly → chat no browser (fluxo wired; smoke prod manual)
- [x] Desktop logado: sessões cloud visíveis; Conta unificada (Trilha F — validar na app instalada)
- [x] Billing E2E: key inject + regime premium (contratos vitest ✅; smoke prod manual)
- [x] Zero refs activas a desktop-shell, ui-latest, wayne-agent/web (web apagada C6)

---

## Branch

Trabalho em `feat/app-unica`. PRs: `feat/app-unica/a1-docs`, etc.
