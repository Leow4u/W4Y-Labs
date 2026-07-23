import { useI18n } from '@/i18n'

export type IntroProps = {
  /** Kept for caller compatibility; empty-state copy is i18n headline only. */
  personality?: string
  seed?: number
}

/**
 * Empty-session intro — Cursor-style: short headline only, no brand wordmark.
 * Composer placeholder + chips carry the rest of the guidance.
 */
export function Intro(_props: IntroProps) {
  const { t } = useI18n()

  return (
    <div
      className="pointer-events-none flex w-full min-w-0 flex-col items-center justify-center px-0.5 py-4 text-center sm:px-6 lg:px-8"
      data-slot="aui_intro"
    >
      <h1 className="m-0 text-center text-[1.65rem] font-semibold leading-tight tracking-tight text-foreground sm:text-[1.85rem]">
        {t.intro.emptyTitle}
      </h1>
    </div>
  )
}
