/**
 * Work4You Desktop — casca nativa com MOTOR LOCAL (pivô desktop, 0.3.0).
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
} = require("electron");
const fs = require("node:fs");
const os = require("node:os");
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

// Fonte principal do motor pro install.ps1 (env WAYNE_SOURCE_ZIP_URL — sem ela
// o instalador falha com erro claro). ATUALIZAR a cada release do motor.
// Override pro dev/CI: env W4Y_ENGINE_ZIP_URL (ou WAYNE_SOURCE_ZIP_URL direto).
const DEFAULT_ENGINE_ZIP_URL =
  "https://storage.googleapis.com/w4y-engine-dist/wayne-engine-20260717.zip";
function resolveEngineZipUrl() {
  return (
    (process.env.W4Y_ENGINE_ZIP_URL || "").trim() ||
    (process.env.WAYNE_SOURCE_ZIP_URL || "").trim() ||
    DEFAULT_ENGINE_ZIP_URL
  );
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
  phase: "idle", // resolve | bootstrap | key | spawn | ready | error | cloud
  lastError: null,
  booting: false,
  retries: 0,
  generation: 0,
  keyWaiter: null,
  bootAbort: null,
  usingCloud: false,
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
// boot.html → main (invoke): w4y:boot:state | w4y:boot:key:submit |
//   w4y:boot:key:skip | w4y:boot:retry | w4y:boot:cloud
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

function setPhase(phase, message) {
  engine.phase = phase;
  if (phase !== "error") engine.lastError = null;
  sendBootEvent({ type: "phase", phase, message: message || null });
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
function envHasOpenRouterKey() {
  try {
    const content = fs.readFileSync(ENGINE_ENV_FILE, "utf8");
    for (const raw of content.split(/\r?\n/)) {
      const m = raw.match(/^\s*(?:export\s+)?OPENROUTER_API_KEY\s*=\s*(.*)\s*$/);
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

function upsertOpenRouterKey(rawKey) {
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
    const line = `OPENROUTER_API_KEY=${key}`;
    const re = /^[ \t]*(?:export[ \t]+)?OPENROUTER_API_KEY[ \t]*=.*$/m;
    const next = re.test(content)
      ? content.replace(re, line)
      : (content ? content.replace(/\n*$/, "\n") : "") + line + "\n";
    fs.writeFileSync(ENGINE_ENV_FILE, next, "utf8");
    return { ok: true };
  } catch {
    return { ok: false, error: "write-failed" };
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
  if (engine.keyWaiter) {
    const w = engine.keyWaiter;
    engine.keyWaiter = null;
    try {
      w();
    } catch {
      /* ignore */
    }
  }
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
    setPhase("resolve", "Verificando o motor local…");
    let backend = resolveEngineBackend();

    if (backend.kind === "bootstrap-needed") {
      setPhase("bootstrap", "Instalando o motor local…");
      // Fonte do motor pro install.ps1: o runner espalha process.env no spawn,
      // então setar aqui chega ao script como WAYNE_SOURCE_ZIP_URL.
      process.env.WAYNE_SOURCE_ZIP_URL = resolveEngineZipUrl();
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
    }
    if (aborted()) return;

    if (!envHasOpenRouterKey()) {
      setPhase("key");
      await new Promise((resolve) => {
        engine.keyWaiter = resolve;
      });
      engine.keyWaiter = null;
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
  } catch (err) {
    if (!aborted()) {
      killEngine();
      bootFail(`O motor local não subiu: ${(err && err.message) || err}`);
    }
  } finally {
    engine.booting = false;
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
    if (r.ok && engine.keyWaiter) {
      const w = engine.keyWaiter;
      engine.keyWaiter = null;
      w();
    }
    return r;
  });
  ipcMain.handle("w4y:boot:key:skip", () => {
    if (engine.keyWaiter) {
      const w = engine.keyWaiter;
      engine.keyWaiter = null;
      w();
    }
    return { ok: true };
  });
  ipcMain.handle("w4y:boot:retry", () => retryLocalBoot());
  ipcMain.handle("w4y:boot:cloud", () => {
    useCloudShell();
    return { ok: true };
  });
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
  // PNG 1024 do favicon oficial (make-icon.cjs). Serve pra janela e bandeja;
  // o instalador embute o ícone via electron-builder (build.icon).
  return path.join(__dirname, "assets", "icon.png");
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

  // Regra de janelas: o próprio app E os provedores de LOGIN (Google/Microsoft/
  // Firebase) abrem o pop-up DENTRO do app — o fluxo OAuth do `signInWithPopup`
  // precisa do postMessage de volta pro opener, o que só funciona se a janelinha
  // for filha do Electron (não uma aba do navegador). Só links de CONTEÚDO
  // externo (termos, sites de terceiros) vão pro navegador do sistema.
  // No modo motor-local, o dashboard em http://127.0.0.1:<porta escolhida>
  // também é "o próprio app".
  const AUTH_HOST =
    /(^|\.)(google\.com|googleusercontent\.com|microsoftonline\.com|microsoft\.com|live\.com|firebaseapp\.com|web\.app)$/i;
  const isLocalEngineHost = (host) => Boolean(engine.origin) && host === `127.0.0.1:${engine.port}`;
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
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

  // Guarda de navegação do frame principal (só no modo motor-local; o modo
  // nuvem fica IDÊNTICO ao 0.2.x). Dentro do app: dashboard local, work4you.ai
  // (fallback nuvem) e provedores de login. Qualquer outro http(s) vai pro
  // navegador do sistema. loadURL/loadFile do main não disparam will-navigate,
  // então o boot e as trocas de modo não passam por aqui.
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
function createTray() {
  try {
    const img = nativeImage.createFromPath(iconPath());
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    tray.setToolTip("Work4You");
    tray.setContextMenu(
      Menu.buildFromTemplate([
        { label: "Abrir Work4You", click: () => showWindow() },
        { type: "separator" },
        {
          label: "Sair",
          click: () => {
            isQuitting = true;
            app.quit();
          },
        },
      ]),
    );
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
