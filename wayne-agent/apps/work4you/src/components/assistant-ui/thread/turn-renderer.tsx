import { useAuiState } from '@assistant-ui/react'
import { useStore } from '@nanostores/react'
import { type FC, type ReactNode, useMemo, useRef } from 'react'

import {
  mergeTurnSurface,
  serializeTurnSurface,
  turnContractKey,
  turnLayoutModeFromKey,
  turnRunningFromKey,
  type ThreadTurnMessage
} from '@/components/assistant-ui/thread/turn-contract'
import { TurnLayoutContext } from '@/components/assistant-ui/thread/turn-context'
import { TurnFileHeroes } from '@/components/assistant-ui/thread/turn-file-heroes'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'
import { $toolInlineDiffs } from '@/store/tool-diffs'

const TurnDeliveryFooter: FC<{ added: number; files: number; removed: number }> = ({ added, files, removed }) => {
  const { t } = useI18n()
  const label = files === 0 ? '' : t.assistant.thread.deliveryStrip(files)

  if (!label) {
    return null
  }

  return (
    <div
      className={cn(
        'turn-delivery-strip mt-2 flex flex-wrap items-center gap-2 border-t border-[color-mix(in_srgb,var(--ui-stroke-tertiary)_55%,transparent)] pt-2 pl-(--message-text-indent)',
        'text-[0.68rem] leading-snug text-(--ui-text-tertiary)'
      )}
      data-slot="turn-delivery"
    >
      <span>{label}</span>
      {added > 0 && (
        <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400">+{added}</span>
      )}
      {removed > 0 && (
        <span className="font-mono tabular-nums text-rose-600 dark:text-rose-400">−{removed}</span>
      )}
    </div>
  )
}

/** Turn-level layout shell: ask/agent mode, file hero cards, delivery strip. */
export const TurnRenderer: FC<{ indices: readonly number[]; children: ReactNode }> = ({ children, indices }) => {
  const liveDiffs = useStore($toolInlineDiffs)
  const messagesRef = useRef<readonly ThreadTurnMessage[]>([])

  const contractKey = useAuiState(s => turnContractKey(s.thread.messages, indices, s.thread.isRunning))
  const surfaceKey = useAuiState(s => {
    messagesRef.current = s.thread.messages as readonly ThreadTurnMessage[]

    return serializeTurnSurface(s.thread.messages as readonly ThreadTurnMessage[], indices)
  })

  const mode = turnLayoutModeFromKey(contractKey)
  const running = turnRunningFromKey(contractKey)

  const { delivery, heroes } = useMemo(
    () => mergeTurnSurface(messagesRef.current, indices, liveDiffs),
    [indices, liveDiffs, surfaceKey]
  )

  return (
    <TurnLayoutContext.Provider value={mode}>
      <div
        className={cn('flex min-w-0 flex-col gap-(--conversation-turn-gap)', mode === 'ask' && 'turn-renderer--ask')}
        data-slot="aui_turn-renderer"
        data-turn-mode={mode}
      >
        {children}
        {!running && heroes.length > 0 && <TurnFileHeroes heroes={heroes} />}
        {!running && delivery.files > 0 && <TurnDeliveryFooter {...delivery} />}
      </div>
    </TurnLayoutContext.Provider>
  )
}
