/**
 * Legacy runtime names (Wayne / Hermes) must not appear in user-visible copy.
 * Use at UI boundaries when surfacing engine, API, or plugin text.
 */

const BRAND_REPLACEMENTS: readonly [RegExp, string][] = [
  [/\bMotor Wayne\b/gi, 'Work4You'],
  [/\bWayne Agent\b/gi, 'Work4You'],
  [/\bHermes Agent\b/gi, 'Work4You'],
  [/\bWayne Console\b/gi, 'Work4You Console'],
  [/\bWayne Dashboard\b/gi, 'Work4You'],
  [/\bNous Research\b/gi, 'Work4You'],
  [/\bNous Portal\b/gi, 'Work4You account'],
  [/\bNous subscription\b/gi, 'Work4You subscription'],
  [/\bNous credits\b/gi, 'Work4You credits'],
  [/\bWayne\b/gi, 'Work4You'],
  [/\bHermes\b/gi, 'Work4You']
]

/** Strip legacy product/runtime brands from strings shown to the user. */
export function sanitizeProductCopy(text: string): string {
  if (!text) {
    return text
  }

  let out = text
  for (const [pattern, replacement] of BRAND_REPLACEMENTS) {
    out = out.replace(pattern, replacement)
  }

  return out
}
