/**
 * Preferências de EXIBIÇÃO da conversa (Onda A das Configurações, benchmark
 * Claude Code: "Tamanho do texto da transcrição" + "Largura da transcrição").
 * Client-side por dispositivo (localStorage) — igual ao desktop, que também
 * guarda aparência fora do config.yaml. Aplica via CSS custom properties no
 * :root; o chat (.prose-serif + colunas do NativeChatPage) consome as vars.
 */
const STORAGE_KEY = "wayne:chat-display:v1";

export type ChatTextSize = "small" | "medium" | "large";
export type ChatWidth = "narrow" | "medium" | "wide";

export interface ChatDisplayPrefs {
  size: ChatTextSize;
  width: ChatWidth;
}

const DEFAULTS: ChatDisplayPrefs = { size: "medium", width: "medium" };

/** Escala da prosa serifada (o padrão 17px é o "medium" do DS Editorial). */
const FONT_PX: Record<ChatTextSize, string> = {
  small: "15px",
  medium: "17px",
  large: "19px",
};

/** Largura máxima da coluna transcript+composer (padrão atual = 840px). */
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

/** Estampa as CSS vars no :root — chamada no boot do chat e a cada mudança. */
export function applyChatDisplay(): void {
  try {
    const root = document.documentElement;
    root.style.setProperty("--chat-font-size", FONT_PX[cache.size]);
    root.style.setProperty("--chat-max-w", WIDTH_PX[cache.width]);
  } catch {
    /* SSR/teste — sem DOM */
  }
}

export function setChatDisplay(patch: Partial<ChatDisplayPrefs>): void {
  cache = { ...cache, ...patch };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    /* modo privado — vale só pra sessão */
  }
  applyChatDisplay();
  listeners.forEach((fn) => fn());
}
