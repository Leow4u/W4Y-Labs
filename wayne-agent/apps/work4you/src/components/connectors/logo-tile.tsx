import { useState } from 'react'

import type { ConnectorToolkit } from '@/lib/connectors-types'
import { cn } from '@/lib/utils'

/** App logo (Composio CDN) with a letter-tile fallback. */
export function LogoTile({
  toolkit,
  className
}: {
  toolkit: ConnectorToolkit
  className?: string
}) {
  const [failed, setFailed] = useState(false)
  if (!toolkit.logo || failed) {
    return (
      <span
        className={cn(
          'grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold text-foreground',
          className
        )}
      >
        {(toolkit.name || toolkit.slug || '?').charAt(0).toUpperCase()}
      </span>
    )
  }
  return (
    <img
      alt=""
      className={cn('h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-1', className)}
      loading="lazy"
      onError={() => setFailed(true)}
      src={toolkit.logo}
    />
  )
}
