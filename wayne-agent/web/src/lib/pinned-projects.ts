/**
 * "Fixar projeto" — mesmo padrão client-side do pin de sessões
 * (lib/pinned-sessions.ts, espelho do desktop): array de slugs no
 * localStorage + pub-sub leve. O banco de projetos do gateway (projects.*)
 * não tem campo "pinned" — fixar é preferência do dispositivo, não estado
 * do servidor.
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
    /* localStorage indisponível — pin vira no-op, sem crash */
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
