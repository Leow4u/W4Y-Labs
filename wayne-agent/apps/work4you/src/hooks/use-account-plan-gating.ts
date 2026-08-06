import { useQuery } from '@tanstack/react-query'

import { isPlanLockedModel } from '@/lib/plan-model-gating'
import { fetchAccountPlan, isGratisPlan } from '@/lib/plans'

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

  return {
    accountPlan,
    plan,
    gratisGating,
    isLocked: (modelId: string) => isPlanLockedModel(modelId, plan)
  }
}
