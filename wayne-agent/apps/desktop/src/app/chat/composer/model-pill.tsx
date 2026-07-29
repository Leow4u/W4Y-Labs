import { useStore } from '@nanostores/react'
import { useState } from 'react'

import { ModelMenuCloseContext } from '@/app/shell/model-menu-panel'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { GlyphSpinner } from '@/components/ui/glyph-spinner'
import { KbdCombo } from '@/components/ui/kbd'
import { Tip } from '@/components/ui/tooltip'
import { useI18n } from '@/i18n'
import { ChevronDown } from '@/lib/icons'
import { isW4yAutoModel } from '@/lib/composer-auto-mode'
import { formatCombo } from '@/lib/keybinds/combo'
import { formatModelStatusLabel } from '@/lib/model-status-label'
import { cn } from '@/lib/utils'
import { modelLabel } from '@/lib/w4y-featured-models'
import { $bindings } from '@/store/keybinds'
import {
  $currentFastMode,
  $currentModel,
  $currentReasoningEffort,
  setModelPickerOpen
} from '@/store/session'

import type { ChatBarState } from './types'

const PILL = cn(
  'h-(--composer-control-size) max-w-40 shrink-0 gap-1 rounded-md px-2 text-xs font-normal',
  'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
)

/**
 * Composer model selector — the relocated status-bar pill. Reuses the live
 * `model.options` dropdown (`modelMenuContent`) verbatim; falls back to the
 * full picker when the gateway is closed and no live menu exists.
 *
 * Tooltip matches Cursor: action label + shortcut — never provider slugs
 * (e.g. openrouter) or raw catalog ids.
 */
export function ModelPill({
  compact = false,
  disabled,
  model
}: {
  compact?: boolean
  disabled: boolean
  model: ChatBarState['model']
}) {
  const copy = useI18n().t.shell.statusbar
  const currentModel = useStore($currentModel)
  const fastMode = useStore($currentFastMode)
  const reasoningEffort = useStore($currentReasoningEffort)
  const bindings = useStore($bindings)
  const [open, setOpen] = useState(false)

  // The model resolves a beat after the gateway/session comes up. Rather than
  // flash a literal "No model", show a quiet loader (inherits the pill text
  // color at half opacity) until a model lands.
  const label = compact ? (
    <ChevronDown className="size-3.5 shrink-0 opacity-70" />
  ) : (
    <>
      {currentModel.trim() ? (
        <span className="truncate">
          {isW4yAutoModel(currentModel)
            ? modelLabel(currentModel)
            : formatModelStatusLabel(currentModel, { fastMode, reasoningEffort })}
        </span>
      ) : (
        <GlyphSpinner className="opacity-50" spinner="braille" />
      )}
      <ChevronDown className="size-2.5 shrink-0 opacity-50" />
    </>
  )

  // Compact (floating composer): a snug square holding just the chevron — no pill
  // padding, sized to match the other composer icon buttons.
  const pillClass = compact
    ? cn(
        'size-(--composer-control-size) shrink-0 justify-center gap-0 rounded-md p-0',
        'text-(--ui-text-tertiary) hover:bg-(--chrome-action-hover) hover:text-foreground'
      )
    : PILL

  const selectLabel = copy.selectModel
  const modelCombo = bindings['composer.modelPicker']?.[0]
  const tipLabel = modelCombo ? (
    <span className="inline-flex items-center gap-1.5">
      {selectLabel}
      <KbdCombo combo={modelCombo} size="sm" variant="inverted" />
    </span>
  ) : (
    selectLabel
  )
  const ariaLabel = modelCombo ? `${selectLabel} (${formatCombo(modelCombo)})` : selectLabel

  if (!model.modelMenuContent) {
    return (
      <Tip label={tipLabel} side="top">
        <Button
          aria-label={ariaLabel}
          className={pillClass}
          disabled={disabled}
          onClick={() => setModelPickerOpen(true)}
          type="button"
          variant="ghost"
        >
          {label}
        </Button>
      </Tip>
    )
  }

  return (
    <DropdownMenu onOpenChange={setOpen} open={open}>
      <Tip label={tipLabel} side="top">
        <DropdownMenuTrigger asChild>
          <Button aria-label={ariaLabel} className={pillClass} disabled={disabled} type="button" variant="ghost">
            {label}
          </Button>
        </DropdownMenuTrigger>
      </Tip>
      <DropdownMenuContent align="end" className="w-64 p-0" side="top" sideOffset={8}>
        <ModelMenuCloseContext.Provider value={() => setOpen(false)}>
          {model.modelMenuContent}
        </ModelMenuCloseContext.Provider>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
