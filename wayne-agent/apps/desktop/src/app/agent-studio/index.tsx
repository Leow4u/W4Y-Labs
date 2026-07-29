/**
 * Agents roster — lean list of isolated Hermes profiles (PRODUTO.md Agent Studio).
 * Secondary to Work chat / Nova sessão. No editor/canvas here.
 */
import { useStore } from '@nanostores/react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { CreateProfileDialog } from '@/app/profiles/create-profile-dialog'
import { PageLoader } from '@/components/page-loader'
import { Button } from '@/components/ui/button'
import { getMessagingPlatforms, getProfilesPulse, type ProfilePulseRow } from '@/hermes'
import { useI18n } from '@/i18n'
import { agentMonogram, prettifyAgentName, realAgents } from '@/lib/agents'
import { resolveProfileColor, profileColorSoft } from '@/lib/profile-color'
import { cn } from '@/lib/utils'
import { $profileColors, refreshActiveProfile, refreshProfiles } from '@/store/profile'
import { notifyError } from '@/store/notifications'
import type { ProfileInfo } from '@/types/hermes'

import { PanelEmpty } from '../overlays/panel'
import { PageSearchShell } from '../page-search-shell'
import { PROFILES_ROUTE } from '../routes'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

function StatusChip({
  pulse,
  idleLabel,
  workingLabel
}: {
  pulse: ProfilePulseRow | undefined
  idleLabel: string
  workingLabel: string
}) {
  if (pulse?.live_status === 'working' || pulse?.live_status === 'starting') {
    return (
      <span className="inline-flex max-w-[10rem] items-center gap-1.5 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[0.7rem] font-medium text-emerald-700 dark:text-emerald-400">
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-emerald-500" />
        <span className="truncate">{pulse.live_title || workingLabel}</span>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[0.7rem] text-muted-foreground">
      {idleLabel}
    </span>
  )
}

interface AgentStudioViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

export function AgentStudioView({
  setStatusbarItemGroup: _setStatusbarItemGroup,
  ...props
}: AgentStudioViewProps) {
  const { t } = useI18n()
  const s = t.agentStudio
  const navigate = useNavigate()
  const colors = useStore($profileColors)

  const [profiles, setLocalProfiles] = useState<ProfileInfo[]>([])
  const [pulseByName, setPulseByName] = useState<Record<string, ProfilePulseRow>>({})
  const [channelsByName, setChannelsByName] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [createOpen, setCreateOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await refreshProfiles()
      setLocalProfiles(list)

      const agents = realAgents(list)
      const [pulseRes, ...channelResults] = await Promise.all([
        getProfilesPulse().catch(() => null),
        ...agents.map(async a => {
          try {
            const platforms = await getMessagingPlatforms(a.name)
            const connected = (platforms.platforms || [])
              .filter(p => p.enabled || p.configured)
              .map(p => p.name || p.id)
            return [a.name, connected] as const
          } catch {
            return [a.name, [] as string[]] as const
          }
        })
      ])

      if (pulseRes?.profiles) {
        const map: Record<string, ProfilePulseRow> = {}
        for (const row of pulseRes.profiles) map[row.name] = row
        setPulseByName(map)
      }
      const ch: Record<string, string[]> = {}
      for (const row of channelResults) {
        if (row) ch[row[0]] = row[1]
      }
      setChannelsByName(ch)
    } catch (err) {
      notifyError(err, s.loadFailed)
    } finally {
      setLoading(false)
    }
  }, [s.loadFailed])

  useEffect(() => {
    void load()
  }, [load])

  const agents = useMemo(() => {
    const base = realAgents(profiles)
    const q = search.trim().toLowerCase()
    if (!q) return base
    return base.filter(
      a =>
        a.name.toLowerCase().includes(q) ||
        prettifyAgentName(a.name).toLowerCase().includes(q) ||
        (a.description || '').toLowerCase().includes(q) ||
        (a.model || '').toLowerCase().includes(q)
    )
  }, [profiles, search])

  return (
    <PageSearchShell
      {...props}
      filters={
        <div className="w-full space-y-1.5 rounded-lg border border-border/70 bg-muted/40 px-3 py-2">
          <p className="text-[0.8125rem] font-medium text-foreground">{s.title}</p>
          <p className="text-[0.75rem] leading-relaxed text-muted-foreground">{s.identityHint}</p>
        </div>
      }
      onSearchChange={setSearch}
      searchHidden={loading && profiles.length === 0}
      searchPlaceholder={s.searchPlaceholder}
      searchTrailingAction={
        <Button onClick={() => setCreateOpen(true)} size="sm">
          {s.newAgent}
        </Button>
      }
      searchValue={search}
    >
      {loading ? (
        <PageLoader label={s.loading} />
      ) : agents.length === 0 ? (
        <PanelEmpty
          action={
            <Button onClick={() => setCreateOpen(true)} size="sm">
              {s.newAgent}
            </Button>
          }
          description={search.trim() ? s.emptySearch : s.empty}
          icon="hubot"
          title={s.emptyTitle}
        />
      ) : (
        <div className="h-full overflow-y-auto px-3 pb-4 [scrollbar-gutter:stable]">
          <div className="mb-2 text-[0.75rem] text-muted-foreground">{s.count(agents.length)}</div>
          <table className="w-full border-collapse text-left text-[0.8125rem]">
            <thead className="sticky top-0 z-1 bg-(--ui-chat-surface-background) text-[0.7rem] uppercase tracking-[0.04em] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-2 py-2 font-medium">{s.colName}</th>
                <th className="hidden px-2 py-2 font-medium sm:table-cell">{s.colChannels}</th>
                <th className="px-2 py-2 font-medium">{s.colStatus}</th>
                <th className="hidden px-2 py-2 font-medium md:table-cell">{s.colModel}</th>
                <th className="hidden px-2 py-2 font-medium lg:table-cell">{s.colSkills}</th>
              </tr>
            </thead>
            <tbody>
              {agents.map(agent => {
                const color = resolveProfileColor(agent.name, colors)
                const channels = channelsByName[agent.name] || []
                return (
                  <tr
                    className="cursor-pointer border-b border-border/60 transition-colors hover:bg-(--chrome-action-hover)"
                    key={agent.name}
                    onClick={() => {
                      navigate(`${PROFILES_ROUTE}?name=${encodeURIComponent(agent.name)}`)
                    }}
                  >
                    <td className="px-2 py-2.5">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            'grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[0.7rem] font-semibold',
                            !color && 'bg-muted text-foreground'
                          )}
                          style={
                            color
                              ? {
                                  background: profileColorSoft(color, 22),
                                  color
                                }
                              : undefined
                          }
                        >
                          {agentMonogram(agent.name)}
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate font-medium text-foreground">
                            {prettifyAgentName(agent.name)}
                          </span>
                          {agent.description ? (
                            <span className="block truncate text-[0.7rem] text-muted-foreground">
                              {agent.description}
                            </span>
                          ) : (
                            <span className="block truncate text-[0.7rem] text-muted-foreground">
                              {agent.name}
                            </span>
                          )}
                        </span>
                      </div>
                    </td>
                    <td className="hidden px-2 py-2.5 sm:table-cell">
                      {channels.length > 0 ? (
                        <span className="text-muted-foreground">{channels.slice(0, 3).join(' · ')}</span>
                      ) : (
                        <span className="text-muted-foreground/70">{s.noChannels}</span>
                      )}
                    </td>
                    <td className="px-2 py-2.5">
                      <StatusChip
                        idleLabel={s.statusIdle}
                        pulse={pulseByName[agent.name]}
                        workingLabel={s.statusWorking}
                      />
                    </td>
                    <td className="hidden px-2 py-2.5 text-muted-foreground md:table-cell">
                      {agent.model || '—'}
                    </td>
                    <td className="hidden px-2 py-2.5 text-muted-foreground lg:table-cell">
                      {agent.skill_count ?? 0}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <CreateProfileDialog
        onClose={() => setCreateOpen(false)}
        onCreated={async () => {
          setCreateOpen(false)
          await refreshActiveProfile()
          await load()
        }}
        open={createOpen}
        profiles={profiles}
      />
    </PageSearchShell>
  )
}
