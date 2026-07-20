/**
 * ModelCatalogPicker — the provider-grouped model selector (mockup v3, Stack AI
 * reference): main market providers first (OpenAI, Anthropic, Google, xAI),
 * the whole homologated OpenRouter catalog behind the search. Replaces the raw
 * datalist everywhere an agent's model is picked. Pure UI over the native
 * catalog (GET /api/model/options → openrouter provider models).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { cn } from "@/lib/utils";
import { TIER_PRESETS } from "@/lib/tier-presets";

const MENU_KEY = "model-catalog";

/** Provider families shown as top sections, in market order. */
const TOP_PROVIDERS: { prefix: string; label: string; mono: string; cls: string }[] = [
  { prefix: "openai", label: "OpenAI", mono: "◯", cls: "bg-[#101010]" },
  { prefix: "anthropic", label: "Anthropic", mono: "A", cls: "bg-[#C5714F]" },
  { prefix: "google", label: "Google", mono: "G", cls: "bg-[#4285F4]" },
  { prefix: "x-ai", label: "xAI", mono: "𝕏", cls: "bg-[#1A1A1A]" },
];

const EXTRA_MONO: Record<string, { mono: string; cls: string }> = {
  "meta-llama": { mono: "M", cls: "bg-[#0866FF]" },
  deepseek: { mono: "D", cls: "bg-[#4D6BFE]" },
  mistralai: { mono: "M", cls: "bg-[#FA5C0A]" },
  qwen: { mono: "Q", cls: "bg-[#5B4FE8]" },
  nvidia: { mono: "N", cls: "bg-[#76B900]" },
};

export function providerBadge(model: string): { mono: string; cls: string } {
  const prefix = model.includes("/") ? model.split("/")[0] : model;
  const top = TOP_PROVIDERS.find((p) => p.prefix === prefix);
  if (top) return { mono: top.mono, cls: top.cls };
  const extra = EXTRA_MONO[prefix];
  if (extra) return extra;
  return { mono: (prefix[0] || "?").toUpperCase(), cls: "bg-[#8d877a]" };
}

/** Human name: the part after the provider prefix, dashes kept readable. */
export function modelShortName(model: string): string {
  const raw = model.includes("/") ? model.split("/").slice(1).join("/") : model;
  return raw;
}

/** COMMERCIAL model name — the product never shows a technical slug.
 *  "google/gemini-3.5-flash" → "Gemini 3.5 Flash",
 *  "anthropic/claude-sonnet-5" → "Claude Sonnet 5", "openai/gpt-5.2" → "GPT 5.2". */
const NAME_FIXES: Record<string, string> = {
  gpt: "GPT", ai: "AI", xl: "XL", llm: "LLM", moe: "MoE", vl: "VL",
  deepseek: "DeepSeek", qwq: "QwQ", glm: "GLM",
};
export function modelCommercialName(model: string): string {
  const short = modelShortName(model).replace(/:free$/i, "").replace(/:.*$/, "");
  return short
    .split("-")
    .filter(Boolean)
    .map((tok) => {
      const fix = NAME_FIXES[tok.toLowerCase()];
      if (fix) return fix;
      // Version-ish tokens (5.2, 4o, r1, 550b) keep their casing shape.
      if (/^\d/.test(tok)) return tok;
      return tok.charAt(0).toUpperCase() + tok.slice(1);
    })
    .join(" ");
}

/** Models our tiers already vouch for — surfaced as "recomendado". */
const RECOMMENDED = new Set(
  Object.values(TIER_PRESETS)
    .map((p) => p.model)
    .filter(Boolean),
);

