import { defineLocale } from './define-locale'

/** French — picker-ready; falls back to English until a full pass lands. */
export const fr = defineLocale({
  language: {
    label: 'Langue',
    description: "Langue de l'interface du bureau.",
    searchPlaceholder: 'Rechercher une langue…',
    switchTo: 'Changer de langue',
    saving: 'Enregistrement de la langue…',
    saveError: "Impossible d'enregistrer la langue.",
    noResults: 'Aucune langue ne correspond.'
  },
  settings: {
    nav: {
      general: 'Général',
      gateway: 'Gateway'
    }
  }
})
