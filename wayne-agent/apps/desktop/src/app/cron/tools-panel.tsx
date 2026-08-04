import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearch,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getCronDeliveryTargets, getSkills, getToolsets } from '@/hermes'
import { useI18n } from '@/i18n'
import { ManageMemoryDialog } from '@/app/settings/memory/manage-dialog'
import { cn } from '@/lib/utils'

import {
  deliveryLabelForId,
  deliveryTargetLabel,
  fallbackDeliveryTargets,
  mergeDeliveryTargets,
  onlyLocalDeliveryAvailable
} from './delivery-targets'

interface ToolsPanelProps {
  deliver: string
  enabledToolsets: string[]
  onDeliverChange: (value: string) => void
  onEnabledToolsetsChange: (value: string[]) => void
  onOpenChannels: () => void
  onOpenConnectors: () => void
  onSkillsChange: (value: string[]) => void
  skills: string[]
}

function SelectionChips({
  emptyLabel,
  items,
  onRemove
}: {
  emptyLabel: string
  items: string[]
  onRemove: (item: string) => void
}) {
  if (items.length === 0) {
    return <p className="text-[0.65rem] text-foreground/65">{emptyLabel}</p>
  }

  return (
    <div className="flex flex-wrap gap-1">
      {items.map(item => (
        <span
          className="inline-flex max-w-full items-center gap-1 rounded-md bg-(--ui-bg-tertiary)/80 px-1.5 py-0.5 text-[0.6875rem] text-foreground"
          key={item}
        >
          <span className="truncate">{item}</span>
          <button
            aria-label={`Remove ${item}`}
            className="rounded p-0.5 text-foreground/65 hover:bg-(--chrome-action-hover) hover:text-foreground"
            onClick={() => onRemove(item)}
            type="button"
          >
            <Codicon name="close" size="0.65rem" />
          </button>
        </span>
      ))}
    </div>
  )
}

