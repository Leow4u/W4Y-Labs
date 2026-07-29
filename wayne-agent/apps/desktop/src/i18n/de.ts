import { defineLocale } from './define-locale'

/** German — picker-ready; falls back to English until a full pass lands. */
export const de = defineLocale({
  language: {
    label: 'Sprache',
    description: 'Sprache der Desktop-Oberfläche.',
    searchPlaceholder: 'Sprachen suchen…',
    switchTo: 'Sprache wechseln',
    saving: 'Sprache wird gespeichert…',
    saveError: 'Sprache konnte nicht gespeichert werden.',
    noResults: 'Keine passende Sprache.'
  },
  settings: {
    nav: {
      general: 'Allgemein',
      gateway: 'Gateway'
    }
  }
})
