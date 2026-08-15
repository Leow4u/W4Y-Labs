"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OnboardingPhase = "provisioning" | "ready" | "failed" | "timeout";

const TIMEOUT_MS = 8 * 60 * 1000;
const BASE_POLL_MS = 2500;
const MAX_POLL_MS = 8000;

const STEPS = [
  { atMs: 0, label: "Criando sua conta na nuvem" },
  { atMs: 25_000, label: "Instalando ferramentas do agente" },
  { atMs: 70_000, label: "Finalizando configuração" },
  { atMs: 120_000, label: "Quase pronto — só mais um instante" },
] as const;

function pollDelay(attempt: number): number {
  return Math.min(BASE_POLL_MS + attempt * 400, MAX_POLL_MS);
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${s}s`;
}

function activeStep(elapsed: number): (typeof STEPS)[number] {
  for (let i = STEPS.length - 1; i >= 0; i--) {
    if (elapsed >= STEPS[i]!.atMs) return STEPS[i]!;
  }
  return STEPS[0]!;
}

// Polling do provisionamento com backoff e retry manual.
export default function OnboardingClient({ readyHref = "/login/enter" }: { readyHref?: string }) {
  const [phase, setPhase] = useState<OnboardingPhase>("provisioning");
  const [elapsed, setElapsed] = useState(0);
  const [retrying, setRetrying] = useState(false);
  const [notes, setNotes] = useState("");
  const startRef = useRef(Date.now());
  const attemptRef = useRef(0);

  const poll = useCallback(async (): Promise<OnboardingPhase | "continue"> => {
    const r = await fetch("/onboarding/status", { cache: "no-store" });
    const d = (await r.json()) as { status?: string; notes?: string };
    if (d.notes) setNotes(d.notes);
    if (d.status === "ready") return "ready";
    if (d.status === "failed") return "failed";
    if (Date.now() - startRef.current > TIMEOUT_MS) return "timeout";
    return "continue";
  }, []);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout>;

    const tick = async () => {
      try {
        const next = await poll();
        if (!vivo) return;
        if (next === "ready") {
          setPhase("ready");
          window.location.href = readyHref;
          return;
        }
        if (next === "failed") {
          setPhase("failed");
          return;
        }
        if (next === "timeout") {
          setPhase("timeout");
          return;
        }
        attemptRef.current += 1;
        timer = setTimeout(() => void tick(), pollDelay(attemptRef.current));
      } catch {
        if (!vivo) return;
        attemptRef.current += 1;
        timer = setTimeout(() => void tick(), pollDelay(attemptRef.current));
      }
    };

    void tick();
    const clock = setInterval(() => {
      if (vivo) setElapsed(Date.now() - startRef.current);
    }, 1000);

    return () => {
      vivo = false;
      clearTimeout(timer);
      clearInterval(clock);
    };
  }, [poll, readyHref]);

  const retry = () => {
    setRetrying(true);
    void fetch("/onboarding/retry", { method: "POST" })
      .then(async (r) => {
        if (!r.ok) throw new Error("retry_failed");
        startRef.current = Date.now();
        attemptRef.current = 0;
        setPhase("provisioning");
        setNotes("");
      })
      .catch(() => setPhase("timeout"))
      .finally(() => setRetrying(false));
  };

  if (phase === "failed" || phase === "timeout") {
    return (
      <div className="flex w-full flex-col gap-3 text-left">
        <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {phase === "timeout"
            ? "Demorou mais que o esperado. Sua conta pode ainda estar sendo criada — tente entrar de novo em instantes."
            : "Não conseguimos concluir a criação da sua conta."}
          {notes ? ` (${notes})` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={retrying}
            onClick={() => void retry()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {retrying ? "Tentando de novo…" : "Tentar de novo"}
          </button>
          <a
            href={readyHref}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-600"
          >
            Tentar entrar mesmo assim
          </a>
        </div>
        <p className="text-xs text-neutral-400">
          Se persistir, escreva para <strong>contato@work4you.ai</strong>.
        </p>
      </div>
    );
  }

  const step = activeStep(elapsed);

  return (
    <div className="flex w-full flex-col gap-4 text-left">
      <ol className="space-y-2 text-sm">
        {STEPS.map((s) => {
          const done = elapsed > s.atMs + 15_000 && s !== step;
          const current = s === step;
          return (
            <li
              key={s.label}
              className={`flex items-center gap-2 ${
                current ? "font-medium text-neutral-900 dark:text-neutral-100" : "text-neutral-400"
              }`}
            >
              <span
                className={`inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                  done
                    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
                    : current
                      ? "border-2 border-neutral-900 dark:border-white"
                      : "border border-neutral-300 dark:border-neutral-600"
                }`}
                aria-hidden
              >
                {done ? "✓" : current ? "•" : ""}
              </span>
              {s.label}
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-neutral-400">
        {phase === "ready"
          ? "Conta pronta — abrindo o Work4You…"
          : `${step.label} (${formatElapsed(elapsed)})`}
      </p>
      <p className="text-xs text-neutral-400">
        Na primeira vez leva de 1 a 3 minutos. Depois, o acesso é imediato.
      </p>
    </div>
  );
}
