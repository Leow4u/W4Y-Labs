"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { SiteLocale } from "@/lib/site-locale-shared";

// The landing's protagonist: a live product window cycling through real
// scenarios with the REAL mechanics — every prompt is typed in the composer
// and sent; multi-turn scenes supported (agent asks, user replies). Chat area
// has fixed height like a real session (older content scrolls out the top).
// Interaction routes to /login. All copy is bilingual (pt/en) via the locale prop.

type Item =
  | { kind: "line"; text: string }
  | { kind: "reply"; text: string }
  | { kind: "pdf" }
  | { kind: "auth"; app: "gmail" | "instagram"; label: string }
  | { kind: "connected"; app: "gmail" | "instagram"; text: string }
  | { kind: "routine" }
  | { kind: "picker" }
  | { kind: "preview" }
  | { kind: "igcopy" }
  | { kind: "igpost" }
  | { kind: "published" };

type Turn = { user: string; items: Item[]; gap?: number };
type Scenario = { turns: Turn[]; hold: number };

const SCENARIOS: Record<SiteLocale, Scenario[]> = {
  pt: [
    // 1 · Instagram: connect → clarify → copy + art → published
    {
      turns: [
        {
          user: "Quero fazer um post vencedor pro meu Instagram.",
          items: [
            { kind: "line", text: "Thinking" },
            { kind: "line", text: "Conectores · Instagram" },
            { kind: "auth", app: "instagram", label: "Instagram" },
            { kind: "connected", app: "instagram", text: "✓ Conectado — conta do Instagram ativa." },
            { kind: "reply", text: "Conta conectada! Quer que eu escreva o copy e monte a arte pra publicar?" },
          ],
          gap: 950,
        },
        {
          user: "Sim! Capricha — quero parar o feed.",
          items: [
            { kind: "line", text: "Thinking" },
            { kind: "line", text: "Auto · criativo → Sonnet 5" },
            { kind: "line", text: "Gerando  post-instagram.png" },
            { kind: "reply", text: "Copy e arte prontos:" },
            { kind: "igcopy" },
            { kind: "igpost" },
            { kind: "published" },
          ],
          gap: 850,
        },
      ],
      hold: 5200,
    },
    // 2 · Task with Auto routing → PDF delivery
    {
      turns: [
        {
          user: "Monte a proposta com os números de junho e me devolva em PDF até as 15h.",
          items: [
            { kind: "line", text: "Thinking" },
            { kind: "line", text: "Auto · tarefa complexa → Opus 5" },
            { kind: "line", text: "Lendo a pasta  /Propostas/junho" },
            { kind: "line", text: "Gerando  proposta-junho.pdf" },
            { kind: "reply", text: "Pronto! Proposta fechada com os números de junho:" },
            { kind: "pdf" },
          ],
        },
      ],
      hold: 4200,
    },
    // 3 · The model picker (agnostic story)
    {
      turns: [
        {
          user: "Quais modelos posso usar?",
          items: [
            { kind: "line", text: "Thinking" },
            {
              kind: "reply",
              text: "Todos os principais — ou deixa no Auto, que eu escolho o melhor pra cada tarefa e você gasta menos.",
            },
            { kind: "picker" },
          ],
          gap: 900,
        },
      ],
      hold: 5200,
    },
    // 4 · Landing page built + side-panel preview
    {
      turns: [
        {
          user: "Cria uma landing page pro meu restaurante — e me mostra no preview.",
          items: [
            { kind: "line", text: "Thinking" },
            { kind: "line", text: "Escrevendo  index.html" },
            { kind: "line", text: "Browser · abrindo preview" },
            { kind: "reply", text: "Prontinha — dá uma olhada:" },
            { kind: "preview" },
          ],
        },
      ],
      hold: 5200,
    },
    // 5 · 24/7 routine
    {
      turns: [
        {
          user: "Toda sexta às 17h, manda as cobranças da semana pros clientes.",
          items: [
            { kind: "line", text: "Thinking" },
            { kind: "line", text: "Automações · automação criada" },
            { kind: "reply", text: "Automação no ar — todo dia às 7:00:" },
            { kind: "routine" },
          ],
        },
      ],
      hold: 4200,
    },
  ],
  en: [
    // 1 · Instagram: connect → clarify → copy + art → published
    {
      turns: [
        {
          user: "I want a winning post for my Instagram.",
          items: [
            { kind: "line", text: "Thinking" },
            { kind: "line", text: "Connectors · Instagram" },
            { kind: "auth", app: "instagram", label: "Instagram" },
            { kind: "connected", app: "instagram", text: "✓ Connected — Instagram account active." },
            { kind: "reply", text: "Account connected! Want me to write the copy and build the art to publish?" },
          ],
          gap: 950,
        },
        {
          user: "Yes! Make it good — I want to stop the scroll.",
          items: [
            { kind: "line", text: "Thinking" },
            { kind: "line", text: "Auto · creative → Sonnet 5" },
            { kind: "line", text: "Generating  instagram-post.png" },
            { kind: "reply", text: "Copy and art ready:" },
            { kind: "igcopy" },
            { kind: "igpost" },
            { kind: "published" },
          ],
          gap: 850,
        },
      ],
      hold: 5200,
    },
    // 2 · Task with Auto routing → PDF delivery
    {
      turns: [
        {
          user: "Put together the proposal with the June numbers and send it back as a PDF by 3pm.",
          items: [
            { kind: "line", text: "Thinking" },
            { kind: "line", text: "Auto · complex task → Opus 5" },
            { kind: "line", text: "Reading folder  /Proposals/june" },
            { kind: "line", text: "Generating  june-proposal.pdf" },
            { kind: "reply", text: "Done! Proposal finalized with the June numbers:" },
            { kind: "pdf" },
          ],
        },
      ],
      hold: 4200,
    },
    // 3 · The model picker (agnostic story)
    {
      turns: [
        {
          user: "Which models can I use?",
          items: [
            { kind: "line", text: "Thinking" },
            {
              kind: "reply",
              text: "All the leading ones — or leave it on Auto and I'll pick the best one for each task, so you spend less.",
            },
            { kind: "picker" },
          ],
          gap: 900,
        },
      ],
      hold: 5200,
    },
    // 4 · Landing page built + side-panel preview
    {
      turns: [
        {
          user: "Build a landing page for my restaurant — and show me the preview.",
          items: [
            { kind: "line", text: "Thinking" },
            { kind: "line", text: "Writing  index.html" },
            { kind: "line", text: "Browser · opening preview" },
            { kind: "reply", text: "All set — take a look:" },
            { kind: "preview" },
          ],
        },
      ],
      hold: 5200,
    },
    // 5 · 24/7 routine
    {
      turns: [
        {
          user: "Every day at 7am, email me the daily AI news digest.",
          items: [
            { kind: "line", text: "Thinking" },
            { kind: "line", text: "Automations · automation created" },
            { kind: "reply", text: "Automation is live — every day at 7:00 AM:" },
            { kind: "routine" },
          ],
        },
      ],
      hold: 4200,
    },
  ],
};

