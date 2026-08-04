import { describe, expect, it } from 'vitest'

import { en } from '@/i18n/en'

import {
  deliveryLabelForId,
  fallbackDeliveryTargets,
  mergeDeliveryTargets,
  onlyLocalDeliveryAvailable
} from './delivery-targets'

describe('cron delivery targets', () => {
  it('falls back to local-only when the gateway returns nothing', () => {
    expect(mergeDeliveryTargets(undefined)).toEqual(fallbackDeliveryTargets())
    expect(onlyLocalDeliveryAvailable(fallbackDeliveryTargets())).toBe(true)
  })

  it('keeps the current job deliver value selectable when missing from the list', () => {
    const rows = mergeDeliveryTargets(
      [{ home_env_var: null, home_target_set: true, id: 'local', name: 'Local (save only)' }],
      'legacy-platform'
    )

    expect(rows.some(target => target.id === 'legacy-platform')).toBe(true)
  })

  it('appends a home-channel hint for platforms without a home target', () => {
    const label = deliveryLabelForId(
      'telegram',
      [{ home_env_var: 'TELEGRAM_CHAT_ID', home_target_set: false, id: 'telegram', name: 'Telegram' }],
      en.cron
    )

    expect(label).toContain(en.cron.deliveryNeedsHomeChannel)
  })
})
