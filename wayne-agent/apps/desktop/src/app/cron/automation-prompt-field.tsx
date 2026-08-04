import type { Unstable_TriggerItem } from '@assistant-ui/core'
import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import { ComposerTriggerPopover } from '@/app/chat/composer/trigger-popover'
import { detectTrigger, type TriggerState } from '@/app/chat/composer/text-utils'
import { useAtCompletions } from '@/app/chat/composer/hooks/use-at-completions'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { $gateway } from '@/store/gateway'
import { $currentCwd } from '@/store/session'

interface AutomationPromptFieldProps {
  className?: string
  onChange: (value: string) => void
  placeholder?: string
  value: string
  workdir?: string
}

function textBeforeCaret(textarea: HTMLTextAreaElement): string {
  return textarea.value.slice(0, textarea.selectionStart ?? textarea.value.length)
}

export function AutomationPromptField({
  className,
  onChange,
  placeholder,
  value,
  workdir
}: AutomationPromptFieldProps) {
  const gateway = useStore($gateway)
  const fallbackCwd = useStore($currentCwd)
  const cwd = workdir?.trim() || fallbackCwd || null
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const at = useAtCompletions({ gateway, sessionId: null, cwd })

  const [trigger, setTrigger] = useState<TriggerState | null>(null)
  const [triggerActive, setTriggerActive] = useState(0)
  const [triggerItems, setTriggerItems] = useState<readonly Unstable_TriggerItem[]>([])

  const refreshTrigger = useCallback(() => {
    const el = textareaRef.current

    if (!el) {
      return
    }

    const before = textBeforeCaret(el)

    if (!before.includes('@')) {
      if (trigger) {
        setTrigger(null)
        setTriggerActive(0)
      }

      return
    }

    const found = detectTrigger(before)
    const next = found?.kind === '@' ? found : null

    if (next?.query !== trigger?.query) {
      setTriggerActive(0)
    }

    setTrigger(next)
  }, [trigger])

  useEffect(() => {
    if (!trigger || !at.adapter.search) {
      setTriggerItems([])

      return
    }

    setTriggerItems(at.adapter.search(trigger.query))
  }, [at.adapter, trigger])

  useEffect(() => {
    setTriggerActive(index => Math.min(index, Math.max(0, triggerItems.length - 1)))
  }, [triggerItems.length])

  const closeTrigger = () => {
    setTrigger(null)
    setTriggerItems([])
    setTriggerActive(0)
  }

  const insertPick = (item: Unstable_TriggerItem) => {
    const el = textareaRef.current

    if (!el || !trigger) {
      return
    }

    const meta = item.metadata as { rawText?: string } | undefined
    const raw = meta?.rawText || item.label
    const insert = raw.endsWith(':') ? raw : `${raw} `
    const caret = el.selectionStart ?? value.length
    const start = Math.max(0, caret - trigger.tokenLength)
    const next = `${value.slice(0, start)}${insert}${value.slice(caret)}`

    onChange(next)
    closeTrigger()

    requestAnimationFrame(() => {
      el.focus()
      const pos = start + insert.length
      el.setSelectionRange(pos, pos)
    })
  }

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (!trigger) {
      return
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setTriggerActive(index => Math.min(index + 1, Math.max(0, triggerItems.length - 1)))

      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setTriggerActive(index => Math.max(index - 1, 0))

      return
    }

    if (event.key === 'Enter' || event.key === 'Tab') {
      const item = triggerItems[triggerActive]

      if (item) {
        event.preventDefault()
        insertPick(item)
      }

      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      closeTrigger()
    }
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <Textarea
        className={cn(
          'min-h-40 flex-1 resize-none border-0 bg-transparent px-3 py-3 pb-12 shadow-none placeholder:text-foreground/45 focus-visible:ring-0',
          className
        )}
        onChange={event => {
          onChange(event.target.value)
          window.setTimeout(refreshTrigger, 0)
        }}
        onClick={() => window.setTimeout(refreshTrigger, 0)}
        onKeyDown={onKeyDown}
        onKeyUp={refreshTrigger}
        placeholder={placeholder}
        ref={textareaRef}
        value={value}
      />
      {trigger ? (
        <div className="absolute bottom-12 left-2 z-10 max-w-[min(24rem,calc(100%-1rem))]">
          <ComposerTriggerPopover
            activeIndex={triggerActive}
            items={triggerItems}
            kind="@"
            loading={at.loading}
            onHover={setTriggerActive}
            onPick={insertPick}
            placement="top"
          />
        </div>
      ) : null}
    </div>
  )
}
