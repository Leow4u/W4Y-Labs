/**
 * TierPicker — seletor dos "modelos Work4You" (Flash / Auto / Expert / Crew) na
 * barra do Chat. Esconde as LLMs por trás de 4 tiers; cada um é um preset de
 * (modelo × esforço × multi-agente) — ver lib/tier-presets.ts.
 *
 * Aplicar um tier faz DUAS escritas: o modelo pelo caminho canônico
 * (`/api/model/set`, o mesmo do ModelPickerDialog) e o reasoning + delegation
 * pelo read-modify-write da config (o mesmo padrão do ReasoningPicker). Como
 * naqueles, a mudança entra na sessão no próximo /new ou reload — a barra mostra
 * o aviso via onChanged.
 *
 * Gating por plano (Expert=Pro, Crew=Business) entra na fase de planos; por ora
 * todos os tiers ficam disponíveis.
 */

import { Check, ChevronDown } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import {
  DEFAULT_TIER,
  TIER_ORDER,
  TIER_PRESETS,
  type TierKey,
  tierFromConfig,
} from "@/lib/tier-presets";

interface TierPickerProps {
  /** Modelo atual (dispara re-leitura quando muda por fora). */
  currentModel: string;
  /** Incrementado após salvar modelo/config, p/ re-ler em sincronia. */
  refreshKey?: number;
  /** Avisa a barra p/ mostrar o "aplicar no /new ou reload". */
  onChanged?: (tier: TierKey) => void;
}

// Valor sentinela p/ "modelo cru fora dos presets" (usuário escolheu no picker
// avançado). Mostrado como opção informativa, não selecionável de volta.
const CUSTOM = "__custom__";

// Gating por plano: Expert exige Pro+, Crew exige Max. plan null (desconhecido/
// carregando) → NÃO trava (fail-open; o teto real é a chave OpenRouter capada).
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
  const [tier, setTier] = useState<string>(DEFAULT_TIER);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [plan, setPlan] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  useMenuDismiss(open, () => setOpen(false), "tier");
  const lastFetchKeyRef = useRef("");

  // Plano do tenant, lido AO VIVO da casca (mesma origem work4you.ai — o cookie
  // de sessão viaja junto; o LB roteia /planos* para a casca). Alimenta o gating.
  useEffect(() => {
    let cancelled = false;
    fetch("/planos/plan", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.plan) setPlan(String(d.plan));
      })
      .catch(() => {
        /* casca indisponível → plan fica null → fail-open (sem cadeado) */
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
      // Tier travado pelo plano → leva ao upgrade em vez de aplicar.
      if (tierLocked(plan, next as TierKey)) {
        window.location.href = `/planos?plan=${next === "crew" ? "max" : "pro"}`;
        return;
      }
      const preset = TIER_PRESETS[next as TierKey];
      if (!preset) return;
      const prev = tier;
      setTier(next); // otimista
      setSaving(true);
      // 1) modelo pelo caminho canônico; 2) reasoning + delegation via config.
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
        .catch(() => setTier(prev)) // reverte em falha
        .finally(() => setSaving(false));
    },
    [tier, onChanged, plan],
  );

  const currentLabel =
    tier === CUSTOM
      ? "Personalizado"
      : (TIER_PRESETS[tier as TierKey]?.label ?? "Modelo");

  // Pill limpa (só o nome do modo) + dropdown estilo Grok (nome em negrito +
  // descrição + check), abrindo PRA CIMA em camada própria (fixed via anchor
  // não é preciso: o composer não recorta o dropdown p/ cima). Sem "modelo"/raio.
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
              const p = TIER_PRESETS[k];
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
                      {p.label}
                      {locked && <span className="text-xs">🔒</span>}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {p.subtitle}
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
