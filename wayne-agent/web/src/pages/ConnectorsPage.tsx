/**
 * Conectores — o marketplace user-facing de integrações (Onda 2).
 *
 * Fonte: a ponte /api/connectors (Composio Sessions) — 1.047 apps em 87
 * categorias. Escopo GLOBAL (a conexão vale pra todos os agentes) × AGENTE
 * (conta própria daquele agente), espelhando o modelo por-profile nativo.
 * Conectar abre o Connect Link (página OAuth white-label "Work4You") numa
 * janela; a tela fica sondando o status até a conta virar ACTIVE. A tela
 * técnica antiga (MCP manual + catálogo Nous) segue no ?full=1.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, Loader2, Plug, Search, Trash2, Zap } from "lucide-react";

import { api } from "@/lib/api";
import type {
  ConnectorAccount,
  ConnectorToolkit,
  ProfileInfo,
} from "@/lib/api";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Input } from "@nous-research/ui/ui/components/input";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { PluginSlot } from "@/plugins";
import { ConnectorEventsPanel } from "@/components/connectors/ConnectorEventsPanel";

type ToolkitState = "connected" | "pending" | "broken" | "none";

/** Estado agregado do toolkit no escopo (ACTIVE ganha de tudo). */
function stateOf(accounts: ConnectorAccount[]): ToolkitState {
  if (accounts.some((a) => a.status === "ACTIVE")) return "connected";
  if (accounts.some((a) => a.status === "INITIATED" || a.status === "INITIALIZING"))
    return "pending";
  if (accounts.length > 0) return "broken";
  return "none";
}

/** Logo do app (CDN da Composio) com fallback em tile de letra. */
function LogoTile({ toolkit }: { toolkit: ConnectorToolkit }) {
  const [failed, setFailed] = useState(false);
  if (!toolkit.logo || failed) {
    return (
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold text-foreground">
        {(toolkit.name || toolkit.slug || "?").charAt(0).toUpperCase()}
      </span>
    );
  }
  return (
    <img
      src={toolkit.logo}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-1"
    />
  );
}

