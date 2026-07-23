import { useNavigate } from 'react-router-dom'

import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { ChevronDown, iconSize, Link2 } from '@/lib/icons'
import { cn } from '@/lib/utils'

import { SKILLS_ROUTE } from '../../routes'

const CHIP =
  'flex h-7 max-w-[14rem] items-center gap-1 rounded-lg px-2 text-[0.75rem] font-medium text-muted-foreground transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'

/** Opens Capabilities → MCP. UI-only; does not invent Composio session toggles. */
export function ConnectorsChip() {
  const { t } = useI18n()
  const navigate = useNavigate()

  return (
    <Tip label={t.composer.connectorsHint}>
      <button
        aria-label={t.composer.connectorsLabel}
        className={CHIP}
        onClick={() => {
          navigate(`${SKILLS_ROUTE}?tab=mcp`)
        }}
        title={t.composer.connectorsHint}
        type="button"
      >
        <Link2 className={iconSize.sm} />
        <span className="truncate">{t.composer.connectorsLabel}</span>
        <ChevronDown className={cn(iconSize.sm, 'opacity-60')} />
      </button>
    </Tip>
  )
}
