"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type OnboardingPhase = "provisioning" | "ready" | "failed" | "timeout";

const TIMEOUT_MS = 8 * 60 * 1000;
const BASE_POLL_MS = 3000;
const MAX_POLL_MS = 15000;

function pollDelay(attempt: number): number {
  return Math.min(BASE_POLL_MS + attempt * 500, MAX_POLL_MS);
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return m > 0 ? `${m}:${String(r).padStart(2, "0")}` : `${s}s`;
}

// Polling do provisionamento com backoff e retry manual.
export default function OnboardingClient() {
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
          window.location.href = "/login/enter";
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
  }, [poll]);

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
            ? "Demorou mais que o esperado — a instância pode ainda estar a subir."
            : "Não foi possível concluir o provisionamento."}
          {notes ? ` (${notes})` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={retrying}
            onClick={() => void retry()}
            className="rounded-md bg-neutral-900 px-4 py-2 text-sm text-white disabled:opacity-50 dark:bg-white dark:text-neutral-900"
          >
            {retrying ? "A tentar de novo…" : "Tentar de novo"}
          </button>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md border border-neutral-300 px-4 py-2 text-sm dark:border-neutral-600"
          >
            Recarregar
          </button>
        </div>
        <p className="text-xs text-neutral-400">
          Se persistir, escreva para <strong>contato@work4you.ai</strong>.
        </p>
      </div>
    );
  }

  return (
    <p className="text-xs text-neutral-400">
      A preparar a sua instância ({formatElapsed(elapsed)}) — não feche a janela.
    </p>
  );
}