export default function ConnectorsPage() {
  const { t } = useI18n();
  const tc = t.connectors;
  const { toast, showToast } = useToast();

  const [toolkits, setToolkits] = useState<ConnectorToolkit[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [scope, setScope] = useState("global");
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCat, setActiveCat] = useState<string | null>(null);
  // slug em processo de conexão (abriu popup; sondando status).
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  // toolkit cujo painel de Eventos está aberto (null = fechado).
  const [eventsFor, setEventsFor] = useState<ConnectorToolkit | null>(null);
  const aliveRef = useRef(true);
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  useEffect(() => {
    api
      .getConnectorsCatalog()
      .then((r) => aliveRef.current && setToolkits(r.toolkits))
      .catch((e) => showToast(String(e), "error"))
      .finally(() => aliveRef.current && setLoading(false));
    api.getProfiles().then((r) => aliveRef.current && setProfiles(r.profiles)).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshStatus = useCallback(
    (s = scope) =>
      api
        .getConnectorsStatus(s)
        .then((r) => {
          if (aliveRef.current) setAccounts(r.accounts);
          return r;
        })
        .catch(() => null),
    [scope],
  );

  useEffect(() => {
    setAccounts([]);
    void refreshStatus(scope);
  }, [scope, refreshStatus]);

  const byToolkit = useMemo(() => {
    const m = new Map<string, ConnectorAccount[]>();
    for (const a of accounts) {
      const k = (a.toolkit || "").toLowerCase();
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return m;
  }, [accounts]);

  const categories = useMemo(() => {
    const m = new Map<string, number>();
    for (const tk of toolkits)
      for (const c of tk.categories || []) m.set(c, (m.get(c) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [toolkits]);

  const lower = search.trim().toLowerCase();
  const shown = useMemo(() => {
    return toolkits.filter((tk) => {
      if (activeCat && !(tk.categories || []).includes(activeCat)) return false;
      if (!lower) return true;
      return (
        tk.name.toLowerCase().includes(lower) ||
        tk.slug.toLowerCase().includes(lower) ||
        (tk.description || "").toLowerCase().includes(lower) ||
        (tk.categories || []).some((c) => c.toLowerCase().includes(lower))
      );
    });
  }, [toolkits, activeCat, lower]);

  /** Sonda o status até o toolkit ficar ACTIVE (~2min máx). */
  const pollUntilActive = useCallback(
    (slug: string, tries = 0) => {
      if (!aliveRef.current) return;
      pollRef.current = setTimeout(async () => {
        const r = await refreshStatus();
        const accs = (r?.accounts || []).filter(
          (a) => (a.toolkit || "").toLowerCase() === slug,
        );
        if (accs.some((a) => a.status === "ACTIVE")) {
          setConnecting(null);
          showToast(tc.connectedToast.replace("{name}", slug), "success");
          return;
        }
        if (tries < 34) pollUntilActive(slug, tries + 1);
        else setConnecting(null);
      }, 3500);
    },
    [refreshStatus, showToast, tc.connectedToast],
  );

  const connect = async (tk: ConnectorToolkit) => {
    setConnecting(tk.slug);
    try {
      const res = await api.connectConnector(tk.slug, scope);
      if (res.no_auth) {
        setConnecting(null);
        showToast(tc.connectedToast.replace("{name}", tk.name), "success");
        void refreshStatus();
        return;
      }
      if (res.redirect_url) {
        window.open(res.redirect_url, "_blank", "noopener");
        showToast(tc.openedToast, "success");
        pollUntilActive(tk.slug.toLowerCase());
      } else {
        setConnecting(null);
        showToast(tc.connectFailed, "error");
      }
    } catch (e) {
      setConnecting(null);
      showToast(`${tc.connectFailed}: ${e}`, "error");
    }
  };

  const disconnect = async (tk: ConnectorToolkit) => {
    const accs = byToolkit.get(tk.slug.toLowerCase()) || [];
    if (!accs.length) return;
    setDisconnecting(tk.slug);
    try {
      for (const a of accs) {
        if (a.id) await api.disconnectConnectorAccount(a.id);
      }
      showToast(tc.disconnectedToast, "success");
      await refreshStatus();
    } catch (e) {
      showToast(`${e}`, "error");
    } finally {
      setDisconnecting(null);
    }
  };

  if (loading) {
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

      {/* Barra: escopo (esq) · busca (dir). */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-[220px] items-center gap-2">
          <Select value={scope} onValueChange={setScope} aria-label={tc.agent}>
            <SelectOption value="global">{tc.scopeGlobal}</SelectOption>
            {profiles
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

      {/* Categorias — linha única com rolagem (87 categorias). */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
        <CatChip
          label={`${tc.all} (${toolkits.length})`}
          active={!activeCat}
          onClick={() => setActiveCat(null)}
        />
        {categories.map(([c, n]) => (
          <CatChip
            key={c}
            label={`${c} (${n})`}
            active={activeCat === c}
            onClick={() => setActiveCat(activeCat === c ? null : c)}
          />
        ))}
      </div>

      {/* Grade de conectores. */}
      {shown.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-14 text-center text-sm text-muted-foreground">
          {tc.empty}
        </div>
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2">
          {shown.map((tk) => {
            const accs = byToolkit.get(tk.slug.toLowerCase()) || [];
            const state = stateOf(accs);
            const busy = connecting === tk.slug || disconnecting === tk.slug;
            return (
              <div
                key={tk.slug}
                className="flex items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-shadow hover:shadow-pop"
              >
                <LogoTile toolkit={tk} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate type-body font-medium text-foreground">
                      {tk.name}
                    </span>
                    {(tk.categories || []).slice(0, 1).map((c) => (
                      <span
                        key={c}
                        className="shrink-0 rounded-full bg-muted px-2 py-0.5 type-micro text-muted-foreground"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {tk.description}
                  </p>
                  {typeof tk.tools_count === "number" && tk.tools_count > 0 && (
                    <p className="mt-1 type-micro text-muted-foreground/70">
                      {tc.toolsCount.replace("{n}", String(tk.tools_count))}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1 pt-0.5">
                  {busy ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 type-ui text-muted-foreground">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {connecting === tk.slug ? tc.connecting : tc.disconnect}
                    </span>
                  ) : state === "connected" ? (
                    <>
                      <span className="inline-flex items-center gap-1 type-ui text-live">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {tc.connected}
                      </span>
                      <button
                        type="button"
                        onClick={() => setEventsFor(tk)}
                        aria-label={tc.events}
                        title={tc.events}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:text-primary"
                      >
                        <Zap className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void disconnect(tk)}
                        aria-label={tc.disconnect}
                        title={tc.disconnect}
                        className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </>
                  ) : tk.no_auth ? (
                    <span className="rounded-full bg-muted px-2.5 py-1 type-micro text-muted-foreground">
                      {tc.included}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => void connect(tk)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 type-ui font-medium text-background transition-opacity hover:opacity-90"
                    >
                      <Plug className="h-3.5 w-3.5" />
                      {state === "broken" || state === "pending" ? tc.reconnect : tc.connect}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <PluginSlot name="connectors:bottom" />

      {eventsFor && (
        <ConnectorEventsPanel
          toolkit={eventsFor.slug}
          toolkitName={eventsFor.name}
          scope={scope}
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
