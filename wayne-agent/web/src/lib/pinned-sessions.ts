/**
 * "Fixar" (Pin) — client-side only, exatamente como o desktop: `Pin`/`Unpin`
 * no menu da sessão persiste um array de ids no localStorage (nanostore
 * `persistentAtom`, ver apps/desktop/src/store/layout.ts `$pinnedSessionIds`).
 * NÃO existe RPC/REST de pin no backend — não tem o que reusar lá; a peça
 * reutilizável é o PADRÃO (ids fixados por dispositivo), não um endpoint.
 * Reimplementado aqui com um pub-sub leve (mesmo padrão de voice-playback.ts)
 * em vez de nanostores, pra não adicionar essa dependência ao web.
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
    /* localStorage indisponível (modo privado/quota) — pin vira no-op, sem crash */
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
