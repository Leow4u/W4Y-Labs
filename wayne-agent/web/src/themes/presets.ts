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
  // IBM Plex Sans é a fonte-padrão de PRODUTO da Work4You (a "cara" da UI),
  // não mais a fonte do sistema operacional. Carregada via Google Fonts;
  // o stack sempre termina no sistema como fallback (se o webfont falhar).
  // O usuário pode trocar em Configurações → Geral → Aparência → Fonte.
  fontSans: `"IBM Plex Sans", ${SYSTEM_SANS}`,
  fontMono: SYSTEM_MONO,
  fontUrl:
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&display=swap",
  baseSize: "15px",
  lineHeight: "1.55",
  letterSpacing: "0",
};

const DEFAULT_LAYOUT: ThemeLayout = {
  radius: "0.5rem",
  density: "comfortable",
};

// ---------------------------------------------------------------------------
// Themes
// ---------------------------------------------------------------------------

/** Modo claro neutro — o tema padrão da W4Y. Estruturalmente segue o antigo
 *  "nous-blue" (o único light do upstream): fundo claro, acentos escuros,
 *  terminal claro e swatches/séries explícitos. */
export const whiteTheme: DashboardTheme = {
  name: "white",
  label: "White",
  description: "Modo claro — branco limpo e neutro (padrão)",
  palette: {
    background: { hex: "#ffffff", alpha: 1 },
    midground: { hex: "#171717", alpha: 1 },
    foreground: { hex: "#171717", alpha: 0 },
    warmGlow: "rgba(23, 23, 23, 0.07)",
    noiseOpacity: 0,
  },
  typography: DEFAULT_TYPOGRAPHY,
  layout: DEFAULT_LAYOUT,
  terminalBackground: "#fafafa",
  terminalForeground: "#171717",
  seriesColors: {
    inputTokenAccent: "#171717",
    outputTokenAccent: "#737373",
  },
  swatchColors: ["#171717", "#a3a3a3", "#ffffff"],
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
};

export const BUILTIN_THEMES: Record<string, DashboardTheme> = {
  white: whiteTheme,
  mono: monoTheme,
  cyberpunk: cyberpunkTheme,
  rose: roseTheme,
};
