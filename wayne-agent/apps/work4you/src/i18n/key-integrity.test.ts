import { describe, expect, it } from 'vitest'

import { TRANSLATIONS } from './catalog'

/**
 * Nem tudo num catálogo de tradução é texto. O id do modelo
 * (`anthropic/claude-sonnet-4.6`), o caminho da definição no schema
 * (`memory.memory_enabled`) e o nome da variável de ambiente são
 * identificadores: é por eles que o ecrã encontra a copy. Traduzidos ou
 * reestruturados, o cartão fica sem texto e o utilizador vê inglês, sem erro
 * nenhum a assinalar.
 *
 * Em ago/2026 um gerador partiu essas chaves em cada ponto e dezoito modelos
 * ficaram sem copy portuguesa. O teste que existia comparava só as secções de
 * topo e passou verde por cima do estrago.
 */

/**
 * Juntar caminhos com '.' esconde exactamente esse defeito: partir
 * `'anthropic/claude-sonnet-4.6'` em `{ 'anthropic/claude-sonnet-4': { '6': ... } }`
 * dá o mesmo caminho pontuado que a chave inteira. O separador tem de ser algo
 * que nunca possa aparecer numa chave.
 */
const SEP = '\u0000'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function leafPaths(value: unknown, trail: string[] = [], out: string[] = []): string[] {
  if (!isRecord(value)) {
    if (trail.length) out.push(trail.join(SEP))
    return out
  }
  for (const key of Object.keys(value)) leafPaths(value[key], [...trail, key], out)
  return out
}

/**
 * Um objecto vazio no inglês é um mapa aberto: declara que não há entrada
 * inglesa e que cada língua preenche a sua. É o caso de
 * `messaging.platformIntro`, cuja copy inglesa vive em `platformCopy`.
 */
function openMaps(value: unknown, trail: string[] = [], out: string[] = []): string[] {
  if (!isRecord(value)) return out
  const keys = Object.keys(value)
  if (!keys.length) {
    if (trail.length) out.push(trail.join(SEP) + SEP)
    return out
  }
  for (const key of keys) openMaps(value[key], [...trail, key], out)
  return out
}

function stringLeaves(value: unknown, trail: string[] = [], out = new Map<string, string>()) {
  if (typeof value === 'string') {
    if (trail.length) out.set(trail.join(SEP), value)
    return out
  }
  if (!isRecord(value)) return out
  for (const key of Object.keys(value)) stringLeaves(value[key], [...trail, key], out)
  return out
}

const readable = (path: string) => path.split(SEP).join(' > ')

const translated = Object.entries(TRANSLATIONS).filter(([locale]) => locale !== 'en')

describe('integridade das chaves de tradução', () => {
  const english = new Set(leafPaths(TRANSLATIONS.en))
  const open = openMaps(TRANSLATIONS.en)

  it('nenhuma língua inventa uma chave que o inglês não tem', () => {
    for (const [locale, catalog] of translated) {
      const strays = leafPaths(catalog)
        .filter((path) => !english.has(path) && !open.some((prefix) => path.startsWith(prefix)))
        .map(readable)

      expect(strays, `${locale}: chaves fora do catálogo inglês`).toEqual([])
    }
  })

  it('o nome do modelo nunca é traduzido', () => {
    const originals = TRANSLATIONS.en.settings.model.featuredCards

    for (const [locale, catalog] of translated) {
      for (const [id, card] of Object.entries(catalog.settings.model.featuredCards)) {
        if (!card?.title) continue
        expect(card.title, `${locale}: ${id}`).toBe(originals[id]?.title)
      }
    }
  })

  it('os identificadores dentro da copy sobrevivem à tradução', () => {
    // WAYNE_HOME, SEARCH_TOOLS: o utilizador ou o agente escrevem-nos tal e qual.
    const IDENTIFIER = /\b[A-Z][A-Z0-9]*(?:_[A-Z0-9]+)+\b/g
    const originals = stringLeaves(TRANSLATIONS.en)

    for (const [locale, catalog] of translated) {
      const missing: string[] = []

      for (const [path, text] of stringLeaves(catalog)) {
        const expected = originals.get(path)
        if (!expected) continue
        for (const token of expected.match(IDENTIFIER) ?? []) {
          if (!text.includes(token)) missing.push(`${readable(path)}: ${token}`)
        }
      }

      expect(missing, `${locale}: identificadores perdidos na tradução`).toEqual([])
    }
  })
})
