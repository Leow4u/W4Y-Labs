"use client";

import { useEffect, useState } from "react";

// Faz polling do estado do provisionamento. Quando 'ready', entra no Wayne
// (via /login/enter, que faz o SSO e grava o cookie de rota do tenant).
export default function OnboardingClient() {
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let vivo = true;
    const inicio = Date.now();
    const timer = setInterval(async () => {
      try {
        const r = await fetch("/onboarding/status", { cache: "no-store" });
        const d = await r.json();
        if (!vivo) return;
        if (d.status === "ready") {
          clearInterval(timer);
          window.location.href = "/login/enter";
        } else if (d.status === "failed" || Date.now() - inicio > 5 * 60 * 1000) {
          clearInterval(timer);
          setErro(true);
        }
      } catch {
        /* transitório — segue tentando */
      }
    }, 3000);
    return () => { vivo = false; clearInterval(timer); };
  }, []);

  if (erro) {
    return (
      <p className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
        Algo demorou mais que o esperado. Recarregue a página em instantes — se persistir, fale com a gente
        em <strong>contato@work4you.ai</strong>.
      </p>
    );
  }
  return <p className="text-xs text-neutral-400">Isto atualiza sozinho — não feche a janela.</p>;
}
