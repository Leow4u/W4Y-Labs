"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

// The landing's protagonist: a live product window that types the request,
// runs the steps and delivers — on loop. Interaction routes to /login
// (unchanged landing behavior: the site goes only as far as the login).

const REQUEST =
  "Monte a proposta com os números de junho e me devolva em PDF até as 15h.";

const STEPS = [
  { label: "Lendo a pasta", detail: "/Propostas/junho" },
  { label: "Cruzando a planilha", detail: "vendas-junho.xlsx" },
  { label: "Escrevendo o documento", detail: "proposta-junho.pdf" },
];

// Animation stages: 0 idle → 1 typing → 2..4 steps → 5 delivered → reset.
export default function HeroDemo() {
  const router = useRouter();
  const [typed, setTyped] = useState(0);
  const [stage, setStage] = useState(0);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setReduced(true);
      setTyped(REQUEST.length);
      setStage(5);
      return;
    }
    let cancelled = false;
    const timers: number[] = [];
    const at = (ms: number, fn: () => void) => {
      timers.push(window.setTimeout(() => { if (!cancelled) fn(); }, ms));
    };

    const run = () => {
      setTyped(0);
      setStage(1);
      for (let i = 1; i <= REQUEST.length; i++) at(400 + i * 24, () => setTyped(i));
      const doneTyping = 400 + REQUEST.length * 24;
      at(doneTyping + 500, () => setStage(2));
      at(doneTyping + 1500, () => setStage(3));
      at(doneTyping + 2500, () => setStage(4));
      at(doneTyping + 3600, () => setStage(5));
      at(doneTyping + 8200, run); // hold the delivery, then loop
    };
    run();
    return () => { cancelled = true; timers.forEach(window.clearTimeout); };
  }, []);

  const visibleSteps = Math.max(0, stage - 1);

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

      <div className="grid min-h-[380px] sm:grid-cols-[180px_1fr]">
        {/* mini sidebar — product depth without noise */}
        <aside className="hidden border-r border-line bg-paper px-4 py-5 sm:block">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            Agentes
          </p>
          <div className="mt-3 space-y-2.5">
            {[
              { name: "Principal", on: true },
              { name: "Vendas", on: true },
              { name: "Financeiro", on: true },
              { name: "Atendimento", on: false },
            ].map((a) => (
              <div key={a.name} className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${a.on ? "w4y-live-dot bg-salvia" : "bg-line"}`}
                />
                <span className={`text-[13px] ${a.on ? "text-ink" : "text-ink-faint"}`}>
                  {a.name}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-6 font-mono text-[10px] uppercase tracking-[0.16em] text-ink-faint">
            Rotinas
          </p>
          <div className="mt-3 space-y-2 text-[12px] text-ink-soft">
            <p>07h00 · resumo</p>
            <p>17h00 · cobranças</p>
          </div>
        </aside>

        {/* the conversation — fixed-height content zone so the window never
            collapses or jumps while the demo loops */}
        <div className="flex flex-col gap-4 px-5 py-6 sm:px-7">
          <div className="min-h-[280px] space-y-3.5">
            {/* user request, typed live */}
            <div className="flex justify-end">
              <p className="min-h-[2.6rem] min-w-[240px] max-w-[90%] rounded-2xl rounded-br-md bg-mata px-4 py-2.5 text-left text-[13.5px] leading-relaxed text-paper sm:text-sm">
                {REQUEST.slice(0, typed)}
                {!reduced && stage === 1 && (
                  <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-pulse bg-paper/80" />
                )}
              </p>
            </div>

            {/* execution steps appear one by one */}
            <div className="space-y-2">
              {STEPS.slice(0, visibleSteps).map((s, i) => {
                const running = !reduced && stage < 5 && i === visibleSteps - 1;
                return (
                  <div
                    key={s.label}
                    className="flex items-center gap-3 rounded-xl border border-line bg-paper px-4 py-2.5"
                  >
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${running ? "w4y-live-dot bg-salvia" : "bg-salvia"}`}
                    />
                    <span className="text-[13px] font-medium text-ink">{s.label}</span>
                    <span className="truncate font-mono text-[12px] text-ink-faint">
                      {s.detail}
                    </span>
                    {!running && (
                      <span className="ml-auto font-mono text-[11px] text-salvia">✓</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* delivery */}
            {stage >= 5 && (
              <div className="flex items-center gap-3 rounded-xl border border-salvia/50 bg-salvia-soft px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-mata font-mono text-[10px] font-semibold text-paper">
                  PDF
                </span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-ink">proposta-junho.pdf</p>
                  <p className="text-[12px] text-ink-soft">Entregue às 14h32 — pronto pra revisar</p>
                </div>
                <span className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.14em] text-mata">
                  feito ✓
                </span>
              </div>
            )}
          </div>

          {/* composer — the real gesture; clicking goes to login */}
          <button
            onClick={() => router.push("/login")}
            className="group flex w-full items-center gap-3 rounded-xl border border-line bg-white px-4 py-3 text-left transition-colors hover:border-salvia"
          >
            <span className="flex-1 text-[13.5px] text-ink-faint">
              Descreva a tarefa como você explicaria a um funcionário…
            </span>
            <span className="rounded-full bg-mata px-4 py-1.5 text-[13px] font-semibold text-paper transition-colors group-hover:bg-mata-deep">
              Enviar →
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
