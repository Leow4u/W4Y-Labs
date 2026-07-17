/**
 * "Fixar" (Pin) — client-side only, exactly like the desktop: `Pin`/`Unpin`
 * in the session menu persists an array of ids in localStorage (nanostore
 * `persistentAtom`, see apps/desktop/src/store/layout.ts `$pinnedSessionIds`).
 * There is NO pin RPC/REST in the backend — nothing to reuse there; the
 * reusable piece is the PATTERN (pinned ids per device), not an endpoint.
 * Reimplemented here with a lightweight pub-sub (same pattern as
 * voice-playback.ts) instead of nanostores, to avoid adding that dependency to web.
 */
const STORAGE_KEY = "wayne:pinned-sessions:v1";

function read(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : [];
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    /* localStorage unavailable (private mode/quota) — pin becomes a no-op, no crash */
  }
}

let cache = read();
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((fn) => fn());

export function onPinnedChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getPinnedIds(): string[] {
  return cache;
}

export function isPinned(id: string): boolean {
  return cache.includes(id);
}

export function togglePin(id: string) {
  cache = cache.includes(id) ? cache.filter((x) => x !== id) : [...cache, id];
  write(cache);
  notify();
}
