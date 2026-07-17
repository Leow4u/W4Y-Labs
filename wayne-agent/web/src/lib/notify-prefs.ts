/**
 * Browser NOTIFICATION preferences (Onda A of "Configurações").
 * Mirrors the desktop pattern (which is also client-side, localStorage
 * hermes:native-notifications): kinds that can be toggled individually.
 *
 *   turnDone — Wayne finished a response (tab in the background)
 *   needsYou — Wayne is asking for approval or an answer from you
 *
 * The browser PERMISSION is orthogonal (Notification.permission) — the chat
 * nudge and the "Configurações" button ask for it; here it's just the preference.
 */
const STORAGE_KEY = "wayne:notify-prefs:v1";

export type NotifyKind = "turnDone" | "needsYou";

type Prefs = Record<NotifyKind, boolean>;

const DEFAULTS: Prefs = { turnDone: true, needsYou: true };

function read(): Prefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    return {
      turnDone: parsed.turnDone !== false,
      needsYou: parsed.needsYou !== false,
    };
  } catch {
    return DEFAULTS;
  }
}

let cache = typeof window === "undefined" ? DEFAULTS : read();
const listeners = new Set<() => void>();

export function isNotifyEnabled(kind: NotifyKind): boolean {
  return cache[kind];
}

export function setNotifyKind(kind: NotifyKind, enabled: boolean): void {
  cache = { ...cache, [kind]: enabled };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* private mode */
  }
  listeners.forEach((fn) => fn());
}

export function onNotifyPrefsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
