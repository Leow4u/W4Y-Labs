/**
 * ChatModelBar — the model picker (Flash/Auto/Expert/Crew tier) in a thin bar
 * BELOW the terminal, next to the composer, in the same spot as the Claude
 * benchmark. It used to live in the sidebar (ChatSidebar); here it is SELF-
 * CONTAINED: it reads its own model-info (the TierPicker still reads the config
 * by itself on mount, so `currentModel` is just a trigger) and shows the
 * "apply on /new" notice inline. Chat curation — Etapa B.
 */

import { useEffect, useState } from "react";

import { TierPicker } from "@/components/TierPicker";
import { useI18n } from "@/i18n";
import { api } from "@/lib/api";
import { tierLabel, type TierKey } from "@/lib/tier-presets";
import { cn } from "@/lib/utils";

export function ChatModelBar({ light }: { light: boolean }) {
  const { t } = useI18n();
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
        /* best-effort: the TierPicker reads the config by itself on mount */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Model pill (Grok style) — the TierPicker is already the pill + dropdown. The
  // "aplica na próxima tarefa" notice fades after a few seconds to avoid clutter.
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
          setNotice(`${tierLabel(t, tier)} — aplica na próxima tarefa`)
        }
      />
    </div>
  );
}
