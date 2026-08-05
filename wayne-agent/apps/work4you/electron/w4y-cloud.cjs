/**
 * w4y-cloud.cjs — Work4You cloud bridge (ported from desktop-shell).
 * Cookies stay in session.defaultSession; renderer only gets tickets/JSON.
 */
"use strict";

const { net, session } = require("electron");

const CLOUD_API_METHODS = new Set(["GET", "POST", "PATCH", "PUT", "DELETE"]);

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

async function mintCloudWsUrl() {
  const APP_ORIGIN = appOrigin();
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
  const origin = new URL(APP_ORIGIN);
  const scheme = origin.protocol === "https:" ? "wss" : "ws";
  return {
    ok: true,
    url: `${scheme}://${origin.host}/api/ws?ticket=${encodeURIComponent(ticket)}`,
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

module.exports = {
  cloudApiRequest,
  mintCloudWsUrl,
  platformOrigin,
  appOrigin,
  registerCloudIpc,
};
