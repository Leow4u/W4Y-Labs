/**
 * preload.cjs — a ponte fina renderer↔main (Onda 3).
 *
 * Expõe SÓ o cofre de pastas pro app web (work4you.ai): abrir o seletor nativo
 * de pasta + o diálogo de autorização, listar e remover pastas autorizadas.
 * NÃO expõe fs/shell direto — quem executa é o executor (main), atrás do canal
 * do gateway + da guarda de pastas. Guarda de origem: só injeta na origem do
 * próprio app (nunca nos popups de login Google/Microsoft).
 *
 * Desktop-2: também expõe a superfície CRUA de fs/git locais (readDir + git
 * worktree/repo-scan/root). Toda chamada é confinada ao cofre no main; a UI web
 * que consome isso é onda separada.
 */
const { contextBridge, ipcRenderer } = require("electron");

function _isAppOrigin() {
  try {
    const h = window.location.host; // inclui a porta (ex.: "localhost:5173")
    return (
      h === "work4you.ai" ||
      h.endsWith(".work4you.ai") ||
      h === "localhost" ||
      /^localhost:/.test(h) ||
      /^127\.0\.0\.1(:|$)/.test(h)
    );
  } catch {
    return false;
  }
}

// boot.html empacotado (motor local): carregado via loadFile → origem file:.
// A ponte de boot SÓ existe nessa página — nunca no app web nem em popups.
function _isBootPage() {
  try {
    return (
      window.location.protocol === "file:" && /(^|\/)boot\.html$/i.test(window.location.pathname)
    );
  } catch {
    return false;
  }
}

if (_isBootPage()) {
  // Contrato IPC (ver main.cjs, bloco do motor local):
  //   state()      → { phase, cloudShell, error, events[], logLines[] } (replay)
  //   onEvent(cb)  → eventos ao vivo do canal "w4y:boot:event"; retorna unsubscribe
  //   submitKey(k) → grava OPENROUTER_API_KEY no .env do motor ({ ok } | { ok:false, error })
  //   skipKey(opts)→ segue sem chave; opts.snoozeComposio persiste o "não
  //                  perguntar de novo" (só vale no gate SÓ-Composio — o main
  //                  ignora a flag quando falta a chave de modelo)
  //   login()      → fluxo "Entrar com Work4You" (janela filha + /device/
  //                  engine-key); resolve só no FIM do fluxo:
  //                  { ok:true, got:"key"|"no-credit" } | { ok:false, reason }
  //                  (a chave em si NUNCA cruza este canal)
  //   loginCancel()→ cancela o fluxo de login (fecha a janela filha)
  //   retry()      → re-roda a sequência de boot após erro
  //   useCloud()   → fallback: carrega o app da nuvem (work4you.ai)
  contextBridge.exposeInMainWorld("w4yBoot", {
    state: () => ipcRenderer.invoke("w4y:boot:state"),
    onEvent: (cb) => {
      const listener = (_e, ev) => {
        try {
          cb(ev);
        } catch {
          /* handler do boot.html nunca pode derrubar a ponte */
        }
      };
      ipcRenderer.on("w4y:boot:event", listener);
      return () => ipcRenderer.removeListener("w4y:boot:event", listener);
    },
    submitKey: (key) => ipcRenderer.invoke("w4y:boot:key:submit", String(key || "")),
    skipKey: (opts) =>
      ipcRenderer.invoke("w4y:boot:key:skip", {
        snoozeComposio: !!(opts && opts.snoozeComposio),
      }),
    login: () => ipcRenderer.invoke("w4y:boot:login"),
    loginCancel: () => ipcRenderer.invoke("w4y:boot:login:cancel"),
    retry: () => ipcRenderer.invoke("w4y:boot:retry"),
    useCloud: () => ipcRenderer.invoke("w4y:boot:cloud"),
  });
}

// Workspace local padrão (~/Work4You) — passado pelo main via additionalArguments
// (síncrono, sem IPC no page-load). "" se, por algum motivo, não veio.
function _defaultWorkspace() {
  try {
    const pre = "--w4y-default-workspace=";
    const arg = process.argv.find((a) => a.startsWith(pre));
    return arg ? arg.slice(pre.length) : "";
  } catch {
    return "";
  }
}

