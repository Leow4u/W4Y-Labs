/**
 * w4y-login.cjs — Work4You login + device engine-key → WAYNE_HOME/.env
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, net, session, shell } = require("electron");
const { appOrigin, platformOrigin } = require("./w4y-cloud.cjs");
const { bootstrapLocalConnectors } = require("./w4y-composio.cjs");
const {
  resolveWayneHome,
  activateAccount,
  clearActiveAccount,
  readActiveAccount,
} = require("./w4y-home.cjs");
const { ensurePlatformModelConfig } = require("./w4y-platform-config.cjs");

function envPath() {
  return path.join(resolveWayneHome(), ".env");
}

function upsertEnvKey(key, value) {
  const file = envPath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let text = "";
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    text = "";
  }
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(text)) text = text.replace(re, line);
  else text = text ? `${text.replace(/\s*$/, "")}\n${line}\n` : `${line}\n`;
  fs.writeFileSync(file, text, "utf8");
}

function hasOpenRouterKey() {
  try {
    const text = fs.readFileSync(envPath(), "utf8");
    return /^OPENROUTER_API_KEY=\S+/m.test(text);
  } catch {
    return false;
  }
}

function deviceKeyUrl() {
  return (
    process.env.W4Y_DEVICE_KEY_URL ||
    `${platformOrigin()}/device/engine-key`
  );
}

function loginUrl(returnTo = "/device") {
  const q = new URLSearchParams({ next: returnTo });
  return `${platformOrigin()}/login?${q.toString()}`;
}

function platformStatusUrl() {
  return `${platformOrigin()}/onboarding/status`;
}

function requestPlatformStatus(timeoutMs = 8_000) {
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
        method: "GET",
        url: platformStatusUrl(),
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
        /* ignore */
      }
      fail(new Error("platform-status timed out"));
    }, timeoutMs);
    request.on("response", (res) => {
      const chunks = [];
      res.on("data", (c) => chunks.push(Buffer.from(c)));
      res.on("end", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ status: res.statusCode || 0 });
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
    request.end();
  });
}

async function probePlatformSession() {
  try {
    const res = await requestPlatformStatus(8_000);
    if (res.status === 401) return { ok: true, loggedIn: false };
    if (res.status >= 200 && res.status < 300) return { ok: true, loggedIn: true };
    return { ok: false, loggedIn: null };
  } catch {
    return { ok: false, loggedIn: null };
  }
}

function bootstrapAppSession(timeoutMs = 30_000) {
  const origin = platformOrigin();
  return new Promise((resolve) => {
    let settled = false;
    const done = (value) => {
      if (!settled) {
        settled = true;
        resolve(value);
      }
    };
    let request;
    try {
      request = net.request({
        method: "GET",
        url: `${origin}/login/enter`,
        session: session.defaultSession,
        useSessionCookies: true,
        redirect: "follow",
      });
    } catch {
      done({ ok: false });
      return;
    }
    const timer = setTimeout(() => {
      try {
        request.abort();
      } catch {
        /* ignore */
      }
      done({ ok: false, error: "timeout" });
    }, timeoutMs);
    request.on("response", (res) => {
      res.on("data", () => {});
      res.on("end", () => {
        clearTimeout(timer);
        const status = res.statusCode || 0;
        done({ ok: status >= 200 && status < 400 });
      });
      res.on("error", () => {
        clearTimeout(timer);
        done({ ok: false });
      });
    });
    request.on("error", () => {
      clearTimeout(timer);
      done({ ok: false });
    });
    request.end();
  });
}

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
        url: deviceKeyUrl(),
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
        /* ignore */
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
          /* ignore */
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

let loginFlow = null;

function loginWindowIcon() {
  const candidates = [
    ...(process.resourcesPath ? [path.join(process.resourcesPath, "icon.ico")] : []),
    path.join(app.getAppPath(), "assets", "icon.ico"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      /* try next */
    }
  }
  return undefined;
}

