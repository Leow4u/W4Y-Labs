/**
 * ConnectorCard — the card for one connector (Composio toolkit): real logo
 * (CDN, with a letter fallback), name + category, description, tools count and
 * the action button (Conectar/Reconectar · Conectado with Eventos/Desconectar
 * · Incluído). Presentational: takes the toolkit + accounts + callbacks.
 * Extracted from ConnectorsPage so it can be reused by both it and PluginsHub.
 */
import { useState } from "react";
import { CheckCircle2, Loader2, Plug, Trash2, Zap } from "lucide-react";
import type { ConnectorAccount, ConnectorToolkit } from "@/lib/api";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { stateOf } from "@/hooks/useConnectors";

/** App logo (Composio's CDN) with a letter-tile fallback. */
export function LogoTile({
  toolkit,
  className,
}: {
  toolkit: ConnectorToolkit;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!toolkit.logo || failed) {
    return (
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-sm font-semibold text-foreground",
          className,
        )}
      >
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
      className={cn("h-9 w-9 shrink-0 rounded-lg bg-white object-contain p-1", className)}
    />
  );
}

export function ConnectorCard({
  tk,
  accounts,
  connecting,
  disconnecting,
  onConnect,
  onDisconnect,
  onEvents,
}: {
  tk: ConnectorToolkit;
  accounts: ConnectorAccount[];
  connecting: boolean;
  disconnecting: boolean;
  onConnect: (tk: ConnectorToolkit) => void;
  onDisconnect: (tk: ConnectorToolkit) => void;
  onEvents?: (tk: ConnectorToolkit) => void;
}) {
  const { t } = useI18n();
  const tc = t.connectors;
  const state = stateOf(accounts);
  const busy = connecting || disconnecting;

  return (
    <div className="flex h-full items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-shadow hover:shadow-pop">
      <LogoTile toolkit={tk} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate type-body font-medium text-foreground">{tk.name}</span>
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
          <p className="mt-1 type-micro text-text-tertiary">
            {tc.toolsCount.replace("{n}", String(tk.tools_count))}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 pt-0.5">
        {busy ? (
          <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 type-ui text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            {connecting ? tc.connecting : tc.disconnect}
          </span>
        ) : state === "connected" ? (
          <>
            <span className="inline-flex items-center gap-1 type-ui text-live">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {tc.connected}
            </span>
            {onEvents && (
              <button
                type="button"
                onClick={() => onEvents(tk)}
                aria-label={tc.events}
                title={tc.events}
                className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground transition-colors hover:text-primary"
              >
                <Zap className="h-4 w-4" />
              </button>
            )}
            <button
              type="button"
              onClick={() => onDisconnect(tk)}
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
            onClick={() => onConnect(tk)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 type-ui font-medium text-background transition-opacity hover:opacity-90"
          >
            <Plug className="h-3.5 w-3.5" />
            {state === "broken" || state === "pending" ? tc.reconnect : tc.connect}
          </button>
        )}
      </div>
    </div>
  );
}
