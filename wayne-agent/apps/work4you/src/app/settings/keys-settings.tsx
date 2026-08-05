import { useEffect, useMemo, useState } from 'react'

import { useI18n } from '@/i18n'
import { normalize } from '@/lib/text'
import type { EnvVarInfo } from '@/types/hermes'

import { CredentialKeyCard, credentialPlaceholder, credentialRowLabel } from './credential-key-ui'
import { useEnvCredentials } from './env-credentials'
import { asText, includesQuery } from './helpers'
import { LoadingState, SettingsContent, SettingsGroup, SettingsPageTitle } from './primitives'

// Sub-views surfaced as sidebar subnav under Tools & Keys (see settings/index.tsx).
export const KEYS_VIEWS = ['tools', 'settings'] as const

export type KeysView = (typeof KEYS_VIEWS)[number]

// Providers live on their own page; messaging credentials (`channel_managed`)
// and Work4You cloud-injected credentials (`platform_managed`) are hidden here.
// This view covers tool API keys plus server/setting env vars (API server,
// webhook, gateway), which fold into the Settings subnav.

// Backend categories that surface under each subnav. Platform credentials use the
// `messaging` category but are flagged ``channel_managed`` and configured on
// the Messaging page; only gateway-wide ``messaging`` rows (e.g. GATEWAY_PROXY)
// appear here alongside ``setting``.
const VIEW_CATEGORIES: Record<KeysView, readonly string[]> = {
  settings: ['setting', 'messaging'],
  tools: ['tool']
}

type ToolTheme =
  | 'search'
  | 'browser'
  | 'media'
  | 'memory'
  | 'skills'
  | 'observability'
  | 'advanced'
  | 'other'

type SettingsTheme = 'gateway' | 'agent' | 'channels' | 'other'

const TOOL_THEME_ORDER: ToolTheme[] = [
  'search',
  'browser',
  'media',
  'memory',
  'skills',
  'observability',
  'other',
  'advanced'
]

const SETTINGS_THEME_ORDER: SettingsTheme[] = ['gateway', 'agent', 'channels', 'other']

function toolThemeFor(key: string, info: EnvVarInfo): ToolTheme {
  if (info.advanced || key.startsWith('TOOL_GATEWAY') || key === 'FIRECRAWL_GATEWAY_URL') {
    return 'advanced'
  }

  const tools = info.tools ?? []

  if (
    tools.some(t => t === 'web_search' || t === 'web_extract') ||
    /^(EXA_|PARALLEL_|FIRECRAWL_|TAVILY_|SEARXNG_|BRAVE_)/.test(key)
  ) {
    return 'search'
  }

  if (
    tools.some(t => t.startsWith('browser_')) ||
    /^(BROWSER|CAMOFOX|AGENT_BROWSER)/.test(key)
  ) {
    return 'browser'
  }

  if (
    tools.some(t => /^(image_|video_|voice_|openai_tts|elevenlabs)/.test(t)) ||
    /^(FAL_|KREA_|ELEVENLABS_|VOICE_TOOLS_|MISTRAL_)/.test(key)
  ) {
    return 'media'
  }

  if (
    /^(HONCHO_|HINDSIGHT_|SUPERMEMORY_|MEM0_|RETAINDB_|BRV_|OPENVIKING_)/.test(key) ||
    tools.some(t => /honcho|hindsight|supermemory|mem0|retaindb|brv_|viking/.test(t))
  ) {
    return 'memory'
  }

  if (key === 'GITHUB_TOKEN') {
    return 'skills'
  }

  if (key.includes('LANGFUSE')) {
    return 'observability'
  }

  return 'other'
}

function settingsThemeFor(key: string): SettingsTheme {
  if (/^(GATEWAY_|API_SERVER_|WEBHOOK_)/.test(key)) {
    return 'gateway'
  }

  if (
    key === 'SUDO_PASSWORD' ||
    // WORK4YOU_* is the public env spelling; WAYNE_* is the legacy one the
    // engine still reads internally — both land in the same settings group.
    key.startsWith('WORK4YOU_') ||
    key.startsWith('WORK4YOU_') ||
    key.startsWith('WAYNE_') ||
    key === 'RAFT_PROFILE' ||
    key.startsWith('TERMINAL_')
  ) {
    return 'agent'
  }

  // Leftover messaging knobs that aren't channel_managed (platform allow-lists,
  // home channels, etc.) — keep visible, just grouped.
  if (
    /^(SMS_|WECOM_|TELEGRAM_|DISCORD_|SLACK_|WHATSAPP_|SIGNAL_|MATRIX_|FEISHU_|DINGTALK_|BLUEBUBBLES_|QQ_|WEIXIN_|YUANBAO_|EMAIL_|TWILIO_)/.test(
      key
    )
  ) {
    return 'channels'
  }

  return 'other'
}

