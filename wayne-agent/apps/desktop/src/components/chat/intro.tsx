/**
 * Locale-aware empty-session intro — title + rotating body from i18n.
 */
import { useState } from 'react'

import { useI18n } from '@/i18n'
import { capitalize, normalize } from '@/lib/text'

export type IntroProps = {
  personality?: string
  seed?: number
}

const NEUTRAL_PERSONALITIES = new Set(['', 'default', 'none', 'neutral'])

function normalizeKey(value?: string): string {
  return normalize(value)
}

function titleize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(capitalize)
    .join(' ')
}

function pickBody(bodies: readonly string[], seed = 0): string {
  if (bodies.length === 0) return ''
  return bodies[Math.abs(seed) % bodies.length] ?? bodies[0] ?? ''
}

/**
 * Empty-session intro — short i18n headline + rotating locale body.
 */
export function Intro({ personality, seed }: IntroProps) {
  const { t } = useI18n()
  const [mountSeed] = useState(() => Math.floor(Math.random() * 100000))
  const personalityKey = normalizeKey(personality)
  const bodies = t.intro.emptyBodies
  let body = pickBody(bodies, mountSeed + (seed ?? 0))

  if (!NEUTRAL_PERSONALITIES.has(personalityKey) && personalityKey) {
    const label = titleize(personalityKey)
    // Keep rotation but acknowledge configured personality in locale-neutral way.
    body = pickBody(bodies, mountSeed + (seed ?? 0) + personalityKey.length).replace(
      /\.$/,
      ` (${label}).`
    )
  }

  return (
    <div
      className="pointer-events-none flex w-full min-w-0 max-w-[var(--composer-width)] flex-col items-center justify-center px-0.5 text-center text-muted-foreground sm:px-6 lg:px-8"
      data-slot="aui_intro"
    >
      <div className="w-full min-w-0">
        <h1 className="m-0 mb-1.5 text-center text-[1.65rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[1.85rem]">
          {t.intro.emptyTitle}
        </h1>
        <p className="m-0 max-w-[36rem] text-center text-[0.95rem] leading-snug tracking-tight">{body}</p>
      </div>
    </div>
  )
}
