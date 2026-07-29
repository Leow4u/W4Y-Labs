import { defineLocale } from './define-locale'

/** Spanish — picker-ready; falls back to English until a full pass lands. */
export const es = defineLocale({
  language: {
    label: 'Idioma',
    description: 'Idioma de la interfaz del escritorio.',
    searchPlaceholder: 'Buscar idiomas…',
    switchTo: 'Cambiar idioma',
    saving: 'Guardando idioma…',
    saveError: 'No se pudo guardar el idioma.',
    noResults: 'Ningún idioma coincide.'
  },
  settings: {
    nav: {
      general: 'General',
      gateway: 'Gateway'
    }
  }
})