function matchesQuery(key: string, info: EnvVarInfo, label: string, q: string): boolean {
  if (!q) {
    return true
  }

  return (
    key.toLowerCase().includes(q) ||
    label.toLowerCase().includes(q) ||
    includesQuery(info.description, q) ||
    includesQuery(info.prompt, q)
  )
}

export function KeysSettings({ view }: KeysSettingsProps) {
  const { t } = useI18n()
  const copy = t.settings.keys
  const { rowProps, vars } = useEnvCredentials()
  const [openKey, setOpenKey] = useState<null | string>(null)
  const [query, setQuery] = useState('')

  useEffect(() => {
    setOpenKey(null)
    setQuery('')
  }, [view])

  const entries = useMemo(() => {
    if (!vars) {
      return [] as [string, EnvVarInfo][]
    }

    const cats = VIEW_CATEGORIES[view]
    const q = normalize(query)

    return Object.entries(vars)
      .filter(
        ([, info]) =>
          !info.channel_managed &&
          !info.platform_managed &&
          cats.includes(asText(info.category))
      )
      .filter(([key, info]) => matchesQuery(key, info, credentialRowLabel(key, info), q))
      .sort(([a], [b]) => a.localeCompare(b))
  }, [query, vars, view])

  const themedGroups = useMemo(() => {
    if (view === 'tools') {
      const buckets = new Map<ToolTheme, [string, EnvVarInfo][]>()
      for (const entry of entries) {
        const theme = toolThemeFor(entry[0], entry[1])
        const list = buckets.get(theme) ?? []
        list.push(entry)
        buckets.set(theme, list)
      }

      return TOOL_THEME_ORDER.filter(id => (buckets.get(id)?.length ?? 0) > 0).map(id => ({
        id,
        title: copy.groups[id],
        entries: buckets.get(id)!
      }))
    }

    const buckets = new Map<SettingsTheme, [string, EnvVarInfo][]>()
    for (const entry of entries) {
      const theme = settingsThemeFor(entry[0])
      const list = buckets.get(theme) ?? []
      list.push(entry)
      buckets.set(theme, list)
    }

    return SETTINGS_THEME_ORDER.filter(id => (buckets.get(id)?.length ?? 0) > 0).map(id => ({
      id,
      title: copy.groups[id],
      entries: buckets.get(id)!
    }))
  }, [copy.groups, entries, view])

  if (!vars) {
    return <LoadingState label={copy.loading} />
  }

  const title = view === 'tools' ? copy.toolsTitle : copy.settingsTitle
  const intro = view === 'tools' ? copy.toolsIntro : copy.settingsIntro

  return (
    <SettingsContent>
      <div className="mx-auto w-full max-w-2xl pt-1">
        <SettingsPageTitle title={title} />
        <p className="mb-4 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
          {intro}
        </p>

        <div className="mb-4">
          <input
            className="h-9 w-full rounded-lg border border-(--ui-stroke-tertiary)/80 bg-(--ui-bg-tertiary)/50 px-3 text-[length:var(--conversation-text-font-size)] text-foreground placeholder:text-(--ui-text-tertiary) focus:outline-none focus:ring-1 focus:ring-primary/40"
            onChange={e => setQuery(e.target.value)}
            placeholder={copy.search}
            type="search"
            value={query}
          />
        </div>

        {themedGroups.map(group => (
          <SettingsGroup key={group.id} title={group.title}>
            {group.entries.map(([key, info]) => {
              const label = credentialRowLabel(key, info)

              return (
                <CredentialKeyCard
                  expanded={openKey === key}
                  info={info}
                  inset
                  key={key}
                  label={label}
                  onExpand={() => setOpenKey(key)}
                  onToggle={() => setOpenKey(prev => (prev === key ? null : key))}
                  placeholder={credentialPlaceholder(key, info, label)}
                  rowProps={rowProps}
                  varKey={key}
                />
              )
            })}
          </SettingsGroup>
        ))}

        {themedGroups.length === 0 && (
          <div className="rounded-xl border border-dashed border-(--ui-stroke-tertiary) px-4 py-8 text-center text-[length:var(--conversation-caption-font-size)] text-muted-foreground">
            {copy.empty}
          </div>
        )}
      </div>
    </SettingsContent>
  )
}

interface KeysSettingsProps {
  view: KeysView
}
