import type { HermesConfigRecord } from '@/types/hermes'

import { getNested } from './helpers'

/**
 * On the Voice page, only surface the sub-fields of the *selected* TTS/STT
 * provider — otherwise every provider's options render at once. Top-level keys
 * (`tts.provider`, `stt.enabled`, `voice.*`) always show; STT provider fields
 * hide entirely when STT is off.
 */
export function voiceFieldVisible(key: string, config: HermesConfigRecord): boolean {
  // Empty language = Whisper auto-detect; forcing a code is power-user only.
  if (key === 'stt.local.language' || key === 'stt.elevenlabs.language_code') {
    return false
  }

  const match = /^(tts|stt)\.([^.]+)\./.exec(key)

  if (!match) {
    return true
  }

  const [, domain, provider] = match

  if (domain === 'stt' && !getNested(config, 'stt.enabled')) {
    return false
  }

  return provider === String(getNested(config, `${domain}.provider`) ?? '')
}
