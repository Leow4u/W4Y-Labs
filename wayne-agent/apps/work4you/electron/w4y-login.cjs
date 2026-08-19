/**
 * w4y-login.cjs — Work4You login + device engine-key → WAYNE_HOME/.env
 */
"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { app, BrowserWindow, net, session, shell } = require("electron");
const { appOrigin, cloudApiRequest, platformOrigin, setCloudSessionHealer } = require("./w4y-cloud.cjs");
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

function requestLoginEnter(timeoutMs = 30_000) {
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

/**
 * Hand the platform session over to the tenant, and prove it landed.
 *
 * `/login/enter` mints an SSO ticket and 303s to the tenant's
 * `/auth/platform-sso`, which is what actually sets the cookies every tenant
 * API needs — identity, plan, cloud projects, connectors. Following that
 * redirect is not evidence it worked: with no platform session the same route
 * bounces to `/login`, and a 200 on the login page is what this used to report
 * as success (17/08). So ask the tenant who we are and believe only that.
 *
 * Retried because the tenant machine may be suspended. `/login/enter` already
 * waits up to 25s for the wake, but a machine that is still coming up answers
 * 502 for a few seconds after, and one attempt would throw the session away.
 */
async function bootstrapAppSession(timeoutMs = 30_000) {
  await clearForbiddenRouteCookies();
  let last = { ok: false };

  // Packaged desktop: Chromium handoff is reliable; net.request often loses
  // cross-site Set-Cookie on the platform-sso redirect chain (upgrade installs).
  if (app.isPackaged) {
    const viaBrowser = await bootstrapAppSessionViaBrowser(
      Math.max(timeoutMs, 60_000),
    );
    if (viaBrowser.ok) return viaBrowser;
    last = viaBrowser;
  }

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((r) => setTimeout(r, 2_000 * attempt));

    const enter = await requestLoginEnter(timeoutMs);
    const who = await cloudApiRequest(
      { method: "GET", path: "/api/auth/me" },
      12_000,
    );
    if (tenantIdentityOk(who)) {
      await flushSessionCookies();
      return { ok: true, email: who.json && who.json.email };
    }

    // 401 is a real answer from a reachable tenant: the handoff did not take,
    // and hammering it will not change that.
    last = { ok: false, status: who.status, enter: enter.ok };
    if (who.status === 401) break;
  }

  return last;
}

/**
 * Drive `/login/enter` in a real BrowserWindow so the platform-sso redirect
 * chain lands tenant session cookies in the default jar (net.request does not).
 */
async function bootstrapAppSessionViaBrowser(timeoutMs = 60_000) {
  const enterUrl = `${platformOrigin()}/login/enter`;
  const deadline = Date.now() + timeoutMs;
  const win = new BrowserWindow({
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });

  const destroy = () => {
    try {
      if (!win.isDestroyed()) win.destroy();
    } catch {
      /* ignore */
    }
  };

  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error("sso-handoff-timeout"));
      }, timeoutMs);
      win.webContents.once("did-fail-load", (_e, _code, desc) => {
        clearTimeout(timer);
        reject(new Error(desc || "sso-handoff-load-failed"));
      });
      win.loadURL(enterUrl).then(
        () => {
          clearTimeout(timer);
          resolve();
        },
        (err) => {
          clearTimeout(timer);
          reject(err);
        },
      );
    });

    while (Date.now() < deadline) {
      const who = await cloudApiRequest(
        { method: "GET", path: "/api/auth/me" },
        12_000,
      );
      if (tenantIdentityOk(who)) {
        await flushSessionCookies();
        return { ok: true, email: who.json && who.json.email };
      }
      if (who.status === 401 && Date.now() + 4_000 > deadline) break;
      await new Promise((r) => setTimeout(r, 1500));
    }
    return { ok: false, reason: "tenant-identity-missing" };
  } catch (err) {
    return { ok: false, reason: String(err && err.message) };
  } finally {
    destroy();
  }
}

