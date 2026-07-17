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
export function partitionEntries(entries: ManagedFileEntry[]): {
  user: ManagedFileEntry[];
  system: ManagedFileEntry[];
} {
  const user: ManagedFileEntry[] = [];
  const system: ManagedFileEntry[] = [];
  for (const e of entries) (isSystemEntry(e) ? system : user).push(e);
  return { user, system };
}

/** Sorts: folders before files, each group alphabetical (desktop standard). */
export function sortEntries(entries: ManagedFileEntry[]): ManagedFileEntry[] {
  return [...entries].sort((a, b) => {
    if (a.is_directory !== b.is_directory) return a.is_directory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });
  });
}
