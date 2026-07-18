/**
 * Cloud-target chat sessions from the LOCAL-ENGINE desktop (S1 mini-computer).
 *
 * On the motor-local desktop the SPA is served by the LOCAL gateway — every
 * same-origin request lands on this machine. The run-target selector lets a
 * NEW chat run on the user's CLOUD computer instead: same screen, same UI,
 * only the execution moves. Two shell IPCs make that possible (preload
 * `work4youDesktop.cloud`, main.cjs cloud-bridge block):
 *
 *   cloud.wsUrl() → a ready wss://work4you.ai/api/ws?ticket=… URL. The shell
 *     mints the single-use ticket with the login cookies it already holds
 *     (the parked Hermes desktop's mintGatewayWsTicket pattern). Tickets are
 *     one-shot with a ~30s TTL — mint FRESH before every connect/reconnect,
 *     which is why the GatewayClient takes a provider, not a URL.
 *
 *   cloud.api(path) → GET/POST/PATCH/PUT/DELETE against the cloud dashboard
 *     REST with those same cookies (main-enforced allowlist: app origin +
 *     /api/* only; shells ≤0.3.4 coerce non-GET/POST to GET — see
 *     cloudMutateJson). Used for the dock/card file reads of a cloud session
 *     — same-origin fetches would read the WRONG computer (this machine's
 *     gateway) — and, since 0.3.5, for the cloud rows' own mutations
 *     (rename/archive/delete sessions, edit/delete routines).
 *
 * The registry mirrors lib/localFile.ts: the chat page marks the cloud
 * session active while it owns the live view; consumers (dock preview/code,
 * file cards) route their reads without knowing about the session.
 */
import { isLocalEngine } from "@/lib/projects";

export type RunTarget = "local" | "cloud";

/** Thrown (as Error.message) when the mint fails because the user has no live
 *  login cookies — the UI maps it to the localized "sign in" state. */
export const CLOUD_NOT_LOGGED_IN = "cloud-not-logged-in";

interface CloudBridge {
  wsUrl: () => Promise<{ ok?: boolean; url?: string; error?: string }>;
  /** 0.3.5+ marker: the shell ferries PATCH/PUT/DELETE. Older shells lack it
   *  AND coerced unknown methods to GET — mutations MUST gate on this. */
  canMutate?: boolean;
  api: (
    path: string,
    opts?: { method?: CloudMethod; body?: unknown },
  ) => Promise<{ ok?: boolean; status?: number; json?: unknown; error?: string }>;
}

type CloudMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

/** The shell's cloud bridge, or null off the desktop / on older shells (≤0.3.2)
 *  that don't expose it — callers gate the UI on this, so the screen never
 *  offers a cloud the shell can't reach. */
export function cloudBridge(): CloudBridge | null {
  if (typeof window === "undefined") return null;
  const d = (
    window as unknown as { work4youDesktop?: { cloud?: CloudBridge } }
  ).work4youDesktop;
  const c = d?.cloud;
  return c && typeof c.wsUrl === "function" && typeof c.api === "function" ? c : null;
}

/** The run-target selector only exists where it means something: the
 *  local-engine desktop with a cloud-capable shell. */
export function cloudRunAvailable(): boolean {
  return isLocalEngine() && cloudBridge() !== null;
}

/**
 * Fresh WS URL for the cloud gateway. Throws CLOUD_NOT_LOGGED_IN when the
 * user has no live login (the selector shows "sign in", never a raw error).
 * Called by the GatewayClient's URL provider on EVERY connect — reconnects
 * re-mint, so an expired ticket can never be reused.
 */
export async function mintCloudWsUrl(): Promise<string> {
  const c = cloudBridge();
  if (!c) throw new Error("cloud-unavailable");
  const r = await c.wsUrl();
  if (!r?.ok || !r.url) {
    throw new Error(r?.error === "not-logged-in" ? CLOUD_NOT_LOGGED_IN : "cloud-unavailable");
  }
  return r.url;
}

/** Probe the login state without keeping anything (the minted ticket simply
 *  expires unused). true = logged in; false = needs sign-in; null = bridge or
 *  network trouble (the picker treats it as unavailable, not as logged-out). */
