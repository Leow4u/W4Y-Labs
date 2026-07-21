/**
 * Work4You Desktop — casca nativa com MOTOR LOCAL (pivô desktop, 0.3.x).
 *
 * 0.3.2: (1) o gate de chave ganha o caminho primário "Entrar com Work4You" —
 * janela filha de login na nuvem + POST /device/engine-key com os cookies da
 * sessão entrega a chave sozinha (o campo manual vira secundário); (2) update
 * do motor no boot — latest.json do bucket comparado com o engine-source.json
 * gravado pela casca; divergiu → refresh in-place via estágio `repository`
 * (fail-open: qualquer erro segue com o motor atual).
 *
 * 0.3.3 (S0 conectores): o /device/engine-key pode trazer também a chave
 * Composio do projeto DEDICADO do tenant (composioKey); quando vem, o mesmo
 * fluxo grava COMPOSIO_API_KEY no <WAYNE_HOME>\.env — o motor local ganha os
 * conectores do dono (mesmos user_ids, contas já autorizadas na nuvem).
 *
 * 0.3.4: (1) update chip — IPCs w4y:update:{check,apply} let the dashboard
 * show an "Atualizar" pill (check = manifest × engine-source marker; apply =
 * relaunch, the existing boot flow performs the refresh with its progress UI);
 * (2) tray gains "Verificar atualizações" and an explicit engine-killing
 * "Sair"; (3) the key gate now also opens when COMPOSIO_API_KEY is missing
 * (login as "connect your apps", skippable); (4) tenant-as-broker — after
 * login, GET /api/device/connector-bootstrap (with the session cookies)
 * delivers the Composio key AND a fresh tool-router session URL, written to
 * .env + <WAYNE_HOME>\config.yaml (mcp_servers.composio) — the local engine
 * gets working connector TOOLS, not just the key.
 *
 * 0.3.5: (1) the cloud bridge (w4y:cloud:api) allowlist grows to
 * GET/POST/PATCH/PUT/DELETE — cloud sessions/routines regain their mutating
 * affordances in the merged UI (all other guards intact: pinned origin,
 * /api/* only, JSON, bodies never logged); (2) the composio-ONLY gate gains
 * "não perguntar de novo" (login-gate.json snooze; the model gate is never
 * skipped) and the tray gains "Entrar com Work4You" (same login flow, run
 * outside the boot via runLoginFlow({external})).
 *
 * 0.3.8 (shell self-update): the SHELL updates itself via electron-updater
 * (generic provider, our own bucket — feed baked into app-update.yml from
 * build.publish; shell-updater.cjs). The SAME chip IPCs cover both layers,
 * zero web changes: w4y:update:check now checks the SHELL first (feed) and
 * only then the engine (existing flow) — response keeps the {available,
 * version} contract, the kind is remembered main-side. w4y:update:apply
 * routes on that memory: shell → killEngine + download (autoDownload OFF,
 * bytes only move on apply) + quitAndInstall(silent, forceRun) — NSIS
 * installs and relaunches, the fresh boot handles the engine as always;
 * engine → existing relaunch flow. The tray "Verificar atualizações" rides
 * the same unified path. Fail-open TOTAL: any updater problem degrades to
 * the engine-only behavior (a failed shell apply falls back to a plain
 * relaunch); the updater never runs at boot. Unsigned→unsigned works on
 * Windows: with no publisherName configured, NsisUpdater skips signature
 * verification (see shell-updater.cjs header for sources).
 *
 * 0.3.7 (Codex-style chrome): the window goes FRAMELESS (titleBarStyle
 * hidden + titleBarOverlay on Windows) and the web renders its own top bar
 * (sidebar toggle + back/forward + File/Edit/View/Help menus — gated on the
 * `windowChrome` preload group, so older web_dists keep the framed look they
 * were designed for is moot: they simply have no bar and the boot.html strip
 * plus the overlay remain the drag surfaces). New IPC surface
 * (registerChromeIpc): w4y:window:new (extra window on the current target),
 * w4y:window:close (hide-to-tray path via win.close), w4y:app:quit (REAL
 * quit, same path as the tray's "Sair"), w4y:edit:role (webContents roles
 * undo/redo/cut/copy/paste/selectAll — allowlisted), w4y:view:zoom
 * (in/out/reset), w4y:view:fullscreen, w4y:view:reload, w4y:app:info (shell
 * version + engine-source.json version for the About dialog). Window-scoped
 * accelerators ride before-input-event per window (never OS-global):
 * Ctrl+Shift+N / Ctrl+N / Ctrl+O / Ctrl+W / Ctrl+Q; Ctrl+N and Ctrl+O are
 * forwarded to the renderer ("w4y:menu:action") because their flows (new
 * session, add local folder) live in the web app. Both shell modes get the
 * chrome (same web_dist, IPCs registered unconditionally).
 *
 * Default: a casca resolve/instala o motor Wayne local (`wayne serve` em
 * 127.0.0.1) e carrega o dashboard servido por ele — o MESMO web_dist da
 * nuvem, com o token de sessão injetado pelo próprio servidor no index.html
 * (web_server.py:15055-15075): loadURL no localhost já entra autenticado.
 * Enquanto o motor sobe (ou instala, no 1º boot), a janela mostra boot.html
 * (empacotado) com progresso REAL vindo do bootstrap-runner via IPC.
 *
 * Escape: W4Y_CLOUD_SHELL=1 força o modo anterior (carregar work4you.ai) — e
 * "Usar na nuvem" é o fallback de erro do boot local. Nos dois modos valem a
 * moldura nativa (janela, bandeja, atalhos, links externos no navegador) e o
 * cofre de pastas/executor (inertes no modo local — o motor faz o trabalho).
 */
const {
  app,
  BrowserWindow,
  shell,
  Menu,
  Tray,
  globalShortcut,
  nativeImage,
  ipcMain,
  dialog,
  net,
  session,
  nativeTheme,
} = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const https = require("node:https");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn, spawnSync } = require("node:child_process");
const { pathToFileURL, fileURLToPath } = require("node:url");
const folders = require("./folders.cjs");
// Motor local (pivô desktop L1.3): módulos transplantados do apps/desktop.
const backendCommand = require("./backend-command.cjs");
const backendReady = require("./backend-ready.cjs");
const backendProbes = require("./backend-probes.cjs");
const backendEnvMod = require("./backend-env.cjs");
const bootstrapRunner = require("./bootstrap-runner.cjs");
const bootPreview = require("./boot-preview.cjs");
const engineSlots = require("./engine-slots.cjs");
const updateState = require("./engine-update-state.cjs");
const { createSingleFlight } = require("./single-flight.cjs");
const updateScheduler = require("./update-scheduler.cjs");

// One engine update at a time, across EVERY entry point: the 30-minute timer,
// the tray, and the renderer's retry. The previous guard (`engine.updating`)
// was read before the first await and written after it, so two callers could
// both walk past it and install over the same slot tree.
const engineUpdateFlight = createSingleFlight();

// The SHELL apply needs the same protection. It kills the engine, downloads
// ~85MB and calls quitAndInstall: two of those at once (renderer chip + tray
// item) means two installers over one directory. The React guard in
// AuthWidget only stops a double-click inside one window — it cannot see the
// tray, a second window, or the automatic paths, so it stays what it is: a UX
// nicety, not the lock.
const shellApplyFlight = createSingleFlight();
// 0.3.8: shell self-update (electron-updater atrás de um seam fail-open).
const shellUpdater = require("./shell-updater.cjs");
// Desktop-2: fs/git locais portados do Hermes (módulos git/fs puros). O executor
// reexporta a contenção do cofre (`resolveWithinVault`) — UMA guarda pros dois.
const executor = require("./executor.cjs");
const fsReadDir = require("./fs-read-dir.cjs");
const gitRoot = require("./git-root.cjs");
const gitRepoScan = require("./git-repo-scan.cjs");
const gitWorktree = require("./git-worktree-ops.cjs");

// Auto-cura do cache de GPU. Um cache de shader gravado por uma versão ANTERIOR
// (ex.: a que rodava com disableHardwareAcceleration = software) pode ficar
// incompatível com a versão atual e QUEBRAR o WebGL → o Turnstile da tela de
// login trava em "Verificando..." → a falha de GL derruba o compositor → TELA
// PRETA (diagnosticado 14/07: perfil com cache velho reproduz; limpo resolve).
// A cada troca de versão, apaga UMA vez os caches de GPU (todos regeneráveis;
// NÃO toca em Cookies/Local Storage/sessão → login preservado).
function clearStaleGpuCacheOnUpgrade() {
  try {
    const ud = app.getPath("userData");
    const marker = path.join(ud, ".render-cache-version");
    let prev = "";
    try {
      prev = fs.readFileSync(marker, "utf8").trim();
    } catch {
      /* sem marcador = primeira vez com esta lógica */
    }
    const cur = app.getVersion();
    if (prev === cur) return;
    for (const c of [
      "GPUCache",
      "ShaderCache",
      "GrShaderCache",
      "DawnCache",
      "DawnGraphiteCache",
      "DawnWebGPUCache",
      "Code Cache",
    ]) {
      try {
        fs.rmSync(path.join(ud, c), { recursive: true, force: true });
      } catch {
        /* best-effort */
      }
    }
    try {
      fs.writeFileSync(marker, cur, "utf8");
    } catch {
      /* ignore */
    }
  } catch {
    /* a auto-cura NUNCA pode derrubar o boot */
  }
}
clearStaleGpuCacheOnUpgrade();

const APP_URL = process.env.WORK4YOU_URL || "https://work4you.ai/chat";
const APP_HOST = (() => {
  try {
    return new URL(APP_URL).host;
  } catch {
    return "work4you.ai";
  }
})();
const APP_ORIGIN = (() => {
  try {
    return new URL(APP_URL).origin;
  } catch {
    return "https://work4you.ai";
  }
})();
// Login providers (Google/Microsoft/Firebase) that must open INSIDE the app —
// the OAuth popup needs postMessage back to its opener. Shared by the main
// window and the boot login window.
const AUTH_HOST =
  /(^|\.)(google\.com|googleusercontent\.com|microsoftonline\.com|microsoft\.com|live\.com|firebaseapp\.com|web\.app)$/i;

// ACELERAÇÃO DE GPU: mantida LIGADA (padrão). Já tentamos DESLIGAR
// (disableHardwareAcceleration) por causa de um "preto de driver", mas no
// Electron 33 (Chromium 130+) isso mata o WebGL — o Chromium desativou o
// fallback por software por padrão. Resultado: o desafio Cloudflare Turnstile
// da tela de login trava em "Verificando..." e a falha de GL derruba o
// compositor → tela preta. Com a GPU real, o Turnstile passa e a janela pinta
// certo (validado via capturePage + screenshot da tela real, 14/07). O flag
// enable-unsafe-swiftshader (WebGL por software) foi descartado: trava o load.

// Windows: identidade estável → notificações atribuídas ao Work4You e
// agrupamento correto na barra de tarefas.
app.setAppUserModelId("com.work4you.desktop");

// Uma instância só: um segundo launch foca a janela existente.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

let mainWindow = null;
let tray = null;
let isQuitting = false;
// Workspace local padrão do desktop (~/Work4You). Preenchido no boot por
// ensureDefaultWorkspace() e passado pro preload via additionalArguments.
let defaultWorkspace = "";

// ══ MOTOR LOCAL (pivô desktop L1.3) ═══════════════════════════════════════
// Modo default do 0.3.0. W4Y_CLOUD_SHELL=1 força o modo nuvem (comportamento
// anterior: carregar work4you.ai direto, sem motor local).
const CLOUD_SHELL = process.env.W4Y_CLOUD_SHELL === "1";

// Fonte do motor pro install.ps1 (env WAYNE_SOURCE_ZIP_URL — sem ela o
// instalador falha com erro claro).
//
// Este valor é a REDE DE SEGURANÇA, não a fonte da verdade: vale quando o
// manifesto não responde (offline, bucket fora do ar). A fonte da verdade é o
// latest.json — ver resolveEngineZipUrlLive() logo abaixo.
//
// Por que isso mudou: a constante era o único caminho da instalação, com um
// comentário pedindo "atualizar a cada release" que ninguém cumpria. Em
// 20/07/2026 uma publicação nova disparou reinstalação e o app baixou este
// ZIP fixo de 17/07 — rebaixando a máquina em três dias de trabalho (nomes
// da navegação, trava da raiz de Arquivos, formulário de canais). Um passo
// manual que, se esquecido, reverte o produto em silêncio não é um passo:
// é uma armadilha.
const DEFAULT_ENGINE_ZIP_URL =
  "https://storage.googleapis.com/w4y-engine-dist/wayne-engine-20260720g.zip";

/** Override explícito (dev/CI) > rede de segurança. Síncrono, sem rede. */
function resolveEngineZipUrl() {
  return (
    (process.env.W4Y_ENGINE_ZIP_URL || "").trim() ||
    (process.env.WAYNE_SOURCE_ZIP_URL || "").trim() ||
    DEFAULT_ENGINE_ZIP_URL
  );
}

/**
 * O que instalar de verdade: o manifesto manda, a constante socorre.
 *
 * Um override explícito continua ganhando de tudo (é o dev dizendo "quero
 * ESTE"). Sem override, consulta o latest.json — a mesma fonte que a
 * verificação de atualização já usa, então instalar e atualizar deixam de
 * poder discordar. Qualquer falha de rede cai na constante, e o boot nunca
 * trava por causa disso (fetchEngineManifest tem orçamento de 5s e resolve
 * null em qualquer problema).
 */
async function resolveEngineZipUrlLive() {
  const explicit =
    (process.env.W4Y_ENGINE_ZIP_URL || "").trim() ||
    (process.env.WAYNE_SOURCE_ZIP_URL || "").trim();
  if (explicit) return explicit;
  try {
    const manifest = await fetchEngineManifest();
    const fromManifest = manifest && typeof manifest.zipUrl === "string" ? manifest.zipUrl.trim() : "";
    if (fromManifest) return fromManifest;
  } catch {
    /* manifesto indisponível — segue pra rede de segurança */
  }
  return DEFAULT_ENGINE_ZIP_URL;
}

// ── Engine update manifest (0.3.2) ─────────────────────────────────────────
// Published alongside the engine ZIPs: {"version":"YYYYMMDDx","zipUrl":"…"}.
// Any fetch/parse failure means "no update" — the boot NEVER blocks on this.
const ENGINE_MANIFEST_URL =
  (process.env.W4Y_ENGINE_MANIFEST_URL || "").trim() ||
  "https://storage.googleapis.com/w4y-engine-dist/latest.json";

// Identity of the installed engine source, recorded by THIS shell:
// <WAYNE_HOME>\engine-source.json = { version, zipUrl, updatedAt }.
// WHY zipUrl is the comparison key: the ZIP's own `.wayne-engine-version`
// carries commit/branch/built but NOT the manifest's `version` label, so the
// only identity both sides share is the zipUrl itself. The shell writes this
// marker after every successful install/update; when it is absent (pre-0.3.2
// install) the installed version is unknown → one repository refresh converges
// to the manifest and writes the marker (in-place refresh is proven cheap and
// preserves venv/config). Lazy path: WAYNE_HOME is declared further down.
function engineSourceFile() {
  return path.join(WAYNE_HOME, "engine-source.json");
}

function readEngineSource() {
  try {
    const j = JSON.parse(fs.readFileSync(engineSourceFile(), "utf8"));
    return j && typeof j.zipUrl === "string" && j.zipUrl ? j : null;
  } catch {
    return null; // absent/corrupt = unknown installed source
  }
}

