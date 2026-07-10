/**
 * ChatModelBar — o seletor de modelo (tier Flash/Auto/Expert/Crew) numa barra
 * fina ABAIXO do terminal, junto ao composer, no mesmo lugar do benchmark do
 * Claude. Antes vivia na barra lateral (ChatSidebar); aqui é AUTO-CONTIDO: lê o
 * próprio model-info (o TierPicker ainda lê a config sozinho no mount, então
 * `currentModel` é só um gatilho) e mostra o aviso de "aplicar no /new" inline.
 * Curadoria do Chat — Etapa B.
 */

import { useEffect, useState } from "react";

import { TierPicker } from "@/components/TierPicker";
import { api } from "@/lib/api";
import { TIER_PRESETS, type TierKey } from "@/lib/tier-presets";
import { cn } from "@/lib/utils";

export function ChatModelBar({ light }: { light: boolean }) {
  const [model, setModel] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api
      .getModelInfo()
      .then((r) => {
        if (!cancelled && r?.model) setModel(String(r.model));
      })
      .catch(() => {
        /* best-effort: o TierPicker lê a config sozinho no mount */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Pill de modelo (estilo Grok) — o TierPicker já é a pill + dropdown. O aviso
  // de "aplica na próxima tarefa" some após alguns segundos p/ não poluir.
  useEffect(() => {
    if (!notice) return;
    const id = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(id);
  }, [notice]);

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      {notice && (
        <span
          className={cn(
            "hidden max-w-[220px] truncate text-[11px] sm:block",
            light ? "text-neutral-400" : "text-white/50",
          )}
        >
          {notice}
        </span>
      )}
      <TierPicker
        currentModel={model}
        onChanged={(tier: TierKey) =>
          setNotice(`${TIER_PRESETS[tier].label} — aplica na próxima tarefa`)
        }
      />
    </div>
  );
}
