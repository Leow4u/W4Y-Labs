import { describe, expect, it } from 'vitest'

import { fieldBucket, isSystemChannel, sessionSourcesForPlatform } from './channel-curation'

describe('channel-curation', () => {
  it('maps allowlist and home fields into product buckets', () => {
    expect(fieldBucket('TELEGRAM_ALLOWED_USERS')).toBe('who')
    expect(fieldBucket('DISCORD_HOME_CHANNEL')).toBe('home')
    expect(fieldBucket('DISCORD_ALLOW_ALL_USERS')).toBe('advanced')
    expect(fieldBucket('TELEGRAM_BOT_TOKEN')).toBe('connect')
  })

  it('treats api_server and webhook as system channels', () => {
    expect(isSystemChannel('api_server')).toBe(true)
    expect(isSystemChannel('telegram')).toBe(false)
  })

  it('aliases whatsapp_cloud sessions to whatsapp sources', () => {
    expect(sessionSourcesForPlatform('whatsapp_cloud')).toEqual(['whatsapp_cloud', 'whatsapp'])
    expect(sessionSourcesForPlatform('telegram')).toEqual(['telegram'])
  })
})
