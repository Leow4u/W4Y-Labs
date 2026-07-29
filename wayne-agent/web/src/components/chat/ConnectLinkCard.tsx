/**
 * ConnectLinkCard — Composio's Connect Link becomes an authorization CARD in
 * the chat (Conectores Onda 3), instead of a loose link in the prose.
 *
 * Flow: Authorize → opens the white-label page (popup) → the card polls
 * /api/connectors/status until a NEW account goes ACTIVE → "Conectado ✓".
 * No session reload: Composio tools run server-side, so the activated account
 * already counts in the ongoing conversation (proven in Onda 0/1).
 *
 * App identity (logo + name): detected from the agent's OWN text (`context`)
 * matched against the connectors catalog. CONSERVATIVE rule — it only shows
 * the app when exactly ONE known app is cited; otherwise it falls back to the
 * generic card. On an OAuth authorization screen we cannot show a wrong app.
 */
import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Loader2, Plug } from "lucide-react";

import { api } from "@/lib/api";
import type { ConnectorToolkit } from "@/lib/api";
import { requestEnsureComposioMcp } from "@/lib/ensureComposioMcp";
import { useI18n } from "@/i18n";

type Phase = "idle" | "waiting" | "connected";

// Catalog loaded once per page session (the backend already caches for 6h).
// Exported: the RightDock "Fontes" block shares the same cache (app logos +
// the connect-apps menu).
let catalogCache: Promise<ConnectorToolkit[]> | null = null;
export function loadCatalog(): Promise<ConnectorToolkit[]> {
  if (!catalogCache) {
    catalogCache = api
      .getConnectorsCatalog()
      .then((r) => r.toolkits)
      .catch(() => []);
  }
  return catalogCache;
}

// Names that are NOT the target app — the platform itself / login providers
// that show up in the authorization prose ("página da Microsoft/Composio").
// They must not become the card's logo.
const APP_DENYLIST = new Set(["composio"]);

/** Detects the target app cited in the agent's text. The agent always names the
 *  app FIRST ("Para conectar o seu <App>…"); providers/platform come later.
 *  So: match known names (≥4 chars, whole word; skip the denylist) and return
 *  the one at the LOWEST position. None → null (generic card). */
function detectApp(text: string, toolkits: ConnectorToolkit[]): ConnectorToolkit | null {
  if (!text) return null;
  const lower = ` ${text.toLowerCase()} `;
  let best: ConnectorToolkit | null = null;
  let bestPos = Infinity;
  for (const tk of toolkits) {
    if (APP_DENYLIST.has(tk.slug)) continue;
    const name = (tk.name || "").toLowerCase().trim();
    if (name.length < 4) continue;
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pos = lower.search(new RegExp(`\\b${esc}\\b`));
    if (pos >= 0 && pos < bestPos) {
      best = tk;
      bestPos = pos;
    }
  }
  return best;
}

function AppTile({ app }: { app: ConnectorToolkit | null }) {
  const [failed, setFailed] = useState(false);
  if (app && app.logo && !failed) {
    return (
      <img
        src={app.logo}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-xl bg-white object-contain p-1.5"
      />
    );
  }
  return (
    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
      <Plug className="h-4 w-4" />
    </span>
  );
}

export function ConnectLinkCard({ url, context }: { url: string; context?: string }) {
  const { t } = useI18n();
  const tc = t.connectors;
  const [phase, setPhase] = useState<Phase>("idle");
  const [toolkit, setToolkit] = useState<string | null>(null);
  const [app, setApp] = useState<ConnectorToolkit | null>(null);
  const aliveRef = useRef(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Detects the app from the agent's text (conservative — see detectApp).
  useEffect(() => {
    if (!context) return;
    let alive = true;
    void loadCatalog().then((tks) => {
      if (alive) setApp(detectApp(context, tks));
    });
    return () => {
      alive = false;
    };
  }, [context]);

  const authorize = async () => {
    // Snapshot BEFORE opening — a fast OAuth can ACTIVE the account before
    // we finish the first status read, hiding a "new id" transition.
    let beforeStatus = new Map<string, string>();
    try {
      const st = await api.getConnectorsStatus("global");
      beforeStatus = new Map(
        st.accounts.filter((a) => a.id).map((a) => [a.id, a.status]),
      );
    } catch {
      /* carry on without a snapshot */
    }

    // Keep the window handle (no "noopener", OTHERWISE window.open returns
    // null) so we can close it automatically once the connection is detected —
    // Composio's success page ("You can close this window now") does not close
    // itself, and an opener may close the window it opened even cross-origin.
    const win = window.open(url, "_blank");
    setPhase("waiting");

    const findActivated = (
      accounts: { id: string; toolkit: string; status: string }[],
    ) => {
      const activated = accounts.filter(
        (a) => a.id && a.status === "ACTIVE" && beforeStatus.get(a.id) !== "ACTIVE",
      );
      if (!activated.length) return undefined;
      const slug = (app?.slug || "").toLowerCase();
      if (slug) {
        const match = activated.find(
          (a) => (a.toolkit || "").toLowerCase() === slug,
        );
        if (match) return match;
      }
      return activated[0];
    };

    const check = async (): Promise<boolean> => {
      const st = await api.getConnectorsStatus("global");
      const fresh = findActivated(st.accounts);
      if (!fresh) return false;
      setToolkit(fresh.toolkit);
      setPhase("connected");
      requestEnsureComposioMcp(true);
      try {
        win?.close();
      } catch {
        /* window already closed by the user */
      }
      return true;
    };

    const poll = (tries: number) => {
      if (!aliveRef.current) return;
      timerRef.current = setTimeout(async () => {
        try {
          if (await check()) return;
        } catch {
          /* try again */
        }
        if (tries < 40) poll(tries + 1);
        else if (aliveRef.current) setPhase("idle");
      }, tries === 0 ? 800 : 2500);
    };

    try {
      if (await check()) return;
    } catch {
      /* poll */
    }
    poll(0);
  };

  // Title: detected app name > connected toolkit > generic. On an authorization
  // screen, the name reflects what the agent wrote (same source).
  const title =
    app?.name ?? (phase === "connected" && toolkit ? toolkit : tc.authTitle);

  return (
    <div className="flex w-full items-center gap-3.5 rounded-xl border border-border bg-card px-4 py-3 font-sans shadow-card transition-shadow hover:shadow-pop">
      <AppTile app={app} />
      <span className="min-w-0 flex-1">
        <span className="block truncate type-body font-medium text-foreground">
          {title}
        </span>
        <span className="mt-0.5 block type-caption text-muted-foreground">
          {phase === "waiting"
            ? tc.waiting
            : phase === "connected"
              ? tc.connected
              : tc.authSecure}
        </span>
      </span>
      {phase === "connected" ? (
        <span className="inline-flex shrink-0 items-center gap-1.5 type-ui font-medium text-live">
          <CheckCircle2 className="h-4 w-4" />
          {tc.connected}
        </span>
      ) : (
        <button
          type="button"
          onClick={authorize}
          disabled={phase === "waiting"}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-foreground px-4 py-2 type-ui font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-60"
        >
          {phase === "waiting" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Plug className="h-3.5 w-3.5" />
          )}
          {tc.authorize}
        </button>
      )}
    </div>
  );
}
