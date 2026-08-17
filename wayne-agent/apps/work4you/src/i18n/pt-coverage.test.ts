import { describe, expect, it } from 'vitest'

import { TRANSLATIONS } from './catalog'
import { LOCALE_META } from './languages'
import type { Translations } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Collect string leaf paths (skip functions/arrays — harder to diff). */
function stringLeaves(value: unknown, prefix = ''): Record<string, string> {
  if (typeof value === 'string') {
    return prefix ? { [prefix]: value } : {}
  }

  if (!isRecord(value)) {
    return {}
  }

  return Object.keys(value).reduce<Record<string, string>>((acc, key) => {
    const path = prefix ? `${prefix}.${key}` : key
    const child = value[key]
    if (typeof child === 'string') {
      acc[path] = child
      return acc
    }
    if (isRecord(child)) {
      Object.assign(acc, stringLeaves(child, path))
    }
    return acc
  }, {})
}

describe('Portuguese catalog coverage', () => {
  it('defines every top-level English section on the merged catalog', () => {
    const enKeys = Object.keys(TRANSLATIONS.en as Translations).sort()
    const ptKeys = Object.keys(TRANSLATIONS.pt as Translations).sort()
    expect(ptKeys).toEqual(enKeys)
  })

  it('translates previously missing high-traffic surfaces (not EN leftovers)', () => {
    const en = TRANSLATIONS.en
    const pt = TRANSLATIONS.pt

    // Sections that used to be 100% English fallback before the PT fill.
    expect(pt.boot.ready).not.toBe(en.boot.ready)
    expect(pt.notifications.region).not.toBe(en.notifications.region)
    expect(pt.titlebar.openSettings).not.toBe(en.titlebar.openSettings)
    expect(pt.keybinds.title).not.toBe(en.keybinds.title)
    expect(pt.updates.updateNow).not.toBe(en.updates.updateNow)
    expect(pt.install.settingUpTitle).not.toBe(en.install.settingUpTitle)
    expect(pt.modelPicker.title).not.toBe(en.modelPicker.title)
    expect(pt.preview.tab).not.toBe(en.preview.tab)
    expect(pt.assistant.thread.thinking).not.toBe(en.assistant.thread.thinking)
    expect(pt.starmap.title).not.toBe(en.starmap.title)
    expect(pt.shell.statusbar.cron).not.toBe(en.shell.statusbar.cron)
    expect(pt.onboarding.headerTitle).not.toBe(en.onboarding.headerTitle)
    expect(pt.desktop.yoloArmed).not.toBe(en.desktop.yoloArmed)
  })

  it('uses Brazilian Portuguese for core chrome verbs', () => {
    const { common } = TRANSLATIONS.pt
    expect(common.save).toBe('Salvar')
    expect(common.delete).toBe('Excluir')
    expect(common.loading).toBe('Carregando…')
    expect(common.saving).toBe('Salvando…')
  })

  it('lists Português (Brasil) in the picker locale meta', () => {
    expect(LOCALE_META.pt.name).toBe('Português (Brasil)')
  })

  it('keeps most string leaves distinct from English (guards EN/PT mix)', () => {
    const enLeaves = stringLeaves(TRANSLATIONS.en)
    const ptLeaves = stringLeaves(TRANSLATIONS.pt)
    const shared = Object.keys(enLeaves).filter(path => path in ptLeaves)

    // Schema field maps + a few intentional shared tokens (Work4You, Free, Pro, MCP…).
    const identical = shared.filter(path => enLeaves[path] === ptLeaves[path])
    const ratio = identical.length / shared.length

    expect(
      ratio,
      `Too many identical EN/PT strings (${identical.length}/${shared.length}). Sample: ${identical.slice(0, 15).join(', ')}`
    ).toBeLessThan(0.12)
  })

  it('preserves English chrome that zh/ja also keep (do not over-translate)', () => {
    const { en, pt } = TRANSLATIONS

    // Compact labels / brands / placeholders — consensus with zh+ja identical-to-EN.
    expect(pt.shell.modelMenu.autoMode).toBe('Auto')
    expect(pt.modelPicker.pro).toBe('Pro')
    expect(pt.onboarding.pro).toBe('Pro')
    expect(pt.onboarding.catalogKeyTitle).toBe('Model catalog')
    expect(pt.modelPicker.free).toBe('Free')
    expect(pt.onboarding.free).toBe('Free')
    expect(pt.modelPicker.freeTier).toBe('Free tier')
    expect(pt.onboarding.freeTier).toBe('Free tier')
    expect(pt.skills.tabMcp).toBe('MCP')
    expect(pt.settings.nav.mcp).toBe('MCP')
    expect(pt.profiles.env).toBe('env')
    expect(pt.settings.appearance.installPlaceholder).toBe('publisher.extension')
    expect(pt.composer.urlPlaceholder).toBe('https://example.com/post')
    expect(pt.shell.statusbar.contextUsagePanel.tokenSummary(1, 2)).toBe('1 / 2 Tokens')

    // Git chrome: keep technical tokens (translate only connective words).
    expect(pt.statusStack.coding.commit).toBe('Commit')
    expect(pt.statusStack.coding.createPr).toContain('PR')
    expect(pt.statusStack.coding.commitAndPush.toLowerCase()).toContain('push')

    // Glossary-driven PT still applies (not forced English).
    expect(pt.skills.tabSkills).not.toBe(en.skills.tabSkills)
    expect(pt.cron.close.toLowerCase()).not.toContain('automations') // Agenda surface
  })
})
