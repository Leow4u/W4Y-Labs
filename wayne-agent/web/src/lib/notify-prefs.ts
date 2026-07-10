/**
 * Preferências de NOTIFICAÇÃO do navegador (Onda A das Configurações).
 * Espelha o padrão do desktop (que também é client-side, localStorage
 * hermes:native-notifications): tipos ligáveis individualmente.
 *
 *   turnDone — o Wayne terminou uma resposta (aba em segundo plano)
 *   needsYou — o Wayne está pedindo aprovação ou uma resposta sua
 *
 * A PERMISSÃO do navegador é ortogonal (Notification.permission) — o nudge
 * do chat e o botão nas Configurações pedem; aqui é só a preferência.
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
    /* modo privado */
  }
  listeners.forEach((fn) => fn());
}

export function onNotifyPrefsChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
