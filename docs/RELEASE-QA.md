# Release & QA canónico — Work4You desktop

> Fonte de verdade do fluxo **programar → publicar → validar**. Actualizado 17/08/2026.
> Se outro doc contradizer isto sobre *onde* se testa o produto, este ganha.

## Os três sítios (não misturar)

| Papel | Onde | O que faz | O que **não** faz |
|---|---|---|---|
| **Dev / Cloud Agent** | Cursor cloud, PRs, este chat | Escreve código, testes unitários, dispara/pede CI | Não é a prova de UX para o cliente |
| **CI** | GitHub Actions `Desktop Windows` / `Desktop macOS` | Build casca fina + motor ZIP → GCS | Não substitui um humano na app |
| **Máquina QA** | PC limpo (ex.: do Rafael, mini-PC, VM) | Só app instalada + chip + conta de teste | Sem repo, sem `npm run dev`, sem debugging diário |

A máquina de programador (mesmo a “oficial”) **não** é canónica. Estado local
(`%LOCALAPPDATA%\work4you`, cookies, motor partido) cria “vícios” que o cliente
limpo não tem — foi exactamente a confusão Conta / Sem sessão vs. email ok
noutro PC.

## Pipeline

1. Agente / humano → PR em `main`.
2. Bump de versão da casca quando UI/Electron mudou.
3. **Desktop Windows** (e Mac se aplicável) com `publish=true`:
   - Motor → `latest.json` / `latest-win32-x64.json` **antes**
   - Casca → `.exe` + `latest.yml` **depois**
4. Validar **só** na máquina QA, app instalada, chip de update.
5. Só depois: comunicar aos clientes / dogfood alargado.

Canal **beta** (`latest-beta.yml`) fica como passo seguinte opcional — mesmo
fluxo, feed separado, até o checklist QA passar.

## Casca fina (porque o chip deixou de poder demorar 5–10 min)

Até 17/08 o NSIS embutia `build/engine-runtime` (~700 MB). Cada bump de três
`.cjs` reescrevia o CPython inteiro.

**Agora:**

- Instalador = Electron + renderer (`extraResources` **sem** `engine`).
- Motor = ZIP no GCS; primeiro arranque / chip usam
  `ensureWayneEngineForPackaged` (download).
- Fat pack legado: `W4Y_PACK_WITH_ENGINE=1` (não é o caminho de produto).
- Guarda CI: `scripts/verify-shell-only.mjs` + `electron/casca-thin-pack.test.cjs`.

Primeira instalação precisa de rede. Updates da casca passam a ser do tamanho
da shell, não do motor.

## Checklist QA (máquina limpa)

- [ ] Versão no Sobre / chip = a do `latest.yml`
- [ ] Login → email no nome da conta (não “Conta” / “Sem sessão”)
- [ ] Composer / pasta cloud sem “Iniciar sessão…” espúrio
- [ ] Conectores carregam (não 503 eterno)
- [ ] Chip de update: casca sobe em tempo aceitável (sem janela vazia de minutos)

## Proibido

- Validar produto com `npm run dev` / `electron .`
- Tratar a máquina de programador como “está bom para o cliente”
- Publicar casca sem motor no feed (ordem: motor → casca)
