import type { CronJob } from '@/types/hermes'

export interface InferenceDriftAxis {
  from: string
  to: string
}

export interface InferenceDriftDetails {
  model?: InferenceDriftAxis
  provider?: InferenceDriftAxis
}

const DRIFT_ERROR_RE = /global inference config drifted|#44585|44585/i
const MODEL_DRIFT_RE = /model '([^']+)' -> '([^']+)'/i
const PROVIDER_DRIFT_RE = /provider '([^']+)' -> '([^']+)'/i

export function isInferenceDriftError(lastError: null | string | undefined): boolean {
  const text = (lastError ?? '').trim()
  return text.length > 0 && DRIFT_ERROR_RE.test(text)
}

export function parseInferenceDrift(lastError: null | string | undefined): InferenceDriftDetails | null {
  const text = (lastError ?? '').trim()
  if (!text) {
    return null
  }

  const modelMatch = MODEL_DRIFT_RE.exec(text)
  const providerMatch = PROVIDER_DRIFT_RE.exec(text)
  if (!modelMatch && !providerMatch) {
    return isInferenceDriftError(text) ? {} : null
  }

  const details: InferenceDriftDetails = {}
  if (modelMatch) {
    details.model = { from: modelMatch[1], to: modelMatch[2] }
  }
  if (providerMatch) {
    details.provider = { from: providerMatch[1], to: providerMatch[2] }
  }
  return details
}

/** Unpinned job with snapshots that no longer match current global inference. */
export function jobHasInferenceDrift(job: CronJob): boolean {
  return isInferenceDriftError(job.last_error)
}

export function buildKeepOriginalInferenceUpdates(job: CronJob): {
  last_error: null
  model?: string
  provider?: string
} {
  const updates: { last_error: null; model?: string; provider?: string } = {
    last_error: null
  }

  if (!(job.model ?? '').trim() && (job.model_snapshot ?? '').trim()) {
    updates.model = job.model_snapshot!.trim()
  }
  if (!(job.provider ?? '').trim() && (job.provider_snapshot ?? '').trim()) {
    updates.provider = job.provider_snapshot!.trim()
  }

  return updates
}