function openLoginWindow(parent) {
  const icon = loginWindowIcon();
  const win = new BrowserWindow({
    width: 480,
    height: 700,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    title: "Entrar — Work4You",
    icon: icon || undefined,
    autoHideMenuBar: true,
    backgroundColor: "#0e0e0e",
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  const appHost = new URL(platformOrigin()).host;
  win.webContents.setWindowOpenHandler(({ url }) => {
    try {
      const host = new URL(url).host;
      if (
        host === appHost ||
        host.endsWith(".work4you.ai") ||
        /\.google\.com$|\.github\.com$/.test(host)
      ) {
        return { action: "allow" };
      }
      void shell.openExternal(url);
    } catch {
      /* deny */
    }
    return { action: "deny" };
  });
  void win.loadURL(loginUrl());
  return win;
}

/**
 * Opens login, polls device-key until 200/402/cancel, writes OPENROUTER_API_KEY.
 * Activates a per-tenant WAYNE_HOME under accounts/<tenantId> when the platform
 * returns tenantId (1 email = 1 data home on the same Windows user).
 */
async function runLoginFlow({ parentWindow, onAccountSwitched } = {}) {
  if (loginFlow) {
    loginFlow.cancelled = true;
    try {
      if (loginFlow.win && !loginFlow.win.isDestroyed()) loginFlow.win.destroy();
    } catch {
      /* ignore */
    }
    loginFlow = null;
    await new Promise((r) => setTimeout(r, 400));
  }
  const flow = { win: null, cancelled: false, handoffReady: false };
  loginFlow = flow;
  flow.win = openLoginWindow(parentWindow);
  flow.win.on("closed", () => {
    flow.cancelled = true;
  });
  const markHandoffReady = (url) => {
    if (typeof url === "string" && url.includes("/device")) {
      flow.handoffReady = true;
    }
  };
  flow.win.webContents.on("did-navigate", (_event, url) => markHandoffReady(url));
  flow.win.webContents.on("did-navigate-in-page", (_event, url) => markHandoffReady(url));
  flow.win.webContents.on("did-finish-load", () => {
    try {
      markHandoffReady(flow.win.webContents.getURL());
    } catch {
      /* ignore */
    }
  });

  const started = Date.now();
  const deadline = started + 10 * 60 * 1000;
  try {
    while (!flow.cancelled && Date.now() < deadline) {
      let res;
      try {
        res = await requestDeviceEngineKey(10_000);
      } catch {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (flow.cancelled) break;
      if (res.status === 401) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      if (res.status === 429) {
        await new Promise((r) => setTimeout(r, 60_000));
        continue;
      }
      if (res.status === 402) {
        if (!flow.handoffReady) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        try {
          if (flow.win && !flow.win.isDestroyed()) flow.win.destroy();
        } catch {
          /* ignore */
        }
        loginFlow = null;
        await bootstrapAppSession();
        return { ok: true, got: "no-credit" };
      }
      if (res.status >= 200 && res.status < 300 && res.json) {
        if (!flow.handoffReady) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        const tenantId =
          res.json.tenantId ||
          res.json.tenant_id ||
          res.json.orgId ||
          res.json.org_id ||
          "";
        const email = res.json.email || "";
        let accountSwitch = null;
        if (tenantId) {
          try {
            accountSwitch = activateAccount({
              tenantId: String(tenantId),
              email: String(email || ""),
            });
          } catch {
            accountSwitch = null;
          }
        }
        const key =
          res.json.key ||
          res.json.openrouterApiKey ||
          res.json.openrouter_api_key ||
          res.json.apiKey ||
          "";
        if (key) upsertEnvKey("OPENROUTER_API_KEY", String(key));
        const composio =
          res.json.composioApiKey ||
          res.json.composio_api_key ||
          res.json.composioKey ||
          "";
        if (composio) upsertEnvKey("COMPOSIO_API_KEY", String(composio));
        // Platform-managed tool secrets (Firecrawl / Langfuse) from engine-key.
        const toolEnv =
          res.json.toolEnv && typeof res.json.toolEnv === "object"
            ? res.json.toolEnv
            : null;
        if (toolEnv) {
          for (const [name, value] of Object.entries(toolEnv)) {
            if (
              typeof name === "string" &&
              /^[A-Z][A-Z0-9_]*$/.test(name) &&
              typeof value === "string" &&
              value.trim()
            ) {
              upsertEnvKey(name, value.trim());
            }
          }
        }
        // Seed OpenRouter + Relay/Auto so the motor never boots with provider ''.
        const plan =
          res.json.plan ||
          res.json.billingPlan ||
          res.json.billing_plan ||
          "free";
        try {
          ensurePlatformModelConfig(resolveWayneHome(), plan);
        } catch {
          /* best effort — key alone still unlocks chat after relaunch */
        }
        // Best-effort: mint a device tool-router URL into mcp_servers.composio.
        // Failures must not block login — marketplace attach can recover later.
        try {
          await bootstrapLocalConnectors();
        } catch {
          /* ignore */
        }
        try {
          if (flow.win && !flow.win.isDestroyed()) flow.win.destroy();
        } catch {
          /* ignore */
        }
        loginFlow = null;
        await bootstrapAppSession();
        // Motor only loads .env at process start — always relaunch when we mint
        // a device key, not only when the account home path changes.
        const needsMotorRestart =
          Boolean(key) || Boolean(accountSwitch?.switched);
        if (needsMotorRestart && typeof onAccountSwitched === "function") {
          try {
            await onAccountSwitched(
              accountSwitch || {
                switched: true,
                home: resolveWayneHome(),
                previousTenantId: null,
              },
            );
          } catch {
            /* ignore — caller may relaunch */
          }
        }
        return {
          ok: true,
          got: key ? "key" : "no-credit",
          tenantId: tenantId || null,
          plan: String(plan || "free"),
          switched: Boolean(accountSwitch?.switched),
          motorRestarted: needsMotorRestart,
        };
      }
      await new Promise((r) => setTimeout(r, 1500));
    }
    loginFlow = null;
    return { ok: false, reason: flow.cancelled ? "cancelled" : "timeout" };
  } catch (err) {
    loginFlow = null;
    return { ok: false, reason: "network", error: String(err && err.message) };
  }
}

function cancelLoginFlow() {
  if (!loginFlow) return { ok: true };
  loginFlow.cancelled = true;
  try {
    if (loginFlow.win && !loginFlow.win.isDestroyed()) loginFlow.win.destroy();
  } catch {
    /* ignore */
  }
  loginFlow = null;
  return { ok: true };
}

/**
 * Product-wide heal: ensure the active account has an OpenRouter device key
 * and platform model defaults. Used on boot and instead of scary first-login
 * toasts when the motor probes before .env is ready.
 */
async function ensurePlatformCredentials({ onAccountSwitched } = {}) {
  const home = resolveWayneHome();
  let minted = false;
  let plan = "free";

  if (!hasOpenRouterKey()) {
    try {
      const res = await requestDeviceEngineKey(12_000);
      if (res.status >= 200 && res.status < 300 && res.json) {
        const tenantId =
          res.json.tenantId ||
          res.json.tenant_id ||
          res.json.orgId ||
          res.json.org_id ||
          "";
        const email = res.json.email || "";
        if (tenantId) {
          try {
            activateAccount({
              tenantId: String(tenantId),
              email: String(email || ""),
            });
          } catch {
            /* keep current home */
          }
        }
        const key =
          res.json.key ||
          res.json.openrouterApiKey ||
          res.json.openrouter_api_key ||
          res.json.apiKey ||
          "";
        if (key) {
          upsertEnvKey("OPENROUTER_API_KEY", String(key));
          minted = true;
        }
        plan =
          res.json.plan ||
          res.json.billingPlan ||
          res.json.billing_plan ||
          plan;
        const composio =
          res.json.composioApiKey ||
          res.json.composio_api_key ||
          res.json.composioKey ||
          "";
        if (composio) upsertEnvKey("COMPOSIO_API_KEY", String(composio));
      }
    } catch {
      /* session may be logged out */
    }
  }

  let seeded = false;
  try {
    const cfg = ensurePlatformModelConfig(resolveWayneHome() || home, plan);
    seeded = Boolean(cfg?.wrote);
  } catch {
    /* ignore */
  }

  const hasKey = hasOpenRouterKey();
  if (minted && typeof onAccountSwitched === "function") {
    try {
      await onAccountSwitched({
        switched: true,
        home: resolveWayneHome(),
        previousTenantId: null,
      });
    } catch {
      /* relaunch may exit the process */
    }
  }

  return {
    ok: hasKey,
    hasKey,
    minted,
    seeded,
    home: resolveWayneHome(),
  };
}

/** Keys minted by POST /device/engine-key — not user BYO secrets. */
const PLATFORM_ENV_KEYS = ["OPENROUTER_API_KEY", "COMPOSIO_API_KEY"];

function removePlatformEnvKeys() {
  const file = envPath();
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  let next = text;
  for (const key of PLATFORM_ENV_KEYS) {
    next = next.replace(new RegExp(`^${key}=.*\\n?`, "m"), "");
  }
  next = next.replace(/\n{3,}/g, "\n\n").trim();
  if (!next) {
    try {
      fs.unlinkSync(file);
    } catch {
      try {
        fs.writeFileSync(file, "", "utf8");
      } catch {
        /* ignore */
      }
    }
    return;
  }
  fs.writeFileSync(file, next.endsWith("\n") ? next : `${next}\n`, "utf8");
}

async function clearDefaultSessionCookies(origin) {
  const sess = session.defaultSession;
  try {
    const cookies = await sess.cookies.get({ url: origin });
    await Promise.all(
      cookies.map((c) => {
        const scheme = c.secure ? "https" : "http";
        const host = (c.domain || new URL(origin).hostname).replace(/^\./, "");
        const cookieUrl = `${scheme}://${host}${c.path || "/"}`;
        return sess.cookies.remove(cookieUrl, c.name).catch(() => undefined);
      }),
    );
  } catch {
    /* best effort */
  }
}

function requestPlatformLogout() {
  const origin = platformOrigin();
  return new Promise((resolve) => {
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
        method: "POST",
        url: `${origin}/login/logout`,
        session: session.defaultSession,
        useSessionCookies: true,
        redirect: "follow",
      });
    } catch {
      done({ ok: false });
      return;
    }
    const timer = setTimeout(() => {
      try {
        request.abort();
      } catch {
        /* ignore */
      }
      done({ ok: false });
    }, 10_000);
    request.on("response", () => {
      clearTimeout(timer);
      done({ ok: true });
    });
    request.on("error", () => {
      clearTimeout(timer);
      done({ ok: false });
    });
    request.end();
  });
}

