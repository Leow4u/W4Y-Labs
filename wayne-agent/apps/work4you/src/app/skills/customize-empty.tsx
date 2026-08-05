import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/** Centered empty state inside the Customize content card — Cursor layout. */
export function CustomizeEmpty({
  actions,
  className,
  description,
  title
}: {
  actions?: ReactNode
  className?: string
  description: string
  title: string
}) {
  return (
    <div className={cn('flex h-full min-h-0 flex-1 flex-col items-center justify-center px-10 py-20', className)}>
      <div className="flex max-w-[26rem] flex-col items-center gap-2.5 text-center">
        <h2 className="text-[1.0625rem] font-semibold tracking-tight text-foreground">{title}</h2>
        <p className="text-[0.8125rem] leading-relaxed text-muted-foreground">{description}</p>
        {actions ? <div className="mt-3.5 flex flex-wrap items-center justify-center gap-2">{actions}</div> : null}
      </div>
    </div>
  )
}

/** Cursor empty-card actions: muted fill (+ Add) or outline (Documentation). */
export function CustomizeEmptyAction({
  children,
  onClick,
  variant = 'outline'
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'muted' | 'outline'
}) {
  return (
    <button
      className={cn(
        'inline-flex h-8 items-center gap-1 rounded-lg px-3 text-[0.78125rem] font-medium transition-colors',
        variant === 'muted'
          ? 'bg-muted text-foreground/85 hover:bg-muted/80'
          : 'border border-border bg-transparent text-muted-foreground hover:bg-muted/50 hover:text-foreground'
      )}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}