function writeEngineSource(data) {
  try {
    fs.mkdirSync(WAYNE_HOME, { recursive: true });
    fs.writeFileSync(engineSourceFile(), JSON.stringify(data, null, 2) + "\n", "utf8");
  } catch {
    /* best-effort — a missing marker just means one extra refresh next boot */
  }
}

// Fetch latest.json with a hard 5s budget. Resolves null on ANY problem
// (offline, HTTP != 200, bad JSON, missing/insecure zipUrl) — fail-open.
function fetchEngineManifest(timeoutMs = 5000) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    try {
      const req = https.get(ENGINE_MANIFEST_URL, { timeout: timeoutMs }, (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          done(null);
          return;
        }
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          try {
            const j = JSON.parse(Buffer.concat(chunks).toString("utf8"));
            const ok = j && typeof j.zipUrl === "string" && /^https:\/\//i.test(j.zipUrl);
            done(ok ? j : null);
          } catch {
            done(null);
          }
        });
        res.on("error", () => done(null));
      });
      req.on("timeout", () => {
        try {
          req.destroy();
        } catch {
          /* already gone */
        }
        done(null);
      });
      req.on("error", () => done(null));
    } catch {
      done(null);
    }
  });
}

// Boot-time engine update (installed engine only, never the dev checkout).
// Compares the manifest zipUrl against engine-source.json and, when they
// differ (or the marker is absent), refreshes in place via the install.ps1
// `repository` stage with WAYNE_SOURCE_ZIP_URL pointing at the manifest ZIP —
// the exact flow proven to preserve venv/config. Every failure path falls
// open: the boot continues on the current engine. A 10-minute cap guards
// against a hung download; an aborted refresh is self-healing because the
// marker is only written on success, so the next boot retries the same ZIP
// (robocopy converges the tree).
// Returns true when a refresh was actually ATTEMPTED (the tree may have
// changed even on failure) so the caller knows to re-probe the backend.
// The boot no longer installs anything. Set W4Y_ENGINE_BOOT_UPDATE=1 to bring
// the old blocking path back for one release if the staged flow misbehaves.
const BOOT_UPDATE_ESCAPE_HATCH = process.env.W4Y_ENGINE_BOOT_UPDATE === "1";

// Where a background install parks its result until the next boot.
function stagedFile() {
  return path.join(WAYNE_HOME, "engine-staged.json");
}

function readStaged() {
  try {
    const j = JSON.parse(fs.readFileSync(stagedFile(), "utf8"));
    return j && typeof j.root === "string" && j.root ? j : null;
  } catch {
    return null;
  }
}

function clearStaged() {
  try {
    fs.rmSync(stagedFile(), { force: true });
  } catch {
    /* best effort */
  }
}

/**
 * Switch to an engine that finished installing in the background.
 *
 * Runs at the very top of the boot, with the engine provably dead (nothing has
 * spawned yet), and does only metadata work: adopt the real tree into a slot
 * the first time, repoint the junction, rewrite the marker. Milliseconds.
 *
 * Every failure aborts BEFORE mutating anything, so the worst case is "we did
 * not update this time" — never a half-switched install.
 */
function promoteStagedEngine() {
  let staged = null;
  try {
    staged = readStaged();
    if (!staged) return false;
    if (!engineSlots.isComplete(staged.root)) {
      // Install died before finishing: drop the claim, let the background pass
      // rebuild it from scratch (freshSlot moves the debris aside).
      clearStaged();
      updateState.writeState(WAYNE_HOME, { phase: "idle" });
      return false;
    }
    if (!engineSlots.junctionsSupported(WAYNE_HOME)) {
      updateState.writeState(WAYNE_HOME, {
        phase: "failed",
        lastError: "this filesystem does not support junctions",
        lastErrorStage: "promote",
      });
      clearStaged();
      return false;
    }

    const previous = readEngineSource();
    let previousRoot = previous && previous.root ? previous.root : null;

    // First promotion on this machine: wayne-agent is still a REAL directory.
    // Rename it into a slot (metadata-only, works with mapped .pyd) so the
    // canonical path can become a junction. If this fails, nothing has been
    // touched yet and we simply do not update.
    if (engineSlots.exists(ENGINE_ROOT) && !engineSlots.isLink(ENGINE_ROOT)) {
      previousRoot = engineSlots.adoptRealTree(WAYNE_HOME, ENGINE_ROOT);
    }

    engineSlots.pointJunction(ENGINE_ROOT, staged.root);
    writeEngineSource({
      version: staged.version ?? null,
      zipUrl: staged.zipUrl,
      updatedAt: new Date().toISOString(),
      root: staged.root,
      previousRoot,
      previousZipUrl: previous ? previous.zipUrl : null,
    });
    clearStaged();
    // Not "idle" yet: only a successful loadURL proves the new engine boots.
    updateState.writeState(WAYNE_HOME, { phase: "promoted-pending-verify" });
    return true;
  } catch (err) {
    updateState.writeState(WAYNE_HOME, {
      phase: "failed",
      lastError: String((err && err.message) || err),
      lastErrorStage: "promote",
    });
    return false;
  }
}

/**
 * Undo a promotion whose engine refused to start.
 *
 * Called from the boot's catch. Points the junction back at the tree that was
 * working an hour ago and restores its marker, so the next boot is the old
 * engine and the user sees why instead of a dead app.
 */
function rollbackPromotion() {
  try {
    const current = readEngineSource();
    if (!current || !current.previousRoot) return false;
    if (!engineSlots.exists(current.previousRoot)) return false;
    engineSlots.pointJunction(ENGINE_ROOT, current.previousRoot);
    writeEngineSource({
      version: null,
      zipUrl: current.previousZipUrl || current.zipUrl,
      updatedAt: new Date().toISOString(),
      root: current.previousRoot,
      previousRoot: null,
      previousZipUrl: null,
    });
    updateState.writeState(WAYNE_HOME, {
      phase: "rolled-back",
      lastError: "the new engine did not start",
      lastErrorStage: "verify",
    });
    return true;
  } catch {
    return false;
  }
}

async function maybeUpdateEngine() {
  try {
    const manifest = await fetchEngineManifest();
    if (!manifest || !manifest.zipUrl) return false; // no manifest = no update
    const current = readEngineSource();
    if (current && current.zipUrl === manifest.zipUrl) return false; // up to date
    setPhase("update", "Atualizando o motor…");
    // The runner's spawn spreads process.env, so this reaches install.ps1.
    process.env.WAYNE_SOURCE_ZIP_URL = manifest.zipUrl;
    const emit = (ev) => sendBootEvent({ type: "bootstrap", ev });
    const scriptInfo = await bootstrapRunner.resolveInstallScript({
      installStamp: null,
      sourceRepoRoot:
        DEV_SOURCE_ROOT || (!app.isPackaged ? path.resolve(__dirname, "..", "..") : null),
      packagedScriptDir: app.isPackaged ? path.join(process.resourcesPath, "scripts") : null,
      wayneHome: WAYNE_HOME,
      emit,
    });
    // Dedicated abort: chains the boot abort ("Usar na nuvem"/retry) and adds
    // the hang cap without ever touching the boot's own controller.
    const updateAbort = new AbortController();
    const onBootAbort = () => updateAbort.abort();
    if (engine.bootAbort) {
      if (engine.bootAbort.signal.aborted) updateAbort.abort();
      else engine.bootAbort.signal.addEventListener("abort", onBootAbort, { once: true });
    }
    const cap = setTimeout(() => updateAbort.abort(), 10 * 60_000);
    let ev = null;
    try {
      // installStamp stays null on purpose: the ZIP URL is the pin (pin args
      // like -Tag would fight the WAYNE_SOURCE_ZIP_URL source).
      ev = await bootstrapRunner.runStage({
        scriptPath: scriptInfo.path,
        installerKind: scriptInfo.kind || "powershell",
        stage: { name: "repository" },
        emit,
        wayneHome: WAYNE_HOME,
        activeRoot: ENGINE_ROOT,
        abortSignal: updateAbort.signal,
        installStamp: null,
      });
    } finally {
      clearTimeout(cap);
      if (engine.bootAbort) {
        engine.bootAbort.signal.removeEventListener("abort", onBootAbort);
      }
    }
    if (ev && ev.state === "succeeded") {
      writeEngineSource({
        version: typeof manifest.version === "string" ? manifest.version : null,
        zipUrl: manifest.zipUrl,
        updatedAt: new Date().toISOString(),
      });
    }
    // failed/skipped → fall open: keep the current engine, no marker write.
    return true;
  } catch {
    /* fail-open — never block the boot over an update */
    return false;
  }
}

// WAYNE_HOME do desktop = o MESMO default do install.ps1 e do backend
// (wayne_constants._get_platform_default_wayne_home): %LOCALAPPDATA%\wayne no
// Windows, ~/.wayne fora. Env WAYNE_HOME explícito vence (normalizado pra
// nunca apontar pra dentro de profiles/<nome>). O MESMO wayneHome vai pro
// runner do bootstrap E pro env do child — uma fonte só.
function resolveWayneHome() {
  const explicit = (process.env.WAYNE_HOME || "").trim();
  if (explicit) return backendEnvMod.normalizeWayneHomeRoot(explicit);
  if (process.platform === "win32") {
    const base =
      (process.env.LOCALAPPDATA || "").trim() || path.join(os.homedir(), "AppData", "Local");
    return path.join(base, "wayne");
  }
  return path.join(os.homedir(), ".wayne");
}
const WAYNE_HOME = resolveWayneHome();
// Onde o install.ps1 instala o motor ($InstallDir = "<WAYNE_HOME>\wayne-agent").
const ENGINE_ROOT = path.join(WAYNE_HOME, "wayne-agent");
// O .env que o backend lê (env_loader.load_wayne_dotenv: Path($WAYNE_HOME)/.env
// — o child recebe WAYNE_HOME explícito, então é ESTE arquivo, garantido).
const ENGINE_ENV_FILE = path.join(WAYNE_HOME, ".env");
// (1) da escada: checkout de dev com venv próprio (só via env, nunca implícito).
const DEV_SOURCE_ROOT = (() => {
  const v = (process.env.W4Y_DEV_SOURCE_ROOT || "").trim();
  return v ? path.resolve(v) : null;
})();

// Estado único do motor/boot. `generation` invalida sequências antigas (retry/
// "Usar na nuvem" no meio de um boot em andamento).
const engine = {
  child: null,
  port: 0,
  origin: null, // "http://127.0.0.1:<porta>" quando pronto
  phase: "idle", // resolve | bootstrap | update | key | spawn | ready | error | cloud
  lastError: null,
  booting: false,
  retries: 0,
  generation: 0,
  keyWaiter: null,
  bootAbort: null,
  usingCloud: false,
  // The gate variant currently on screen ({ needModel, needComposio } | null).
  // The skip IPC consults it so "não perguntar de novo" can only ever snooze
  // the composio-ONLY gate — never the model-key one.
  lastGate: null,
  // Replay pro boot.html (F5 / janela recriada): eventos estruturais + cauda
  // do log. O boot.html chama w4y:boot:state no load e re-aplica tudo.
  events: [],
  logLines: [],
};

// ── Contrato IPC do boot (main → boot.html): canal "w4y:boot:event" ────────
//   { type:"phase", phase, message? }            fase da sequência
//   { type:"bootstrap", ev:{...} }               evento CRU do bootstrap-runner
//     (ev.type: manifest | stage | log | complete | failed — ver o cabeçalho
//      de bootstrap-runner.cjs; manifest.stages traz name/title/category)
//   { type:"log", line, stream }                 stdout/stderr do motor no boot
//   { type:"notice", text }                      aviso persistente (ex.: 402)
// boot.html → main (invoke): w4y:boot:state | w4y:boot:key:submit |
//   w4y:boot:key:skip | w4y:boot:login | w4y:boot:login:cancel |
//   w4y:boot:retry | w4y:boot:cloud
function recordBootEvent(ev) {
  const isLog =
    ev.type === "log" || (ev.type === "bootstrap" && ev.ev && ev.ev.type === "log");
  if (isLog) {
    const line = ev.type === "log" ? ev.line : ev.ev.line;
    if (line) {
      engine.logLines.push(String(line));
      if (engine.logLines.length > 500) engine.logLines.splice(0, engine.logLines.length - 500);
    }
    return;
  }
  engine.events.push(ev);
  if (engine.events.length > 400) engine.events.splice(0, engine.events.length - 400);
}

function sendBootEvent(ev) {
  recordBootEvent(ev);
  try {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("w4y:boot:event", ev);
    }
  } catch {
    /* janela fechando — o replay via w4y:boot:state cobre */
  }
}

function setPhase(phase, message, extra) {
  engine.phase = phase;
  if (phase !== "error") engine.lastError = null;
  sendBootEvent({ type: "phase", phase, message: message || null, ...(extra || {}) });
}

/** Where the bundled copy of the product's interface lives. */
function appUiDir() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app-ui")
    : path.join(__dirname, "..", "..", "wayne_cli", "web_dist");
}

/**
 * The opening frame: the PRODUCT, not a screen about the product.
 *
 * The shell serves its bundled copy of the interface right away, so the window
 * paints the real sidebar/header/hero while the engine is still starting behind
 * it. When the engine answers, startLocalEngine loads its origin and the swap
 * is invisible — same bundle, now with a session.
 *
 * Falls back to boot.html whenever the bundle is missing, and boot.html remains
 * the surface for the states that genuinely need words: first install, the key
 * gate and failures.
 */
async function showProductPreview() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return false;
    const origin = await bootPreview.start(appUiDir());
    if (!origin) return false;
    await mainWindow.loadURL(origin);
    return true;
  } catch {
    return false;
  }
}

function showBootPage() {
  try {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    const current = mainWindow.webContents.getURL() || "";
    if (!/boot\.html/i.test(current)) {
      void mainWindow.loadFile(path.join(__dirname, "boot.html"));
    }
  } catch {
    /* best-effort */
  }
}

function bootFail(message) {
  engine.lastError = message;
  engine.phase = "error";
  sendBootEvent({ type: "phase", phase: "error", message });
  showBootPage();
}

// ── Escada de resolução do backend (versão enxuta do resolveHermesBackend do
// upstream, apps/desktop/electron/main.cjs:2985) ────────────────────────────
//   (1) dev:       W4Y_DEV_SOURCE_ROOT → venv do checkout
//   (2) instalado: <WAYNE_HOME>\wayne-agent com venv que importa wayne_cli
//   (3) nada       → bootstrap guiado (install.ps1 via bootstrap-runner)
// Sem pool multi-perfil e sem PATH-lookup: o desktop só confia em venv que
// PROVOU importar wayne_cli.config (backend-probes.canImportWayneCli).
function venvPythonPath(root) {
  return process.platform === "win32"
    ? path.join(root, "venv", "Scripts", "python.exe")
    : path.join(root, "venv", "bin", "python");
}

// `serve` sempre; se o runtime for antigo (dashboard.py sem o subcomando
// serve), cai pro `dashboard --no-open` — mesma detecção do upstream, via
// backend-command.sourceDeclaresServe sobre o fonte real do runtime.
function buildEngineArgs(root) {
  const args = ["-m", "wayne_cli.main", ...backendCommand.serveBackendArgs()];
  try {
    const src = fs.readFileSync(
      path.join(root, "wayne_cli", "subcommands", "dashboard.py"),
      "utf8",
    );
    if (!backendCommand.sourceDeclaresServe(src)) {
      return backendCommand.dashboardFallbackArgs(args);
    }
  } catch {
    /* fonte ausente/ilegível → confia no serve (runtime atual) */
  }
  return args;
}