/**
 * One-time hygiene after shared-motor revocation: drop lab route + stale tenant
 * cookies so the next heal/login can SSO into the dedicated Fly.
 */
async function migrateSharedMotorDesktopSession() {
  const sess = session.defaultSession;
  let hadLabRoute = false;
  try {
    const routes = await sess.cookies.get({ name: "w4y_route" });
    hadLabRoute = routes.some(
      (c) => decodeURIComponent(String(c.value || "").trim()) === "wayne-w4y",
    );
  } catch {
    /* ignore */
  }
  await clearForbiddenRouteCookies();
  if (hadLabRoute) {
    try {
      await clearDefaultSessionCookies(appOrigin());
    } catch {
      /* ignore */
    }
  }
  if (hasOpenRouterKey()) {
    return healTenantSession();
  }
  return { ok: false, skipped: true };
}

/**
 * Write the cookie jar to disk before anyone kills this process.
 *
 * Chromium batches cookie writes and flushes on its own schedule. The login
 * ends in `app.exit(0)` — a hard exit that runs no teardown — within a second
 * of the tenant cookies arriving, so without this they can be lost between
 * "signed in" and the relaunch. That is the state the user lands in: the
 * OpenRouter key is on disk so the gate opens, but every tenant API 401s and
 * the whole app reads as signed out (17/08).
 */
