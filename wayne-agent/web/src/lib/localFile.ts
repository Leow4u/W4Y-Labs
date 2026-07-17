/**
 * Local-machine file access for the dock (desktop Local mode).
 *
 * In Local (desktop) mode the agent creates files on the USER'S MACHINE —
 * paths like C:\Users\… (or the MSYS spelling /c/Users/… that git-bash
 * reports). The server's /api/fs/* endpoints read the SERVER's disk, so those
 * paths never resolve there. The gateway instead proxies the read through the
 * session's resident desktop executor (RPC `local.fs.read` → the shell's
 * vault-confined `read_file` op — the same channel the agent's file/shell
 * already rides). This module is the web-side seam:
 *
 *   - normalizeLocalPath(): detects a user-machine path (Windows drive / UNC /
 *     MSYS) and normalizes the MSYS spelling to a drive path.
 *   - registerLocalFileReader(): the chat page points this at a reader bound
 *     to the LIVE gateway session; consumers (dock preview/code, file cards)
 *     call readLocalFileDataUrl() without knowing about the session.
 *
 * Registry over prop-drilling on purpose: FileRefCard renders deep inside the
 * transcript AND the dock, and there is exactly one active chat session per
 * page — the page registers on mount and clears on unmount.
 */

import { LOCAL_PATH_RE } from "@/lib/projects";

/** MSYS/git-bash drive spelling: "/c/Users/…" (single drive-letter segment).
 *  A cloud path like /opt/data/x never matches (first segment is a word). */
export const MSYS_PATH_RE = /^\/([A-Za-z])(\/|$)/;

/** Same shape /api/fs/read-data-url + /api/files/read produce, so the dock's
 *  existing decode paths are reused verbatim. */
export interface LocalFileData {
  data_url: string;
  mime?: string;
  size?: number;
  name?: string;
}

export type LocalFileReader = (path: string) => Promise<LocalFileData | null>;

/** "/c/Users/x" → "C:/Users/x"; Windows/UNC paths pass through unchanged;
 *  null = not a user-machine path (cloud paths keep the server read route). */
export function normalizeLocalPath(p: string): string | null {
  const s = (p ?? "").trim();
  if (!s) return null;
  const m = MSYS_PATH_RE.exec(s);
  if (m) return `${m[1].toUpperCase()}:${s.slice(2) || "/"}`;
  return LOCAL_PATH_RE.test(s) ? s : null;
}

/** True when the path lives on the user's machine (drive/UNC/MSYS form). */
export function isLocalPath(p: string): boolean {
  return normalizeLocalPath(p) !== null;
}

/** The desktop shell's "open outside the app" bridge (0.2.2+): http/https in
 *  the system browser, or a vault-contained local file via its file:// URL.
 *  Null off the desktop AND on older shells (0.2.1) that don't expose it —
 *  callers use this to gate the UI, so the screen never promises an open the
 *  shell can't perform. */
export function desktopOpenExternal(): ((target: string) => Promise<unknown>) | null {
  if (typeof window === "undefined") return null;
  const d = (
    window as unknown as {
      work4youDesktop?: { openExternal?: (target: string) => Promise<unknown> };
    }
  ).work4youDesktop;
  const fn = d?.openExternal;
  return typeof fn === "function" ? (target) => fn(target) : null;
}

let reader: LocalFileReader | null = null;

/** The chat page keeps this pointed at the live session's gateway reader
 *  (null when the page unmounts — readers then resolve null, never hang). */
export function registerLocalFileReader(r: LocalFileReader | null): void {
  reader = r;
}

/** Read a user-machine file via the session's desktop executor. Resolves null
 *  on ANY failure (not a local path, no live session, executor disconnected,
 *  binary file, outside the vault) — callers fall through to their existing
 *  empty/error states; no spinner ever waits on this forever (the gateway
 *  RPC itself times out with a clean error). */
export async function readLocalFileDataUrl(path: string): Promise<LocalFileData | null> {
  const normalized = normalizeLocalPath(path);
  if (!normalized || !reader) return null;
  try {
    const res = await reader(normalized);
    return res?.data_url ? res : null;
  } catch {
    return null;
  }
}