function pythonBackendCandidate(root, label) {
  try {
    const python = venvPythonPath(root);
    if (!fs.existsSync(python)) return null;
    const venvRoot = path.join(root, "venv");
    const env = backendEnvMod.buildDesktopBackendEnv({
      wayneHome: WAYNE_HOME,
      pythonPathEntries: [root],
      venvRoot,
    });
    if (!backendProbes.canImportWayneCli(python, { env: { ...env, WAYNE_HOME } })) return null;
    return { kind: "python", label, command: python, args: buildEngineArgs(root), root, env };
  } catch {
    return null;
  }
}

function resolveEngineBackend() {
  if (DEV_SOURCE_ROOT) {
    const dev = pythonBackendCandidate(DEV_SOURCE_ROOT, `dev checkout ${DEV_SOURCE_ROOT}`);
    if (dev) return dev;
  }
  const installed = pythonBackendCandidate(ENGINE_ROOT, `motor instalado ${ENGINE_ROOT}`);
  if (installed) return installed;
  // Self-heal: the canonical path is a junction now, and a crash between the
  // unlink and the re-link (power loss mid-promotion) would leave it missing —
  // which alone would look like "no engine installed" and trigger a full
  // reinstall behind the very screen this release removes. The marker still
  // knows which slot holds a working tree, so boot from it and put the link
  // back on the way.
  try {
    const marked = readEngineSource();
    const slot = marked && marked.root ? marked.root : null;
    if (slot && slot !== ENGINE_ROOT) {
      const fromSlot = pythonBackendCandidate(slot, `motor instalado ${slot}`);
      if (fromSlot) {
        try {
          engineSlots.pointJunction(ENGINE_ROOT, slot);
        } catch {
          /* the link can be repaired later; booting matters more */
        }
        return fromSlot;
      }
    }
  } catch {
    /* fall through to bootstrap */
  }
  return { kind: "bootstrap-needed" };
}

// Stamp opcional gravado pelo empacotamento (<resources>/install-stamp.json,
// {commit|tag|version|branch}) — pina o ref que o install.ps1 baixa. Ausente
// em dev; o instalador então usa o default dele.
function readInstallStamp() {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.resourcesPath, "install-stamp.json"), "utf8"),
    );
  } catch {
    return null;
  }
}

// ── Chave de modelo no 1º boot ─────────────────────────────────────────────
// O backend semeia OPENROUTER_API_KEY preferindo <WAYNE_HOME>\.env
// (credential_pool._get_env_prefer_dotenv). Sem chave lá, o boot.html pede
// (campo mascarado) ANTES de subir o motor; pular = sobe sem chave (o backend
// degrada com o erro próprio dele). O VALOR NUNCA é logado nem re-emitido.
// 0.3.4: generalized — the gate also opens when COMPOSIO_API_KEY is missing.
function envHasKey(name) {
  try {
    const content = fs.readFileSync(ENGINE_ENV_FILE, "utf8");
    const re = new RegExp(`^\\s*(?:export\\s+)?${name}\\s*=\\s*(.*)\\s*$`);
    for (const raw of content.split(/\r?\n/)) {
      const m = raw.match(re);
      if (!m) continue;
      let v = m[1].trim();
      if (
        (v.startsWith('"') && v.endsWith('"') && v.length >= 2) ||
        (v.startsWith("'") && v.endsWith("'") && v.length >= 2)
      ) {
        v = v.slice(1, -1);
      }
      if (v) return true;
    }
  } catch {
    /* sem .env ainda = sem chave */
  }
  return false;
}

// ── Login-gate snooze (0.3.5) ──────────────────────────────────────────────
// <userData>\login-gate.json = { composioSnoozed: true }. Written when the
// user checks "não perguntar de novo" on the composio-ONLY gate ("Agora não").
// It ONLY silences the connect-your-apps variant: the model-key gate is never
// snoozeable (without a key the engine is useless), which the gate condition
// enforces by construction — needModel always opens it. The tray keeps an
// explicit "Entrar com Work4You" entry for whoever snoozed and regrets it.
function loginGateFile() {
  return path.join(app.getPath("userData"), "login-gate.json");
}

function readLoginGate() {
  try {
    const j = JSON.parse(fs.readFileSync(loginGateFile(), "utf8"));
    return j && typeof j === "object" ? j : {};
  } catch {
    return {};
  }
}

function writeLoginGate(patch) {
  try {
    fs.writeFileSync(
      loginGateFile(),
      JSON.stringify({ ...readLoginGate(), ...patch }),
      "utf8",
    );
  } catch {
    /* best-effort — worst case the gate asks again next boot */
  }
}

// Upsert idempotente de UMA variável no <WAYNE_HOME>\.env (o arquivo que o
// backend lê via env_loader.load_wayne_dotenv — override=True a cada request,
// então valor novo vale sem reiniciar o motor). O VALOR nunca é logado.
function upsertEngineEnvKey(name, rawKey) {
  const key = String(rawKey || "").trim();
  // ASCII imprimível sem espaços: bloqueia quebra de linha/controle (injeção
  // de .env) e valores obviamente corrompidos. Nunca logar nem ecoar o valor.
  if (!key || key.length > 512 || !/^[\x21-\x7e]+$/.test(key)) {
    return { ok: false, error: "invalid-key" };
  }
  try {
    fs.mkdirSync(WAYNE_HOME, { recursive: true });
    let content = "";
    try {
      content = fs.readFileSync(ENGINE_ENV_FILE, "utf8");
    } catch {
      /* primeiro .env */
    }
    const line = `${name}=${key}`;
    const re = new RegExp(`^[ \\t]*(?:export[ \\t]+)?${name}[ \\t]*=.*$`, "m");
    // Replacer em função: um "$" no valor da key não pode virar padrão de
    // substituição ($&, $' …) do String.replace.
    const next = re.test(content)
      ? content.replace(re, () => line)
      : (content ? content.replace(/\n*$/, "\n") : "") + line + "\n";
    fs.writeFileSync(ENGINE_ENV_FILE, next, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, error: "write-failed" };
  }
}

function upsertOpenRouterKey(rawKey) {
  return upsertEngineEnvKey("OPENROUTER_API_KEY", rawKey);
}

// ── mcp_servers.composio in <WAYNE_HOME>\config.yaml (0.3.4 broker) ────────
// The engine's connector TOOLS come from this MCP entry, not from the key
// alone (2nd elo, 17/07): the cloud got it written by its connect flow, the
// local engine is born without it. Text surgery instead of a YAML library —
// the shell ships no YAML dep and must NEVER reformat the user's config:
//   entry exists            → replace ONLY its url line (tool-router session)
//   mcp_servers, no entry   → insert the composio block as first child
//   no mcp_servers          → append the whole block at the end
// CRLF and a leading BOM are preserved; the result is sanity-checked before
// writing and the previous file is kept as config.yaml.bak. The URL carries
// no secret (auth rides the ${COMPOSIO_API_KEY} placeholder header, resolved
// by the engine at read time) — but it is never logged anyway.
function upsertComposioMcpServer(rawUrl) {
  const url = String(rawUrl || "").trim();
  // https + printable ASCII, no quotes/backslash/# — anything else could break
  // the YAML line or smuggle a comment. YAML-critical ": " cannot occur (no
  // spaces at all are allowed).
  if (!/^https:\/\/[\x21-\x7e]+$/.test(url) || /["'#\\]/.test(url)) {
    return { ok: false, error: "invalid-url" };
  }
  try {
    const file = path.join(WAYNE_HOME, "config.yaml");
    let raw = "";
    let existed = false;
    try {
      raw = fs.readFileSync(file, "utf8");
      existed = true;
    } catch {
      /* no config yet — the append branch below creates it */
    }
    const bom = raw.startsWith("\uFEFF") ? "\uFEFF" : "";
    const body = bom ? raw.slice(1) : raw;
    const eol = body.includes("\r\n") ? "\r\n" : "\n";
    const lines = body.length ? body.split(/\r\n|\n/) : [];
    const isBlank = (s) => /^\s*(#.*)?$/.test(s);
    const indentOf = (s) => (s.match(/^[ \t]*/) || [""])[0].length;

    // Top-level "mcp_servers:" (block form only — an inline "{...}" value does
    // not match and falls through to the append branch; PyYAML resolves the
    // resulting duplicate top-level key as last-wins).
    let mcpIdx = -1;
    for (let i = 0; i < lines.length; i += 1) {
      if (/^mcp_servers\s*:\s*(#.*)?$/.test(lines[i])) {
        mcpIdx = i;
        break;
      }
    }
    let sectionEnd = lines.length;
    let composioIdx = -1;
    if (mcpIdx !== -1) {
      for (let i = mcpIdx + 1; i < lines.length; i += 1) {
        if (!isBlank(lines[i]) && indentOf(lines[i]) === 0) {
          sectionEnd = i;
          break;
        }
      }
      for (let i = mcpIdx + 1; i < sectionEnd; i += 1) {
        if (/^[ \t]+composio\s*:\s*(#.*)?$/.test(lines[i])) {
          composioIdx = i;
          break;
        }
      }
    }

    const out = lines.slice();
    if (composioIdx !== -1) {
      // Entry exists → touch ONLY the url line inside the composio block.
      const cIndent = indentOf(lines[composioIdx]);
      let blockEnd = sectionEnd;
      for (let i = composioIdx + 1; i < sectionEnd; i += 1) {
        if (!isBlank(lines[i]) && indentOf(lines[i]) <= cIndent) {
          blockEnd = i;
          break;
        }
      }
      let urlIdx = -1;
      for (let i = composioIdx + 1; i < blockEnd; i += 1) {
        if (indentOf(lines[i]) > cIndent && /^[ \t]+url\s*:/.test(lines[i])) {
          urlIdx = i;
          break;
        }
      }
      if (urlIdx !== -1) {
        const keep = (lines[urlIdx].match(/^[ \t]*/) || [""])[0];
        out[urlIdx] = `${keep}url: ${url}`;
      } else {
        out.splice(composioIdx + 1, 0, `${" ".repeat(cIndent + 2)}url: ${url}`);
      }
    } else {
      const blockLines = (indent) => [
        `${indent}composio:`,
        `${indent}  url: ${url}`,
        `${indent}  headers:`,
        `${indent}    x-api-key: ` + "${COMPOSIO_API_KEY}",
        `${indent}  enabled: true`,
      ];
      if (mcpIdx !== -1) {
        // Section exists without the entry → first child, sibling indentation.
        let childIndent = 2;
        for (let i = mcpIdx + 1; i < sectionEnd; i += 1) {
          if (!isBlank(lines[i])) {
            childIndent = indentOf(lines[i]);
            break;
          }
        }
        out.splice(mcpIdx + 1, 0, ...blockLines(" ".repeat(childIndent)));
      } else {
        while (out.length && out[out.length - 1].trim() === "") out.pop();
        out.push("mcp_servers:", ...blockLines("  "));
      }
    }

    const result = bom + out.join(eol) + eol;
    // Sanity before writing: the fresh session URL landed exactly once, the
    // composio key line is present, and nothing was dropped. In doubt → abort
    // (never corrupt the user's YAML; the boot goes on without the entry).
    const urlCount = result.split(url).length - 1;
    if (urlCount !== 1 || !/(^|\n)[ \t]+composio\s*:/.test(result) || out.length < lines.length) {
      return { ok: false, error: "sanity-check-failed" };
    }
    if (existed) {
      try {
        fs.copyFileSync(file, file + ".bak");
      } catch {
        /* backup is best-effort */
      }
    }
    fs.mkdirSync(WAYNE_HOME, { recursive: true });
    fs.writeFileSync(file, result, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, error: "write-failed" };
  }
}

// ── Tenant-as-broker (0.3.4): connector bootstrap after login ──────────────
// GET /api/device/connector-bootstrap on the tenant, riding the login cookies
// (the LB routes /api/* to the tenant; the route sits behind the dashboard
// auth). Delivers the tenant's Composio key AND a FRESH tool-router session
// URL minted for THIS device (cloud sessions are stateful+single-consumer —
// never copied). Both are installed locally: key → .env, url →
// mcp_servers.composio in config.yaml. Best-effort by contract: any failure
// (404 = tenant without Composio, network, YAML sanity) boots without local
// connectors. Values are NEVER logged.
async function bootstrapLocalConnectors() {
  try {
    const res = await cloudApiRequest({
      method: "GET",
      path: "/api/device/connector-bootstrap",
    });
    if (!res.ok || !res.json) return false;
    const key =
      typeof res.json.composio_key === "string" ? res.json.composio_key.trim() : "";
    const mcpUrl = typeof res.json.mcp_url === "string" ? res.json.mcp_url.trim() : "";
    let wrote = false;
    if (key) wrote = upsertEngineEnvKey("COMPOSIO_API_KEY", key).ok || wrote;
    if (mcpUrl) wrote = upsertComposioMcpServer(mcpUrl).ok || wrote;
    return wrote;
  } catch {
    return false;
  }
}

// ── "Entrar com Work4You" (0.3.2): login delivers the key ──────────────────
// Primary path of the key gate. The main opens a child window on the cloud
// login page (cookies land in session.defaultSession, the shell's standard
// login partition) and polls POST /device/engine-key WITH those cookies
// (net.request + useSessionCookies — same pattern as the parked desktop's
// fetchJsonViaOauthSession). 401 = not logged in yet, keep waiting; 200 =
// key minted → written to <WAYNE_HOME>\.env via the existing upsert; 429 =
// wait 60s once; 402 = tenant without credit → clear notice and boot WITHOUT
// a key (the Grátis tier runs keyless). The key value is NEVER logged, never
// enters boot events and is never echoed back to the renderer.
const DEVICE_KEY_URL =
  (process.env.W4Y_DEVICE_KEY_URL || "").trim() || `${APP_ORIGIN}/device/engine-key`;
const LOGIN_URL = `${APP_ORIGIN}/login`;

function releaseKeyWaiter() {
  if (engine.keyWaiter) {
    const w = engine.keyWaiter;
    engine.keyWaiter = null;
    try {
      w();
    } catch {
      /* ignore */
    }
  }
}

// One POST to /device/engine-key riding the default session's cookies.
// Resolves { status, json } (json null when the body is not JSON); rejects
// only on network error/timeout. Error paths never carry the response body.
function requestDeviceEngineKey(timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (err) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    let request;
    try {
      request = net.request({
        method: "POST",
        url: DEVICE_KEY_URL,
        session: session.defaultSession,
        useSessionCookies: true,
        redirect: "follow",
      });
    } catch (err) {
      fail(err);
      return;
    }
    const timer = setTimeout(() => {
      try {
        request.abort();
      } catch {
        /* already finished */
      }
      fail(new Error("device-key request timed out"));
    }, timeoutMs);
    request.setHeader("Content-Type", "application/json");
    request.setHeader("Accept", "application/json");
    request.on("response", (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        let json = null;
        try {
          json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          /* non-JSON body (login redirect HTML etc.) — status decides */
        }
        resolve({ status: res.statusCode || 0, json });
      });
      res.on("error", (err) => {
        clearTimeout(timer);
        fail(err);
      });
    });
    request.on("error", (err) => {
      clearTimeout(timer);
      fail(err);
    });
    request.write(JSON.stringify({ deviceLabel: os.hostname() }));
    request.end();
  });
}

