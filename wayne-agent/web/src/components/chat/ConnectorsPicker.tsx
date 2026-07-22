/**
 * ConnectorsPicker — the composer's "Conectores" control (hero mockup 19/07):
 * the logos of the user's connected apps + label, and a popover listing each
 * connected toolkit with an on/off switch scoped to THIS session only.
 *
 * OFF is enforced at the engine's MCP call door (tools/mcp_tool.py via
 * config.set key=connectors.disabled scope=session) — a hard gate, not a
 * prompt suggestion. The control hides entirely when the scope has no
 * connected apps: the screen never promises toggles for connectors that
 * don't exist (connecting new apps lives in Plugins).
 */
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";

import { api } from "@/lib/api";
import type { ConnectorToolkit } from "@/lib/api";
import { accountGetJson } from "@/lib/accountApi";
import { useI18n } from "@/i18n";
import { useMenuDismiss } from "@/hooks/useMenuDismiss";
import { LogoTile } from "@/components/connectors/ConnectorCard";
import { cn } from "@/lib/utils";

const MENU_KEY = "composer-connectors";

/** Minimal toolkit shape for slugs the catalog doesn't resolve (rare). */
function fallbackToolkit(slug: string): ConnectorToolkit {
  return {
    slug,
    name: slug.charAt(0).toUpperCase() + slug.slice(1),
    description: "",
    logo: null,
    categories: [],
    no_auth: false,
    managed_auth: false,
    auth_schemes: [],
    tools_count: null,
    triggers_count: null,
  };
}

export function ConnectorsPicker({
  disabled,
  onChange,
}: {
  /** Toolkit slugs (lowercase) switched OFF for this session. */
  disabled: string[];
  onChange: (slugs: string[]) => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  // null = still loading (render nothing yet — no flicker), [] = none connected.
  const [connected, setConnected] = useState<ConnectorToolkit[] | null>(null);
  useMenuDismiss(open, () => setOpen(false), MENU_KEY);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // Account surface: when the desktop is logged in, list the CONTA's
        // connectors (cloud), not the local worker's copy — single brain.
        const status = await accountGetJson<{
          accounts: { status?: string; toolkit?: string }[];
        }>("/api/connectors/status?scope=global", 8000);
        if (!alive) return;
        if (!status) {
          // Fall back to local worker so a signed-out desktop still works.
          const local = await api.getConnectorsStatus("global").catch(() => null);
          if (!alive) return;
          if (!local) {
            setConnected([]);
            return;
          }
          const localSlugs = [
            ...new Set(
              local.accounts
                .filter((a) => a.status === "ACTIVE")
                .map((a) => (a.toolkit || "").toLowerCase())
                .filter(Boolean),
            ),
          ];
          if (localSlugs.length === 0) {
            setConnected([]);
            return;
          }
          const catalog = await api.getConnectorsCatalog().catch(() => null);
          if (!alive) return;
          const bySlug = new Map(
            (catalog?.toolkits ?? []).map((tk) => [tk.slug.toLowerCase(), tk]),
          );
          setConnected(localSlugs.map((slug) => bySlug.get(slug) ?? fallbackToolkit(slug)));
          return;
        }
        const slugs = [
          ...new Set(
            status.accounts
              .filter((a) => a.status === "ACTIVE")
              .map((a) => (a.toolkit || "").toLowerCase())
              .filter(Boolean),
          ),
        ];
        if (slugs.length === 0) {
          setConnected([]);
          return;
        }
        const catalog = await accountGetJson<{ toolkits: ConnectorToolkit[] }>(
          "/api/connectors/catalog",
          8000,
        );
        if (!alive) return;
        const bySlug = new Map(
          (catalog?.toolkits ?? []).map((tk) => [tk.slug.toLowerCase(), tk]),
        );
        setConnected(slugs.map((slug) => bySlug.get(slug) ?? fallbackToolkit(slug)));
      } catch {
        if (alive) setConnected([]);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!connected || connected.length === 0) return null;

  const off = new Set(disabled.map((s) => s.toLowerCase()));
  const enabledToolkits = connected.filter((tk) => !off.has(tk.slug.toLowerCase()));

  const toggle = (slug: string) => {
    const key = slug.toLowerCase();
    const next = new Set(off);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    onChange([...next].sort());
  };

  return (
    <div className="relative">
      <button
        type="button"
        data-menu-trigger={MENU_KEY}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={t.chat.connectorsSession}
        className="flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 type-caption font-medium text-foreground shadow-card transition-colors hover:border-foreground/25"
      >
        {/* Logos of the toolkits still ON for this session (mockup: the icons
            sit before the label). All off → the label alone tells the story. */}
        {enabledToolkits.length > 0 && (
          <span className="flex items-center -space-x-1">
            {enabledToolkits.slice(0, 3).map((tk) => (
              <LogoTile
                key={tk.slug}
                toolkit={tk}
                className="h-[18px] w-[18px] rounded-full border border-border p-px text-xs"
              />
            ))}
          </span>
        )}
        <span className="max-w-[10rem] truncate">{t.chat.connectorsLabel}</span>
        <ChevronDown className="h-3 w-3 text-text-tertiary" />
      </button>

      {open && (
        <div
          data-menu-root={MENU_KEY}
          className="absolute bottom-full left-0 z-50 mb-2 w-72 rounded-2xl border border-border bg-card p-1.5 shadow-pop"
        >
          <div className="px-2.5 pb-1 pt-1.5 type-micro font-medium uppercase tracking-[0.06em] text-text-tertiary">
            {t.chat.connectorsSession}
          </div>
          {connected.map((tk) => {
            const isOn = !off.has(tk.slug.toLowerCase());
            return (
              <div
                key={tk.slug}
                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2"
              >
                <LogoTile toolkit={tk} className="h-6 w-6 rounded-md text-xs" />
                <span
                  className={cn(
                    "min-w-0 flex-1 truncate type-ui font-medium",
                    isOn ? "text-foreground" : "text-muted-foreground",
                  )}
                >
                  {tk.name}
                </span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={isOn}
                  aria-label={tk.name}
                  onClick={() => toggle(tk.slug)}
                  className={cn(
                    "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors",
                    isOn ? "bg-live" : "bg-muted",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform",
                      isOn ? "translate-x-[18px]" : "translate-x-[3px]",
                    )}
                  />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
