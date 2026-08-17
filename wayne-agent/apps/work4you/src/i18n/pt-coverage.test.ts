import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { TRANSLATIONS } from './catalog'
import { LOCALE_META } from './languages'
import type { Translations } from './types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Collect string leaf paths (skip functions/arrays). */
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

/** Quoted object keys that contain `.` or `/` — model ids, schema paths, keybind ids. */
function quotedIdentifierKeys(source: string): Set<string> {
  const keys = new Set<string>()
  const re = /['"]([A-Za-z0-9_./:-]*[./][A-Za-z0-9_./:-]+)['"]\s*:/g
  for (const match of source.matchAll(re)) {
    keys.add(match[1])
  }
  return keys
}

const i18nDir = dirname(fileURLToPath(import.meta.url))

describe('Portuguese catalog coverage', () => {
  it('defines every top-level English section on the merged catalog', () => {
    const enKeys = Object.keys(TRANSLATIONS.en as Translations).sort()
    const ptKeys = Object.keys(TRANSLATIONS.pt as Translations).sort()
    expect(ptKeys).toEqual(enKeys)
  })

  it('keeps EN identifier keys intact (never split dotted model/schema ids)', () => {
    const enSrc = readFileSync(join(i18nDir, 'en.ts'), 'utf8')
    const ptSrc = readFileSync(join(i18nDir, 'pt.ts'), 'utf8')
    const enKeys = quotedIdentifierKeys(enSrc)
    const ptKeys = quotedIdentifierKeys(ptSrc)
    const missing = [...enKeys].filter(key => !ptKeys.has(key)).sort()

    expect(
      missing,
      `Dotted/slash keys missing from pt.ts (would silently fall back to EN labels):\n${missing.slice(0, 30).join('\n')}`
    ).toEqual([])

    // Regression from revert of #33: model id must stay one key, not anthropic/claude-sonnet-4 + nested 6.
    expect(ptSrc).toContain("'anthropic/claude-sonnet-4.6'")
    expect(ptSrc).toContain("'memory.memory_enabled'")
    expect(ptSrc).not.toMatch(/'anthropic\/claude-sonnet-4'\s*:\s*\{[\s\S]*?\b6\s*:/)
  })

  it('translates previously missing high-traffic surfaces (not EN leftovers)', () => {
    const en = TRANSLATIONS.en
    const pt = TRANSLATIONS.pt

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
    const identical = shared.filter(path => enLeaves[path] === ptLeaves[path])
    const ratio = identical.length / shared.length

    expect(
      ratio,
      `Too many identical EN/PT strings (${identical.length}/${shared.length}). Sample: ${identical.slice(0, 15).join(', ')}`
    ).toBeLessThan(0.12)
  })

  it('preserves English chrome that zh/ja also keep (do not over-translate)', () => {
    const { en, pt } = TRANSLATIONS

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
    expect(pt.shell.statusbar.contextUsagePanel.tokenSummary('1', '2')).toBe('1 / 2 Tokens')

    expect(pt.statusStack.coding.commit).toBe('Commit')
    expect(pt.statusStack.coding.createPr).toContain('PR')
    expect(pt.statusStack.coding.commitAndPush.toLowerCase()).toContain('push')

    // Glossary-driven PT still applies.
    expect(pt.skills.tabSkills).not.toBe(en.skills.tabSkills)
  })
})
