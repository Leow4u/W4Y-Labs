import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOCALE,
  isLocale,
  isSupportedLocaleValue,
  localeConfigValue,
  normalizeLocale,
  pickerLocaleOptions
} from './languages'

describe('desktop i18n languages', () => {
  it('normalizes supported locale aliases', () => {
    expect(normalizeLocale('en')).toBe('en')
    expect(normalizeLocale('EN-US')).toBe('en')
    expect(normalizeLocale('pt')).toBe('pt')
    expect(normalizeLocale('pt-BR')).toBe('pt')
    expect(normalizeLocale('pt_PT')).toBe('pt')
    expect(normalizeLocale('es')).toBe('es')
    expect(normalizeLocale('es-MX')).toBe('es')
    expect(normalizeLocale('es-419')).toBe('es')
    expect(normalizeLocale('fr')).toBe('fr')
    expect(normalizeLocale('fr-CA')).toBe('fr')
    expect(normalizeLocale('de')).toBe('de')
    expect(normalizeLocale('de-DE')).toBe('de')
    expect(normalizeLocale('zh')).toBe('zh')
    expect(normalizeLocale('zh-CN')).toBe('zh')
    expect(normalizeLocale('zh-Hans')).toBe('zh')
    expect(normalizeLocale(' zh_hans_cn ')).toBe('zh')
    expect(normalizeLocale('zh-Hant')).toBe('zh-hant')
    expect(normalizeLocale('zh-TW')).toBe('zh-hant')
    expect(normalizeLocale('ja')).toBe('ja')
    expect(normalizeLocale('ja-JP')).toBe('ja')
  })

  it('falls back to English for empty or unsupported values', () => {
    expect(normalizeLocale(null)).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale('')).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale('it')).toBe(DEFAULT_LOCALE)
  })

  it('distinguishes exact locale ids from supported config aliases', () => {
    expect(isSupportedLocaleValue('pt-BR')).toBe(true)
    expect(isSupportedLocaleValue('es-MX')).toBe(true)
    expect(isSupportedLocaleValue('fr-FR')).toBe(true)
    expect(isSupportedLocaleValue('de')).toBe(true)
    expect(isSupportedLocaleValue('zh-CN')).toBe(true)
    expect(isSupportedLocaleValue('it')).toBe(false)
    expect(isLocale('es')).toBe(true)
    expect(isLocale('fr')).toBe(true)
    expect(isLocale('de')).toBe(true)
    expect(isLocale('pt')).toBe(true)
    expect(isLocale('zh')).toBe(true)
    expect(isLocale('zh-CN')).toBe(false)
  })

  it('returns the persisted config value for supported locales', () => {
    expect(localeConfigValue('en')).toBe('en')
    expect(localeConfigValue('pt')).toBe('pt')
    expect(localeConfigValue('es')).toBe('es')
    expect(localeConfigValue('fr')).toBe('fr')
    expect(localeConfigValue('de')).toBe('de')
    expect(localeConfigValue('zh')).toBe('zh')
    expect(localeConfigValue('zh-hant')).toBe('zh-hant')
    expect(localeConfigValue('ja')).toBe('ja')
  })

  it('shows Americas/Europe locales in the picker by default', () => {
    const ids = pickerLocaleOptions().map(locale => locale.id)
    expect(ids).toEqual(['pt', 'en', 'es', 'fr', 'de'])
  })

  it('keeps a hidden active locale visible so the user can switch away', () => {
    const ids = pickerLocaleOptions('ja').map(locale => locale.id)
    expect(ids).toEqual(['pt', 'en', 'es', 'fr', 'de', 'ja'])
  })
})
