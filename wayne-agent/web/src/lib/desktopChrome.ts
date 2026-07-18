/**
 * desktopChrome — typed access to the desktop shell's window-chrome bridge
 * (0.3.7, Codex-style frameless windows).
 *
 * The shell exposes `work4youDesktop.windowChrome` ONLY from 0.3.7 on; the
 * whole top bar gates on this group existing, so the screen never promises
 * an IPC the running shell doesn't implement (same capability-marker pattern
 * as `cloud.canMutate`). On the plain web (browser) there is no bridge at
 * all and every helper returns null/false — the layout stays untouched.
 */

export type EditRole = "undo" | "redo" | "cut" | "copy" | "paste" | "selectAll";
export type ZoomDir = "in" | "out" | "reset";

export interface AppInfo {
  shellVersion?: string | null;
  engineVersion?: string | null;
  cloudShell?: boolean;
  platform?: string;
}

export interface WindowChromeBridge {
  newWindow: () => Promise<{ ok: boolean; error?: string }>;
  closeWindow: () => Promise<{ ok: boolean }>;
  quit: () => Promise<{ ok: boolean }>;
  editRole: (role: EditRole) => Promise<{ ok: boolean; error?: string }>;
  zoom: (dir: ZoomDir) => Promise<{ ok: boolean; level?: number }>;
  toggleFullscreen: () => Promise<{ ok: boolean; fullscreen?: boolean }>;
  reload: () => Promise<{ ok: boolean }>;
  appInfo: () => Promise<AppInfo | null>;
  /** Window-scoped accelerators the main can't resolve alone (Ctrl+N /
   *  Ctrl+O) arrive here; returns the unsubscribe. */
  onMenuAction: (cb: (action: string) => void) => () => void;
}

interface DesktopUpdateBridge {
  check: () => Promise<{ available?: boolean; version?: string | null } | null>;
  apply: () => Promise<unknown>;
}

interface DesktopBridge {
  isDesktop?: boolean;
  platform?: string;
  pickFolder?: () => Promise<string[]>;
  listFolders?: () => Promise<string[]>;
  openExternal?: (target: string) => Promise<{ ok: boolean }>;
  update?: DesktopUpdateBridge;
  windowChrome?: WindowChromeBridge;
}

function desktopBridge(): DesktopBridge | null {
  if (typeof window === "undefined") return null;
  const d = (window as unknown as { work4youDesktop?: DesktopBridge }).work4youDesktop;
  return d && d.isDesktop ? d : null;
}

/** True inside the desktop shell (any version). */
export function isDesktopApp(): boolean {
  return desktopBridge() !== null;
}

/** The 0.3.7+ chrome bridge, or null (plain web / older shell). */
export function windowChromeBridge(): WindowChromeBridge | null {
  return desktopBridge()?.windowChrome ?? null;
}

/** The engine-update bridge (0.3.4+ shells), or null. */
export function desktopUpdateBridge(): DesktopUpdateBridge | null {
  return desktopBridge()?.update ?? null;
}

/** Folder-vault picker helpers for the File → "Abrir pasta…" flow. */
export function desktopFolderBridge(): {
  pickFolder: () => Promise<string[]>;
  listFolders: () => Promise<string[]>;
} | null {
  const d = desktopBridge();
  if (!d || typeof d.pickFolder !== "function" || typeof d.listFolders !== "function") {
    return null;
  }
  return { pickFolder: () => d.pickFolder!(), listFolders: () => d.listFolders!() };
}

/** Opens an http(s) URL in the system browser via the shell (no-op result on failure). */
export function desktopOpenExternal(url: string): void {
  const d = desktopBridge();
  if (d?.openExternal) void d.openExternal(url);
  else if (typeof window !== "undefined") window.open(url, "_blank", "noopener");
}

/** "⌘" on macOS, "Ctrl+" elsewhere — for the menu shortcut hints. */
export function shortcutModifier(): string {
  return desktopBridge()?.platform === "darwin" ? "⌘" : "Ctrl+";
}
