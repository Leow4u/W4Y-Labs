import type { SiteLocale } from "@/lib/site-locale-shared";

/** Static product-window mocks — mirror the installed desktop app (Aug 2026). */

const COPY = {
  pt: {
    personalizeSearchSkills: "Pesquisar Skills para default…",
    personalizeSearchConnectors: "Pesquisar Conectores para default…",
    marketplace: "Navegar Marketplace",
    manage: "Gerir",
    tabDefault: "default",
    tabs: ["Skills", "Conectores", "MCPs"] as const,
    skillsTitle: "Skills do utilizador",
    skillsCount: 17,
    sortMostUsed: "Mais usadas",
    add: "+ Adicionar",
    skillsNote: "As alterações aplicam-se a novas sessões.",
    installed: "Instalados",
    connected: "Conectado",
    disconnectAll: "Desconectar todas",
    automationsTitle: "Automações",
    automationsSub:
      "Automatize tarefas repetitivas com agentes na cloud sempre ativos que respondem a gatilhos do ambiente.",
    newAutomation: "+ Nova automação",
    statTotal: "Total de automações",
    statOk: "Com sucesso · 7d",
    statFail: "Com falha · 7d",
    statHistory: "Histórico de execuções →",
    colAutomation: "Automações",
    colAuthor: "Autor",
    colCreated: "Criada",
    colStatus: "Status",
    colTools: "Ferramentas",
    you: "Você",
    active: "Ativa",
    presetProfile: "Perfil predefinido",
    channelsTitle: "Canais",
    channelsSub: "Fale com o agente, atenda conversas e acompanhe tudo aqui.",
    connect: "Conectar",
    channelsMore: "Ver mais · Mais canais",
    artifactsTabs: ["Todos", "Imagens", "Arquivos", "Links"] as const,
    artifactsSearch: 'Try ".pdf"',
    artifactsTitle: "Artefatos",
    colTitle: "Título / Nome",
    colLocation: "Local",
    colSession: "Sessão",
  },
  en: {
    personalizeSearchSkills: "Search Skills for default…",
    personalizeSearchConnectors: "Search Connectors for default…",
    marketplace: "Browse Marketplace",
    manage: "Manage",
    tabDefault: "default",
    tabs: ["Skills", "Connectors", "MCPs"] as const,
    skillsTitle: "User skills",
    skillsCount: 17,
    sortMostUsed: "Most used",
    add: "+ Add",
    skillsNote: "Changes apply to new sessions.",
    installed: "Installed",
    connected: "Connected",
    disconnectAll: "Disconnect all",
    automationsTitle: "Automations",
    automationsSub:
      "Automate repetitive tasks with always-on cloud agents that respond to environment triggers.",
    newAutomation: "+ New automation",
    statTotal: "Total automations",
    statOk: "Succeeded · 7d",
    statFail: "Failed · 7d",
    statHistory: "Run history →",
    colAutomation: "Automations",
    colAuthor: "Author",
    colCreated: "Created",
    colStatus: "Status",
    colTools: "Tools",
    you: "You",
    active: "Active",
    presetProfile: "Preset profile",
    channelsTitle: "Channels",
    channelsSub: "Talk to the agent, handle conversations, and follow everything here.",
    connect: "Connect",
    channelsMore: "See more · More channels",
    artifactsTabs: ["All", "Images", "Files", "Links"] as const,
    artifactsSearch: 'Try ".pdf"',
    artifactsTitle: "Artifacts",
    colTitle: "Title / Name",
    colLocation: "Location",
    colSession: "Session",
  },
} as const;

const SKILLS = {
  pt: [
    { name: "gmail-composio", cat: "Productivity", uses: 11 },
    { name: "web-search-best-practices", cat: "Research", uses: 7 },
    { name: "branded-html-landing", cat: "Creative", uses: 5 },
    { name: "gmail-cleanup", cat: "Productivity", uses: 5 },
    { name: "presentation-generation", cat: "Creative", uses: 4 },
  ],
  en: [
    { name: "gmail-composio", cat: "Productivity", uses: 11 },
    { name: "web-search-best-practices", cat: "Research", uses: 7 },
    { name: "branded-html-landing", cat: "Creative", uses: 5 },
    { name: "gmail-cleanup", cat: "Productivity", uses: 5 },
    { name: "presentation-generation", cat: "Creative", uses: 4 },
  ],
} as const;

