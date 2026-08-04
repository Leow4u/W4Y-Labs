import type { ComponentProps } from 'react'

import { Loader2 } from '@/lib/icons'
import { cn } from '@/lib/utils'

/** Neutral loading indicator — plain spin, no Hermes curve glyphs. */
export function AppSpinner({ className, ...props }: ComponentProps<typeof Loader2>) {
  return (
    <Loader2
      {...props}
      aria-hidden={props['aria-hidden'] ?? true}
      className={cn('animate-spin text-muted-foreground/50', className)}
    />
  )
}
