/**
 * w4y-login.cjs — Work4You login + device engine-key → WAYNE_HOME/.env
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { BrowserWindow, net, session, shell } = require("electron");
const { platformOrigin } = require("./w4y-cloud.cjs");
const { bootstrapLocalConnectors } = require("./w4y-composio.cjs");
const { resolveWayneHome } = require("./w4y-home.cjs");

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
  const q = new URLSearchParams({ return_to: returnTo });
  return `${platformOrigin()}/login?${q.toString()}`;
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

function openLoginWindow(parent) {
  const win = new BrowserWindow({
    width: 480,
    height: 700,
    parent: parent && !parent.isDestroyed() ? parent : undefined,
    title: "Entrar — Work4You",
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
 */
async function runLoginFlow({ parentWindow } = {}) {
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
  const flow = { win: null, cancelled: false };
  loginFlow = flow;
  flow.win = openLoginWindow(parentWindow);
  flow.win.on("closed", () => {
    flow.cancelled = true;
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
        try {
          if (flow.win && !flow.win.isDestroyed()) flow.win.destroy();
        } catch {
          /* ignore */
        }
        loginFlow = null;
        return { ok: true, got: "no-credit" };
      }
      if (res.status >= 200 && res.status < 300 && res.json) {
        const key =
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
        return { ok: true, got: key ? "key" : "no-credit" };
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

function registerLoginIpc(ipcMain, { getMainWindow } = {}) {
  ipcMain.removeHandler?.("w4y:login:url");
  ipcMain.removeHandler?.("w4y:login:run");
  ipcMain.removeHandler?.("w4y:login:cancel");
  ipcMain.removeHandler?.("w4y:login:hasKey");
  ipcMain.handle("w4y:login:url", () => loginUrl());
  ipcMain.handle("w4y:login:hasKey", () => ({ ok: true, hasKey: hasOpenRouterKey() }));
  ipcMain.handle("w4y:login:cancel", () => cancelLoginFlow());
  ipcMain.handle("w4y:login:run", async () => {
    const parent =
      typeof getMainWindow === "function" ? getMainWindow() : undefined;
    return runLoginFlow({ parentWindow: parent });
  });
}

module.exports = {
  cancelLoginFlow,
  envPath,
  hasOpenRouterKey,
  loginUrl,
  registerLoginIpc,
  resolveWayneHome,
  runLoginFlow,
  upsertEnvKey,
};
