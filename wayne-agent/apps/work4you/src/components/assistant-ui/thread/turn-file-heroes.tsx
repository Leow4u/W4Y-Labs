import { type FC } from 'react'

import type { TurnFileHero } from '@/components/assistant-ui/thread/turn-contract'
import { FileTypeIcon } from '@/components/ui/file-type-icon'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { setToolDisclosureOpen } from '@/store/tool-view'

export const TurnFileHeroes: FC<{ heroes: readonly TurnFileHero[] }> = ({ heroes }) => {
  const { t } = useI18n()

  if (heroes.length === 0) {
    return null
  }

  return (
    <div
      className="turn-file-heroes mt-2 flex min-w-0 flex-col gap-1.5 pl-(--message-text-indent)"
      data-slot="turn-file-heroes"
    >
      <span className="text-[0.65rem] font-medium uppercase tracking-[0.08em] text-(--ui-text-tertiary)">
        {t.assistant.thread.fileHeroes}
      </span>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {heroes.map(hero => (
          <button
            className={cn(
              'group/hero flex min-w-0 max-w-full items-center gap-2 rounded-lg border',
              'border-[color-mix(in_srgb,var(--ui-stroke-secondary)_55%,transparent)]',
              'bg-[color-mix(in_srgb,var(--composer-fill)_65%,transparent)] px-2.5 py-1.5 text-left transition-colors',
              'hover:border-(--ui-stroke-secondary) hover:bg-[color-mix(in_srgb,var(--composer-fill)_90%,transparent)]'
            )}
            data-slot="turn-file-hero"
            key={hero.toolCallId}
            onClick={() => setToolDisclosureOpen(hero.disclosureId, true)}
            type="button"
          >
            <FileTypeIcon className="shrink-0 text-(--ui-text-tertiary)" path={hero.path} size="0.875rem" />
            <span className="min-w-0 truncate text-[length:var(--conversation-tool-font-size)] font-medium text-(--ui-text-secondary) group-hover/hero:text-foreground">
              {hero.basename}
            </span>
            <span className="flex shrink-0 items-center gap-1 font-mono text-[0.625rem] tabular-nums">
              {hero.added > 0 && (
                <span className="text-emerald-600 dark:text-emerald-400">+{hero.added}</span>
              )}
              {hero.removed > 0 && (
                <span className="text-rose-600 dark:text-rose-400">−{hero.removed}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  )
}
