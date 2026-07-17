/**
 * "Favoritar arquivo/pasta" — device preference (localStorage + lightweight
 * pub-sub), same pattern as lib/pinned-projects.ts. Stores just enough to
 * render in the rail without re-fetching: absolute path, name and whether it
 * is a folder.
 */
export interface PinnedFile {
  path: string;
  name: string;
  dir: boolean;
}

const STORAGE_KEY = "wayne:pinned-files:v1";

function read(): PinnedFile[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (v): v is PinnedFile =>
        Boolean(v) && typeof v.path === "string" && typeof v.name === "string",
    );
  } catch {
    return [];
  }
}

function write(items: PinnedFile[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* localStorage unavailable — pinning becomes a no-op, no crash */
  }
}

let cache = read();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function onPinnedFilesChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPinnedFiles(): PinnedFile[] {
  return cache;
}

export function isFilePinned(path: string): boolean {
  return cache.some((f) => f.path === path);
}

export function toggleFilePin(item: PinnedFile) {
  cache = cache.some((f) => f.path === item.path)
    ? cache.filter((f) => f.path !== item.path)
    : [...cache, { path: item.path, name: item.name, dir: item.dir }];
  write(cache);
  notify();
}

/** Removes an orphaned pin (the target vanished from disk). */
export function removePinnedFile(path: string) {
  if (!cache.some((f) => f.path === path)) return;
  cache = cache.filter((f) => f.path !== path);
  write(cache);
  notify();
}
