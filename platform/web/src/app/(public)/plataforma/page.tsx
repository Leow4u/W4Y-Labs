import Image from "next/image";
import Link from "next/link";
import { getSiteLocale } from "@/lib/site-locale";

export const metadata = { title: "Plataforma — Work4You" };

// Platform page: the product in two postures — operate the day-to-day and
// build/code — plus Studio, models (Auto), the 24/7 cloud and controls.
// Same visual grammar as the home: real-mechanics mocks, Papel & Mata.

const MODELS = [
  { name: "Opus 5", tier: "High" },
  { name: "Sonnet 5", tier: "High" },
  { name: "GPT-5.6 Sol", tier: "Medium" },
  { name: "Grok 4.5", tier: "High Fast" },
  { name: "Fable 5", tier: "High" },
];

// All user-visible copy, per locale. Rendered via CONTENT[locale].
const CONTENT = {
  pt: {
    hero: {
      title1: "O novo jeito de trabalhar.",
      title2: "Seu parceiro de trabalho para grandes resultados.",
      ctaPrimary: "Começar agora",
      ctaSecondary: "Ver preços →",
    },
    operate: {
      eyebrow: "Pra operar",
      h2a: "O dia a dia da empresa",
      h2b: "rodando sozinho.",
      body:
        "Rotinas na agenda, atendimento nos canais, entregas prontas na pasta certa. Ações sensíveis esperam a sua aprovação — o resto simplesmente acontece.",
      bullets: [
        "Rotinas e automações — todo dia, semana ou evento",
        "Canais: WhatsApp, Telegram, Slack, e-mail",
        "Entregas: planilhas, decks, PDFs prontos",
        "Aprovação humana no que importa",
      ],
      windowLabel: "Agenda — rotinas",
      rows: [
        { when: "Toda manhã · 07h00", what: "Resumo dos e-mails e do que vence hoje", on: true },
        { when: "Toda sexta · 17h00", what: "Cobranças e follow-ups da semana", on: true },
        { when: "Todo dia 1º · 09h00", what: "Fechamento do mês em Excel", on: true },
        { when: "Ao chegar anexo novo", what: "Ler, classificar e arquivar", on: false },
      ],
      statusOn: "no ar",
      statusOff: "pausada",
    },
    build: {
      eyebrow: "Pra construir e codar",
      h2a: "Código de verdade,",
      h2b: "do repositório ao preview.",
      body:
        "Aponte pra uma pasta ou repositório: o agente lê o código, edita com diffs revisáveis, roda testes e abre PRs. E você vê o resultado no browser embutido — sem sair da conversa.",
      bullets: [
        "Pastas locais e repositórios git",
        "Terminal e execução de verdade",
        "Diffs coloridos, revisáveis linha a linha",
        "Preview no browser embutido",
      ],
      windowLabel: "~/loja-web — seu agente",
      prompt: "corrige o bug do checkout e roda os testes",
      readingPrefix: "Lendo",
      runningPrefix: "Rodando",
      runningSuffix: "— 1 falhou",
      diffRemoved: "- total = item.price * qtd",
      diffAdded1: "+ total = itens.reduce(",
      diffAdded2: "+  (s, i) => s + i.price * i.qtd, 0)",
      done: "✓ Testes passando · PR aberto pra sua revisão",
      previewLabel: "Preview",
    },
    studio: {
      eyebrow: "Agent Studio",
      h3: "Construa um. Construa vários.",
      body:
        "Agentes independentes com foco próprio, que se consultam e trabalham juntos. O principal delega e traz o resultado.",
      agents: [
        { name: "Agente principal", focus: "Coordena, delega e entrega", on: true },
        { name: "Vendas", focus: "Leads, propostas e follow-ups", on: true },
        { name: "Financeiro", focus: "Cobranças e conciliação", on: true },
      ],
      badge: "no ar",
    },
    models: {
      eyebrow: "Modelos",
      h3: "Os melhores modelos. Ou o Auto.",
      body:
        "Escolha o modelo por tarefa, traga a sua API — ou deixe no Auto, que roteia pro melhor de cada trabalho e você gasta menos.",
      autoLabel: "Auto",
    },
    cloud: {
      eyebrow: "O coração é a nuvem",
      h2: "Desktop e web são entradas. A nuvem é onde ele fica ligado.",
      body:
        "Trabalhos longos, rotinas e canais continuam rodando com o seu notebook fechado — e o agente avisa quando termina.",
    },
    controls: [
      { title: "Aprovação humana", copy: "Ações sensíveis esperam o seu OK." },
      { title: "Histórico completo", copy: "Cada tarefa e decisão registrada." },
      { title: "Controle de uso", copy: "Consumo e custo por agente." },
      { title: "Acesso por equipe", copy: "Cada pessoa vê o que deve ver." },
    ],
    cta: {
      h2: "Construa o seu. Leva minutos.",
      button: "Construir meu agente",
    },
  },
  en: {
    hero: {
      title1: "The new way to work.",
      title2: "Your work partner for big results.",
      ctaPrimary: "Start now",
      ctaSecondary: "See pricing →",
    },
    operate: {
      eyebrow: "To operate",
      h2a: "Your company's day-to-day",
      h2b: "running on its own.",
      body:
        "Routines on the agenda, support across your channels, deliverables saved to the right folder. Sensitive actions wait for your approval — the rest just happens.",
      bullets: [
        "Routines and automations — daily, weekly, or on an event",
        "Channels: WhatsApp, Telegram, Slack, email",
        "Deliveries: finished spreadsheets, decks, and PDFs",
        "Human approval where it matters",
      ],
      windowLabel: "Agenda — routines",
      rows: [
        { when: "Every morning · 7:00 AM", what: "Summary of your email and what's due today", on: true },
        { when: "Every Friday · 5:00 PM", what: "Payment reminders and the week's follow-ups", on: true },
        { when: "Every 1st · 9:00 AM", what: "Monthly close in Excel", on: true },
        { when: "When an attachment arrives", what: "Read, classify, and file it", on: false },
      ],
      statusOn: "live",
      statusOff: "paused",
    },
    build: {
      eyebrow: "To build and code",
      h2a: "Real code,",
      h2b: "from repo to preview.",
      body:
        "Point it at a folder or repository: the agent reads the code, edits with reviewable diffs, runs tests, and opens PRs. And you watch the result in the built-in browser — without leaving the conversation.",
      bullets: [
        "Local folders and git repositories",
        "A real terminal, real execution",
        "Colored diffs, reviewable line by line",
        "Preview in the built-in browser",
      ],
      windowLabel: "~/store-web — your agent",
      prompt: "fix the checkout bug and run the tests",
      readingPrefix: "Reading",
      runningPrefix: "Running",
      runningSuffix: "— 1 failed",
      diffRemoved: "- total = item.price * qty",
      diffAdded1: "+ total = items.reduce(",
      diffAdded2: "+  (s, i) => s + i.price * i.qty, 0)",
      done: "✓ Tests passing · PR open for your review",
      previewLabel: "Preview",
    },
    studio: {
      eyebrow: "Agent Studio",
      h3: "Build one. Build many.",
      body:
        "Independent agents, each with its own focus, that consult each other and work together. The main one delegates and brings back the result.",
      agents: [
        { name: "Main agent", focus: "Coordinates, delegates, and delivers", on: true },
        { name: "Sales", focus: "Leads, proposals, and follow-ups", on: true },
        { name: "Finance", focus: "Billing and reconciliation", on: true },
      ],
      badge: "live",
    },
    models: {
      eyebrow: "Models",
      h3: "The best models. Or Auto.",
      body:
        "Pick a model per task, bring your own API — or leave it on Auto, which routes each job to the best fit and costs you less.",
      autoLabel: "Auto",
    },
    cloud: {
      eyebrow: "The heart is the cloud",
      h2: "Desktop and web are doorways. The cloud is where it stays on.",
      body:
        "Long jobs, routines, and channels keep running with your laptop closed — and the agent lets you know when it's done.",
    },
    controls: [
      { title: "Human approval", copy: "Sensitive actions wait for your OK." },
      { title: "Full history", copy: "Every task and decision on record." },
      { title: "Usage control", copy: "Consumption and cost per agent." },
      { title: "Team access", copy: "Each person sees only what they should." },
    ],
    cta: {
      h2: "Build yours. It takes minutes.",
      button: "Build my agent",
    },
  },
};

