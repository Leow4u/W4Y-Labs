import { sanitizeProductCopy } from '@hermes/shared'
import { useStore } from '@nanostores/react'
import type * as React from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { PageLoader } from '@/components/page-loader'
import { StatusDot, type StatusTone } from '@/components/status-dot'
import { Button } from '@/components/ui/button'
import { DisclosureCaret } from '@/components/ui/disclosure-caret'
import { ErrorBanner } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  getMessagingPlatforms,
  type MessagingEnvVarInfo,
  type MessagingPlatformInfo,
  type SessionInfo,
  testMessagingPlatform,
  updateMessagingPlatform
} from '@/hermes'
import { type Translations, useI18n } from '@/i18n'
import {
  FEATURED_CHANNELS,
  fieldBucket,
  isSystemChannel,
  sessionSourcesForPlatform
} from '@/lib/channel-curation'
import { sessionTitle } from '@/lib/chat-runtime'
import { openExternalLink } from '@/lib/external-link'
import { ChevronLeft, ExternalLink, Save, Trash2 } from '@/lib/icons'
import { normalizeSessionSource } from '@/lib/session-source'
import { normalize } from '@/lib/text'
import { coarseElapsed } from '@/lib/time'
import { cn } from '@/lib/utils'
import { notify, notifyError } from '@/store/notifications'
import { $messagingSessions } from '@/store/session'
import { runGatewayRestart } from '@/store/system-actions'

import { useRefreshHotkey } from '../hooks/use-refresh-hotkey'
import { PageSearchShell } from '../page-search-shell'
import { sessionRoute } from '../routes'
import { CREDENTIAL_CONTROL_CLASS } from '../settings/credential-key-ui'
import { ListRow } from '../settings/primitives'
import type { SetStatusbarItemGroup } from '../shell/statusbar-controls'

import { PlatformAvatar } from './platform-icon'

interface MessagingViewProps extends React.ComponentProps<'section'> {
  setStatusbarItemGroup?: SetStatusbarItemGroup
}

type EditMap = Record<string, Record<string, string>>
type Screen = 'grid' | 'setup' | 'hub'

const PILL_TONE: Record<StatusTone, string> = {
  good: 'bg-primary/10 text-primary',
  muted: 'bg-muted text-muted-foreground',
  warn: 'bg-amber-500/10 text-amber-600 dark:text-amber-300',
  bad: 'bg-destructive/10 text-destructive'
}

const stateLabel = (state: null | string | undefined, m: Translations['messaging']) =>
  state ? m.states[state] || state.replace(/_/g, ' ') : m.unknown

function stateTone({ enabled, state }: MessagingPlatformInfo): StatusTone {
  if (!enabled) {
    return 'muted'
  }

  if (state === 'connected') {
    return 'good'
  }

  if (state === 'fatal' || state === 'startup_failed') {
    return 'bad'
  }

  return 'warn'
}

/** Connected enough to open the conversation hub (vs first-time setup). */
function isLinked(platform: MessagingPlatformInfo): boolean {
  return platform.configured && platform.enabled
}

const trimEdits = (edits: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(edits)
      .map(([k, v]) => [k, v.trim()])
      .filter(([, v]) => v)
  )

const FIELD_COPY: Record<string, { advanced?: boolean }> = {
  TELEGRAM_PROXY: { advanced: true },
  DISCORD_REPLY_TO_MODE: { advanced: true },
  DISCORD_ALLOW_ALL_USERS: { advanced: true },
  BLUEBUBBLES_ALLOW_ALL_USERS: { advanced: true },
  MATTERMOST_ALLOW_ALL_USERS: { advanced: true },
  QQ_ALLOW_ALL_USERS: { advanced: true },
  WHATSAPP_ENABLED: { advanced: true },
  WHATSAPP_MODE: { advanced: true }
}

function fieldCopy(field: MessagingEnvVarInfo, m: Translations['messaging']) {
  const copy = FIELD_COPY[field.key] || {}
  const localized = m.fieldCopy[field.key] || {}

  return {
    label: localized.label || field.prompt || field.key,
    help: localized.help || field.description,
    placeholder: localized.placeholder || field.prompt,
    advanced: Boolean(copy.advanced || field.advanced || fieldBucket(field.key) === 'advanced')
  }
}

