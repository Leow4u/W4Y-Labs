import { useQuery } from '@tanstack/react-query'
import { useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'

import { LogoTile } from '@/components/connectors/logo-tile'
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
import { getConnectorsCatalog, getConnectorsStatus } from '@/lib/connectors-api'
import type { ConnectorToolkit } from '@/lib/connectors-types'
import { cn } from '@/lib/utils'

import { SKILLS_ROUTE } from '../routes'
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
  connectorsEnabled: string[] | null
  deliver: string
  enabledToolsets: string[]
  onConnectorsEnabledChange: (value: string[] | null) => void
  onDeliverChange: (value: string) => void
  onEnabledToolsetsChange: (value: string[]) => void
  onOpenChannels: () => void
  onSkillsChange: (value: string[]) => void
  skills: string[]
}

function ToolRow({
  children,
  icon,
  logo,
  onRemove,
  title
}: {
  children?: ReactNode
  icon?: React.ComponentProps<typeof Codicon>['name']
  logo?: ConnectorToolkit
  onRemove?: () => void
  title: string
}) {
  return (
    <div className={cn('flex items-center gap-2', cronCardRow)}>
      {logo ? (
        <LogoTile className="h-5 w-5 shrink-0 rounded-md text-[0.65rem]" toolkit={logo} />
      ) : icon ? (
        <Codicon className={cn('shrink-0', cronSubtle)} name={icon} size="0.9rem" />
      ) : null}
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

function fallbackToolkit(slug: string): ConnectorToolkit {
  return {
    slug,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    description: '',
    logo: null,
    categories: [],
    no_auth: false,
    managed_auth: false,
    auth_schemes: [],
    tools_count: null,
    triggers_count: null
  }
}

export function ToolsPanel({
  connectorsEnabled,
  deliver,
  enabledToolsets,
  onConnectorsEnabledChange,
  onDeliverChange,
  onEnabledToolsetsChange,
  onOpenChannels,
  onSkillsChange,
  skills
}: ToolsPanelProps) {
  const { t } = useI18n()
  const c = t.cron
  const navigate = useNavigate()
  const [memoryOpen, setMemoryOpen] = useState(false)
  const [skillQuery, setSkillQuery] = useState('')
  const [toolsetQuery, setToolsetQuery] = useState('')
  const [connectorQuery, setConnectorQuery] = useState('')

  const deliveryQuery = useQuery({
    queryFn: async () => (await getCronDeliveryTargets()).targets,
    queryKey: ['cron-delivery-targets']
  })

  const connectorsQuery = useQuery({
    queryFn: async () => {
      const [status, catalog] = await Promise.all([
        getConnectorsStatus('global').catch(() => null),
        getConnectorsCatalog().catch(() => null)
      ])
      const toolkits = catalog?.toolkits ?? []
      const bySlug = new Map(toolkits.map(row => [row.slug.toLowerCase(), row]))
      const slugs = [
        ...new Set(
          (status?.accounts ?? [])
            .filter(account => account.status === 'ACTIVE')
            .map(account => (account.toolkit || '').toLowerCase())
            .filter(Boolean)
        )
      ]
      return slugs.map(slug => bySlug.get(slug) ?? fallbackToolkit(slug))
    },
    queryKey: ['cron-editor-connectors']
  })

  const enabledSet = useMemo(
    () => new Set((connectorsEnabled ?? []).map(slug => slug.toLowerCase())),
    [connectorsEnabled]
  )

  const listedConnectors = useMemo(() => {
    if (connectorsEnabled === null) {
      return []
    }
    const catalog = connectorsQuery.data ?? []
    const bySlug = new Map(catalog.map(row => [row.slug.toLowerCase(), row]))
    return connectorsEnabled.map(slug => bySlug.get(slug.toLowerCase()) ?? fallbackToolkit(slug))
  }, [connectorsEnabled, connectorsQuery.data])

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

  const connectorChoices = useMemo(() => {
    const q = connectorQuery.trim().toLowerCase()
    const rows = connectorsQuery.data ?? []
    if (!q) {
      return rows
    }
    return rows.filter(
      row => row.name.toLowerCase().includes(q) || row.slug.toLowerCase().includes(q)
    )
  }, [connectorQuery, connectorsQuery.data])

  const addConnector = (slug: string) => {
    const key = slug.toLowerCase()
    if (connectorsEnabled === null) {
      onConnectorsEnabledChange([key])
      return
    }
    if (enabledSet.has(key)) {
      return
    }
    onConnectorsEnabledChange([...connectorsEnabled, key].sort())
  }

  const removeConnector = (slug: string) => {
    const key = slug.toLowerCase()
    if (connectorsEnabled === null) {
      return
    }
    onConnectorsEnabledChange(connectorsEnabled.filter(row => row.toLowerCase() !== key))
  }

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

  const connectorPicker = (
    <DropdownMenuSub
      onOpenChange={open => {
        if (!open) {
          setConnectorQuery('')
        }
      }}
    >
      <DropdownMenuSubTrigger className="gap-2 text-xs">
        <Codicon name="plug" size="0.85rem" />
        {c.addJobConnector}
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-72 p-0">
        <DropdownMenuSearch
          onValueChange={setConnectorQuery}
          placeholder={c.searchJobConnectors}
          value={connectorQuery}
        />
        <div className="max-h-56 overflow-y-auto py-1">
          {connectorChoices.length === 0 ? (
            <div className="px-2 py-2 text-[0.75rem] text-foreground/65">{c.noJobConnectors}</div>
          ) : (
            connectorChoices.map(row => {
              const slug = row.slug.toLowerCase()
              const added = enabledSet.has(slug)
              return (
                <DropdownMenuItem
                  disabled={added}
                  key={slug}
                  onSelect={() => addConnector(slug)}
                >
                  <span className="flex min-w-0 flex-1 items-center gap-2">
                    <LogoTile className="h-5 w-5 shrink-0 rounded-md text-[0.65rem]" toolkit={row} />
                    <span className="truncate">{row.name}</span>
                  </span>
                  {added ? (
                    <span className="ml-2 shrink-0 text-[0.65rem] text-muted-foreground">{c.jobConnectorAdded}</span>
                  ) : null}
                </DropdownMenuItem>
              )
            })
          )}
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => navigate(`${SKILLS_ROUTE}?view=marketplace`)}>
          {c.browseConnectorsMarketplace}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => navigate(`${SKILLS_ROUTE}?tab=connectors`)}>
          {c.manageConnectorsLink}
        </DropdownMenuItem>
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
      <p className={cn('text-xs', cronSubtle)}>{c.toolsHint}</p>

      <div className={cronCard}>
        <ToolRow icon="book" title={c.memoriesTool}>
          <Button onClick={() => setMemoryOpen(true)} size="sm" type="button" variant="outline">
            {c.manage}
          </Button>
        </ToolRow>

        {listedConnectors.map(row => (
          <ToolRow
            key={row.slug}
            logo={row}
            onRemove={() => removeConnector(row.slug)}
            title={row.name}
          />
        ))}

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
            {connectorPicker}
            {deliveryPicker}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {connectorsEnabled === null ? (
        <p className={cn('text-xs', cronSubtle)}>{c.jobConnectorsLegacyHint}</p>
      ) : listedConnectors.length > 0 ? (
        <p className={cn('text-xs', cronSubtle)}>{c.jobConnectorsHint}</p>
      ) : null}

      {onlyLocal && deliver === 'local' ? (
        <p className={cn('text-xs', cronSubtle)}>{c.deliveryNoneConfigured}</p>
      ) : null}

      <ManageMemoryDialog onOpenChange={setMemoryOpen} open={memoryOpen} />
    </section>
  )
}
