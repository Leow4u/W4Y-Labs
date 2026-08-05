/**
 * RelayPicker — the composer's model-mode pill (Fase 10 · Onda B / B1).
 * Replaces the old 5-tier TierPicker with exactly TWO product modes:
 *
 *   Relay → `auto` preset (router; fast + economical; every plan)
 *   MAX   → `expert` preset (premium reasoning; Pro+)
 *
 * Applying a mode does TWO writes: the model via the canonical path
 * (`/api/model/set`, same as ModelPickerDialog) and reasoning + delegation via
 * the config read-modify-write (same pattern as ReasoningPicker). The change
 * reaches the session on the next /new or reload — the bar shows the notice via
 * onChanged. Crew is NOT a mode here — it is a capability in Agentes.
 */

import { Check, ChevronDown, Lock } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { inventory } from "@/lib/inventoryApi";
import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { fetchPlan, isGratisPlan, openUpgrade, planUnlocksMax } from "@/lib/plans";
import { RELAY_25_FAST_LABEL } from "@/lib/relay-free-model";
import {
  UI_MODE_LABEL,
  UI_MODE_ORDER,
  uiModeFromConfig,
  uiModePresetForPlan,
  type UiMode,
} from "@/lib/tier-presets";

interface RelayPickerProps {
  /** Current model (triggers a re-read when it changes from the outside). */
  currentModel: string;
  /** Incremented after saving model/config, to re-read in sync. */
  refreshKey?: number;
  /** Tells the bar to show the "applies on /new or reload" notice. */
  onChanged?: (mode: UiMode) => void;
}

// Plan gating: MAX requires Pro+ (maps to the `expert` preset). plan null
// (unknown/loading) → does NOT lock (fail-open; the real ceiling is the capped
// OpenRouter key). Plan vocabulary lives in lib/plans (single source of truth).
function modeLocked(plan: string | null, mode: UiMode): boolean {
  if (!plan) return false;
  return mode === "max" && !planUnlocksMax(plan);
}

export function RelayPicker({
  currentModel,
  refreshKey = 0,
  onChanged,
}: RelayPickerProps) {
  const { t } = useI18n();
  const cu = t.configUser;
  const [mode, setMode] = useState<UiMode>("relay");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useMenuDismiss(open, () => setOpen(false), "tier");
  const lastFetchKeyRef = useRef("");

  // Tenant plan, read LIVE from the shell (lib/plans; fail-open on failure).
  useEffect(() => {
    let cancelled = false;
    void fetchPlan().then((p) => {
      if (!cancelled && p) setPlan(p);
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
        const agent = (base.agent as Record<string, unknown> | undefined) ?? {};
        const reasoning =
          typeof agent.reasoning_effort === "string" ? agent.reasoning_effort : "medium";
        setMode(uiModeFromConfig(model, reasoning));
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [currentModel, refreshKey]);

  const onSelect = useCallback(
    (next: UiMode) => {
      if (next === mode) return;
      // Mode locked by the plan → send to upgrade instead of applying (D7).
      if (modeLocked(plan, next)) {
        openUpgrade("plus");
        return;
      }
      const preset = uiModePresetForPlan(next, plan);
      const prev = mode;
      setMode(next); // optimistic
      setSaving(true);
      // 1) model through the canonical path; 2) reasoning + delegation via config.
      void api
        .setModelAssignment({
          confirm_expensive_model: true,
          scope: "main",
          provider: "openrouter",
          model: preset.model,
        })
        .then(() => inventory.getConfig())
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
          return inventory.saveConfig({ ...base, agent, delegation });
        })
        .then(() => onChanged?.(next))
        .catch(() => setMode(prev)) // revert on failure
        .finally(() => setSaving(false));
    },
    [mode, onChanged, plan],
  );

  const subtitle = (m: UiMode) => (m === "max" ? cu.maxSubtitle : cu.relaySubtitle);

  const modeLabel = (m: UiMode) =>
    m === "relay" && isGratisPlan(plan) ? RELAY_25_FAST_LABEL : UI_MODE_LABEL[m];

  return (
    <div className="relative">
      <button
        type="button"
        disabled={!loaded || saving}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-50"
      >
        {modeLabel(mode)}
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
            {UI_MODE_ORDER.map((m) => {
              const locked = modeLocked(plan, m);
              const active = m === mode;
              return (
                <button
                  key={m}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onSelect(m);
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="flex w-4 shrink-0 justify-center">
                    {active && <Check className="h-4 w-4 text-foreground" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
                      {modeLabel(m)}
                      {locked && <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {subtitle(m)}
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
