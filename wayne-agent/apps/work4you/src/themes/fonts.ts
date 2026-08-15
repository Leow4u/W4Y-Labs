/**
 * Curated UI-font catalog for the desktop font override.
 *
 * Independent of theme: a theme still ships its own typography default, but
 * the user can pick a body font here and it persists across theme switches.
 * "Theme default" clears the override. Mono/code tokens stay owned by the
 * theme so picking a body font does not mangle the terminal or code blocks.
 *
 * Catalog is allow-listed — stylesheet URLs are only injected from this file
 * (system stacks + Google Fonts) to avoid free-text XSS/SSRF footguns.
 */

// Keep in sync with EMOJI_FALLBACK in presets.ts (#40364).
const EMOJI_FALLBACK =
  '"Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji", emoji'

const SYSTEM_SANS =
  'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif, ' + EMOJI_FALLBACK
const SYSTEM_MONO =
  'ui-monospace, "SF Mono", "Cascadia Mono", Menlo, Consolas, monospace, ' + EMOJI_FALLBACK
const SYSTEM_SERIF = 'Georgia, Cambria, "Times New Roman", Times, serif, ' + EMOJI_FALLBACK

export type FontCategory = 'sans' | 'serif' | 'mono'

export interface FontChoice {
  id: string
  label: string
  category: FontCategory
  /** CSS font-family stack applied to `--dt-font-sans`. */
  stack: string
  /** Optional vetted stylesheet URL (Google Fonts). */
  fontUrl?: string
}

/** Sentinel: no override — use the active theme's font. */
export const THEME_DEFAULT_FONT_ID = 'theme'

const GF = (family: string): string => `https://fonts.googleapis.com/css2?family=${family}&display=swap`

export const FONT_CHOICES: FontChoice[] = [
  { id: 'system-sans', label: 'System Sans', category: 'sans', stack: SYSTEM_SANS },
  { id: 'system-serif', label: 'System Serif', category: 'serif', stack: SYSTEM_SERIF },
  { id: 'system-mono', label: 'System Mono', category: 'mono', stack: SYSTEM_MONO },

  // Product default — self-hosted via @font-face in styles.css (no fontUrl).
  {
    id: 'plus-jakarta-sans',
    label: 'Plus Jakarta Sans',
    category: 'sans',
    stack: `"Plus Jakarta Sans", ${SYSTEM_SANS}`
  },
  {
    id: 'inter',
    label: 'Inter',
    category: 'sans',
    stack: `"Inter", ${SYSTEM_SANS}`,
    fontUrl: GF('Inter:wght@400;500;600;700')
  },
  {
    id: 'ibm-plex-sans',
    label: 'IBM Plex Sans',
    category: 'sans',
    stack: `"IBM Plex Sans", ${SYSTEM_SANS}`,
    fontUrl: GF('IBM+Plex+Sans:wght@400;500;600;700')
  },
  {
    id: 'work-sans',
    label: 'Work Sans',
    category: 'sans',
    stack: `"Work Sans", ${SYSTEM_SANS}`,
    fontUrl: GF('Work+Sans:wght@400;500;600;700')
  },
  {
    id: 'atkinson-hyperlegible',
    label: 'Atkinson Hyperlegible',
    category: 'sans',
    stack: `"Atkinson Hyperlegible", ${SYSTEM_SANS}`,
    fontUrl: GF('Atkinson+Hyperlegible:wght@400;700')
  },
  {
    id: 'dm-sans',
    label: 'DM Sans',
    category: 'sans',
    stack: `"DM Sans", ${SYSTEM_SANS}`,
    fontUrl: GF('DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700')
  },

  {
    id: 'spectral',
    label: 'Spectral',
    category: 'serif',
    stack: `"Spectral", ${SYSTEM_SERIF}`,
    fontUrl: GF('Spectral:wght@400;500;600;700')
  },
  {
    id: 'fraunces',
    label: 'Fraunces',
    category: 'serif',
    stack: `"Fraunces", ${SYSTEM_SERIF}`,
    fontUrl: GF('Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600')
  },
  {
    id: 'source-serif',
    label: 'Source Serif 4',
    category: 'serif',
    stack: `"Source Serif 4", ${SYSTEM_SERIF}`,
    fontUrl: GF('Source+Serif+4:opsz,wght@8..60,400;8..60,500;8..60,600;8..60,700')
  },

  // JetBrains Mono is self-hosted via @font-face in styles.css — no fontUrl.
  {
    id: 'jetbrains-mono',
    label: 'JetBrains Mono',
    category: 'mono',
    stack: `"JetBrains Mono", ${SYSTEM_MONO}`
  },
  {
    id: 'ibm-plex-mono',
    label: 'IBM Plex Mono',
    category: 'mono',
    stack: `"IBM Plex Mono", ${SYSTEM_MONO}`,
    fontUrl: GF('IBM+Plex+Mono:wght@400;500;700')
  },
  {
    id: 'space-mono',
    label: 'Space Mono',
    category: 'mono',
    stack: `"Space Mono", ${SYSTEM_MONO}`,
    fontUrl: GF('Space+Mono:wght@400;700')
  }
]

const FONT_BY_ID: Record<string, FontChoice> = Object.fromEntries(FONT_CHOICES.map(f => [f.id, f]))

export function getFontChoice(id: string | null | undefined): FontChoice | undefined {
  if (!id || id === THEME_DEFAULT_FONT_ID) return undefined
  return FONT_BY_ID[id]
}

export function normalizeFontId(id: string | null | undefined): string {
  if (!id || id === THEME_DEFAULT_FONT_ID) return THEME_DEFAULT_FONT_ID
  return getFontChoice(id) ? id : THEME_DEFAULT_FONT_ID
}
