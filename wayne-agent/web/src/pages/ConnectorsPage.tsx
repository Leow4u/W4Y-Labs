/**
 * Connectors — the user-facing integrations marketplace (Onda 2).
 *
 * Source: the /api/connectors bridge (Composio Sessions) — 1,047 apps across 87
 * categories. GLOBAL scope (the connection applies to every agent) × AGENT
 * (that agent's own account), mirroring the native per-profile model.
 * Connecting opens the Connect Link (white-label "Work4You" OAuth page) in a
 * window; the screen keeps polling the status until the account turns ACTIVE.
 * The old technical screen (manual MCP + Nous catalog) still lives at ?full=1.
 *
 * Data+actions live in the shared useConnectors hook (also used by
 * PluginsHub); the card is the shared ConnectorCard.
 */
import { useState } from "react";
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
import { useConnectors, filterConnectors } from "@/hooks/useConnectors";

export default function ConnectorsPage() {
  const { t } = useI18n();
  const tc = t.connectors;
  const { toast, showToast } = useToast();
  const c = useConnectors(showToast);

  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [eventsFor, setEventsFor] = useState<ConnectorToolkit | null>(null);

  const shown = filterConnectors(c.toolkits, search, activeCat);

  if (c.loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <PluginSlot name="connectors:top" />
      <Toast toast={toast} />

      {/* Bar: scope (left) · search (right). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-[220px] items-center gap-2">
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
        </div>
        <div className="relative w-48 shrink-0 sm:w-64">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-8 pl-8 text-xs"
            placeholder={tc.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Categories — single scrollable row (87 categories). */}
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

      {/* Connector grid. */}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          {tc.empty}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {shown.map((tk) => (
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
          ))}
        </div>
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
        "shrink-0 whitespace-nowrap rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground/90 text-background"
          : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}
