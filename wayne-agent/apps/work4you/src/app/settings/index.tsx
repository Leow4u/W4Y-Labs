import { useEffect, useRef, type ChangeEvent } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'

import { codiconIcon } from '@/components/ui/codicon'
import { Tip } from '@/components/ui/tooltip'
import { getHermesConfigDefaults, getHermesConfigRecord, saveHermesConfig } from '@/hermes'
import { useI18n } from '@/i18n'
import { triggerHaptic } from '@/lib/haptics'
import { Bell, Download, Info, RefreshCw, Settings2, Upload } from '@/lib/icons'
import { notify, notifyError } from '@/store/notifications'
import { setSidebarArchivedOpen, setSidebarOpen } from '@/store/layout'

import { setHermesConfigCache } from '../hooks/use-config-record'
import { useRouteEnumParam } from '../hooks/use-route-enum-param'
import { OverlayIconButton } from '../overlays/overlay-chrome'
import { OverlayMain, OverlayNav, type OverlayNavGroup, OverlaySplitLayout } from '../overlays/overlay-split-layout'
import { OverlayView } from '../overlays/overlay-view'
import { NEW_CHAT_ROUTE, SKILLS_ROUTE } from '../routes'
import { prefetchSettingsData } from '../view-prefetch'

import { AboutSettings } from './about-settings'
import { AccountSettings } from './account-settings'
import { AdvancedSettings } from './advanced-settings'
import { AppearanceSettings } from './appearance-settings'
import { BrowserNetworkSettings } from './browser-network-settings'
import { ConfigSettings } from './config-settings'
import { SECTIONS } from './constants'
import { GatewaySettings } from './gateway-settings'
import { GeneralSettings } from './general-settings'
import { KEYS_VIEWS, KeysSettings, type KeysView } from './keys-settings'
import { MemorySettings } from './memory-settings'
import { ModelsSettings } from './models-settings'
import { NotificationsSettings } from './notifications-settings'
import { PROVIDER_VIEWS, ProvidersSettings, type ProviderView } from './providers-settings'
import type { SettingsPageProps, SettingsView as SettingsViewId } from './types'
import { VoiceSettings } from './voice-settings'

const accountNavIcon = codiconIcon('account')

const SETTINGS_VIEWS: readonly SettingsViewId[] = [
  'general',
  'account',
  ...SECTIONS.map(s => `config:${s.id}` as SettingsViewId),
  'providers',
  'gateway',
  'keys',
  'notifications',
  'about'
]

function sectionById(id: string) {
  return SECTIONS.find(s => s.id === id)
}

