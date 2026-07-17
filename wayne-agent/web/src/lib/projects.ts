/**
 * Projects (Manus-style curation) = real backend WORKSPACES, zero new
 * endpoints:
 *   - a project is a FOLDER at `projects/<slug>` under the managed files
 *     root (created via POST /api/files/mkdir);
 *   - the project's new tasks are born with `session.create {cwd}` — the
 *     gateway already persists the explicit cwd as the session's workspace
 *     (tui_gateway/server.py, session.create);
 *   - the project's task list uses the `cwd_prefix` filter that
 *     GET /api/sessions already accepts.
 * Project files stay together in the folder — visible on the Files screen.
 */
import { api, type ProjectRow } from "@/lib/api";

export const PROJECTS_DIR = "projects";

/** "Cliente Itaú" → "cliente-itau" (safe folder name). */
export function slugifyProject(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** "cliente-itau" → "Cliente Itau" (display). */
export function prettifyProject(name: string): string {
  const s = name.replace(/[-_]+/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

// Absolute root of the managed files (e.g. /opt/data) — comes in the listing
// response; memoized per page session (doesn't change at runtime).
let cachedRoot: string | null = null;

export async function getFilesRoot(): Promise<string | null> {
  if (cachedRoot) return cachedRoot;
  try {
    const res = await api.listFiles("");
    cachedRoot = res.root ?? res.locked_root ?? null;
  } catch {
    cachedRoot = null;
  }
  return cachedRoot;
}

/** Absolute path (on the server) of a project's workspace. */
export function projectCwd(root: string, project: string): string {
  const base = root.endsWith("/") ? root.slice(0, -1) : root;
  return `${base}/${PROJECTS_DIR}/${project}`;
}

/**
 * Register a cloud project as a first-class project ROW, owning its folder.
 *
 * Convergence, slice 1 (task #101). The folder at `projects/<slug>` stays the
 * source of truth for the UI *today* — nothing reads these rows yet, so this
 * cannot break the screens. What it does is make the row exist from the moment
 * the project is born, so the later switch to the row model is a change of
 * READER, not a data migration.
 *
 * It also puts a cloud project and a folder on the user's own machine into the
 * SAME store — which is what one history across web and desktop rests on.
 *
 * Best-effort by design: a bookkeeping failure must never stop someone from
 * creating a project. The backfill picks up whatever is missed here.
 */
/** A path on the USER's machine: Windows-absolute (C:\…) or a UNC share (\\srv\…). */
export const LOCAL_PATH_RE = /^(?:[A-Za-z]:[\\/]|\\\\)/;

/** Last segment of a path, for either separator. */
export function pathBaseName(p: string): string {
  const segs = p.split(/[\\/]/).filter(Boolean);
  return segs[segs.length - 1] || p;
}

/**
 * Adopt a folder path as a project ROW — a folder on the user's machine
 * (Local mode) or a repo root the tree auto-promoted on the server.
 *
 * The same call either way: the row model owns PATHS without touching them,
 * so the folder groups its chats in history on every surface. Idempotent:
 * POST /api/projects returns the incumbent when the folder is already owned.
 * Returns the row so callers can navigate to the adopted project's slug.
 */
export async function registerFolderProject(
  folder: string,
  name?: string,
): Promise<ProjectRow | null> {
  // The desktop's default workspace (~/Work4You) is an EXECUTION directory,
  // never an organizing project (pivot rule, 17/07). Adopting it as a row made
  // every free chat group under a phantom "Work4You" project in the sidebar —
  // refuse here so no caller (vault self-healing, folder picker, auto-node
  // adoption) can promote it.
  if (isDesktopDefaultWorkspacePath(folder)) return null;
  try {
    const res = await api.createProject({
      name: (name || "").trim() || pathBaseName(folder),
      folders: [folder],
    });
    return res.project;
  } catch {
    /* silent: bookkeeping must never block the user from working */
    return null;
  }
}

export async function registerProjectRow(slug: string, displayName?: string): Promise<void> {
  try {
    const root = await getFilesRoot();
    if (!root) return;
    await api.createProject({
      name: (displayName || "").trim() || prettifyProject(slug),
      slug,
      folders: [projectCwd(root, slug)],
    });
  } catch {
    /* silent: the row is bookkeeping, the folder is what the UI reads today */
  }
}

// ── Last project (Phase 1 of the project picker, decision 10/07) ───────
// Every new chat opens in the LAST project worked on (not empty), like
// Codex/Claude. localStorage holds: a slug, or the NONE sentinel when the
// user chose "trabalhar sem projeto" (distinct from "never chose").
const LAST_PROJECT_KEY = "wayne:last-project";
const NONE = "__none__";

/** slug (project) · null (explicit "sem projeto") · undefined (never chose). */
export function getLastProject(): string | null | undefined {
  try {
    const v = window.localStorage.getItem(LAST_PROJECT_KEY);
    if (v === null) return undefined;
    return v === NONE ? null : v;
  } catch {
    return undefined;
  }
}

export function setLastProject(project: string | null): void {
  try {
    window.localStorage.setItem(LAST_PROJECT_KEY, project ?? NONE);
  } catch {
    /* private mode */
  }
}

// ── Desktop default workspace (DL-01/DL-03) ────────────────────────────
// On the desktop the shell hands the renderer the absolute path of ~/Work4You
// (window.work4youDesktop.defaultWorkspace) and flags isDesktop. This is the
// inverted rule: a desktop chat with NO project chosen runs in that LOCAL folder
// (executor on the user's machine), not in the cloud. On the web there is no such
// folder — no project means the cloud, unchanged.

/** Absolute path of the desktop's default local workspace (~/Work4You), or null
 *  off the desktop / when the shell did not provide it. */
export function desktopDefaultWorkspace(): string | null {
  if (typeof window === "undefined") return null;
  const d = (
    window as unknown as {
      work4youDesktop?: { isDesktop?: boolean; defaultWorkspace?: string };
    }
  ).work4youDesktop;
  return d?.isDesktop && d.defaultWorkspace ? d.defaultWorkspace : null;
}

/**
 * True when `p` IS the desktop's default local workspace (~/Work4You) — the
 * organization rule of the motor-local pivot (17/07): that folder is the
 * engine's execution directory, NEVER a project (it must not be adopted as a
 * row nor group sessions in the sidebar; free chats belong in Recents).
 *
 * LOCAL-ENGINE ONLY by design: the cloud-shell desktop (0.2.x) keeps its DL-05
 * behavior untouched (mandate 17/07 — nothing changes off the motor-local
 * mode), and on the web there is no default workspace at all. Segment-wise and
 * case-insensitive compare: the path reaches the client from more than one
 * source (shell bridge, vault list, server tree) and Windows paths compare
 * case-insensitively.
 */
export function isDesktopDefaultWorkspacePath(p: string | null | undefined): boolean {
  if (!isLocalEngine()) return false;
  const ws = desktopDefaultWorkspace();
  if (!ws || !p) return false;
  const a = ws.split(/[\\/]/).filter(Boolean);
  const b = p.split(/[\\/]/).filter(Boolean);
  return (
    a.length === b.length && a.every((seg, i) => seg.toLowerCase() === b[i].toLowerCase())
  );
}

/**
 * Local-ENGINE mode (desktop 0.3.0 pivot): the shell boots a full local Wayne
 * gateway and serves this SPA from it — origin http://127.0.0.1:<port>. In this
 * mode the gateway ALREADY runs on the user's machine: sessions are local by
 * nature (native cwd on this disk, /api/fs reads this disk), so the whole
 * Desktop-1 executor wiring (desk.setLocal + local.session.set) must stay OFF —
 * arming it would mark the session env_type=local-desktop and fail closed
 * waiting for an executor that has nothing to add.
 *
 * Distinguished from the CLOUD-shell desktop (0.2.x behavior, work4you.ai
 * loaded inside Electron) by the ORIGIN: same isDesktop bridge, but the page
 * is served from loopback. Plain web (no isDesktop) is never local-engine.
 */
export function isLocalEngine(): boolean {
  if (typeof window === "undefined") return false;
  const d = (
    window as unknown as { work4youDesktop?: { isDesktop?: boolean } }
  ).work4youDesktop;
  if (!d?.isDesktop) return false;
  const host = window.location.hostname;
  return host === "127.0.0.1" || host === "localhost" || host === "[::1]" || host === "::1";
}

/**
 * The local folder a fresh chat should default to (DL-03). Reused by the chat as
 * the initial `activeLocalFolder`, so the SAME wiring that the picker's
 * `chooseLocal` uses arms Local mode automatically — no modal, no dialog.
 *
 * On the desktop this is the DEFAULT for any session with no context of its own:
 * a blank/new chat lands in ~/Work4You. The ONLY opt-out is an explicit "Run in
 * the cloud" (getLastProject() === null, the NONE sentinel). It used to also bail
 * when the user had ever chosen anything (getLastProject() !== undefined), which
 * meant that a returning user — anyone with `wayne:last-project` filled — never
 * got the local default and every new session opened "Sem projeto" on the cloud
 * (bug). A last cloud-project slug is a *convenience to reopen*, not a standing
 * choice to run in the cloud, so it no longer suppresses the local default; the
 * caller keeps the two from contradicting by not re-pinning that project on the
 * desktop while this default is in force. DL-01 persistence still rides on
 * `wayne:local-folder`: once armed, the folder is remembered for the next session
 * directly.
 *
 * Off the desktop (no defaultWorkspace) this returns null, so the web is
 * unchanged: no folder still means the cloud.
 */
export function resolveDesktopLocalDefault(): string | null {
  // Local-engine mode never arms the executor: the default workspace reaches
  // the session as a NATIVE cwd on session.create (NativeChatPage, DL-01)
  // because the local gateway simply runs there — no local.session.set, no
  // desk.setLocal. Returning a folder here would re-arm the Desktop-1 wiring
  // and fail closed on the first message.
  if (isLocalEngine()) return null;
  const ws = desktopDefaultWorkspace();
  if (!ws) return null;
  // null = explicit "Executar na nuvem" (the NONE sentinel) → the only opt-out.
  return getLastProject() === null ? null : ws;
}
