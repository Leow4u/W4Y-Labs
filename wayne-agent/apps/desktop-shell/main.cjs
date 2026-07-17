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

// Fonte principal do motor pro install.ps1 (env WAYNE_SOURCE_ZIP_URL — sem ela
// o instalador falha com erro claro). ATUALIZAR a cada release do motor.
// Override pro dev/CI: env W4Y_ENGINE_ZIP_URL (ou WAYNE_SOURCE_ZIP_URL direto).
const DEFAULT_ENGINE_ZIP_URL =
  "https://storage.googleapis.com/w4y-engine-dist/wayne-engine-20260717f.zip";
function resolveEngineZipUrl() {
  return (
    (process.env.W4Y_ENGINE_ZIP_URL || "").trim() ||
    (process.env.WAYNE_SOURCE_ZIP_URL || "").trim() ||
    DEFAULT_ENGINE_ZIP_URL
  );
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

// The whole login→key sequence. Resolves { ok:true, got:"key"|"no-credit" }
// on success (the key gate is released by then) or { ok:false, reason } —
// "cancelled" (user closed the login window → back to the gate), "busy",
// "not-waiting", "rate-limited", "network", "write-failed", "invalid-response".
async function runLoginFlow() {
  // A leftover flow (e.g. F5 on boot.html mid-login: the page's invoke died
  // with it, but the flow keeps running here) is cancelled and superseded —
  // the fresh click always gets a fresh window. Same-page double-clicks are
  // debounced in boot.html.
  if (loginFlow) {
    cancelLoginFlow();
    await new Promise((resolve) => setTimeout(resolve, 600)); // let it unwind
    if (loginFlow) return { ok: false, reason: "busy" };
  }
  if (engine.phase !== "key") return { ok: false, reason: "not-waiting" };
  const flow = { win: null, cancelled: false };
  loginFlow = flow;
  const gen = engine.generation;
  // The flow dies with: explicit cancel, closed login window, a boot
  // generation change (retry / "Usar na nuvem"), or the gate being released
  // by another path (manual key / skip moved the phase past "key").
  const stale = () =>
    flow.cancelled ||
    gen !== engine.generation ||
    engine.usingCloud ||
    isQuitting ||
    engine.phase !== "key";
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
        await bootstrapLocalConnectors();
        releaseKeyWaiter();
        return { ok: true, got: "key" };
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
        await bootstrapLocalConnectors();
        releaseKeyWaiter();
        return { ok: true, got: "no-credit" };
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
      // Record which ZIP this install came from (the URL handed to install.ps1
      // above) so the boot-time update check has a baseline to compare against.
      writeEngineSource({
        version: null,
        zipUrl: resolveEngineZipUrl(),
        updatedAt: new Date().toISOString(),
      });
    } else if (backend.root === ENGINE_ROOT) {
      // Engine already installed (never the dev checkout): boot-time update
      // check. Fail-open by construction — any manifest/refresh problem just
      // boots the current engine.
      const refreshedTree = await maybeUpdateEngine();
      if (aborted()) return;
      if (refreshedTree) {
        // The refresh replaced source files; re-resolve so serve-arg detection
        // sees the new tree. If the probe unexpectedly fails, keep the previous
        // candidate (same paths) instead of failing the boot.
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
    const needModel = !envHasKey("OPENROUTER_API_KEY");
    const needComposio = !envHasKey("COMPOSIO_API_KEY");
    if (needModel || needComposio) {
      setPhase("key", null, { gate: { needModel, needComposio } });
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
    if (r.ok) releaseKeyWaiter();
    return r;
  });
  ipcMain.handle("w4y:boot:key:skip", () => {
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
//     GET/POST, JSON in/out. Request/response bodies are NEVER logged.
//
// The key/cookie material never crosses to the renderer — only the finished
// WS URL (which the gateway consumes on first use) and parsed JSON bodies.
function cloudApiRequest(args, timeoutMs = 15_000) {
  return new Promise((resolve) => {
    const method = args && args.method === "POST" ? "POST" : "GET";
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
    if (method === "POST") {
      request.setHeader("Content-Type", "application/json");
      request.write(
        JSON.stringify(args && args.body !== undefined ? args.body : {}),
      );
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
async function checkEngineUpdate() {
  try {
    if (CLOUD_SHELL || engine.usingCloud) return null;
    const manifest = await fetchEngineManifest();
    if (!manifest || !manifest.zipUrl) return null;
    const current = readEngineSource();
    return {
      available: !current || current.zipUrl !== manifest.zipUrl,
      version: typeof manifest.version === "string" ? manifest.version : null,
    };
  } catch {
    return null;
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

function registerUpdateIpc() {
  ipcMain.handle("w4y:update:check", () => checkEngineUpdate());
  ipcMain.handle("w4y:update:apply", () => applyEngineUpdate());
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

  // Regra de janelas: o próprio app E os provedores de LOGIN (AUTH_HOST, no
  // topo do arquivo) abrem o pop-up DENTRO do app — o fluxo OAuth do
  // `signInWithPopup` precisa do postMessage de volta pro opener, o que só
  // funciona se a janelinha for filha do Electron (não uma aba do navegador).
  // Só links de CONTEÚDO externo (termos, sites de terceiros) vão pro navegador
  // do sistema. No modo motor-local, o dashboard em http://127.0.0.1:<porta
  // escolhida> também é "o próprio app".
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
// Both modes: closing the window hides to the tray (engine + in-app cron stay
// alive); the tray's "Sair" is the only real quit and takes the engine down
// with it — no zombie engine for the next launch to reconnect to.
// "Verificar atualizações" (engine mode only): one check → apply on the spot
// when an update exists; otherwise a small dialog says so.
async function trayCheckForUpdates() {
  const r = await checkEngineUpdate();
  if (r && r.available) {
    applyEngineUpdate();
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

function createTray() {
  try {
    const img = nativeImage.createFromPath(iconPath());
    tray = new Tray(img.isEmpty() ? nativeImage.createEmpty() : img);
    tray.setToolTip("Work4You");
    const items = [{ label: "Abrir Work4You", click: () => showWindow() }];
    if (!CLOUD_SHELL) {
      items.push({
        label: "Verificar atualizações",
        click: () => {
          void trayCheckForUpdates();
        },
      });
    }
    items.push(
      { type: "separator" },
      {
        label: "Sair",
        click: () => {
          // Real quit: engine dies here explicitly (will-quit re-runs
          // killEngine, which is idempotent) — never a resident zombie.
          isQuitting = true;
          killEngine();
          app.quit();
        },
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
