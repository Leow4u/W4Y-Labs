/**
 * "Fixar projeto" — same client-side pattern as the session pin
 * (lib/pinned-sessions.ts, mirror of the desktop): an array of slugs in
 * localStorage + a light pub-sub. The gateway's project store (projects.*)
 * has no "pinned" field — pinning is a device preference, not server
 * state.
 */
const STORAGE_KEY = "wayne:pinned-projects:v1";

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function write(slugs: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(slugs));
  } catch {
    /* localStorage unavailable — pin becomes a no-op, no crash */
  }
}

let cache = read();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function onProjectPinnedChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function isProjectPinned(slug: string): boolean {
  return cache.includes(slug);
}

export function toggleProjectPin(slug: string) {
  cache = cache.includes(slug) ? cache.filter((x) => x !== slug) : [...cache, slug];
  write(cache);
  notify();
}