// Child login window. No preload (the cloud login page needs none of our
// bridges); popups restricted to the app + login providers, everything else
// goes to the system browser.
function openLoginWindow() {
  const win = new BrowserWindow({
    width: 480,
    height: 700,
    parent: mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined,
    title: "Entrar — Work4You",
    autoHideMenuBar: true,
    backgroundColor: "#0e0e0e",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const host = new URL(url).host;
      if (host === APP_HOST || host.endsWith(".work4you.ai") || AUTH_HOST.test(host)) {
        return { action: "allow" };
      }
      void shell.openExternal(url);
    } catch {
      /* unparseable URL → deny */
    }
    return { action: "deny" };
  });
  void win.loadURL(LOGIN_URL);
  return win;
}

// Interruptible sleep: resolves early as soon as stale() turns true.
function sleepWhileFresh(ms, stale) {
  return new Promise((resolve) => {
    const startedAt = Date.now();
    const tick = () => {
      if (stale() || Date.now() - startedAt >= ms) {
        resolve();
        return;
      }
      setTimeout(tick, 500);
    };
    tick();
  });
}

let loginFlow = null; // { win, cancelled } while the login flow is running

function closeLoginWindow(flow) {
  const win = flow && flow.win;
  flow.win = null;
  try {
    if (win && !win.isDestroyed()) win.destroy();
  } catch {
    /* already gone */
  }
}

function cancelLoginFlow() {
  const flow = loginFlow;
  if (!flow) return { ok: true };
  flow.cancelled = true;
  closeLoginWindow(flow);
  return { ok: true };
}

// The whole login→key sequence. Resolves { ok:true, got:"key"|"no-credit",
// wroteConnectors } on success (the key gate is released by then) or
// { ok:false, reason } — "cancelled" (user closed the login window → back to
// the gate), "busy", "not-waiting", "rate-limited", "network", "write-failed",
// "invalid-response".
// 0.3.5: opts.external = the SAME flow invoked outside the boot gate (tray's
// "Entrar com Work4You"). It skips the phase gating (the engine is already
// running) and its staleness ignores boot generations — only an explicit
// cancel/closed window/quit ends it. The written key applies live (the engine
// re-reads .env per request); the connector MCP entry needs an engine restart,
// which the tray caller offers.
async function runLoginFlow(opts) {
  const external = !!(opts && opts.external);
  // A leftover flow (e.g. F5 on boot.html mid-login: the page's invoke died
  // with it, but the flow keeps running here) is cancelled and superseded —
  // the fresh click always gets a fresh window. Same-page double-clicks are
  // debounced in boot.html.
  if (loginFlow) {
    cancelLoginFlow();
    await new Promise((resolve) => setTimeout(resolve, 600)); // let it unwind
    if (loginFlow) return { ok: false, reason: "busy" };
  }
  if (!external && engine.phase !== "key") return { ok: false, reason: "not-waiting" };
  const flow = { win: null, cancelled: false };
  loginFlow = flow;
  const gen = engine.generation;
  // The flow dies with: explicit cancel, closed login window, quit — and, on
  // the boot-gate path only, a boot generation change (retry / "Usar na
  // nuvem") or the gate being released by another path (manual key / skip
  // moved the phase past "key").
  const stale = () =>
    flow.cancelled ||
    isQuitting ||
    (!external &&
      (gen !== engine.generation || engine.usingCloud || engine.phase !== "key"));
  try {
    const win = openLoginWindow();
    flow.win = win;
    win.on("closed", () => {
      flow.win = null;
      flow.cancelled = true;
    });
    let retried429 = false;
    let softFailures = 0;
    while (!stale()) {
      let res;
      try {
        res = await requestDeviceEngineKey();
        softFailures = 0;
      } catch {
        softFailures += 1;
        if (softFailures >= 5) return { ok: false, reason: "network" };
        await sleepWhileFresh(5_000, stale);
        continue;
      }
      if (stale()) break;
      if (res.status === 200) {
        const key = res.json && typeof res.json.key === "string" ? res.json.key : "";
        if (!key) return { ok: false, reason: "invalid-response" };
        const r = upsertOpenRouterKey(key);
        if (!r.ok) return { ok: false, reason: "write-failed" };
        // S0 conectores (0.3.3): a resposta pode trazer a chave Composio do
        // projeto dedicado do tenant — grava COMPOSIO_API_KEY no mesmo .env
        // (mesmo upsert, mesma garantia de não-log). Best-effort: sem ela o
        // motor sobe normal, só sem conectores locais. Como o gate roda ANTES
        // do spawn e o backend relê o .env a cada request (load_wayne_dotenv,
        // override=True), a chave vale já no primeiro /api/connectors.
        const composioKey =
          res.json && typeof res.json.composioKey === "string" ? res.json.composioKey : "";
        if (composioKey) upsertEngineEnvKey("COMPOSIO_API_KEY", composioKey);
        // 0.3.4 broker: the definitive connector delivery — Composio key +
        // fresh tool-router session, written to .env/config.yaml BEFORE the
        // gate releases (the engine spawns right after and reads both).
        // Best-effort: a failure here never blocks the boot.
        const wroteConnectors = await bootstrapLocalConnectors();
        releaseKeyWaiter();
        return { ok: true, got: "key", wroteConnectors };
      }
      if (res.status === 401) {
        // Not logged in yet — keep polling while the user signs in.
        await sleepWhileFresh(4_000, stale);
        continue;
      }
      if (res.status === 429) {
        if (retried429) return { ok: false, reason: "rate-limited" };
        retried429 = true;
        await sleepWhileFresh(60_000, stale);
        continue;
      }
      if (res.status === 402) {
        // Tenant without credit: boot proceeds WITHOUT a key (Grátis tier).
        sendBootEvent({
          type: "notice",
          text: "Seu plano está sem créditos — o Wayne vai funcionar no modo Grátis.",
        });
        // No credit ≠ no connectors: the login cookies are live, so the
        // broker bootstrap still runs (best-effort, same as the 200 path).
        const wroteConnectors = await bootstrapLocalConnectors();
        releaseKeyWaiter();
        return { ok: true, got: "no-credit", wroteConnectors };
      }
      // Unexpected status (5xx, proxy…) — retry a few times, then give up.
      softFailures += 1;
      if (softFailures >= 5) return { ok: false, reason: "network" };
      await sleepWhileFresh(5_000, stale);
    }
    return { ok: false, reason: "cancelled" };
  } finally {
    closeLoginWindow(flow);
    loginFlow = null;
  }
}

// ── Log do motor: <userData>/engine.log com rotação simples (1 geração) ────
function engineLogPath() {
  return path.join(app.getPath("userData"), "engine.log");
}

function rotateEngineLog() {
  try {
    const p = engineLogPath();
    if (fs.statSync(p).size > 5 * 1024 * 1024) {
      fs.rmSync(p + ".1", { force: true });
      fs.renameSync(p, p + ".1");
    }
  } catch {
    /* sem log ainda / rotação é best-effort */
  }
}

function attachEngineLogging(child) {
  rotateEngineLog();
  let stream = null;
  try {
    stream = fs.createWriteStream(engineLogPath(), { flags: "a" });
    stream.write(`\n──── engine spawn ${new Date().toISOString()} pid=${child.pid} ────\n`);
  } catch {
    stream = null;
  }
  const forward = (streamName) => (chunk) => {
    if (stream) {
      try {
        stream.write(chunk);
      } catch {
        /* disco cheio etc. — não derruba o motor */
      }
    }
    // Enquanto o boot não terminou, espelha as linhas no boot.html (diagnóstico
    // real na tela). Depois de pronto, só o arquivo recebe.
    if (engine.phase === "ready") return;
    for (const raw of chunk.toString().split(/\r?\n/)) {
      const line = raw.trim();
      if (line) sendBootEvent({ type: "log", line, stream: streamName });
    }
  };
  child.stdout.on("data", forward("stdout"));
  child.stderr.on("data", forward("stderr"));
  child.on("close", () => {
    if (stream) {
      try {
        stream.end();
      } catch {
        /* best-effort */
      }
    }
  });
}

// ── Prontidão: corrida ready-file × anúncio no stdout ──────────────────────
// web_server.py grava {"port":N} no WAYNE_DESKTOP_READY_FILE (:16188-16196) E
// imprime "WAYNE_DASHBOARD_READY port=N" (:16439). Qualquer um serve; só
// rejeita quando OS DOIS falharem (cada waiter já cuida dos próprios listeners
// e rejeita em exit/timeout — engolir o perdedor evita unhandled rejection).
function waitEngineReady(child, readyFile) {
  const timeoutMs = backendReady.resolvePortAnnounceTimeoutMs(); // 90s default, cold-start friendly
  return new Promise((resolve, reject) => {
    let settled = false;
    let failures = 0;
    let lastErr = null;
    const ok = (port) => {
      if (!settled) {
        settled = true;
        resolve(port);
      }
    };
    const bad = (err) => {
      lastErr = err;
      failures += 1;
      if (!settled && failures >= 2) {
        settled = true;
        reject(lastErr);
      }
    };
    backendReady.waitForDashboardPort(child, timeoutMs).then(ok, bad);
    backendReady.waitForDashboardReadyFile(readyFile, child, timeoutMs).then(ok, bad);
  });
}

// ── Spawn do motor: `venv\python -m wayne_cli.main serve --host 127.0.0.1
// --port 0` com o env que o main.cjs DEVE prover (upstream :5571-5615):
// WAYNE_HOME explícito, token de sessão aleatório por boot, WAYNE_DESKTOP=1
// (cron in-app), ready-file, PATH/PYTHONPATH do venv. ─────────────────────
async function spawnEngine(backend) {
  const readyFile = path.join(app.getPath("userData"), "engine-ready.json");
  try {
    fs.rmSync(readyFile, { force: true });
  } catch {
    /* pode não existir */
  }
  const token = crypto.randomBytes(32).toString("base64url");
  const child = spawn(backend.command, backend.args, {
    cwd: backend.root,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      ...backend.env, // PYTHONPATH + PATH (venv primeiro) de buildDesktopBackendEnv
      WAYNE_HOME,
      WAYNE_DASHBOARD_SESSION_TOKEN: token,
      WAYNE_DESKTOP: "1",
      WAYNE_DESKTOP_READY_FILE: readyFile,
    },
  });
  attachEngineLogging(child);
  child.on("exit", (code, signal) => handleEngineExit(child, code, signal));
  engine.child = child;
  const port = await waitEngineReady(child, readyFile);
  return { child, port };
}

// ── Ciclo de vida ──────────────────────────────────────────────────────────
function killEngine() {
  const child = engine.child;
  engine.child = null;
  engine.origin = null;
  engine.port = 0;
  if (!child || child.exitCode !== null) return;
  child.__intentionalKill = true;
  try {
    if (process.platform === "win32") {
      // taskkill /T /F derruba a ÁRVORE (python → uvicorn → workers), como o
      // upstream faz; child.kill() sozinho deixaria órfãos no Windows.
      spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { windowsHide: true });
    } else {
      child.kill("SIGTERM");
    }
  } catch {
    /* já morreu */
  }
}

function handleEngineExit(child, code, signal) {
  if (child.__intentionalKill || isQuitting) return;
  if (engine.child !== child) return; // spawn antigo — já substituído
  engine.child = null;
  engine.origin = null;
  engine.port = 0;
  if (engine.usingCloud) return;
  // Morreu DURANTE o boot: o waitEngineReady rejeita e o catch do
  // startLocalEngine mostra a tela de erro — nada a fazer aqui.
  if (engine.booting) return;
  if (engine.retries < 1) {
    engine.retries += 1;
    showBootPage();
    setPhase("resolve", "O motor parou — reiniciando…");
    void startLocalEngine();
  } else {
    bootFail(`O motor local parou inesperadamente (${signal || code || "sem código"}).`);
  }
}

function useCloudShell() {
  engine.usingCloud = true;
  engine.generation += 1; // invalida qualquer sequência de boot em andamento
  try {
    if (engine.bootAbort) engine.bootAbort.abort();
  } catch {
    /* best-effort */
  }
  cancelLoginFlow();
  releaseKeyWaiter();
  killEngine();
  engine.phase = "cloud";
  sendBootEvent({ type: "phase", phase: "cloud", message: null });
  if (mainWindow && !mainWindow.isDestroyed()) void mainWindow.loadURL(APP_URL);
}

function retryLocalBoot() {
  if (engine.booting) return { ok: false, error: "busy" };
  engine.usingCloud = false;
  engine.retries = 0;
  showBootPage();
  void startLocalEngine();
  return { ok: true };
}

