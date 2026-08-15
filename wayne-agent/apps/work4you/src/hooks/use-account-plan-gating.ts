import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { setGlobalModel } from '@/hermes'
import { rememberComposerManualModel } from '@/lib/composer-auto-mode'
import {
  isPlanLockedModel,
  platformDefaultModelSelection,
  sanitizeVisibleKeysForPlan,
  shouldReplaceComposerModel
} from '@/lib/plan-model-gating'
import { fetchAccountPlan, isGratisPlan } from '@/lib/plans'
import { W4Y_CATALOG_PROVIDER } from '@/lib/w4y-featured-models'
import { $visibleModels, setVisibleModels } from '@/store/model-visibility'
import { $currentModel, setCurrentModel, setCurrentProvider } from '@/store/session'

/** Cached tenant plan + helpers for Relay 2.5 Fast gating in pickers. */
export function useAccountPlanGating(enabled = true) {
  const accountPlan = useQuery({
    queryKey: ['account-plan'],
    queryFn: () => fetchAccountPlan(),
    enabled,
    staleTime: 60_000
  })

  const plan = accountPlan.data?.plan
  const gratisGating = isGratisPlan(plan)

  // Strip locked models from persisted visibility when Grátis is confirmed.
  useEffect(() => {
    if (!enabled || !plan || !gratisGating) {
      return
    }
    const stored = $visibleModels.get()
    if (!stored) {
      return
    }
    const sanitized = sanitizeVisibleKeysForPlan(stored, plan, W4Y_CATALOG_PROVIDER)
    if (sanitized) {
      setVisibleModels(sanitized)
    }
  }, [enabled, gratisGating, plan])

  // Web + desktop parity: sticky composer state (localStorage) and stale tenant
  // config.yaml defaults (legacy Nemotron free slugs) must not survive platform login.
  useEffect(() => {
    if (!enabled || !plan) {
      return
    }

    const model = $currentModel.get().trim()
    if (!shouldReplaceComposerModel(model, plan)) {
      return
    }

    const next = platformDefaultModelSelection(plan)
    setCurrentModel(next.model)
    setCurrentProvider(next.provider)
    rememberComposerManualModel(next.model, next.provider)
    void setGlobalModel(next.provider, next.model).catch(() => undefined)
  }, [enabled, plan])

  return {
    accountPlan,
    plan,
    gratisGating,
    isLocked: (modelId: string) => isPlanLockedModel(modelId, plan)
  }
}