if (_isAppOrigin()) {
  contextBridge.exposeInMainWorld("work4youDesktop", {
    isDesktop: true,
    platform: process.platform,
    // Caminho absoluto do workspace local padrão do desktop (pasta local que o
    // desktop usa quando "sem projeto"). String — já está no cofre no boot.
    defaultWorkspace: _defaultWorkspace(),
    // Abre o seletor NATIVO de pasta + o diálogo de autorização; resolve com a
    // lista atualizada de pastas autorizadas (ou a lista atual, se cancelar).
    pickFolder: () => ipcRenderer.invoke("w4y:folders:pick"),
    listFolders: () => ipcRenderer.invoke("w4y:folders:list"),
    removeFolder: (p) => ipcRenderer.invoke("w4y:folders:remove", p),
    // Liga o executor local pra esta sessão (usa as pastas do cofre) / desliga.
    setLocal: (sessionKey) => ipcRenderer.invoke("w4y:local:set", { sessionKey }),
    stopLocal: () => ipcRenderer.invoke("w4y:local:stop"),
    // Open a target OUTSIDE the app (upstream hermes:openExternal port): an
    // http/https URL in the system browser, or a LOCAL FILE — only inside the
    // authorized-folders vault — via its file:// URL. Anything else is refused
    // in the main process: { ok:false } (no arbitrary protocols, no shell exec).
    openExternal: (target) => ipcRenderer.invoke("w4y:openExternal", target),
    // ── Cloud bridge (S1 mini-computer): chat sessions that run on the user's
    // CLOUD computer from the local-engine app. wsUrl() mints a fresh
    // single-use WS ticket (re-invoke on every reconnect — tickets expire and
    // are one-shot); api() is a narrow REST proxy, main-enforced to the app
    // origin + /api/* paths only (GET/POST/PATCH/PUT/DELETE since 0.3.5,
    // JSON). Cookies never cross here. Unknown methods fall back to GET in
    // the main — the allowlist is enforced there, this is just the ferry.
    cloud: {
      wsUrl: () => ipcRenderer.invoke("w4y:cloud:wsUrl"),
      // Capability marker for the web: THIS shell ferries PATCH/PUT/DELETE.
      // Shells ≤0.3.4 lack the flag AND coerced unknown methods to GET — a
      // DELETE through them would silently turn into a harmless-looking GET
      // that "succeeds", so the web MUST gate mutations on this marker.
      canMutate: true,
      api: (path, opts) =>
        ipcRenderer.invoke("w4y:cloud:api", {
          path: String(path || ""),
          method: opts && typeof opts.method === "string" ? opts.method : "GET",
          body: opts ? opts.body : undefined,
        }),
    },
    // ── Engine update chip (0.3.4) ────────────────────────────────────────
    // check() → { available, version } | null (fail-open: offline/cloud mode
    // simply hide the chip). apply() → restarts the shell; the boot flow
    // performs the actual refresh with its progress UI.
    update: {
      check: () => ipcRenderer.invoke("w4y:update:check"),
      apply: () => ipcRenderer.invoke("w4y:update:apply"),
    },
    // ── Window chrome (0.3.7, Codex-style frameless) ──────────────────────
    // The web's top bar gates its whole render on THIS group existing —
    // shells ≤0.3.6 (framed windows) lack it, so the bar never promises an
    // IPC the shell can't honor. Edit roles and zoom are allowlisted in the
    // main; onMenuAction delivers the window-scoped accelerators the main
    // can't resolve alone (new session, open folder).
    windowChrome: {
      newWindow: () => ipcRenderer.invoke("w4y:window:new"),
      closeWindow: () => ipcRenderer.invoke("w4y:window:close"),
      quit: () => ipcRenderer.invoke("w4y:app:quit"),
      editRole: (role) => ipcRenderer.invoke("w4y:edit:role", String(role || "")),
      zoom: (dir) => ipcRenderer.invoke("w4y:view:zoom", String(dir || "reset")),
      toggleFullscreen: () => ipcRenderer.invoke("w4y:view:fullscreen"),
      reload: () => ipcRenderer.invoke("w4y:view:reload"),
      appInfo: () => ipcRenderer.invoke("w4y:app:info"),
      onMenuAction: (cb) => {
        const listener = (_e, payload) => {
          try {
            cb(payload && payload.action ? String(payload.action) : "");
          } catch {
            /* a renderer handler must never break the bridge */
          }
        };
        ipcRenderer.on("w4y:menu:action", listener);
        return () => ipcRenderer.removeListener("w4y:menu:action", listener);
      },
    },
    // ── Desktop-2: fs/git locais (todos confinados ao cofre no main) ──────────
    // Lista os itens de uma pasta do cofre: { entries:[{name,path,isDirectory}] }
    // ou { entries:[], error }.
    readDir: (p) => ipcRenderer.invoke("w4y:fs:readDir", p),
    // Raiz do repo git a partir de um caminho (string) ou null.
    gitRoot: (p) => ipcRenderer.invoke("w4y:git:root", p),
    // Varre o cofre (ou raízes dadas) por repos git: [{ label, root }].
    // opts = { roots?: string[], maxDepth?: number }.
    gitRepoScan: (opts) => ipcRenderer.invoke("w4y:git:repoScan", opts),
    // Worktrees do repo: [{ path, branch, isMain, detached, locked }].
    gitWorktreeList: (repoPath) => ipcRenderer.invoke("w4y:git:worktreeList", repoPath),
    // Cria worktree: { ok, path, branch, repoRoot } | { ok:false, error }.
    // options = { name?, branch?, base?, existingBranch? }.
    gitWorktreeAdd: (repoPath, options) =>
      ipcRenderer.invoke("w4y:git:worktreeAdd", { repoPath, options }),
    // Remove worktree: { ok, removed } | { ok:false, error }. options = { force? }.
    gitWorktreeRemove: (repoPath, worktreePath, options) =>
      ipcRenderer.invoke("w4y:git:worktreeRemove", { repoPath, worktreePath, options }),
    // Branches locais do repo: [{ name, checkedOut, isDefault, worktreePath }].
    gitBranchList: (repoPath) => ipcRenderer.invoke("w4y:git:branchList", repoPath),
    // Troca de branch: { ok, branch } | { ok:false, error }.
    gitSwitchBranch: (repoPath, branch) =>
      ipcRenderer.invoke("w4y:git:switchBranch", { repoPath, branch }),
  });
}
