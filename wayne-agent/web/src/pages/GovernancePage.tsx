/**
 * GovernancePage — Governança (módulo Agentes, Onda 3): visão de dona(o) da
 * operação. Uma tabela da equipe com o que importa: modelo de cada agente,
 * custo 30d em CRÉDITOS (nunca US$ — regra de billing), sessões, rotinas e o
 * MODO DE APROVAÇÃO por agente (Human-in-the-Loop): Manual = pede sua
 * confirmação antes de ações sensíveis; Inteligente = só pede nas arriscadas.
 * Persistência: PUT /api/config?profile= deep-merge {approvals:{mode}} —
 * cada agente tem o próprio config.yaml (WAYNE_HOME isolado).
 */
import { useCallback, useEffect, useState } from "react";
import { Coins, ShieldCheck } from "lucide-react";

import { api } from "@/lib/api";
import { formatCredits, usdToCredits } from "@/lib/credits";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";

function prettify(name: string): string {
  const s = name.replace(/[-_]+/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}
function monogram(name: string): string {
  const parts = prettify(name).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return prettify(name).slice(0, 2).toUpperCase();
}

type ApprovalMode = "manual" | "smart";

interface GovRow {
  name: string;
  isDefault: boolean;
  model: string | null;
  credits30: number | null;
  sessions30: number | null;
  routines: number | null;
  approval: ApprovalMode | null;
}

export default function GovernancePage() {
  const { t } = useI18n();
  const ag = t.agents;
  const { toast, showToast } = useToast();
  const { setTitle } = usePageHeader();

  const [rows, setRows] = useState<GovRow[] | null>(null);
  const [savingMode, setSavingMode] = useState<string | null>(null);

  useEffect(() => {
    setTitle(ag.govTab);
    return () => setTitle(null);
  }, [setTitle, ag.govTab]);

  useEffect(() => {
    let dead = false;
    api
      .getProfiles()
      .then((r) => {
        if (dead) return;
        const base: GovRow[] = r.profiles.map((p) => ({
          name: p.name,
          isDefault: Boolean(p.is_default),
          model: null,
          credits30: null,
          sessions30: null,
          routines: null,
          approval: null,
        }));
        setRows(base);
        // Enriquecimento em paralelo, linha a linha (a tabela respira).
        for (const p of r.profiles) {
          void Promise.all([
            api.getModelInfo(p.name).catch(() => null),
            api.getAnalytics(30, p.name).catch(() => null),
            api.getCronJobs(p.name).catch(() => []),
            api.getConfig(p.name).catch(() => ({}) as Record<string, unknown>),
          ]).then(([model, usage, jobs, cfg]) => {
            if (dead) return;
            const usd = usage
              ? usage.totals.total_actual_cost > 0
                ? usage.totals.total_actual_cost
                : usage.totals.total_estimated_cost
              : 0;
            const approvals = (cfg as { approvals?: { mode?: string } }).approvals;
            const mode: ApprovalMode = approvals?.mode === "smart" ? "smart" : "manual";
            setRows((prev) =>
              (prev ?? []).map((row) =>
                row.name === p.name
                  ? {
                      ...row,
                      model: model?.model ?? null,
                      credits30: usage ? usdToCredits(usd) : 0,
                      sessions30: usage ? usage.totals.total_sessions : 0,
                      routines: jobs.length,
                      approval: mode,
                    }
                  : row,
              ),
            );
          });
        }
      })
      .catch((e) => showToast(`${t.status.error}: ${e}`, "error"));
    return () => {
      dead = true;
    };
  }, [showToast, t.status.error]);

  const setApproval = useCallback(
    async (name: string, mode: ApprovalMode) => {
      setSavingMode(name);
      try {
        // Deep-merge no config DO agente (config.set RPC é armadilha — sempre
        // PUT /api/config?profile=, o caminho validado nas Configurações).
        await api.saveConfig({ approvals: { mode } }, name);
        setRows((prev) =>
          (prev ?? []).map((r) => (r.name === name ? { ...r, approval: mode } : r)),
        );
        showToast(ag.govSaved, "success");
      } catch (e) {
        showToast(`${t.status.error}: ${e}`, "error");
      } finally {
        setSavingMode(null);
      }
    },
    [showToast, ag.govSaved, t.status.error],
  );

  const totalCredits = (rows ?? []).reduce((acc, r) => acc + (r.credits30 ?? 0), 0);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-4">
      <Toast toast={toast} />
      <p className="mb-1 max-w-3xl text-sm text-muted-foreground">{ag.govHint}</p>
      <p className="mb-5 flex items-center gap-1.5 type-micro text-muted-foreground">
        <ShieldCheck className="h-3.5 w-3.5 text-live" />
        {ag.govHitlNote}
      </p>

      {rows === null ? (
        <div className="py-16 text-center text-sm text-muted-foreground">…</div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-card">
          <table className="w-full min-w-[760px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-border text-left">
                <th className="px-4 py-3 type-caption font-medium text-muted-foreground">
                  {ag.teamTab}
                </th>
                <th className="px-4 py-3 type-caption font-medium text-muted-foreground">
                  {ag.qsModel}
                </th>
                <th className="px-4 py-3 text-right type-caption font-medium text-muted-foreground">
                  {ag.eqCost30d}
                </th>
                <th className="px-4 py-3 text-right type-caption font-medium text-muted-foreground">
                  {ag.eqSessions}
                </th>
                <th className="px-4 py-3 text-right type-caption font-medium text-muted-foreground">
                  {ag.govColRoutines}
                </th>
                <th className="px-4 py-3 type-caption font-medium text-muted-foreground">
                  {ag.govColApproval}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-xs font-semibold text-foreground">
                        {monogram(r.name)}
                      </span>
                      <span className="truncate font-medium text-foreground">
                        {prettify(r.name)}
                      </span>
                    </div>
                  </td>
                  <td className="max-w-[220px] truncate px-4 py-3 font-mono text-[12px] text-muted-foreground">
                    {r.model ? r.model : "…"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {r.credits30 != null ? formatCredits(r.credits30) : "…"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {r.sessions30 != null ? r.sessions30 : "…"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums text-foreground">
                    {r.routines != null ? r.routines : "…"}
                  </td>
                  <td className="px-4 py-3">
                    {r.approval === null ? (
                      <span className="text-muted-foreground">…</span>
                    ) : (
                      <div className="inline-flex rounded-lg border border-border p-0.5">
                        {(["manual", "smart"] as const).map((mode) => (
                          <button
                            key={mode}
                            type="button"
                            disabled={savingMode === r.name}
                            onClick={() => r.approval !== mode && void setApproval(r.name, mode)}
                            className={cn(
                              "rounded-md px-2.5 py-1 text-xs transition-colors",
                              r.approval === mode
                                ? "bg-foreground font-medium text-background"
                                : "text-muted-foreground hover:text-foreground",
                              savingMode === r.name && "opacity-60",
                            )}
                          >
                            {mode === "manual" ? ag.govManual : ag.govSmart}
                          </button>
                        ))}
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border bg-muted/40">
                <td className="px-4 py-3 type-caption font-medium text-muted-foreground">
                  {ag.govTotal}
                </td>
                <td />
                <td className="px-4 py-3 text-right">
                  <span className="inline-flex items-center gap-1.5 font-semibold tabular-nums text-foreground">
                    <Coins className="h-4 w-4 text-live" />
                    {formatCredits(totalCredits)}
                  </span>
                </td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
