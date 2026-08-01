import { pick } from '../lib/text.js'
import { DASHBOARD_TUI_MODE } from '../config/env.js'

export const PLACEHOLDERS = [
  'Ask me anything…',
  'Try "explain this codebase"',
  'Try "write a test for…"',
  'Try "refactor the auth module"',
  'Try "/help" for commands',
  'Try "fix the lint errors"',
  'Try "how does the config loader work?"'
]

// ── Dashboard-embedded composer strings ──────────────────────────────
//
// Inside the browser dashboard (WAYNE_TUI_DASHBOARD=1) the composer drops the
// rotating "Try …" tips for a single calm "type a message" line, localized to
// the tenant language. The language is bridged from the dashboard PTY launcher
// via WAYNE_TUI_LANG (see work4you_cli/web_server._resolve_chat_argv); the TUI is
// Node and can't call our Python i18n. Falls back to English.
// Curadoria do Chat (2026-07). Standalone terminal keeps PLACEHOLDERS above.

const EMPTY_BY_LANG: Record<string, string> = {
  en: 'Type a message…',
  pt: 'Escreva uma mensagem…',
  es: 'Escribe un mensaje…',
  fr: 'Écrivez un message…',
  de: 'Schreiben Sie eine Nachricht…',
  it: 'Scrivi un messaggio…',
  zh: '输入消息…',
  'zh-hant': '輸入訊息…',
  ja: 'メッセージを入力…',
  ko: '메시지를 입력하세요…',
  ru: 'Введите сообщение…',
  tr: 'Bir mesaj yazın…',
  uk: 'Введіть повідомлення…',
  af: "Tik 'n boodskap…",
  ga: 'Scríobh teachtaireacht…',
  hu: 'Írjon üzenetet…'
}

const BUSY_BY_LANG: Record<string, string> = {
  en: 'Ctrl+C to interrupt…',
  pt: 'Ctrl+C para interromper…',
  es: 'Ctrl+C para interrumpir…',
  fr: 'Ctrl+C pour interrompre…',
  de: 'Ctrl+C zum Unterbrechen…',
  it: 'Ctrl+C per interrompere…',
  zh: 'Ctrl+C 中断…',
  'zh-hant': 'Ctrl+C 中斷…',
  ja: 'Ctrl+C で中断…',
  ko: 'Ctrl+C로 중단…',
  ru: 'Ctrl+C для прерывания…',
  tr: 'Kesmek için Ctrl+C…',
  uk: 'Ctrl+C для переривання…',
  af: 'Ctrl+C om te onderbreek…',
  ga: 'Ctrl+C chun stad…',
  hu: 'Ctrl+C a megszakításhoz…'
}

const normLang = (raw: string): string => {
  const v = (raw || '')
    .trim()
    .toLowerCase()
    .replace('_', '-')

  if (v.startsWith('zh-hant') || v === 'zh-tw' || v === 'zh-hk' || v === 'zh-mo') {
    return 'zh-hant'
  }

  if (v.startsWith('zh')) {
    return 'zh'
  }

  return v.split('-')[0] || 'en'
}

const dashboardLang = () => normLang(process.env.WAYNE_TUI_LANG ?? process.env.WAYNE_LANGUAGE ?? 'en')

export const PLACEHOLDER = DASHBOARD_TUI_MODE
  ? (EMPTY_BY_LANG[dashboardLang()] ?? EMPTY_BY_LANG.en)
  : pick(PLACEHOLDERS)

// Shown while a turn is running (composer non-empty state). English elsewhere.
export const BUSY_PLACEHOLDER = DASHBOARD_TUI_MODE
  ? (BUSY_BY_LANG[dashboardLang()] ?? BUSY_BY_LANG.en)
  : 'Ctrl+C to interrupt…'