function platformDisplay(platform: MessagingPlatformInfo, m: Translations['messaging']) {
  const copy = m.platformCopy[platform.id]

  return {
    name: copy?.name || platform.name,
    desc: copy?.desc || platform.description
  }
}

function sessionsForPlatform(sessions: SessionInfo[], platformId: string): SessionInfo[] {
  const sources = new Set(sessionSourcesForPlatform(platformId))

  return sessions
    .filter(session => {
      const source = normalizeSessionSource(session.source)

      return source != null && sources.has(source)
    })
    .sort((a, b) => (b.last_active || 0) - (a.last_active || 0))
}

export function MessagingView({ setStatusbarItemGroup: _setStatusbarItemGroup, ...props }: MessagingViewProps) {
  const { t } = useI18n()
  const m = t.messaging
  const navigate = useNavigate()
  const { hash, pathname, search } = useLocation()
  const messagingSessions = useStore($messagingSessions)
  const restartGatewayAction = { label: t.commandCenter.restartGateway, onClick: () => void runGatewayRestart() }

  const [platforms, setPlatforms] = useState<MessagingPlatformInfo[] | null>(null)
  const [edits, setEdits] = useState<EditMap>({})
  const [query, setQuery] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [testing, setTesting] = useState(false)
  const [showMore, setShowMore] = useState(false)
  const [showSystem, setShowSystem] = useState(false)

  const params = useMemo(() => new URLSearchParams(search), [search])
  const selectedId = params.get('platform') || ''
  const forceSetup = params.get('view') === 'setup'

  const setRoute = useCallback(
    (platformId: string, view?: 'setup' | null) => {
      const next = new URLSearchParams(search)

      if (!platformId) {
        next.delete('platform')
        next.delete('view')
      } else {
        next.set('platform', platformId)

        if (view === 'setup') {
          next.set('view', 'setup')
        } else {
          next.delete('view')
        }
      }

      const qs = next.toString()
      navigate({ hash, pathname, search: qs ? `?${qs}` : '' }, { replace: true })
    },
    [hash, navigate, pathname, search]
  )

  const refreshPlatforms = useCallback(
    async (silent = false) => {
      if (!silent) {
        setRefreshing(true)
      }

      try {
        const result = await getMessagingPlatforms()
        setPlatforms(result.platforms)
      } catch (err) {
        if (!silent) {
          notifyError(err, m.loadFailed)
        }
      } finally {
        if (!silent) {
          setRefreshing(false)
        }
      }
    },
    [m]
  )

  useRefreshHotkey(() => void refreshPlatforms())

  useEffect(() => {
    void refreshPlatforms()
  }, [refreshPlatforms])

  useEffect(() => {
    let cancelled = false

    function tick() {
      if (cancelled || document.hidden) {
        return
      }

      void refreshPlatforms(true)
    }

    const id = window.setInterval(tick, 6000)

    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [refreshPlatforms])

  const selected = useMemo(() => {
    if (!platforms || !selectedId) {
      return null
    }

    return platforms.find(platform => platform.id === selectedId) || null
  }, [platforms, selectedId])

  const screen: Screen = useMemo(() => {
    if (!selected) {
      return 'grid'
    }

    if (forceSetup || !isLinked(selected)) {
      return 'setup'
    }

    return 'hub'
  }, [forceSetup, selected])

  const sessionCounts = useMemo(() => {
    const counts = new Map<string, number>()

    for (const platform of platforms ?? []) {
      counts.set(platform.id, sessionsForPlatform(messagingSessions, platform.id).length)
    }

    return counts
  }, [messagingSessions, platforms])

  const curated = useMemo(() => {
    if (!platforms) {
      return { featured: [] as MessagingPlatformInfo[], more: [] as MessagingPlatformInfo[], system: [] as MessagingPlatformInfo[] }
    }

    const q = normalize(query)
    const match = (platform: MessagingPlatformInfo) => {
      if (!q) {
        return true
      }

      const display = platformDisplay(platform, m)

      return [platform.id, display.name, display.desc, platform.state]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(q))
    }

    const byId = new Map(platforms.map(platform => [platform.id, platform]))
    const featured: MessagingPlatformInfo[] = []

    for (const id of FEATURED_CHANNELS) {
      const platform = byId.get(id)

      if (platform && match(platform)) {
        featured.push(platform)
      }
    }

    const featuredSet = new Set<string>(FEATURED_CHANNELS)
    const more: MessagingPlatformInfo[] = []
    const system: MessagingPlatformInfo[] = []

    for (const platform of platforms) {
      if (featuredSet.has(platform.id) || !match(platform)) {
        continue
      }

      if (isSystemChannel(platform.id)) {
        system.push(platform)
      } else {
        more.push(platform)
      }
    }

    return { featured, more, system }
  }, [m, platforms, query])

  async function handleToggle(platform: MessagingPlatformInfo, enabled: boolean) {
    setSaving(`enabled:${platform.id}`)

    try {
      await updateMessagingPlatform(platform.id, { enabled })
      setPlatforms(
        current =>
          current?.map(row =>
            row.id === platform.id
              ? {
                  ...row,
                  enabled,
                  state: enabled ? (row.configured ? 'pending_restart' : 'not_configured') : 'disabled'
                }
              : row
          ) ?? current
      )
      notify({
        kind: 'success',
        title: enabled ? m.platformEnabled(platformDisplay(platform, m).name) : m.platformDisabled(platformDisplay(platform, m).name),
        message: m.restartToApply,
        action: restartGatewayAction
      })
    } catch (err) {
      notifyError(err, m.failedUpdate(platformDisplay(platform, m).name))
    } finally {
      setSaving(null)
    }
  }

  async function handleSave(platform: MessagingPlatformInfo) {
    const env = trimEdits(edits[platform.id] || {})

    if (Object.keys(env).length === 0) {
      return
    }

    setSaving(`env:${platform.id}`)

    try {
      await updateMessagingPlatform(platform.id, { env })
      setEdits(current => ({ ...current, [platform.id]: {} }))
      await refreshPlatforms()
      notify({
        kind: 'success',
        title: m.setupSaved(platformDisplay(platform, m).name),
        message: m.restartToReconnect,
        action: restartGatewayAction
      })
    } catch (err) {
      notifyError(err, m.failedSave(platformDisplay(platform, m).name))
    } finally {
      setSaving(null)
    }
  }

  async function handleClear(platform: MessagingPlatformInfo, key: string) {
    setSaving(`clear:${key}`)

    try {
      await updateMessagingPlatform(platform.id, { clear_env: [key] })
      setEdits(current => ({
        ...current,
        [platform.id]: {
          ...(current[platform.id] || {}),
          [key]: ''
        }
      }))
      await refreshPlatforms()
      notify({
        kind: 'success',
        title: m.keyCleared(key),
        message: m.setupUpdated(platformDisplay(platform, m).name)
      })
    } catch (err) {
      notifyError(err, m.failedClear(key))
    } finally {
      setSaving(null)
    }
  }

  async function handleTest(platform: MessagingPlatformInfo) {
    setTesting(true)

    try {
      const result = await testMessagingPlatform(platform.id)
      const name = platformDisplay(platform, m).name
      const message =
        platform.id === 'whatsapp'
          ? result.ok
            ? sanitizeWhatsAppMessage(result.message, m) || result.message
            : m.testHintUnpaired
          : result.message

      notify({
        kind: result.ok ? 'success' : 'error',
        title: result.ok ? m.testOk(name) : m.testFailed(name),
        message
      })
      await refreshPlatforms(true)
    } catch (err) {
      notifyError(err, m.testFailed(platformDisplay(platform, m).name))
    } finally {
      setTesting(false)
    }
  }

  function openPlatform(platform: MessagingPlatformInfo) {
    if (isLinked(platform)) {
      setRoute(platform.id)
    } else {
      setRoute(platform.id, 'setup')
    }
  }

  const hubSessions = selected ? sessionsForPlatform(messagingSessions, selected.id) : []

  return (
    <PageSearchShell
      {...props}
      contentWidth="wide"
      onSearchChange={setQuery}
      searchHidden={screen !== 'grid' || (platforms?.length ?? 0) === 0}
      searchPlaceholder={m.search}
      searchValue={query}
      variant="customize"
    >
      {!platforms ? (
        <PageLoader label={refreshing ? m.loading : m.loading} />
      ) : (
        <div className="flex h-full min-h-0 flex-col overflow-y-auto">
          {screen === 'grid' && (
            <ChannelGrid
              featured={curated.featured}
              more={curated.more}
              onOpen={openPlatform}
              onShowMore={() => setShowMore(value => !value)}
              onShowSystem={() => setShowSystem(value => !value)}
              sessionCounts={sessionCounts}
              showMore={showMore}
              showSystem={showSystem}
              system={curated.system}
            />
          )}

          {screen === 'setup' && selected && (
            <SetupView
              edits={edits[selected.id] || {}}
              onBack={() => setRoute('')}
              onClear={key => void handleClear(selected, key)}
              onEdit={(key, value) =>
                setEdits(current => ({
                  ...current,
                  [selected.id]: {
                    ...(current[selected.id] || {}),
                    [key]: value
                  }
                }))
              }
              onSave={() => void handleSave(selected)}
              onTest={() => void handleTest(selected)}
              onToggle={enabled => void handleToggle(selected, enabled)}
              platform={selected}
              saving={saving}
              testing={testing}
            />
          )}

          {screen === 'hub' && selected && (
            <HubView
              onBack={() => setRoute('')}
              onConfigure={() => setRoute(selected.id, 'setup')}
              onOpenSession={sessionId => navigate(sessionRoute(sessionId))}
              platform={selected}
              sessions={hubSessions}
            />
          )}
        </div>
      )}
    </PageSearchShell>
  )
}

