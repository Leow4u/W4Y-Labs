/**
 * shell-updater.cjs — SHELL self-update via electron-updater (0.3.8).
 *
 * The shell updates ITSELF from our own bucket (electron-updater `generic`
 * provider) — the same public bucket that already distributes the engine ZIPs
 * and installers. The build writes the feed identity into the packaged
 * app-update.yml from `build.publish` in package.json; publishing the
 * artifacts (installer + .blockmap + latest.yml) to the bucket is the release
 * pipeline's job, never this module's.
 *
 * Contract with main.cjs (the unified update chip keeps `{available,version}`
 * towards the web — zero renderer changes):
 *   init({ log })  wire a log sink (engine.log-style). Optional; idempotent.
 *   check()        → { available, version } | null. NULL means "updater not
 *                    usable / feed unreachable / any error" — FAIL-OPEN: the
 *                    caller falls through to the engine-only check. Never
 *                    throws, never blocks longer than its internal timeout.
 *   apply({ beforeQuit }) → { ok:true } (the process is about to die inside
 *                    quitAndInstall) | { ok:false, error }. Downloads first
 *                    when the update wasn't downloaded yet (autoDownload is
 *                    OFF — the user decides when bytes move). `beforeQuit`
 *                    runs right before quitAndInstall so main can flip its
 *                    isQuitting latch (the close→hide-to-tray interception
 *                    must not fight the installer's quit).
 *
 * Design facts (verified against the docs/source, 17/07/2026):
 * - Unsigned→unsigned Windows updates WORK: NsisUpdater.verifySignature()
 *   reads `publisherName` from the packaged config and, when it is null (our
 *   config sets no publisherName — there is no certificate), returns null =
 *   verification skipped and the install proceeds (electron-updater
 *   NsisUpdater.ts, verifySignature: `if (publisherName == null) return null`).
 *   Only macOS hard-requires signing ("macOS application must be signed in
 *   order for auto updating to work", electron.build/docs/features/auto-update).
 * - autoDownload=false: "Whether to automatically download an update when it
 *   is found" (AppUpdater docs) — we only download inside apply().
 * - quitAndInstall(isSilent=false, isForceRunAfter=true): the NSIS installer
 *   shows its own small native progress window and relaunches the app when it
 *   finishes. Silent mode was worse in practice: every window closed and
 *   nothing visible replaced them, so the app simply looked dead.
 * - Feed override W4Y_UPDATE_FEED_URL exists for testability (smoke against a
 *   local http server); default is the bucket baked into app-update.yml. In a
 *   non-packaged run the override also flips forceDevUpdateConfig, otherwise
 *   electron-updater refuses to check outside a packaged app.
 *
 * Robustness: everything here is fail-open. A missing/broken electron-updater
 * (e.g. an old asar), a dead feed, bad YAML — all collapse into `null`/
 * `{ok:false}` and the caller continues on the engine-only path. This module
 * never runs at boot; only the chip's check (mount + 30min) and the tray
 * reach it. Logs carry event names and versions only — the feed is public,
 * there are no signed URLs or tokens to leak.
 */
const { app } = require("electron");

// The DEFAULT feed lives in package.json → build.publish (generic provider,
// https://storage.googleapis.com/w4y-engine-dist): electron-builder bakes it
// into the packaged app-update.yml, which electron-updater reads on its own.
// This module only overrides it when W4Y_UPDATE_FEED_URL is set (tests).

let _log = null; // sink from main (engine.log appender); null = silent
let _updater; // undefined = never tried; null = unavailable (fail-open)
const _state = {
  pendingVersion: null, // version the last successful check found
  downloaded: false, // update-downloaded fired for pendingVersion
  lastProgressLogged: -1, // throttle download-progress logging (25% steps)
};

function log(line) {
  try {
    if (_log) _log(String(line));
  } catch {
    /* a log sink must never break the updater */
  }
}

function init(opts) {
  if (opts && typeof opts.log === "function") _log = opts.log;
}