async function runLogoutFlow({ onLoggedOut } = {}) {
  cancelLoginFlow();
  await requestPlatformLogout();
  await clearDefaultSessionCookies(platformOrigin());
  await clearDefaultSessionCookies(appOrigin());
  removePlatformEnvKeys();
  let hadAccount = false;
  try {
    hadAccount = Boolean(readActiveAccount());
    clearActiveAccount();
  } catch {
    /* ignore */
  }
  if (hadAccount && typeof onLoggedOut === "function") {
    try {
      await onLoggedOut();
    } catch {
      /* ignore — caller may relaunch */
    }
  }
  return { ok: true, clearedAccount: hadAccount };
}

function registerLoginIpc(ipcMain, { getMainWindow, onAccountSwitched, onLoggedOut } = {}) {
  ipcMain.removeHandler?.("w4y:login:url");
  ipcMain.removeHandler?.("w4y:login:run");
  ipcMain.removeHandler?.("w4y:login:cancel");
  ipcMain.removeHandler?.("w4y:login:hasKey");
  ipcMain.removeHandler?.("w4y:login:probeSession");
  ipcMain.removeHandler?.("w4y:login:bootstrapApp");
  ipcMain.removeHandler?.("w4y:login:logout");
  ipcMain.removeHandler?.("w4y:login:ensureCredentials");
  ipcMain.handle("w4y:login:url", () => loginUrl());
  ipcMain.handle("w4y:login:hasKey", () => ({ ok: true, hasKey: hasOpenRouterKey() }));
  ipcMain.handle("w4y:login:probeSession", () => probePlatformSession());
  ipcMain.handle("w4y:login:bootstrapApp", () => bootstrapAppSession());
  ipcMain.handle("w4y:login:cancel", () => cancelLoginFlow());
  ipcMain.handle("w4y:login:logout", () => runLogoutFlow({ onLoggedOut }));
  ipcMain.handle("w4y:login:ensureCredentials", () =>
    ensurePlatformCredentials({ onAccountSwitched }),
  );
  ipcMain.handle("w4y:login:run", async () => {
    const parent =
      typeof getMainWindow === "function" ? getMainWindow() : undefined;
    return runLoginFlow({ parentWindow: parent, onAccountSwitched });
  });

  // Boot heal: if an account is already pinned, seed Relay/OpenRouter defaults
  // so a stale empty provider never greets the next session.create.
  try {
    if (hasOpenRouterKey()) {
      ensurePlatformModelConfig(resolveWayneHome(), "free");
    }
  } catch {
    /* ignore */
  }
}

module.exports = {
  cancelLoginFlow,
  envPath,
  ensurePlatformCredentials,
  hasOpenRouterKey,
  loginUrl,
  registerLoginIpc,
  removePlatformEnvKeys,
  resolveWayneHome,
  runLoginFlow,
  runLogoutFlow,
  probePlatformSession,
  bootstrapAppSession,
  upsertEnvKey,
  activateAccount,
  clearActiveAccount,
  readActiveAccount,
};
