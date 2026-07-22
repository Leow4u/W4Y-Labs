/**
 * UsageFooter — credits cycle meter + session context occupancy below the
 * composer (BUG-NT-01 / Onda B2). Credits come ONLY from usage.account (never
 * invented numbers). Context from session.context_breakdown when a session is
 * live.
 */
import { useEffect, useState } from "react";

import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { creditBand, creditBandText } from "@/lib/credits";

type CycleMeter = {
  configured: boolean;
  used_percent: number | null;
  depleted: boolean;
};

export function UsageFooter({
  sessionActive,
  onContextBreakdown,
}: {
  /** A conversation is on screen (not the empty hero). */
  sessionActive: boolean;
  onContextBreakdown?: () => Promise<{
    context_percent?: number;
    context_used?: number;
    context_max?: number;
  } | null>;
}) {
  const { t } = useI18n();
  const [cycle, setCycle] = useState<CycleMeter | null>(null);
  const [ctxPct, setCtxPct] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    const fetchMeter = async () => {
      const { GatewayClient } = await import("@/lib/gatewayClient");
      const gw = new GatewayClient();
      try {
        await gw.connect();
        const res = await gw.request<CycleMeter>("usage.account", {});
        if (!cancelled) setCycle(res);
      } catch {
        if (!cancelled)
          setCycle({ configured: false, used_percent: null, depleted: false });
      } finally {
        gw.close();
      }
    };
    void fetchMeter();
    const iv = window.setInterval(() => void fetchMeter(), 60_000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, []);

  useEffect(() => {
    if (!sessionActive || !onContextBreakdown) {
      setCtxPct(null);
      return;
    }
    let cancelled = false;
    const poll = () => {
      void onContextBreakdown().then((r) => {
        if (!cancelled && r?.context_percent != null && r.context_percent > 0) {
          setCtxPct(r.context_percent);
        }
      });
    };
    poll();
    const iv = window.setInterval(poll, 15_000);
    return () => {
      cancelled = true;
      window.clearInterval(iv);
    };
  }, [sessionActive, onContextBreakdown]);

  const creditsPart = (() => {
    if (cycle === null) return null;
    if (cycle.depleted) return t.chat.usageFooterDepleted;
    if (cycle.configured && cycle.used_percent != null) {
      const remaining = Math.max(0, Math.round(100 - cycle.used_percent));
      return t.chat.usageFooterRemaining.replace("{pct}", String(remaining));
    }
    return t.chat.usageFooterUnavailable;
  })();

  const contextPart =
    ctxPct != null
      ? t.chat.usageFooterContext.replace("{pct}", String(Math.round(ctxPct)))
      : null;

  // Band color (50/75/90) for the credits part only — the meter goes from calm
  // to loud as the cycle depletes (D4). Context stays neutral.
  const creditsClass =
    cycle?.depleted
      ? "text-destructive"
      : cycle?.configured && cycle.used_percent != null
        ? creditBandText(creditBand(cycle.used_percent))
        : "text-text-tertiary";

  const parts = [creditsPart, contextPart].filter(Boolean) as string[];
  if (parts.length === 0) return null;

  return (
    <div
      className="flex items-center justify-center pt-2.5 type-caption tabular-nums text-text-tertiary"
      aria-live="polite"
    >
      {creditsPart && <span className={cn(creditsClass)}>{creditsPart}</span>}
      {creditsPart && contextPart && <span className="px-1">·</span>}
      {contextPart && <span>{contextPart}</span>}
    </div>
  );
}
