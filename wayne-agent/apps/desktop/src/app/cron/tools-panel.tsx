import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/i18n'
import { ManageMemoryDialog } from '@/app/settings/memory/manage-dialog'

import { DELIVERY_VALUES } from './schedule'

interface ToolsPanelProps {
  deliver: string
  onDeliverChange: (value: string) => void
  onOpenChannels: () => void
  onOpenConnectors: () => void
}

export function ToolsPanel({
  deliver,
  onDeliverChange,
  onOpenChannels,
  onOpenConnectors
}: ToolsPanelProps) {
  const { t } = useI18n()
  const c = t.cron
  const [memoryOpen, setMemoryOpen] = useState(false)
  const channelLabel = c.deliveryLabels[deliver] ?? deliver
  const needsConnect = deliver !== 'local'

  return (
    <section className="space-y-2">
      <h3 className="text-[0.75rem] font-medium text-foreground/70">{c.toolsSection}</h3>

      <div className="overflow-hidden rounded-lg border border-(--ui-stroke-tertiary)/70">
        <div className="flex items-center justify-between gap-2 border-b border-(--ui-stroke-tertiary)/60 px-3 py-2.5">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-[0.8rem] font-medium text-foreground">
              <Codicon className="text-foreground/65" name="book" size="0.85rem" />
              {c.memoriesTool}
            </div>
            <p className="mt-0.5 text-[0.65rem] text-foreground/65">{c.memoriesManageHint}</p>
          </div>
          <Button onClick={() => setMemoryOpen(true)} size="sm" type="button" variant="outline">
            {c.manage}
          </Button>
        </div>

        <div className="flex items-center justify-between gap-2 border-b border-(--ui-stroke-tertiary)/60 px-3 py-2.5">
          <div className="flex min-w-0 items-center gap-1.5 text-[0.8rem] font-medium text-foreground">
            <Codicon className="shrink-0 text-foreground/65" name="export" size="0.85rem" />
            <span className="truncate">{c.sendToChannel(channelLabel)}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <Select onValueChange={onDeliverChange} value={deliver}>
              <SelectTrigger className="h-7 w-[9.5rem] rounded-md border-(--ui-stroke-tertiary)/70 text-[0.75rem]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_VALUES.map(value => (
                  <SelectItem key={value} value={value}>
                    {c.deliveryLabels[value] ?? value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {needsConnect ? (
              <Button onClick={onOpenChannels} size="sm" type="button" variant="outline">
                {c.connectChannel}
              </Button>
            ) : null}
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-[0.8rem] text-foreground/80 transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground"
              type="button"
            >
              <Codicon name="add" size="0.85rem" />
              {c.addToolOrMcp}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuItem onSelect={onOpenConnectors}>
              <Codicon name="plug" size="0.85rem" />
              {c.openConnectors}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onOpenChannels}>
              <Codicon name="comment-discussion" size="0.85rem" />
              {c.openChannels}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ManageMemoryDialog onOpenChange={setMemoryOpen} open={memoryOpen} />
    </section>
  )
}