// Window chrome, sidebar, composer, and card strings (per locale).
const T = {
  pt: {
    windowTitle: "work4you.ai — seu agente",
    live: "no ar",
    newSession: "Nova sessão",
    newSessionHint: "Ctrl N",
    menu: ["Automações", "Personalizar", "Canais", "Artefatos"],
    projectsLabel: "Projetos",
    projects: ["Dutelog"],
    sessionsLabel: "Sessões",
    sessions: [
      "restart whatsapp gateway",
      "Saudações e início de co…",
      "Mapeia a estrutura deste reposit…",
    ],
    emptyTitle: "No que vamos trabalhar?",
    emptySub:
      "Traz o código, a dúvida ou o ponto onde estás preso. Eu leio o contexto antes de mudar algo.",
    quickChips: [
      "Mapeia a estrutura deste reposit…",
      "Corrige os testes a falhar",
      "Refatora o módulo que eu indicar",
      "Prepara um PR com a última alter…",
    ],
    searchModels: "Buscar modelos",
    addModels: "Adicionar modelos",
    chooseFolder: "Escolha uma pasta",
    composerPlaceholder: "Pergunte qualquer coisa",
    askApproval: "⚡ Nunca perguntar",
    modelLabel: "Gemini 1.5 Flash - Max",
    pdfName: "proposta-junho.pdf",
    pdfSub: "Salvo em Artefatos — pronto pra revisar",
    pdfDone: "feito ✓",
    authSub: "Autorização segura",
    authorize: "Autorizar",
    connectedBadge: "✓ Conectado",
    captionLabel: "Legenda",
    captionText:
      "Enquanto você lê isso, o meu agente tá respondendo clientes e fechando a semana. Monte o seu em minutos — e deixa ligado 24/7.",
    captionTags: "#IA #produtividade #automação",
    artTop: "O meu agente",
    artBox: "Trabalha",
    artBottom: "enquanto eu durmo",
    igHandle: "@suaempresa",
    igNow: "agora",
    published: "✓ Post publicado com sucesso — agora é só aguardar os bons resultados.",
    previewLabel: "Preview",
    trattoriaTag: "Cucina italiana",
    trattoriaSub: "Massas frescas, todos os dias",
    trattoriaCta: "Reservar mesa",
  },
  en: {
    windowTitle: "work4you.ai — your agent",
    live: "live",
    newSession: "New session",
    newSessionHint: "Ctrl N",
    menu: ["Automations", "Customize", "Channels", "Artifacts"],
    projectsLabel: "Projects",
    projects: ["Dutelog"],
    sessionsLabel: "Sessions",
    sessions: [
      "restart whatsapp gateway",
      "Greetings and kickoff…",
      "Map this repo's structure…",
    ],
    emptyTitle: "What are we working on?",
    emptySub:
      "Bring the code, the question, or where you're stuck. I read the context before changing anything.",
    quickChips: [
      "Map this repo's structure…",
      "Fix the failing tests",
      "Refactor the module I point at",
      "Prepare a PR with the last change…",
    ],
    searchModels: "Search models",
    addModels: "Add models",
    chooseFolder: "Choose a folder",
    composerPlaceholder: "Ask anything",
    askApproval: "⚡ Never ask",
    modelLabel: "Gemini 1.5 Flash - Max",
    pdfName: "june-proposal.pdf",
    pdfSub: "Saved to Artifacts — ready to review",
    pdfDone: "done ✓",
    authSub: "Secure authorization",
    authorize: "Authorize",
    connectedBadge: "✓ Connected",
    captionLabel: "Caption",
    captionText:
      "While you're reading this, my agent is answering customers and closing out the week. Build yours in minutes — and leave it on 24/7.",
    captionTags: "#AI #productivity #automation",
    artTop: "My agent",
    artBox: "Works",
    artBottom: "while I sleep",
    igHandle: "@yourcompany",
    igNow: "now",
    published: "✓ Post published — now just watch the results come in.",
    previewLabel: "Preview",
    trattoriaTag: "Cucina italiana",
    trattoriaSub: "Fresh pasta, every day",
    trattoriaCta: "Book a table",
  },
} satisfies Record<SiteLocale, unknown>;

