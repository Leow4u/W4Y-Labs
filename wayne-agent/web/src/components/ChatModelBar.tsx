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

  return (
    // O Select do nous-ui abre o listbox SEMPRE p/ baixo (absolute, sem
    // colisão). Como esta barra fica no rodapé, viramos o listbox p/ CIMA via
    // variantes arbitrárias — senão Expert/Crew ficam cortados fora da tela.
    <div className="flex shrink-0 items-center gap-2 px-1 [&_[role=listbox]]:bottom-full [&_[role=listbox]]:top-auto [&_[role=listbox]]:mt-0 [&_[role=listbox]]:mb-1">
      {notice && (
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-xs",
            light ? "text-neutral-500" : "text-white/60",
          )}
        >
          {notice}
        </span>
      )}

      <div className={cn("shrink-0", notice ? "" : "ml-auto")}>
        <TierPicker
          currentModel={model}
          onChanged={(tier: TierKey) =>
            setNotice(
              `Modelo → ${TIER_PRESETS[tier].label}. Rode /new ou recarregue para aplicar.`,
            )
          }
        />
      </div>
    </div>
  );
}