const CONNECTORS = {
  pt: [
    { name: "Gmail", sub: "email", icon: "/brand/apps/gmail.svg" },
    { name: "GitHub", sub: "developer tools", letter: "GH" },
    { name: "LinkedIn", sub: "social media accounts", letter: "in" },
  ],
  en: [
    { name: "Gmail", sub: "email", icon: "/brand/apps/gmail.svg" },
    { name: "GitHub", sub: "developer tools", letter: "GH" },
    { name: "LinkedIn", sub: "social media accounts", letter: "in" },
  ],
} as const;

const AUTOMATION = {
  pt: {
    name: "Notícias Diárias de IA por e-mail",
    schedule: "Todos os dias às 7:00",
    where: "Este desktop",
    created: "há 6 dias",
  },
  en: {
    name: "Daily AI news by email",
    schedule: "Every day at 7:00 AM",
    where: "This desktop",
    created: "6 days ago",
  },
} as const;

const CHANNELS = {
  pt: [
    { name: "WhatsApp", sub: "Número pessoal via QR. O agente usa o mesmo…", on: true },
    { name: "WhatsApp (API oficial)", sub: "Cloud API da Meta (Business). Número…", on: false },
    { name: "Telegram", sub: "Fale com o agente em privados, grupos e tópicos.", on: false },
    { name: "Discord", sub: "Fale com o agente em servidores e DMs.", on: false },
    { name: "Slack", sub: "Fale com o agente em canais e mensagens…", on: false },
    { name: "E-mail", sub: "Receba e responda por uma caixa de e-mail.", on: false },
  ],
  en: [
    { name: "WhatsApp", sub: "Personal number via QR. The agent uses the same…", on: true },
    { name: "WhatsApp (official API)", sub: "Meta Cloud API (Business). Number…", on: false },
    { name: "Telegram", sub: "Talk to the agent in DMs, groups, and topics.", on: false },
    { name: "Discord", sub: "Talk to the agent in servers and DMs.", on: false },
    { name: "Slack", sub: "Talk to the agent in channels and messages…", on: false },
    { name: "Email", sub: "Receive and reply from an inbox.", on: false },
  ],
} as const;

