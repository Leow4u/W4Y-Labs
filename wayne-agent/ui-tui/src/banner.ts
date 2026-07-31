import type { ThemeColors } from './theme.js'

const RICH_RE = /\[(?:bold\s+)?(?:dim\s+)?(#(?:[0-9a-fA-F]{3,8}))\]([\s\S]*?)(\[\/\])/g

export function parseRichMarkup(markup: string): Line[] {
  const lines: Line[] = []

  for (const raw of markup.split('\n')) {
    const trimmed = raw.trimEnd()

    if (!trimmed) {
      lines.push(['', ' '])

      continue
    }

    const matches = [...trimmed.matchAll(RICH_RE)]

    if (!matches.length) {
      lines.push(['', trimmed])

      continue
    }

    let cursor = 0

    for (const m of matches) {
      const before = trimmed.slice(cursor, m.index)

      if (before) {
        lines.push(['', before])
      }

      lines.push([m[1]!, m[2]!])
      cursor = m.index! + m[0].length
    }

    if (cursor < trimmed.length) {
      lines.push(['', trimmed.slice(cursor)])
    }
  }

  return lines
}

// Compact W4Y monogram — real ANSI-Shadow W (same as wayne_cli/banner.py).
const LOGO_ART = [
  '██╗    ██╗██╗  ██╗██╗   ██╗',
  '██║    ██║██║  ██║╚██╗ ██╔╝',
  '██║ █╗ ██║███████║ ╚████╔╝ ',
  '██║███╗██║╚════██║  ╚██╔╝  ',
  '╚███╔███╔╝     ██║   ██║   ',
  ' ╚══╝╚══╝      ╚═╝   ╚═╝   '
]

// Default left-panel hero is the same mark (skins may override via banner_hero).
const CADUCEUS_ART = LOGO_ART

const LOGO_GRADIENT = [0, 0, 1, 1, 2, 2] as const
const CADUC_GRADIENT = LOGO_GRADIENT

const colorize = (art: string[], gradient: readonly number[], c: ThemeColors): Line[] => {
  const p = [c.primary, c.accent, c.border, c.muted]

  return art.map((text, i) => [p[gradient[i]!] ?? c.muted, text])
}

export const LOGO_WIDTH = Math.max(...LOGO_ART.map(line => line.length))
export const CADUCEUS_WIDTH = Math.max(...CADUCEUS_ART.map(line => line.length))

export const logo = (c: ThemeColors, customLogo?: string): Line[] =>
  customLogo ? parseRichMarkup(customLogo) : colorize(LOGO_ART, LOGO_GRADIENT, c)

/** Left-panel hero. Name kept for skin/API back-compat; default art is W4Y mark. */
export const caduceus = (c: ThemeColors, customHero?: string): Line[] =>
  customHero ? parseRichMarkup(customHero) : colorize(CADUCEUS_ART, CADUC_GRADIENT, c)

export const artWidth = (lines: Line[]) => lines.reduce((m, [, t]) => Math.max(m, t.length), 0)

type Line = [string, string]
