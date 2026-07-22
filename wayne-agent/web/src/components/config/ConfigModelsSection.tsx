/**
 * Config → Modelos (Fase 10 · PR-3 / Onda A5c · PR-8 C5).
 * Relay/MAX defaults · explore subagent · ~12 featured toggles curados.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { ChevronDown, Cpu, Lock, Star } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@nous-research/ui/ui/components/card";
import { Switch } from "@nous-research/ui/ui/components/switch";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import {
  uiModeFromConfig,
  uiModePreset,
  type UiMode,
} from "@/lib/tier-presets";
import {
  DEFAULT_FEATURED_ENABLED,
  EXPLORE_SUBAGENT_SLUGS,
  FEATURED_MODEL_SLUGS,
} from "@/lib/featured-models";
import { modelCommercialName } from "@/components/agents/ModelCatalogPicker";

export function ConfigModelsSection({
  config,
  onConfigSaved,
  showToast,
}: {
  config: Record<string, unknown>;
  onConfigSaved: (next: Record<string, unknown>) => void;
  showToast: (msg: string, kind: "success" | "error") => void;
}) {
  const { t } = useI18n();
  const cu = t.configUser;
  const [tierBusy, setTierBusy] = useState(false);
  const [byokOpen, setByokOpen] = useState(false);

  const model = String(config.model ?? "");
  const reasoning = String(
    (config.agent as Record<string, unknown> | undefined)?.reasoning_effort ?? "medium",
  );
  const activeMode = uiModeFromConfig(model, reasoning);

  const delegation =
    config.delegation && typeof config.delegation === "object"
      ? (config.delegation as Record<string, unknown>)
      : {};
  const exploreModel = String(delegation.model ?? "");

  const featuredRaw = config.models;
  const featuredCfg =
    featuredRaw && typeof featuredRaw === "object"
      ? (featuredRaw as Record<string, unknown>)
      : {};
  const enabledFeatured = new Set(
    Array.isArray(featuredCfg.featured_enabled)
      ? (featuredCfg.featured_enabled as string[])
      : DEFAULT_FEATURED_ENABLED,
  );

  const applyMode = async (mode: UiMode) => {
    if (tierBusy || activeMode === mode) return;
    setTierBusy(true);
    const preset = uiModePreset(mode);
    try {
      await api.setModelAssignment({
        confirm_expensive_model: true,
        scope: "main",
        provider: "openrouter",
        model: preset.model,
      });
      const cfg = ((await api.getConfig()) ?? {}) as Record<string, unknown>;
      const agent =
        cfg.agent && typeof cfg.agent === "object"
          ? { ...(cfg.agent as Record<string, unknown>) }
          : {};
      agent.reasoning_effort = preset.reasoning;
      const del =
        cfg.delegation && typeof cfg.delegation === "object"
          ? { ...(cfg.delegation as Record<string, unknown>) }
          : {};
      del.model = preset.delegationModel;
      del.reasoning_effort = preset.delegationReasoning;
      if (preset.maxConcurrentChildren) del.max_concurrent_children = preset.maxConcurrentChildren;
      const next = { ...cfg, agent, delegation: del };
      await api.saveConfig(next);
      onConfigSaved(next);
      showToast(cu.tierAppliedToast, "success");
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setTierBusy(false);
    }
  };

  const persistFeatured = async (slug: string, on: boolean) => {
    const nextSet = new Set(enabledFeatured);
    if (on) nextSet.add(slug);
    else nextSet.delete(slug);
    const next = {
      ...config,
      models: {
        ...featuredCfg,
        featured_enabled: Array.from(nextSet),
      },
    };
    try {
      await api.saveConfig(next);
      onConfigSaved(next);
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    }
  };

  const persistExplore = async (value: string) => {
    const del =
      config.delegation && typeof config.delegation === "object"
        ? { ...(config.delegation as Record<string, unknown>) }
        : {};
    del.model = value;
    const next = { ...config, delegation: del };
    try {
      await api.saveConfig(next);
      onConfigSaved(next);
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader className="px-5 py-4">
          <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
            <Star className="h-4 w-4" />
            {cu.modelsDefaultTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-5 pb-5">
          <span className="text-xs text-text-secondary">{cu.modelsDefaultHint}</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <button
              type="button"
              disabled={tierBusy}
              onClick={() => void applyMode("relay")}
              aria-pressed={activeMode === "relay"}
              className={cn(
                "flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-all disabled:opacity-60",
                activeMode === "relay"
                  ? "border-live bg-live/5 ring-1 ring-live/40"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <span className="text-sm font-semibold">Relay</span>
              <span className="text-xs text-text-secondary">{cu.relaySubtitle}</span>
            </button>
            <button
              type="button"
              disabled={tierBusy}
              onClick={() => void applyMode("max")}
              aria-pressed={activeMode === "max"}
              className={cn(
                "flex flex-col gap-0.5 rounded-xl border px-4 py-3 text-left transition-all disabled:opacity-60",
                activeMode === "max"
                  ? "border-live bg-live/5 ring-1 ring-live/40"
                  : "border-border hover:border-foreground/30",
              )}
            >
              <span className="flex items-center gap-1.5 text-sm font-semibold">
                MAX
                {activeMode !== "max" && (
                  <Lock className="h-3 w-3 text-muted-foreground" aria-hidden />
                )}
              </span>
              <span className="text-xs text-text-secondary">{cu.maxSubtitle}</span>
            </button>
          </div>
          {tierBusy && (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Spinner className="text-sm" /> {t.common.saving}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="px-5 py-4">
          <CardTitle className="flex items-center gap-2 font-sans text-[15px] font-semibold">
            <Cpu className="h-4 w-4" />
            {cu.exploreSubagentTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="px-5 pb-5">
          <select
            className="h-10 w-full max-w-md rounded-lg border border-border bg-background px-3 text-sm"
            value={exploreModel}
            onChange={(e) => void persistExplore(e.target.value)}
          >
            <option value="">{cu.exploreSubagentAuto}</option>
            {EXPLORE_SUBAGENT_SLUGS.map((slug) => (
              <option key={slug} value={slug}>
                {modelCommercialName(slug)}
              </option>
            ))}
          </select>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3 px-5 py-4">
          <CardTitle className="font-sans text-[15px] font-semibold">{cu.featuredModelsTitle}</CardTitle>
          <Link
            to="/models?full=1"
            className="shrink-0 text-xs font-medium text-live hover:underline"
          >
            {cu.featuredViewAll}
          </Link>
        </CardHeader>
        <CardContent className="flex flex-col gap-3 px-5 pb-5">
          <span className="text-xs text-text-secondary">{cu.featuredModelsHint}</span>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {FEATURED_MODEL_SLUGS.map((slug) => (
              <li key={slug} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="text-sm">{modelCommercialName(slug)}</span>
                <Switch
                  checked={enabledFeatured.has(slug)}
                  onCheckedChange={(v) => void persistFeatured(slug, v)}
                />
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <button
          type="button"
          className="flex w-full items-center justify-between px-5 py-4 text-left"
          onClick={() => setByokOpen((v) => !v)}
        >
          <span className="text-sm font-medium">{cu.byokTitle}</span>
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", byokOpen && "rotate-180")}
          />
        </button>
        {byokOpen && (
          <CardContent className="border-t border-border px-5 pb-5 pt-4">
            <p className="text-xs text-text-secondary">{cu.byokHint}</p>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
