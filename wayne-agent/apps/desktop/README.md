# Work4You Desktop (`apps/desktop`)

**App oficial no PC** — Electron + React nativo (linhagem Hermes, produto Work4You).

| | |
|---|---|
| **appId** | `com.work4you.app` |
| **Validar produto** | Publicar no GCS → chip de atualização na **app instalada** |
| **Instalador Windows** | `npm run dist:win:nsis` → `release/Work4You-*-win-*.exe` |
| **Motor** | Wayne via ZIP/`latest.json` em `%LOCALAPPDATA%\wayne\` |

- Produto: [`docs/PLATAFORMA.md`](../../../docs/PLATAFORMA.md)
- Reparo / D0: [`docs/PLANO-REPARO.md`](../../../docs/PLANO-REPARO.md)

## W4Y deltas

| Módulo | Papel |
|---|---|
| `w4y-cloud.cjs` | Bridge `w4y:cloud:*` (fase seguinte: ponte Web↔Desktop estilo Cursor) |
| `w4y-login.cjs` | Login Work4You + engine-key → `%LOCALAPPDATA%\wayne\.env` |
| `w4y-wayne-resolve.cjs` | Prefere motor Wayne; pack **não** faz bootstrap Hermes em `%LOCALAPPDATA%\hermes` |

## Validação = app instalada

> **Produto = build instalado** (`npm run dist:win:nsis` → upload GCS). O chip de
> atualização verifica a casca via `latest.yml` e o motor via `latest.json`, e
> aplica ambos com um único clique. É **o único** caminho aceite para validar
> mudanças de produto — nunca `npm run dev` como instrução de teste.
>
> Typecheck / vitest / `npm run dev` no checkout servem só ao agente a iterar
> código **antes** de publicar. O utilizador testa sempre na app após o chip.

## Pack / release

```bash
# from wayne-agent/apps/desktop
npm run typecheck
npm run dist:win:nsis    # → release/; depois gsutil cp exe + blockmap + latest.yml
```

Requisitos do motor: venv Wayne no monorepo (`../../.venv` ou `../../venv`) **ou** checkout em `%LOCALAPPDATA%\wayne\wayne-agent`, **ou** `WAYNE_DESKTOP_ROOT`.

IPC: `work4youDesktop.w4y.login()` / `.cloud.wsUrl()`.

## Uma app só

Esta é a única app de desktop. A shell legada (`apps/desktop-shell/`, `appId` `com.work4you.desktop`) foi apagada a 29/07 — está no histórico do git se alguma vez for precisa. Publicar uma segunda app Electron para `w4y-engine-dist` volta a partir o feed: as duas partilhariam o mesmo `latest.yml` com `appId` diferentes, e a actualização instalaria uma segunda Work4You ao lado em vez de substituir.

## Ponte Web (próxima fase)

Desktop e Web partilham o runtime cloud 24/7 (modelo Cursor). Fora do packaging desta app.
