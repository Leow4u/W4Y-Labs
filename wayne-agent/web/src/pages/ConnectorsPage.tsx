/**
 * Connectors — the user-facing integrations marketplace (Onda 2 + PR-7 C4/C7).
 *
 * Default (curated): featured BR apps, connected strip, use-case carousel,
 * search, and HubActions (Meu MCP). Full Composio catalog (~1,047) lives
 * behind ?catalog=1 — categories EN only there.
 */
import { useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Search } from "lucide-react";

import type { ConnectorToolkit } from "@/lib/api";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Input } from "@nous-research/ui/ui/components/input";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { PluginSlot } from "@/plugins";
import { ConnectorEventsPanel } from "@/components/connectors/ConnectorEventsPanel";
import { ConnectorCard } from "@/components/connectors/ConnectorCard";
import { CatalogError } from "@/components/connectors/CatalogError";
import { HubActions } from "@/components/hub/HubActions";
import { UseCaseCarousel } from "@/components/hub/UseCaseCarousel";
import { useConnectors, filterConnectors, catalogPhase } from "@/hooks/useConnectors";
import {
  pickConnectedExtra,
  resolveFeaturedConnectors,
  resolveFeaturedDevConnectors,
} from "@/lib/connector-curation";

export default function ConnectorsPage() {
  const { t } = useI18n();
  const tc = t.connectors;
  const { toast, showToast } = useToast();
  const c = useConnectors(showToast);
  const [params, setParams] = useSearchParams();

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [eventsFor, setEventsFor] = useState<ConnectorToolkit | null>(null);

  const catalog = params.get("catalog") === "1";
  const setCatalog = (open: boolean) => {
    const next = new URLSearchParams(params);
    if (open) next.set("catalog", "1");
    else next.delete("catalog");
    setParams(next);
  };

  const featured = useMemo(() => resolveFeaturedConnectors(c.toolkits), [c.toolkits]);
  const featuredDev = useMemo(() => resolveFeaturedDevConnectors(c.toolkits), [c.toolkits]);
  const featuredAll = useMemo(() => [...featured, ...featuredDev], [featured, featuredDev]);
  const connectedExtra = useMemo(
    () => pickConnectedExtra(c.toolkits, featuredAll, c.byToolkit),
    [c.toolkits, featuredAll, c.byToolkit],
  );

  const searchActive = search.trim().length > 0;
  const searchResults = useMemo(
    () => filterConnectors(c.toolkits, search, null),
    [c.toolkits, search],
  );

  const catalogShown = useMemo(
    () => filterConnectors(c.toolkits, search, activeCat),
    [c.toolkits, search, activeCat],
  );

  const phase = catalogPhase({
    loading: c.loading,
    error: c.error,
    total: c.toolkits.length,
  });

  const connCard = (tk: ConnectorToolkit) => (
    <ConnectorCard
      key={tk.slug}
      tk={tk}
      accounts={c.byToolkit.get(tk.slug.toLowerCase()) || []}
      connecting={c.connecting === tk.slug}
      disconnecting={c.disconnecting === tk.slug}
      onConnect={c.connect}
      onDisconnect={c.disconnect}
      onEvents={setEventsFor}
    />
  );

  if (phase === "loading") {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-primary" />
      </div>
    );
  }

  if (phase === "error") {
    return (
      <CatalogError message={c.error!} onRetry={c.reloadCatalog} retryLabel={t.common.retry} />
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PluginSlot name="connectors:top" />
      <Toast toast={toast} />

      {/* Bar: scope · search · Gerir/Criar (C7 — Meu MCP). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <Select value={c.scope} onValueChange={c.setScope} aria-label={tc.agent}>
            <SelectOption value="global">{tc.scopeGlobal}</SelectOption>
            {c.profiles
              .filter((p) => p.name !== "default")
              .map((p) => (
                <SelectOption key={p.name} value={p.name}>
                  {tc.agent}: {p.name}
                </SelectOption>
              ))}
          </Select>
          <div className="relative min-w-[12rem] flex-1 sm:max-w-xs">
            <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="h-8 pl-8 text-xs"
              placeholder={tc.searchPlaceholder}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <HubActions
          scope={c.scope}
          onManage={() => setCatalog(true)}
          onCreated={() => void c.reloadCatalog()}
          showToast={showToast}
        />
      </div>

      {catalog ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={() => setCatalog(false)}
              className="type-ui text-primary underline-offset-2 hover:underline"
            >
              {tc.backToFeatured}
            </button>
            <span className="type-caption text-muted-foreground">
              {c.toolkits.length} apps
            </span>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            <CatChip
              label={`${tc.all} (${c.toolkits.length})`}
              active={!activeCat}
              onClick={() => setActiveCat(null)}
            />
            {c.categories.map(([cat, n]) => (
              <CatChip
                key={cat}
                label={`${cat} (${n})`}
                active={activeCat === cat}
                onClick={() => setActiveCat(activeCat === cat ? null : cat)}
              />
            ))}
          </div>

          {catalogShown.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
              {tc.empty}
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">{catalogShown.map(connCard)}</div>
          )}
        </>
      ) : searchActive ? (
        <>
          {searchResults.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
              {tc.empty}
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">{searchResults.map(connCard)}</div>
          )}
          <button
            type="button"
            onClick={() => setCatalog(true)}
            className="self-start type-ui text-primary underline-offset-2 hover:underline"
          >
            {tc.viewFullCatalog}
          </button>
        </>
      ) : (
        <>
          <UseCaseCarousel toolkits={c.toolkits} byToolkit={c.byToolkit} />

          {connectedExtra.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="type-caption font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {tc.connectedSection}
              </h2>
              <div className="grid gap-2.5 sm:grid-cols-2">{connectedExtra.map(connCard)}</div>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="type-caption font-medium uppercase tracking-[0.08em] text-muted-foreground">
              {tc.featuredSection}
            </h2>
            <div className="grid gap-2.5 sm:grid-cols-2">{featured.map(connCard)}</div>
          </section>

          {featuredDev.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="type-caption font-medium uppercase tracking-[0.08em] text-muted-foreground">
                {tc.devSection}
              </h2>
              <div className="grid gap-2.5 sm:grid-cols-2">{featuredDev.map(connCard)}</div>
            </section>
          )}

          <button
            type="button"
            onClick={() => setCatalog(true)}
            className="self-start type-ui text-primary underline-offset-2 hover:underline"
          >
            {tc.viewFullCatalog}
          </button>
        </>
      )}

      <PluginSlot name="connectors:bottom" />

      {eventsFor && (
        <ConnectorEventsPanel
          toolkit={eventsFor.slug}
          toolkitName={eventsFor.name}
          scope={c.scope}
          onClose={() => setEventsFor(null)}
          onToast={showToast}
        />
      )}
    </div>
  );
}

function CatChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors",
        active
          ? "border-foreground/30 bg-muted font-medium text-foreground"
          : "border-border text-muted-foreground hover:border-foreground/20 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
