import { useQuery } from '@tanstack/react-query'
import { useEffect } from 'react'

import { isPlanLockedModel, sanitizeVisibleKeysForPlan } from '@/lib/plan-model-gating'
import { fetchAccountPlan, isGratisPlan } from '@/lib/plans'
import { W4Y_CATALOG_PROVIDER } from '@/lib/w4y-featured-models'
import { $visibleModels, setVisibleModels } from '@/store/model-visibility'

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

  return {
    accountPlan,
    plan,
    gratisGating,
    isLocked: (modelId: string) => isPlanLockedModel(modelId, plan)
  }
}