// Lazy singleton. `require("electron-updater")` only on first use — if the
// module is somehow absent/broken the failure is contained here, once.
function getUpdater() {
  if (_updater !== undefined) return _updater;
  try {
    const { autoUpdater } = require("electron-updater");
    autoUpdater.autoDownload = false; // download only inside apply()
    autoUpdater.autoInstallOnAppQuit = false; // install ONLY via apply()
    const override = (process.env.W4Y_UPDATE_FEED_URL || "").trim();
    if (override) {
      // Testability seam: point the updater at any feed (a local server in
      // the smoke test). Without the env the packaged app-update.yml (built
      // from package.json build.publish) is the single source of truth.
      autoUpdater.setFeedURL({ provider: "generic", url: override });
      // Outside a packaged app electron-updater refuses to check ("application
      // is not packed") unless dev mode is forced. Only ever forced together
      // with an explicit override — a packaged install never takes this path.
      if (!app.isPackaged) autoUpdater.forceDevUpdateConfig = true;
    }
    // Route electron-updater's own logging into our sink (default is console).
    const l = (level) => (msg) => log(`${level}: ${msg}`);
    autoUpdater.logger = {
      info: l("info"),
      warn: l("warn"),
      error: l("error"),
      debug: l("debug"),
    };
    autoUpdater.on("error", (e) => {
      log(`event error: ${String((e && e.message) || e)}`);
    });
    autoUpdater.on("checking-for-update", () => log("event checking-for-update"));
    autoUpdater.on("update-available", (info) => {
      log(`event update-available version=${info && info.version}`);
    });
    autoUpdater.on("update-not-available", (info) => {
      log(`event update-not-available latest=${info && info.version}`);
    });
    autoUpdater.on("download-progress", (p) => {
      const pct = p && Number.isFinite(p.percent) ? Math.floor(p.percent / 25) * 25 : null;
      if (pct !== null && pct !== _state.lastProgressLogged) {
        _state.lastProgressLogged = pct;
        log(`event download-progress ${pct}% (${p.transferred}/${p.total})`);
      }
    });
    autoUpdater.on("update-downloaded", (info) => {
      _state.downloaded = true;
      log(`event update-downloaded version=${info && info.version}`);
    });
    _updater = autoUpdater;
  } catch (e) {
    log(`init failed (updater unavailable): ${String((e && e.message) || e)}`);
    _updater = null;
  }
  return _updater;
}

// Resolve-null timeout guard: the chip's check must never hang the IPC. The
// underlying request keeps running harmlessly; a later retry reuses it.
function withTimeout(promise, ms) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => {
      if (!settled) {
        settled = true;
        clearTimeout(timer);
        resolve(v);
      }
    };
    const timer = setTimeout(() => done(null), ms);
    promise.then(done, () => done(null));
  });
}

// → { available, version } | null (null = fail-open, caller checks engine only)
async function check(timeoutMs = 15000) {
  const updater = getUpdater();
  if (!updater) return null;
  try {
    const res = await withTimeout(updater.checkForUpdates(), timeoutMs);
    // null = timeout, or updater disabled (dev run without the env override).
    if (!res || !res.updateInfo) return null;
    const available = res.isUpdateAvailable === true;
    const version =
      typeof res.updateInfo.version === "string" ? res.updateInfo.version : null;
    if (available) {
      if (_state.pendingVersion !== version) _state.downloaded = false; // feed moved on
      _state.pendingVersion = version;
    }
    return { available, version };
  } catch (e) {
    log(`check failed: ${String((e && e.message) || e)}`);
    return null;
  }
}

// Download (if not yet) + quitAndInstall. On {ok:true} the process dies right
// after — the NSIS installer relaunches the app. Any failure is reported, the
// caller decides the fallback (a plain relaunch keeps the current shell).
async function apply(opts) {
  const updater = getUpdater();
  if (!updater) return { ok: false, error: "updater-unavailable" };
  if (!_state.pendingVersion) return { ok: false, error: "no-pending-update" };
  try {
    if (!_state.downloaded) {
      log(`apply: downloading ${_state.pendingVersion}…`);
      await updater.downloadUpdate();
    }
    log(`apply: quitAndInstall ${_state.pendingVersion}`);
    try {
      if (opts && typeof opts.beforeQuit === "function") opts.beforeQuit();
    } catch {
      /* the latch is best-effort — quitAndInstall quits regardless */
    }
    // isSilent=FALSE so the NSIS installer shows its own small native progress
    // window. Silent gave the user a dead app and no sign anything was
    // happening. isForceRunAfter=true still reopens Work4You when it finishes.
    updater.quitAndInstall(false, true);
    return { ok: true };
  } catch (e) {
    const msg = String((e && e.message) || e);
    log(`apply failed: ${msg}`);
    return { ok: false, error: msg };
  }
}

// Whether the last successful check found a shell update (main routes the
// unified apply on this — the kind never crosses to the renderer).
function hasPending() {
  return !!_state.pendingVersion;
}

/**
 * Version the last successful check found, or null.
 *
 * Exposed so the unified apply can refuse a plan whose shell version moved
 * underneath it: a feed check between someone's check() and their apply()
 * rewrites `_state.pendingVersion`, and applying the old plan would install a
 * different build than the one the caller decided on.
 */
function pendingVersion() {
  return _state.pendingVersion;
}

module.exports = { init, check, apply, hasPending, pendingVersion };
