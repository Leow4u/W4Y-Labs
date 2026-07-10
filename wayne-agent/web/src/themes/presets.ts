import type { DashboardTheme, ThemeTypography, ThemeLayout } from "./types";

/**
 * Built-in dashboard themes (W4Y set).
 *
 * Reduced from the upstream eight to four on 2026-07-04 (produto W4Y):
 *   white     — modo claro, o PADRÃO da plataforma
 *   mono      — "Black": preto minimalista
 *   cyberpunk — verde neon no preto
 *   rose      — rosa suave
 *
 * Each theme defines its own palette, typography, and layout so switching
 * themes produces visible changes beyond just color — fonts, density, and
 * corner-radius all shift to match the theme's personality.
 *
 * Theme names must stay in sync with the backend's
 * `_BUILTIN_DASHBOARD_THEMES` list in `wayne_cli/web_server.py`.
 */

// ---------------------------------------------------------------------------
// Shared typography / layout presets
// ---------------------------------------------------------------------------

/** Default system stack — neutral, safe fallback for every platform. */
const SYSTEM_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const SYSTEM_MONO =
  'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace';

const DEFAULT_TYPOGRAPHY: ThemeTypography = {
  // Design System "Editorial" (Onda 0): Hanken Grotesk é a grotesk quente do
  // CHROME da UI (papel do Styrene no claude.ai); a prosa do assistente usa a
  // serifa Source Serif 4 via token global --theme-font-serif (index.css).
  // Ambas SELF-HOSTED via @font-face (public/fonts) — sem Google Fonts.
  // A mono de UI/código é a Cascadia Mono (fonte da marca), também vendorizada.
  fontSans: `"Hanken Grotesk", ${SYSTEM_SANS}`,
  fontMono: `"Cascadia Mono", ${SYSTEM_MONO}`,
  baseSize: "15px",
  lineHeight: "1.55",
  letterSpacing: "0",
};

const DEFAULT_LAYOUT: ThemeLayout = {
  radius: "0.625rem",
  density: "comfortable",
};

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

/** Modo claro EDITORIAL — o tema padrão da W4Y (Onda 0). Creme quente +
 *  tinta quase-preta quente, no espírito do claude.ai: calmo, sofisticado,
 *  prosa serifada (via --theme-font-serif global) e acento terracota para
 *  estados ao vivo. */
export const whiteTheme: DashboardTheme = {
  name: "white",
  label: "White",
  description: "Modo claro editorial — creme quente e tinta (padrão)",
  palette: {
    background: { hex: "#faf9f5", alpha: 1 },
    midground: { hex: "#1a1915", alpha: 1 },
    foreground: { hex: "#1a1915", alpha: 0 },
    warmGlow: "rgba(193, 95, 60, 0.06)",
    noiseOpacity: 0,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: DEFAULT_LAYOUT,
  terminalBackground: "#f5f3ec",
  terminalForeground: "#1a1915",
  seriesColors: {
    inputTokenAccent: "#1a1915",
    outputTokenAccent: "#c15f3c",
  },
  swatchColors: ["#1a1915", "#c15f3c", "#faf9f5"],
};

/** O tema padrão da plataforma (fallback de nomes desconhecidos). */
export const defaultTheme: DashboardTheme = whiteTheme;

export const monoTheme: DashboardTheme = {
  name: "mono",
  label: "Black",
  description: "Preto minimalista — grayscale escuro e focado",
  palette: {
    background: { hex: "#0e0e0e", alpha: 1 },
    midground: { hex: "#eaeaea", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(255, 255, 255, 0.1)",
    noiseOpacity: 0.6,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"IBM Plex Sans", ${SYSTEM_SANS}`,
    fontMono: `"IBM Plex Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0",
  },
  // Os defaults de status (index.css) agora são aquecidos pro canvas claro
  // editorial; num fundo escuro eles ficam lamacentos — re-acende aqui.
  colorOverrides: {
    success: "#4ade80",
    warning: "#ffbd38",
    destructive: "#fb2c36",
  },
};

export const cyberpunkTheme: DashboardTheme = {
  name: "cyberpunk",
  label: "Cyberpunk",
  description: "Verde neon no preto — terminal matrix",
  palette: {
    background: { hex: "#040608", alpha: 1 },
    midground: { hex: "#9bffcf", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(0, 255, 136, 0.22)",
    noiseOpacity: 1.2,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"Share Tech Mono", "JetBrains Mono", ${SYSTEM_MONO}`,
    fontMono: `"Share Tech Mono", "JetBrains Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Share+Tech+Mono&family=JetBrains+Mono:wght@400;700&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "0",
  },
  colorOverrides: {
    success: "#00ff88",
    warning: "#ffd700",
    destructive: "#ff0055",
  },
};

export const roseTheme: DashboardTheme = {
  name: "rose",
  label: "Rosé",
  description: "Rosa suave e marfim quente — leve para os olhos",
  palette: {
    background: { hex: "#1a0f15", alpha: 1 },
    midground: { hex: "#ffd4e1", alpha: 1 },
    foreground: { hex: "#ffffff", alpha: 0 },
    warmGlow: "rgba(249, 168, 212, 0.3)",
    noiseOpacity: 0.9,
  },
  typography: {
    ...DEFAULT_TYPOGRAPHY,
    fontSans: `"Fraunces", Georgia, serif`,
    fontMono: `"DM Mono", ${SYSTEM_MONO}`,
    fontUrl:
      "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=DM+Mono:wght@400;500&display=swap",
  },
  layout: {
    ...DEFAULT_LAYOUT,
    radius: "1rem",
  },
  colorOverrides: {
    success: "#4ade80",
    warning: "#ffbd38",
    destructive: "#fb2c36",
  },
};

export const BUILTIN_THEMES: Record<string, DashboardTheme> = {
  white: whiteTheme,
  mono: monoTheme,
  cyberpunk: cyberpunkTheme,
  rose: roseTheme,
};
