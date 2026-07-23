import { defineLocale } from './define-locale'

/** Portuguese (BR-first) — journey strings for new session; rest falls back to EN. */
export const pt = defineLocale({
  intro: {
    emptyTitle: 'No que vamos trabalhar?'
  },

  composer: {
    newSessionPlaceholders: [
      'Escreva uma mensagem…',
      'No que vamos trabalhar?',
      'Qual é a tarefa?',
      'O que precisa de atenção?',
      'Descreva o que precisa',
      'Por onde começamos?',
      'Pergunte qualquer coisa'
    ],
    followUpPlaceholders: [
      'Enviar um follow-up',
      'Adicionar mais contexto',
      'Refinar o pedido',
      'E agora?',
      'Continuar',
      'Ajustar ou seguir'
    ],
    modeTitle: 'Aprovações',
    modeManual: 'Pedir aprovação',
    modeManualHint: 'Sempre pedir aprovação para editar ficheiros e usar a internet',
    modeAuto: 'Aprovar por mim',
    modeAutoHint: 'Aprovação só para ações potencialmente inseguras',
    modeYolo: 'Ignorar permissões',
    modeYoloHint: 'Acesso irrestrito a ficheiros e rede nesta sessão',
    modeYoloConfirm: 'Clique de novo para confirmar',
    projectNone: 'Sem projeto',
    projectChipAria: 'Escolher projeto',
    projectNew: 'Novo projeto',
    placeholderFollowUp: 'Enviar follow-up'
  },

  sidebar: {
    nav: {
      'session.new': 'Nova sessão'
    },
    noSessions: 'Ainda sem sessões',
    projects: {
      newButton: 'Novo projeto'
    }
  }
})
