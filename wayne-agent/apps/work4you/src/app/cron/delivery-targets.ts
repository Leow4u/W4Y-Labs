import type { CronDeliveryTarget } from '@/types/hermes'
import type { Translations } from '@/i18n'

import { DEFAULT_DELIVER } from './schedule'

export const LOCAL_DELIVERY_TARGET: CronDeliveryTarget = {
  home_env_var: null,
  home_target_set: true,
  id: 'local',
  name: 'Local (save only)'
}

export function fallbackDeliveryTargets(): CronDeliveryTarget[] {
  return [LOCAL_DELIVERY_TARGET]
}

export function deliveryTargetLabel(
  target: CronDeliveryTarget,
  c: Translations['cron']
): string {
  const base =
    target.id === 'local'
      ? c.deliveryLabels.local
      : c.deliveryLabels[target.id] ?? target.name ?? target.id

  if (target.id !== 'local' && !target.home_target_set) {
    return `${base} — ${c.deliveryNeedsHomeChannel}`
  }

  return base
}

export function deliveryLabelForId(
  deliver: string,
  targets: CronDeliveryTarget[],
  c: Translations['cron']
): string {
  const match = targets.find(target => target.id === deliver)

  if (match) {
    return deliveryTargetLabel(match, c)
  }

  return c.deliveryLabels[deliver] ?? deliver
}

/** Ensure the current job value stays selectable even when the gateway list changed. */
export function mergeDeliveryTargets(
  targets: CronDeliveryTarget[] | undefined,
  currentDeliver?: string
): CronDeliveryTarget[] {
  const rows = targets?.length ? [...targets] : fallbackDeliveryTargets()
  const hasLocal = rows.some(target => target.id === 'local')

  if (!hasLocal) {
    rows.unshift(LOCAL_DELIVERY_TARGET)
  }

  const deliver = (currentDeliver ?? '').trim()

  if (deliver && deliver !== DEFAULT_DELIVER && !rows.some(target => target.id === deliver)) {
    rows.push({
      home_env_var: null,
      home_target_set: false,
      id: deliver,
      name: deliver
    })
  }

  return rows
}

export function onlyLocalDeliveryAvailable(targets: CronDeliveryTarget[]): boolean {
  return targets.filter(target => target.id !== 'local').length === 0
}