export function ModelCatalogPicker({
  value,
  onSelect,
  disabled,
  className,
  recommendedModel,
}: {
  /** Current model slug (e.g. "google/gemini-3.5-flash"). */
  value: string;
  onSelect: (model: string) => void;
  disabled?: boolean;
  className?: string;
  /** The model OUR technology picked for THIS need (e.g. the quickstart
   *  draft's choice) — surfaces as the single "Recomendado" section on top
   *  and as a chip on the field while it is the selected one. */
  recommendedModel?: string | null;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [models, setModels] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useMenuDismiss(open, () => setOpen(false), MENU_KEY);

  useEffect(() => {
    let cancelled = false;
    api
      .getModelOptions()
      .then((res) => {
        if (cancelled) return;
        const or = (res.providers ?? []).find((p) => p.slug === "openrouter");
        setModels(or?.models ?? []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (open) {
      setQuery("");
      // Focus after the popover paints.
      setTimeout(() => inputRef.current?.focus(), 30);
    }
  }, [open]);

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const match = (m: string) => !q || m.toLowerCase().includes(q);
    const sections: { label: string; prefix: string; items: string[] }[] = [];
    const used = new Set<string>();
    for (const p of TOP_PROVIDERS) {
      const items = models.filter(
        (m) => m.startsWith(p.prefix + "/") && match(m),
      );
      items.forEach((m) => used.add(m));
      // Without a search, keep top sections tight (latest-ish first is the
      // catalog's own order); the search reaches everything.
      sections.push({ label: p.label, prefix: p.prefix, items: q ? items : items.slice(0, 8) });
    }
    const others = models.filter((m) => !used.has(m) && match(m));
    return { sections: sections.filter((s) => s.items.length > 0), others };
  }, [models, query]);

  const badge = providerBadge(value || "");

  return (
    <div className={cn("relative", className)}>
      <button
        type="button"
        data-menu-trigger={MENU_KEY}
        aria-haspopup="listbox"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-2 text-left",
          "text-sm text-foreground transition-colors hover:border-foreground/25 disabled:opacity-50",
        )}
      >
        <span
          className={cn(
            "grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-extrabold text-white",
            badge.cls,
          )}
        >
          {badge.mono}
        </span>
        <span className="min-w-0 flex-1 truncate font-medium">
          {value ? modelCommercialName(value) : t.agents.modelPickerEmpty}
        </span>
        {recommendedModel && value === recommendedModel && (
          <span className="shrink-0 rounded-full bg-live/10 px-1.5 py-px text-[9px] font-semibold text-live">
            ✦ {t.agents.modelPickerRecommended}
          </span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
      </button>

      {open && (
        <div
          data-menu-root={MENU_KEY}
          role="listbox"
          className="absolute left-0 top-full z-[80] mt-1 max-h-[420px] w-[300px] overflow-y-auto rounded-2xl border border-border bg-card pb-1 shadow-pop"
        >
          <div className="sticky top-0 z-10 bg-card p-2.5 pb-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-border bg-background px-2.5 py-1.5">
              <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground/60" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t.agents.modelPickerSearch}
                className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>

          {/* The ONE per-need recommendation on top — what our technology
              picked for this agent. Never repeated elsewhere in the list. */}
          {recommendedModel && !query && (
            <div>
              <div className="px-3.5 pb-0.5 pt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-live">
                ✦ {t.agents.modelPickerRecommended}
              </div>
              <ModelRow
                model={recommendedModel}
                selected={recommendedModel === value}
                recommended={false}
                recommendedLabel={t.agents.modelPickerRecommended}
                onPick={() => {
                  onSelect(recommendedModel);
                  setOpen(false);
                }}
              />
            </div>
          )}
          {grouped.sections.map((sec) => (
            <div key={sec.prefix}>
              <div className="px-3.5 pb-0.5 pt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">
                {sec.label}
              </div>
              {sec.items.map((m) => (
                <ModelRow
                  key={m}
                  model={m}
                  selected={m === value}
                  recommended={RECOMMENDED.has(m)}
                  recommendedLabel={t.agents.modelPickerRecommended}
                  onPick={() => {
                    onSelect(m);
                    setOpen(false);
                  }}
                />
              ))}
            </div>
          ))}

          {grouped.others.length > 0 && (
            <div>
              <div className="px-3.5 pb-0.5 pt-2 font-mono text-[9px] uppercase tracking-[0.1em] text-muted-foreground/70">
                {t.agents.modelPickerOthers}
              </div>
              {(query ? grouped.others : grouped.others.slice(0, 6)).map((m) => (
                <ModelRow
                  key={m}
                  model={m}
                  selected={m === value}
                  recommended={false}
                  recommendedLabel={t.agents.modelPickerRecommended}
                  onPick={() => {
                    onSelect(m);
                    setOpen(false);
                  }}
                />
              ))}
              {!query && grouped.others.length > 6 && (
                <div className="px-3.5 py-1.5 text-[11px] text-muted-foreground">
                  {t.agents.modelPickerMore.replace(
                    "{count}",
                    String(grouped.others.length - 6),
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-1 border-t border-border px-3.5 py-2 text-[11px] font-semibold text-live">
            {t.agents.modelPickerCatalog.replace("{count}", String(models.length))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelRow({
  model,
  selected,
  recommended,
  recommendedLabel,
  onPick,
}: {
  model: string;
  selected: boolean;
  recommended: boolean;
  recommendedLabel: string;
  onPick: () => void;
}) {
  const badge = providerBadge(model);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onPick}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-1.5 text-left text-xs transition-colors hover:bg-muted/60",
        selected && "bg-live/5",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-md text-[10px] font-extrabold text-white",
          badge.cls,
        )}
      >
        {badge.mono}
      </span>
      <span className="min-w-0 flex-1 truncate text-foreground">{modelCommercialName(model)}</span>
      {recommended && !selected && (
        <span className="shrink-0 rounded-full bg-live/10 px-1.5 py-px text-[9px] font-semibold text-live">
          {recommendedLabel}
        </span>
      )}
      {selected && <Check className="h-3.5 w-3.5 shrink-0 text-live" />}
    </button>
  );
}