// ── Sequência de boot: resolve → (bootstrap) → chave → spawn → ready ───────
async function startLocalEngine() {
  if (CLOUD_SHELL || engine.usingCloud || engine.booting || isQuitting) return;
  engine.booting = true;
  const gen = ++engine.generation;
  const aborted = () => gen !== engine.generation || engine.usingCloud || isQuitting;
  engine.bootAbort = new AbortController();
  try {
    // A version installed in the background on a previous run is switched on
    // HERE, and switching is only a junction repoint — no download, no
    // install, no waiting. This is why the update screen is gone.
    promoteStagedEngine();
    setPhase("resolve", "Verificando o motor local…");
    let backend = resolveEngineBackend();

    // The window shows the PRODUCT while the engine starts behind it. Only a
    // first install (nothing to preview yet) keeps the explaining screen.
    if (backend.kind !== "bootstrap-needed") {
      await showProductPreview();
      if (aborted()) return;
    }

    if (backend.kind === "bootstrap-needed") {
      setPhase("bootstrap", "Instalando o motor local…");
      // Fonte do motor pro install.ps1: o runner espalha process.env no spawn,
      // então setar aqui chega ao script como WAYNE_SOURCE_ZIP_URL.
      const engineZipUrl = await resolveEngineZipUrlLive();
      process.env.WAYNE_SOURCE_ZIP_URL = engineZipUrl;
      const result = await bootstrapRunner.runBootstrap({
        installStamp: readInstallStamp(),
        activeRoot: ENGINE_ROOT,
        sourceRepoRoot:
          DEV_SOURCE_ROOT || (!app.isPackaged ? path.resolve(__dirname, "..", "..") : null),
        packagedScriptDir: app.isPackaged ? path.join(process.resourcesPath, "scripts") : null,
        wayneHome: WAYNE_HOME,
        logRoot: path.join(WAYNE_HOME, "logs"),
        abortSignal: engine.bootAbort.signal,
        onEvent: (ev) => sendBootEvent({ type: "bootstrap", ev }),
        writeMarker: (payload) => payload,
      });
      if (aborted()) return;
      if (!result || !result.ok) {
        bootFail(
          result && result.error
            ? `A instalação falhou: ${result.error}`
            : "A instalação do motor local falhou.",
        );
        return;
      }
      backend = resolveEngineBackend();
      if (backend.kind === "bootstrap-needed") {
        bootFail(
          "A instalação terminou, mas o motor local não ficou utilizável. " +
            "Veja os detalhes técnicos e tente de novo.",
        );
        return;
      }
      // Record which ZIP this install came from (the URL handed to install.ps1
      // above) so the boot-time update check has a baseline to compare against.
      writeEngineSource({
        version: null,
        // O MESMO valor entregue ao install.ps1 acima — não resolver de novo,
        // senão o marcador pode registrar uma fonte diferente da instalada.
        zipUrl: engineZipUrl,
        updatedAt: new Date().toISOString(),
      });
    } else if (backend.root === ENGINE_ROOT && BOOT_UPDATE_ESCAPE_HATCH) {
      // Legacy blocking path, now OFF by default (W4Y_ENGINE_BOOT_UPDATE=1 to
      // bring it back for one release). It downloaded and installed the engine
      // HERE, before the window could show anything — the black "Atualizando o
      // motor…" screen the owner rightly refused. The replacement is:
      // promoteStagedEngine() above (milliseconds) + a background install after
      // the app is already on screen.
      const refreshedTree = await maybeUpdateEngine();
      if (aborted()) return;
      if (refreshedTree) {
        const refreshed = resolveEngineBackend();
        if (refreshed.kind !== "bootstrap-needed") backend = refreshed;
      }
    }
    if (aborted()) return;

    // Gate (0.3.4): opens whenever SOMETHING is missing — the model key OR the
    // Composio key. With the model key present and only Composio missing, the
    // boot.html renders the login as "connect your apps" and offers "Agora
    // não" (skip): a provisional/manual model key must never permanently hide
    // the login that delivers the connectors.
    // 0.3.5: the composio-ONLY variant respects the persisted "não perguntar
    // de novo" snooze (login-gate.json). The model gate is NEVER skipped —
    // needModel bypasses the snooze by construction.
    const needModel = !envHasKey("OPENROUTER_API_KEY");
    const needComposio = !envHasKey("COMPOSIO_API_KEY");
    const composioSnoozed = readLoginGate().composioSnoozed === true;
    if (needModel || (needComposio && !composioSnoozed)) {
      engine.lastGate = { needModel, needComposio };
      // The preview is a picture of the product; it cannot take a password.
      // Anything that must SPEAK to the user goes back to boot.html.
      showBootPage();
      setPhase("key", null, { gate: { needModel, needComposio } });
      await new Promise((resolve) => {
        engine.keyWaiter = resolve;
      });
      engine.keyWaiter = null;
      engine.lastGate = null;
      if (aborted()) return;
    }

    setPhase("spawn", "Iniciando o motor local…");
    const { port } = await spawnEngine(backend);
    if (aborted()) {
      killEngine();
      return;
    }
    engine.port = port;
    engine.origin = `http://127.0.0.1:${port}`;
    // 60s estável = zera o contador de restart (1 retry por queda, não por vida).
    const child = engine.child;
    if (child) {
      child.__readyAt = Date.now();
      setTimeout(() => {
        if (engine.child === child) engine.retries = 0;
      }, 60_000);
    }
    setPhase("ready", "Abrindo…");
    // O servidor injeta window.__WAYNE_SESSION_TOKEN__ no index.html que serve
    // (web_server.py:15055-15075) — o loadURL abaixo já entra autenticado.
    if (mainWindow && !mainWindow.isDestroyed()) {
      await mainWindow.loadURL(engine.origin);
    }
    // The engine serves the same interface now — the preview has no more job.
    bootPreview.stop();
    // The app is on screen. Only now is a promotion proven good, and only now
    // may we spend bandwidth on the next one.
    verifyPromotion();
    scheduleBackgroundEngineUpdate();
  } catch (err) {
    if (!aborted()) {
      killEngine();
      // A promotion that cannot boot is undone here rather than leaving the
      // user with a dead app: next start is the engine that worked.
      const undone = rollbackPromotion();
      bootFail(
        undone
          ? "Voltamos para a versão anterior do motor porque a nova não iniciou. Reabra o aplicativo."
          : `O motor local não subiu: ${(err && err.message) || err}`,
      );
    }
  } finally {
    engine.booting = false;
  }
}

/**
 * A promotion is only trustworthy once the window actually loaded from the new
 * engine. That is what makes the previous slot disposable.
 */
function verifyPromotion() {
  try {
    const state = updateState.readState(WAYNE_HOME);
    if (state.phase !== "promoted-pending-verify") return;
    updateState.writeState(WAYNE_HOME, {
      phase: "idle",
      attempts: 0,
      lastError: null,
      lastErrorStage: null,
      // The engine booted: nothing is pending any more, including a manual
      // retry that had failed earlier. Leaving the flag set kept the warning
      // pill up over a version that was already running fine.
      manualRetryFailed: false,
    });
    const current = readEngineSource();
    if (current && current.previousRoot) {
      // Keep it one more session as a cheap safety net; the boot GC collects it.
      writeEngineSource({ ...current, previousRoot: current.previousRoot });
    }
  } catch {
    /* verification is an optimisation, never a boot blocker */
  }
}

/**
 * Install the next engine version WHILE the current one keeps serving.
 *
 * Safe because install.ps1 only kills processes when the target already has a
 * `venv\` — a virgin slot skips that block entirely, so the running engine is
 * never touched. Deliberately delayed: the first minute after launch belongs
 * to the user, not to our downloads.
 */
function scheduleBackgroundEngineUpdate() {
  if (engine.updateTimer) return;
  const FIRST_DELAY = 40_000;
  const EVERY = 4 * 60 * 60 * 1000;
  engine.updateTimer = setTimeout(function run() {
    // runBackgroundEngineUpdate returns a single-flight HANDLE, not a promise.
    // Calling .finally() on it threw TypeError inside the timer and killed the
    // reschedule; runUpdateTick owns that contract now and is tested on it.
    void updateScheduler.runUpdateTick({
      run: () => runBackgroundEngineUpdate(),
      schedule: () => {
        engine.updateTimer = setTimeout(run, EVERY);
      },
      onError: (err) => updaterLog(`background tick failed: ${String((err && err.message) || err)}`),
    });
  }, FIRST_DELAY);
}

/**
 * Starts a background engine update unless one is already in flight.
 *
 * Returns the single-flight handle so callers can AWAIT the real work.
 * `retryEngineUpdate` needs that: it used to fire-and-forget and answer
 * `{ok:true}` immediately, which told the renderer "done" while the install
 * had not even started — and released the chip's guard far too early.
 */
function runBackgroundEngineUpdate() {
  if (CLOUD_SHELL || isQuitting) {
    return { started: false, token: null, promise: Promise.resolve({ ok: false, error: "unavailable" }) };
  }
  // The lock is taken synchronously inside run(); the work below only starts
  // on the next microtask, so no second caller can slip in during the awaits.
  const handle = engineUpdateFlight.run(() => runBackgroundEngineUpdateWork());
  if (handle.started) {
    // TERMINAL event, emitted AFTER the flight settles.
    //
    // Everything the work itself emits carries running:true, because the
    // single-flight still holds the lock while the work function runs — and
    // the chip deliberately ignores those to avoid clearing the pill
    // mid-install. Without this last event the renderer never heard that the
    // update had FINISHED, so success and failure both landed silently and
    // the chip waited for its next poll.
    void handle.promise.then(() => {
      // Chained on the settled promise, so single-flight has already cleared
      // its slot: isRunning() is false and the payload says running:false.
      notifyUpdateState({ reason: "flight-finished" });
    });
  }
  return handle;
}

async function runBackgroundEngineUpdateWork() {
  try {
    const manifest = await fetchEngineManifest();
    updateState.writeState(WAYNE_HOME, { lastCheckAt: new Date().toISOString() });
    if (!manifest || !manifest.zipUrl) return;

    const current = readEngineSource();
    if (current && current.zipUrl === manifest.zipUrl) return; // already on it
    const staged = readStaged();
    if (staged && staged.zipUrl === manifest.zipUrl) return; // already waiting

    if (!engineSlots.junctionsSupported(WAYNE_HOME)) {
      updateState.writeState(WAYNE_HOME, {
        phase: "failed",
        attempts: (updateState.readState(WAYNE_HOME).attempts || 0) + 1,
        lastError: "this filesystem does not support junctions",
        lastErrorStage: "prepare",
        lastAttemptAt: new Date().toISOString(),
      });
      notifyUpdateState();
      return;
    }

    engine.updating = true;
    updateState.writeState(WAYNE_HOME, {
      zipUrl: manifest.zipUrl,
      version: manifest.version ?? null,
      phase: "installing",
      lastAttemptAt: new Date().toISOString(),
    });

    const target = engineSlots.freshSlot(WAYNE_HOME, manifest.zipUrl);
    process.env.WAYNE_SOURCE_ZIP_URL = manifest.zipUrl;
    const scriptInfo = await bootstrapRunner.resolveInstallScript({
      installStamp: null,
      sourceRepoRoot:
        DEV_SOURCE_ROOT || (!app.isPackaged ? path.resolve(__dirname, "..", "..") : null),
      packagedScriptDir: app.isPackaged ? path.join(process.resourcesPath, "scripts") : null,
      wayneHome: WAYNE_HOME,
      emit: () => {},
    });

    const abort = new AbortController();
    const cap = setTimeout(() => abort.abort(), 30 * 60_000);
    let ev = null;
    try {
      ev = await bootstrapRunner.runStage({
        scriptPath: scriptInfo.path,
        installerKind: scriptInfo.kind || "powershell",
        stage: { name: "repository" },
        emit: () => {},
        wayneHome: WAYNE_HOME,
        activeRoot: target,
        installDir: target,
        abortSignal: abort.signal,
        installStamp: null,
      });
    } finally {
      clearTimeout(cap);
    }

    if (ev && ev.state === "succeeded" && engineSlots.isComplete(target)) {
      fs.writeFileSync(
        stagedFile(),
        JSON.stringify(
          {
            root: target,
            zipUrl: manifest.zipUrl,
            version: manifest.version ?? null,
            stagedAt: new Date().toISOString(),
          },
          null,
          2,
        ) + "\n",
        "utf8",
      );
      updateState.writeState(WAYNE_HOME, {
        phase: "staged",
        attempts: 0,
        lastError: null,
        lastErrorStage: null,
        // A successful stage clears the manual-retry warning too. Without
        // this the flag survived a working update and shouldWarnUser() kept
        // showing "pending" over a build that had already landed.
        manualRetryFailed: false,
      });
    } else {
      updateState.writeState(WAYNE_HOME, {
        phase: "failed",
        attempts: (updateState.readState(WAYNE_HOME).attempts || 0) + 1,
        lastError: (ev && ev.error) || "the installer did not finish",
        lastErrorStage: (ev && ev.stage) || "repository",
      });
    }
    notifyUpdateState();
  } catch (err) {
    updateState.writeState(WAYNE_HOME, {
      phase: "failed",
      attempts: (updateState.readState(WAYNE_HOME).attempts || 0) + 1,
      lastError: String((err && err.message) || err),
      lastErrorStage: "background",
    });
    notifyUpdateState();
  } finally {
    engine.updating = false;
  }
}

/**
 * Push the current update state to the window so the pill can react at once.
 *
 * Carries the state itself now, not just a "something changed" ping: the chip
 * used to learn about progress only from its own check() on mount and a
 * 30-minute poll, so a failure could sit invisible for half an hour.
 */
function notifyUpdateState(extra) {
  try {
    const state = updateState.readState(WAYNE_HOME);
    // Every window, not just the main one: "Nova janela" (Ctrl+Shift+N) shows
    // the same chip, and a secondary window used to sit on stale state until
    // its own 30-minute poll came round.
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win || win.isDestroyed()) continue;
      win.webContents.send("w4y:update:event", {
        type: "engine-state",
        phase: state.phase || "idle",
        version: state.version || null,
        attempts: state.attempts || 0,
        // Same question checkEngineUpdate answers, so the event and the check
        // can never disagree about whether to warn.
        stalled: updateState.shouldWarnUser(state),
        running: engineUpdateFlight.isRunning(),
        lastError: state.lastError || null,
        lastErrorStage: state.lastErrorStage || null,
        ...(extra || {}),
      });
    }
  } catch {
    /* window gone */
  }
}

// ── IPC do boot ────────────────────────────────────────────────────────────
function registerBootIpc() {
  ipcMain.handle("w4y:boot:state", () => ({
    phase: engine.phase,
    cloudShell: CLOUD_SHELL,
    error: engine.lastError,
    events: engine.events.slice(),
    logLines: engine.logLines.slice(),
  }));
  ipcMain.handle("w4y:boot:key:submit", (_e, key) => {
    // O valor da chave não é logado, não entra em evento e não é ecoado.
    const r = upsertOpenRouterKey(key);
    if (r.ok) releaseKeyWaiter();
    return r;
  });
  ipcMain.handle("w4y:boot:key:skip", (_e, opts) => {
    // 0.3.5 "não perguntar de novo": persists ONLY when the gate on screen is
    // the composio-only variant — a snooze can never silence the model-key
    // gate (lastGate.needModel true → ignored even if the renderer lied).
    if (
      opts &&
      opts.snoozeComposio === true &&
      engine.lastGate &&
      !engine.lastGate.needModel &&
      engine.lastGate.needComposio
    ) {
      writeLoginGate({ composioSnoozed: true });
    }
    releaseKeyWaiter();
    return { ok: true };
  });
  // "Entrar com Work4You": resolves only when the flow ends (key written /
  // no-credit / cancelled / error). The key value never crosses this channel.
  ipcMain.handle("w4y:boot:login", () => runLoginFlow());
  ipcMain.handle("w4y:boot:login:cancel", () => cancelLoginFlow());
  ipcMain.handle("w4y:boot:retry", () => retryLocalBoot());
  ipcMain.handle("w4y:boot:cloud", () => {
    useCloudShell();
    return { ok: true };
  });
}

// ── Cloud bridge (S1 mini-computer) ────────────────────────────────────────
// Lets a CHAT SESSION run on the user's CLOUD computer from inside the
// local-engine app — same screen, same history, only the execution changes.
// Both IPCs ride the login cookies already living in session.defaultSession
// (populated by the 0.3.2 "Entrar com Work4You" flow):
//
//   w4y:cloud:wsUrl → mints a single-use WS ticket at the cloud gateway
//     (POST /api/auth/ws-ticket — the parked desktop's mintGatewayWsTicket
//     pattern, apps/desktop/electron/main.cjs:4641) and returns the READY
//     wss:// URL (connection-config.cjs buildGatewayWsUrlWithTicket:73).
//     Tickets are one-shot with a ~30s TTL, so the renderer re-invokes this
//     before EVERY connect/reconnect. No cookies → { error: "not-logged-in" }.
//
//   w4y:cloud:api → narrow REST proxy for the cloud dashboard. Allowlist is
//     STRICT: only the app origin (https://work4you.ai), only /api/* paths
//     (checked again after URL normalization so ".." can't escape), only
//     GET/POST/PATCH/PUT/DELETE (0.3.5 — the dashboard REST mutates with
//     PATCH sessions / PUT cron / DELETE both, and hiding those affordances
//     on cloud rows was the S2 slice-1 limit), JSON in/out. Request/response
//     bodies are NEVER logged.
//
// The key/cookie material never crosses to the renderer — only the finished
// WS URL (which the gateway consumes on first use) and parsed JSON bodies.
const CLOUD_API_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);
function cloudApiRequest(args, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    const rawMethod = args && typeof args.method === "string" ? args.method : "GET";
    const method = CLOUD_API_METHODS.has(rawMethod) ? rawMethod : "GET";
    const rawPath = args && typeof args.path === "string" ? args.path : "";
    // Only "/api/..." — no host, no protocol, no backslashes/whitespace.
    if (!/^\/api\//.test(rawPath) || /[\s\\]/.test(rawPath)) {
      resolve({ ok: false, status: 0, error: "bad-path" });
      return;
    }
    let url;
    try {
      url = new URL(rawPath, APP_ORIGIN);
    } catch {
      resolve({ ok: false, status: 0, error: "bad-path" });
      return;
    }
    // Re-check AFTER normalization: origin pinned, path still under /api/.
    if (url.origin !== APP_ORIGIN || !url.pathname.startsWith("/api/")) {
      resolve({ ok: false, status: 0, error: "bad-path" });
      return;
    }
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    let request;
    try {
      request = net.request({
        method,
        url: url.toString(),
        session: session.defaultSession,
        useSessionCookies: true,
        redirect: "follow",
      });
    } catch {
      done({ ok: false, status: 0, error: "network" });
      return;
    }
    const timer = setTimeout(() => {
      try {
        request.abort();
      } catch {
        /* already finished */
      }
      done({ ok: false, status: 0, error: "timeout" });
    }, timeoutMs);
    request.setHeader("Accept", "application/json");
    request.on("response", (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () => {
        clearTimeout(timer);
        let json = null;
        try {
          json = JSON.parse(Buffer.concat(chunks).toString("utf8"));
        } catch {
          /* non-JSON body (login redirect HTML etc.) — status decides */
        }
        const status = res.statusCode || 0;
        done({ ok: status >= 200 && status < 300, status, json });
      });
      res.on("error", () => {
        clearTimeout(timer);
        done({ ok: false, status: 0, error: "network" });
      });
    });
    request.on("error", () => {
      clearTimeout(timer);
      done({ ok: false, status: 0, error: "network" });
    });
    if (method !== "GET") {
      // POST keeps its historical "always a JSON body" contract ({} default);
      // PATCH/PUT/DELETE send a body only when the caller provided one (the
      // dashboard's DELETE endpoints take none).
      const body = args && args.body !== undefined ? args.body : method === "POST" ? {} : undefined;
      if (body !== undefined) {
        request.setHeader("Content-Type", "application/json");
        request.write(JSON.stringify(body));
      }
    }
    request.end();
  });
}

