/** Featured channel order for the Canais card grid (mirrors web ChannelsPage). */
export const FEATURED_CHANNELS = [
  'whatsapp',
  'whatsapp_cloud',
  'telegram',
  'discord',
  'slack',
  'email',
  'sms',
  'google_chat',
  'teams'
] as const

export type FeaturedChannelId = (typeof FEATURED_CHANNELS)[number]

/** Plumbing platforms — shown under Avançado, not on the face. */
export const SYSTEM_CHANNELS = new Set([
  'api_server',
  'webhook',
  'relay',
  'raft',
  'photon',
  'msgraph_webhook',
  'wecom_callback'
])

export function isSystemChannel(id: string): boolean {
  return SYSTEM_CHANNELS.has(id)
}

/** Session `source` ids that map to a messaging platform card. */
export function sessionSourcesForPlatform(platformId: string): string[] {
  if (platformId === 'whatsapp_cloud') {
    return ['whatsapp_cloud', 'whatsapp']
  }

  return [platformId]
}

export function fieldBucket(key: string): 'connect' | 'who' | 'home' | 'advanced' {
  const upper = key.toUpperCase()

  if (upper.endsWith('_ALLOW_ALL_USERS') || upper.includes('ALLOW_ALL')) {
    return 'advanced'
  }

  if (upper.endsWith('_ALLOWED_USERS') || upper.endsWith('_ALLOWED_USER_IDS')) {
    return 'who'
  }

  if (upper.includes('HOME_CHANNEL')) {
    return 'home'
  }

  return 'connect'
}
