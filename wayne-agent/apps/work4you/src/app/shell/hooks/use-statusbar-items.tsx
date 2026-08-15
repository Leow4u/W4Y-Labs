import { useEffect, useMemo, useRef } from 'react'

import type { CommandCenterSection } from '@/app/command-center'
import { useI18n } from '@/i18n'
import type { RuntimeReadinessResult } from '@/lib/runtime-readiness'
import { $desktopBoot } from '@/store/boot'
import { shouldSuppressGatewayOfflineToast } from '@/store/gateway'
import { notifyError } from '@/store/notifications'
import { $updateApply } from '@/store/updates'
import type { StatusResponse } from '@/types/hermes'

import type { StatusbarItem } from '../statusbar-controls'

interface StatusbarItemsOptions {
  agentsOpen: boolean
  chatOpen: boolean
  commandCenterOpen: boolean
  extraLeftItems: readonly StatusbarItem[]
  extraRightItems: readonly StatusbarItem[]
  gatewayState: string
  inferenceStatus: RuntimeReadinessResult | null
  openAgents: () => void
  openCommandCenterSection: (section: CommandCenterSection) => void
  freshDraftReady: boolean
  requestGateway: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>
  statusSnapshot: StatusResponse | null
  toggleCommandCenter: () => void
}

export function useStatusbarItems({
  agentsOpen: _agentsOpen,
  chatOpen: _chatOpen,
  commandCenterOpen: _commandCenterOpen,
  extraLeftItems,
  extraRightItems,
  gatewayState,
  inferenceStatus: _inferenceStatus,
  openAgents: _openAgents,
  openCommandCenterSection: _openCommandCenterSection,
  freshDraftReady: _freshDraftReady,
  requestGateway: _requestGateway,
  statusSnapshot: _statusSnapshot,
  toggleCommandCenter: _toggleCommandCenter
}: StatusbarItemsOptions) {
  const { t } = useI18n()
  const copy = t.shell.statusbar

  // Gateway left the status bar — surface drop-offs as toasts instead.
  // Skip intentional tears (account-home relaunch, boot, update apply).
  const prevGatewayRef = useRef(gatewayState)
  useEffect(() => {
    const prev = prevGatewayRef.current
    prevGatewayRef.current = gatewayState
    if (prev === 'open' && gatewayState !== 'open' && gatewayState !== 'connecting') {
      if (
        shouldSuppressGatewayOfflineToast() ||
        $desktopBoot.get().running ||
        $updateApply.get().applying
      ) {
        return
      }
      notifyError(new Error(copy.gatewayOffline), copy.gatewayTitle)
    }
  }, [copy.gatewayOffline, copy.gatewayTitle, gatewayState])

  // Timer / YOLO / Terminal / Version moved out of the status bar:
  // session timer → composer context usage; approvals → composer chip;
  // terminal → Ambiente tab; version → update toast above account menu.
  const coreLeftStatusbarItems = useMemo<readonly StatusbarItem[]>(() => [], [])
  const coreRightStatusbarItems = useMemo<readonly StatusbarItem[]>(() => [], [])

  const leftStatusbarItems = useMemo(
    () => [...coreLeftStatusbarItems, ...extraLeftItems],
    [coreLeftStatusbarItems, extraLeftItems]
  )

  const statusbarItems = useMemo(
    () => [...extraRightItems, ...coreRightStatusbarItems],
    [coreRightStatusbarItems, extraRightItems]
  )

  return { leftStatusbarItems, statusbarItems }
}
