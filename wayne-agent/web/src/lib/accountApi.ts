/**
 * accountApi — single-brain routing for ACCOUNT data vs WORKER data.
 *
 * Product rule (um cérebro só): on the local-engine desktop, identity and
 * account inventory (connectors, agents/profiles, account projects, …) live
 * on the cloud tenant. The local motor is a WORKER (files, terminal, local
 * runs). Pure web already talks to the cloud via same-origin — no bridge.
 *
 *   accountGetJson / accountPostJson / accountMutateJson
 *     → cloud bridge when local-engine + logged-in
 *     → same-origin fetchJSON otherwise (web = account; desktop signed-out =
 *       worker fallback so the UI still paints)
 *
 * Worker paths (local session WS, local /api/fs for cwd, executor) MUST keep
 * using api.* / GatewayClient directly — never this module.
 */
import { fetchJSON } from "@/lib/api";
import {
  cloudBridge,
  cloudGetJson,
  cloudMutateJson,
  cloudPostJson,
  probeCloudLogin,
} from "@/lib/cloudSession";
import { isLocalEngine } from "@/lib/projects";

export type ApiSurface = "account" | "worker";

const LOGIN_TTL_MS = 60_000;
let loginCache: { at: number; value: boolean | null } | null = null;

/** Drop the cached login probe (e.g. after an explicit sign-in attempt). */
export function clearAccountLoginCache(): void {
  loginCache = null;
}

/**
 * True when account reads should go through the cloud bridge.
 * Web → false (same-origin already IS the account).
 * Local-engine + bridge + live login → true.
 * Signed out / no bridge → false (worker / local gateway).
 */
export async function shouldUseAccountCloud(): Promise<boolean> {
  if (!isLocalEngine()) return false;
  if (!cloudBridge()) return false;
  const now = Date.now();
  if (loginCache && now - loginCache.at < LOGIN_TTL_MS) {
    return loginCache.value === true;
  }
  const v = await probeCloudLogin();
  loginCache = { at: now, value: v };
  return v === true;
}

/** Sync hint for UI (bridge present). Login itself is async — use the hook. */
export function accountBridgeAvailable(): boolean {
  return isLocalEngine() && cloudBridge() !== null;
}

async function sameOriginGet<T>(path: string): Promise<T | null> {
  try {
    return await fetchJSON<T>(path);
  } catch {
    return null;
  }
}

/** Account GET — cloud when the desktop is logged in; else same-origin. */
export async function accountGetJson<T>(
  path: string,
  timeoutMs = 8000,
): Promise<T | null> {
  if (await shouldUseAccountCloud()) {
    return cloudGetJson<T>(path, timeoutMs);
  }
  return sameOriginGet<T>(path);
}

/** Account POST — same routing as GET. */
export async function accountPostJson<T>(
  path: string,
  body?: unknown,
  timeoutMs = 15000,
): Promise<T | null> {
  if (await shouldUseAccountCloud()) {
    return cloudPostJson<T>(path, body, timeoutMs);
  }
  try {
    return await fetchJSON<T>(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
    });
  } catch {
    return null;
  }
}

/** Account PATCH/PUT/DELETE — bridge when logged in; else same-origin. */
export async function accountMutateJson<T>(
  path: string,
  method: "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  timeoutMs = 15000,
): Promise<T | null> {
  if (await shouldUseAccountCloud()) {
    return cloudMutateJson<T>(path, method, body, timeoutMs);
  }
  try {
    return await fetchJSON<T>(path, {
      method,
      headers:
        body !== undefined ? { "Content-Type": "application/json" } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    return null;
  }
}
