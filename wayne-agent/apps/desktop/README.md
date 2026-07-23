# Work4You Desktop (`apps/desktop`)

**Estrela-guia (opção A):** este é o app principal no PC — linhagem Hermes Electron + React.

- Produto: [`docs/PLATAFORMA.md`](../../../docs/PLATAFORMA.md)
- Reparo: [`docs/PLANO-REPARO.md`](../../../docs/PLANO-REPARO.md)
- Studio: [`docs/AGENT-STUDIO.md`](../../../docs/AGENT-STUDIO.md)
- Linguagem PME: [`docs/LINGUAGEM-PME.md`](../../../docs/LINGUAGEM-PME.md)

## W4Y deltas (Fase 3)

| Módulo | Papel |
|---|---|
| `w4y-cloud.cjs` | Bridge real `w4y:cloud:*` (cookies → ticket/API) |
| `w4y-login.cjs` | Login Work4You + `POST /device/engine-key` → `%LOCALAPPDATA%\wayne\.env` |
| `w4y-wayne-resolve.cjs` | Prefere motor Wayne (monorepo / ZIP install) sobre Hermes git |
| `w4y-deltas.cjs` | API estável + policy GCS |

Renderer = React Hermes. Backend = `wayne_cli.main serve` quando o tree Wayne existir.

```bash
# from wayne-agent/
npm install
cd apps/desktop && npm run typecheck
npm run dev   # precisa venv Wayne em ../../venv ou %LOCALAPPDATA%\wayne\wayne-agent
```

IPC renderer: `work4youDesktop.w4y.login()` / `.cloud.wsUrl()`.

## Legado

`apps/desktop-shell/` ainda serve produção (motor ZIP + `web_dist`). **Stop-ship** de features novas lá.

## Dev

Workspace root: `wayne-agent/`. Shared package: `@wayne/shared` (Vite alias `@hermes/shared` → `../shared/src`).

```bash
# from wayne-agent/
npm install   # after apps/desktop is in workspaces
cd apps/desktop && npm run typecheck
```

Upstream reference: `hermes-upstream@65372395` / Hermes 0.18.2.
