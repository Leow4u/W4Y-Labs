# Work4You Desktop (`apps/desktop`)

**App oficial no PC** — Electron + React nativo (linhagem Hermes, produto Work4You).

| | |
|---|---|
| **appId** | `com.work4you.app` (nova app; distinto do shell legado `com.work4you.desktop`) |
| **Dev** | `npm run dev` |
| **Instalador Windows** | `npm run dist:win:nsis` → `release/Work4You-*-win-*.exe` |
| **Motor** | Wayne (`wayne_cli.main`) via monorepo / `%LOCALAPPDATA%\wayne\wayne-agent` |

- Produto: [`docs/PLATAFORMA.md`](../../../docs/PLATAFORMA.md)
- Reparo / D0: [`docs/PLANO-REPARO.md`](../../../docs/PLANO-REPARO.md)

## W4Y deltas

| Módulo | Papel |
|---|---|
| `w4y-cloud.cjs` | Bridge `w4y:cloud:*` (fase seguinte: ponte Web↔Desktop estilo Cursor) |
| `w4y-login.cjs` | Login Work4You + engine-key → `%LOCALAPPDATA%\wayne\.env` |
| `w4y-wayne-resolve.cjs` | Prefere motor Wayne; pack **não** faz bootstrap Hermes em `%LOCALAPPDATA%\hermes` |

## Produto vs. desenvolvimento

> **Produto = build instalado** (`npm run dist:win:nsis` → NSIS). O chip de atualização
> verifica a casca via `latest.yml` e o motor via `latest.json` (GCS), e aplica ambos
> com um único clique. A versão instalada do motor é registrada em
> `%LOCALAPPDATA%\wayne\engine-version.json` após cada install/update.
>
> **`npm run dev` = engenharia apenas.** Não oferece atualização de produto; use `git pull`.
> O chip de atualização não aparece em builds não-empacotados.

## Dev / pack

```bash
# from wayne-agent/
npm install
cd apps/desktop
npm run typecheck
npm run dev              # renderer :5174 + Electron
npm run dist:win:nsis    # instalador oficial (NSIS)
```

Requisitos do motor: venv Wayne no monorepo (`../../.venv` ou `../../venv`) **ou** checkout em `%LOCALAPPDATA%\wayne\wayne-agent`, **ou** `WAYNE_DESKTOP_ROOT`.

IPC: `work4youDesktop.w4y.login()` / `.cloud.wsUrl()`.

## Legado

`apps/desktop-shell/` — **congelado**. Não portar updater/ZIP/slots/`web_dist`. Ver [STOP-SHIP.md](../desktop-shell/STOP-SHIP.md).

## Ponte Web (próxima fase)

Desktop e Web partilham o runtime cloud 24/7 (modelo Cursor). Fora do packaging desta app.
