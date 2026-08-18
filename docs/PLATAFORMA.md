# Work4You — Superfícies técnicas

> **Produto:** [`PRODUTO.md`](./PRODUTO.md). **Norte v1:** [`PLANO-CLAUDE-V1.md`](./PLANO-CLAUDE-V1.md).  
> Histórico de PRs: [`PLANO-APP-UNICA.md`](./PLANO-APP-UNICA.md). Contratos: [`BACKEND-MAP.md`](./BACKEND-MAP.md).

---

## Definição

**Work4You = um produto visual, múltiplas portas de entrada ao mesmo motor.**

| Superfície | Onde | Papel |
|------------|------|--------|
| **App browser** | `app.work4you.ai` (SPA no tenant Fly) | Produto completo na nuvem — **first-class** |
| **App desktop** | Electron `apps/work4you` | **Mesma SPA** + pasta/git/PTY **no PC**; cérebro na Fly; update só casca |
| **Runtime cloud** | Fly `wayne-{slug}` + volume | Computador na nuvem 24/7 (cron, gateway, sessões) |
| **Plataforma** | `platform/web` (Cloud Run) | Login, Stripe, onboarding — **sem chat** |
| **CLI** | `work4you` | Power user, scripting, CI |
| **TUI** | `work4you --tui` | Terminal full-screen; embed no dashboard PTY |
| **Gateway** | `gateway run` | Telegram, Discord, Slack, … na VM cloud |

Browser e desktop partilham **o mesmo bundle React** (`apps/work4you`, futuro rename `apps/work4you`).  
CLI, TUI e gateway **mantêm-se** — não competem com a app visual; ligam ao **mesmo motor**.

---

## O que une o produto

1. **Conta Work4You** — plano, tenant, chave OpenRouter com teto.  
2. **Sessões na nuvem** — mesma lista no browser e no desktop (modo cloud).  
3. **Motor Python** — tools, skills, conectores, cron (waist estreito).  
4. **VM por utilizador** — Fly + `/opt/data` (config, sessões, projetos).

Desktop **é o corpo no PC**: abrir pasta, git, PTY — a Fly **manda** nessas mãos.
Browser usa o disco da VM (cron, canais, 24/7). A pasta do Windows **não** é v2.

---

## URLs

| URL | Serve |
|-----|--------|
| `work4you.ai` | Landing, `/precos`, `/login`, `/planos`, `/baixar` |
| `app.work4you.ai` | App de produto (SPA) → fly-replay para tenant |
| Tenant Fly | Motor + gateway + ficheiros estáticos da SPA |

---

## Benchmark: Claude Desktop (não Cursor)

- Cérebro na nuvem; **pasta no PC desde o dia 1**.  
- Web e desktop = a mesma conta; o desktop **não** é um segundo Hermes no disco.  
- CLI/extensão VS Code: **depois** deste v1.  
- Lançamento = download novo em `/baixar`, não chip sobre instalação antiga.

---

## Gating por plano (nuvem)

| Plano | Fly |
|-------|-----|
| Grátis / Essencial | `suspend`, min=0 — wake agendado |
| Plus / Max (premium) | min=1, canais always-on |

Detalhe billing: [`BILLING-ARQUITETURA.md`](./BILLING-ARQUITETURA.md).

---

## O que não fazer

- Duas árvores React de produto (`wayne-agent/web` removida + `apps/work4you` única).  
- Chat no Next.js `platform/web`.  
- Desktop como `loadURL` de site externo por defeito.  
- Segunda app Electron ou segundo feed GCS.  
- Reescrever o motor Python para unificar UI.  
- Instalar CPython/ZIP no first-run.  
- Adiar “abrir pasta no PC” para uma v2.

---

## Docs vivos

| Doc | Conteúdo |
|-----|----------|
| [`PLANO-CLAUDE-V1.md`](./PLANO-CLAUDE-V1.md) | Norte v1 — não desviar |
| [`PLANO-APP-UNICA.md`](./PLANO-APP-UNICA.md) | PRs históricos; L0 revogado |
| [`PRODUTO.md`](./PRODUTO.md) | Público, Work, fórmula vs conectores |
| [`BACKEND-MAP.md`](./BACKEND-MAP.md) | Contratos, gotchas |
| [`BILLING-ARQUITETURA.md`](./BILLING-ARQUITETURA.md) | Planos, Stripe, OpenRouter |
| [`INVENTARIO-SUPERFICIES.md`](./INVENTARIO-SUPERFICIES.md) | Motor × UI |
| [`LINGUAGEM.md`](./LINGUAGEM.md) | Copy e glossário |
