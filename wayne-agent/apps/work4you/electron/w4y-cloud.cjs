/**
 * w4y-cloud.cjs — Work4You cloud bridge (ported from desktop-shell).
 * Cookies stay in session.defaultSession; renderer only gets tickets/JSON.
 */
"use strict";

const { net, session } = require("electron");

const CLOUD_API_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);
const FORBIDDEN_FLY_APPS = new Set(["wayne-w4y"]);
const FLY_APP_RE = /^wayne-[a-z0-9-]{2,30}$/;

function platformOrigin() {
  return (process.env.W4Y_PLATFORM_ORIGIN || "https://work4you.ai").replace(/\/$/, "");
}

/** Tenant app (Fly motor + SPA) — same host as browser chat after E1. */
function appOrigin() {
  return (process.env.W4Y_APP_ORIGIN || "https://app.work4you.ai").replace(/\/$/, "");
}

function cloudApiRequest(args, timeoutMs = 15_000) {
  const APP_ORIGIN = appOrigin();
  return new Promise((resolve) => {
    const rawMethod = args && typeof args.method === "string" ? args.method : "GET";
    const method = CLOUD_API_METHODS.has(rawMethod) ? rawMethod : "GET";
    const rawPath = args && typeof args.path === "string" ? args.path : "";
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
        /* ignore */
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
          /* non-JSON */
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
      const body =
        args && args.body !== undefined ? args.body : method === "POST" ? {} : undefined;
      if (body !== undefined) {
        request.setHeader("Content-Type", "application/json");
        request.write(JSON.stringify(body));
      }
    }
    request.end();
  });
}

async function mintCloudWsTicketOnce() {
  const res = await cloudApiRequest(
    { method: "POST", path: "/api/auth/ws-ticket" },
    8_000,
  );
  if (!res.ok) {
    return {
      ok: false,
      error: res.status === 401 ? "not-logged-in" : res.error || "network",
    };
  }
  const ticket =
    res.json && typeof res.json.ticket === "string" ? res.json.ticket : "";
  if (!ticket) return { ok: false, error: "network" };
  return { ok: true, ticket };
}

/** Optional healer registered by w4y-login (avoids a require cycle). */
let cloudSessionHealer = null;

function setCloudSessionHealer(fn) {
  cloudSessionHealer = typeof fn === "function" ? fn : null;
}

async function readW4yRouteFlyApp() {
  try {
    const cookies = await session.defaultSession.cookies.get({ name: "w4y_route" });
    for (const c of cookies) {
      const v = decodeURIComponent(String(c.value || "").trim());
      if (FLY_APP_RE.test(v) && !FORBIDDEN_FLY_APPS.has(v)) return v;
    }
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * Desktop packaged shell: connect straight to the tenant Fly when we know the
 * app name. The router at app.work4you.ai needs w4y_route on the WebSocket
 * wire — Chromium will not attach it from file:// even with a cookie bridge.
 */
function buildCloudGatewayWsUrl(ticket, flyApp) {
  if (flyApp) {
    return `wss://${flyApp}.fly.dev/api/ws?ticket=${encodeURIComponent(ticket)}`;
  }
  const origin = new URL(appOrigin());
  const scheme = origin.protocol === "https:" ? "wss" : "ws";
  return `${scheme}://${origin.host}/api/ws?ticket=${encodeURIComponent(ticket)}`;
}

async function mintCloudWsUrl() {
  let minted = await mintCloudWsTicketOnce();
  // Stale lab route cookie (wayne-w4y) → 401 from router; re-SSO once.
  if (!minted.ok && minted.error === "not-logged-in" && cloudSessionHealer) {
    try {
      const handoff = await cloudSessionHealer();
      if (handoff && handoff.ok) {
        minted = await mintCloudWsTicketOnce();
      }
    } catch {
      /* keep first error */
    }
  }
  if (!minted.ok) return minted;
  const flyApp = await readW4yRouteFlyApp();
  return {
    ok: true,
    url: buildCloudGatewayWsUrl(minted.ticket, flyApp),
    flyApp: flyApp || null,
  };
}

function registerCloudIpc(ipcMain) {
  ipcMain.removeHandler?.("w4y:cloud:wsUrl");
  ipcMain.removeHandler?.("w4y:cloud:api");
  ipcMain.removeHandler?.("w4y:cloud:canMutate");
  ipcMain.handle("w4y:cloud:wsUrl", () => mintCloudWsUrl());
  ipcMain.handle("w4y:cloud:api", (_e, args) => cloudApiRequest(args || {}));
  ipcMain.handle("w4y:cloud:canMutate", async () => true);
}

let cloudBodyCookieBridgeInstalled = false;
/** Sync header value — onBeforeSendHeaders must not await (WS handshake race). */
let cachedAppCookieHeader = "";

async function refreshCloudBodyCookieCache() {
  const seen = new Map();
  const urls = [appOrigin(), platformOrigin()];
  for (const base of urls) {
    try {
      const cookies = await session.defaultSession.cookies.get({ url: base });
      for (const c of cookies) {
        if (!seen.has(c.name)) seen.set(c.name, c.value);
      }
    } catch {
      /* ignore */
    }
  }
  cachedAppCookieHeader = [...seen.entries()]
    .map(([name, value]) => `${name}=${value}`)
    .join("; ");
}

/**
 * Belt-and-suspenders for renderer fetch/XHR to app.work4you.ai. Primary WS
 * path bypasses the router via direct *.fly.dev (see buildCloudGatewayWsUrl).
 */
function installCloudBodyCookieBridge() {
  if (cloudBodyCookieBridgeInstalled) return;
  cloudBodyCookieBridgeInstalled = true;

  let filterHost;
  try {
    filterHost = new URL(appOrigin()).host;
  } catch {
    return;
  }

  void refreshCloudBodyCookieCache();
  try {
    session.defaultSession.cookies.on("changed", () => {
      void refreshCloudBodyCookieCache();
    });
  } catch {
    /* ignore */
  }

  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: [`*://${filterHost}/*`] },
    (details, callback) => {
      const headers = { ...details.requestHeaders };
      if (cachedAppCookieHeader) {
        headers.Cookie = cachedAppCookieHeader;
      }
      callback({ requestHeaders: headers });
    },
  );
}

module.exports = {
  cloudApiRequest,
  mintCloudWsUrl,
  platformOrigin,
  appOrigin,
  installCloudBodyCookieBridge,
  refreshCloudBodyCookieCache,
  registerCloudIpc,
  setCloudSessionHealer,
  buildCloudGatewayWsUrl,
  readW4yRouteFlyApp,
};