const MODELS = [
  { name: "Opus 5", tier: "High" },
  { name: "Sonnet 5", tier: "High" },
  { name: "GPT-5.6 Sol", tier: "Medium" },
  { name: "Grok 4.5", tier: "High Fast", isNew: true },
  { name: "Fable 5", tier: "High" },
  { name: "Sonnet 4.6", tier: "Medium" },
];

const APP_ICONS = {
  gmail: "/brand/apps/gmail.svg",
  instagram: "/brand/apps/instagram.svg",
};

export default function HeroDemo({ locale }: { locale: SiteLocale }) {
  const router = useRouter();
  const [si, setSi] = useState(0);
  const [ti, setTi] = useState(0);
  const [typed, setTyped] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [reduced, setReduced] = useState(false);

  const t = T[locale];
  const scenarios = SCENARIOS[locale];

  useEffect(() => {
    const scs = SCENARIOS[locale];
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setSi(1);
      setTi(0);
      setSent(true);
      setRevealed(scs[1].turns[0].items.length);
      return;
    }
    let cancelled = false;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(() => { if (!cancelled) fn(); }, ms));
    };

    const play = (index: number) => {
      const sc = scs[index];
      setSi(index);
      let T = 0;
      sc.turns.forEach((turn, t) => {
        const start = T;
        at(start, () => { setTi(t); setTyped(0); setSending(false); setSent(false); setRevealed(0); });
        for (let i = 1; i <= turn.user.length; i++) at(start + 500 + i * 22, () => setTyped(i));
        const doneTyping = start + 500 + turn.user.length * 22;
        at(doneTyping + 350, () => setSending(true));
        at(doneTyping + 650, () => { setSending(false); setSent(true); });
        const base = doneTyping + 1100;
        const gap = turn.gap ?? 750;
        turn.items.forEach((_, idx) => at(base + idx * gap, () => setRevealed(idx + 1)));
        T = base + turn.items.length * gap + 700;
      });
      at(T + sc.hold, () => play((index + 1) % scs.length));
    };
    play(0);
    return () => { cancelled = true; timers.forEach(window.clearTimeout); };
  }, [locale]);

  const sc = scenarios[si];
  // items visible for a given turn (past turns fully, current turn progressive)
  const visibleItems = (t: number): Item[] => {
    if (t < ti) return sc.turns[t].items;
    if (t === ti && sent) return sc.turns[t].items.slice(0, revealed);
    return [];
  };
  const allVisible = sc.turns.flatMap((_, t) => visibleItems(t));
  const pickerOpen = allVisible.some((it) => it.kind === "picker");
  const previewOpen = allVisible.some((it) => it.kind === "preview");
  const connectedApps = new Set(
    allVisible.filter((it) => it.kind === "connected").map((it) => (it as { app: string }).app),
  );
  const anythingSent = ti > 0 || sent;

  const trattoria = (
    <div className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-line bg-paper px-3 py-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-line" />
        <span className="h-1.5 w-1.5 rounded-full bg-line" />
        <span className="h-1.5 w-1.5 rounded-full bg-line" />
        <span className="mx-auto rounded border border-line bg-white px-3 py-px font-mono text-[9px] text-ink-faint">
          trattoria-bella
        </span>
      </div>
      <div className="bg-[#faf5ec] px-5 pb-5 pt-4 text-center">
        <p className="font-mono text-[9px] uppercase tracking-[0.24em] text-[#b4552d]">
          {t.trattoriaTag}
        </p>
        <p className="mt-1.5 text-[20px] font-extrabold tracking-tight text-[#38281a]">
          Trattoria Bella
        </p>
        <p className="text-[11px] text-[#8a7663]">{t.trattoriaSub}</p>
        <span className="mt-2.5 inline-block rounded-full bg-[#b4552d] px-3.5 py-1.5 text-[10px] font-semibold text-white">
          {t.trattoriaCta}
        </span>
        <div className="mt-4 grid grid-cols-3 gap-2">
          <div className="h-12 rounded-lg bg-gradient-to-br from-[#e8c9a0] to-[#c98d52]" />
          <div className="h-12 rounded-lg bg-gradient-to-br from-[#d9a985] to-[#a9653a]" />
          <div className="h-12 rounded-lg bg-gradient-to-br from-[#efd9b8] to-[#b4795a]" />
        </div>
      </div>
    </div>
  );

  const renderItem = (it: Item, key: string) => {
    if (it.kind === "line") {
      const [a, b] = it.text.split("  ");
      return (
        <p key={key} className="px-1 text-[12px] text-ink-faint">
          {a}
          {b && <span className="font-mono text-[11px]"> {b}</span>}
        </p>
      );
    }
    if (it.kind === "reply") {
      return (
        <p key={key} className="px-1 text-[13.5px] leading-relaxed text-ink sm:text-sm">
          {it.text}
        </p>
      );
    }
    if (it.kind === "pdf") {
      return (
        <div key={key} className="flex items-center gap-3 rounded-xl border border-salvia/50 bg-salvia-soft px-4 py-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/apps/pdf.svg" alt="" width={26} height={26} className="h-7 w-7 shrink-0" />
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-ink">{t.pdfName}</p>
            <p className="text-[12px] text-ink-soft">{t.pdfSub}</p>
          </div>
          <span className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-mata">
            {t.pdfDone}
          </span>
        </div>
      );
    }
    if (it.kind === "auth") {
      const connected = connectedApps.has(it.app);
      return (
        <div key={key} className="flex max-w-sm items-center gap-3 rounded-xl border border-line bg-white px-4 py-3.5 shadow-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={APP_ICONS[it.app]} alt="" width={22} height={22} className="h-6 w-6 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">{it.label}</p>
            <p className="text-[12px] text-ink-soft">{t.authSub}</p>
          </div>
          {connected ? (
            <span className="ml-auto shrink-0 rounded-lg border border-salvia/60 bg-salvia-soft px-3.5 py-1.5 text-[12px] font-semibold text-mata">
              {t.connectedBadge}
            </span>
          ) : (
            <span className="ml-auto shrink-0 rounded-lg bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-paper">
              {t.authorize}
            </span>
          )}
        </div>
      );
    }
    if (it.kind === "connected") {
      return (
        <p key={key} className="px-1 text-[13px] font-medium text-mata">
          {it.text}
        </p>
      );
    }
    if (it.kind === "igcopy") {
      return (
        <div key={key} className="max-w-sm rounded-xl border-l-2 border-salvia bg-paper px-4 py-3">
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-faint">
            {t.captionLabel}
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            {t.captionText}{" "}
            <span className="text-mata">{t.captionTags}</span>
          </p>
        </div>
      );
    }
    if (it.kind === "igpost") {
      return (
        <div key={key} className="max-w-[230px] overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          {/* the art — real photo + bold type, like the reference */}
          <div className="relative aspect-[4/5] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/media/ig-sleep.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[62%_center]" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-black/10" />
            <div className="absolute inset-0 flex flex-col items-center p-4 text-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/brand/work4you-favicon-transparent-1024.png" alt="" className="h-7 w-7" />
              <div className="mt-auto">
                <p className="text-[13px] font-semibold text-white">{t.artTop}</p>
                <p className="mx-auto mt-1 w-fit bg-red-600 px-2.5 py-0.5 text-[22px] font-extrabold uppercase leading-tight tracking-tight text-white">
                  {t.artBox}
                </p>
                <p className="mt-1 text-[13px] font-semibold text-white">{t.artBottom}</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/apps/instagram.svg" alt="" width={13} height={13} className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium text-ink-soft">{t.igHandle}</span>
            <span className="ml-auto font-mono text-[10px] text-ink-faint">{t.igNow}</span>
          </div>
        </div>
      );
    }
    if (it.kind === "published") {
      return (
        <p key={key} className="px-1 text-[13px] font-medium text-mata">
          {t.published}
        </p>
      );
    }
    if (it.kind === "preview") {
      return (
        <div key={key} className="sm:hidden">
          {trattoria}
        </div>
      );
    }
    if (it.kind === "routine") {
      const job =
        locale === "pt"
          ? {
              name: "Notícias Diárias de IA por e-mail",
              when: "Todos os dias às 7:00 · Este desktop",
              status: "Ativa",
            }
          : {
              name: "Daily AI news by email",
              when: "Every day at 7:00 AM · This desktop",
              status: "Active",
            };
      return (
        <div
          key={key}
          className="max-w-md rounded-xl border border-line bg-paper px-4 py-3"
        >
          <p className="text-[13px] font-semibold text-ink">{job.name}</p>
          <p className="mt-0.5 text-[11px] text-ink-faint">{job.when}</p>
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            {job.status}
          </p>
        </div>
      );
    }
    return null; // "picker" renders as the composer dropdown
  };

  return (
    <div className="mx-auto w-full max-w-5xl overflow-hidden rounded-2xl border border-line bg-white shadow-[0_40px_120px_-48px_rgba(41,51,31,0.45)]">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-line bg-paper px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="h-2.5 w-2.5 rounded-full bg-line" />
        <span className="mx-auto rounded-md border border-line bg-white px-6 py-0.5 font-mono text-[11px] text-ink-faint">
          {t.windowTitle}
        </span>
        <span className="hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-salvia sm:flex">
          <span className="w4y-live-dot h-1.5 w-1.5 rounded-full bg-salvia" />
          {t.live}
        </span>
      </div>

      <div className={`grid ${previewOpen ? "sm:grid-cols-[190px_1fr_310px]" : "sm:grid-cols-[190px_1fr]"}`}>
        {/* sidebar — the product's real navigation */}
        <aside className="hidden border-r border-line bg-paper px-4 py-5 sm:block">
          <div className="space-y-2.5 text-[13px]">
            <p className="flex items-center justify-between font-semibold text-ink">
              <span>{t.newSession}</span>
              <span className="font-mono text-[10px] font-normal text-ink-faint">{t.newSessionHint}</span>
            </p>
            {t.menu.map((m) => (
              <p key={m} className="text-ink-soft">{m}</p>
            ))}
          </div>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            {t.projectsLabel}
          </p>
          <div className="mt-2.5 space-y-2 text-[12px] text-ink-soft">
            {t.projects.map((p) => (
              <p key={p} className="truncate">{p}</p>
            ))}
          </div>
          <p className="mt-5 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            {t.sessionsLabel}
          </p>
          <div className="mt-2.5 space-y-2 text-[12px] text-ink-soft">
            <p className="-mx-2 truncate rounded-md bg-paper-deep px-2 py-1 text-ink">
              {t.sessions[0]}
            </p>
            <p className="truncate">{t.sessions[1]}</p>
            <p className="truncate">{t.sessions[2]}</p>
          </div>
        </aside>

        {/* the session — fixed height, latest content pinned to the bottom */}
        <div className="flex flex-col gap-4 px-5 py-6 sm:px-7">
          {/* column-reverse keeps the newest content pinned to the bottom,
              pure CSS — no scroll timing to race against */}
          <div className="flex h-[400px] flex-col-reverse overflow-hidden">
            <div className="flex min-h-full shrink-0 flex-col justify-end gap-3">
            {!anythingSent ? (
              <div className="flex flex-1 flex-col items-center justify-center text-center">
                <p className="text-xl font-bold tracking-tight text-ink">
                  {t.emptyTitle}
                </p>
                <p className="mt-2 max-w-md text-[13px] leading-relaxed text-ink-faint">
                  {t.emptySub}
                </p>
                <div className="mt-5 flex max-w-lg flex-wrap justify-center gap-2">
                  {t.quickChips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full border border-line bg-white px-3 py-1.5 text-[11px] text-ink-soft"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              sc.turns.map((turn, t) => {
                const show = t < ti || (t === ti && sent);
                if (!show) return null;
                return (
                  <div key={t} className="contents">
                    <div className="rounded-xl border border-line bg-white px-4 py-3 text-[13.5px] leading-relaxed text-ink sm:text-sm">
                      {turn.user}
                    </div>
                    {visibleItems(t).map((it, idx) => renderItem(it, `${t}-${idx}`))}
                  </div>
                );
              })
            )}
            </div>
          </div>

          {/* composer — every prompt is typed HERE, then sent */}
          <div className="relative">
            {pickerOpen && (
              <div className="absolute bottom-12 right-16 z-10 w-60 overflow-hidden rounded-xl border border-line bg-white shadow-[0_20px_60px_-20px_rgba(26,28,24,0.35)]">
                <p className="border-b border-line px-3.5 py-2 text-[12px] text-ink-faint">
                  {t.searchModels}
                </p>
                <div className="flex items-center justify-between px-3.5 py-2">
                  <span className="text-[13px] font-semibold text-ink">Auto</span>
                  <span className="flex h-4 w-7 items-center rounded-full bg-mata px-0.5">
                    <span className="ml-auto h-3 w-3 rounded-full bg-paper" />
                  </span>
                </div>
                {MODELS.map((m) => (
                  <div key={m.name} className="flex items-center gap-1.5 px-3.5 py-1.5">
                    <span className="text-[13px] text-ink">{m.name}</span>
                    <span className="text-[11px] text-ink-faint">{m.tier}</span>
                    {m.isNew && (
                      <span className="rounded bg-salvia-soft px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase text-mata">
                        new
                      </span>
                    )}
                  </div>
                ))}
                <p className="border-t border-line px-3.5 py-2 text-[12px] text-ink-soft">
                  {t.addModels}
                </p>
              </div>
            )}
            <button
              onClick={() => router.push("/login")}
              className="group w-full rounded-xl border border-line bg-white text-left transition-colors hover:border-salvia"
            >
              <span className="flex items-center gap-2 border-b border-line/70 px-4 py-2 text-[12px] text-ink-faint">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
                </svg>
                {t.chooseFolder}
              </span>
              <span className="block min-h-[2.9rem] px-4 py-3 text-[13.5px] leading-relaxed">
                {!sent && typed > 0 ? (
                  <span className="text-ink">
                    {sc.turns[ti].user.slice(0, typed)}
                    {!reduced && typed < sc.turns[ti].user.length && (
                      <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-ink/60" />
                    )}
                  </span>
                ) : (
                  <span className="text-ink-faint">{t.composerPlaceholder}</span>
                )}
              </span>
              <span className="flex items-center gap-3 px-4 pb-3 text-ink-faint">
                <span className="text-base leading-none">+</span>
                <span className="text-[12px]">{t.askApproval}</span>
                <span className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-ink-soft">
                  GitHub
                </span>
                <span className="rounded border border-line px-1.5 py-0.5 text-[10px] text-ink-soft">
                  Gemini
                </span>
                <span className={`ml-auto text-[11px] ${pickerOpen ? "text-mata" : ""}`}>
                  {t.modelLabel} ▾
                </span>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
                  <path d="M12 2a3 3 0 0 1 3 3v6a3 3 0 0 1-6 0V5a3 3 0 0 1 3-3z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1M12 18v4" />
                </svg>
                <span
                  className={`flex h-7 w-7 items-center justify-center rounded-full text-paper transition-all duration-200 ${
                    sending ? "scale-110 bg-mata-deep" : "bg-mata group-hover:bg-mata-deep"
                  }`}
                >
                  ↑
                </span>
              </span>
            </button>
          </div>
        </div>

        {/* preview side panel — like the product: opens beside the chat */}
        {previewOpen && (
          <aside className="hidden border-l border-line bg-paper p-3 sm:block">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
              {t.previewLabel}
            </p>
            {trattoria}
          </aside>
        )}
      </div>
    </div>
  );
}
