import { defineLocale } from './define-locale'

/** Portuguese (BR-first) — journey strings; rest falls back to EN. */
export const pt = defineLocale({
  common: {
    save: 'Guardar',
    saving: 'A guardar…',
    cancel: 'Cancelar',
    delete: 'Eliminar',
    confirm: 'Confirmar',
    close: 'Fechar',
    connecting: 'A ligar',
    loading: 'A carregar…',
    notSet: 'Não definido',
    on: 'Ligado',
    off: 'Desligado'
  },

  intro: {
    emptyTitle: 'No que vamos trabalhar?',
    emptyBodies: [
      'Procura no repositório, edita ficheiros, corre testes, abre PRs. Diz o objetivo e eu trato da parte mecânica.',
      'Envia um bug, um branch, um plano ou uma ideia. Eu inspecciono o repo e transformo no próximo passo concreto.',
      'Traz o código, a dúvida ou o ponto onde estás preso. Eu leio o contexto antes de mudar algo.',
      'Envia a tarefa, o caminho a falhar ou o plano a meio. Eu ajudo a transformar em acção.',
      'Traz o problema, o objectivo ou o ficheiro. Eu inspecciono primeiro e mantenho o próximo passo concreto.'
    ]
  },

  profiles: {
    close: 'Fechar perfis',
    nameHint: 'Letras minúsculas, dígitos, hífens e underscores. Tem de começar por letra ou dígito.',
    title: 'Perfis',
    count: count => `${count} ${count === 1 ? 'perfil' : 'perfis'}`,
    search: 'Pesquisar perfis…',
    loading: 'A carregar perfis…',
    newProfile: 'Novo perfil',
    allProfiles: 'Todos os perfis',
    showAllProfiles: 'Mostrar todos os perfis',
    switchToProfile: name => `Mudar para ${name}`,
    manageProfiles: 'Gerir perfis…',
    actionsFor: name => `Ações para ${name}`,
    color: 'Cor…',
    colorFor: name => `Cor de ${name}`,
    setColor: color => `Definir cor ${color}`,
    autoColor: 'Automática',
    noProfiles: 'Ainda sem perfis.',
    selectPrompt: 'Selecione um perfil para ver os detalhes.',
    refresh: 'Atualizar perfis',
    refreshing: 'A atualizar perfis',
    default: 'predefinido',
    skills: count => `${count} ${count === 1 ? 'skill' : 'skills'}`,
    env: 'env',
    defaultBadge: 'Predefinido',
    rename: 'Mudar nome',
    renameMenu: 'Mudar nome…',
    editSoul: 'Editar Instruções…',
    copySetup: 'Copiar configuração',
    copying: 'A copiar…',
    modelLabel: 'Modelo',
    skillsLabel: 'Skills',
    notSet: 'Não definido',
    soulLabel: 'Instruções',
    soulDesc: 'O prompt de sistema e as instruções de personalidade deste perfil.',
    soulOptional: 'opcional',
    soulPlaceholder: mode =>
      `O prompt de sistema / personalidade deste perfil.\nDeixe em branco para manter o padrão ${mode}.`,
    soulPlaceholderCloned: 'clonado',
    soulPlaceholderEmpty: 'vazio',
    unsavedChanges: 'Alterações por guardar',
    loadingSoul: 'A carregar instruções…',
    emptySoul: 'Vazio — comece a escrever as suas instruções…',
    saving: 'A guardar…',
    saveSoul: 'Guardar Instruções',
    deleteTitle: 'Eliminar perfil?',
    deleteDescPrefix: 'Isto elimina ',
    deleteDescMid: ' e remove a pasta ',
    deleteDescSuffix: '. Não é possível desfazer.',
    deleting: 'A eliminar…',
    createDesc:
      'Cria um perfil de agente isolado (config, skills e instruções próprias) — não é uma sessão de Work. Para o dia a dia, use Nova sessão.',
    nameLabel: 'Nome',
    cloneFrom: 'Clonar de',
    cloneFromNone: 'Nenhum (em branco)',
    cloneFromDesc: 'Copia configuração, skills e instruções do perfil de origem selecionado.',
    cloneFromDefault: 'Clonar do predefinido',
    cloneFromDefaultDesc: 'Copia configuração, skills e instruções do seu perfil predefinido.',
    invalidName: hint => `Nome inválido. ${hint}`,
    nameRequired: 'O nome é obrigatório.',
    creating: 'A criar…',
    createAction: 'Criar perfil',
    renameTitle: 'Mudar nome do perfil',
    renameDescPrefix: 'Mudar o nome atualiza a pasta do perfil e quaisquer scripts em ',
    renameDescSuffix: '.',
    newNameLabel: 'Novo nome',
    renaming: 'A mudar o nome…',
    created: 'Perfil criado',
    renamed: 'Perfil renomeado',
    deleted: 'Perfil eliminado',
    setupCopied: 'Comando de configuração copiado',
    soulSaved: 'Instruções guardadas',
    failedLoad: 'Não foi possível carregar os perfis',
    failedDelete: 'Não foi possível eliminar o perfil',
    failedCopy: 'Não foi possível copiar o comando de configuração',
    failedLoadSoul: 'Não foi possível carregar as instruções',
    failedSaveSoul: 'Não foi possível guardar as instruções',
    failedCreate: 'Não foi possível criar o perfil',
    failedRename: 'Não foi possível mudar o nome do perfil',
    workLockedTitle: 'Agente Work',
    workLocked:
      'O Work (Default) é o seu agente do dia a dia — não pode ser editado, renomeado ou apagado aqui.'
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
    modeOff: 'Nunca perguntar',
    modeOffHint: 'Acesso irrestrito em todas as conversas e nas tarefas agendadas — até voltar a mudar',
    modeSaveFailed: 'Não foi possível mudar o modo de aprovação',
    projectNone: 'Sem projeto',
    projectChoose: 'Escolha uma pasta',
    projectChipAria: 'Escolha uma pasta',
    projectClearTooltip: 'Trabalhar sem projeto',
    projectRecents: 'Recentes',
    projectUseExisting: 'Usar existente…',
    projectOpenFolder: 'Abrir pasta…',
    projectOpenFolderTitle: 'Abrir pasta',
    projectNewFolder: 'Nova pasta…',
    projectNewFolderTitle: 'Nova pasta',
    projectOpenFolderFailed: 'Não foi possível abrir a pasta',
    projectNew: 'Novo projeto',
    projectCloudSection: 'Nuvem',
    projectCloudBadge: 'Nuvem',
    cloneRepo: 'Clonar repositório…',
    cloudLoading: 'A carregar projetos na nuvem…',
    cloudEmpty: 'Ainda sem projetos na nuvem',
    cloudListFailed: 'Não foi possível alcançar os projetos na nuvem',
    cloudCloneFailed: 'Não foi possível preparar o clone na nuvem',
    runWhereTooltip: 'Onde este chat corre',
    runLocalOption: 'Local',
    runLocalHint: 'Ficheiros e terminal neste PC. Para se saíres da app.',
    runCloudOption: 'Na nuvem · 24/7',
    runCloudHint: 'Continua na nuvem com o PC desligado.',
    runCloudSignIn: 'Inicia sessão na conta para usar a nuvem',
    runCloudUnavailable: 'A nuvem está indisponível de momento',
    runLockedHint: 'Este chat já começou aqui',
    repoModalTitle: 'Ligar um repositório',
    repoConnected: 'GitHub CLI ligado',
    repoUrlPlaceholder: 'https://github.com/org/repo.git',
    repoAnyProvider: 'GitHub, GitLab, Bitbucket ou qualquer URL git.',
    repoOrUrl: 'ou cola um URL',
    repoConfirm: 'Clonar',
    repoBusy: 'A trabalhar…',
    repoClonePrompt:
      'Clona o repositório {url} nesta pasta (cwd actual da sessão) e lista os ficheiros quando terminares.',
    ghConnectCta: 'Ligar conta GitHub',
    ghConnectDesc: 'Autoriza uma vez — clona repos privados e abre Pull Requests daqui.',
    ghConnectPrompt:
      'Roda `gh auth login --hostname github.com --git-protocol https --web` e mostra-me o código de verificação e o link para eu autorizar no browser.',
    connectorsLabel: 'Conectores',
    connectorsHint: 'Abrir integrações',
    connectorsSession: 'Conectores do Work neste chat',
    connectorsManage: 'Gerir conectores…',
    connectorsAdd: 'Adicionar conectores',
    continueOn: 'Continuar em',
    placeholderFollowUp: 'Enviar follow-up'
  },

  skills: {
    tabConnectors: 'Conectores',
    tabMcp: 'MCPs',
    browseMarketplace: 'Navegar Marketplace',
    manageConnected: 'Gerir',
    documentation: 'Documentação',
    searchFor: (kind, scope) => `Pesquisar ${kind} para ${scope}...`,
    emptyProductSkillsTitle: 'Estende a Work4You com Skills',
    emptyProductSkillsDesc:
      'Skills agrupam métodos que o agente pode seguir — receitas aprendidas, SKILL.md do projeto e playbooks. O kit nativo fica no chat; contas ficam em Conectores.',
    projectSkillHint: 'Vem da pasta .wayne/skills deste projeto — edita o ficheiro no repo para alterar.',
    hubSkillManageHint: 'Instalada antes pelo hub de skills. Capacidades nativas ficam no chat; contas ficam em Conectores.',
    provenance: {
      agent: 'Aprendida',
      bundled: 'Nativa',
      hub: 'Hub',
      project: 'Projeto'
    },
    open: 'Abrir',
    rowMenu: 'Ações da skill',
    addSkill: '+ Adicionar',
    userSection: count => `Skills do utilizador${count > 0 ? ` (${count})` : ''}`,
    newSkillTitle: 'Nova skill',
    newSkillDesc: 'Cria um SKILL.md nas skills aprendidas. Podes editar de seguida.',
    newSkillPlaceholder: 'nome-da-skill',
    newSkillHint: 'Letras minúsculas, dígitos, pontos, hífens e underscores.',
    skillCreated: 'Skill criada',
    createFailed: 'Não foi possível criar a skill',
    editLearnedOnlyTitle: 'Só skills aprendidas abrem aqui',
    editLearnedOnlyDesc:
      'Skills de hub e de projeto editam-se nos ficheiros de origem — as aprendidas abrem no editor em baixo.',
    edit: 'Editar',
    archive: 'Arquivar',
    skillUpdated: 'Skill atualizada',
    changesApplyNewSessions: 'As alterações aplicam-se a novas sessões.'
  },

  connectors: {
    searchPlaceholder: 'Buscar conectores',
    connect: 'Conectar',
    connecting: 'A conectar…',
    connected: 'Conectado',
    reconnect: 'Reconectar',
    disconnect: 'Desconectar',
    disconnectAll: 'Desconectar todas',
    disconnectAllConfirm:
      'Revogar todas as contas Composio deste agente? O chat pedirá autorização de novo ao conectar.',
    disconnectAllDone: 'Desconectadas {count} conta(s)',
    connectedToast: '{name} conectado',
    disconnectedToast: 'Desconectado',
    openedToast: 'Autorize na janela que abriu',
    connectFailed: 'Não foi possível conectar',
    empty: 'Nenhum conector corresponde.',
    featuredSection: 'Destaques',
    connectedSection: 'Conectados',
    installedCount: count => `Instalados ${count}`,
    devSection: 'Desenvolvimento',
    viewFullCatalog: 'Ver catálogo completo →',
    backToFeatured: 'Voltar aos destaques',
    showMore: count => `Ver ${count} mais`,
    showLess: 'Ver menos',
    emptyConnectedTitle: 'Liga ferramentas externas',
    emptyConnectedDesc: 'Liga Gmail, Notion, Slack e outras contas que o agente pode usar.',
    addConnector: '+ Adicionar',
    marketplaceTitle: 'Navegar conectores',
    workScopeHint: 'Estes conectores são do seu agente de Work.',
    authTitle: 'Conexão de aplicativo',
    authorize: 'Autorizar',
    waiting: 'Aguardando autorização…',
    authSecure: 'Autorização segura',
    connectAppPrompt:
      'Quero conectar o {app}. Chame já mcp_composio_COMPOSIO_MANAGE_CONNECTIONS (não use SEARCH_TOOLS antes) e cole o Connect Link (https://connect.composio.dev/link/...) na resposta para eu autorizar no chat.',
    connectApps: 'Conectar apps'
  },

  sidebar: {
    nav: {
      'session.new': 'Nova sessão',
      'new-session': 'Nova sessão',
      cron: 'Automações',
      skills: 'Personalizar',
      messaging: 'Canais',
      artifacts: 'Entregas'
    },
    account: {
      fallbackName: 'Conta',
      settings: 'Configurações',
      commandCenter: 'Command Center',
      language: 'Idioma',
      getHelp: 'Receber ajuda',
      viewPlans: 'Ver todos os planos',
      giveFeedback: 'Dar feedback',
      helpMenu: 'Ajuda e atalhos',
      updateAvailable: 'Atualização disponível',
      updateInstalling: 'A actualizar…',
      updateInstallingProgress: percent => `A actualizar… ${percent}%`,
      updateShort: 'Atualizar'
    },
    searchAria: 'Buscar sessões',
    searchPlaceholder: 'Buscar sessões…',
    clearSearch: 'Limpar busca',
    noMatch: query => `Nenhuma sessão corresponde a “${query}”.`,
    results: 'Resultados',
    pinned: 'Fixadas',
    shiftClickHint: 'Shift+clique num chat para fixar',
    sessions: 'Sessões',
    archived: 'Arquivados',
    cronJobs: 'Automações',
    noSessions: 'Ainda sem sessões',
    noSessionsInCheckout: 'Nenhuma sessão neste checkout',
    projectEmpty: 'Nenhuma sessão neste projeto',
    projects: {
      sectionLabel: 'Projetos',
      emptyOverview: 'Ainda sem projetos',
      newButton: 'Novo projeto',
      createTitle: 'Novo projeto',
      create: 'Criar',
      back: 'Todos os projetos',
      homeCheckout: 'Checkout principal',
      hoverBranch: 'Branch',
      hoverRepo: 'Repositório',
      hoverPath: 'Caminho local',
      sessionsCount: count => (count === 1 ? '1 sessão' : `${count} sessões`)
    }
  },

  titlebar: {
    openKeybinds: 'Atalhos de teclado'
  },

  shell: {
    statusbar: {
      closeCommandCenter: 'Fechar painel de controlo',
      openCommandCenter: 'Abrir painel de controlo',
      cron: 'Automações',
      openCron: 'Abrir automações',
      starmap: 'O que aprendi',
      selectModel: 'Selecionar modelo',
      switchModel: 'Selecionar modelo',
      openModelPicker: 'Selecionar modelo',
      modelTitle: (_provider, model) => model,
      providerModelTitle: (_provider, model) => model,
      yoloOn:
        'Aprovando sozinho — comandos perigosos auto-aprovados. Clique para desligar. Shift+clique altera globalmente.',
      yoloOff:
        'Aprovações ativas — clique para aprovar sozinho neste chat. Shift+clique altera globalmente.'
    },
    modelMenu: {
      autoMode: 'Auto',
      autoModeHint: 'Equilíbrio entre qualidade e velocidade — recomendado para a maioria das tarefas',
      switchToSpecific: 'Trocar para modelo específico',
      specificModel: 'Modelo específico',
      addModels: 'Adicionar modelos'
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
    title: 'Automações',
    close: 'Fechar automações',
    subtitle:
      'Automatize tarefas repetitivas com agentes na cloud sempre ativos que respondem a gatilhos do ambiente.',
    newCron: 'Nova automação',
    emptyTitleNew: 'Ainda sem automações',
    emptyDescNew:
      'Crie uma automação com agendamento e instruções. O Work4You executa e entrega o resultado no destino que escolher.',
    emptyDescSearch: 'Tente uma pesquisa mais ampla.',
    emptyTitleSearch: 'Sem resultados',
    createTitle: 'Nova automação',
    editTitle: 'Editar automação',
    createAction: 'Criar automação',
    createDesc:
      'Agende instruções para correr automaticamente. Use um preset ou uma frase como «a cada 15 minutos».',
    editDesc:
      'Atualize o gatilho, as instruções ou a entrega. As alterações aplicam-se na próxima execução.',
    nameLabel: 'Nome',
    namePlaceholder: 'Briefing matinal',
    promptLabel: 'Instruções',
    promptPlaceholder: 'Escreva @ para tools…',
    frequencyLabel: 'Agendamento',
    deliverLabel: 'Entregar em',
    customScheduleLabel: 'Agendamento personalizado',
    customPlaceholder: '0 9 * * * ou dias úteis às 9h',
    customHint: 'Expressão cron, ou frases como «a cada hora» ou «dias úteis às 9h».',
    optional: 'Opcional',
    saveChanges: 'Guardar alterações',
    triggerNow: 'Executar agora',
    edit: 'Editar automação',
    deleteTitle: 'Eliminar automação?',
    deleteDescPrefix: 'Isto remove ',
    deleteDescSuffix: ' permanentemente. Deixa de disparar de imediato.',
    deleting: 'A eliminar…',
    resumed: 'Automação retomada',
    paused: 'Automação em pausa',
    triggered: 'Automação disparada',
    deleted: 'Automação eliminada',
    created: 'Automação criada',
    updated: 'Automação atualizada',
    failedLoad: 'Falha ao carregar automações',
    failedUpdate: 'Falha ao atualizar automação',
    failedTrigger: 'Falha ao disparar automação',
    failedDelete: 'Falha ao eliminar automação',
    failedSave: 'Falha ao guardar automação',
    search: 'Buscar automações…',
    loading: 'A carregar automações…',
    count: count => `${count} ${count === 1 ? 'automação' : 'automações'}`,
    statTotal: 'Total de automações',
    statSuccessful24h: 'Com sucesso · 24h',
    statFailed24h: 'Com falha · 24h',
    statSuccessful7d: 'Com sucesso · 7d',
    statFailed7d: 'Com falha · 7d',
    statRunHistory: 'Histórico de execuções →',
    colName: 'Automações',
    colAuthor: 'Autor',
    colCreated: 'Criada',
    colStatus: 'Status',
    colTools: 'Ferramentas',
    colAutomation: 'Automação',
    colTriggered: 'Disparada',
    colDuration: 'Duração',
    authorYou: 'Você',
    statusActive: 'Ativa',
    statusInactive: 'Inativa',
    backToList: 'Voltar às automações',
    createdUnknown: '—',
    runsTitle: 'Histórico',
    emptyRunsTitle: 'Ainda sem execuções',
    searchRuns: 'Buscar execuções…',
    runStatusSuccess: 'Sucesso',
    runStatusFailed: 'Falha',
    runStatusRunning: 'A executar',
    runStatusCompleted: 'Concluída',
    promptScheduleRequired: 'Instruções e agendamento são obrigatórios.',
    states: {
      enabled: 'activa',
      scheduled: 'agendada',
      running: 'a executar',
      paused: 'em pausa',
      disabled: 'desactivada',
      error: 'erro',
      completed: 'concluída'
    },
    deliveryLabels: {
      local: 'Este desktop',
      telegram: 'Telegram',
      discord: 'Discord',
      slack: 'Slack',
      email: 'Email'
    },
    scheduleLabels: {
      daily: 'Diário',
      weekdays: 'Dias úteis',
      weekly: 'Semanal',
      monthly: 'Mensal',
      hourly: 'De hora em hora',
      'every-15-minutes': 'A cada 15 minutos',
      custom: 'Personalizado'
    },
    scheduleHints: {
      daily: 'Todos os dias às 9:00',
      weekdays: 'De segunda a sexta às 9:00',
      weekly: 'Todas as segundas às 9:00',
      monthly: 'No primeiro dia de cada mês às 9:00',
      hourly: 'Em cada hora cheia',
      'every-15-minutes': 'A cada 15 minutos',
      custom: 'Sintaxe cron ou linguagem natural'
    },
    days: {
      '0': 'domingo',
      '1': 'segunda-feira',
      '2': 'terça-feira',
      '3': 'quarta-feira',
      '4': 'quinta-feira',
      '5': 'sexta-feira',
      '6': 'sábado',
      '7': 'domingo'
    },
    dayFallback: value => `dia ${value}`,
    everyDayAt: time => `Todos os dias às ${time}`,
    weekdaysAt: time => `Dias úteis às ${time}`,
    everyDayOfWeekAt: (day, time) => `A cada ${day} às ${time}`,
    monthlyOnDayAt: (dayOfMonth, time) => `Mensalmente no dia ${dayOfMonth} às ${time}`,
    everyDayAtPrefix: 'Todos os dias às',
    weekdaysAtPrefix: 'Dias úteis às',
    everyDayOfWeekAtPrefix: day => `A cada ${day} às`,
    monthlyOnDayAtPrefix: dayOfMonth => `Mensalmente no dia ${dayOfMonth} às`,
    topOfHour: 'Em cada hora cheia',
    everyHourAt: minute => `De hora em hora aos :${minute}`,
    last: 'Última:',
    next: 'Próxima:',
    noRuns: 'Ainda sem execuções',
    manage: 'Gerir',
    showRuns: 'Mostrar execuções',
    hideRuns: 'Ocultar execuções',
    runHistory: 'Histórico de execuções',
    actionsFor: title => `Acções para ${title}`,
    actionsTitle: 'Acções da automação',
    resume: 'Retomar automação',
    pause: 'Pausar automação',
    resumeTitle: 'Retomar',
    pauseTitle: 'Pausar',
    triggersSection: 'Gatilhos',
    triggersHint:
      'Quando esta automação deve correr. Agendamento, eventos de apps (Composio) e webhook.',
    instructionsSection: 'Instruções do agente',
    instructionsHint: 'O que o agente deve fazer cada vez que esta automação dispara.',
    toolsSection: 'Ferramentas',
    toolsHint: 'O agente usa as suas apps e ferramentas ligadas. Gerencie conectores e canais abaixo.',
    openConnectors: 'Conectores',
    openChannels: 'Canais',
    tabSettings: 'Definições',
    tabHistory: 'Histórico',
    addTrigger: 'Adicionar gatilho',
    searchTriggers: 'Buscar gatilhos…',
    scheduledTrigger: 'Agendado',
    composioTriggers: 'Eventos de apps',
    webhookTrigger: 'Webhook',
    webhookHint:
      'Ative o canal webhook para obter um URL, ou adicione um evento de app para registar o webhook Composio.',
    noScheduleYet: 'Ainda sem agendamento — adicione um gatilho Agendado.',
    nextRunAt: when => `Próxima execução: ${when}`,
    triggerAdded: 'Gatilho adicionado',
    triggerRemoved: 'Gatilho removido',
    failedAddTrigger: 'Não foi possível adicionar o gatilho',
    failedRemoveTrigger: 'Não foi possível remover o gatilho',
    triggerNeedsConnection:
      'Ligue o {app} em Conectores primeiro e depois adicione este gatilho outra vez.',
    loadingTriggers: 'A carregar gatilhos de apps…',
    triggerSoonHint: 'Na fila — deve disparar no próximo tick do agendador (~1 min).',
    modelLabel: 'Modelo',
    modelDefault: 'Predefinição do perfil',
    addToolOrMcp: 'Adicionar ferramenta ou MCP',
    memoriesTool: 'Memórias',
    memoriesHint: 'Usa as notas de memória deste perfil (USER.md).',
    memoriesManageHint: 'Edite as notas do perfil. Execuções cron não carregam memória de sessão.',
    toolAdded: 'Adicionado',
    deliverHint: 'Para onde enviar o resultado quando a automação terminar.',
    sendToChannel: channel => `Enviar para ${channel}`,
    connectChannel: 'Ligar',
    noFolder: 'Sem pasta',
    chooseFolder: 'Escolher pasta…',
    failedPickFolder: 'Não foi possível escolher a pasta',
    historySaveFirst: 'Guarde a automação para ver o histórico de execuções.',
    webhookSavedPartial: 'Webhook não registado por completo',
    webhookNeedsGateway: 'Ative o canal webhook (Canais) para a rota receber POSTs.'
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
      skills: { title: 'Personalizar', detail: 'Skills, conectores e MCP' },
      messaging: { title: 'Canais', detail: 'Telegram, Slack, Discord e mais' },
      artifacts: { title: 'Entregas', detail: 'Ver resultados gerados' }
    }
  },

  language: {
    label: 'Idioma',
    description: 'Idioma da interface do desktop.',
    saving: 'A guardar idioma…',
    saveError: 'Não foi possível atualizar o idioma',
    switchTo: 'Mudar idioma',
    searchPlaceholder: 'Buscar idiomas…',
    noResults: 'Nenhum idioma encontrado'
  },

  rightSidebar: {
    browser: {
      tab: 'Browser',
      idleTitle: 'Nenhuma página ativa',
      emptyTitle: 'Browser em espera',
      emptyBody: 'Quando o agente abrir ou inspecionar uma página, o URL e o último print aparecem aqui.',
      screenshotAlt: 'Último screenshot do browser',
      waitingShot: 'A navegar… o screenshot aparece quando o agente capturar.',
      noShot: 'Ainda sem screenshot desta página.',
      statusIdle: 'Inativo',
      statusRunning: 'A navegar',
      statusComplete: 'Pronto',
      statusError: 'Erro'
    }
  },

  settings: {
    closeSettings: 'Fechar configurações',
    nav: {
      general: 'Geral',
      account: 'Conta',
      providers: 'Provedores',
      providerAccounts: 'Contas',
      providerApiKeys: 'Chaves API',
      modelsApiKeys: 'Chaves API de modelos',
      gateway: 'Gateway',
      apiKeys: 'Ferramentas e chaves',
      keysTools: 'Ferramentas',
      keysSettings: 'Definições',
      mcp: 'MCP',
      archivedChats: 'Chats arquivados',
      about: 'Sobre',
      notifications: 'Notificações'
    },
    mcp: {
      newServer: '+ Novo',
      installedCount: count => `Instalados ${count}`,
      emptyTitle: 'Ligar ferramentas externas com MCP',
      emptyDesc:
        'Servidores Model Context Protocol ligam a Work4You a ferramentas e fontes externas como Linear, Figma e Notion.'
    },
    keys: {
      loading: 'A carregar chaves e credenciais…',
      failedLoad: 'Falha ao carregar as chaves',
      empty: 'Nada corresponde nesta categoria.',
      search: 'Pesquisar chaves…',
      toolsTitle: 'Ferramentas',
      toolsIntro:
        'Chaves API para pesquisa, navegador, média e memória. O Work4You funciona sem elas — adicione só quando precisar dessa capacidade.',
      settingsTitle: 'Definições',
      settingsIntro:
        'Variáveis de ambiente do agente local, relay do gateway e extras de canais. Preferências do dia a dia ficam em Geral / Aparência — isto é para power users.',
      groups: {
        search: 'Pesquisa e extração web',
        browser: 'Navegador',
        media: 'Imagem, vídeo e voz',
        memory: 'Provedores de memória',
        skills: 'Hub de skills',
        observability: 'Observabilidade',
        advanced: 'Avançado',
        other: 'Outras ferramentas',
        gateway: 'Gateway e servidor API',
        agent: 'Runtime do agente',
        channels: 'Extras de canais'
      }
    },
    general: {
      title: 'Geral',
      intro:
        'Preferências do dia a dia. O visual fica em Aparência; modelos ficam na secção própria.',
      preferences: 'Preferências',
      workspace: 'Espaço de trabalho',
      personality: 'Como o assistente fala',
      personalityDesc: 'Tom padrão para novas sessões. Ainda pode mudar o estilo no chat quando precisar.',
      personalities: {
        helpful: 'Prestativo',
        concise: 'Conciso',
        technical: 'Técnico',
        creative: 'Criativo',
        teacher: 'Professor',
        kawaii: 'Kawaii',
        catgirl: 'Catgirl',
        pirate: 'Pirata',
        shakespeare: 'Shakespeare',
        surfer: 'Surfista',
        noir: 'Noir',
        uwu: 'UwU',
        philosopher: 'Filósofo',
        hype: 'Empolgado'
      },
      permissions: 'Permissões',
      readAloud: 'Ler respostas em voz alta',
      readAloudDesc: 'Fala automaticamente as respostas do assistente. Os provedores de voz ficam em Voz.',
      showThinking: 'Mostrar raciocínio',
      showThinkingDesc:
        'Mostra o pensamento do modelo quando ele partilha esses passos. Não afecta o estado a trabalhar, temporizadores nem o progresso das ferramentas.',
      alerts: 'Avisos',
      manageAlerts: 'Gerir todos os avisos',
      app: 'Aplicação',
      openAbout: 'Sobre o Work4You',
      shortcuts: 'Atalhos de teclado',
      shortcutVoice: 'Iniciar conversa por voz',
      shortcutUnbound: 'Não definido',
      viewAllShortcuts: 'Ver todos os atalhos'
    },
    voice: {
      title: 'Voz',
      speaking: 'Falar',
      listening: 'Ouvir',
      recording: 'Gravação',
      previewVoice: 'Pré-ouvir',
      previewing: 'A reproduzir…',
      previewFailed: 'Não foi possível pré-ouvir essa voz.',
      shortcut: 'Atalho de voz',
      shortcutDesc: 'Atalho de teclado para iniciar ou parar uma conversa por voz nesta app.',
      shortcutUnbound: 'Não definido',
      manageShortcut: 'Alterar atalho',
      fields: {
        'voice.auto_tts': {
          label: 'Ler respostas em voz alta',
          description: 'Fala automaticamente as respostas do assistente após cada turno.'
        },
        'tts.provider': {
          label: 'Motor de voz',
          description: 'Serviço que transforma texto em fala.'
        },
        'tts.edge.voice': {
          label: 'Voz',
          description: 'Escolha a voz usada na leitura em voz alta.'
        },
        'tts.openai.voice': { label: 'Voz' },
        'tts.openai.model': { label: 'Modelo' },
        'tts.elevenlabs.voice_id': { label: 'Voz' },
        'tts.elevenlabs.model_id': { label: 'Modelo' },
        'tts.xai.voice_id': { label: 'Voz' },
        'tts.xai.language': { label: 'Idioma' },
        'tts.minimax.voice_id': { label: 'Voz' },
        'tts.minimax.model': { label: 'Modelo' },
        'tts.mistral.voice_id': { label: 'Voz' },
        'tts.mistral.model': { label: 'Modelo' },
        'tts.gemini.voice': { label: 'Voz' },
        'tts.gemini.model': { label: 'Modelo' },
        'tts.neutts.model': { label: 'Modelo' },
        'tts.neutts.device': { label: 'Dispositivo' },
        'tts.kittentts.voice': { label: 'Voz' },
        'tts.kittentts.model': { label: 'Modelo' },
        'tts.piper.voice': { label: 'Voz' },
        'stt.enabled': {
          label: 'Fala para texto',
          description: 'Transforma o microfone em texto no chat.'
        },
        'stt.provider': {
          label: 'Motor de transcrição',
          description: 'Onde a fala é convertida em texto.'
        },
        'stt.local.model': {
          label: 'Modelo local',
          description: 'Modelos maiores são mais precisos e mais lentos.'
        },
        'stt.local.language': {
          label: 'Idioma',
          description: 'Sugestão de idioma (ex.: pt, en). Em branco, deteta automaticamente.'
        },
        'stt.openai.model': { label: 'Modelo' },
        'stt.groq.model': { label: 'Modelo' },
        'stt.mistral.model': { label: 'Modelo' },
        'stt.elevenlabs.model_id': { label: 'Modelo' },
        'stt.elevenlabs.language_code': { label: 'Idioma' },
        'stt.elevenlabs.tag_audio_events': { label: 'Marcar eventos de áudio' },
        'stt.elevenlabs.diarize': { label: 'Separar oradores' },
        'voice.max_recording_seconds': {
          label: 'Duração máxima da gravação',
          description: 'Para a gravação automaticamente após estes segundos.'
        }
      }
    },
    sections: {
      model: 'Modelos',
      chat: 'Chat',
      appearance: 'Aparência',
      workspace: 'Espaço de trabalho',
      'browser-network': 'Navegador e rede',
      safety: 'Segurança',
      memory: 'Memória e contexto',
      voice: 'Voz',
      advanced: 'Avançado'
    },
    browserNetwork: {
      title: 'Navegador e rede',
      intro:
        'Controla se o Work4You e o navegador podem aceder à sua rede local, localhost e endereços privados — necessário em muitos fluxos reais.',
      network: 'Acesso à rede'
    },
    advancedPage: {
      title: 'Avançado',
      intro:
        'Definições de potência: aprovações, orçamentos de memória, terminal e limites do agente. O dia a dia fica em Geral, Memória, Modelos, Sobre e Navegador e rede.',
      groups: {
        tools: 'Ferramentas e aprovações',
        memory: 'Orçamentos de memória',
        workspace: 'Espaço de trabalho e terminal',
        agent: 'Limites do agente'
      },
      fields: {
        'approvals.timeout': {
          label: 'Tempo limite de aprovação',
          description: 'Segundos de espera pela sua resposta antes de o pedido expirar.'
        },
        'approvals.mcp_reload_confirm': {
          label: 'Confirmar recarga de conectores',
          description: 'Pedir confirmação antes de recarregar conectores MCP a meio da sessão.'
        },
        command_allowlist: {
          label: 'Comandos sempre permitidos',
          description: 'Padrões que podem correr sem perguntar de novo (avançado).'
        },
        'memory.memory_char_limit': {
          label: 'Limite de tamanho da memória',
          description: 'Limite aproximado de caracteres para notas guardadas.'
        },
        'memory.user_char_limit': {
          label: 'Limite de tamanho do perfil',
          description: 'Limite aproximado de caracteres para o seu perfil.'
        },
        'memory.provider': {
          label: 'Onde guardar a memória',
          description: 'Onde a memória duradoura é guardada. Neste computador funciona offline.'
        },
        'context.engine': {
          label: 'Estratégia para chats longos',
          description: 'Como o Work4You trata conversas perto do limite de contexto.'
        },
        'compression.enabled': {
          label: 'Resumir chats longos',
          description: 'Comprime contexto antigo quando as conversas ficam grandes.'
        },
        'compression.threshold': {
          label: 'Quando resumir',
          description: 'Quão cheia deve estar a janela de contexto antes de resumir (0–1).'
        },
        'compression.target_ratio': {
          label: 'Quanto libertar',
          description: 'Quanto da janela libertar quando o resumo corre (0–1).'
        },
        'compression.protect_last_n': {
          label: 'Manter mensagens recentes',
          description: 'Deixa as últimas N mensagens intactas ao resumir.'
        },
        model_context_length: {
          label: 'Limite de tamanho da conversa',
          description:
            'Máximo de tokens que o chat consegue “lembrar”. 0 = usar o limite oficial do modelo selecionado.'
        },
        fallback_providers: {
          label: 'Modelos de reserva se o principal falhar',
          description: 'Modelos a tentar a seguir quando o principal está indisponível ou dá erro.'
        },
        'terminal.cwd': {
          label: 'Pasta de trabalho',
          description: 'Pasta de projeto predefinida para ferramentas e terminal.'
        },
        'code_execution.mode': {
          label: 'Modo de execução de código',
          description: 'Quão estritamente a execução de código fica limitada ao projeto atual.'
        },
        'terminal.persistent_shell': {
          label: 'Shell persistente',
          description: 'Mantém o estado do shell entre comandos quando o backend o permite.'
        },
        'terminal.env_passthrough': {
          label: 'Variáveis de ambiente',
          description: 'Variáveis de ambiente a passar para a execução de ferramentas.'
        },
        file_read_max_chars: {
          label: 'Limite de leitura de ficheiros',
          description: 'Máximo de caracteres que o agente pode ler num pedido de ficheiro.'
        },
        'terminal.backend': {
          label: 'Backend de execução',
          description: 'Onde os comandos de terminal correm (este PC, Docker, cloud, …).'
        },
        'terminal.timeout': {
          label: 'Tempo limite do comando',
          description: 'Segundos até um comando de terminal ser cancelado.'
        },
        'terminal.docker_image': {
          label: 'Imagem Docker',
          description: 'Imagem de contentor quando o backend é Docker.'
        },
        'terminal.singularity_image': {
          label: 'Imagem Singularity',
          description: 'Imagem quando o backend é Singularity.'
        },
        'terminal.modal_image': {
          label: 'Imagem Modal',
          description: 'Imagem quando o backend é Modal.'
        },
        'terminal.daytona_image': {
          label: 'Imagem Daytona',
          description: 'Imagem quando o backend é Daytona.'
        },
        'tool_output.max_bytes': {
          label: 'Limite de saída das ferramentas',
          description: 'Máximo de bytes de um resultado de ferramenta/terminal no contexto.'
        },
        'tool_output.max_lines': {
          label: 'Limite de linhas da saída',
          description: 'Máximo de linhas guardadas de um resultado longo.'
        },
        'tool_output.max_line_length': {
          label: 'Limite de comprimento da linha',
          description: 'Máximo de caracteres por linha antes de truncar.'
        },
        'checkpoints.max_snapshots': {
          label: 'Limite de checkpoints',
          description: 'Quantos checkpoints de ficheiros manter antes de apagar os mais antigos.'
        },
        'agent.max_turns': {
          label: 'Máximo de passos do agente',
          description: 'Limite superior de turnos com ferramentas antes de a corrida parar.'
        },
        'agent.image_input_mode': {
          label: 'Quando anexa uma foto',
          description:
            'Como as imagens anexadas são enviadas ao modelo. Recomendado é o padrão certo para quase toda a gente.'
        },
        'agent.api_max_retries': {
          label: 'Tentativas de API',
          description: 'Quantas vezes repetir uma chamada de modelo que falhou.'
        },
        'agent.service_tier': {
          label: 'Nível de serviço',
          description: 'Nível de serviço da API (OpenAI / Anthropic). Deixe none para o padrão.'
        },
        'agent.tool_use_enforcement': {
          label: 'Obrigatoriedade de ferramentas',
          description: 'Quão estritamente o modelo deve usar ferramentas quando o turno as espera.'
        },
        'delegation.model': {
          label: 'Modelo do subagente',
          description: 'Qual modelo ativo os trabalhadores delegados usam. Herdar usa o modelo do chat pai.'
        },
        'delegation.provider': {
          label: 'Provedor do subagente',
          description: 'Caminho de API/credenciais dos subagentes. Preenchido automaticamente ao escolher o modelo.'
        },
        'delegation.max_iterations': {
          label: 'Limite de turnos do subagente',
          description: 'Máximo de turnos com ferramentas por subagente.'
        },
        'delegation.max_concurrent_children': {
          label: 'Subagentes em paralelo',
          description: 'Quantos subagentes podem correr ao mesmo tempo.'
        },
        'delegation.child_timeout_seconds': {
          label: 'Tempo limite do subagente',
          description: 'Cancela o subagente após estes segundos (0 = sem limite).'
        },
        'delegation.reasoning_effort': {
          label: 'Esforço de raciocínio do subagente',
          description: 'Esforço de raciocínio para subagentes delegados.'
        },
        'updates.non_interactive_local_changes': {
          label: 'Atualização na app: alterações locais',
          description:
            'Quando a app se atualiza sozinha (sem prompt no terminal), guardar edições locais (stash) ou descartá-las. Atualizações no terminal perguntam sempre.'
        }
      }
    },
    model: {
      title: 'Modelos',
      loading: 'A carregar configuração de modelos…',
      pageIntro: 'O modelo do chat escolhe-se no composer. Esta página configura o conselho executivo.',
      composerIntro:
        'Escolha quais modelos aparecem no seletor do chat. Ative um modelo para o usar em novas mensagens.',
      subagentsGroup: 'Subagentes',
      subagentsIntro:
        'Modelo e raciocínio para trabalhadores delegados (`delegate_task`). Herdar mantém o modelo do chat pai e a respetiva API.',
      overridesGroup: 'Contexto e fiabilidade',
      overridesIntro: 'Quanto o chat pode crescer, e o que tentar se o modelo falhar.',
      contextLimitLabel: 'Limite de tamanho da conversa',
      contextLimitDesc:
        'Máximo de tokens que este chat consegue “lembrar”. Automático usa o limite oficial do modelo selecionado — deixe assim, a não ser que precise de menos.',
      contextLimitAuto: 'Automático (limite oficial do modelo)',
      contextLimitCustom: 'Limite personalizado',
      contextLimitTokensPlaceholder: 'ex.: 128000',
      fallbackLabel: 'Modelos de reserva se o principal falhar',
      fallbackDesc: 'Tentados por ordem se o modelo do chat estiver indisponível, com limite de pedidos ou a dar erro.',
      fallbackEmpty: 'Nenhum — ficar só no modelo principal',
      fallbackAdd: 'Adicionar modelo de reserva…',
      fallbackRemove: 'Remover modelo de reserva',
      imageModeLabel: 'Quando anexa uma foto',
      imageModeDesc: 'Como o Work4You entrega imagens ao modelo.',
      imageModes: {
        auto: 'Recomendado — decidir para este modelo',
        native: 'Enviar a foto como imagem',
        text: 'Descrever a foto em texto primeiro'
      },
      inheritFromParent: 'Herdar do pai',
      featuredContextWindow: size => `${size} de janela de contexto`,
      featuredVersionLine: version => `Versão: ${version}`,
      featuredVersions: {
        highEffort: 'alto esforço',
        fast: 'rápido'
      },
      featuredCards: {
        'x-ai/grok-4.5': {
          description:
            'O modelo mais capaz da SpaceXAI para programação, trabalho de conhecimento e STEM.'
        },
        'anthropic/claude-opus-5': {
          title: 'Claude Opus 5',
          description: 'Classe Opus da Anthropic — forte em tarefas difíceis.'
        },
        'openai/gpt-5.6-sol': {
          description: 'GPT-5.6 principal para raciocínio complexo, código e trabalho agentico.'
        },
        'anthropic/claude-fable-5': {
          title: 'Claude Fable 5',
          description: 'Modelo classe Mythos para trabalho autónomo de conhecimento e código longo.'
        },
        'anthropic/claude-sonnet-5': {
          title: 'Claude Sonnet 5',
          description: 'O Sonnet mais capaz da Anthropic para código, agentes e trabalho profissional.'
        },
        'openai/gpt-5.6-terra': {
          description: 'GPT-5.6 equilibrado entre o Sol (topo) e o Luna (custo).'
        },
        'anthropic/claude-sonnet-4.6': {
          title: 'Claude Sonnet 4.6',
          description: 'Sonnet sólido para código, agentes e trabalho profissional.'
        },
        'anthropic/claude-opus-4.8': {
          title: 'Claude Opus 4.8',
          description: 'O Opus mais capaz da Anthropic para trabalho agentico exigente.'
        },
        'openai/gpt-5.5': {
          description: 'Modelo de fronteira para cargas profissionais complexas com bom raciocínio.'
        },
        'openai/gpt-5.3-codex': {
          title: 'GPT-5.3 Codex',
          description: 'Modelo Codex da OpenAI para engenharia de software agentica.'
        },
        'anthropic/claude-opus-4.7': {
          title: 'Claude Opus 4.7',
          description: 'Opus de nova geração para agentes longos e assíncronos.'
        },
        'openai/gpt-5.4': {
          description: 'Une as linhas Codex e GPT com uma janela de contexto grande.'
        },
        'anthropic/claude-opus-4.6': {
          title: 'Claude Opus 4.6',
          description: 'Opus forte para código e tarefas profissionais longas.'
        },
        'anthropic/claude-opus-4.5': {
          title: 'Claude Opus 4.5',
          description: 'Raciocínio de fronteira otimizado para engenharia de software complexa.'
        },
        'openai/gpt-5.2': {
          description: 'Série GPT-5 de fronteira com bom desempenho agentico e de longo contexto.'
        },
        'openai/gpt-5.6-luna': {
          description: 'GPT-5.6 rápido e económico para volume alto e baixa latência.'
        },
        'google/gemini-3.6-flash': {
          description: 'Modelo Google eficiente para código, agentes e desenvolvimento de apps.'
        },
        'google/gemini-3.1-pro-preview': {
          title: 'Gemini 3.1 Pro',
          description: 'Raciocínio de fronteira da Google com forte desempenho em engenharia de software.'
        },
        'openai/gpt-5.4-mini': {
          description: 'GPT-5.4 mais rápido e eficiente para alto débito.'
        },
        'openai/gpt-5.4-nano': {
          description: 'Variante mais leve do GPT-5.4, otimizada para velocidade.'
        },
        'anthropic/claude-haiku-4.5': {
          title: 'Claude Haiku 4.5',
          description: 'O modelo eficiente mais rápido da Anthropic, perto da fronteira.'
        },
        'anthropic/claude-sonnet-4.5': {
          title: 'Claude Sonnet 4.5',
          description: 'Sonnet avançado para agentes reais e fluxos de código.'
        },
        'openai/gpt-5.1': {
          description: 'Série GPT-5 de fronteira com forte raciocínio geral.'
        },
        'google/gemini-3-flash-preview': {
          title: 'Gemini 3 Flash',
          description: 'Pensamento rápido para fluxos agenticos e chat multi-turno.'
        },
        'google/gemini-3.5-flash': {
          description: 'Multimodal eficiente da Google, perto do nível Pro em código e raciocínio.'
        },
        'anthropic/claude-sonnet-4': {
          title: 'Claude Sonnet 4',
          description: 'Sonnet sólido para código e raciocínio.'
        },
        'openai/gpt-5-mini': {
          description: 'GPT-5 compacto para tarefas de raciocínio mais leves.'
        },
        'google/gemini-2.5-flash': {
          description: 'Modelo de trabalho da Google para raciocínio, código e multimodal.'
        },
        'moonshotai/kimi-k2.7-code': {
          description: 'Kimi K2 focado em programação ponta a ponta.'
        },
        'z-ai/glm-5.2': {
          description: 'Modelo de raciocínio em larga escala da Z.ai com 1M de tokens de contexto.'
        }
      },
      pickerGroup: 'Modelos',
      moreModels: 'Mais…',
      showLessModels: 'Mostrar menos',
      addMoreModels: '+ Adicionar mais LLM',
      addMoreTitle: 'Adicionar modelos',
      addMoreIntro: 'Navegue no catálogo completo e escolha quais modelos aparecem no seletor do chat.',
      addMoreSearch: 'Pesquisar modelos…',
      backToModels: 'Voltar a Modelos',
      viewAllModels: 'Mais…',
      viewAllTitle: 'Mais modelos',
      noCatalogModels: 'Ainda não há modelos do catálogo disponíveis.',
      apiKeysDisclosure: 'Chaves API',
      apiKeysIntro:
        'Use as suas próprias chaves de provedor (BYOK). O uso é cobrado na conta do provedor — não no plano Work4You.',
      apiKeysEmpty: 'Não há chaves próprias para configurar.',
      moaDisclosure: 'Conselho executivo · Mixture of Agents',
      moaUnavailable: 'O conselho executivo não está disponível neste momento.',
      defaultGroup: 'Modelo padrão',
      appliesDesc:
        'O composer grava o modelo padrão do perfil. Pode trocar a qualquer momento no chat atual.',
      provider: 'Provedor',
      model: 'Modelo',
      applying: 'A aplicar…',
      activate: 'Ativar',
      activating: 'A ativar…',
      pasteApiKey: env => `Cole ${env}`,
      setupProvider: name => `Configurar ${name}`,
      setupNeedsKey: name => `${name} precisa de uma API key — configure para escolher um modelo.`,
      setupNeedsBrowser: name => `${name} inicia sessão no browser — o Work4You trata do fluxo.`,
      defaultsLabel: 'Predefinições',
      reasoning: 'Raciocínio',
      reasoningOff: 'Desligado',
      defaultsFailed: 'Não foi possível guardar as predefinições do modelo',
      auxiliaryTitle: 'Modelos auxiliares',
      resetAllToMain: 'Repor tudo no padrão',
      auxiliaryDesc: 'Tarefas em segundo plano usam o modelo padrão, a menos que atribua outro.',
      setToMain: 'Usar padrão',
      change: 'Alterar',
      autoUseMain: 'auto · usar modelo padrão',
      providerDefault: '(padrão do provedor)',
      staleAuxWarning: (count, names, provider) =>
        `${count} tarefa${count === 1 ? '' : 's'} auxiliar${count === 1 ? '' : 'es'} (${names}) ainda corre${count === 1 ? '' : 'm'} em ${provider}, não no modelo padrão.`,
      otherProviders: 'outros provedores',
      moaTitle: 'Conselho executivo · Mixture of Agents',
      moaDesc: 'Escolhe os modelos do catálogo. Guarda para aplicar neste perfil.',
      moaIntro:
        'Vários modelos aconselham em paralelo. O presidente decide e executa com as ferramentas do agente.',
      moaPreset: 'Preset',
      moaSetDefault: 'Definir padrão',
      moaNewPreset: 'novo preset',
      moaAddPreset: 'Adicionar preset',
      moaDefault: 'Padrão',
      moaAdvisorsSection: 'Conselheiros',
      moaChairSection: 'Presidente',
      moaReference: n => `Conselheiro ${n}`,
      moaAdvisorHint: 'Opinião independente — não executa.',
      moaAddReference: 'Adicionar conselheiro',
      moaAggregator: 'Presidente',
      moaChairHint: 'Decide e age com as ferramentas do agente.',
      moaCatalogProvider: 'Catálogo',
      tasks: {
        vision: { label: 'Visão', hint: 'Análise de imagens' },
        web_extract: { label: 'Extrair web', hint: 'Resumo de páginas' },
        compression: { label: 'Compressão', hint: 'Compactar contexto' },
        skills_hub: { label: 'Hub de skills', hint: 'Busca de skills' },
        approval: { label: 'Aprovação', hint: 'Auto-aprovar com critério' },
        mcp: { label: 'MCP', hint: 'Roteamento de conectores' },
        title_generation: { label: 'Títulos', hint: 'Títulos das sessões' },
        curator: { label: 'Curador', hint: 'Revisão de uso de skills' }
      }
    },
    account: {
      title: 'Conta',
      profileGroup: 'Perfil',
      displayName: 'Nome',
      email: 'Email',
      signedOutName: 'Sem sessão',
      signedOutEmail: 'Inicie sessão para sincronizar a conta Work4You entre dispositivos.',
      planUsageGroup: 'Plano e uso',
      currentPlan: 'Plano atual',
      currentPlanDesc:
        'O uso incluído reinicia em cada ciclo. O on-demand começa depois de esgotar o pool incluído.',
      planHobby: 'Hobby',
      planStatusPastDue: 'Pagamento em atraso',
      planStatusCanceled: 'Cancelado',
      upgrade: 'Fazer upgrade',
      includedUsage: 'Uso incluído',
      includedUsageDesc: 'Percentagem do pool incluído do plano usado neste ciclo.',
      includedUsagePct: pct => `${pct}% usado`,
      includedUsageUnavailable: 'Medidor indisponível',
      includedDepleted: 'Pool incluído esgotado',
      onDemand: 'Uso on-demand',
      onDemandDesc: 'Continue a trabalhar depois de esgotar o incluído, até ao limite de gasto. O overage é reportado no fim do ciclo e cobrado na próxima fatura.',
      onDemandNeedsSubscription: 'Requer um plano pago ativo com cartão associado.',
      onDemandInactive: 'Desligado',
      onDemandUsage: 'On-demand neste ciclo',
      onDemandUsageDesc: 'Estimativa além do uso incluído. Não é cobrado ao vivo — entra na próxima fatura Stripe.',
      onDemandUsageValue: (used, limit) => `$${used.toFixed(2)} / $${limit.toFixed(2)}`,
      spendLimit: 'Limite de gasto',
      spendLimitDesc: max => `Teto por ciclo (máx. $${max.toFixed(0)}). Sobe o teto de uso; não altera a mensalidade do plano.`,
      spendLimitSave: 'Guardar',
      spendLimitSaving: 'A guardar…',
      spendLimitSaveFailed: 'Não foi possível guardar o limite de gasto',
      manageSubscription: 'Gerir subscrição',
      manageSubscriptionDesc: 'Mudar plano, método de pagamento ou cancelar no Stripe.',
      manageSubscriptionNoCustomer: 'Ainda sem subscrição Stripe — abra Planos para assinar.',
      planLogicHint:
        'Primeiro o pool incluído, depois on-demand até ao limite. O overage é cobrado na próxima fatura. Command Center → Usage é telemetria do agente, não faturação.'
    },
    memoryPage: {
      title: 'Memória e contexto',
      memory: 'Memória',
      memoryIntro: 'O que o Work4You guarda entre sessões — factos úteis e um perfil compacto sobre si.',
      manageRow: 'Ver e gerir memória',
      manageRowDesc: 'Revê o seu perfil e vê quanto está guardado neste computador.',
      manageTitle: 'A sua memória',
      manageDesc:
        'Edite o perfil que o Work4You usa sobre si. Onde guardar e resumir chats longos ficam nesta página.',
      manageProvider: 'Armazenamento',
      manageMemorySize: 'Notas',
      manageProfileSize: 'Perfil',
      manageProfileLabel: 'Perfil sobre si',
      manageProfilePlaceholder: 'Preferências, factos e contexto que quer que o Work4You lembre…',
      manageLoadFailed: 'Não foi possível carregar a memória',
      manageSaveFailed: 'Não foi possível guardar o perfil',
      manageSaved: 'Perfil guardado',
      manageSavedDesc: 'O Work4You vai usar isto em chats futuros.',
      builtinProvider: 'Neste computador',
      resetRow: 'Redefinir memórias',
      resetDesc: 'Apaga notas e o perfil guardados neste computador.',
      resetAction: 'Redefinir',
      resetConfirm: 'Redefinir tudo',
      resetConfirmDesc:
        'Isto apaga permanentemente MEMORY.md e USER.md deste perfil. Não é possível desfazer.',
      resetDone: 'Memórias redefinidas',
      resetDoneDesc: 'Notas e perfil foram limpos.',
      importGroup: 'De outra IA',
      importRow: 'Trazer memória de outra IA',
      importRowDesc: 'Cole um resumo do ChatGPT, Claude ou outro assistente no seu perfil.',
      importAction: 'Iniciar importação',
      importTitle: 'Importar memória',
      importDesc: 'Copie um prompt para outra IA e cole a resposta aqui. Nada sai deste computador.',
      importStep1Title: '1. Peça à outra IA',
      importStep1Desc: 'Abra o ChatGPT, Claude ou outro assistente e envie este prompt:',
      importPrompt:
        'Por favor resume o que sabes sobre mim num perfil estruturado que eu possa colar noutro assistente. Inclui preferências, projetos, estilo de trabalho, ferramentas que uso e factos estáveis. Usa bullet points curtos e claros. Omite segredos, passwords e chaves de API.',
      importCopyFailed: 'Não foi possível copiar o prompt',
      importStep2Title: '2. Cole a resposta',
      importStep2Desc: 'Vamos acrescentá-la ao seu perfil Work4You (USER.md).',
      importPastePlaceholder: 'Cole aqui o resumo da outra IA…',
      importEnableProfileHint: 'O perfil será ligado quando guardar.',
      importConfirm: 'Adicionar ao perfil',
      importTooLong: limit =>
        `Esse resumo é demasiado longo para o limite do perfil (${limit} caracteres). Encurte e tente de novo.`,
      importSaveFailed: 'Não foi possível importar a memória',
      importSaved: 'Memória importada',
      importSavedDesc: 'O resumo foi adicionado ao seu perfil.',
      providers: {
        builtin: 'Neste computador',
        hindsight: 'Hindsight',
        honcho: 'Honcho'
      },
      fields: {
        'memory.memory_enabled': {
          label: 'Guardar o que importa entre chats',
          description: 'Guarda factos úteis para não ter de se repetir.'
        },
        'memory.user_profile_enabled': {
          label: 'Lembrar preferências sobre mim',
          description: 'Mantém um perfil compacto de como gosta de trabalhar.'
        },
        'memory.memory_char_limit': {
          label: 'Limite de tamanho da memória',
          description: 'Limite aproximado de caracteres para notas guardadas.'
        },
        'memory.user_char_limit': {
          label: 'Limite de tamanho do perfil',
          description: 'Limite aproximado de caracteres para o seu perfil.'
        },
        'memory.provider': {
          label: 'Onde guardar a memória',
          description: 'Onde a memória duradoura é guardada. Neste computador funciona offline.'
        },
        'context.engine': {
          label: 'Estratégia para chats longos',
          description: 'Como o Work4You trata conversas perto do limite de contexto.'
        },
        'compression.enabled': {
          label: 'Resumir chats longos',
          description: 'Comprime contexto antigo quando as conversas ficam grandes.'
        },
        'compression.threshold': {
          label: 'Quando resumir',
          description: 'Quão cheia deve estar a janela de contexto antes de resumir.'
        },
        'compression.target_ratio': {
          label: 'Quanto libertar',
          description: 'Quanto da janela libertar quando o resumo corre.'
        },
        'compression.protect_last_n': {
          label: 'Manter mensagens recentes',
          description: 'Deixa as últimas N mensagens intactas ao resumir.'
        }
      }
    },
    safety: {
      title: 'Segurança',
      approvals: 'Aprovações',
      commands: 'Comandos',
      privacy: 'Privacidade e rede',
      recovery: 'Recuperação',
      approvalModes: {
        manual: 'Perguntar sempre',
        smart: 'Inteligente',
        off: 'Nunca perguntar'
      },
      yoloDisarmFailed:
        'Guardado, mas esta conversa continua a ignorar permissões. Use /yolo ou abra uma conversa nova para a limpar.',
      fields: {
        'approvals.mode': {
          label: 'Modo de aprovação',
          description: 'Quando o Work4You deve pedir autorização antes de correr comandos sensíveis.'
        },
        'approvals.timeout': {
          label: 'Tempo limite de aprovação',
          description: 'Segundos de espera pela sua resposta antes de o pedido expirar.'
        },
        'approvals.mcp_reload_confirm': {
          label: 'Confirmar recarga de conectores',
          description: 'Pedir confirmação antes de recarregar conectores MCP a meio da sessão.'
        },
        'command_allowlist': {
          label: 'Comandos sempre permitidos',
          description: 'Padrões que podem correr sem perguntar de novo (avançado).'
        },
        'security.redact_secrets': {
          label: 'Ocultar segredos',
          description: 'Esconde chaves e tokens detetados do conteúdo visível ao modelo, quando possível.'
        },
        'security.allow_private_urls': {
          label: 'Permitir URLs de rede privada',
          description: 'Deixa as ferramentas aceder a endereços na sua rede local / privada.'
        },
        'browser.allow_private_urls': {
          label: 'Navegador: URLs de rede privada',
          description: 'Permite ao navegador abrir endereços da rede privada.'
        },
        'browser.auto_local_for_private_urls': {
          label: 'Usar navegador local para URLs privadas',
          description: 'Abre páginas da rede privada num navegador local em vez de remoto.'
        },
        'checkpoints.enabled': {
          label: 'Pontos de restauro de ficheiros',
          description: 'Cria cópias antes de edições para poder reverter alterações.'
        }
      }
    },
    notifications: {
      title: 'Notificações',
      intro: 'Avisos nativos do sistema, separados dos toasts da app. Guardados só neste computador.',
      alerts: 'Avisos',
      sound: 'Som',
      testGroup: 'Teste',
      enableAll: 'Ativar notificações',
      enableAllDesc: 'Interruptor geral. Desligue para silenciar todos os avisos abaixo.',
      focusedHint: '“Resposta pronta” só dispara com o Work4You em segundo plano.',
      kinds: {
        approval: {
          label: 'Aprovação necessária',
          description: 'Um comando está à espera de aprovar ou rejeitar.'
        },
        input: {
          label: 'Entrada necessária',
          description: 'O Work4You fez uma pergunta ou precisa de uma palavra-passe ou segredo.'
        },
        turnDone: {
          label: 'Resposta pronta',
          description: 'Um turno terminou enquanto o Work4You estava em segundo plano.'
        },
        turnError: {
          label: 'Turno falhou',
          description: 'Um turno terminou com erro.'
        },
        backgroundDone: {
          label: 'Tarefa em segundo plano concluída',
          description: 'Um comando de terminal em segundo plano terminou.'
        }
      },
      test: 'Enviar teste',
      testRow: 'Notificação de teste',
      testDesc: 'Envia um aviso de exemplo para verificar as permissões do sistema.',
      testTitle: 'Work4You',
      testBody: 'As notificações estão a funcionar.',
      testSent:
        'Teste enviado. Se nada aparecer, verifique as permissões de notificação do SO e o Foco / Não incomodar.',
      testUnsupported: 'Este sistema não suporta notificações nativas.',
      completionSoundTitle: 'Som de conclusão',
      completionSoundDesc:
        'Som da app quando um turno termina em segundo plano — não é o ding do Windows/macOS. Pré-ouça ou use Enviar teste para ouvir.',
      completionSoundPreview: 'Pré-ouvir',
      completionSoundNames: {
        '1': 'Dois tons suaves',
        '2': 'Toque de vidro',
        '3': 'Marimba suave',
        '4': 'Mensagem em três tons',
        '5': 'Sopro leve',
        '6': 'Acorde de descoberta',
        '7': 'Sistemas online',
        '8': 'Terminal IBM',
        '9': 'Chirp de modem',
        '10': 'Sinos de vento',
        '11': 'Tigela tibetana',
        '12': 'Arpejo de harpa',
        '13': 'Eco de sonar',
        '14': 'Caixa de música'
      }
    },
    about: {
      version: value => `Versão ${value}`,
      versionUnavailable: 'Versão indisponível',
      updates: 'Atualizações',
      checkNow: 'Verificar agora',
      checking: 'A verificar…',
      seeWhatsNew: 'Ver novidades',
      updateNow: 'Atualizar agora',
      onLatest: 'Já está na versão mais recente.',
      installing: 'A instalar atualização…',
      cantUpdate: 'Não é possível atualizar nesta instalação.',
      cantReach: 'Não foi possível contactar o serviço de atualizações.',
      tapCheck: 'Toque em “Verificar agora” para procurar atualizações.',
      updateReady: count => `Nova atualização pronta (${count} alterações).`,
      lastChecked: age => `Última verificação: ${age}`,
      justNowSuffix: ' · agora mesmo',
      automaticUpdates: 'Atualizações automáticas',
      automaticUpdatesDesc:
        'O Work4You procura atualizações sozinho, em segundo plano, e avisa quando há uma pronta a instalar.',
      localChanges: 'Ao atualizar: alterações locais',
      localChangesDesc:
        'Se a app se atualizar sozinha (sem prompt no terminal), guardar edições locais (stash) ou descartá-las. Atualizações no terminal perguntam sempre.',
      localChangesOptions: {
        stash: 'Guardar (stash)',
        discard: 'Descartar'
      },
      branchCommit: (branch, commit) => `Canal de atualizações ${branch} · build ${commit}`,
      never: 'nunca',
      justNow: 'agora mesmo',
      minAgo: count => `há ${count} min`,
      hoursAgo: count => `há ${count} h`,
      daysAgo: count => (count === 1 ? 'há 1 dia' : `há ${count} dias`)
    },
    uninstall: {
      dangerZone: 'Zona de risco',
      checking: 'A verificar o que está instalado…',
      title: 'Desinstalar o Work4You',
      intro: 'Escolha quanto quer remover. A app fecha-se para terminar — pode reinstalar quando quiser.',
      confirmTitle: 'Confirmar desinstalação',
      confirmDesc: consequence => `Isto remove ${consequence}. Não dá para desfazer.`,
      appPath: path => `App: ${path}`,
      confirmCta: 'Sim, desinstalar',
      running: 'A desinstalar…',
      cancel: 'Cancelar',
      couldNotStart: 'Não foi possível iniciar a desinstalação.',
      modes: {
        gui: {
          title: 'Remover só a app do desktop',
          description:
            'Desinstala esta app. O motor do Work4You, as suas definições e as suas conversas ficam neste computador.',
          consequence: 'a app do desktop e os dados dela'
        },
        lite: {
          title: 'Remover a app e o motor, guardar os meus dados',
          description:
            'Desinstala a app e o motor do Work4You, mas guarda definições, conversas e chaves para uma reinstalação futura.',
          consequence: 'a app do desktop e o motor do Work4You (definições, conversas e chaves ficam guardadas)'
        },
        full: {
          title: 'Remover tudo',
          description:
            'Desinstala a app, o motor e todos os seus dados — definições, conversas, tarefas agendadas, chaves e registos.',
          consequence:
            'TUDO — a app do desktop, o motor do Work4You e todas as suas definições, conversas, chaves e registos'
        }
      }
    },
    config: {
      none: 'Nenhum',
      imageModes: {
        auto: 'Recomendado — decidir para este modelo',
        native: 'Enviar a foto como imagem',
        text: 'Descrever a foto em texto primeiro'
      }
    },
    modeOptions: {
      light: { label: 'Claro', description: 'Superfícies claras no desktop' },
      dark: { label: 'Escuro', description: 'Área de trabalho com menos brilho' },
      system: { label: 'Sistema', description: 'Seguir a aparência do SO' }
    },
    appearance: {
      title: 'Aparência',
      intro: 'Preferências de visual do desktop. O modo controla o brilho; o tema controla a paleta e o estilo do chat.',
      colorMode: 'Modo de cor',
      colorModeDesc: 'Escolha um modo fixo ou deixe o Work4You seguir o sistema.',
      toolViewTitle: 'Exibição de ferramentas',
      toolViewDesc: 'Produto esconde payloads crus; Técnico mostra entrada/saída completas.',
      uiScaleTitle: 'Escala da interface',
      uiScaleDesc: percent =>
        `Redimensiona texto e controlos em toda a app. Cmd/Ctrl com +, - e 0 também funciona. Atual: ${percent}%.`,
      translucencyTitle: 'Translucidez da janela',
      translucencyDesc: 'Ver o ambiente de trabalho através da janela. Só macOS e Windows.',
      embedsTitle: 'Pré-visualizações inline',
      embedsDesc:
        'Pré-visualizações ricas de sites (YouTube, X, …). Pedir mostra um placeholder até autorizar; Sempre carrega automaticamente; Desligado mantém só links.',
      embedsAsk: 'Pedir',
      embedsAlways: 'Sempre',
      embedsOff: 'Desligado',
      embedsReset: count => `Repor ${count} ${count === 1 ? 'serviço permitido' : 'serviços permitidos'}`,
      product: 'Produto',
      technical: 'Técnico',
      themeTitle: 'Tema',
      themeDesc: 'Paletas do desktop. O modo escolhido aplica-se por cima.',
      findMoreThemes: 'Encontrar mais temas',
      findMoreThemesClose: 'Ocultar galeria',
      gallerySearchPlaceholder: 'Pesquisar na galeria de temas…',
      marketplaceLoading: 'A pesquisar na galeria de temas…',
      marketplaceError: 'Não foi possível contactar a galeria de temas.',
      marketplaceEmpty: 'Nenhum tema da galeria corresponde a essa pesquisa.',
      fontTitle: 'Fonte',
      fontDesc:
        'Texto da interface no desktop. O padrão do tema é Plus Jakarta Sans; código e terminal mantêm JetBrains Mono.',
      fontThemeDefault: 'Padrão do tema (Plus Jakarta Sans)',
      displayGroup: 'Exibição',
      removeTheme: 'Remover tema',
      pet: {
        title: 'Pet',
        intro: 'Adote um mascote animado que flutua na app e reage ao que o Work4You está a fazer.',
        chooseTitle: 'Escolher um pet',
        chooseDesc: 'Ao escolher, instala (se precisar) e torna-o ativo.',
        searchPlaceholder: 'Pesquisar pets…',
        unreachable: 'Não foi possível carregar a galeria de pets. Verifique a ligação e tente de novo.',
        emptyGallery: 'Ainda não há pets instalados. Pesquise acima ou gere um para começar.',
        loadingGallery: 'A carregar pets…',
        retryGallery: 'Tentar de novo',
        noMatch: query => `Nenhum pet corresponde a “${query}”.`,
        installedTag: 'Instalado',
        generatedTag: 'Gerado',
        countCapped: (cap, total) => `A mostrar ${cap} de ${total} — escreva para filtrar.`,
        count: n => `${n} ${n === 1 ? 'pet' : 'pets'}.`,
        noneAvailable: 'Não há pets disponíveis para ligar neste momento.',
        turnOnFailed: 'Não foi possível ligar o pet.',
        turnOffFailed: 'Não foi possível desligar o pet.',
        adoptFailed: slug => `Não foi possível adotar ${slug}`,
        uninstallFailed: slug => `Não foi possível desinstalar ${slug}`,
        renameFailed: slug => `Não foi possível renomear ${slug}`,
        exportFailed: slug => `Não foi possível exportar ${slug}`,
        on: 'Ligado',
        off: 'Desligado',
        scaleTitle: 'Tamanho',
        scaleDesc: 'Redimensiona o mascote flutuante. Aplica-se de imediato.',
        roamTitle: 'Passear',
        roamDesc: 'Deixe o pet vaguear sozinho pela janela quando estiver idle.'
      }
    }
  },

  statusStack: {
    coding: {
      clean: 'Limpo',
      branchCopied: branch => `Copiado “${branch}”`,
      copyBranch: 'Copiar nome do branch',
      changes: 'Alterações',
      commitAndPr: 'Commit e PR',
      commit: 'Commit',
      commitAndPush: 'Commit e push',
      createPr: 'Criar PR',
      openPr: 'Abrir PR'
    }
  }
})
