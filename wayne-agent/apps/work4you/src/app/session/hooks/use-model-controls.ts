import { type QueryClient } from '@tanstack/react-query'
import { useCallback } from 'react'

import { getGlobalModelInfo, setGlobalModel } from '@/hermes'
import { useI18n } from '@/i18n'
import { rememberComposerManualModel } from '@/lib/composer-auto-mode'
import { notifyError } from '@/store/notifications'
import { $activeSessionId, $currentModel, $currentProvider, setCurrentModel, setCurrentProvider } from '@/store/session'
import type { ModelOptionsResponse } from '@/types/hermes'

interface ModelSelection {
  model: string
  provider: string
}

interface ModelControlsOptions {
  activeSessionId: string | null
  queryClient: QueryClient
  requestGateway: <T = unknown>(method: string, params?: Record<string, unknown>) => Promise<T>
}

export function useModelControls({ activeSessionId, queryClient, requestGateway }: ModelControlsOptions) {
  const { t } = useI18n()
  const copy = t.desktop

  const updateModelOptionsCache = useCallback(
    (provider: string, model: string, includeGlobal: boolean) => {
      const patch = (prev: ModelOptionsResponse | undefined) => ({ ...(prev ?? {}), provider, model })

      queryClient.setQueryData<ModelOptionsResponse>(['model-options', activeSessionId || 'global'], patch)

      if (includeGlobal) {
        queryClient.setQueryData<ModelOptionsResponse>(['model-options', 'global'], patch)
      }
    },
    [activeSessionId, queryClient]
  )

  // Seed the composer's model state from the profile default. `force` reseeds
  // for a profile swap (the new profile has its own default); otherwise this
  // only fills an EMPTY selection so a user's pick (plain UI state in
  // $currentModel) survives the lifecycle refreshes that fire on boot / fresh
  // draft / session events. A live session owns the footer, so skip entirely.
  const refreshCurrentModel = useCallback(async (force = false) => {
    try {
      if ($activeSessionId.get()) {
        return
      }

      if (!force && $currentModel.get()) {
        return
      }

      const result = await getGlobalModelInfo()

      if ($activeSessionId.get() || (!force && $currentModel.get())) {
        return
      }

      if (typeof result.model === 'string') {
        setCurrentModel(result.model)
      }

      if (typeof result.provider === 'string') {
        setCurrentProvider(result.provider)
      }
    } catch {
      // The delayed session.info event still updates this once the agent is ready.
    }
  }, [])

  // Returns whether the switch succeeded so callers can await it before applying
  // follow-up changes. Contract B (Composer sticky write-through):
  //   • with a live session → pin this session's override AND persist the
  //     profile default via explicit `--global` (never mutate shared env);
  //   • with no session → UI sticky + write the same profile default so cron /
  //     channels / the next session.create share one SSOT.
  // Other sessions keep their own overrides; isolation is unchanged.
  const selectModel = useCallback(
    async (selection: ModelSelection): Promise<boolean> => {
      // Snapshot for rollback: the switch is applied optimistically, so a
      // failure must restore the prior model/provider (store + query cache)
      // rather than leave the UI showing a model the backend never selected.
      const prevModel = $currentModel.get()
      const prevProvider = $currentProvider.get()

      setCurrentModel(selection.model)
      setCurrentProvider(selection.provider)
      // Sticky last-manual for Cursor Auto toggle-off restore (no-op for Auto).
      rememberComposerManualModel(selection.model, selection.provider)
      // Write-through always updates the profile default, so keep the global
      // model-options cache aligned even when a session is active.
      updateModelOptionsCache(selection.provider, selection.model, true)

      // No live session yet: persist the profile default now, then keep the
      // pick as UI sticky for the next session.create seed.
      if (!activeSessionId) {
        try {
          await setGlobalModel(selection.provider, selection.model)
          void queryClient.invalidateQueries({ queryKey: ['model-options', 'global'] })

          return true
        } catch (err) {
          setCurrentModel(prevModel)
          setCurrentProvider(prevProvider)
          updateModelOptionsCache(prevProvider, prevModel, true)
          notifyError(err, copy.modelSwitchFailed)

          return false
        }
      }

      try {
        await requestGateway('config.set', {
          session_id: activeSessionId,
          key: 'model',
          // Explicit `--global`: pin this session AND write model.default on
          // the active profile. Do not rely on persist_switch_by_default.
          value: `${selection.model} --provider ${selection.provider} --global`
        })

        void queryClient.invalidateQueries({ queryKey: ['model-options', activeSessionId] })
        void queryClient.invalidateQueries({ queryKey: ['model-options', 'global'] })

        return true
      } catch (err) {
        setCurrentModel(prevModel)
        setCurrentProvider(prevProvider)
        updateModelOptionsCache(prevProvider, prevModel, true)
        notifyError(err, copy.modelSwitchFailed)

        return false
      }
    },
    [activeSessionId, copy.modelSwitchFailed, queryClient, requestGateway, updateModelOptionsCache]
  )

  return { refreshCurrentModel, selectModel, updateModelOptionsCache }
}
