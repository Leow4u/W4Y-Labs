/**
 * w4y-home.cjs — the ONE place the desktop decides where the data home is.
 *
 * Lives in its own module so every caller shares the same answer without a
 * require cycle (w4y-login and w4y-composio both need it, and they already
 * require each other).
 *
 * Layout (ago/2026):
 *   %LOCALAPPDATA%\work4you\                 ← platform root
 *     wayne-agent\                           ← shared ready engine (NSIS / first-run)
 *     accounts\<tenantId>\                   ← per-email WAYNE_HOME (state.db, .env)
 *     active-account.json                    ← which account is live
 *
 * Engine is shared across accounts on the same Windows user; session data is not.
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function platformRoots() {
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    return {
      neu: path.join(process.env.LOCALAPPDATA, "work4you"),
      old: path.join(process.env.LOCALAPPDATA, "wayne"),
    };
  }
  return {
    neu: path.join(os.homedir(), ".work4you"),
    old: path.join(os.homedir(), ".wayne"),
  };
}

/**
 * Platform install root (engine lives here). Prefer migrated work4you/, else
 * legacy wayne/, else the new name for a fresh machine.
 */
function resolvePlatformRoot() {
  const { neu, old } = platformRoots();
  try {
    if (fs.existsSync(neu)) return neu;
    if (fs.existsSync(old)) return old;
  } catch {
    /* fall through */
  }
  return neu;
}

function activeAccountPath(platformRoot = resolvePlatformRoot()) {
  return path.join(platformRoot, "active-account.json");
}

function readActiveAccount(platformRoot = resolvePlatformRoot()) {
  const p = activeAccountPath(platformRoot);
  try {
    const raw = JSON.parse(fs.readFileSync(p, "utf8"));
    const tenantId = typeof raw?.tenantId === "string" ? raw.tenantId.trim() : "";
    if (!tenantId || !/^[A-Za-z0-9_.:-]{1,128}$/.test(tenantId)) return null;
    return {
      tenantId,
      email: typeof raw.email === "string" ? raw.email : "",
      activatedAt: typeof raw.activatedAt === "string" ? raw.activatedAt : null,
    };
  } catch {
    return null;
  }
}

function accountHomeFor(tenantId, platformRoot = resolvePlatformRoot()) {
  const id = String(tenantId || "").trim();
  if (!id) return platformRoot;
  return path.join(platformRoot, "accounts", id);
}

/**
 * Resolve the engine data home (sessions, .env, memory).
 *
 * Precedence:
 *  1. WAYNE_HOME — spawner-injected, and how a per-profile child is scoped.
 *  2. WORK4YOU_HOME — the user-facing spelling.
 *  3. Active Work4You account home (accounts/<tenantId>) when set.
 *  4. Platform default (work4you / wayne), same as the engine migration rule.
 */
function resolveWayneHome() {
  if (process.env.WAYNE_HOME) return path.resolve(process.env.WAYNE_HOME);
  if (process.env.WORK4YOU_HOME) return path.resolve(process.env.WORK4YOU_HOME);

  const platformRoot = resolvePlatformRoot();
  const active = readActiveAccount(platformRoot);
  if (active) {
    const home = accountHomeFor(active.tenantId, platformRoot);
    try {
      fs.mkdirSync(home, { recursive: true });
    } catch {
      /* still return the intended path */
    }
    return home;
  }
  return platformRoot;
}

/**
 * Shared engine checkout root (CPython + .venv). Independent of which account
 * is active so we do not duplicate ~100MB per email on one Windows user.
 */
function resolveSharedEngineRoot(platformRoot = resolvePlatformRoot()) {
  const candidates = [
    path.join(platformRoot, "wayne-agent"),
    path.join(platformRoot, "work4you-agent"),
  ];
  for (const c of candidates) {
    try {
      if (
        fs.existsSync(path.join(c, "work4you_cli", "main.py")) ||
        fs.existsSync(path.join(c, "wayne_cli", "main.py"))
      ) {
        return c;
      }
    } catch {
      /* try next */
    }
  }
  return path.join(platformRoot, "wayne-agent");
}

function migrateLegacyHomeIntoAccount(accountHome, platformRoot) {
  if (!accountHome || accountHome === platformRoot) return false;
  const destState = path.join(accountHome, "state.db");
  if (fs.existsSync(destState)) return false;
  const srcState = path.join(platformRoot, "state.db");
  if (!fs.existsSync(srcState)) return false;
  // One-time: move legacy platform-root sessions into the first account that logs in.
  const names = ["state.db", "state.db-wal", "state.db-shm", ".env", "config.yaml"];
  for (const name of names) {
    const src = path.join(platformRoot, name);
    const dst = path.join(accountHome, name);
    if (!fs.existsSync(src) || fs.existsSync(dst)) continue;
    try {
      fs.renameSync(src, dst);
    } catch {
      try {
        fs.copyFileSync(src, dst);
      } catch {
        /* best effort */
      }
    }
  }
  return true;
}

/**
 * Pin the live Work4You account. Returns { home, previousTenantId, switched }.
 */
function activateAccount({ tenantId, email } = {}) {
  const id = String(tenantId || "").trim();
  if (!id || !/^[A-Za-z0-9_.:-]{1,128}$/.test(id)) {
    throw new Error("activateAccount: tenantId inválido");
  }
  const platformRoot = resolvePlatformRoot();
  fs.mkdirSync(platformRoot, { recursive: true });
  const previousHome = resolveWayneHome();
  const previous = readActiveAccount(platformRoot);
  const home = accountHomeFor(id, platformRoot);
  fs.mkdirSync(home, { recursive: true });
  migrateLegacyHomeIntoAccount(home, platformRoot);
  const payload = {
    tenantId: id,
    email: typeof email === "string" ? email : "",
    activatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(activeAccountPath(platformRoot), JSON.stringify(payload, null, 2) + "\n", "utf8");
  process.env.WAYNE_HOME = home;
  process.env.WORK4YOU_HOME = home;
  return {
    home,
    previousTenantId: previous?.tenantId || null,
    // First pin (platform root → accounts/<id>) and A→B both need a motor restart.
    switched: path.resolve(previousHome) !== path.resolve(home),
  };
}

function clearActiveAccount() {
  const platformRoot = resolvePlatformRoot();
  try {
    fs.rmSync(activeAccountPath(platformRoot), { force: true });
  } catch {
    /* ignore */
  }
  delete process.env.WAYNE_HOME;
  delete process.env.WORK4YOU_HOME;
}

module.exports = {
  resolveWayneHome,
  resolvePlatformRoot,
  resolveSharedEngineRoot,
  readActiveAccount,
  activateAccount,
  clearActiveAccount,
  accountHomeFor,
};
