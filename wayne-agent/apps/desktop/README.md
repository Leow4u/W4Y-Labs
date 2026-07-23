# Work4You Desktop (`apps/desktop`)

**Estrela-guia (opção A):** este é o app principal no PC — linhagem Hermes Electron + React.

- Produto: [`docs/PLATAFORMA.md`](../../../docs/PLATAFORMA.md)
- Reparo: [`docs/PLANO-REPARO.md`](../../../docs/PLANO-REPARO.md)
- Studio: [`docs/AGENT-STUDIO.md`](../../../docs/AGENT-STUDIO.md)
- Linguagem PME: [`docs/LINGUAGEM-PME.md`](../../../docs/LINGUAGEM-PME.md)

## W4Y deltas

`electron/w4y-deltas.cjs` — login Work4You, feeds GCS (engine/UI), canais de bridge.
Wiring completo = Fase 3 do plano de reparo (ZIP/slots, cookies, update simples).

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
