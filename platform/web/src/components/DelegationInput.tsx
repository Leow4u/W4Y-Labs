"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

// Hook de marca da landing: o gesto de "delegar". A landing vai só até o
// login — ao enviar, leva o usuário para /login (que entra na experiência
// existente do app). Sem executar LLM, sem preservar prompt, sem UX pós-login.
const SUGGESTIONS = [
  "Criar um agente de vendas",
  "Automatizar atendimento",
  "Analisar documentos",
  "Criar rotina recorrente",
  "Conectar minhas ferramentas",
];

export default function DelegationInput({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  function start() {
    router.push("/login");
  }

  return (
    <div className={compact ? "mx-auto w-full max-w-xl" : "mx-auto w-full max-w-2xl"}>
      <div className="rounded-2xl border border-neutral-200 bg-white p-2 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)]">
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
          placeholder="Descreva a tarefa como você explicaria a um funcionário…"
          className="w-full resize-none rounded-xl border-0 bg-transparent px-4 py-3 text-[15px] text-neutral-900 outline-none placeholder:text-neutral-400"
        />
        <div className="flex items-center justify-end px-2 pb-1">
          <button
            onClick={start}
            className="font-brand rounded-full bg-neutral-900 px-6 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-85"
          >
            Começar →
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
              className="rounded-full border border-neutral-200 bg-white px-4 py-2 text-[13px] text-neutral-600 transition-colors hover:border-neutral-400 hover:text-neutral-900"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
