/**
 * file-curation — separates what is a USER FILE from what is SYSTEM NOISE
 * in the Files screen (Onda 1). The root of `/api/files` is the tenant's
 * persistent HOME (`/opt/data`), so it mixes projects and uploads with runtime
 * infra (`.venv`, `.state.db-litestream`, `bin`, `cache`…). The end user sees
 * only their own content; infra goes to a collapsed "Sistema" section (or shows
 * up in full under `?full=1`, the internal view).
 *
 * Conservative rule — only hides what is recognizably system:
 *   1. Anything starting with "." (dotfiles/dotfolders).
 *   2. Known infra names (venvs, caches, node_modules, backups…).
 *   3. Database/replication files (*.db, *.db-litestream, *.sock, *.pid).
 */
import type { ManagedFileEntry } from "@/lib/api";

// WAYNE_HOME runtime subdirs (canonical list from the backend). The user does
// NOT touch these — they go to the "Sistema" section. Kept VISIBLE are the
// user's outputs: projects, uploads, documents, images, videos, audio, scripts,
// screenshots (and their own folders) + loose files.
const SYSTEM_NAMES = new Set<string>([
  // agent orchestration / state
  "cron", "hooks", "logs", "lsp", "memories", "pairing", "plans", "platforms",
  "plugins", "profiles", "sandboxes", "sessions", "skills", "skins",
  "spawn-trees", "spawn_trees", "workspace", "kanban", "home",
  // caches
  "image_cache", "audio_cache", "video_cache", "document_cache",
  "browser_screenshots", "lazy-packages", "lazy_packages",
  // runtime / install (venvs, toolchains, unix-home)
  "bin", "cache", "backups", "node_modules", "node", "go", "__pycache__",
  "tmp", "temp", "lib", "lib64", "share", "include", "wayne", "wayne-agent",
  "lost+found",
]);

// Loose config/state files (not user documents).
const SYSTEM_FILES = new Set<string>([
  "config.yaml", "auth.json", "channel_directory.json", "gateway_state.json",
  "requirements.txt", "pyvenv.cfg",
  // Agent persona/memory (edited via the Agents module, not as a file).
  "SOUL.md", "USER.md", "MEMORY.md",
]);

const SYSTEM_SUFFIXES = [
  ".db", ".db-shm", ".db-wal", ".db-litestream", ".sock", ".pid", ".lock",
];

/** Is this a system entry (to hide from the end user)? */
export function isSystemEntry(entry: ManagedFileEntry): boolean {
  const name = entry.name;
  if (name.startsWith(".")) return true; // dotfiles/dotfolders
  if (entry.is_directory) {
    if (SYSTEM_NAMES.has(name)) return true;
    if (name.startsWith(".venv") || name.startsWith("venv")) return true;
    return false;
  }
  // Files:
  if (SYSTEM_FILES.has(name)) return true;
  if (/cache\.json$/i.test(name)) return true; // *_cache.json, *-cache.json (model caches)
  if (/^config\.yaml(\.|$)/.test(name)) return true; // config.yaml.bak, .bak2, .bak-<ts>
  if (/\.bak\d*$/.test(name) || /\.bak-/.test(name)) return true;
  if (SYSTEM_SUFFIXES.some((s) => name.endsWith(s))) return true;
  return false;
}

/** Splits the listing into user content and system noise. */
/**
 * Names that are system-owned AT THE ROOT and ordinary anywhere else.
 *
 * `knowledge/` is the agent's document store: deleting it from the explorer
 * leaves the manifest and the learned facts orphaned, and the agent keeps
 * answering from knowledge whose source is gone. But a folder a user creates
 * inside their own project and happens to name "knowledge" is just a folder —
 * so this is anchored, not global.
 */
const ROOT_ONLY_SYSTEM_NAMES = new Set<string>(["knowledge"]);

export function partitionEntries(
  entries: ManagedFileEntry[],
  opts?: { atRoot?: boolean },
): {
  user: ManagedFileEntry[];
  system: ManagedFileEntry[];
} {
  const user: ManagedFileEntry[] = [];
  const system: ManagedFileEntry[] = [];
  for (const e of entries) {
    const rootOnly =
      Boolean(opts?.atRoot) && ROOT_ONLY_SYSTEM_NAMES.has(e.name.toLowerCase());
    (isSystemEntry(e) || rootOnly ? system : user).push(e);
  }
  return { user, system };
}

/** Sorts: folders before files, each group alphabetical (desktop standard). */
export function sortEntries(entries: ManagedFileEntry[]): ManagedFileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}

// ── Deliverables (Entregas layer) ─────────────────────────────────────
//
// Agent outputs the owner cares about: spreadsheets, PDFs, sites, media —
// not runtime infra. v1 indexes over the filesystem (shallow scan + path
// conventions); no new backend.

