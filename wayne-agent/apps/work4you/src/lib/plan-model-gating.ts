/**
 * Plan-aware model gating — Relay 2.5 Fast on Free tier (Cursor Hobby pattern).
 * Shared by composer, Settings, cron, and onboarding pickers.
 */
import { isGratisPlan } from '@/lib/plans'
import { isRelayFreeModel, RELAY_FREE_PRIMARY_MODEL } from '@/lib/relay-free-model'
import { featuredDefaultOnIds } from '@/lib/w4y-featured-models'

/** True when *modelId* requires Essencial+ on the current plan. */
export function isPlanLockedModel(modelId: string, plan: string | null | undefined): boolean {
  const id = modelId.trim()
  if (!id) return false
  if (!isGratisPlan(plan)) return false
  return !isRelayFreeModel(id)
}

/** Curated default-visible roster ids for Settings → Models (plan-aware). */
export function featuredDefaultOnIdsForPlan(plan: string | null | undefined): string[] {
  // Unknown plan (signed out / fetch failed) → full curated roster; gating still applies at pick time.
  if (plan && isGratisPlan(plan)) {
    return [RELAY_FREE_PRIMARY_MODEL]
  }
  return featuredDefaultOnIds()
}

/** Filter catalog model ids to those selectable on *plan*. */
export function filterModelsForPlan(models: readonly string[], plan: string | null | undefined): string[] {
  if (!isGratisPlan(plan)) {
    return [...models]
  }
  return models.filter(id => !isPlanLockedModel(id, plan))
}
