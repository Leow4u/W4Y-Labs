# Plano de reparo Work4You

> **Produto:** fonte canónica = [`PRODUTO.md`](./PRODUTO.md). Fases/notas aqui sobre
> Agent Studio + canvas / “construção nova” são **LIXO** para direção de produto.

Premissas técnicas: núcleo Hermes (**A**) não se reescreve; plataforma (**C**) se endurece; desperdício **B/D** se funde de volta ao upstream. Superfícies: [PLATAFORMA.md](./PLATAFORMA.md) (**opção A** — desktop = renderer Hermes).

Referências de produto: [`PRODUTO.md`](./PRODUTO.md) · (histórico) [`AGENT-STUDIO.md`](./AGENT-STUDIO.md).

---

## Decisão 0 — Desktop (travada · opção A)

**D0-B + conteúdo A:** o app no PC é o **desktop Hermes completo** (`apps/desktop`: Electron + React), não uma casca que só carrega `web_dist`.

| | |
|---|---|
| **O quê** | Restaurar `apps/desktop` do upstream; encaixar deltas W4Y (login, ZIP/slots, ponte nuvem, update GCS); passada de linguagem; depois Agent Studio |
| **Por quê** | O fork excluiu o desktop nativo e reconstruiu `desktop-shell` (**B**). O atalho “UMA UI SÓ = web_dist” desviou do modelo de negócio |
| **UI primária no PC** | Renderer Hermes (`apps/desktop/src`) — botões e funções nativas **voltam** e são a base |
| **Web** | Janela da nuvem (secundária), não o app desktop |
| **O que some** | `desktop-shell` como produto (stop-ship de features; deprecar após port) |

**Fora de escopo no port:** reescrever agent core; nova state-machine de update; feature nova no `desktop-shell`.

---

## Push automático

Cada fase com gates verdes → commit escopado → **`git push`** (branch de trabalho). Sem `--force` em main; sem pular hooks; sem secrets.

Branch: `integ/billing-merge`.

---

## Fases

### Fase 0 — Spike (fechada, depois corrigida)

Spike inicial (`f3586cd`) mapeou superfícies mas escolheu “só casca + web_dist”. **Corrigido 22/07:** opção A — renderer Hermes é a UI do desktop.

| Superfície | Hermes `apps/desktop` | W4Y `desktop-shell` (legado) | Destino opção A |
|---|---|---|---|
| **Forma** | Electron + React próprio | Electron fino + `loadURL(web_dist)` | **Renderer Hermes** |
| **Backend** | serve/git local | ZIP + slots | **ZIP/slots W4Y** no desktop Hermes |
| **Login** | OAuth Hermes | Work4You + engine-key | **Work4You** |
| **Update** | git / `hermes update` | GCS + chip | **GCS simples** (padrões Hermes, sem state-machine nova) |
| **Bridge** | — | `w4y:cloud:*` | **Migrar para apps/desktop** |

---

### Fase 1 — Sangria (shell legado, curto)

Só manter a luz acesa. Sem feature nova na casca.

| # | Item | Status |
|---|---|---|
| 1.1 | Canal UI / CDN `no-store` | ✅ `publish-ui.ps1` + assert |
| 1.2 | Chip plano via `/api/account/plan` | ✅ `ec15660` + fly229 |
| 1.3 | Inventário residual loopback | ✅ sessions mutate + créditos via pulse/account |
| 1.4 | Chip update honesto | ✅ preparing label distinta; notice não some o pill |

**Gates:** typecheck+build web; assert manifesto. **Push.**

---

### Fase 2 — Restaurar `apps/desktop` (PR1)

1. Copiar árvore de `hermes-upstream@65372395` → `wayne-agent/apps/desktop`
2. Rename Hermes→Wayne / Work4You onde couber no branding mínimo
3. Gates: typecheck renderer; pack Windows mínimo se possível
4. **Push**

---

### Fase 3 — Deltas W4Y no desktop Hermes ← **parcial shipável**

1. ✅ Login Work4You + engine-key (`w4y-login.cjs` / `work4youDesktop.w4y.login()`)  
2. ✅ Preferir motor Wayne existente (monorepo / `%LOCALAPPDATA%\wayne\wayne-agent`) — ZIP virgin install ainda via shell/`install.ps1`  
3. ✅ Bridge `w4y:cloud:*` real (`w4y-cloud.cjs`)  
4. ✅ Policy GCS documentada; update chip Hermes git permanece legado até cutover  
5. ✅ Stop-ship `desktop-shell`
6. ✅ Banho de UI marca — wordmark Work4You, tema `work4you`, copy EN/títulos (favicon depois)

**Validar:** publicar casca/motor no GCS e aplicar o chip na app instalada — **não** `npm run dev`.  
**Push** por fatia.

---

### Fase 4 — Linguagem acessível (humanizar, não infantilizar)

Passada de copy/nav/fluxo no renderer: menos jargão, jornada clara. Renomear / esconder / reordenar — não reinventar nem rebaixar o produto. Marca visual já iniciada na Fase 3.6.

**Push.**

---

### Fase 5 — Agent Studio

Construção nova após base A+C estável. Spec: [AGENT-STUDIO.md](./AGENT-STUDIO.md) + [ROADMAP.md](./ROADMAP.md) §2. Não no `desktop-shell`.

---

### Contínuo — endurecer C

Stripe/plan, provisioner/engine-key, bridge account, publish UI no-store.

---

## Ritmo

```text
Sangria (shell)     → luz acesa
PR1 apps/desktop    → árvore de volta
Deltas W4Y          → login/ZIP/bridge/update
Linguagem           → sem ruído
Agent Studio        → construção nova
```

## Definição de “de volta ao trilho”

1. App instalável principal = `apps/desktop` Hermes, não `desktop-shell`+`web_dist`.  
2. Funções nativas do desktop Hermes presentes (e sendo humanizadas).  
3. Deltas W4Y encaixados sem segunda casca paralela.  
4. Agent Studio é a próxima construção grande.
