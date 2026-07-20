/**
 * TierPicker — picker for the "Work4You models" (Flash / Auto / Expert / Crew)
 * in the Chat bar. Hides the LLMs behind 4 tiers; each one is a preset of
 * (model × effort × multi-agent) — see lib/tier-presets.ts.
 *
 * Applying a tier does TWO writes: the model through the canonical path
 * (`/api/model/set`, the same one ModelPickerDialog uses) and reasoning +
 * delegation through the config read-modify-write (the same pattern as
 * ReasoningPicker). As in those, the change reaches the session on the next /new
 * or reload — the bar shows the notice via onChanged.
 *
 * Plan gating (Expert=Pro, Crew=Business) lands in the plans phase; for now
 * all tiers stay available.
 */

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import {
  DEFAULT_TIER,
  TIER_ORDER,
  TIER_PRESETS,
  type TierKey,
  tierFromConfig,
  tierLabel,
  tierSubtitle,
} from "@/lib/tier-presets";

interface TierPickerProps {
  /** Current model (triggers a re-read when it changes from the outside). */
  currentModel: string;
  /** Incremented after saving model/config, to re-read in sync. */
  refreshKey?: number;
  /** Tells the bar to show the "applies on /new or reload" notice. */
  onChanged?: (tier: TierKey) => void;
}

// Sentinel value for "raw model outside the presets" (user picked it in the
// advanced picker). Shown as an informational option, not selectable back.
const CUSTOM = "__custom__";

// Plan gating: Expert requires Pro+, Crew requires Max. plan null (unknown/
// loading) → does NOT lock (fail-open; real ceiling is the capped OpenRouter key).
function tierLocked(plan: string | null, k: TierKey): boolean {
  if (!plan) return false;
  if (k === "expert") return plan !== "pro" && plan !== "max";
  if (k === "crew") return plan !== "max";
  return false;
}

export function TierPicker({
  currentModel,
  refreshKey = 0,
  onChanged,
}: TierPickerProps) {
  const { t } = useI18n();
  const [tier, setTier] = useState<string>(DEFAULT_TIER);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useMenuDismiss(open, () => setOpen(false), "tier");
  const lastFetchKeyRef = useRef("");

  // Tenant plan, read LIVE from the shell (same work4you.ai origin — the session
  // cookie rides along; the LB routes /planos* to the shell). Feeds the gating.
  useEffect(() => {
    let cancelled = false;
    fetch("/planos/plan", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.plan) setPlan(String(d.plan));
      })
      .catch(() => {
        /* shell unavailable → plan stays null → fail-open (no lock) */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const fetchKey = `${currentModel}:${refreshKey}`;
    if (fetchKey === lastFetchKeyRef.current) return;
    lastFetchKeyRef.current = fetchKey;
    void api
      .getConfig()
      .then((cfg) => {
        const base = (cfg ?? {}) as Record<string, unknown>;
        const model = typeof base.model === "string" ? base.model : currentModel;
        const agent =
          (base.agent as Record<string, unknown> | undefined) ?? {};
        const reasoning =
          typeof agent.reasoning_effort === "string"
            ? agent.reasoning_effort
            : "medium";
        setTier(tierFromConfig(model, reasoning) ?? CUSTOM);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [currentModel, refreshKey]);

  const onSelect = useCallback(
    (next: string) => {
      if (next === CUSTOM || next === tier) return;
      // Tier locked by the plan → send to upgrade instead of applying.
      if (tierLocked(plan, next as TierKey)) {
        window.location.href = `/planos?plan=${next === "crew" ? "max" : "pro"}`;
        return;
      }
      const preset = TIER_PRESETS[next as TierKey];
      if (!preset) return;
      const prev = tier;
      setTier(next); // optimistic
      setSaving(true);
      // 1) model through the canonical path; 2) reasoning + delegation via config.
      void api
        .setModelAssignment({
          confirm_expensive_model: true,
          scope: "main",
          provider: "openrouter",
          model: preset.model,
        })
        .then(() => api.getConfig())
        .then((cfg) => {
          const base = (cfg ?? {}) as Record<string, unknown>;
          const agent =
            base.agent && typeof base.agent === "object"
              ? { ...(base.agent as Record<string, unknown>) }
              : {};
          agent.reasoning_effort = preset.reasoning;
          const delegation =
            base.delegation && typeof base.delegation === "object"
              ? { ...(base.delegation as Record<string, unknown>) }
              : {};
          delegation.model = preset.delegationModel;
          delegation.reasoning_effort = preset.delegationReasoning;
          if (preset.maxConcurrentChildren) {
            delegation.max_concurrent_children = preset.maxConcurrentChildren;
          }
          return api.saveConfig({ ...base, agent, delegation });
        })
        .then(() => onChanged?.(next as TierKey))
        .catch(() => setTier(prev)) // revert on failure
        .finally(() => setSaving(false));
    },
    [tier, onChanged, plan],
  );

  const currentLabel =
    tier === CUSTOM
      ? "Personalizado"
      : TIER_PRESETS[tier as TierKey]
        ? tierLabel(t, tier as TierKey)
        : "Modelo";

  // Clean pill (mode name only) + Grok-style dropdown (bold name + description
  // + check), opening UPWARDS in its own layer (fixed via anchor is not needed:
  // the composer does not clip the dropdown upwards). No "modelo"/bolt.
  return (
    <div className="relative">
      <button
        type="button"
        disabled={!loaded || saving}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
      >
        {currentLabel}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="listbox"
            data-menu-root="tier"
            className="absolute bottom-full right-0 z-50 mb-2 w-64 rounded-2xl border border-border bg-card p-1.5 shadow-xl"
          >
            {TIER_ORDER.map((k) => {
              const locked = tierLocked(plan, k);
              const active = k === tier;
              return (
                <button
                  key={k}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onSelect(k);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="flex w-4 shrink-0 justify-center">
                    {active && <Check className="h-4 w-4 text-foreground" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {tierLabel(t, k)}
                      {k === "gratis" && (
                        <span className="rounded-full bg-live/10 px-1.5 py-px text-xs font-medium text-live">
                          {t.tiers.gratisBadge}
                        </span>
                      )}
                      {locked && <span className="text-xs">🔒</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {tierSubtitle(t, k)}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