async function mintCloudWsUrl() {
  const res = await cloudApiRequest(
    { method: "POST", path: "/api/auth/ws-ticket" },
    8_000,
  );
  if (!res.ok) {
    // 401 = no live login cookies — the selector shows "sign in", not an error.
    return {
      ok: false,
      error: res.status === 401 ? "not-logged-in" : res.error || "network",
    };
  }
  const ticket =
    res.json && typeof res.json.ticket === "string" ? res.json.ticket : "";
  if (!ticket) return { ok: false, error: "network" };
  const origin = new URL(APP_ORIGIN);
  const scheme = origin.protocol === "https:" ? "wss" : "ws";
  return {
    ok: true,
    url: `${scheme}://${origin.host}/api/ws?ticket=${encodeURIComponent(ticket)}`,
  };
}

function registerCloudIpc() {
  ipcMain.handle("w4y:cloud:wsUrl", () => mintCloudWsUrl());
  ipcMain.handle("w4y:cloud:api", (_e, args) => cloudApiRequest(args || {}));
}

// ── Engine update chip (0.3.4) ─────────────────────────────────────────────
// check: re-fetch latest.json and compare with the engine-source.json marker
// (the exact comparison maybeUpdateEngine boots on). Fail-open NULL on any
// problem — the chip simply doesn't render. Cloud mode has no local engine to
// update → null as well.
// apply: relaunch the app — the existing boot flow performs the refresh with
// its real progress UI (zero new update mechanics). The engine is killed
// FIRST: app.exit() skips will-quit, and a live python holding files would
// fight the refresh's robocopy.
/**
 * What the pill should say — read from local state, not from the network.
 *
 * It used to answer "available" the moment latest.json differed, which meant
 * the chip appeared BEFORE anything had been downloaded and clicking it walked
 * into the blocking install. Now "available" means the bytes are already on
 * disk and restarting is instant. A repeatedly failing update gets its own,
 * louder answer instead of pretending nothing is happening.
 */
