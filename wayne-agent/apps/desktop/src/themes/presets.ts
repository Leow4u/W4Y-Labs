/**
 * Built-in desktop themes. Internal `name` keys stay stable for persistence
 * and CLI skin aliases; `label` / `description` are the product-facing names.
 */

import type { DesktopTheme, DesktopThemeTypography } from './types'

// Color-emoji fonts to append to every stack as a last resort. None of the UI
// text/mono fonts carry emoji glyphs, so without this emoji render as tofu
// boxes on platforms whose default text font lacks them (e.g. Linux/#40364).
// Covers macOS, Windows, Linux, plus the `emoji` generic for anything else.
export const EMOJI_FALLBACK = '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", emoji'

const SYSTEM_SANS =
  '"Segoe WPC", "Segoe UI", -apple-system, BlinkMacSystemFont, "SF Pro Text", "SF Pro Display", system-ui, sans-serif, ' +
  EMOJI_FALLBACK

const SYSTEM_MONO =
  '"JetBrains Mono", "Cascadia Code", "SF Mono", ui-monospace, Menlo, Monaco, Consolas, monospace, ' + EMOJI_FALLBACK

/** Work4You product default — UI + display share one sans; code stays mono. */
const W4Y_SANS = `"Plus Jakarta Sans", ${SYSTEM_SANS}`

export const DEFAULT_TYPOGRAPHY: DesktopThemeTypography = { fontSans: W4Y_SANS, fontMono: SYSTEM_MONO }

const W4Y_OLIVE = '#5C6B3A'
const W4Y_CHARCOAL = '#1A1A1A'
const W4Y_CHARCOAL_SOFT = '#2A2A2A'

const w4yTint = (pct: number) => `color-mix(in srgb, ${W4Y_OLIVE} ${pct}%, #FFFFFF)`
const w4yTintTransparent = (pct: number) => `color-mix(in srgb, ${W4Y_OLIVE} ${pct}%, transparent)`

/**
 * Work4You — product default. Light glass base with olive + charcoal accents
 * from the approved wordmark. Human product identity, not a dumbed-down skin.
 */
export const work4youTheme: DesktopTheme = {
  name: 'work4you',
  label: 'Work4You',
  description: 'Light glass with Work4You olive and charcoal',
  colors: {
    background: '#F7F7F5',
    foreground: W4Y_CHARCOAL,
    card: '#FFFFFF',
    cardForeground: W4Y_CHARCOAL,
    muted: w4yTint(6),
    mutedForeground: '#5C5C56',
    popover: '#FFFFFF',
    popoverForeground: W4Y_CHARCOAL,
    primary: W4Y_OLIVE,
    primaryForeground: '#FCFCF8',
    secondary: w4yTint(8),
    secondaryForeground: W4Y_CHARCOAL_SOFT,
    accent: w4yTint(12),
    accentForeground: W4Y_CHARCOAL,
    border: w4yTintTransparent(22),
    input: w4yTintTransparent(28),
    ring: W4Y_OLIVE,
    midground: W4Y_OLIVE,
    composerRing: W4Y_OLIVE,
    destructive: '#C72E4D',
    destructiveForeground: '#FFFFFF',
    sidebarBackground: '#F1F1ED',
    sidebarBorder: w4yTintTransparent(18),
    userBubble: w4yTint(7),
    userBubbleBorder: w4yTintTransparent(24)
  },
  darkColors: {
    background: '#0E0E0C',
    foreground: '#E8E6DF',
    card: '#171714',
    cardForeground: '#E8E6DF',
    muted: '#1F1F1A',
    mutedForeground: '#A8A69C',
    popover: '#171714',
    popoverForeground: '#E8E6DF',
    primary: W4Y_OLIVE,
    primaryForeground: '#FCFCF8',
    secondary: '#24241F',
    secondaryForeground: '#E8E6DF',
    accent: '#2C3220',
    accentForeground: '#E8E6DF',
    border: '#2E2E28',
    input: '#121210',
    ring: W4Y_OLIVE,
    midground: W4Y_OLIVE,
    composerRing: W4Y_OLIVE,
    destructive: '#C0473A',
    destructiveForeground: '#FEF2F2',
    sidebarBackground: '#0A0A08',
    sidebarBorder: '#24241F',
    userBubble: '#1A1F14',
    userBubbleBorder: '#3A4228'
  },
  typography: {
    fontSans: W4Y_SANS,
    fontMono: SYSTEM_MONO
  }
}

