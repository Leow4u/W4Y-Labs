/**
 * Conversation DISPLAY preferences (Settings Onda A, Claude Code benchmark:
 * "Tamanho do texto da transcrição" + "Largura da transcrição").
 * Client-side per device (localStorage) — same as the desktop, which also
 * keeps appearance outside config.yaml. Applied via CSS custom properties on
 * :root; the chat (.prose-serif + NativeChatPage columns) consumes the vars.
 */
const STORAGE_KEY = "wayne:chat-display:v1";

export type ChatTextSize = "small" | "medium" | "large";
export type ChatWidth = "narrow" | "medium" | "wide";

export interface ChatDisplayPrefs {
  size: ChatTextSize;
  width: ChatWidth;
}

const DEFAULTS: ChatDisplayPrefs = { size: "medium", width: "medium" };

/** Serif prose scale (the 17px default is the DS Editorial "medium"). */
const FONT_PX: Record<ChatTextSize, string> = {
  small: "15px",
  medium: "17px",
  large: "19px",
};

/** Max width of the transcript+composer column (current default = 840px). */
const WIDTH_PX: Record<ChatWidth, string> = {
  narrow: "720px",
  medium: "840px",
  wide: "980px",
};

function read(): ChatDisplayPrefs {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<ChatDisplayPrefs>) : {};
    return {
      size: parsed.size && parsed.size in FONT_PX ? parsed.size : DEFAULTS.size,
      width: parsed.width && parsed.width in WIDTH_PX ? parsed.width : DEFAULTS.width,
    };
  } catch {
    return DEFAULTS;
  }
}

let cache = typeof window === "undefined" ? DEFAULTS : read();
const listeners = new Set<() => void>();

export function getChatDisplay(): ChatDisplayPrefs {
  return cache;
}

export function onChatDisplayChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Stamps the CSS vars on :root — called on chat boot and on every change. */
export function applyChatDisplay(): void {
  try {
    const root = document.documentElement;
    root.style.setProperty("--chat-font-size", FONT_PX[cache.size]);
    root.style.setProperty("--chat-max-w", WIDTH_PX[cache.width]);
  } catch {
    /* SSR/test — no DOM */
  }
}

export function setChatDisplay(patch: Partial<ChatDisplayPrefs>): void {
  cache = { ...cache, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* private mode — only lasts for the session */
  }
  applyChatDisplay();
  listeners.forEach((fn) => fn());
}