function TabBar({
  locale,
  active,
}: {
  locale: SiteLocale;
  active: "skills" | "connectors" | "mcps";
}) {
  const c = COPY[locale];
  const items: { id: typeof active | "default"; label: string }[] = [
    { id: "default", label: c.tabDefault },
    { id: "skills", label: c.tabs[0] },
    { id: "connectors", label: c.tabs[1] },
    { id: "mcps", label: c.tabs[2] },
  ];
  return (
    <div className="flex flex-wrap gap-1 border-b border-line bg-paper px-3 py-2">
      {items.map((tab) => (
        <span
          key={tab.id}
          className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
            tab.id === active ? "bg-ink text-paper" : "text-ink-soft"
          }`}
        >
          {tab.label}
        </span>
      ))}
    </div>
  );
}

export function PersonalizeSkillsMock({ locale }: { locale: SiteLocale }) {
  const c = COPY[locale];
  const skills = SKILLS[locale];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate rounded-lg border border-line bg-white px-3 py-1.5 text-[11px] text-ink-faint">
          {c.personalizeSearchSkills}
        </span>
        <span className="shrink-0 rounded-full bg-ink px-3 py-1 text-[10px] font-semibold text-paper">
          {c.marketplace}
        </span>
      </div>
      <TabBar locale={locale} active="skills" />
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="text-[12px] font-semibold text-ink">
          {c.skillsTitle} ({c.skillsCount})
        </p>
        <div className="flex items-center gap-2 text-[11px] text-ink-soft">
          <span>{c.sortMostUsed} ▾</span>
          <span className="font-semibold text-mata">{c.add}</span>
        </div>
      </div>
      {skills.map((s, i) => (
        <div
          key={s.name}
          className={`flex items-center gap-3 px-4 py-2.5 ${i > 0 ? "border-t border-line" : ""}`}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-paper-deep text-[10px] font-bold text-ink-faint">
            {s.name.slice(0, 2).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-ink">{s.name}</p>
            <p className="text-[11px] text-ink-faint">
              {s.cat} · <span className="text-ink-soft">learned</span>
            </p>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-ink-faint">×{s.uses}</span>
        </div>
      ))}
      <p className="border-t border-line px-4 py-2 text-[11px] text-ink-faint">{c.skillsNote}</p>
    </div>
  );
}

export function PersonalizeConnectorsMock({ locale }: { locale: SiteLocale }) {
  const c = COPY[locale];
  const rows = CONNECTORS[locale];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-paper px-3 py-2.5">
        <span className="min-w-0 flex-1 truncate rounded-lg border border-line bg-white px-3 py-1.5 text-[11px] text-ink-faint">
          {c.personalizeSearchConnectors}
        </span>
        <span className="shrink-0 text-[11px] font-semibold text-ink-soft">{c.manage}</span>
      </div>
      <TabBar locale={locale} active="connectors" />
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="text-[12px] font-semibold text-ink">
          {c.installed} {rows.length}
        </p>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="text-ink-soft">{c.disconnectAll}</span>
          <span className="font-semibold text-mata">{c.add}</span>
        </div>
      </div>
      {rows.map((r, i) => (
        <div
          key={r.name}
          className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
        >
          {"icon" in r && r.icon ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={r.icon} alt="" width={22} height={22} className="h-6 w-6 shrink-0" />
          ) : (
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ink text-[9px] font-bold text-paper">
              {"letter" in r ? r.letter : "?"}
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold text-ink">{r.name}</p>
            <p className="text-[11px] text-ink-faint">{r.sub}</p>
          </div>
          <span className="shrink-0 text-[12px] font-medium text-emerald-600">{c.connected}</span>
        </div>
      ))}
    </div>
  );
}

export function AutomationsTableMock({ locale }: { locale: SiteLocale }) {
  const c = COPY[locale];
  const job = AUTOMATION[locale];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div>
          <p className="text-sm font-bold text-ink">{c.automationsTitle}</p>
          <p className="mt-0.5 max-w-md text-[11px] leading-relaxed text-ink-soft">{c.automationsSub}</p>
        </div>
        <span className="shrink-0 rounded-full bg-ink px-3 py-1.5 text-[11px] font-semibold text-paper">
          {c.newAutomation}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-px border-b border-line bg-line sm:grid-cols-4">
        {[c.statTotal, c.statOk, c.statFail, c.statHistory].map((label) => (
          <div key={label} className="bg-white px-3 py-2.5">
            <p className="text-[10px] text-ink-faint">{label}</p>
            <p className="mt-0.5 font-mono text-sm text-ink">{label === c.statTotal ? "1" : "…"}</p>
          </div>
        ))}
      </div>
      <div className="hidden gap-3 border-b border-line px-4 py-2 font-mono text-[9px] uppercase tracking-[0.12em] text-ink-faint sm:grid sm:grid-cols-[1.4fr_0.7fr_0.7fr_0.6fr_0.8fr]">
        <span>{c.colAutomation}</span>
        <span>{c.colAuthor}</span>
        <span>{c.colCreated}</span>
        <span>{c.colStatus}</span>
        <span>{c.colTools}</span>
      </div>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-[1.4fr_0.7fr_0.7fr_0.6fr_0.8fr] sm:items-center">
        <div>
          <p className="text-[13px] font-semibold text-ink">{job.name}</p>
          <p className="text-[11px] text-ink-faint">
            {job.schedule} · {job.where}
          </p>
        </div>
        <p className="text-[12px] text-ink-soft">{c.you}</p>
        <p className="text-[12px] text-ink-soft">{job.created}</p>
        <p className="flex items-center gap-1.5 text-[12px] font-medium text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          {c.active}
        </p>
        <p className="text-[11px] text-ink-faint">{c.presetProfile}</p>
      </div>
    </div>
  );
}

export function ChannelsGridMock({ locale }: { locale: SiteLocale }) {
  const c = COPY[locale];
  const channels = CHANNELS[locale];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <p className="text-sm font-bold text-ink">{c.channelsTitle}</p>
        <p className="mt-0.5 text-[11px] text-ink-soft">{c.channelsSub}</p>
      </div>
      <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((ch) => (
          <div key={ch.name} className="rounded-xl border border-line bg-paper px-3 py-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[13px] font-semibold text-ink">{ch.name}</p>
              {ch.on ? (
                <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {c.connected}
                </span>
              ) : (
                <span className="text-[10px] font-medium text-ink-faint">{c.connect}</span>
              )}
            </div>
            <p className="mt-1.5 text-[11px] leading-snug text-ink-faint">{ch.sub}</p>
          </div>
        ))}
      </div>
      <p className="border-t border-line px-4 py-2 text-[11px] font-medium text-mata">{c.channelsMore}</p>
    </div>
  );
}

export function WhatsAppAgentMock({ locale }: { locale: SiteLocale }) {
  const copy = {
    pt: {
      user: "Preciso ver qual ultimo email que eu recebi no gmail",
      tool1: "mcp_composio_COMPOSIO_SEARCH_TOOLS…",
      tool2: "mcp_composio_COMPOSIO_MULTI_EXECUTE_TOOL…",
      replyLead: "O email mais recente que você recebeu é da Drogaria Raia:",
      subject: "Adoramos a sua visita 🤖",
      when: "04/08/2026 às 23:12:28 (UTC)",
      from: "Raia <contato@e.drogaraia.com.br>",
      cat: "Promoções",
    },
    en: {
      user: "I need to see the last email I received in Gmail",
      tool1: "mcp_composio_COMPOSIO_SEARCH_TOOLS…",
      tool2: "mcp_composio_COMPOSIO_MULTI_EXECUTE_TOOL…",
      replyLead: "The most recent email you received is from Drogaria Raia:",
      subject: "We loved your visit 🤖",
      when: "Aug 4, 2026 at 11:12:28 PM (UTC)",
      from: "Raia <contato@e.drogaraia.com.br>",
      cat: "Promotions",
    },
  }[locale];

  return (
    <div className="overflow-hidden rounded-t-xl border border-b-0 border-line bg-[#ece5dd]">
      <div className="flex items-center gap-2 border-b border-line bg-white px-3 py-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/brand/apps/whatsapp.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
        <span className="text-[11px] font-semibold text-ink">Work4You</span>
        <span className="text-[10px] text-[#25a05a]">online</span>
      </div>
      <div className="space-y-2 px-3 py-3">
        <div className="ml-auto w-fit max-w-[92%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-2.5 py-1.5 text-[10.5px] text-ink shadow-sm">
          {copy.user}
        </div>
        <div className="w-fit max-w-[92%] space-y-1 rounded-lg rounded-tl-sm bg-white/90 px-2 py-1.5 text-[9px] text-ink-faint shadow-sm">
          <p>{copy.tool1}</p>
          <p>{copy.tool2}</p>
        </div>
        <div className="w-fit max-w-[92%] rounded-lg rounded-tl-sm bg-white px-2.5 py-2 text-[10px] leading-relaxed text-ink shadow-sm">
          <p>{copy.replyLead}</p>
          <p className="mt-1.5">
            <span className="font-semibold">Assunto:</span> {copy.subject}
          </p>
          <p>
            <span className="font-semibold">Data/Hora:</span> {copy.when}
          </p>
          <p>
            <span className="font-semibold">Remetente:</span> {copy.from}
          </p>
          <p>
            <span className="font-semibold">Categoria:</span> {copy.cat}
          </p>
        </div>
      </div>
    </div>
  );
}

const ARTIFACT_FILES = {
  pt: [
    { name: "Proposta_Comercial_Dutelog_100_Mesas.pdf", session: "Início de conversa com assistente" },
    { name: "generate_proposal.py", session: "Refatoração de formatação de datas…" },
    { name: "journey.py", session: "Refatoração de formatação de datas…" },
  ],
  en: [
    { name: "Proposta_Comercial_Dutelog_100_Mesas.pdf", session: "Conversation start with assistant" },
    { name: "generate_proposal.py", session: "Date formatting refactor…" },
    { name: "journey.py", session: "Date formatting refactor…" },
  ],
} as const;

export function ArtifactsMock({ locale }: { locale: SiteLocale }) {
  const c = COPY[locale];
  const files = ARTIFACT_FILES[locale];
  const tabCounts = [8, 2, 6, 0];
  return (
    <div className="overflow-hidden rounded-xl border border-line bg-white">
      <div className="border-b border-line px-4 py-3">
        <p className="text-sm font-bold text-ink">{c.artifactsTitle}</p>
        <p className="mt-2 rounded-lg border border-line bg-paper px-3 py-1.5 text-[11px] text-ink-faint">
          {c.artifactsSearch}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {c.artifactsTabs.map((tab, i) => (
            <span
              key={tab}
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-medium ${
                i === 0 ? "bg-ink text-paper" : "text-ink-soft"
              }`}
            >
              {tab} ({tabCounts[i]})
            </span>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 border-b border-line p-3">
        {[1, 2].map((n) => (
          <div
            key={n}
            className="flex aspect-[4/3] items-center justify-center rounded-lg border border-line bg-gradient-to-br from-paper to-paper-deep"
          >
            <span className="text-[10px] font-bold tracking-wider text-ink-faint">DUTELOG</span>
          </div>
        ))}
      </div>
      <div className="divide-y divide-line">
        {files.map((f) => (
          <div key={f.name} className="px-4 py-2.5">
            <p className="truncate text-[12px] font-semibold text-ink">{f.name}</p>
            <p className="mt-0.5 truncate text-[10px] text-ink-faint">{f.session}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
