import type { ReactNode } from 'react'

import { PageLoader } from '@/components/page-loader'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type { IconComponent } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { PAGE_INSET_X } from '../layout-constants'

export function SettingsContent({ children }: { children: ReactNode }) {
  return (
    <section className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className={cn('min-h-0 flex-1 overflow-y-auto pb-20', PAGE_INSET_X)}>{children}</div>
    </section>
  )
}

export function Pill({ tone = 'muted', children }: { tone?: 'muted' | 'primary'; children: ReactNode }) {
  return <Badge variant={tone === 'primary' ? 'default' : 'muted'}>{children}</Badge>
}

export function SectionHeading({ icon: Icon, title, meta }: { icon: IconComponent; title: string; meta?: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 pt-2 text-[length:var(--conversation-text-font-size)] font-medium">
      <Icon className="size-4 text-muted-foreground" />
      <span>{title}</span>
      {meta && <Pill>{meta}</Pill>}
    </div>
  )
}

/** Cursor-style page title for settings entry screens. */
export function SettingsPageTitle({ title }: { title: string }) {
  return <h1 className="mb-5 text-xl font-semibold tracking-tight text-foreground">{title}</h1>
}

/**
 * Cursor-style settings group: muted label above a rounded card of stacked rows.
 * Put `ListRow` children with `inset` inside.
 */
export function SettingsGroup({
  title,
  children,
  footer,
  className
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
  className?: string
}) {
  return (
    <section className={cn('mb-5', className)}>
      <h2 className="mb-1.5 px-0.5 text-[0.75rem] font-medium text-(--ui-text-tertiary)">{title}</h2>
      <div className="overflow-hidden rounded-xl bg-(--ui-bg-tertiary)/70">
        <div className="divide-y divide-(--ui-stroke-tertiary)/80">{children}</div>
        {footer ? (
          <div className="border-t border-(--ui-stroke-tertiary)/80 px-3.5 py-2.5">{footer}</div>
        ) : null}
      </div>
    </section>
  )
}

/** Padded block inside a `SettingsGroup` card (search, grids, notes). */
export function SettingsGroupBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('px-3.5 py-3', className)}>{children}</div>
}

export function NavLink({
  icon: Icon,
  label,
  active,
  onClick
}: {
  icon: IconComponent
  label: string
  active: boolean
  onClick: () => void
}) {
  return (
    <Button
      className={cn(
        'flex min-h-7 w-full justify-start gap-2 rounded-md px-2 text-left text-[length:var(--conversation-text-font-size)] transition',
        active
          ? 'bg-(--ui-bg-tertiary) text-foreground'
          : 'text-(--ui-text-secondary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      )}
      onClick={onClick}
      size="sm"
      type="button"
      variant="ghost"
    >
      <Icon className="size-4 shrink-0" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </Button>
  )
}

export function ListRow({
  title,
  description,
  hint,
  action,
  below,
  wide = false,
  inset = false
}: {
  title: ReactNode
  description?: ReactNode
  hint?: ReactNode
  action?: ReactNode
  below?: ReactNode
  wide?: boolean
  /** Tighter padding for rows inside `SettingsGroup` cards. */
  inset?: boolean
}) {
  return (
    // Container-queried, not viewport-queried: the label/control split keys on
    // the row's own pane width, so a narrow detail column (messaging, split
    // views) stacks instead of squishing the label against minmax(15rem,…).
    <div className="@container">
      <div
        className={cn(
          'grid gap-3',
          inset ? 'items-center px-3.5 py-2.5' : 'py-3',
          !wide &&
            (inset
              ? '@2xl:grid-cols-[minmax(0,1fr)_auto] @2xl:gap-6'
              : '@2xl:grid-cols-[minmax(0,1fr)_minmax(15rem,22rem)] @2xl:items-center')
        )}
      >
        <div className="min-w-0">
          <div className="text-[length:var(--conversation-text-font-size)] font-medium text-foreground">{title}</div>
          {description && (
            <div
              className={cn(
                'text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)',
                inset ? 'mt-0.5' : 'mt-1'
              )}
            >
              {description}
            </div>
          )}
          {hint && <div className="mt-1 block font-mono text-[0.68rem] text-muted-foreground/45">{hint}</div>}
          {below}
        </div>
        {action && (
          <div className={cn('min-w-0', inset && 'shrink-0', !wide && '@2xl:justify-self-end')}>{action}</div>
        )}
      </div>
    </div>
  )
}

export function LoadingState({ label }: { label: string }) {
  return <PageLoader label={label} />
}

// Canonical implementation lives in components/ui; re-exported so the many
// settings call sites keep their import path.
export { EmptyState } from '@/components/ui/empty-state'
