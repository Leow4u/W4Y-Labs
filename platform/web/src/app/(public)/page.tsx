import Image from "next/image";
import Link from "next/link";
import HeroDemo from "@/components/HeroDemo";
import DelegationInput from "@/components/DelegationInput";
import { getSiteLocale } from "@/lib/site-locale";

// Work4You landing — new architecture, benchmark-informed:
// centered display hero with the LIVE product window bleeding into the fold,
// alternating text-rail × product-frame sections, one dark statement canvas,
// editorial meta-cards, the 24/7 forest section, final CTA.
// Narrative order from the site brief: build → talk & execute → run 24/7.
// All visible copy is bilingual (pt/en) via the site-locale cookie.

// Real brand logos (Simple Icons, /brand/apps). Brazil-first ordering.
const CHANNELS = [
  { name: "WhatsApp", icon: "/brand/apps/whatsapp.svg" },
  { name: "Telegram", icon: "/brand/apps/telegram.svg" },
  { name: "Slack", icon: "/brand/apps/slack.svg" },
  { name: "Discord", icon: "/brand/apps/discord.svg" },
];

// Connector display names differ per locale (Planilhas/Sheets, Agenda/Calendar).
const CONNECTORS = {
  pt: [
    { name: "Gmail", icon: "/brand/apps/gmail.svg" },
    { name: "Instagram", icon: "/brand/apps/instagram.svg" },
    { name: "Facebook", icon: "/brand/apps/facebook.svg" },
    { name: "Google Ads", icon: "/brand/apps/googleads.svg" },
    { name: "Google Drive", icon: "/brand/apps/googledrive.svg" },
    { name: "Planilhas", icon: "/brand/apps/googlesheets.svg" },
    { name: "Agenda", icon: "/brand/apps/googlecalendar.svg" },
    { name: "Notion", icon: "/brand/apps/notion.svg" },
    { name: "HubSpot", icon: "/brand/apps/hubspot.svg" },
  ],
  en: [
    { name: "Gmail", icon: "/brand/apps/gmail.svg" },
    { name: "Instagram", icon: "/brand/apps/instagram.svg" },
    { name: "Facebook", icon: "/brand/apps/facebook.svg" },
    { name: "Google Ads", icon: "/brand/apps/googleads.svg" },
    { name: "Google Drive", icon: "/brand/apps/googledrive.svg" },
    { name: "Sheets", icon: "/brand/apps/googlesheets.svg" },
    { name: "Calendar", icon: "/brand/apps/googlecalendar.svg" },
    { name: "Notion", icon: "/brand/apps/notion.svg" },
    { name: "HubSpot", icon: "/brand/apps/hubspot.svg" },
  ],
} as const;

const DELIVERABLES = [
  { name: "Excel", icon: "/brand/apps/excel.svg" },
  { name: "PowerPoint", icon: "/brand/apps/powerpoint.svg" },
  { name: "Word", icon: "/brand/apps/word.svg" },
  { name: "PDF", icon: "/brand/apps/pdf.svg" },
];

