import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Codicon } from '@/components/ui/codicon'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSearch,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { getCronDeliveryTargets, getSkills, getToolsets } from '@/hermes'
import { useI18n } from '@/i18n'
import { ManageMemoryDialog } from '@/app/settings/memory/manage-dialog'
import { cn } from '@/lib/utils'

import {
  cronCard,
  cronCardRow,
  cronSectionTitle,
  cronSubtle
} from './editor-ui'
import {
  deliveryLabelForId,
  deliveryTargetLabel,
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

function ToolRow({
  children,
  icon,
  onRemove,
  title
}: {
  children?: ReactNode
  icon: React.ComponentProps<typeof Codicon>['name']
  onRemove?: () => void
  title: string
}) {
  return (
    <div className={cn('flex items-center gap-2', cronCardRow)}>
      <Codicon className={cn('shrink-0', cronSubtle)} name={icon} size="0.9rem" />
      <div className="min-w-0 flex-1 truncate text-[0.8125rem] font-medium text-foreground">{title}</div>
      {children}
      {onRemove ? (
        <button
          className={cn(
            'shrink-0 rounded p-1 hover:bg-(--chrome-action-hover) hover:text-foreground',
            cronSubtle
          )}
          onClick={onRemove}
          type="button"
        >
          <Codicon name="trash" size="0.85rem" />
        </button>
      ) : null}
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

  const toolsetLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const row of toolsetsQuery.data ?? []) {
      map.set(row.name, row.label || row.name)
    }
    return map
  }, [toolsetsQuery.data])

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

  const skillPicker = (
    <DropdownMenuSub
      onOpenChange={open => {
        if (!open) {
          setSkillQuery('')
        }
      }}
    >
      <DropdownMenuSubTrigger className="gap-2 text-xs">
        <Codicon name="symbol-method" size="0.85rem" />
        {c.addJobSkill}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64 p-0">
        <DropdownMenuSearch onValueChange={setSkillQuery} placeholder={c.searchJobSkills} value={skillQuery} />
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
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )

  const toolsetPicker = (
    <DropdownMenuSub
      onOpenChange={open => {
        if (!open) {
          setToolsetQuery('')
        }
      }}
    >
      <DropdownMenuSubTrigger className="gap-2 text-xs">
        <Codicon name="tools" size="0.85rem" />
        {c.addJobToolset}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64 p-0">
        <DropdownMenuSearch onValueChange={setToolsetQuery} placeholder={c.searchJobToolsets} value={toolsetQuery} />
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
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )

  const deliveryPicker = (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger className="gap-2 text-xs">
        <Codicon name="export" size="0.85rem" />
        {c.deliverLabel}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        {deliveryTargets.map(target => (
          <DropdownMenuItem key={target.id} onSelect={() => onDeliverChange(target.id)}>
            {deliveryTargetLabel(target, c)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )

  return (
    <section className="space-y-2">
      <h3 className={cronSectionTitle}>{c.toolsSection}</h3>

      <div className={cronCard}>
        <ToolRow icon="book" title={c.memoriesTool}>
          <Button onClick={() => setMemoryOpen(true)} size="sm" type="button" variant="outline">
            {c.manage}
          </Button>
        </ToolRow>

        {skills.map(skill => (
          <ToolRow
            icon="symbol-method"
            key={skill}
            onRemove={() => onSkillsChange(skills.filter(row => row !== skill))}
            title={skill}
          />
        ))}

        {enabledToolsets.map(name => (
          <ToolRow
            icon="tools"
            key={name}
            onRemove={() => onEnabledToolsetsChange(enabledToolsets.filter(row => row !== name))}
            title={toolsetLabels.get(name) ?? name}
          />
        ))}

        {deliver !== 'local' ? (
          <ToolRow icon="export" title={c.sendToChannel(channelLabel)}>
            <Select onValueChange={onDeliverChange} value={deliver}>
              <SelectTrigger className="h-7 w-[10rem] rounded-md border-(--ui-stroke-tertiary)/70 text-[0.75rem]">
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
          </ToolRow>
        ) : null}

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                'flex w-full items-center gap-1.5 px-3 py-2.5 text-left text-[0.8125rem] font-medium text-foreground transition-colors hover:bg-(--chrome-action-hover)'
              )}
              type="button"
            >
              <Codicon name="add" size="0.85rem" />
              {c.addToolOrMcp}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {skillPicker}
            {toolsetPicker}
            {deliveryPicker}
            <DropdownMenuSeparator />
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

      {onlyLocal && deliver === 'local' ? (
        <p className={cn('text-xs', cronSubtle)}>{c.deliveryNoneConfigured}</p>
      ) : null}

      <ManageMemoryDialog onOpenChange={setMemoryOpen} open={memoryOpen} />
    </section>
  )
}