function ChannelGrid({
  featured,
  more,
  onOpen,
  onShowMore,
  onShowSystem,
  sessionCounts,
  showMore,
  showSystem,
  system
}: {
  featured: MessagingPlatformInfo[]
  more: MessagingPlatformInfo[]
  onOpen: (platform: MessagingPlatformInfo) => void
  onShowMore: () => void
  onShowSystem: () => void
  sessionCounts: Map<string, number>
  showMore: boolean
  showSystem: boolean
  system: MessagingPlatformInfo[]
}) {
  const { t } = useI18n()
  const m = t.messaging

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="space-y-1">
        <h2 className="text-lg font-semibold tracking-tight">{m.title}</h2>
        <p className="max-w-xl text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {m.subtitle}
        </p>
      </header>

      <section className="space-y-3">
        <h3 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{m.featured}</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {featured.map(platform => (
            <ChannelCard
              count={sessionCounts.get(platform.id) ?? 0}
              key={platform.id}
              onOpen={() => onOpen(platform)}
              platform={platform}
            />
          ))}
        </div>
      </section>

      {more.length > 0 && (
        <section className="space-y-3">
          <button
            className="text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={onShowMore}
            type="button"
          >
            {showMore ? m.showLess : m.showMore}
            {showMore ? '' : ` · ${m.moreChannels}`}
          </button>
          {showMore && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {more.map(platform => (
                <ChannelCard
                  count={sessionCounts.get(platform.id) ?? 0}
                  key={platform.id}
                  onOpen={() => onOpen(platform)}
                  platform={platform}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {system.length > 0 && (
        <section className="space-y-3">
          <button
            className="text-[0.8125rem] font-medium text-muted-foreground transition-colors hover:text-foreground"
            onClick={onShowSystem}
            type="button"
          >
            {m.systemChannels}
          </button>
          {showSystem && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {system.map(platform => (
                <ChannelCard
                  count={sessionCounts.get(platform.id) ?? 0}
                  key={platform.id}
                  onOpen={() => onOpen(platform)}
                  platform={platform}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function ChannelCard({
  count,
  onOpen,
  platform
}: {
  count: number
  onOpen: () => void
  platform: MessagingPlatformInfo
}) {
  const { t } = useI18n()
  const m = t.messaging
  const display = platformDisplay(platform, m)
  const linked = isLinked(platform)
  // Card face: Connect is always muted. Warn/amber was leaking for platforms
  // that are enabled but not yet connected (e.g. WhatsApp bridge on, QR pending).
  const failed = platform.state === 'fatal' || platform.state === 'startup_failed'
  const tone: StatusTone = linked ? 'good' : failed ? 'bad' : 'muted'
  const statusLabel = linked ? m.connected : failed ? stateLabel(platform.state, m) : m.needsLink

  return (
    <button
      className="relative flex w-full flex-col gap-3 rounded-xl border border-border bg-background p-4 text-left transition-colors hover:bg-muted/40"
      onClick={onOpen}
      type="button"
    >
      {linked && count > 0 && (
        <span className="absolute right-3 top-3 inline-flex min-w-5 items-center justify-center rounded-full bg-muted px-1.5 text-[0.65rem] font-medium text-muted-foreground">
          {count}
        </span>
      )}
      <div className="flex items-start gap-3 pr-6">
        <PlatformAvatar platformId={platform.id} platformName={display.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[0.9375rem] font-semibold tracking-tight">{display.name}</span>
            <StatePill tone={tone}>{statusLabel}</StatePill>
          </div>
          <p className="mt-1 line-clamp-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {display.desc}
          </p>
        </div>
      </div>
    </button>
  )
}

function SetupView({
  edits,
  onBack,
  onClear,
  onEdit,
  onSave,
  onTest,
  onToggle,
  platform,
  saving,
  testing
}: {
  edits: Record<string, string>
  onBack: () => void
  onClear: (key: string) => void
  onEdit: (key: string, value: string) => void
  onSave: () => void
  onTest: () => void
  onToggle: (enabled: boolean) => void
  platform: MessagingPlatformInfo
  saving: string | null
  testing: boolean
}) {
  const { t } = useI18n()
  const m = t.messaging
  const display = platformDisplay(platform, m)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const hasEdits = Object.keys(trimEdits(edits)).length > 0
  const isSavingEnv = saving === `env:${platform.id}`

  const connectFields = platform.env_vars.filter(field => {
    const bucket = fieldBucket(field.key)

    return bucket === 'connect' && !fieldCopy(field, m).advanced
  })
  const whoFields = platform.env_vars.filter(field => fieldBucket(field.key) === 'who')
  const homeFields = platform.env_vars.filter(field => fieldBucket(field.key) === 'home')
  const advancedFields = platform.env_vars.filter(field => {
    const bucket = fieldBucket(field.key)

    return bucket === 'advanced' || (bucket === 'connect' && fieldCopy(field, m).advanced)
  })

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={onBack} size="sm" variant="ghost">
          <ChevronLeft className="size-4" />
          {m.backToChannels}
        </Button>
      </div>

      <header className="flex items-start gap-3">
        <PlatformAvatar platformId={platform.id} platformName={display.name} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 truncate text-[0.9375rem] font-semibold tracking-tight">{display.name}</h3>
            <StatePill tone={stateTone(platform)}>{stateLabel(platform.state, m)}</StatePill>
            {!platform.gateway_running && <SetupPill>{m.gatewayStopped}</SetupPill>}
          </div>
          <p className="mt-1 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {display.desc}
          </p>
          <PlatformHint platform={platform} />
        </div>
      </header>

      <PlatformNotice platformId={platform.id} />

      {platform.error_message && (
        <ErrorBanner>{sanitizeWhatsAppMessage(platform.error_message, m)}</ErrorBanner>
      )}

      <section className="space-y-3">
        <SectionTitle>{m.sectionConnect}</SectionTitle>
        <ConnectRitual m={m} platform={platform} />
        <div className="grid gap-1">
          {connectFields.map(field => (
            <MessagingField
              edits={edits}
              field={field}
              key={field.key}
              onClear={onClear}
              onEdit={onEdit}
              saving={saving}
            />
          ))}
        </div>
      </section>

      {whoFields.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>{m.sectionWho}</SectionTitle>
          <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {m.sectionWhoHint}
          </p>
          <div className="grid gap-1">
            {whoFields.map(field => (
              <MessagingField
                edits={edits}
                field={field}
                key={field.key}
                onClear={onClear}
                onEdit={onEdit}
                saving={saving}
              />
            ))}
          </div>
        </section>
      )}

      {homeFields.length > 0 && (
        <section className="space-y-3">
          <SectionTitle>{m.sectionHome}</SectionTitle>
          <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
            {m.sectionHomeHint}
          </p>
          {platform.home_channel && (
            <p className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)">
              {platform.home_channel.name || platform.home_channel.chat_id}
            </p>
          )}
          <div className="grid gap-1">
            {homeFields.map(field => (
              <MessagingField
                edits={edits}
                field={field}
                key={field.key}
                onClear={onClear}
                onEdit={onEdit}
                saving={saving}
              />
            ))}
          </div>
        </section>
      )}

      {advancedFields.length > 0 && (
        <section>
          <button
            className="flex w-full items-center justify-between gap-2 py-0.5 text-left text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground transition-colors hover:text-foreground"
            onClick={() => setShowAdvanced(value => !value)}
            type="button"
          >
            <span>{m.advanced(advancedFields.length)}</span>
            <DisclosureCaret open={showAdvanced} size="0.875rem" />
          </button>
          {showAdvanced && (
            <div className="mt-3 grid gap-1">
              {advancedFields.map(field => (
                <MessagingField
                  edits={edits}
                  field={field}
                  key={field.key}
                  onClear={onClear}
                  onEdit={onEdit}
                  saving={saving}
                />
              ))}
            </div>
          )}
        </section>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
        <Switch
          aria-label={platform.enabled ? m.disableAria(display.name) : m.enableAria(display.name)}
          checked={platform.enabled}
          disabled={saving === `enabled:${platform.id}`}
          onCheckedChange={onToggle}
          size="xs"
        />
        <span className="text-[length:var(--conversation-caption-font-size)] text-(--ui-text-secondary)">
          {platform.enabled ? m.enabled : m.disabled}
        </span>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {hasEdits && <span className="text-xs text-muted-foreground">{m.unsavedChanges}</span>}
          <Button disabled={testing} onClick={onTest} size="sm" variant="outline">
            {testing ? m.testing : m.test}
          </Button>
          <Button disabled={!hasEdits || isSavingEnv} onClick={onSave} size="sm">
            <Save />
            {isSavingEnv ? m.saving : m.saveChanges}
          </Button>
        </div>
      </div>
    </div>
  )
}

function HubView({
  onBack,
  onConfigure,
  onOpenSession,
  platform,
  sessions
}: {
  onBack: () => void
  onConfigure: () => void
  onOpenSession: (sessionId: string) => void
  platform: MessagingPlatformInfo
  sessions: SessionInfo[]
}) {
  const { t } = useI18n()
  const m = t.messaging
  const r = t.sidebar.row
  const display = platformDisplay(platform, m)

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-col gap-4 border-b border-border p-6">
        <Button className="w-fit" onClick={onBack} size="sm" variant="ghost">
          <ChevronLeft className="size-4" />
          {m.backToChannels}
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <PlatformAvatar platformId={platform.id} platformName={display.name} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="truncate text-[0.9375rem] font-semibold tracking-tight">{display.name}</h3>
                <StatePill tone="good">{m.connected}</StatePill>
              </div>
              <p className="mt-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                {m.conversationsCount(sessions.length)}
              </p>
            </div>
          </div>
          <Button onClick={onConfigure} size="sm" variant="outline">
            {m.configure}
          </Button>
        </div>
        <PlatformNotice platformId={platform.id} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-2">
        {sessions.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-[0.9375rem] font-medium">{m.conversationsEmpty}</p>
            <p className="mt-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
              {m.conversationsEmptyHint}
            </p>
          </div>
        ) : (
          <ul className="space-y-0.5">
            {sessions.map(session => {
              const title = sessionTitle(session)
              const age = formatAge(session.last_active || session.started_at, r)

              return (
                <li key={session.id}>
                  <button
                    className="row-hover flex w-full items-start gap-3 rounded-md px-3 py-2.5 text-left hover:bg-muted/50"
                    onClick={() => onOpenSession(session.id)}
                    type="button"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="truncate text-[length:var(--conversation-text-font-size)] font-medium">
                          {title}
                        </span>
                        <span className="shrink-0 text-[0.65rem] text-(--ui-text-tertiary)">{age}</span>
                      </div>
                      {session.preview && (
                        <p className="mt-0.5 line-clamp-1 text-[length:var(--conversation-caption-font-size)] text-(--ui-text-tertiary)">
                          {session.preview}
                        </p>
                      )}
                    </div>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

const AGE_KEY = { day: 'ageDay', hour: 'ageHour', minute: 'ageMin' } as const

function formatAge(seconds: number, r: Translations['sidebar']['row']): string {
  const { unit, value } = coarseElapsed(Date.now() - seconds * 1000)

  return unit === 'second' ? r.ageNow : `${value}${r[AGE_KEY[unit]]}`
}

const PLATFORM_INTRO: Record<string, string> = {
  telegram:
    'In Telegram, talk to @BotFather, run /newbot, and copy the token it gives you. Then grab your numeric user ID from @userinfobot.',
  discord:
    'Open the Discord Developer Portal, create an application, add a Bot, then copy its token. Invite the bot to your server with the right scopes.',
  slack:
    'Create a Slack app, enable Socket Mode, install it to your workspace, then copy the bot token and app-level token.',
  mattermost:
    'On your Mattermost server, create a bot account or personal access token, then paste the server URL and token here.',
  matrix: 'Sign in to your homeserver with the bot account, then copy the access token, user ID, and homeserver URL.',
  signal:
    'Run a signal-cli REST bridge somewhere reachable, then point Work4You at the URL and the registered phone number.',
  whatsapp:
    'Start the WhatsApp bridge that ships with Work4You, scan the QR code on first run, then enable the platform.',
  bluebubbles:
    'Run BlueBubbles Server on a Mac with iMessage, expose its API, then point Work4You at the URL with the server password.',
  homeassistant:
    'In Home Assistant, open your profile and create a long-lived access token. Paste it here along with your HA URL.',
  email:
    'Use a dedicated mailbox. For Gmail/Workspace, create an app password and use imap.gmail.com / smtp.gmail.com.',
  sms: 'Get your Twilio Account SID and Auth Token from the Twilio console, plus a phone number that can send SMS.',
  dingtalk: 'Create a DingTalk app in the developer console, then copy the Client ID (App key) and Client Secret here.',
  feishu:
    'Create a Feishu / Lark app, configure the bot capability, and copy the App ID, App secret, and event encryption keys.',
  wecom:
    'Add a group robot in WeCom and copy its webhook key as WECOM_BOT_ID. Send-only — use the WeCom (app) option for two-way.',
  wecom_callback:
    'Set up a WeCom self-built app, expose its callback URL, and provide the corp ID, secret, agent ID, and AES key.',
  weixin:
    "Run `work4you gateway setup`, select Weixin, then scan and confirm the QR code with a personal WeChat account. Work4You connects through Tencent's iLink Bot API and saves the credentials.",
  qqbot: 'Register an app on the QQ Open Platform (q.qq.com) and copy the App ID and Client Secret.',
  api_server:
    'Expose Work4You as an OpenAI-compatible API. Set an auth key, then point Open WebUI / LobeChat / etc. at the host:port.',
  webhook:
    'Run an HTTP server that other tools (GitHub, GitLab, custom apps) can POST to. Use the secret to verify signatures.'
}

const introCopy = (platform: MessagingPlatformInfo, m: Translations['messaging']) =>
  m.platformIntro[platform.id] || PLATFORM_INTRO[platform.id] || platformDisplay(platform, m).desc

function MessagingField({
  edits,
  field,
  onClear,
  onEdit,
  saving
}: {
  edits: Record<string, string>
  field: MessagingEnvVarInfo
  onClear: (key: string) => void
  onEdit: (key: string, value: string) => void
  saving: string | null
}) {
  const { t } = useI18n()
  const m = t.messaging
  const copy = fieldCopy(field, m)
  const fieldId = `messaging-field-${field.key}`

  return (
    <ListRow
      action={
        <div className="flex items-center gap-2">
          <Input
            className={CREDENTIAL_CONTROL_CLASS}
            id={fieldId}
            onChange={event => onEdit(field.key, event.target.value)}
            placeholder={field.is_set ? field.redacted_value || m.replaceValue : copy.placeholder}
            type={field.is_password ? 'password' : 'text'}
            value={edits[field.key] || ''}
          />
          {field.url && (
            <Button asChild className="size-8 shrink-0" title={m.openDocs} variant="ghost">
              <a href={field.url} rel="noreferrer" target="_blank">
                <ExternalLink className="size-3.5" />
              </a>
            </Button>
          )}
          {field.is_set && (
            <Button
              className="size-8 shrink-0"
              disabled={saving === `clear:${field.key}`}
              onClick={() => onClear(field.key)}
              title={m.clearField(field.key)}
              variant="ghost"
            >
              <Trash2 className="size-3.5" />
            </Button>
          )}
        </div>
      }
      description={copy.help}
      title={
        <span className="flex flex-wrap items-center gap-2">
          <label htmlFor={fieldId}>{copy.label}</label>
          {field.is_set && <span className="text-[0.66rem] font-medium text-primary">{m.saved}</span>}
        </span>
      }
    />
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h4 className="text-[0.7rem] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{children}</h4>
}

/** Product docs — never third-party GitHub (whatsmeow) on the WhatsApp face. */
const WORK4YOU_DOCS_URL = 'https://work4you.ai/docs'

function sanitizeWhatsAppMessage(message: null | string | undefined, m: Translations['messaging']): string {
  if (!message) {
    return ''
  }

  if (/not paired|wayne whatsapp|creds\.json/i.test(message)) {
    return m.whatsappUnpairedError
  }

  return sanitizeProductCopy(message)
}

function setupDocsFor(platform: MessagingPlatformInfo): { href: string; labelKey: 'openProductDocs' | 'openSetupGuide' } | null {
  if (platform.id === 'whatsapp') {
    return { href: WORK4YOU_DOCS_URL, labelKey: 'openProductDocs' }
  }

  if (!platform.docs_url) {
    return null
  }

  return { href: platform.docs_url, labelKey: 'openSetupGuide' }
}

function ConnectRitual({ m, platform }: { m: Translations['messaging']; platform: MessagingPlatformInfo }) {
  const docs = setupDocsFor(platform)

  return (
    <div className="space-y-3">
      <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
        {introCopy(platform, m)}
      </p>
      {docs && (
        <Button asChild size="sm" variant="textStrong">
          <a
            href={docs.href}
            onClick={event => {
              event.preventDefault()
              openExternalLink(docs.href)
            }}
            rel="noreferrer"
            target="_blank"
          >
            {m[docs.labelKey]}
            <ExternalLink className="size-3.5" />
          </a>
        </Button>
      )}
      {platform.env_vars.filter(field => fieldBucket(field.key) === 'connect' && !fieldCopy(field, m).advanced)
        .length === 0 && (
        <p className="text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {m.noTokenNeeded}
        </p>
      )}
    </div>
  )
}

function PlatformHint({ platform }: { platform: MessagingPlatformInfo }) {
  const { t } = useI18n()

  if (!platform.enabled || platform.state === 'connected') {
    return null
  }

  const hint =
    platform.state === 'pending_restart'
      ? t.messaging.hintPendingRestart
      : platform.gateway_running
        ? null
        : t.messaging.hintGatewayStopped

  return hint ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{hint}</p> : null
}

function PlatformNotice({ platformId }: { platformId: string }) {
  const { t } = useI18n()
  const notice = t.messaging.platformNotice?.[platformId]

  if (!notice) {
    return null
  }

  return (
    <aside
      className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3.5 py-3 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height)"
      role="note"
    >
      <p className="font-semibold text-amber-800 dark:text-amber-200">{notice.title}</p>
      <p className="mt-1 text-amber-900/80 dark:text-amber-100/80">{notice.body}</p>
    </aside>
  )
}

function StatePill({ children, tone }: { children: string; tone: StatusTone }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[0.66rem] font-medium',
        PILL_TONE[tone]
      )}
    >
      <StatusDot tone={tone} />
      {children}
    </span>
  )
}

function SetupPill({ children }: { children: string }) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[0.66rem] font-medium', PILL_TONE.muted)}>
      {children}
    </span>
  )
}