const CONTENT = {
  pt: {
    hero: {
      title: "Construa o seu agente de IA.",
      sub1: "Coloque ele pra rodar",
      sub2: " — conversa, executa e continua depois que você sai.",
      ctaBuild: "Construir meu agente",
      ctaHow: "Ver como funciona →",
    },
    explainer: {
      heading: "Fala onde você fala. Usa o que você usa. Entrega pronto.",
      channels: {
        label: "Canais",
        title: "Por onde você — e seus clientes — falam com ele",
        copy: "Peça a tarefa de onde estiver: ele executa na nuvem, em tempo real, 24/7 — e devolve onde você quiser.",
        email: "E-mail",
        quote1: "“Peço no WhatsApp — e recebo a entrega pronta.”",
        quote2: "“Meu cliente chama — e o agente atende.”",
      },
      connectors: {
        label: "Conectores",
        title: "As contas que ele usa nas tarefas",
        more: "+ de 1.400 apps",
        quote: "“Lê o meu Gmail e atualiza o Notion.”",
      },
      deliverables: {
        label: "Entregas",
        title: "O que ele produz e devolve pronto",
        quote: "“Gera o fluxo de caixa em Excel e deixa em Entregas.”",
      },
    },
    statement: {
      t1: "Chat responde.",
      tu: "O seu agente executa",
      t2: "— e continua depois que você sai.",
      p: "Aqui você não usa um “agente pronto” de marketing. Você constrói um de verdade — foco, estilo, ferramentas, modelo — e deixa ele ligado.",
    },
    build: {
      label: "01 · Construa",
      title: "Do zero ao seu agente",
      titleFaint: "em minutos, não semanas.",
      p: "Diga o foco, o estilo, as ferramentas e o modelo. Construa um. Construa vários no Agent Studio — independentes, que se consultam e trabalham juntos quando a tarefa pede.",
      cta: "Conhecer o Agent Studio →",
      agents: [
        { name: "Agente principal", focus: "Coordena, delega e entrega", model: "modelo à sua escolha", on: true },
        { name: "Vendas", focus: "Leads, propostas e follow-ups", model: "foco próprio", on: true },
        { name: "Financeiro", focus: "Cobranças e conciliação", model: "rotinas 24/7", on: true },
        { name: "Atendimento", focus: "Respostas no tom da empresa", model: "em construção", on: false },
      ],
      statusOn: "no ar",
      statusOff: "pausado",
    },
    use: {
      label: "02 · Use",
      title: "Conversa e executa — de verdade",
      cards: [
        {
          title: "Age nas suas coisas",
          copy: "Lê pastas, escreve documentos, mexe em planilhas, roda código — e devolve o trabalho pronto.",
          meta: [["Entrada", "chat, voz, rotina"], ["Saída", "docs, PDFs, ações"]],
        },
        {
          title: "Lembra do contexto",
          copy: "Memória entre sessões: o agente conhece o seu negócio, o seu tom e o que já foi decidido.",
          meta: [["Memória", "entre sessões"], ["Histórico", "cada decisão"]],
        },
        {
          title: "Modelo à sua escolha",
          copy: "Aceita o modelo de IA que você preferir — ou a sua própria API. Sem ficar preso a um fornecedor.",
          meta: [["Modelos", "os melhores do mercado"], ["API própria", "traga a sua"]],
        },
      ],
    },
    always: {
      label: "03 · Ligue o 24/7",
      title: "Depois de construído, ele não depende do seu notebook.",
      p: "Agenda, rotinas e trabalhos longos rodam na nuvem. Desktop e web são entradas — a nuvem é onde o seu agente fica ligado.",
      cta: "Conhecer a plataforma →",
      routines: [
        { when: "Toda manhã · 07h00", what: "Resumo dos e-mails e do que vence hoje" },
        { when: "Toda sexta · 17h00", what: "Cobranças e follow-ups da semana" },
        { when: "Ao chegar anexo novo", what: "Ler, classificar e arquivar na pasta certa" },
      ],
      live: "no ar",
    },
    platforms: {
      title: "Onde quer que você trabalhe",
      sub: "O mesmo agente, em todas as plataformas.",
      desktop: {
        title: "Desktop",
        copy: "Do dia a dia às pastas e ao código — direto no seu computador.",
        cta: "Baixar →",
        prompt: "adiciona o filtro de junho na planilha",
        reading: "Lendo",
        file: "vendas.xlsx",
        edited: "Editado ✓",
        placeholder: "Descreva o que precisa",
      },
      cli: {
        title: "CLI",
        copy: "Execute o agente em qualquer terminal, script ou editor.",
        cta: "Instalar →",
        dir: "~/loja-web",
        cmd: "corrige o bug do checkout",
        status: "● leu checkout.ts · rodou testes — 1 falhou",
        done: "✓ testes passando · commit enviado",
      },
      whatsapp: {
        title: "Outras plataformas",
        copy: "Inicie agentes pelo WhatsApp, Telegram, Slack e muito mais.",
        cta: "Adicionar ao WhatsApp ↗",
        agentName: "Agente Work4You",
        online: "online",
        msg: "Vê no CRM se entrou lead novo",
        reply: "3 leads novos! O mais quente pediu proposta — já preparei: 📎",
        file: "proposta-marina.pdf 📄",
      },
      web: {
        title: "Web e celular",
        copy: "Delegue e acompanhe da nuvem — pelo browser ou pelo celular.",
        cta: "Abrir no browser ↗",
        tabAgent: "Agente",
        tabPanel: "Painel",
        today: "Hoje",
        rows: [
          { dot: false, t: "Post pro Instagram", s: "publicado ✓" },
          { dot: true, t: "Proposta de junho", s: "gerando PDF" },
          { dot: true, t: "Cobranças da semana", s: "sexta · 17h" },
        ],
      },
    },
    trust: [
      { title: "Aprovação humana", copy: "Ações sensíveis esperam o seu OK." },
      { title: "Histórico completo", copy: "Cada tarefa e decisão registrada." },
      { title: "Controle de uso", copy: "Consumo e custo por agente." },
      { title: "Acesso por equipe", copy: "Cada pessoa vê o que deve ver." },
    ],
    final: {
      title: "Monte. Ligue. Ele continua.",
      p: "Leva minutos — e o agente que você construiu começa a trabalhar.",
    },
  },
  en: {
    hero: {
      title: "Build your AI agent.",
      sub1: "Put it to work",
      sub2: " — it talks, executes, and keeps going after you leave.",
      ctaBuild: "Build my agent",
      ctaHow: "See how it works →",
    },
    explainer: {
      heading: "Talks where you talk. Uses what you use. Delivers finished work.",
      channels: {
        label: "Channels",
        title: "Where you — and your customers — talk to it",
        copy: "Ask for the task from anywhere: it runs in the cloud, in real time, 24/7 — and delivers wherever you want.",
        email: "Email",
        quote1: "“I ask on WhatsApp — and get the finished work back.”",
        quote2: "“My customer messages — and the agent answers.”",
      },
      connectors: {
        label: "Connectors",
        title: "The accounts it uses to get work done",
        more: "1,400+ apps",
        quote: "“It reads my Gmail and updates Notion.”",
      },
      deliverables: {
        label: "Deliveries",
        title: "What it produces and hands back, done",
        quote: "“It builds the cash flow in Excel and drops it in Deliveries.”",
      },
    },
    statement: {
      t1: "Chat answers.",
      tu: "Your agent executes",
      t2: "— and keeps going after you leave.",
      p: "This isn't a prepackaged “agent” from a marketing page. You build a real one — focus, style, tools, model — and leave it running.",
    },
    build: {
      label: "01 · Build",
      title: "From zero to your agent",
      titleFaint: "in minutes, not weeks.",
      p: "Set the focus, the style, the tools, and the model. Build one. Build several in Agent Studio — independent agents that consult each other and work together when the task calls for it.",
      cta: "Meet Agent Studio →",
      agents: [
        { name: "Main agent", focus: "Coordinates, delegates, delivers", model: "model of your choice", on: true },
        { name: "Sales", focus: "Leads, proposals, follow-ups", model: "own focus", on: true },
        { name: "Finance", focus: "Invoicing and reconciliation", model: "24/7 routines", on: true },
        { name: "Support", focus: "Replies in your company's tone", model: "in progress", on: false },
      ],
      statusOn: "live",
      statusOff: "paused",
    },
    use: {
      label: "02 · Use",
      title: "Talks and executes — for real",
      cards: [
        {
          title: "Acts on your stuff",
          copy: "Reads folders, writes documents, edits spreadsheets, runs code — and hands back finished work.",
          meta: [["Input", "chat, voice, routines"], ["Output", "docs, PDFs, actions"]],
        },
        {
          title: "Remembers the context",
          copy: "Memory across sessions: the agent knows your business, your tone, and what's already been decided.",
          meta: [["Memory", "across sessions"], ["History", "every decision"]],
        },
        {
          title: "The model you choose",
          copy: "Works with whichever AI model you prefer — or your own API. No vendor lock-in.",
          meta: [["Models", "the market's best"], ["Your own API", "bring it"]],
        },
      ],
    },
    always: {
      label: "03 · Turn on 24/7",
      title: "Once it's built, it doesn't depend on your laptop.",
      p: "Agenda, routines, and long-running work run in the cloud. Desktop and web are entry points — the cloud is where your agent stays on.",
      cta: "Explore the platform →",
      routines: [
        { when: "Every morning · 7:00 am", what: "Summary of emails and what's due today" },
        { when: "Every Friday · 5:00 pm", what: "The week's invoices and follow-ups" },
        { when: "When a new attachment arrives", what: "Read, classify, and file it in the right folder" },
      ],
      live: "live",
    },
    platforms: {
      title: "Wherever you work",
      sub: "The same agent, on every platform.",
      desktop: {
        title: "Desktop",
        copy: "From everyday tasks to folders and code — right on your computer.",
        cta: "Download →",
        prompt: "add the June filter to the spreadsheet",
        reading: "Reading",
        file: "sales.xlsx",
        edited: "Edited ✓",
        placeholder: "Describe what you need",
      },
      cli: {
        title: "CLI",
        copy: "Run the agent in any terminal, script, or editor.",
        cta: "Install →",
        dir: "~/store-web",
        cmd: "fix the checkout bug",
        status: "● read checkout.ts · ran tests — 1 failed",
        done: "✓ tests passing · commit pushed",
      },
      whatsapp: {
        title: "Other platforms",
        copy: "Start agents from WhatsApp, Telegram, Slack, and more.",
        cta: "Add to WhatsApp ↗",
        agentName: "Work4You Agent",
        online: "online",
        msg: "Check the CRM for new leads",
        reply: "3 new leads! The hottest one asked for a proposal — already done: 📎",
        file: "marina-proposal.pdf 📄",
      },
      web: {
        title: "Web and mobile",
        copy: "Delegate and follow along from the cloud — in the browser or on your phone.",
        cta: "Open in the browser ↗",
        tabAgent: "Agent",
        tabPanel: "Dashboard",
        today: "Today",
        rows: [
          { dot: false, t: "Instagram post", s: "published ✓" },
          { dot: true, t: "June proposal", s: "generating PDF" },
          { dot: true, t: "Week's invoices", s: "Friday · 5pm" },
        ],
      },
    },
    trust: [
      { title: "Human approval", copy: "Sensitive actions wait for your OK." },
      { title: "Full history", copy: "Every task and decision on record." },
      { title: "Usage control", copy: "Consumption and cost per agent." },
      { title: "Team access", copy: "Each person sees only what they should." },
    ],
    final: {
      title: "Build it. Turn it on. It keeps going.",
      p: "It takes minutes — and the agent you built gets to work.",
    },
  },
} as const;

