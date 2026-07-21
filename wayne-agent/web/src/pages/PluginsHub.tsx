/**
 * PluginsHub — the USER-FACING face of the dashboard's "Plugins" module
 * (benchmark Manus): merges CONNECTORS + SKILLS into a single screen. The
 * NON-`?full=1` branch of PluginsRoute (App.tsx); the technical console stays
 * at /plugins?full=1.
 *
 * Onda 2 (Manus look): SINGLE search + Global×Agent scope on top → carousel of
 * featured connectors → "Conectores" row (scrollable, arrow + Ver tudo) →
 * "Habilidades" row (same). Everything reuses the shared hooks/cards
 * (useConnectors/ConnectorCard and useSkillHub/SkillHubCard). Next waves:
 * Gerir/Criar menus.
 */
import { useCallback, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { Input } from "@nous-research/ui/ui/components/input";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { useI18n } from "@/i18n";
import type { ConnectorToolkit } from "@/lib/api";
import { useConnectors, filterConnectors, catalogPhase } from "@/hooks/useConnectors";
import { CatalogError } from "@/components/connectors/CatalogError";
import { useSkillHub, filterSkills } from "@/hooks/useSkillHub";
import { ConnectorCard } from "@/components/connectors/ConnectorCard";
import { SkillHubCard } from "@/components/skills/SkillHubCard";
import { CardGrid } from "@/components/hub/CardGrid";
import { UseCaseCarousel } from "@/components/hub/UseCaseCarousel";
import { HubActions } from "@/components/hub/HubActions";
import { ConnectorEventsPanel } from "@/components/connectors/ConnectorEventsPanel";

/** Cards per page in the grids (2 cols × 4 rows, Manus style). */
const PAGE_SIZE = 8;

function RowSpinner() {
  return (
    <div className="flex items-center justify-center py-10">
      <Spinner className="text-xl text-primary" />
    </div>
  );
}

function SectionHead({
  title,
  count,
  onCollapse,
  collapseLabel,
}: {
  title: React.ReactNode;
  count: number;
  onCollapse: () => void;
  collapseLabel: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <h2 className="font-mondwest text-display text-xs tracking-[0.12em] text-text-secondary">
        {title}
        <span className="ml-1.5 text-text-tertiary">{count}</span>
      </h2>
      <button
        type="button"
        onClick={onCollapse}
        className="ml-auto inline-flex items-center rounded-full px-2.5 py-1 type-ui text-muted-foreground transition-colors hover:text-foreground"
      >
        {collapseLabel}
      </button>
    </div>
  );
}

export default function PluginsHub() {
  const { t } = useI18n();
  const tc = t.connectors;
  const { toast, showToast } = useToast();

  const c = useConnectors(showToast);
  const sk = useSkillHub();

  const [search, setSearch] = useState("");
  const [eventsFor, setEventsFor] = useState<ConnectorToolkit | null>(null);
  const [showAllConn, setShowAllConn] = useState(false);
  const [showAllSkills, setShowAllSkills] = useState(false);

  const connSectionRef = useRef<HTMLDivElement>(null);
  const skillSectionRef = useRef<HTMLDivElement>(null);

  // "Gerir" → expands the section and scrolls to it (inline management: disconnect etc.).
  const onManage = useCallback((which: "connectors" | "skills") => {
    if (which === "connectors") {
      setShowAllConn(true);
      requestAnimationFrame(() =>
        connSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    } else {
      setShowAllSkills(true);
      requestAnimationFrame(() =>
        skillSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    }
  }, []);

  const skReload = sk.reload;
  const onCreated = useCallback(() => {
    void skReload();
  }, [skReload]);

  const conn = useMemo(
    () => filterConnectors(c.toolkits, search, null),
    [c.toolkits, search],
  );

  // The hub is REACHABLE by the end user: with the sidebar collapsed the
  // "Integrações" group cannot expand into its children, so pressing it
  // navigates to its anchor and lands here. It therefore owes the same honesty
  // as the Connectors page — it was branching on  alone, so a catalog
  // that FAILED to load rendered the empty-state copy and read as "you have no
  // connectors". Reuses the same pure derivation, not a second opinion.
  const connPhase = catalogPhase({
    loading: c.loading,
    error: c.error,
    total: c.toolkits.length,
  });
  const skills = useMemo(() => filterSkills(sk.skills, search, null), [sk.skills, search]);

  const connCard = (tk: ConnectorToolkit) => (
    <ConnectorCard
      tk={tk}
      accounts={c.byToolkit.get(tk.slug.toLowerCase()) || []}
      connecting={c.connecting === tk.slug}
      disconnecting={c.disconnecting === tk.slug}
      onConnect={c.connect}
      onDisconnect={c.disconnect}
      onEvents={setEventsFor}
    />
  );

  return (
    <div className="flex flex-col gap-8">
      <Toast toast={toast} />

      {/* Gerir / Criar — top right corner (benchmark Manus). */}
      <div className="-mb-4 flex items-center justify-end">
        <HubActions
          scope={c.scope}
          onManage={onManage}
          onCreated={onCreated}
          showToast={showToast}
        />
      </div>

      {/* Highlights on top (Manus look): featured connectors, always visible. */}
      {connPhase === "ready" && (
        <UseCaseCarousel toolkits={c.toolkits} byToolkit={c.byToolkit} />
      )}

      {/* Bar: single search (grows) + Global×Agent scope. */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="h-10 pl-9 text-sm"
            placeholder={t.pluginsHub.searchPh}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
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

      {/* CONNECTORS */}
      <div ref={connSectionRef}>
        {connPhase === "loading" ? (
        <RowSpinner />
      ) : connPhase === "error" ? (
        <CatalogError
          message={c.error!}
          onRetry={c.reloadCatalog}
          retryLabel={t.common.retry}
        />
      ) : showAllConn ? (
        <section className="flex flex-col gap-3">
          <SectionHead
            title={t.app.nav.connectors}
            count={conn.length}
            onCollapse={() => setShowAllConn(false)}
            collapseLabel={t.chat.showLess}
          />
          {conn.length === 0 ? (
            <p className="text-xs text-text-tertiary">{tc.empty}</p>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {conn.map((tk) => (
                <div key={tk.slug}>{connCard(tk)}</div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <CardGrid
          title={t.app.nav.connectors}
          count={conn.length}
          seeAllLabel={t.chat.viewAll}
          onSeeAll={conn.length > PAGE_SIZE ? () => setShowAllConn(true) : undefined}
          items={conn}
          pageSize={PAGE_SIZE}
          renderItem={(tk) => <div key={tk.slug}>{connCard(tk)}</div>}
        />
      )}
      </div>

      {/* SKILLS */}
      <div ref={skillSectionRef}>
        {sk.loading ? (
        <RowSpinner />
      ) : showAllSkills ? (
        <section className="flex flex-col gap-3">
          <SectionHead
            title={t.app.nav.skills}
            count={skills.length}
            onCollapse={() => setShowAllSkills(false)}
            collapseLabel={t.chat.showLess}
          />
          {skills.length === 0 ? (
            <p className="text-xs text-text-tertiary">{t.skills.noSkillsMatch}</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {skills.map((r) => (
                <div key={r.identifier}>
                  <SkillHubCard
                    skill={r}
                    installed={Boolean(sk.installed[r.identifier])}
                    installing={sk.busy[r.identifier] === "install"}
                    failed={sk.failed[r.identifier]}
                    onInstall={sk.install}
                  />
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        <CardGrid
          title={t.app.nav.skills}
          count={skills.length}
          seeAllLabel={t.chat.viewAll}
          onSeeAll={skills.length > PAGE_SIZE ? () => setShowAllSkills(true) : undefined}
          items={skills}
          pageSize={PAGE_SIZE}
          gapClass="gap-3"
          renderItem={(r) => (
            <div key={r.identifier}>
              <SkillHubCard
                skill={r}
                installed={Boolean(sk.installed[r.identifier])}
                installing={sk.busy[r.identifier] === "install"}
                failed={sk.failed[r.identifier]}
                onInstall={sk.install}
              />
            </div>
          )}
        />
      )}
      </div>

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
