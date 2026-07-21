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
  /** Reports the active theme's bar color and ink so the native window
   *  buttons match the bar and stay legible — the overlay is painted by the
   *  OS from fixed colors, and the shell can't tell which named theme is
   *  active. Optional: shells older than this feature simply don't have it,
   *  hence the guarded call. */
  setTitleBarTheme?: (barColor: string, symbolColor: string) => void;
}

/** Live state pushed by the shell while an engine update runs. */
export interface DesktopUpdateEvent {
  type?: string;
  phase?: string;
  version?: string | null;
  attempts?: number;
  stalled?: boolean;
  running?: boolean;
  lastError?: string | null;
  lastErrorStage?: string | null;
  reason?: string;
}

/**
 * What the shell's `update.check()` answers.
 *
 * `status` is the tri-state (plus the two non-terminal states). It is OPTIONAL
 * on purpose: a shell older than this contract omits it entirely and signals
 * only through `available`. That pairing is real — a new web bundle is served
 * to whatever shell the user is running — so `isApplicable` honours the legacy
 * shape rather than silently removing the update path for those installs.
 */
export interface UpdateCheckResult {
  available?: boolean;
  version?: string | null;
  kind?: string;
  /** Required for a MODERN `available`; the main refuses a tokenless apply. */
  token?: string;
  status?: "available" | "up-to-date" | "unknown" | "in-progress" | "preparing";
  /** Layers that could not be verified, when the answer is `unknown`. */
  unverified?: string[];
}

/** What `update.apply()` answers. One vocabulary, shared by every surface. */
export type UpdateOutcome =
  | "applied"
  | "staged"
  | "no-update"
  | "recovered"
  | "failed"
  | "stale-plan";

export interface UpdateApplyResult {
  ok?: boolean;
  outcome?: UpdateOutcome;
  /** Engine-run status, when the shell reports one. */
  status?: string;
  error?: string;
  reason?: string;
}

interface DesktopUpdateBridge {
  check: () => Promise<UpdateCheckResult | null>;
  apply: (token?: string) => Promise<UpdateApplyResult | null>;
  /**
   * Subscribe to update STATE CHANGES — not progress. The shell pushes the
   * whole state on a transition, and in practice the chip only acts on the
   * terminal one (anything emitted mid-install carries running:true and is
   * ignored so an in-flight update cannot clear its own pill). There is no
   * percentage and no step-by-step feed; a live progress bar is a follow-up.
   * Optional: shells older than this feature don't have it and the chip falls
   * back to polling.
   */
  onEvent?: (cb: (payload: DesktopUpdateEvent) => void) => () => void;
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