const DELIVERABLE_EXT_RE =
  /\.(xlsx|xls|csv|ods|pdf|docx?|pptx?|odt|md|txt|json|zip|rar|7z|tar|gz|png|jpe?g|gif|webp|svg|bmp|mp3|mp4|wav|webm|html?)$/i;

const DELIVERABLE_SCAN_FOLDERS = [
  "projects",
  "uploads",
  "documents",
  "images",
  "videos",
  "audio",
  "screenshots",
] as const;

/** Is this a user-facing deliverable (not infra, not a folder)? */
export function isDeliverableEntry(entry: ManagedFileEntry): boolean {
  if (entry.is_directory) return false;
  if (isSystemEntry(entry)) return false;
  return DELIVERABLE_EXT_RE.test(entry.name);
}

export type DeliverableTimeGroup = "today" | "thisWeek" | "older";

/** Bucket a file's mtime (seconds) into Hoje / Esta semana / Anterior. */
export function deliverableTimeGroup(mtimeSec: number, nowMs = Date.now()): DeliverableTimeGroup {
  if (!Number.isFinite(mtimeSec) || mtimeSec <= 0) return "older";
  const mtimeMs = mtimeSec * 1000;
  const startOfToday = new Date(nowMs);
  startOfToday.setHours(0, 0, 0, 0);
  if (mtimeMs >= startOfToday.getTime()) return "today";
  const weekAgo = startOfToday.getTime() - 7 * 86_400_000;
  if (mtimeMs >= weekAgo) return "thisWeek";
  return "older";
}

export function groupDeliverablesByTime(
  entries: ManagedFileEntry[],
  nowMs = Date.now(),
): Record<DeliverableTimeGroup, ManagedFileEntry[]> {
  const groups: Record<DeliverableTimeGroup, ManagedFileEntry[]> = {
    today: [],
    thisWeek: [],
    older: [],
  };
  for (const e of entries) {
    groups[deliverableTimeGroup(e.mtime, nowMs)].push(e);
  }
  for (const key of Object.keys(groups) as DeliverableTimeGroup[]) {
    groups[key].sort((a, b) => b.mtime - a.mtime);
  }
  return groups;
}

function normPath(p: string): string {
  return p.replace(/\\/g, "/");
}

/** Session filter: cwd prefix OR modified after the task started. */
export function matchesSessionDeliverable(
  entry: ManagedFileEntry,
  session: { cwd?: string | null; started_at: number },
): boolean {
  if (Number.isFinite(entry.mtime) && entry.mtime >= session.started_at) {
    const cwd = session.cwd?.trim();
    if (!cwd) return true;
    const path = normPath(entry.path);
    const base = normPath(cwd);
    if (path.startsWith(base)) return true;
    if (path.includes("/projects/")) return true;
  }
  return false;
}

type ListFilesFn = (path?: string) => Promise<{ entries: ManagedFileEntry[] }>;

/** Shallow filesystem scan for deliverable outputs (best-effort). */
export async function scanDeliverables(
  root: string,
  listFiles: ListFilesFn,
): Promise<ManagedFileEntry[]> {
  const rootListing = await listFiles(root);
  const { user } = partitionEntries(rootListing.entries, { atRoot: true });
  const out: ManagedFileEntry[] = [];

  const push = (e: ManagedFileEntry) => {
    if (isDeliverableEntry(e)) out.push(e);
  };

  for (const e of user) push(e);

  const dirs = user.filter((e) => e.is_directory && !isSystemEntry(e));
  const priority = new Set<string>(DELIVERABLE_SCAN_FOLDERS);
  const ordered = [
    ...dirs.filter((d) => priority.has(d.name.toLowerCase())),
    ...dirs.filter((d) => !priority.has(d.name.toLowerCase())),
  ].slice(0, 12);

  for (const dir of ordered) {
    if (dir.name.toLowerCase() === "projects") {
      let projListing;
      try {
        projListing = await listFiles(dir.path);
      } catch {
        continue;
      }
      for (const proj of projListing.entries.filter((e) => e.is_directory && !isSystemEntry(e))) {
        let inner;
        try {
          inner = await listFiles(proj.path);
        } catch {
          continue;
        }
        for (const e of inner.entries) {
          if (e.is_directory && !isSystemEntry(e)) {
            try {
              const deep = await listFiles(e.path);
              for (const f of deep.entries) push(f);
            } catch {
              /* skip unreadable */
            }
          } else {
            push(e);
          }
        }
      }
      continue;
    }
    try {
      const inner = await listFiles(dir.path);
      for (const e of inner.entries) push(e);
    } catch {
      /* skip unreadable */
    }
  }

  const seen = new Set<string>();
  return out
    .filter((e) => {
      if (seen.has(e.path)) return false;
      seen.add(e.path);
      return true;
    })
    .sort((a, b) => b.mtime - a.mtime);
}
