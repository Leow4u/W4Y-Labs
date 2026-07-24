"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

// The landing's brand gesture: delegating work. The landing goes only as far
// as the login — submitting routes the user to /login (unchanged behavior).
// No LLM runs here and the prompt is not preserved past the gesture.
const SUGGESTIONS = [
  "Criar um agente de vendas",
  "Automatizar meu atendimento",
  "Analisar contratos e apontar riscos",
  "Relatório pronto toda manhã às 7h",
  "Conectar minhas ferramentas",
];

// Phrases the placeholder "types" on its own — the product working before
// your eyes. Static fallback under prefers-reduced-motion.
const DEMO_TASKS = [
  "Monte a proposta com os números de junho e me devolva em PDF…",
  "Toda manhã às 7h, resuma meus e-mails e o que vence hoje…",
  "Leia os contratos da pasta e aponte os riscos…",
  "Qualifique os leads da planilha e escreva os follow-ups…",
];
const STATIC_PLACEHOLDER =
  "Descreva a tarefa como você explicaria a um funcionário…";

function useTypewriterPlaceholder(enabled: boolean) {
  const [text, setText] = useState("");

  useEffect(() => {
    if (!enabled) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setText(STATIC_PLACEHOLDER);
      return;
    }
    let phrase = 0;
    let pos = 0;
    let deleting = false;
    let timer: number;

    const tick = () => {
      const full = DEMO_TASKS[phrase];
      if (!deleting) {
        pos += 1;
        setText(full.slice(0, pos));
        if (pos === full.length) {
          deleting = true;
          timer = window.setTimeout(tick, 2200); // hold the finished phrase
          return;
        }
        timer = window.setTimeout(tick, 34);
      } else {
        pos -= 4;
        if (pos <= 0) {
          pos = 0;
          deleting = false;
          phrase = (phrase + 1) % DEMO_TASKS.length;
          timer = window.setTimeout(tick, 500);
        } else {
          timer = window.setTimeout(tick, 14);
        }
        setText(full.slice(0, Math.max(pos, 0)));
      }
    };
    timer = window.setTimeout(tick, 700);
    return () => window.clearTimeout(timer);
  }, [enabled]);

  return enabled ? text : STATIC_PLACEHOLDER;
}

export default function DelegationInput({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const placeholder = useTypewriterPlaceholder(!compact);

  function start() {
    router.push("/login");
  }

  return (
    <div className={compact ? "mx-auto w-full max-w-xl" : "mx-auto w-full max-w-2xl"}>
      <div className="rounded-2xl border border-line bg-white p-2 shadow-[0_18px_60px_-24px_rgba(63,82,51,0.35)]">
        <textarea
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              start();
            }
          }}
          rows={compact ? 2 : 3}
          placeholder={compact ? STATIC_PLACEHOLDER : placeholder}
          className="w-full resize-none rounded-xl border-0 bg-transparent px-4 py-3 text-[15px] text-ink outline-none placeholder:text-ink-faint"
        />
        <div className="flex items-center justify-between px-2 pb-1">
          <span className="hidden select-none items-center gap-1.5 pl-2 font-mono text-[11px] uppercase tracking-[0.14em] text-ink-faint sm:flex">
            <span className="w4y-live-dot inline-block h-1.5 w-1.5 rounded-full bg-salvia" />
            pronto pra trabalhar
          </span>
          <button
            onClick={start}
            className="rounded-full bg-mata px-6 py-2.5 text-sm font-semibold text-paper transition-colors hover:bg-mata-deep"
          >
            {compact ? "Começar agora →" : "Construir meu agente →"}
          </button>
        </div>
      </div>

      {!compact && (
        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => {
                setText(s);
                inputRef.current?.focus();
              }}
              className="rounded-full border border-line bg-salvia-soft px-4 py-2 text-[13px] text-ink-soft transition-colors hover:border-salvia hover:text-ink"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