function WindowChrome({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-line bg-paper px-3 py-2">
      <span className="h-1.5 w-1.5 rounded-full bg-line" />
      <span className="h-1.5 w-1.5 rounded-full bg-line" />
      <span className="h-1.5 w-1.5 rounded-full bg-line" />
      <span className="mx-auto rounded border border-line bg-white px-3 py-px font-mono text-[9px] text-ink-faint">
        {label}
      </span>
    </div>
  );
}

export default async function PlataformaPage() {
  const locale = await getSiteLocale();
  const t = CONTENT[locale];

  return (
    <>
      {/* ── Hero ────────────────────────────────────────────────────── */}
      <section className="px-6 pb-16 pt-20 md:pt-24">
        <div className="mx-auto max-w-6xl">
          <h1 className="max-w-3xl text-3xl font-bold leading-[1.18] tracking-[-0.02em] md:text-[2.6rem]">
            <span className="text-ink">{t.hero.title1}</span>{" "}
            <span className="font-semibold text-ink-faint">
              {t.hero.title2}
            </span>
          </h1>
          <div className="mt-8 flex flex-wrap items-center gap-5">
            <Link
              href="/login"
              className="rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-paper transition-colors hover:bg-black"
            >
              {t.hero.ctaPrimary}
            </Link>
            <Link
              href="/precos"
              className="text-[15px] font-semibold text-ink-soft underline-offset-4 transition-colors hover:text-ink hover:underline"
            >
              {t.hero.ctaSecondary}
            </Link>
          </div>
        </div>
      </section>

      {/* ── Operate the day-to-day ──────────────────────────────────── */}
      <section className="border-t border-line bg-paper-deep px-6 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
          <div>
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
              {t.operate.eyebrow}
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-ink md:text-4xl">
              {t.operate.h2a}{" "}
              <span className="text-ink-faint">{t.operate.h2b}</span>
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-ink-soft">
              {t.operate.body}
            </p>
            <ul className="mt-6 space-y-2.5">
              {t.operate.bullets.map((b) => (
                <li key={b} className="flex gap-2.5 text-[14px] leading-snug text-ink-soft">
                  <span className="mt-0.5 shrink-0 font-mono text-[12px] text-salvia">✓</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>

          {/* Agenda mock */}
          <div className="rounded-3xl bg-white/60 p-4 sm:p-8">
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_80px_-40px_rgba(41,51,31,0.35)]">
              <WindowChrome label={t.operate.windowLabel} />
              <div className="divide-y divide-line">
                {t.operate.rows.map((r) => (
                  <div key={r.when} className="flex items-center gap-4 px-5 py-3.5">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${r.on ? "w4y-live-dot bg-salvia" : "bg-line"}`} />
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-salvia">
                        {r.when}
                      </p>
                      <p className="mt-0.5 truncate text-sm text-ink">{r.what}</p>
                    </div>
                    <span className="ml-auto shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
                      {r.on ? t.operate.statusOn : t.operate.statusOff}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Build & code ────────────────────────────────────────────── */}
      <section className="px-6 py-20">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {/* Code window with diff + preview side panel */}
          <div className="order-2 rounded-3xl bg-paper-deep p-4 sm:p-8 lg:order-1">
            <div className="overflow-hidden rounded-2xl border border-line bg-white shadow-[0_24px_80px_-40px_rgba(41,51,31,0.35)]">
              <WindowChrome label={t.build.windowLabel} />
              <div className="grid sm:grid-cols-[1fr_170px]">
                <div className="space-y-2 px-4 py-4">
                  <div className="rounded-lg border border-line px-3 py-2 text-[12px] text-ink">
                    {t.build.prompt}
                  </div>
                  <p className="px-1 text-[11px] text-ink-faint">
                    {t.build.readingPrefix} <span className="font-mono text-[10.5px]">checkout.ts</span>
                  </p>
                  <p className="px-1 text-[11px] text-ink-faint">
                    {t.build.runningPrefix} <span className="font-mono text-[10.5px]">npm test</span> {t.build.runningSuffix}
                  </p>
                  <div className="overflow-hidden rounded-lg border border-line font-mono text-[10.5px]">
                    <p className="flex justify-between border-b border-line bg-paper px-3 py-1.5 text-ink-soft">
                      checkout.ts
                      <span>
                        <span className="text-emerald-600">+2</span>{" "}
                        <span className="text-red-500">-1</span>
                      </span>
                    </p>
                    <p className="bg-red-50 px-3 py-1 text-red-700">
                      {t.build.diffRemoved}
                    </p>
                    <p className="bg-emerald-50 px-3 py-1 text-emerald-700">
                      {t.build.diffAdded1}
                    </p>
                    <p className="bg-emerald-50 px-3 py-1 text-emerald-700">
                      {t.build.diffAdded2}
                    </p>
                  </div>
                  <p className="px-1 text-[12px] font-medium text-mata">
                    {t.build.done}
                  </p>
                </div>
                {/* built-in browser preview */}
                <div className="hidden border-l border-line bg-paper p-2.5 sm:block">
                  <p className="mb-2 font-mono text-[9px] uppercase tracking-[0.16em] text-ink-faint">
                    {t.build.previewLabel}
                  </p>
                  <div className="overflow-hidden rounded-lg border border-line bg-white">
                    <div className="border-b border-line bg-paper px-2 py-1 font-mono text-[8px] text-ink-faint">
                      localhost:3000
                    </div>
                    <div className="space-y-1.5 p-2.5">
                      <div className="h-2 w-3/4 rounded bg-ink/80" />
                      <div className="h-1.5 w-full rounded bg-line" />
                      <div className="h-1.5 w-5/6 rounded bg-line" />
                      <div className="mt-2 h-4 w-14 rounded-full bg-mata" />
                      <div className="mt-2 grid grid-cols-2 gap-1.5">
                        <div className="h-7 rounded bg-salvia-soft" />
                        <div className="h-7 rounded bg-salvia-soft" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="order-1 lg:order-2">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
              {t.build.eyebrow}
            </p>
            <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-ink md:text-4xl">
              {t.build.h2a}{" "}
              <span className="text-ink-faint">{t.build.h2b}</span>
            </h2>
            <p className="mt-5 max-w-md leading-relaxed text-ink-soft">
              {t.build.body}
            </p>
            <ul className="mt-6 space-y-2.5">
              {t.build.bullets.map((b) => (
                <li key={b} className="flex gap-2.5 text-[14px] leading-snug text-ink-soft">
                  <span className="mt-0.5 shrink-0 font-mono text-[12px] text-salvia">✓</span>
                  {b}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Studio + Models row ─────────────────────────────────────── */}
      <section className="border-t border-line px-6 py-20">
        <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-2">
          {/* Agent Studio */}
          <div className="rounded-2xl border border-line bg-white p-7">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
              {t.studio.eyebrow}
            </p>
            <h3 className="mt-2 text-xl font-bold text-ink">
              {t.studio.h3}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {t.studio.body}
            </p>
            <div className="mt-5 overflow-hidden rounded-xl border border-line">
              {t.studio.agents.map((a, i) => (
                <div key={a.name} className={`flex items-center gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}>
                  <span className={`h-2 w-2 shrink-0 rounded-full ${a.on ? "w4y-live-dot bg-salvia" : "bg-line"}`} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-ink">{a.name}</p>
                    <p className="truncate text-[12.5px] text-ink-soft">{a.focus}</p>
                  </div>
                  <span className="ml-auto shrink-0 rounded-full bg-salvia-soft px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.12em] text-mata">
                    {t.studio.badge}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Models / Auto */}
          <div className="rounded-2xl border border-line bg-white p-7">
            <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
              {t.models.eyebrow}
            </p>
            <h3 className="mt-2 text-xl font-bold text-ink">
              {t.models.h3}
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {t.models.body}
            </p>
            <div className="mt-5 overflow-hidden rounded-xl border border-line">
              <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
                <span className="text-sm font-semibold text-ink">{t.models.autoLabel}</span>
                <span className="flex h-4 w-7 items-center rounded-full bg-mata px-0.5">
                  <span className="ml-auto h-3 w-3 rounded-full bg-paper" />
                </span>
              </div>
              {MODELS.map((m, i) => (
                <div key={m.name} className={`flex items-center gap-2 px-4 py-2 ${i > 0 ? "border-t border-line/60" : ""}`}>
                  <span className="text-[13px] text-ink">{m.name}</span>
                  <span className="text-[11px] text-ink-faint">{m.tier}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── The cloud heart (24/7) ──────────────────────────────────── */}
      <section className="relative overflow-hidden bg-mata-deep px-6 py-20 text-paper">
        <Image
          src="/media/night-forest.jpg"
          alt=""
          fill
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-mata-deep/70" />
        <div className="relative mx-auto max-w-3xl text-center">
          <p className="font-mono text-[11px] font-medium uppercase tracking-[0.18em] text-salvia">
            {t.cloud.eyebrow}
          </p>
          <h2 className="mt-4 text-3xl font-bold leading-tight tracking-tight [text-wrap:balance] md:text-4xl">
            {t.cloud.h2}
          </h2>
          <p className="mx-auto mt-5 max-w-xl leading-relaxed text-paper/75">
            {t.cloud.body}
          </p>
        </div>
      </section>

      {/* ── Controls ────────────────────────────────────────────────── */}
      <section className="px-6 py-16">
        <div className="mx-auto grid max-w-6xl gap-x-10 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
          {t.controls.map((c) => (
            <div key={c.title} className="border-t-2 border-ink pt-4">
              <h3 className="text-sm font-bold text-ink">{c.title}</h3>
              <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">{c.copy}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────────────────────── */}
      <section className="border-t border-line bg-paper-deep px-6 py-20">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-extrabold tracking-[-0.02em] text-ink [text-wrap:balance] md:text-4xl">
            {t.cta.h2}
          </h2>
          <div className="mt-7">
            <Link
              href="/login"
              className="inline-block rounded-full bg-ink px-7 py-3 text-[15px] font-semibold text-paper transition-colors hover:bg-black"
            >
              {t.cta.button}
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