/** Deep blue-violet with cool accents. */
export const midnightTheme: DesktopTheme = {
  name: 'midnight',
  label: 'Nocturne',
  description: 'Deep indigo night with cool accents',
  colors: {
    background: '#08081c',
    foreground: '#ddd6ff',
    card: '#0d0d28',
    cardForeground: '#ddd6ff',
    muted: '#13133a',
    mutedForeground: '#7c7ab0',
    popover: '#0f0f2e',
    popoverForeground: '#ddd6ff',
    primary: '#ddd6ff',
    primaryForeground: '#08081c',
    secondary: '#1a1a4a',
    secondaryForeground: '#c4bff0',
    accent: '#1a1a44',
    accentForeground: '#d0c8ff',
    border: '#1e1e52',
    input: '#1e1e52',
    ring: '#8b80e8',
    midground: '#8b80e8',
    destructive: '#b03060',
    destructiveForeground: '#fef2f2',
    sidebarBackground: '#06061a',
    sidebarBorder: '#12123a',
    userBubble: '#14143a',
    userBubbleBorder: '#242466'
  },
  typography: {
    fontMono: `"JetBrains Mono", ${SYSTEM_MONO}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700&display=swap'
  }
}

/** Warm crimson and bronze. */
export const emberTheme: DesktopTheme = {
  name: 'ember',
  label: 'Cinder',
  description: 'Warm bronze and ember glow',
  colors: {
    background: '#160800',
    foreground: '#ffd8b0',
    card: '#1e0e04',
    cardForeground: '#ffd8b0',
    muted: '#2a1408',
    mutedForeground: '#aa7a56',
    popover: '#221008',
    popoverForeground: '#ffd8b0',
    primary: '#ffd8b0',
    primaryForeground: '#160800',
    secondary: '#341800',
    secondaryForeground: '#f0c090',
    accent: '#301600',
    accentForeground: '#e8c080',
    border: '#3a1c08',
    input: '#3a1c08',
    ring: '#d97316',
    midground: '#d97316',
    destructive: '#c43010',
    destructiveForeground: '#fef2f2',
    sidebarBackground: '#100600',
    sidebarBorder: '#2a1004',
    userBubble: '#2a1000',
    userBubbleBorder: '#4a2010'
  },
  typography: {
    fontMono: `"IBM Plex Mono", ${SYSTEM_MONO}`,
    fontUrl: 'https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap'
  }
}

/** Clean grayscale. */
export const monoTheme: DesktopTheme = {
  name: 'mono',
  label: 'Graphite',
  description: 'Clean grayscale for quiet focus',
  colors: {
    background: '#0e0e0e',
    foreground: '#eaeaea',
    card: '#141414',
    cardForeground: '#eaeaea',
    muted: '#1e1e1e',
    mutedForeground: '#808080',
    popover: '#181818',
    popoverForeground: '#eaeaea',
    primary: '#eaeaea',
    primaryForeground: '#0e0e0e',
    secondary: '#262626',
    secondaryForeground: '#c8c8c8',
    accent: '#222222',
    accentForeground: '#d8d8d8',
    border: '#2a2a2a',
    input: '#2a2a2a',
    ring: '#9a9a9a',
    midground: '#9a9a9a',
    destructive: '#a84040',
    destructiveForeground: '#fef2f2',
    sidebarBackground: '#0a0a0a',
    sidebarBorder: '#202020',
    userBubble: '#1a1a1a',
    userBubbleBorder: '#363636'
  }
}

/** Neon green on black. */
export const cyberpunkTheme: DesktopTheme = {
  name: 'cyberpunk',
  label: 'Signal',
  description: 'Neon green on black — terminal energy',
  colors: {
    background: '#000a00',
    foreground: '#00ff41',
    card: '#001200',
    cardForeground: '#00ff41',
    muted: '#001a00',
    mutedForeground: '#1a8a30',
    popover: '#001000',
    popoverForeground: '#00ff41',
    primary: '#00ff41',
    primaryForeground: '#000a00',
    secondary: '#002800',
    secondaryForeground: '#00cc34',
    accent: '#002000',
    accentForeground: '#00e038',
    border: '#003000',
    input: '#003000',
    ring: '#00ff41',
    midground: '#00ff41',
    destructive: '#ff003c',
    destructiveForeground: '#000a00',
    sidebarBackground: '#000600',
    sidebarBorder: '#001800',
    userBubble: '#001400',
    userBubbleBorder: '#004800'
  },
  typography: {
    fontMono: `"Courier New", Courier, monospace, ${EMOJI_FALLBACK}`,
    fontSans: `"Courier New", Courier, monospace, ${EMOJI_FALLBACK}`
  }
}

/** Cool blue-gray workspace. */
export const slateTheme: DesktopTheme = {
  name: 'slate',
  label: 'Harbor',
  description: 'Cool blue-gray workspace for deep work',
  colors: {
    background: '#0d1117',
    foreground: '#c9d1d9',
    card: '#161b22',
    cardForeground: '#c9d1d9',
    muted: '#21262d',
    mutedForeground: '#8b949e',
    popover: '#1c2128',
    popoverForeground: '#c9d1d9',
    primary: '#c9d1d9',
    primaryForeground: '#0d1117',
    secondary: '#2a3038',
    secondaryForeground: '#adb5bf',
    accent: '#1e2530',
    accentForeground: '#c0c8d0',
    border: '#30363d',
    input: '#30363d',
    ring: '#58a6ff',
    midground: '#58a6ff',
    destructive: '#cf4848',
    destructiveForeground: '#fef2f2',
    sidebarBackground: '#090d13',
    sidebarBorder: '#1c2228',
    userBubble: '#1e2a38',
    userBubbleBorder: '#2e4060'
  },
  typography: {
    fontMono: `"JetBrains Mono", ${SYSTEM_MONO}`
  }
}

export const BUILTIN_THEMES: Record<string, DesktopTheme> = {
  work4you: work4youTheme,
  midnight: midnightTheme,
  ember: emberTheme,
  mono: monoTheme,
  cyberpunk: cyberpunkTheme,
  slate: slateTheme
}

export const BUILTIN_THEME_LIST = Object.values(BUILTIN_THEMES)

/** Skin used when nothing is persisted or the persisted name is retired. */
export const DEFAULT_SKIN_NAME = 'work4you'