export function ToolsPanel({
  deliver,
  enabledToolsets,
  onDeliverChange,
  onEnabledToolsetsChange,
  onOpenChannels,
  onOpenConnectors,
  onSkillsChange,
  skills
}: ToolsPanelProps) {
  const { t } = useI18n()
  const c = t.cron
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const [toolsetQuery, setToolsetQuery] = useState('')

  const deliveryQuery = useQuery({
    queryFn: async () => (await getCronDeliveryTargets()).targets,
    queryKey: ['cron-delivery-targets']
  })

  const deliveryTargets = useMemo(
    () => mergeDeliveryTargets(deliveryQuery.data, deliver),
    [deliver, deliveryQuery.data]
  )

  const selectedTarget = deliveryTargets.find(target => target.id === deliver)
  const channelLabel = deliveryLabelForId(deliver, deliveryTargets, c)
  const needsHomeChannel =
    selectedTarget != null && selectedTarget.id !== 'local' && !selectedTarget.home_target_set
  const onlyLocal = onlyLocalDeliveryAvailable(deliveryTargets)

  const skillsQuery = useQuery({
    queryFn: getSkills,
    queryKey: ['cron-editor-skills']
  })

  const toolsetsQuery = useQuery({
    queryFn: getToolsets,
    queryKey: ['cron-editor-toolsets']
  })

  const skillChoices = useMemo(() => {
    const q = skillQuery.trim().toLowerCase()
    const rows = (skillsQuery.data ?? [])
      .filter(row => row.enabled)
      .map(row => row.name)
      .filter(name => !skills.includes(name))

    if (!q) {
      return rows.slice(0, 40)
    }

    return rows.filter(name => name.toLowerCase().includes(q)).slice(0, 40)
  }, [skillQuery, skills, skillsQuery.data])

  const toolsetChoices = useMemo(() => {
    const q = toolsetQuery.trim().toLowerCase()
    const rows = (toolsetsQuery.data ?? [])
      .filter(row => row.enabled)
      .map(row => ({ name: row.name, label: row.label || row.name }))
      .filter(row => !enabledToolsets.includes(row.name))

    if (!q) {
      return rows.slice(0, 40)
    }

    return rows.filter(row => row.name.toLowerCase().includes(q) || row.label.toLowerCase().includes(q)).slice(0, 40)
  }, [enabledToolsets, toolsetQuery, toolsetsQuery.data])

  return (
    <section className="space-y-2">
      <div>
        <h3 className="text-[0.75rem] font-medium text-foreground/70">{c.toolsSection}</h3>
        <p className="mt-0.5 text-[0.65rem] text-foreground/65">{c.toolsHint}</p>
      </div>

      <div className="overflow-hidden rounded-xl border border-(--ui-stroke-tertiary)/70 bg-(--ui-bg-quinary)/15">
        <div className="flex items-start justify-between gap-2 border-b border-(--ui-stroke-tertiary)/60 px-3 py-2.5">
          <div className="min-w-0 flex-1">
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

        <div className="space-y-2 border-b border-(--ui-stroke-tertiary)/60 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[0.8rem] font-medium text-foreground">{c.jobSkillsLabel}</div>
              <p className="mt-0.5 text-[0.65rem] text-foreground/65">{c.jobSkillsHint}</p>
            </div>
            <DropdownMenu
              onOpenChange={open => {
                if (!open) {
                  setSkillQuery('')
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button size="sm" type="button" variant="outline">
                  {c.addJobSkill}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-0">
                <DropdownMenuSearch
                  onValueChange={setSkillQuery}
                  placeholder={c.searchJobSkills}
                  value={skillQuery}
                />
                <div className="max-h-56 overflow-y-auto py-1">
                  {skillChoices.length === 0 ? (
                    <div className="px-2 py-2 text-[0.75rem] text-foreground/65">{c.noJobSkills}</div>
                  ) : (
                    skillChoices.map(name => (
                      <DropdownMenuItem key={name} onSelect={() => onSkillsChange([...skills, name])}>
                        {name}
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <SelectionChips
            emptyLabel={c.noJobSkillsSelected}
            items={skills}
            onRemove={name => onSkillsChange(skills.filter(row => row !== name))}
          />
        </div>

        <div className="space-y-2 border-b border-(--ui-stroke-tertiary)/60 px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="text-[0.8rem] font-medium text-foreground">{c.jobToolsetsLabel}</div>
              <p className="mt-0.5 text-[0.65rem] text-foreground/65">{c.jobToolsetsHint}</p>
            </div>
            <DropdownMenu
              onOpenChange={open => {
                if (!open) {
                  setToolsetQuery('')
                }
              }}
            >
              <DropdownMenuTrigger asChild>
                <Button size="sm" type="button" variant="outline">
                  {c.addJobToolset}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-64 p-0">
                <DropdownMenuSearch
                  onValueChange={setToolsetQuery}
                  placeholder={c.searchJobToolsets}
                  value={toolsetQuery}
                />
                <div className="max-h-56 overflow-y-auto py-1">
                  {toolsetChoices.length === 0 ? (
                    <div className="px-2 py-2 text-[0.75rem] text-foreground/65">{c.noJobToolsets}</div>
                  ) : (
                    toolsetChoices.map(row => (
                      <DropdownMenuItem
                        key={row.name}
                        onSelect={() => onEnabledToolsetsChange([...enabledToolsets, row.name])}
                      >
                        <span className="truncate">{row.label}</span>
                      </DropdownMenuItem>
                    ))
                  )}
                </div>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
          <SelectionChips
            emptyLabel={c.noJobToolsetsSelected}
            items={enabledToolsets}
            onRemove={name => onEnabledToolsetsChange(enabledToolsets.filter(row => row !== name))}
          />
        </div>

        <div className="space-y-2 border-b border-(--ui-stroke-tertiary)/60 px-3 py-2.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5 text-[0.8rem] font-medium text-foreground">
              <Codicon className="shrink-0 text-foreground/65" name="export" size="0.85rem" />
              <span className="truncate">{c.sendToChannel(channelLabel)}</span>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              <Select onValueChange={onDeliverChange} value={deliver}>
                <SelectTrigger className="h-7 w-[11rem] rounded-md border-(--ui-stroke-tertiary)/70 text-[0.75rem]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {deliveryTargets.map(target => (
                    <SelectItem key={target.id} value={target.id}>
                      {deliveryTargetLabel(target, c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {needsHomeChannel ? (
                <Button onClick={onOpenChannels} size="sm" type="button" variant="outline">
                  {c.connectChannel}
                </Button>
              ) : null}
            </div>
          </div>
          {onlyLocal ? <p className="text-[0.65rem] text-foreground/65">{c.deliveryNoneConfigured}</p> : null}
          {needsHomeChannel ? <p className="text-[0.65rem] text-foreground/65">{c.deliverHint}</p> : null}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-[0.8rem] text-foreground/80 transition-colors hover:bg-(--chrome-action-hover) hover:text-foreground'
              )}
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
