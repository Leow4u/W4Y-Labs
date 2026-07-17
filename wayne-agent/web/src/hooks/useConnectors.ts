/**
 * useConnectors — the SINGLE source of Connectors data+actions (Composio Sessions).
 * Extracted from ConnectorsPage so it can be shared by it AND by PluginsHub
 * (the Manus-style merge), without duplicating the connect/poll/disconnect logic.
 *
 * The hook owns: catalog (~1047 toolkits), profiles, Global×Agent scope,
 * per-scope status (accounts + byToolkit), aggregated categories, and the
 * connect (opens the OAuth Connect Link and polls until ACTIVE) / disconnect actions.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { ConnectorAccount, ConnectorToolkit, ProfileInfo } from "@/lib/api";
import { useI18n } from "@/i18n";

export type ToolkitState = "connected" | "pending" | "broken" | "none";

/** Aggregated toolkit state within the scope (ACTIVE beats everything). */
export function stateOf(accounts: ConnectorAccount[]): ToolkitState {
  if (accounts.some((a) => a.status === "ACTIVE")) return "connected";
  if (accounts.some((a) => a.status === "INITIATED" || a.status === "INITIALIZING"))
    return "pending";
  if (accounts.length > 0) return "broken";
  return "none";
}

/** Client-side filter by search (name/slug/description/categories) + category. */
export function filterConnectors(
  toolkits: ConnectorToolkit[],
  search: string,
  activeCat: string | null,
): ConnectorToolkit[] {
  const lower = search.trim().toLowerCase();
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
}

type ShowToast = (msg: string, variant: "success" | "error") => void;

export function useConnectors(showToast: ShowToast) {
  const { t } = useI18n();
  const tc = t.connectors;

  const [toolkits, setToolkits] = useState<ConnectorToolkit[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [scope, setScope] = useState("global");
  const [accounts, setAccounts] = useState<ConnectorAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
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

  /** Polls the status until the toolkit turns ACTIVE (~2min max). */
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

  const connect = useCallback(
    async (tk: ConnectorToolkit) => {
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
    },
    [scope, showToast, tc, refreshStatus, pollUntilActive],
  );

  const disconnect = useCallback(
    async (tk: ConnectorToolkit) => {
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
    },
    [byToolkit, showToast, tc.disconnectedToast, refreshStatus],
  );

  return {
    toolkits,
    profiles,
    scope,
    setScope,
    accounts,
    byToolkit,
    categories,
    loading,
    connecting,
    disconnecting,
    connect,
    disconnect,
    refreshStatus,
  };
}