export async function probeCloudLogin(): Promise<boolean | null> {
  try {
    await mintCloudWsUrl();
    return true;
  } catch (e) {
    return e instanceof Error && e.message === CLOUD_NOT_LOGGED_IN ? false : null;
  }
}

// ── Active cloud session registry (dock/card reads) ─────────────────────
// Same pattern as localFile.registerLocalFileReader: exactly one live chat
// session per page; the page flags it on mount/target and clears on unmount.
let cloudSessionOn = false;

export function setCloudSessionActive(on: boolean): void {
  cloudSessionOn = on;
}

/** True while the live chat session runs on the user's CLOUD computer (the
 *  dock must read files THERE, never from the same-origin local gateway). */
export function isCloudSessionActive(): boolean {
  return cloudSessionOn && cloudBridge() !== null;
}

/** Shared body of the JSON helpers: bridge call + optional deadline. The
 *  deadline exists for AMBIENT merges (S2 — sidebar Recents, agenda, footer
 *  identity): those surfaces must fail open FAST and fall back to the local
 *  brain alone, never hold a screen hostage to a slow cloud. On-demand reads
 *  (dock/file cards) keep the shell's own 15s budget — no deadline. */
async function cloudRequestJson<T>(
  path: string,
  method: CloudMethod,
  body?: unknown,
  timeoutMs?: number,
): Promise<T | null> {
  const c = cloudBridge();
  if (!c) return null;
  try {
    const call = c.api(path, method === "GET" ? undefined : { method, body });
    const r = timeoutMs
      ? await Promise.race([
          call,
          new Promise<null>((resolve) => window.setTimeout(() => resolve(null), timeoutMs)),
        ])
      : await call;
    return r?.ok ? ((r.json as T) ?? null) : null;
  } catch {
    return null;
  }
}

/** GET a cloud dashboard JSON endpoint via the shell bridge. Null on ANY
 *  failure — consumers fall to their existing empty/error states. */
export async function cloudGetJson<T>(path: string, timeoutMs?: number): Promise<T | null> {
  return cloudRequestJson<T>(path, "GET", undefined, timeoutMs);
}

/** POST to a cloud dashboard JSON endpoint via the shell bridge (S2 —
 *  routine create/pause/resume/trigger on the cloud brain). Null on ANY
 *  failure so callers can degrade honestly. */
export async function cloudPostJson<T>(
  path: string,
  body?: unknown,
  timeoutMs?: number,
): Promise<T | null> {
  return cloudRequestJson<T>(path, "POST", body, timeoutMs);
}

/** The shell can ferry mutating verbs (PATCH/PUT/DELETE): 0.3.5+ marker.
 *  Surfaces gate the mutating affordances of cloud rows on this — an older
 *  shell coerced those verbs to GET, so offering them would be a lie. */
export function cloudMutateAvailable(): boolean {
  return cloudBridge()?.canMutate === true;
}

/** PATCH/PUT/DELETE on a cloud dashboard JSON endpoint (0.3.5 bridge —
 *  session rename/archive/delete, routine edit/delete). Null on ANY failure
 *  AND on pre-0.3.5 shells (never mis-ship the verb as a GET); callers show
 *  the existing `cloudUnavailable` toast and change nothing. */
export async function cloudMutateJson<T>(
  path: string,
  method: "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  timeoutMs?: number,
): Promise<T | null> {
  if (!cloudMutateAvailable()) return null;
  return cloudRequestJson<T>(path, method, body, timeoutMs);
}

/** Cloud-session read of /api/fs/read-data-url (real mime — dock preview). */
export async function cloudReadFileDataUrl(
  path: string,
): Promise<{ data_url: string } | null> {
  const j = await cloudGetJson<{ dataUrl?: string; data_url?: string }>(
    `/api/fs/read-data-url?path=${encodeURIComponent(path)}`,
  );
  const d = j?.dataUrl ?? j?.data_url;
  return d ? { data_url: d } : null;
}

/** Cloud-session read of /api/files/read (managed-file shape: data_url+name). */
export async function cloudReadFile(
  path: string,
): Promise<{ data_url: string; name?: string } | null> {
  const j = await cloudGetJson<{ data_url?: string; name?: string }>(
    `/api/files/read?path=${encodeURIComponent(path)}`,
  );
  return j?.data_url ? { data_url: j.data_url, name: j.name } : null;
}
