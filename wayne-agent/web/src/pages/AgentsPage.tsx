/**
 * AgentsPage — a Equipe (módulo Agentes): o organograma vivo dos funcionários
 * de IA. Benchmark Google Cloud Agent Designer com curadoria Editorial:
 * canvas React Flow (agente principal → time), cada card com o pulso
 * operacional (custo 30d em créditos + próxima rotina). Clicar num agente
 * abre a PÁGINA de workflow dele (AgentWorkflowPage, benchmark Stack AI) —
 * o raio-X profundo com nós Gatilhos/Modelo/Habilidades/MCP/Canais/Resultados.
 *
 * Curadoria de produto: em vez de "perfis" (jargão: SOUL.md, gateway, MCP),
 * o usuário vê AGENTES. Reaproveita 100% os endpoints /api/profiles + ?profile=
 * (sem backend novo). A página admin completa continua atrás de `?full=1`.
 * Submódulos vivem no dropdown da sidebar (SidebarNavGroup) — sem abas.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

import { api } from "@/lib/api";
import type { ActiveProfileInfo, ProfileInfo } from "@/lib/api";
import { usdToCredits } from "@/lib/credits";
import { TeamCanvas, type TeamAgentCard } from "@/components/agents/TeamCanvas";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { Button } from "@nous-research/ui/ui/components/button";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";

/** "redator-financeiro" → "Redator Financeiro" (nome de exibição). */
function prettify(name: string): string {
  const s = name.replace(/[-_]+/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Iniciais para o avatar do card. */
function monogram(name: string): string {
  const parts = prettify(name).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return prettify(name).slice(0, 2).toUpperCase();
}

/** Pulso operacional por agente, carregado em segundo plano. */
interface AgentExtras {
  credits30: number;
  nextRun: string | null;
  routineCount: number;
}

export default function AgentsPage() {
  const { t } = useI18n();
  const { toast, showToast } = useToast();
  const { setEnd } = usePageHeader();
  const navigate = useNavigate();

  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  const [active, setActive] = useState<ActiveProfileInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [extras, setExtras] = useState<Record<string, AgentExtras>>({});

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.getProfiles(), api.getActiveProfile()])
      .then(([p, a]) => {
        setProfiles(p.profiles);
        setActive(a);
      })
      .catch((e) => showToast(`${t.status.error}: ${e}`, "error"))
      .finally(() => setLoading(false));
  }, [showToast, t.status.error]);

  useEffect(() => {
    load();
  }, [load]);

  // Cron cru na cara do usuário fere a curadoria: exprs dos presets → rótulo.
  const exprLabel: Record<string, string> = useMemo(
    () => ({
      "0 9 * * *": t.agents.presetDaily9,
      "0 8 * * 1-5": t.agents.presetWeekdays8,
      "0 9 * * 1": t.agents.presetWeeklyMon9,
    }),
    [t.agents.presetDaily9, t.agents.presetWeekdays8, t.agents.presetWeeklyMon9],
  );

  // Pulso operacional (custo 30d + rotinas) — em paralelo, sem travar o canvas.
  const loadExtras = useCallback(
    (names: string[]) => {
      for (const name of names) {
        void Promise.all([
          api.getAnalytics(30, name).catch(() => null),
          api.getCronJobs(name).catch(() => [] as Awaited<ReturnType<typeof api.getCronJobs>>),
        ]).then(([usage, jobs]) => {
          const usd = usage
            ? usage.totals.total_actual_cost > 0
              ? usage.totals.total_actual_cost
              : usage.totals.total_estimated_cost
            : 0;
          const enabled = jobs.filter((j) => j.enabled);
          const next = enabled[0] ?? jobs[0];
          setExtras((prev) => ({
            ...prev,
            [name]: {
              credits30: usdToCredits(usd),
              nextRun: next
                ? next.schedule_display ||
                  next.schedule?.display ||
                  exprLabel[next.schedule?.expr ?? ""] ||
                  next.schedule?.expr ||
                  null
                : null,
              routineCount: jobs.length,
            },
          }));
        });
      }
    },
    [exprLabel],
  );

  useEffect(() => {
    if (profiles.length) loadExtras(profiles.map((p) => p.name));
  }, [profiles, loadExtras]);

  const activeName = active?.active || "default";
  const isActive = useCallback(
    (p: ProfileInfo) =>
      p.name === activeName ||
      (p.is_default && (activeName === "default" || activeName === "")),
    [activeName],
  );

  // Botão "Novo agente" no header — o funil de criação é o Início rápido.
  useEffect(() => {
    setEnd(
      <Button size="sm" onClick={() => navigate("/profiles/quickstart")}>
        <Plus className="h-4 w-4" />
        {t.agents.newAgent}
      </Button>,
    );
    return () => setEnd(null);
  }, [setEnd, t.agents.newAgent, navigate]);

  const cards: TeamAgentCard[] = useMemo(
    () =>
      profiles.map((p) => ({
        name: p.name,
        displayName: prettify(p.name),
        monogram: monogram(p.name),
        specialty: p.description?.trim() ?? "",
        isActive: isActive(p),
        isDefault: Boolean(p.is_default),
        credits30: extras[p.name]?.credits30 ?? null,
        nextRun: extras[p.name]?.nextRun ?? null,
        routineCount: extras[p.name]?.routineCount ?? null,
      })),
    [profiles, extras, isActive],
  );

  // Sem legenda didática e sem max-width: a tela É o canvas (feedback 10/07 —
  // sistema profissional se explica sozinho e usa o espaço todo). Sem flex-1
  // no holder: flex-basis 0% derrota o height inline no eixo do flex.
  return (
    <div className="w-full px-3 py-3">
      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">…</div>
      ) : (
        <div className="min-h-[440px]" style={{ height: "calc(100dvh - 104px)" }}>
          <TeamCanvas
            agents={cards}
            onOpen={(name) => navigate(`/profiles/agent?name=${encodeURIComponent(name)}`)}
            onAdd={() => navigate("/profiles/quickstart")}
          />
        </div>
      )}

      <Toast toast={toast} />
    </div>
  );
}
