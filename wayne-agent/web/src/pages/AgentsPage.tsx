/**
 * AgentsPage — the Team (Agents module): the living org chart of the AI
 * employees. Benchmark Google Cloud Agent Designer with Editorial curation:
 * React Flow canvas (main agent → team), each card with the operational pulse
 * (30d cost in credits + next routine). Clicking an agent opens its workflow
 * PAGE (AgentWorkflowPage, benchmark Stack AI) — the deep X-ray with
 * Triggers/Model/Skills/MCP/Channels/Results nodes.
 *
 * Product curation: instead of "profiles" (jargon: SOUL.md, gateway, MCP),
 * the user sees AGENTS. Reuses the /api/profiles + ?profile= endpoints 100%
 * (no new backend). The full admin page stays behind `?full=1`.
 * Submodules live in the sidebar dropdown (SidebarNavGroup) — no tabs.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

import { api } from "@/lib/api";
import type { ActiveProfileInfo, ProfileInfo } from "@/lib/api";
import { usdToCredits } from "@/lib/credits";
import { TeamCanvas, type TeamAgentCard } from "@/components/agents/TeamCanvas";
import { useScheduleText } from "@/hooks/useScheduleText";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { Button } from "@nous-research/ui/ui/components/button";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";

/** "redator-financeiro" → "Redator Financeiro" (display name). */
function prettify(name: string): string {
  const s = name.replace(/[-_]+/g, " ").trim();
  return s.replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Initials for the card's avatar. */
function monogram(name: string): string {
  const parts = prettify(name).split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return prettify(name).slice(0, 2).toUpperCase();
}

/** Operational pulse per agent, loaded in the background. */
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

  // Schedule as a localized human sentence (reuses the Cron screen's logic).
  const describeSchedule = useScheduleText();

  // Operational pulse (30d cost + routines) — in parallel, without blocking the canvas.
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
              nextRun: next ? describeSchedule(next.schedule, next.schedule_display ?? undefined) : null,
              routineCount: jobs.length,
            },
          }));
        });
      }
    },
    [describeSchedule],
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

  // "Novo agente" button in the header — the creation funnel is the quick start.
  useEffect(() => {
    setEnd(
      <Button size="sm" onClick={() => navigate("/profiles/quickstart")}>
        <Plus className="h-4 w-4" />
        {t.agents.newAgent}
      </Button>,
    );
    return () => setEnd(null);
  }, [setEnd, t.agents.newAgent, navigate]);

  // The Team shows the agents the user CREATED — nothing else.
  //
  // The "default" profile is not an agent: it IS the installation. Natively it's
  // the "default (pre-profile) WAYNE_HOME" (wayne_cli/profiles.py) — the account
  // root that owns the model, the skills, the MCP servers and the channels every
  // real agent inherits. list_profiles() only synthesizes a card for it so tools
  // have something to point at. Showing it here invited the user to edit or
  // delete the account's own foundation. It stays reachable in the internal
  // profiles admin (?full=1), where that's the point.
  const cards: TeamAgentCard[] = useMemo(
    () =>
      profiles
        .filter((p) => !p.is_default)
        .map((p) => ({
          name: p.name,
          displayName: prettify(p.name),
          monogram: monogram(p.name),
          specialty: p.description?.trim() ?? "",
          isActive: isActive(p),
          credits30: extras[p.name]?.credits30 ?? null,
          nextRun: extras[p.name]?.nextRun ?? null,
          routineCount: extras[p.name]?.routineCount ?? null,
        })),
    [profiles, extras, isActive],
  );

  // No didactic caption and no max-width: the screen IS the canvas (feedback
  // 10/07 — a professional system explains itself and uses the whole space). No
  // flex-1 on the holder: flex-basis 0% defeats the inline height on the flex axis.
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