async function checkEngineUpdate() {
  try {
    if (CLOUD_SHELL || engine.usingCloud) return null;
    const staged = readStaged();
    if (staged && engineSlots.isComplete(staged.root)) {
      return { available: true, version: staged.version || null, kind: "ready" };
    }
    const state = updateState.readState(WAYNE_HOME);
    // Two independent reasons to tell the user the update is not going through:
    //  - the automatic retries gave up (attempts >= STALLED_AFTER), or
    //  - the user asked for a retry and THAT failed. The manual path resets
    //    attempts to 0, so without this second reason the chip would disappear
    //    right after the user's own attempt failed — the worst possible moment
    //    to go silent.
    if (updateState.shouldWarnUser(state)) {
      return {
        available: true,
        version: state.version || null,
        kind: "stalled",
        attempts: state.attempts || 0,
        stage: state.lastErrorStage || null,
        reason: state.lastError || null,
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Let the user retry a stalled update on demand (resets the backoff).
 *
 * AWAITS the real work. It used to `void` the call and answer `{ok:true}` at
 * once, so the renderer released its click guard while the install had not
 * started — the chip looked done, then went dead. The answer now describes
 * what actually happened.
 *
 * COHERENCE NOTE (attempts vs. stalled): resetting `attempts` to 0 is what
 * makes a manual retry meaningful, but it also means a failure here leaves
 * attempts=1, below STALLED_AFTER=3 — so the chip would vanish and the user
 * would never learn their retry failed. `manualRetryFailed` is therefore
 * carried in the state, and checkEngineUpdate surfaces it independently of
 * the attempt count.
 */
async function retryEngineUpdate() {
  try {
    updateState.writeState(WAYNE_HOME, {
      phase: "idle",
      attempts: 0,
      lastError: null,
      lastErrorStage: null,
      manualRetryFailed: false,
    });
    notifyUpdateState({ reason: "retry-started" });

    // Joining an in-flight run is NOT a shortcut to success. The previous
    // version awaited the shared promise, threw the result away and answered
    // {ok:true} — so a retry that piggybacked on a failing install reported
    // success, cleared the warning, and left the user with nothing to click.
    // Both paths are judged by the same two questions below.
    const handle = runBackgroundEngineUpdate();
    const joined = !handle.started;
    const res = await handle.promise;

    const after = updateState.readState(WAYNE_HOME);
    const failed = !res.ok || after.phase === "failed";
    if (failed) {
      updateState.writeState(WAYNE_HOME, { manualRetryFailed: true });
      notifyUpdateState({ reason: "retry-failed" });
      return {
        ok: false,
        joined,
        error: res.ok ? after.lastError || "update failed" : res.error,
      };
    }
    notifyUpdateState({ reason: "retry-done" });
    return { ok: true, joined };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

function applyEngineUpdate() {
  try {
    isQuitting = true;
    killEngine();
    app.relaunch();
    app.exit(0);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// ── Unified update chip (0.3.8): SHELL first, then engine ──────────────────
// The same two IPCs now cover BOTH layers. check: shell (electron-updater
// against our bucket feed) first; found → {available:true, version:<shell>}
// and the kind is remembered HERE (never sent to the web — the renderer
// contract stays exactly {available, version}). No shell update → the engine
// check runs unchanged. apply routes on the remembered kind: shell → kill the
// engine (a live python must never fight the installer/relaunch), download if
// not yet downloaded (autoDownload is OFF — bytes only move when the user
// applies), quitAndInstall (silent NSIS + relaunch; the fresh boot handles
// the engine as always). Any shell failure falls back to the engine-style
// relaunch, which brings the CURRENT shell + engine back — fail-open total.
// Every check() produces an immutable SNAPSHOT with its own token, and apply()
// acts on the snapshot it is handed. The previous shape was a single mutable
// object shared by the renderer, the tray and the automatic checks: a check
// firing between someone's check and their apply silently rewrote `kind`, so
// apply could take the shell branch for a decision made about the engine.
// Snapshots are kept briefly so a stale apply can be rejected instead of
// acting on the wrong plan.
const updateSnapshots = new Map(); // token -> { kind, engineKind, version, at }
let snapshotSeq = 0;
const SNAPSHOT_TTL_MS = 10 * 60 * 1000;

function rememberSnapshot(snap) {
  const token = `u${++snapshotSeq}`;
  const now = Date.now();
  for (const [k, v] of updateSnapshots) {
    if (now - v.at > SNAPSHOT_TTL_MS) updateSnapshots.delete(k);
  }
  updateSnapshots.set(token, { ...snap, at: now });
  return token;
}

/**
 * Resolves a token to the snapshot it names — and nothing else.
 *
 * The first version fell back to `latestSnapshot()` whenever the token missed:
 *
 *     (token && updateSnapshots.get(token)) || latestSnapshot()
 *
 * which defeats the whole point. A token exists to pin a decision; silently
 * swapping in a DIFFERENT plan when the pinned one is gone is exactly the bug
 * the snapshots were introduced to prevent — worse, it happens precisely when
 * the state is most confused (expired, already used, or overwritten).
 *
 * @returns {{ok: true, snapshot: object} | {ok: false, reason: string}}
 */
function resolveSnapshot(token) {
  if (!token) return { ok: false, reason: "no-token" };
  const snap = updateSnapshots.get(token);
  if (!snap) return { ok: false, reason: "stale-plan" }; // unknown or consumed
  if (Date.now() - snap.at > SNAPSHOT_TTL_MS) {
    updateSnapshots.delete(token);
    return { ok: false, reason: "stale-plan" };
  }
  return { ok: true, snapshot: snap };
}

/** A plan is single-use: applying it consumes it. */
function consumeSnapshot(token) {
  updateSnapshots.delete(token);
}

function updaterLog(line) {
  // engine.log-style, same file: greppable next to the engine's own lines.
  // Event names + versions only — the feed is public, no tokens/signed URLs.
  try {
    fs.appendFileSync(
      engineLogPath(),
      `[shell-update ${new Date().toISOString()}] ${line}\n`,
    );
  } catch {
    /* best-effort */
  }
}

async function checkUnifiedUpdate() {
  const shellRes = await shellUpdater.check(); // null = fail-open (offline/dev)
  if (shellRes && shellRes.available) {
    const token = rememberSnapshot({ kind: "shell", version: shellRes.version || null });
    return { available: true, version: shellRes.version, token };
  }
  const res = await checkEngineUpdate();
  // The snapshot records whether clicking means "restart into the version
  // already on disk" or "try the download again" — bound to THIS check.
  const token = rememberSnapshot({
    kind: "engine",
    engineKind: res ? res.kind || "ready" : null,
    version: res ? res.version || null : null,
  });
  return res ? { ...res, token } : null;
}

/**
 * @param {string} [token] snapshot returned by the check this apply belongs to
 */
async function applyUnifiedUpdate(token) {
  let snap;
  if (token) {
    const resolved = resolveSnapshot(token);
    if (!resolved.ok) {
      // Never guess. The caller's plan is gone; it must check again.
      return { ok: false, error: "stale-plan", reason: resolved.reason };
    }
    snap = resolved.snapshot;
    consumeSnapshot(token);
  } else {
    // Tray and pre-token clients have no plan of their own. Rather than borrow
    // somebody else's, take a fresh decision right now.
    const fresh = await checkUnifiedUpdate();
    if (!fresh || !fresh.available) return { ok: false, error: "no-update" };
    const resolved = resolveSnapshot(fresh.token);
    if (!resolved.ok) return { ok: false, error: "stale-plan", reason: resolved.reason };
    snap = resolved.snapshot;
    consumeSnapshot(fresh.token);
  }

  // A stalled engine update has nothing staged — restarting would land on the
  // same version and look like the click did nothing. Retry instead.
  if (snap.kind === "engine" && snap.engineKind === "stalled") {
    return retryEngineUpdate();
  }
  if (snap.kind === "shell") {
    // The plan named a shell version; refuse if the updater no longer holds
    // that same one (a newer feed check can swap what is pending underneath).
    const pendingVersion = shellUpdater.pendingVersion?.() ?? null;
    if (!shellUpdater.hasPending()) {
      return { ok: false, error: "stale-plan", reason: "shell-not-pending" };
    }
    if (snap.version && pendingVersion && String(pendingVersion) !== String(snap.version)) {
      return { ok: false, error: "stale-plan", reason: "shell-version-changed" };
    }
  }
  if (snap.kind === "shell" && shellUpdater.hasPending()) {
    // Serialized: killEngine + an 85MB download + quitAndInstall must never
    // run twice at once. A second caller JOINS the first rather than starting
    // its own installer over the same directory.
    const flight = shellApplyFlight.run(async () => {
      killEngine();
      return shellUpdater.apply({
        beforeQuit: () => {
          // The close→hide-to-tray interception must not fight the
          // installer's quit (same latch the tray's "Sair" uses).
          isQuitting = true;
        },
      });
    });
    const outcome = await flight.promise;
    if (outcome.ok) {
      const r = outcome.value;
      if (r && r.ok) return { ok: true }; // process dies inside quitAndInstall
      updaterLog(`apply fell back to relaunch: ${(r && r.error) || "unknown"}`);
    } else {
      updaterLog(`apply fell back to relaunch: ${outcome.error}`);
    }
    // Fail-open: the shell install didn't happen — the engine-style relaunch
    // restores the current shell (and its engine). isQuitting may already be
    // true; applyEngineUpdate sets it again, harmless.
    return applyEngineUpdate();
  }
  return applyEngineUpdate();
}

function registerUpdateIpc() {
  shellUpdater.init({ log: updaterLog });
  ipcMain.handle("w4y:update:check", () => checkUnifiedUpdate());
  // The renderer echoes back the token from ITS check, so an apply can never
  // act on a plan some other check overwrote in between.
  ipcMain.handle("w4y:update:apply", (_e, token) =>
    applyUnifiedUpdate(typeof token === "string" ? token : undefined),
  );
}
// ══ fim do bloco do motor local ═══════════════════════════════════════════

// ── Persistência simples do tamanho/posição da janela ──────────────────────
const stateFile = path.join(app.getPath("userData"), "window-state.json");
function loadWindowState() {
  try {
    const s = JSON.parse(fs.readFileSync(stateFile, "utf8"));
    if (s && Number.isFinite(s.width) && Number.isFinite(s.height)) return s;
  } catch {
    /* primeiro run */
  }
  return { width: 1280, height: 832 };
}
function saveWindowState(win) {
  try {
    if (!win || win.isDestroyed() || win.isMinimized() || !win.isVisible()) return;
    const b = win.getBounds();
    fs.writeFileSync(stateFile, JSON.stringify(b), "utf8");
  } catch {
    /* best-effort */
  }
}

// ── Workspace local padrão do desktop (DL-01) ────────────────────────────────
// No desktop, "sem projeto" = pasta LOCAL (não a nuvem). Garante que ~/Work4You
// exista e já entre no cofre (autorizada, SEM diálogo) no 1º boot, pra que
// readDir/git nela funcionem de cara. Idempotente: mkdir recursive é no-op se já
// existe; folders.add dedupe. Best-effort de ponta a ponta — o cofre nunca pode
// derrubar o boot.
function ensureDefaultWorkspace() {
  try {
    defaultWorkspace = path.join(app.getPath("home"), "Work4You");
    try {
      fs.mkdirSync(defaultWorkspace, { recursive: true });
    } catch {
      /* a pasta pode já existir ou o disco recusar — segue */
    }
    try {
      folders.add(defaultWorkspace);
    } catch {
      /* cofre indisponível não é fatal no boot */
    }
  } catch {
    /* app.getPath("home") pode falhar em cenários exóticos — não é fatal */
  }
}

function iconPath() {
  // PNG 1024 do favicon oficial (variante 3D, decisão de marca 17/07). Serve
  // pra janela e bandeja; o instalador embute o ícone via electron-builder
  // (build.icon → assets/icon.ico multi-size com 256px, exigência do builder).
  return path.join(__dirname, "assets", "icon.png");
}

// ── Frameless chrome (0.3.7, Codex Desktop reference) ──────────────────────
// titleBarStyle hidden + titleBarOverlay: the native window controls float
// over the web's own 36px top bar (WindowChrome component; boot.html carries
// its own drag strip at the same height). Applied to BOTH shell modes — the
// web bar is gated on the preload's `windowChrome` group, so the pairing is
// always consistent.
//
// The overlay used to be a hardcoded "#0e0e0e" background with "#ececea"
// glyphs — written when the shell was assumedly dark. The product moved to
// the light editorial palette and left a black rectangle glued to the corner.
//
// A TRANSPARENT background is NOT the answer here: measured on this Electron
// build, rgba(1,0,0,0) makes the whole overlay vanish — glyphs included, so
// the window loses its close/minimize buttons. Both colors are therefore
// OPAQUE and come from the renderer, which is the only side that knows the
// active theme: ours is a NAMED preset (white / mono / cyberpunk / rose +
// user YAMLs) kept in the app's storage, not an OS light/dark preference.
// nativeTheme is only a first-paint guess, used until the renderer reports.
const TITLEBAR_HEIGHT = 36;

let rendererBarColor = null;
let rendererSymbolColor = null;
const isHexColor = (value) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value);

function titleBarOverlayOptions() {
  const dark = nativeTheme.shouldUseDarkColors;
  return {
    color: isHexColor(rendererBarColor) ? rendererBarColor : dark ? "#0e0e0e" : "#faf9f5",
    symbolColor: isHexColor(rendererSymbolColor)
      ? rendererSymbolColor
      : dark
        ? "#ececea"
        : "#1a1915",
    height: TITLEBAR_HEIGHT,
  };
}

function framelessWindowOptions() {
  return { titleBarStyle: "hidden", titleBarOverlay: titleBarOverlayOptions() };
}

// Pushes the refreshed overlay onto a live window, so switching themes at
// runtime repaints the glyphs instead of waiting for a restart.
function applyTitleBarOverlay(win) {
  if (!win || win.isDestroyed()) return;
  try {
    win.setTitleBarOverlay?.(titleBarOverlayOptions());
  } catch {
    /* overlay unsupported on this platform/build — leave the window as is */
  }
}

// Real quit — the ONE path that takes the engine down with the app (tray
// "Sair", Ctrl+Q, File → Sair). will-quit re-runs killEngine (idempotent).
function quitForReal() {
  isQuitting = true;
  killEngine();
  app.quit();
}

// Window-open + navigation policy shared by the main window and the
// secondary "Nova janela" windows (extracted from createWindow in 0.3.7 —
// byte-for-byte the same rules; see the comments at the original site).
function applyWindowOpenPolicy(win) {
  const wc = win.webContents;
  const isLocalEngineHost = (host) =>
    Boolean(engine.origin) && host === `127.0.0.1:${engine.port}`;
  wc.setWindowOpenHandler(({ url }) => {
    try {
      const host = new URL(url).host;
      const isApp = host === APP_HOST || host.endsWith(".work4you.ai");
      if (isApp || isLocalEngineHost(host) || AUTH_HOST.test(host)) {
        return { action: "allow" };
      }
      void shell.openExternal(url);
      return { action: "deny" };
    } catch {
      return { action: "allow" };
    }
  });
  if (!CLOUD_SHELL) {
    wc.on("will-navigate", (e, url) => {
      try {
        const u = new URL(url);
        if (u.protocol === "file:") return; // boot.html local
        const host = u.host;
        const isApp = host === APP_HOST || host.endsWith(".work4you.ai");
        if (isApp || isLocalEngineHost(host) || AUTH_HOST.test(host)) return;
        e.preventDefault();
        if (u.protocol === "http:" || u.protocol === "https:") {
          void shell.openExternal(u.toString());
        }
      } catch {
        /* URL ilegível — deixa o Chromium decidir */
      }
    });
  }
}

// ── Window-scoped accelerators (0.3.7) ─────────────────────────────────────
// before-input-event fires only while THIS window is focused — the right
// pattern for app shortcuts (globalShortcut would steal OS-wide keys; the
// only OS-global one stays the pre-existing Ctrl+Alt+W). Clipboard/zoom/
// fullscreen/reload accelerators are NOT duplicated here: the hidden
// application menu (buildAppMenu) already provides them via native roles.
// Ctrl+N and Ctrl+O forward to the renderer ("w4y:menu:action") because
// their flows (new session, add local folder) live in the web app.
function attachChromeShortcuts(win) {
  win.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown") return;
    const mod = process.platform === "darwin" ? input.meta : input.control;
    if (!mod || input.alt) return;
    const key = String(input.key || "").toLowerCase();
    let handled = true;
    if (key === "n" && input.shift) {
      createSecondaryWindow();
    } else if (key === "n") {
      win.webContents.send("w4y:menu:action", { action: "new-session" });
    } else if (key === "o" && !input.shift) {
      win.webContents.send("w4y:menu:action", { action: "open-folder" });
    } else if (key === "w" && !input.shift) {
      win.close(); // main window: hide-to-tray; secondary window: real close
    } else if (key === "q" && !input.shift) {
      quitForReal();
    } else {
      handled = false;
    }
    if (handled) event.preventDefault();
  });
}

// ── Secondary windows ("Nova janela", 0.3.7) ───────────────────────────────
// Same preload/policies/chrome as the main window, pointed at the SAME target
// (local dashboard or cloud app). Plain windows: closing one just closes it —
// no tray hide, no window-state persistence (that file stays the main
// window's). Refused while the boot hasn't produced a target yet.
const secondaryWindows = new Set();

function currentAppUrl() {
  if (CLOUD_SHELL || engine.usingCloud) return APP_URL;
  return engine.origin && engine.child ? engine.origin : null;
}

function createSecondaryWindow() {
  const target = currentAppUrl();
  if (!target) return { ok: false, error: "not-ready" };
  const win = new BrowserWindow({
    width: 1280,
    height: 832,
    minWidth: 640,
    minHeight: 480,
    title: "Work4You",
    backgroundColor: "#0e0e0e",
    autoHideMenuBar: true,
    icon: iconPath(),
    ...framelessWindowOptions(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      additionalArguments: [`--w4y-default-workspace=${defaultWorkspace}`],
    },
  });
  applyWindowOpenPolicy(win);
  attachChromeShortcuts(win);
  secondaryWindows.add(win);
  win.on("closed", () => secondaryWindows.delete(win));
  void win.loadURL(target);
  return { ok: true };
}

// ── Chrome IPC (0.3.7) — main half of the web top bar ──────────────────────
// Every handler is window/webContents-scoped via the event sender, so the
// same surface serves the main window and any secondary one. The edit roles
// are allowlisted (never an arbitrary method name from the renderer).
const EDIT_ROLES = new Set(["undo", "redo", "cut", "copy", "paste", "selectAll"]);

function registerChromeIpc() {
  // The renderer reports the active theme's ink so the native window glyphs
  // stay legible on it. Fire-and-forget, and applied to every window: a theme
  // is an app-wide choice, not a per-window one.
  ipcMain.on("w4y:titlebar:theme", (_e, payload) => {
    const bar = payload && payload.barColor;
    const symbol = payload && payload.symbolColor;
    if (!isHexColor(bar) || !isHexColor(symbol)) return;
    if (bar === rendererBarColor && symbol === rendererSymbolColor) return;
    rendererBarColor = bar;
    rendererSymbolColor = symbol;
    for (const win of BrowserWindow.getAllWindows()) applyTitleBarOverlay(win);
  });

  ipcMain.handle("w4y:window:new", () => createSecondaryWindow());
  ipcMain.handle("w4y:window:close", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (win && !win.isDestroyed()) win.close();
    return { ok: true };
  });
  ipcMain.handle("w4y:app:quit", () => {
    quitForReal();
    return { ok: true };
  });
  ipcMain.handle("w4y:edit:role", (e, role) => {
    const r = String(role || "");
    if (!EDIT_ROLES.has(r)) return { ok: false, error: "bad-role" };
    try {
      e.sender[r]();
      return { ok: true };
    } catch {
      return { ok: false, error: "failed" };
    }
  });
  ipcMain.handle("w4y:view:zoom", (e, dir) => {
    try {
      const wc = e.sender;
      const d = String(dir || "");
      if (d === "reset") wc.setZoomLevel(0);
      else if (d === "in") wc.setZoomLevel(Math.min(wc.getZoomLevel() + 0.5, 5));
      else if (d === "out") wc.setZoomLevel(Math.max(wc.getZoomLevel() - 0.5, -5));
      else return { ok: false, error: "bad-dir" };
      return { ok: true, level: wc.getZoomLevel() };
    } catch {
      return { ok: false, error: "failed" };
    }
  });
  ipcMain.handle("w4y:view:fullscreen", (e) => {
    const win = BrowserWindow.fromWebContents(e.sender);
    if (!win || win.isDestroyed()) return { ok: false };
    win.setFullScreen(!win.isFullScreen());
    return { ok: true, fullscreen: win.isFullScreen() };
  });
  ipcMain.handle("w4y:view:reload", (e) => {
    try {
      e.sender.reload();
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
  // About dialog data: shell version + installed-engine version (the
  // engine-source.json label; null in dev checkouts / pre-0.3.2 installs —
  // the dialog renders a dash). No secrets, no paths.
  ipcMain.handle("w4y:app:info", () => ({
    shellVersion: app.getVersion(),
    engineVersion: (readEngineSource() || {}).version || null,
    cloudShell: CLOUD_SHELL || engine.usingCloud,
    platform: process.platform,
  }));
}

// Traz a janela pra frente (recria se foi destruída).
function showWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createWindow();
    return;
  }
  if (mainWindow.isMinimized()) mainWindow.restore();
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
}

function createWindow() {
  const state = loadWindowState();
  mainWindow = new BrowserWindow({
    x: state.x,
    y: state.y,
    width: state.width,
    height: state.height,
    minWidth: 640,
    minHeight: 480,
    title: "Work4You",
    backgroundColor: "#0e0e0e",
    autoHideMenuBar: true,
    icon: iconPath(),
    // 0.3.7: frameless — the web top bar (and boot.html's drag strip) become
    // the title bar; native window controls ride the overlay.
    ...framelessWindowOptions(),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      spellcheck: true,
      // Passa o workspace local padrão pro preload de forma SÍNCRONA (sem IPC-
      // race no page-load): o preload lê de process.argv e expõe como
      // work4youDesktop.defaultWorkspace.
      additionalArguments: [`--w4y-default-workspace=${defaultWorkspace}`],
    },
  });
  attachChromeShortcuts(mainWindow);

  // Diagnóstico: registra falha/sucesso de carga e erros do processo de render
  // em desktop.log (userData) — ajuda a distinguir "página não carregou" de
  // "tela preta por GPU".
  const diag = (m) => {
    try {
      fs.appendFileSync(
        path.join(app.getPath("userData"), "desktop.log"),
        `${new Date().toISOString()} ${m}\n`,
      );
    } catch {
      /* best-effort */
    }
    // eslint-disable-next-line no-console
    console.log("[w4y]", m);
  };
  const wc = mainWindow.webContents;
  wc.on("did-fail-load", (_e, code, desc, url, isMainFrame) => {
    // Ignora abortos de subframe (-3) — só interessa falha do frame principal.
    if (isMainFrame && code !== -3) diag(`FAIL ${code} ${desc} ${url}`);
  });
  wc.on("render-process-gone", (_e, d) => diag(`render gone ${JSON.stringify(d)}`));

  if (CLOUD_SHELL) {
    // Modo nuvem forçado (W4Y_CLOUD_SHELL=1): comportamento anterior intacto.
    void mainWindow.loadURL(APP_URL);
  } else if (engine.origin && engine.child) {
    // Janela recriada da bandeja com o motor já de pé: direto pro dashboard.
    void mainWindow.loadURL(engine.origin);
  } else {
    // Default 0.3.0: boot.html local primeiro; a sequência do motor começa
    // quando a página terminou de carregar (o preload/bridge já está vivo,
    // então nenhum evento se perde — e o replay via w4y:boot:state cobre F5).
    void mainWindow.loadFile(path.join(__dirname, "boot.html"));
    wc.once("did-finish-load", () => {
      void startLocalEngine();
    });
  }

  // Regra de janelas: o próprio app E os provedores de LOGIN (AUTH_HOST, no
  // topo do arquivo) abrem o pop-up DENTRO do app — o fluxo OAuth do
  // `signInWithPopup` precisa do postMessage de volta pro opener, o que só
  // funciona se a janelinha for filha do Electron (não uma aba do navegador).
  // Só links de CONTEÚDO externo (termos, sites de terceiros) vão pro navegador
  // do sistema. No modo motor-local, o dashboard em http://127.0.0.1:<porta
  // escolhida> também é "o próprio app". A guarda de navegação do frame
  // principal (só no modo motor-local; o modo nuvem fica IDÊNTICO ao 0.2.x)
  // vive junto — extraídas pra applyWindowOpenPolicy (0.3.7) porque as
  // janelas secundárias ("Nova janela") seguem as MESMAS regras.
  applyWindowOpenPolicy(mainWindow);

  const persist = () => saveWindowState(mainWindow);
  mainWindow.on("resize", persist);
  mainWindow.on("move", persist);

  // Fechar = esconder pra bandeja (estilo Claude: o app fica residente). Só sai
  // de verdade pelo "Sair" do tray / Cmd-Q (isQuitting). Se a bandeja falhou,
  // deixa fechar normalmente pra não travar o usuário.
  mainWindow.on("close", (e) => {
    saveWindowState(mainWindow);
    if (!isQuitting && tray) {
      e.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// ── Bandeja (system tray) ──────────────────────────────────────────────────
// Both modes: closing the window hides to the tray (engine + in-app cron stay
// alive); the tray's "Sair" is the only real quit and takes the engine down
// with it — no zombie engine for the next launch to reconnect to.
// "Verificar atualizações" (engine mode only): one check → apply on the spot
// when an update exists; otherwise a small dialog says so. Since 0.3.8 the
// check/apply are the UNIFIED ones (shell first, then engine).
// Tray "Entrar com Work4You" (0.3.5): the SAME login flow of the boot gate,
// run while the engine is up (runLoginFlow external mode) — for whoever hit
// "Agora não"/snoozed the composio gate and wants to connect later. The model
// key applies live (the engine re-reads .env per request); the connector MCP
// entry (config.yaml) only loads on engine start, so a successful connector
// bootstrap offers an immediate restart (same relaunch path as the update
// chip). Every message here is informative — a refusal changes nothing.
async function trayLoginToWork4You() {
  showWindow(); // the child login window anchors on the main window
  const r = await runLoginFlow({ external: true });
  if (!r || !r.ok) {
    // Cancels/busy are the user's own actions — no dialog nagging.
    if (r && (r.reason === "cancelled" || r.reason === "busy")) return;
    try {
      await dialog.showMessageBox({
        type: "info",
        title: "Work4You",
        message: "Não deu pra concluir o login agora. Tente de novo mais tarde.",
      });
    } catch {
      /* best-effort */
    }
    return;
  }
  try {
    if (r.wroteConnectors) {
      const { response } = await dialog.showMessageBox({
        type: "info",
        title: "Work4You",
        message:
          "Conta conectada. Pra ativar seus aplicativos conectados, o motor precisa reiniciar.",
        buttons: ["Reiniciar agora", "Depois"],
        defaultId: 0,
        cancelId: 1,
      });
      if (response === 0) applyEngineUpdate(); // kill engine + relaunch (boot re-reads everything)
      return;
    }
    await dialog.showMessageBox({
      type: "info",
      title: "Work4You",
      message: "Conta conectada ao Work4You.",
    });
  } catch {
    /* best-effort — the login itself already succeeded */
  }
}

async function trayCheckForUpdates() {
  // 0.3.8: unified path — shell first, then engine (same as the web chip).
  const r = await checkUnifiedUpdate();
  if (r && r.available) {
    void applyUnifiedUpdate();
    return;
  }
  try {
    await dialog.showMessageBox({
      type: "info",
      title: "Work4You",
      message: r
        ? "Você já está na versão mais recente."
        : "Não deu para verificar atualizações agora. Tente de novo mais tarde.",
    });
  } catch {
    /* best-effort — the dialog is informative only */
  }
}

function trayIconPath() {
  // Windows renders a 1024px PNG tray icon as a BLANK (invisible) slot — the
  // tray exists but the user sees nothing. The multi-size .ico is the fix;
  // macOS/Linux keep the PNG.
  return process.platform === "win32"
    ? path.join(__dirname, "assets", "icon.ico")
    : iconPath();
}

function createTray() {
  try {
    const img = nativeImage.createFromPath(trayIconPath());
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    tray.setToolTip("Work4You");
    const items = [{ label: "Abrir Work4You", click: () => showWindow() }];
    if (!CLOUD_SHELL) {
      items.push(
        {
          // 0.3.5: login outside the boot gate — the path back for whoever
          // snoozed the composio-only gate ("não perguntar de novo").
          label: "Entrar com Work4You",
          click: () => {
            void trayLoginToWork4You();
          },
        },
        {
          label: "Verificar atualizações",
          click: () => {
            void trayCheckForUpdates();
          },
        },
      );
    }
    items.push(
      { type: "separator" },
      {
        label: "Sair",
        // Real quit: engine dies explicitly (will-quit re-runs killEngine,
        // which is idempotent) — never a resident zombie. Same path as
        // Ctrl+Q / File → Sair (quitForReal, 0.3.7).
        click: () => quitForReal(),
      },
    );
    tray.setContextMenu(Menu.buildFromTemplate(items));
    tray.on("click", () => showWindow());
    tray.on("double-click", () => showWindow());
  } catch {
    tray = null; // sem bandeja → fecha/sai normalmente (fallback)
  }
}

// ── Menu do app (roles nativos: copiar/colar/recarregar/zoom, auto-traduzidos
// pelo SO). Fica escondido (autoHideMenuBar) mas preserva os atalhos. ─────────
function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "editMenu" },
    {
      label: "Exibir",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── Atalho global: traz o Work4You pra frente de qualquer lugar. ────────────
function registerShortcuts() {
  try {
    globalShortcut.register("CommandOrControl+Alt+W", () => showWindow());
  } catch {
    /* conflito de atalho — não é fatal */
  }
}

// ── IPC do cofre de pastas (Onda 3) ──────────────────────────────────
// A ponte (preload.cjs) chama isto. "pick" abre o seletor NATIVO + o diálogo
// de autorização (nativo = não spoofável por conteúdo web) e persiste no cofre
// (folders.cjs). O executor (executor.cjs) só toca DENTRO dessas pastas.
function registerLocalIpc() {
  ipcMain.handle("w4y:folders:list", () => folders.list());
  ipcMain.handle("w4y:folders:remove", (_e, p) => folders.remove(p));
  ipcMain.handle("w4y:folders:pick", async () => {
    const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
    const r = await dialog.showOpenDialog(win, {
      title: "Autorizar uma pasta",
      properties: ["openDirectory"],
      buttonLabel: "Selecionar",
    });
    if (r.canceled || !r.filePaths || !r.filePaths[0]) return folders.list();
    const dir = r.filePaths[0];
    const name = path.basename(dir);
    const confirm = await dialog.showMessageBox(win, {
      type: "warning",
      title: "Permitir acesso à pasta",
      message: `Permitir que o Wayne altere arquivos em "${name}"?`,
      detail:
        "Inclui todos os arquivos e subpastas. O Wayne poderá ler, editar e " +
        "excluir arquivos nessa pasta. Seja cauteloso com informações sensíveis.",
      buttons: ["Cancelar", "Permitir"],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
    });
    if (confirm.response !== 1) return folders.list();
    return folders.add(dir);
  });

  // Liga/desliga o executor residente pra a sessão. As pastas vêm do COFRE
  // (fonte da verdade), não do web. Substitui o env-gate de teste da Onda 2.
  ipcMain.handle("w4y:local:set", (_e, args) => {
    try {
      // Engine mode: the local gateway already owns this machine's disk and
      // terminal — an executor arm would register against the CLOUD gateway
      // (APP_URL origin) and loop forever minting tickets. New web_dists no
      // longer call this in engine mode; this guard covers OLD web_dists
      // shipped in earlier engine ZIPs. Answer ok so their UI never blocks.
      if (!CLOUD_SHELL && engine && !engine.usingCloud) {
        return { ok: true, noop: "local-engine" };
      }
      const ws = require("./executor-ws.cjs");
      const { session } = require("electron");
      let origin = "https://work4you.ai";
      try {
        origin = new URL(APP_URL).origin;
      } catch {
        /* mantém o default */
      }
      ws.start({
        baseUrl: origin,
        session: session.defaultSession,
        sessionKey: String((args && args.sessionKey) || ""),
        folders: folders.list(),
      });
      _localExec = ws;
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });
  ipcMain.handle("w4y:local:stop", () => {
    try {
      if (_localExec) _localExec.stop();
    } catch {
      /* best-effort */
    }
    return { ok: true };
  });

  // Open a target OUTSIDE the app (port of the upstream hermes:openExternal).
  // Accepts ONLY: an http/https URL → system browser; or a local file path
  // (plain path or file:// URL) INSIDE the vault → opened via its file:// URL
  // (upstream pattern: pathToFileURL). The vault check is the SAME canonical
  // containment the executor uses (executor.resolveWithinVault) — one rule,
  // not two. Everything else (other protocols, paths outside the vault) is a
  // clean, silent refusal: { ok:false }.
  ipcMain.handle("w4y:openExternal", async (_e, target) => {
    try {
      const raw = String(target || "").trim();
      if (!raw) return { ok: false };
      let parsed = null;
      try {
        parsed = new URL(raw);
      } catch {
        /* not a URL — treat as a local file path below */
      }
      if (parsed && (parsed.protocol === "http:" || parsed.protocol === "https:")) {
        await shell.openExternal(parsed.toString());
        return { ok: true };
      }
      // A file:// URL becomes a path; any other protocol is refused. Windows
      // drive paths ("C:\…") parse as URLs with a 1-letter protocol — those
      // fall through to the path branch, not the refusal.
      let candidate = raw;
      if (parsed && parsed.protocol === "file:") {
        try {
          candidate = fileURLToPath(parsed);
        } catch {
          return { ok: false };
        }
      } else if (parsed && parsed.protocol.length > 2) {
        return { ok: false }; // arbitrary protocol (mailto:, app:, …) — refuse
      }
      let safe;
      try {
        safe = executor.resolveWithinVault(candidate, folders.list());
      } catch {
        return { ok: false }; // outside the vault — refuse silently
      }
      await shell.openExternal(pathToFileURL(safe).toString());
      return { ok: true };
    } catch {
      return { ok: false };
    }
  });
}

// ── git binary (Desktop-2) ───────────────────────────────────────────────────
// worktree/repo-scan/root precisam de um git de VERDADE. Prefere um Git
// instalado; cai pro PATH (mesmo padrão do _findBash do executor). Não é stub:
// os módulos do Hermes recebem o gitBin do chamador (nunca importam resolvedor).
function _findGit() {
  if (process.platform !== "win32") return "git";
  const c = [
    "C:\\Program Files\\Git\\cmd\\git.exe",
    "C:\\Program Files\\Git\\bin\\git.exe",
    "C:\\Program Files (x86)\\Git\\cmd\\git.exe",
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", "cmd", "git.exe"),
  ];
  for (const g of c) {
    try {
      if (g && fs.existsSync(g)) return g;
    } catch {
      /* ignore */
    }
  }
  return "git"; // fallback: torcer pra estar no PATH
}

// ── IPC de fs/git locais (Desktop-2) ─────────────────────────────────────────
// Superfície CRUA (a UI web que consome é onda separada). TODA operação confina
// o(s) caminho(s) ao cofre via executor.resolveWithinVault ANTES de tocar o
// disco/git — a mesma guarda canônica do executor. Fora do cofre = recusa; os
// módulos portados ainda re-endurecem a sintaxe por dentro (device paths, ~,
// symlink).
function registerDesktop2Ipc() {
  // fs-read-dir: lista uma pasta DENTRO do cofre.
  ipcMain.handle("w4y:fs:readDir", async (_e, p) => {
    let safe;
    try {
      safe = executor.resolveWithinVault(p, folders.list());
    } catch {
      return { entries: [], error: "outside-vault" };
    }
    return fsReadDir.readDirForIpc(safe);
  });

  // git-root: sobe procurando .git a partir do alvo. Confina o alvo E o
  // RESULTADO — o walk-up pode subir pra fora do cofre; nesse caso recusa.
  ipcMain.handle("w4y:git:root", async (_e, p) => {
    const vault = folders.list();
    let safe;
    try {
      safe = executor.resolveWithinVault(p, vault);
    } catch {
      return null;
    }
    const root = await gitRoot.gitRootForIpc(safe);
    if (!root) return null;
    try {
      executor.resolveWithinVault(root, vault);
      return root;
    } catch {
      return null; // raiz do repo fora do cofre → não revela
    }
  });

  // git-repo-scan: varre por repos. O ESCOPO é o cofre — raízes explícitas são
  // confinadas; sem raízes, varre o cofre inteiro. O walk só DESCE (nunca sobe),
  // então não escapa das raízes.
  ipcMain.handle("w4y:git:repoScan", async (_e, args) => {
    const vault = folders.list();
    const opts = args || {};
    let roots = [];
    const requested = Array.isArray(opts.roots) ? opts.roots : null;
    if (requested && requested.length) {
      for (const r of requested) {
        try {
          roots.push(executor.resolveWithinVault(r, vault));
        } catch {
          /* raiz pedida fora do cofre → ignora */
        }
      }
    } else {
      roots = vault.slice();
    }
    if (!roots.length) return [];
    try {
      return await gitRepoScan.scanGitRepos(roots, { maxDepth: opts.maxDepth });
    } catch {
      return [];
    }
  });

  // git worktree — cada op confina o(s) caminho(s) de repo/worktree ao cofre.
  ipcMain.handle("w4y:git:worktreeList", async (_e, repoPath) => {
    let safe;
    try {
      safe = executor.resolveWithinVault(repoPath, folders.list());
    } catch {
      return [];
    }
    return gitWorktree.listWorktrees(safe, _findGit());
  });

  ipcMain.handle("w4y:git:worktreeAdd", async (_e, args) => {
    const { repoPath, options } = args || {};
    let safe;
    try {
      safe = executor.resolveWithinVault(repoPath, folders.list());
    } catch {
      return { ok: false, error: "outside-vault" };
    }
    try {
      const r = await gitWorktree.addWorktree(safe, options || {}, _findGit());
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });

  ipcMain.handle("w4y:git:worktreeRemove", async (_e, args) => {
    const { repoPath, worktreePath, options } = args || {};
    const vault = folders.list();
    let safeRepo;
    let safeTree;
    try {
      safeRepo = executor.resolveWithinVault(repoPath, vault);
      safeTree = executor.resolveWithinVault(worktreePath, vault);
    } catch {
      return { ok: false, error: "outside-vault" };
    }
    try {
      const r = await gitWorktree.removeWorktree(safeRepo, safeTree, options || {}, _findGit());
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });

  ipcMain.handle("w4y:git:branchList", async (_e, repoPath) => {
    let safe;
    try {
      safe = executor.resolveWithinVault(repoPath, folders.list());
    } catch {
      return [];
    }
    return gitWorktree.listBranches(safe, _findGit());
  });

  ipcMain.handle("w4y:git:switchBranch", async (_e, args) => {
    const { repoPath, branch } = args || {};
    let safe;
    try {
      safe = executor.resolveWithinVault(repoPath, folders.list());
    } catch {
      return { ok: false, error: "outside-vault" };
    }
    try {
      const r = await gitWorktree.switchBranch(safe, branch, _findGit());
      return { ok: true, ...r };
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e) };
    }
  });
}

// ── Executor local residente (Onda 2) — DESLIGADO por padrão ─────────
// Só liga com WORK4YOU_LOCAL_EXEC=1 (+ WORK4YOU_LOCAL_SESSION/_FOLDERS). A UI
// da Onda 5 vai substituir esse env-gate pelo trigger real (IPC do renderer).
// Sem a env, a casca fica IDÊNTICA ao que já está no ar (zero impacto).
let _localExec = null;
function maybeStartLocalExecutor() {
  if (process.env.WORK4YOU_LOCAL_EXEC !== "1") return;
  try {
    const { session } = require("electron");
    _localExec = require("./executor-ws.cjs");
    let origin = "https://work4you.ai";
    try {
      origin = new URL(APP_URL).origin;
    } catch {
      /* mantém o default */
    }
    _localExec.start({
      baseUrl: process.env.WORK4YOU_LOCAL_BASE || origin,
      session: session.defaultSession,
      sessionKey: process.env.WORK4YOU_LOCAL_SESSION || "",
      folders: (process.env.WORK4YOU_LOCAL_FOLDERS || "")
        .split(";")
        .map((s) => s.trim())
        .filter(Boolean),
    });
  } catch {
    _localExec = null;
  }
}

app.on("second-instance", () => {
  showWindow();
});

app.whenReady().then(() => {
  // DL-01 primeiro: garante ~/Work4You no cofre ANTES de a janela (e o preload)
  // subirem, pra que defaultWorkspace/additionalArguments já esteja pronto.
  ensureDefaultWorkspace();
  buildAppMenu();
  // Registra os IPCs ANTES da janela: o preload/renderer podem chamar assim que
  // a página carrega.
  registerLocalIpc();
  registerDesktop2Ipc();
  registerBootIpc();
  registerCloudIpc();
  registerUpdateIpc();
  registerChromeIpc();
  createWindow();
  createTray();
  registerShortcuts();
  maybeStartLocalExecutor();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else showWindow();
  });
});

app.on("before-quit", () => {
  isQuitting = true;
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
  // Motor local morre COM o app (árvore inteira via taskkill /T no Windows).
  // Fechar pra bandeja NÃO passa por aqui — o motor (e o cron in-app) seguem
  // vivos enquanto o app estiver residente.
  killEngine();
  if (_localExec) {
    try {
      _localExec.stop();
    } catch {
      /* best-effort */
    }
  }
});

app.on("window-all-closed", () => {
  // Fica residente na bandeja; só encerra de fato pelo "Sair" (isQuitting) ou
  // se a bandeja não existir (fallback pra continuar sendo "fechável").
  if (process.platform !== "darwin" && (isQuitting || !tray)) app.quit();
});
