"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The landing's protagonist: a live product window cycling through real
// scenarios with the REAL mechanics — every prompt is typed in the composer
// and sent; multi-turn scenes supported (agent asks, user replies). Chat area
// has fixed height like a real session (older content scrolls out the top).
// Interaction routes to /login.

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

const SCENARIOS: Scenario[] = [
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
          { kind: "line", text: "Agenda · rotina criada" },
          { kind: "reply", text: "Rotina no ar — toda sexta, às 17h:" },
          { kind: "routine" },
        ],
      },
    ],
    hold: 4200,
  },
];

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

export default function HeroDemo() {
  const router = useRouter();
  const [si, setSi] = useState(0);
  const [ti, setTi] = useState(0);
  const [typed, setTyped] = useState(0);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [revealed, setRevealed] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setSi(1);
      setTi(0);
      setSent(true);
      setRevealed(SCENARIOS[1].turns[0].items.length);
      return;
    }
    let cancelled = false;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(() => { if (!cancelled) fn(); }, ms));
    };

    const play = (index: number) => {
      const sc = SCENARIOS[index];
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
      at(T + sc.hold, () => play((index + 1) % SCENARIOS.length));
    };
    play(0);
    return () => { cancelled = true; timers.forEach(window.clearTimeout); };
  }, []);

  const sc = SCENARIOS[si];
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
          Cucina italiana
        </p>
        <p className="mt-1.5 text-[20px] font-extrabold tracking-tight text-[#38281a]">
          Trattoria Bella
        </p>
        <p className="text-[11px] text-[#8a7663]">Massas frescas, todos os dias</p>
        <span className="mt-2.5 inline-block rounded-full bg-[#b4552d] px-3.5 py-1.5 text-[10px] font-semibold text-white">
          Reservar mesa
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
            <p className="truncate text-sm font-semibold text-ink">proposta-junho.pdf</p>
            <p className="text-[12px] text-ink-soft">Salvo em Entregas — pronto pra revisar</p>
          </div>
          <span className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-mata">
            feito ✓
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
            <p className="text-[12px] text-ink-soft">Autorização segura</p>
          </div>
          {connected ? (
            <span className="ml-auto shrink-0 rounded-lg border border-salvia/60 bg-salvia-soft px-3.5 py-1.5 text-[12px] font-semibold text-mata">
              ✓ Conectado
            </span>
          ) : (
            <span className="ml-auto shrink-0 rounded-lg bg-ink px-3.5 py-1.5 text-[12px] font-semibold text-paper">
              Autorizar
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
            Legenda
          </p>
          <p className="mt-1.5 text-[13px] leading-relaxed text-ink-soft">
            Enquanto você lê isso, o meu agente tá respondendo clientes e
            fechando a semana. Monte o seu em minutos — e deixa ligado 24/7.{" "}
            <span className="text-mata">#IA #produtividade #automação</span>
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
                <p className="text-[13px] font-semibold text-white">O meu agente</p>
                <p className="mx-auto mt-1 w-fit bg-red-600 px-2.5 py-0.5 text-[22px] font-extrabold uppercase leading-tight tracking-tight text-white">
                  Trabalha
                </p>
                <p className="mt-1 text-[13px] font-semibold text-white">enquanto eu durmo</p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 bg-white px-3 py-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/brand/apps/instagram.svg" alt="" width={13} height={13} className="h-3.5 w-3.5" />
            <span className="text-[11px] font-medium text-ink-soft">@suaempresa</span>
            <span className="ml-auto font-mono text-[10px] text-ink-faint">agora</span>
          </div>
        </div>
      );
    }
    if (it.kind === "published") {
      return (
        <p key={key} className="px-1 text-[13px] font-medium text-mata">
          ✓ Post publicado com sucesso — agora é só aguardar os bons resultados.
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
          work4you.ai — seu agente
        </span>
        <span className="hidden items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-salvia sm:flex">
          <span className="w4y-live-dot h-1.5 w-1.5 rounded-full bg-salvia" />
          no ar
        </span>
      </div>

      <div className={`grid ${previewOpen ? "sm:grid-cols-[190px_1fr_310px]" : "sm:grid-cols-[190px_1fr]"}`}>
        {/* sidebar — the product's real navigation */}
        <aside className="hidden border-r border-line bg-paper px-4 py-5 sm:block">
          <div className="space-y-2.5 text-[13px]">
            <p className="font-semibold text-ink">Nova sessão</p>
            {["Agent Studio", "Agenda", "Habilidades", "Canais", "Entregas"].map((m) => (
              <p key={m} className="text-ink-soft">{m}</p>
            ))}
          </div>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            Sessões
          </p>
          <div className="mt-2.5 space-y-2 text-[12px] text-ink-soft">
            <p className="-mx-2 truncate rounded-md bg-paper-deep px-2 py-1 text-ink">
              Post pro Instagram
            </p>
            <p className="truncate">Proposta de junho</p>
            <p className="truncate">Cobranças da semana</p>
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
                  No que vamos trabalhar?
                </p>
                <p className="mt-2 max-w-xs text-[13px] leading-relaxed text-ink-faint">
                  Descreva o objetivo — eu cuido da parte mecânica.
                </p>
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
                  Buscar modelos
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
                  Adicionar modelos
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
                Escolha uma pasta
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
                  <span className="text-ink-faint">Descreva o que precisa</span>
                )}
              </span>
              <span className="flex items-center gap-3 px-4 pb-3 text-ink-faint">
                <span className="text-base leading-none">+</span>
                <span className="text-[12px]">Pedir aprovação ▾</span>
                <span className="flex items-center gap-1 text-[12px]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src="/brand/apps/gmail.svg" alt="" width={12} height={12} className="h-3 w-3" />
                  +14
                </span>
                <span className={`ml-auto rounded-md px-1.5 py-0.5 text-[12px] ${pickerOpen ? "bg-salvia-soft text-mata" : ""}`}>
                  Auto ▾
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
              Preview
            </p>
            {trattoria}
          </aside>
        )}
      </div>
    </div>
  );
}