async function flushSessionCookies() {
  try {
    await session.defaultSession.cookies.flushStore();
    return true;
  } catch {
    return false;
  }
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
        // COMPOSIO_API_KEY não vem daqui: chega pelo broker do tenant em
        // bootstrapLocalConnectors() (w4y-composio.cjs). A Composio não nos deixa
        // cunhar chave por dispositivo — ver docs/BACKEND-MAP.md.
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
        try {
          if (flow.win && !flow.win.isDestroyed()) flow.win.destroy();
        } catch {
          /* ignore */
        }
        loginFlow = null;
        const appSession = await bootstrapAppSession();
        // AFTER the handoff, never before. The Composio key comes from the
        // tenant broker, which is gated by the very cookies bootstrapAppSession
        // just obtained — asking first is a guaranteed 401, and it fails
        // silently, so a first login could never provision connectors and the
        // engine answered 503 forever after (17/08).
        try {
          await bootstrapLocalConnectors();
        } catch {
          /* ignore — marketplace attach can recover later */
        }
        // The relaunch / soft restart below needs cookies on disk first.
        await flushSessionCookies();
        // Motor loads .env at process start. Restart it whenever we mint a
        // key — but only relaunch the *whole app* when the account home path
        // changed. Same-home sign-in used to always app.exit(0), which is why
        // login felt broken next to Cursor/Claude (17/08).
        const homeSwitched = Boolean(accountSwitch?.switched);
        const needsMotorRestart = Boolean(key) || homeSwitched;
        if (needsMotorRestart && typeof onAccountSwitched === "function") {
          try {
            await onAccountSwitched(
              accountSwitch || {
                switched: false,
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
          // The gate opens only on tenant identity now; surface handoff result
          // so a half-login is not indistinguishable from a clean one.
          tenantSession: Boolean(appSession.ok),
          tenantId: tenantId || null,
          plan: String(plan || "free"),
          switched: homeSwitched,
          motorRestarted: needsMotorRestart,
          softRestart: needsMotorRestart && !homeSwitched,
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
  let accountSwitch = null;

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
            accountSwitch = activateAccount({
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
  // Repair a half-finished login. Identity is the tenant session now; without
  // this heal a surviving OpenRouter key used to open the gate while every
  // tenant surface said "Sem sessão".
  const healed = hasKey ? await healTenantSession() : { ok: false };

  if (minted && typeof onAccountSwitched === "function") {
    // Never await motor restart here. ensureCredentials runs on every boot
    // behind the account gate — awaiting soft ensureBackend after a motor ZIP
    // (or a hung spawn) stranded users on "A verificar sessão…" with Continuar
    // disabled. Fire-and-forget: tenant identity does not need the local motor.
    void Promise.resolve(
      onAccountSwitched(
        accountSwitch || {
          switched: false,
          home: resolveWayneHome(),
          previousTenantId: null,
        },
      ),
    ).catch(() => {
      /* relaunch may exit the process */
    });
  }

  return {
    ok: hasKey,
    hasKey,
    minted,
    seeded,
    tenantSession: Boolean(healed.ok),
    home: resolveWayneHome(),
  };
}

/** True only when the tenant answered with a real identity payload. */
function tenantIdentityOk(who) {
  if (!who || !who.ok || !who.json || typeof who.json !== "object") return false;
  const email = String(who.json.email || "").trim();
  const userId = String(who.json.user_id || who.json.userId || "").trim();
  return Boolean(email || userId);
}

/**
 * Drop a lab/shared `w4y_route` so `/login/enter` can mint the dedicated app.
 * After shared-motor revocation the Electron jar often still had wayne-w4y;
 * following a 302 to the login HTML then looked like "ok" to heal.
 */
async function clearForbiddenRouteCookies() {
  const sess = session.defaultSession;
  try {
    const cookies = await sess.cookies.get({ name: "w4y_route" });
    await Promise.all(
      cookies
        .filter((c) => {
          const v = decodeURIComponent(String(c.value || "").trim());
          return !v || v === "wayne-w4y";
        })
        .map((c) => {
          const host = (c.domain || "work4you.ai").replace(/^\./, "");
          const scheme = c.secure === false ? "http" : "https";
          const cookieUrl = `${scheme}://${host}${c.path || "/"}`;
          return sess.cookies.remove(cookieUrl, c.name).catch(() => undefined);
        }),
    );
  } catch {
    /* best effort */
  }
}

/**
 * Re-run the handoff when the tenant no longer knows us.
 *
 * Cheap when everything is fine — one `/api/auth/me` that answers from cookies
 * already on disk. Only a tenant that says "who?" costs a handoff, and only a
 * handoff that succeeds costs a connector bootstrap, which is also how a
 * device that logged in before connectors existed picks up its Composio key
 * without the user having to sign out and back in.
 */
async function healTenantSession() {
  const who = await cloudApiRequest({ method: "GET", path: "/api/auth/me" }, 12_000);
  // Require identity JSON — a followed redirect to the login HTML is status 200
  // with no body, and must not short-circuit the handoff (shared-motor migrate).
  if (tenantIdentityOk(who)) return { ok: true, healed: false };

  await clearForbiddenRouteCookies();
  const restored = await bootstrapAppSession();
  if (!restored.ok) return { ok: false, healed: false };

  try {
    await bootstrapLocalConnectors();
  } catch {
    /* ignore — the session is what mattered here */
  }
  await flushSessionCookies();
  return { ok: true, healed: true };
}

/** Chaves que a plataforma provisiona — nunca segredos BYO do utilizador.
 *
 * A de modelos vem de POST /device/engine-key; a de conectores e a identidade
 * Composio vêm do broker do tenant (bootstrapLocalConnectors). Todas saem do
 * .env ao trocar de conta: manter a identidade da conta anterior apontaria este
 * dispositivo ao escopo de outro tenant.
 */
const PLATFORM_ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "COMPOSIO_API_KEY",
  "W4Y_CONNECTOR_USER_ID",
];

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

  // Let cloud WS mint re-SSO when the lab route cookie is stale (no require cycle).
  setCloudSessionHealer(async () => {
    await clearForbiddenRouteCookies();
    return bootstrapAppSession(30_000);
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
  migrateSharedMotorDesktopSession,
  healTenantSession,
  upsertEnvKey,
  activateAccount,
  clearActiveAccount,
  readActiveAccount,
};