export default async function LandingPage() {
  const locale = await getSiteLocale();
  const t = CONTENT[locale];
  const connectors = CONNECTORS[locale];
  return (
    <>
      {/* ── S1 · Hero: quiet two-tone statement, product as the star ── */}
      <section className="px-6 pb-20 pt-20 md:pt-28">
        <div className="mx-auto max-w-6xl">
          <h1 className="max-w-3xl text-3xl font-bold leading-[1.18] tracking-[-0.02em] md:text-[2.6rem]">
            <span className="text-ink">{t.hero.title}</span>{" "}
            <span className="font-semibold text-ink-faint">
              {t.hero.sub1}{" "}
              <span className="whitespace-nowrap text-mata">24/7</span>
              {t.hero.sub2}
            </span>
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link
              href="/login"
              className="rounded-full bg-mata px-6 py-3 text-[15px] font-semibold text-paper transition-colors hover:bg-mata-deep"
            >
              {t.hero.ctaBuild}
            </Link>
            <Link
              href="/plataforma"
              className="text-[15px] font-semibold text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {t.hero.ctaHow}
            </Link>
          </div>
        </div>

        {/* the product, floating over the landscape (Unsplash, free license) */}
        <div className="relative mx-auto mt-14 max-w-6xl overflow-hidden rounded-[2rem]">
          <Image
            src="/media/hero-hills.jpg"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <div className="relative px-4 py-10 sm:px-10 sm:py-16">
            <HeroDemo locale={locale} />
          </div>
        </div>
      </section>

      {/* ── S2 · Channels × Connectors × Deliverables ───────────────── */}
      <section className="border-t border-line px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-center text-3xl font-bold tracking-tight text-ink [text-wrap:balance]">
            {t.explainer.heading}
          </h2>
          <div className="mt-12 grid gap-6 lg:grid-cols-3">
            {/* Channels: where people talk to the agent */}
            <div className="rounded-2xl border border-line bg-white p-7">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
                {t.explainer.channels.label}
              </p>
              <h3 className="mt-2 text-lg font-bold text-ink">
                {t.explainer.channels.title}
              </h3>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-soft">
                {t.explainer.channels.copy}
              </p>
              <div className="mt-5 flex flex-wrap gap-2">
                {CHANNELS.map((c) => (
                  <span
                    key={c.name}
                    className="flex items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-1.5 text-[13px] font-medium text-ink-soft"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.icon} alt="" width={16} height={16} className="h-4 w-4" />
                    {c.name}
                  </span>
                ))}
                <span className="flex items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-1.5 text-[13px] font-medium text-ink-soft">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4 text-ink-faint" aria-hidden>
                    <rect x="2" y="4" width="20" height="16" rx="2" />
                    <path d="m2 7 10 6 10-6" />
                  </svg>
                  {t.explainer.channels.email}
                </span>
              </div>
              <p className="mt-5 text-[13px] italic leading-relaxed text-ink-faint">
                {t.explainer.channels.quote1}
                <br />
                {t.explainer.channels.quote2}
              </p>
            </div>

            {/* Connectors: accounts the agent uses in tasks */}
            <div className="rounded-2xl border border-line bg-white p-7">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
                {t.explainer.connectors.label}
              </p>
              <h3 className="mt-2 text-lg font-bold text-ink">
                {t.explainer.connectors.title}
              </h3>
              <div className="mt-5 flex flex-wrap gap-2">
                {connectors.map((c) => (
                  <span
                    key={c.name}
                    className="flex items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-1.5 text-[13px] font-medium text-ink-soft"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={c.icon} alt="" width={16} height={16} className="h-4 w-4" />
                    {c.name}
                  </span>
                ))}
                <span className="rounded-full border border-dashed border-salvia px-3.5 py-1.5 text-[13px] text-ink-faint">
                  {t.explainer.connectors.more}
                </span>
              </div>
              <p className="mt-5 text-[13px] italic leading-relaxed text-ink-faint">
                {t.explainer.connectors.quote}
              </p>
            </div>

            {/* Deliverables: what the agent produces */}
            <div className="rounded-2xl border border-line bg-white p-7">
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
                {t.explainer.deliverables.label}
              </p>
              <h3 className="mt-2 text-lg font-bold text-ink">
                {t.explainer.deliverables.title}
              </h3>
              <div className="mt-5 flex flex-wrap gap-2">
                {DELIVERABLES.map((d) => (
                  <span
                    key={d.name}
                    className="flex items-center gap-2 rounded-full border border-line bg-paper px-3.5 py-1.5 text-[13px] font-medium text-ink-soft"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={d.icon} alt="" width={16} height={16} className="h-4 w-4" />
                    {d.name}
                  </span>
                ))}
              </div>
              <p className="mt-5 text-[13px] italic leading-relaxed text-ink-faint">
                {t.explainer.deliverables.quote}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── S3 · Statement canvas ───────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl rounded-[2rem] bg-mata-deep px-8 py-20 text-center md:px-16 md:py-28">
          <h2 className="mx-auto max-w-3xl text-3xl font-extrabold leading-[1.15] tracking-[-0.02em] text-paper [text-wrap:balance] md:text-5xl">
            {t.statement.t1}{" "}
            <span className="underline decoration-salvia decoration-4 underline-offset-8">
              {t.statement.tu}
            </span>{" "}
            {t.statement.t2}
          </h2>
          <p className="mx-auto mt-8 max-w-xl text-lg leading-relaxed text-paper/70">
            {t.statement.p}
          </p>
        </div>
      </section>

      {/* ── S4 · Build: text rail × Studio frame ────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
              {t.build.label}
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-ink md:text-4xl">
              {t.build.title}{" "}
              <span className="text-ink-faint">{t.build.titleFaint}</span>
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-ink-soft">
              {t.build.p}
            </p>
            <Link
              href="/plataforma"
              className="mt-7 inline-block text-[15px] font-semibold text-mata underline-offset-4 hover:underline"
            >
              {t.build.cta}
            </Link>
          </div>

          {/* Studio frame over the misty pines */}
          <div className="relative overflow-hidden rounded-3xl p-4 sm:p-8">
            <Image
              src="/media/studio-mist.jpg"
              alt=""
              fill
              sizes="(min-width: 1024px) 60vw, 100vw"
              className="object-cover"
            />
            <div className="relative overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_80px_-40px_rgba(41,51,31,0.35)]">
              <div className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
                <span className="h-2.5 w-2.5 rounded-full bg-line" />
                <span className="ml-3 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint">
                  Agent Studio
                </span>
              </div>
              {t.build.agents.map((a, i) => (
                <div
                  key={a.name}
                  className={`flex items-center gap-4 px-5 py-4 ${i > 0 ? "border-t border-line" : ""}`}
                >
                  <span
                    className={`h-2 w-2 shrink-0 rounded-full ${a.on ? "w4y-live-dot bg-salvia" : "bg-line"}`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{a.name}</p>
                    <p className="truncate text-[13px] text-ink-soft">{a.focus}</p>
                  </div>
                  <span className="ml-auto hidden shrink-0 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint sm:block">
                    {a.model}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.12em] ${
                      a.on ? "bg-salvia-soft text-mata" : "bg-paper text-ink-faint"
                    }`}
                  >
                    {a.on ? t.build.statusOn : t.build.statusOff}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── S5 · Editorial capability cards ─────────────────────────── */}
      <section className="border-t border-line px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
            {t.use.label}
          </p>
          <h2 className="mt-4 max-w-2xl text-3xl font-bold tracking-tight text-ink md:text-4xl">
            {t.use.title}
          </h2>
          <div className="mt-10 grid gap-6 lg:grid-cols-3">
            {t.use.cards.map((c) => (
              <div key={c.title} className="rounded-2xl bg-cream p-7">
                <h3 className="text-xl font-bold text-ink">{c.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">{c.copy}</p>
                <div className="mt-6 space-y-0">
                  {c.meta.map(([k, v]) => (
                    <div
                      key={k}
                      className="flex items-center justify-between border-t border-ink/10 py-2.5"
                    >
                      <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                        {k}
                      </span>
                      <span className="text-[13px] font-medium text-ink-soft">{v}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── S6 · 24/7 — the dark forest (real one) ──────────────────── */}
      <section className="relative overflow-hidden bg-mata-deep px-6 py-24 text-paper">
        <Image
          src="/media/night-forest.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-mata-deep/70" />
        <div className="relative mx-auto max-w-6xl">
          <div className="grid items-center gap-12 lg:grid-cols-2">
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
                {t.always.label}
              </p>
              <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight md:text-4xl">
                {t.always.title}
              </h2>
              <p className="mt-5 max-w-md leading-relaxed text-paper/70">
                {t.always.p}
              </p>
              <Link
                href="/plataforma"
                className="mt-8 inline-block rounded-full bg-paper px-6 py-2.5 text-sm font-semibold text-mata-deep transition-opacity hover:opacity-90"
              >
                {t.always.cta}
              </Link>
            </div>
            <div className="space-y-3">
              {t.always.routines.map((r) => (
                <div
                  key={r.when}
                  className="flex items-center gap-4 rounded-2xl border border-paper/15 bg-paper/5 px-5 py-4"
                >
                  <span className="w4y-live-dot h-2 w-2 shrink-0 rounded-full bg-salvia" />
                  <div className="min-w-0">
                    <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-salvia">
                      {r.when}
                    </p>
                    <p className="mt-1 truncate text-sm text-paper/90">{r.what}</p>
                  </div>
                  <span className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-paper/50">
                    {t.always.live}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── S7 · Everywhere you work (Cursor-style platform cards) ──── */}
      <section className="px-6 py-20">
        <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-bold tracking-tight text-ink">
            {t.platforms.title}
          </h2>
          <p className="mt-1 text-3xl font-bold tracking-tight text-ink-faint">
            {t.platforms.sub}
          </p>

          <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {/* Desktop */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-paper-deep p-6 pb-0">
              <h3 className="text-base font-bold text-ink">{t.platforms.desktop.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                {t.platforms.desktop.copy}
              </p>
              <Link href="/login" className="mt-3 text-[13.5px] font-semibold text-mata hover:underline">
                {t.platforms.desktop.cta}
              </Link>
              <div className="mt-5 flex-1 overflow-hidden rounded-t-xl border border-b-0 border-line bg-white">
                <div className="flex items-center gap-1.5 border-b border-line bg-paper px-3 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-line" />
                  <span className="h-1.5 w-1.5 rounded-full bg-line" />
                  <span className="h-1.5 w-1.5 rounded-full bg-line" />
                </div>
                <div className="space-y-2 px-3.5 py-3">
                  <div className="rounded-lg border border-line px-3 py-2 text-[11px] text-ink">
                    {t.platforms.desktop.prompt}
                  </div>
                  <p className="text-[10.5px] text-ink-faint">
                    {t.platforms.desktop.reading}{" "}
                    <span className="font-mono text-[10px]">{t.platforms.desktop.file}</span>
                  </p>
                  <p className="text-[10.5px] text-ink-faint">{t.platforms.desktop.edited}</p>
                  <div className="flex items-center justify-between rounded-lg border border-line px-3 py-2 text-[10.5px] text-ink-faint">
                    {t.platforms.desktop.placeholder}
                    <span className="rounded bg-paper px-1.5 py-0.5">Auto ▾</span>
                  </div>
                </div>
              </div>
            </div>

            {/* CLI */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-paper-deep p-6 pb-0">
              <h3 className="text-base font-bold text-ink">{t.platforms.cli.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                {t.platforms.cli.copy}
              </p>
              <Link href="/login" className="mt-3 text-[13.5px] font-semibold text-mata hover:underline">
                {t.platforms.cli.cta}
              </Link>
              <div className="mt-5 flex-1 overflow-hidden rounded-t-xl border border-b-0 border-ink/60 bg-[#1b1d19]">
                <div className="flex items-center gap-1.5 border-b border-white/10 bg-[#242621] px-3 py-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                  <span className="h-1.5 w-1.5 rounded-full bg-white/25" />
                  <span className="ml-2 font-mono text-[9px] text-white/40">terminal</span>
                </div>
                <div className="space-y-1 px-3.5 py-3 font-mono text-[10px] leading-relaxed">
                  <p className="text-white/40">{t.platforms.cli.dir}</p>
                  <p className="text-paper">
                    <span className="text-salvia">$</span> w4y &quot;{t.platforms.cli.cmd}&quot;
                  </p>
                  <p className="text-white/50">{t.platforms.cli.status}</p>
                  <p className="mt-1 text-white/40">
                    checkout.ts <span className="text-emerald-400">+2</span>{" "}
                    <span className="text-red-400">-1</span>
                  </p>
                  <p className="bg-red-950/60 text-red-300">
                    <span className="text-red-400">-</span> total = item.price * qtd
                  </p>
                  <p className="bg-emerald-950/60 text-emerald-300">
                    <span className="text-emerald-400">+</span> total = itens.reduce(
                  </p>
                  <p className="bg-emerald-950/60 text-emerald-300">
                    <span className="text-emerald-400">+</span>&nbsp;&nbsp;(s, i) =&gt; s + i.price * i.qtd, 0)
                  </p>
                  <p className="mt-1 text-salvia">{t.platforms.cli.done}</p>
                  <p className="text-paper">
                    <span className="text-salvia">$</span>{" "}
                    <span className="inline-block h-[1em] w-[6px] translate-y-[2px] animate-pulse bg-paper/70" />
                  </p>
                </div>
              </div>
            </div>

            {/* Other platforms — WhatsApp */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-paper-deep p-6 pb-0">
              <h3 className="text-base font-bold text-ink">{t.platforms.whatsapp.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                {t.platforms.whatsapp.copy}
              </p>
              <Link href="/login" className="mt-3 text-[13.5px] font-semibold text-mata hover:underline">
                {t.platforms.whatsapp.cta}
              </Link>
              <div className="mt-5 flex-1 overflow-hidden rounded-t-xl border border-b-0 border-line bg-[#ece5dd]">
                <div className="flex items-center gap-2 border-b border-line bg-white px-3 py-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/apps/whatsapp.svg" alt="" width={14} height={14} className="h-3.5 w-3.5" />
                  <span className="text-[11px] font-semibold text-ink">{t.platforms.whatsapp.agentName}</span>
                  <span className="text-[10px] text-[#25a05a]">{t.platforms.whatsapp.online}</span>
                </div>
                <div className="space-y-2 px-3 py-3">
                  <div className="ml-auto w-fit max-w-[85%] rounded-lg rounded-tr-sm bg-[#d9fdd3] px-2.5 py-1.5 text-[10.5px] text-ink shadow-sm">
                    {t.platforms.whatsapp.msg}
                    <span className="ml-1 text-[9px] text-[#53bdeb]">✓✓</span>
                  </div>
                  <div className="w-fit max-w-[85%] rounded-lg rounded-tl-sm bg-white px-2.5 py-1.5 text-[10.5px] text-ink shadow-sm">
                    {t.platforms.whatsapp.reply}
                  </div>
                  <div className="w-fit max-w-[85%] rounded-lg rounded-tl-sm bg-white px-2.5 py-1.5 text-[10.5px] font-medium text-ink shadow-sm">
                    {t.platforms.whatsapp.file}
                  </div>
                </div>
              </div>
            </div>

            {/* Web and mobile */}
            <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-paper-deep p-6 pb-0">
              <h3 className="text-base font-bold text-ink">{t.platforms.web.title}</h3>
              <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-soft">
                {t.platforms.web.copy}
              </p>
              <Link href="/login" className="mt-3 text-[13.5px] font-semibold text-mata hover:underline">
                {t.platforms.web.cta}
              </Link>
              <div className="mx-auto mt-5 w-[82%] flex-1 overflow-hidden rounded-t-[1.6rem] border-4 border-b-0 border-ink bg-white">
                <div className="flex justify-center pt-2">
                  <span className="h-3.5 w-16 rounded-full bg-ink" />
                </div>
                <div className="px-3 py-3">
                  <div className="flex gap-1.5">
                    <span className="rounded-full bg-ink px-2.5 py-1 text-[9.5px] font-semibold text-paper">
                      {t.platforms.web.tabAgent}
                    </span>
                    <span className="rounded-full bg-paper px-2.5 py-1 text-[9.5px] text-ink-soft">
                      {t.platforms.web.tabPanel}
                    </span>
                  </div>
                  <p className="mt-3 text-[10px] font-semibold text-ink">{t.platforms.web.today}</p>
                  <div className="mt-2 space-y-2">
                    {t.platforms.web.rows.map((r) => (
                      <div key={r.t} className="flex items-start gap-2">
                        <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${r.dot ? "w4y-live-dot bg-salvia" : "bg-salvia"}`} />
                        <div className="min-w-0">
                          <p className="truncate text-[10.5px] font-medium text-ink">{r.t}</p>
                          <p className="text-[9.5px] text-ink-faint">{r.s}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── S8 · Trust hairlines ────────────────────────────────────── */}
      <section className="px-6 pb-8 pt-4">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.trust.map((c) => (
            <div key={c.title} className="border-t-2 border-ink pt-4">
              <h3 className="text-sm font-bold text-ink">{c.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{c.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── S9 · Final CTA ──────────────────────────────────────────── */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-4xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance] md:text-5xl">
            {t.final.title}
          </h2>
          <p className="mt-5 text-lg text-ink-soft">
            {t.final.p}
          </p>
        </div>
        <div className="mt-10">
          <DelegationInput compact />
        </div>
      </section>
    </>
  );
}