export function SettingsView({ onClose, onConfigSaved, onMainModelChanged }: SettingsPageProps) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const { search } = useLocation()

  // Legacy `/settings?tab=mcp` → Personalizar MCP tab.
  // Archived chats moved to the sidebar — old `?tab=sessions` opens that section.
  useEffect(() => {
    const params = new URLSearchParams(search)
    const tab = params.get('tab')

    if (tab === 'mcp') {
      navigate(`${SKILLS_ROUTE}?tab=mcp`, { replace: true })
      return
    }

    if (tab === 'sessions') {
      setSidebarOpen(true)
      setSidebarArchivedOpen(true)
      onClose()
      navigate(NEW_CHAT_ROUTE, { replace: true })
    }
  }, [navigate, onClose, search])

  // Warm config/schema/models as soon as Settings is open (covers Cmd+, with no hover).
  useEffect(() => {
    prefetchSettingsData()
  }, [])

  const [activeView, setActiveView] = useRouteEnumParam('tab', SETTINGS_VIEWS, 'general' as SettingsViewId)
  // Providers / Tools & Keys / Gateway kept for deep links — not in the primary nav.
  const [providerView, setProviderView] = useRouteEnumParam<ProviderView>('pview', PROVIDER_VIEWS, 'accounts')
  const [keysView] = useRouteEnumParam<KeysView>('kview', KEYS_VIEWS, 'tools')

  const importInputRef = useRef<HTMLInputElement | null>(null)

  const exportConfig = async () => {
    try {
      const cfg = await getHermesConfigRecord()
      const blob = new Blob([JSON.stringify(cfg, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'work4you-config.json'
      a.click()
      URL.revokeObjectURL(url)
      triggerHaptic('success')
    } catch (err) {
      notifyError(err, t.settings.exportFailed)
    }
  }

  const resetConfig = async () => {
    if (!window.confirm(t.settings.resetConfirm)) {
      return
    }

    try {
      const defaults = await getHermesConfigDefaults()
      await saveHermesConfig(defaults)
      setHermesConfigCache(defaults)
      triggerHaptic('success')
      onConfigSaved?.()
    } catch (err) {
      notifyError(err, t.settings.resetFailed)
    }
  }

  const handleImport = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = () => {
      void (async () => {
        try {
          const next = JSON.parse(String(reader.result)) as Awaited<ReturnType<typeof getHermesConfigRecord>>
          await saveHermesConfig(next)
          setHermesConfigCache(next)
          notify({ kind: 'success', title: t.settings.config.imported, message: t.common.saving })
          onConfigSaved?.()
          triggerHaptic('success')
        } catch (err) {
          notifyError(err, t.settings.config.invalidJson)
        }
      })()
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const configNav = (id: string, gapBefore = false): OverlayNavGroup | null => {
    const section = sectionById(id)
    if (!section) return null
    const view = `config:${id}` as SettingsViewId
    return {
      active: activeView === view,
      gapBefore,
      icon: section.icon,
      id: view,
      label: t.settings.sections[id] ?? section.label,
      onSelect: () => setActiveView(view)
    }
  }

  // Primary-nav order with light gaps (Cursor-style) — no group headers.
  // Conta = Work4You profile + Plan & Usage. Providers OAuth face and Gateway
  // Connection are off-nav (deep links `?tab=providers` / `?tab=gateway` still
  // work for power users — Local gateway is the default and needs no UI).
  // Tools & Keys / Advanced / Archived chats stay off the primary nav.
  const navGroups: OverlayNavGroup[] = [
    {
      active: activeView === 'general',
      icon: Settings2,
      id: 'general',
      label: t.settings.nav.general,
      onSelect: () => setActiveView('general')
    },
    {
      active: activeView === 'account',
      icon: accountNavIcon,
      id: 'account',
      label: t.settings.nav.account,
      onSelect: () => setActiveView('account')
    },
    configNav('appearance'),
    configNav('voice'),
    {
      active: activeView === 'notifications',
      icon: Bell,
      id: 'notifications',
      label: t.settings.nav.notifications,
      onSelect: () => setActiveView('notifications')
    },
    configNav('browser-network', true),
    configNav('memory'),
    configNav('model'),
    {
      active: activeView === 'about',
      gapBefore: true,
      icon: Info,
      id: 'about',
      label: t.settings.nav.about,
      onSelect: () => setActiveView('about')
    }
  ].filter((group): group is OverlayNavGroup => group != null)

  const navFooter = (
    <>
      <Tip label={t.settings.exportConfig}>
        <OverlayIconButton onClick={() => void exportConfig()}>
          <Download />
        </OverlayIconButton>
      </Tip>
      <Tip label={t.settings.importConfig}>
        <OverlayIconButton
          onClick={() => {
            triggerHaptic('open')
            importInputRef.current?.click()
          }}
        >
          <Upload />
        </OverlayIconButton>
      </Tip>
      <Tip label={t.settings.resetToDefaults}>
        <OverlayIconButton
          className="hover:text-destructive"
          onClick={() => {
            triggerHaptic('warning')
            void resetConfig()
          }}
        >
          <RefreshCw />
        </OverlayIconButton>
      </Tip>
    </>
  )

  return (
    <OverlayView closeLabel={t.settings.closeSettings} onClose={onClose}>
      <OverlaySplitLayout>
        <OverlayNav footer={navFooter} groups={navGroups} />

        <OverlayMain className="px-0 pb-0">
          {activeView === 'general' ? (
            <GeneralSettings
              onConfigSaved={onConfigSaved}
              onOpenAbout={() => setActiveView('about')}
              onOpenNotifications={() => setActiveView('notifications')}
            />
          ) : activeView === 'account' ? (
            <AccountSettings />
          ) : activeView === 'config:appearance' ? (
            <AppearanceSettings />
          ) : activeView === 'config:voice' ? (
            <VoiceSettings onConfigSaved={onConfigSaved} />
          ) : activeView === 'config:browser-network' ? (
            <BrowserNetworkSettings onConfigSaved={onConfigSaved} />
          ) : activeView === 'config:memory' ? (
            <MemorySettings onConfigSaved={onConfigSaved} />
          ) : activeView === 'config:model' ? (
            <ModelsSettings onConfigSaved={onConfigSaved} onMainModelChanged={onMainModelChanged} />
          ) : activeView === 'config:advanced' ? (
            <AdvancedSettings onConfigSaved={onConfigSaved} />
          ) : activeView === 'about' ? (
            <AboutSettings onConfigSaved={onConfigSaved} />
          ) : activeView === 'gateway' ? (
            <GatewaySettings />
          ) : activeView.startsWith('config:') ? (
            <ConfigSettings
              activeSectionId={activeView.slice('config:'.length)}
              importInputRef={importInputRef}
              onConfigSaved={onConfigSaved}
            />
          ) : activeView === 'providers' ? (
            <ProvidersSettings onClose={onClose} onViewChange={setProviderView} view={providerView} />
          ) : activeView === 'keys' ? (
            <KeysSettings view={keysView} />
          ) : (
            <NotificationsSettings />
          )}

          <input
            accept=".json,application/json"
            className="hidden"
            onChange={handleImport}
            ref={importInputRef}
            type="file"
          />
        </OverlayMain>
      </OverlaySplitLayout>
    </OverlayView>
  )
}

export { SettingsView as SettingsPage }
