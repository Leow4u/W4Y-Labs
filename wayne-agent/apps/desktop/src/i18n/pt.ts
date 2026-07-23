import { defineLocale } from './define-locale'

/** Portuguese (BR-first) — journey strings; rest falls back to EN. */
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
    connectorsLabel: 'Conectores',
    connectorsHint: 'Abrir integrações e servidores',
    placeholderFollowUp: 'Enviar follow-up'
  },

  sidebar: {
    nav: {
      'session.new': 'Nova sessão',
      'new-session': 'Nova sessão',
      skills: 'Habilidades',
      messaging: 'Canais',
      artifacts: 'Entregas'
    },
    searchAria: 'Buscar sessões',
    searchPlaceholder: 'Buscar sessões…',
    clearSearch: 'Limpar busca',
    noMatch: query => `Nenhuma sessão corresponde a “${query}”.`,
    results: 'Resultados',
    pinned: 'Fixadas',
    sessions: 'Sessões',
    cronJobs: 'Agenda',
    noSessions: 'Ainda sem sessões',
    projects: {
      sectionLabel: 'Projetos',
      newButton: 'Novo projeto',
      createTitle: 'Novo projeto',
      create: 'Criar',
      back: 'Todos os projetos'
    }
  },

  shell: {
    statusbar: {
      closeCommandCenter: 'Fechar painel de controlo',
      openCommandCenter: 'Abrir painel de controlo',
      cron: 'Agenda',
      openCron: 'Abrir agenda',
      starmap: 'O que aprendi',
      yoloOn:
        'Aprovando sozinho — comandos perigosos auto-aprovados. Clique para desligar. Shift+clique altera globalmente.',
      yoloOff:
        'Aprovações ativas — clique para aprovar sozinho neste chat. Shift+clique altera globalmente.'
    }
  },

  desktop: {
    yoloArmed: 'Aprovando sozinho neste chat',
    yoloOff: 'Aprovações restauradas',
    yoloSystem: active =>
      active ? 'Aprovando sozinho nesta sessão' : 'Aprovações restauradas nesta sessão',
    yoloTitle: 'Aprovações',
    yoloToggleFailed: 'Não foi possível alterar o modo de aprovação'
  },

  cron: {
    title: 'Agenda',
    close: 'Fechar agenda'
  },

  artifacts: {
    search: 'Buscar entregas…',
    refresh: 'Atualizar entregas',
    noArtifactsTitle: 'Ainda sem entregas',
    noArtifactsDesc: 'Planilhas, PDFs e ficheiros que o agente criar aparecem aqui.'
  },

  messaging: {
    search: 'Buscar canais…'
  },

  commandCenter: {
    close: 'Fechar painel de controlo',
    nav: {
      newChat: { title: 'Nova sessão', detail: 'Começar uma sessão nova' },
      settings: { title: 'Definições', detail: 'Configurar o Work4You no desktop' },
      skills: { title: 'Habilidades', detail: 'Skills, ferramentas e integrações' },
      messaging: { title: 'Canais', detail: 'Telegram, Slack, Discord e mais' },
      artifacts: { title: 'Entregas', detail: 'Ver resultados gerados' }
    }
  }
})
