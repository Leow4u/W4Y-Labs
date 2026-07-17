/**
 * ConnectorEventsPanel — turns EVENTS (triggers) on/off for an already
 * connected connector (Conectores Onda 4). An active trigger makes Composio
 * deliver the event to our webhook; each event becomes a task for the scope's
 * agent.
 *
 * Modal overlay over a toolkit: lists the app's trigger types, each with a
 * switch; the already active ones come toggled on. No captions — the trigger
 * itself (name + short description) explains it.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, X, Zap } from "lucide-react";

import { api } from "@/lib/api";
import type { ConnectorTrigger, ConnectorTriggerType } from "@/lib/api";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

export function ConnectorEventsPanel({
  toolkit,
  toolkitName,
  scope,
  onClose,
  onToast,
}: {
  toolkit: string;
  toolkitName: string;
  scope: string;
  onClose: () => void;
  onToast: (msg: string, kind: "success" | "error") => void;
}) {
  const { t } = useI18n();
  const tc = t.connectors;
  const [types, setTypes] = useState<ConnectorTriggerType[]>([]);
  const [active, setActive] = useState<ConnectorTrigger[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    Promise.all([
      api.getConnectorTriggerTypes(toolkit).catch(() => ({ types: [] })),
      api.getConnectorTriggers(scope).catch(() => ({ triggers: [] })),
    ])
      .then(([ty, tr]) => {
        if (!aliveRef.current) return;
        setTypes(ty.types);
        setActive(tr.triggers);
      })
      .finally(() => aliveRef.current && setLoading(false));
    return () => {
      aliveRef.current = false;
    };
  }, [toolkit, scope]);

  // A trigger type is on if there is an active one with the same slug (case-insensitive).
  const activeBySlug = useMemo(() => {
    const m = new Map<string, ConnectorTrigger>();
    for (const a of active) m.set((a.trigger || "").toUpperCase(), a);
    return m;
  }, [active]);

  const toggle = async (ty: ConnectorTriggerType, on: boolean) => {
    setBusy(ty.slug);
    try {
      if (on) {
        const res = await api.createConnectorTrigger(ty.slug, scope);
        setActive((prev) => [
          ...prev,
          { id: res.id || ty.slug, trigger: ty.slug, toolkit, disabled: false },
        ]);
        onToast(tc.eventOn.replace("{name}", ty.name), "success");
      } else {
        const found = activeBySlug.get(ty.slug.toUpperCase());
        if (found?.id) await api.deleteConnectorTrigger(found.id);
        setActive((prev) =>
          prev.filter((a) => (a.trigger || "").toUpperCase() !== ty.slug.toUpperCase()),
        );
        onToast(tc.eventOff.replace("{name}", ty.name), "success");
      }
    } catch (e) {
      onToast(`${e}`, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4 font-sans"
      onClick={onClose}
    >
      <div
        className="flex max-h-[80vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-pop"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-3.5">
          <span className="flex items-center gap-2 type-h4 text-foreground">
            <Zap className="h-4 w-4 text-primary" />
            {tc.eventsTitle.replace("{name}", toolkitName)}
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label={t.common?.close ?? "Close"}
            className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Spinner className="text-xl text-primary" />
            </div>
          ) : types.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              {tc.noEvents}
            </div>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {types.map((ty) => {
                const on = activeBySlug.has(ty.slug.toUpperCase());
                const isBusy = busy === ty.slug;
                return (
                  <li key={ty.slug} className="flex items-start gap-3 py-3">
                    <span className="min-w-0 flex-1">
                      <span className="block type-body font-medium text-foreground">
                        {ty.name}
                      </span>
                      {ty.description && (
                        <span className="mt-0.5 block type-caption leading-relaxed text-muted-foreground">
                          {ty.description}
                        </span>
                      )}
                    </span>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      disabled={isBusy}
                      onClick={() => void toggle(ty, !on)}
                      className={cn(
                        "relative mt-0.5 inline-flex h-6 w-10 shrink-0 items-center rounded-full transition-colors disabled:opacity-60",
                        on ? "bg-live" : "bg-muted",
                      )}
                    >
                      {isBusy ? (
                        <Loader2 className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-background" />
                      ) : (
                        <span
                          className={cn(
                            "inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform",
                            on ? "translate-x-5" : "translate-x-1",
                          )}
                        />
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 type-caption text-muted-foreground">
          {tc.eventsFootnote}
        </div>
      </div>
    </div>
  );
}
