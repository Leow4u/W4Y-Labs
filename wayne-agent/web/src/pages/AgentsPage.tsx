/**
 * AgentsPage — a Equipe (módulo Agentes, Onda 2): o organograma vivo dos
 * funcionários de IA. Benchmark Google Cloud Agent Designer com curadoria
 * Editorial: canvas React Flow (agente principal → time), cada card com o
 * pulso operacional (custo 30d em créditos + próxima rotina); clicar abre o
 * raio-X (AgentDrawer) com Perfil/Agenda/Habilidades/Canais.
 *
 * Curadoria de produto: em vez de "perfis" (jargão: SOUL.md, gateway, MCP),
 * o usuário vê AGENTES. Reaproveita 100% os endpoints /api/profiles + ?profile=
 * (sem backend novo). A página admin completa continua atrás de `?full=1`.
 * Criar/editar agora vivem no Início rápido e no raio-X — o modal antigo saiu.
 *
 * Mapa de conceitos (interno → produto):
 *   profile.name        → id do agente (slug); exibido "bonito" (prettify)
 *   profile.description → Especialidade (frase curta)
 *   SOUL.md             → Instruções (como o agente se comporta)
 *   active profile      → o agente que o Wayne usa agora ("Em uso")
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus } from "lucide-react";

import { api } from "@/lib/api";
import type { ActiveProfileInfo, ProfileInfo } from "@/lib/api";
import { usdToCredits } from "@/lib/credits";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { TeamCanvas, type TeamAgentCard } from "@/components/agents/TeamCanvas";
import { AgentDrawer, type DrawerAgent } from "@/components/agents/AgentDrawer";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { useConfirmDelete } from "@nous-research/ui/hooks/use-confirm-delete";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { Button } from "@nous-research/ui/ui/components/button";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { AgentsSubNav } from "@/pages/AgentQuickstartPage";

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
  const [activating, setActivating] = useState<string | null>(null);
  const [extras, setExtras] = useState<Record<string, AgentExtras>>({});
  const [selected, setSelected] = useState<string | null>(null);

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

  // Pulso operacional (custo 30d + rotinas) — em paralelo, sem travar o canvas.
  const loadExtras = useCallback((names: string[]) => {
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
              ? next.schedule_display || next.schedule?.display || next.schedule?.expr || null
              : null,
            routineCount: jobs.length,
          },
        }));
      });
    }
  }, []);

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

  const activate = async (name: string) => {
    const p = profiles.find((x) => x.name === name);
    if (!p || isActive(p)) return;
    setActivating(name);
    try {
      const res = await api.setActiveProfile(name);
      setActive((prev) => ({
        active: res.active,
        current: prev?.current ?? res.active,
      }));
      showToast(`${t.agents.switched}: ${prettify(name)}`, "success");
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    } finally {
      setActivating(null);
    }
  };

  const agentDelete = useConfirmDelete<string>({
    onDelete: useCallback(
      async (name: string) => {
        try {
          await api.deleteProfile(name);
          showToast(`${t.agents.deleted}: ${prettify(name)}`, "success");
          setSelected(null);
          load();
        } catch (e) {
          showToast(`${t.status.error}: ${e}`, "error");
          throw e;
        }
      },
      [showToast, t.status.error, t.agents.deleted, load],
    ),
  });
  const pendingName = agentDelete.pendingId;
  const deleteMessage = pendingName
    ? t.agents.confirmDeleteMessage.replace("{name}", prettify(pendingName))
    : t.agents.confirmDeleteMessage;

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

  const drawerAgent: DrawerAgent | null = useMemo(() => {
    const c = cards.find((x) => x.name === selected);
    if (!c) return null;
    return {
      name: c.name,
      displayName: c.displayName,
      monogram: c.monogram,
      specialty: c.specialty,
      isActive: c.isActive,
      isDefault: c.isDefault,
    };
  }, [cards, selected]);

  return (
    <div className="mx-auto flex h-full w-full max-w-6xl flex-col px-4 py-4">
      {/* Sub-nav do módulo: Início rápido | Equipe. */}
      <AgentsSubNav active="team" />
      <p className="mb-4 max-w-2xl text-sm text-muted-foreground">{t.agents.eqCanvasHint}</p>

      {loading ? (
        <div className="py-16 text-center text-sm text-muted-foreground">…</div>
      ) : (
        <div className="min-h-[440px] flex-1" style={{ height: "calc(100dvh - 250px)" }}>
          <TeamCanvas
            agents={cards}
            onOpen={(name) => setSelected(name)}
            onAdd={() => navigate("/profiles/quickstart")}
          />
        </div>
      )}

      <Toast toast={toast} />

      <DeleteConfirmDialog
        open={agentDelete.isOpen}
        onCancel={agentDelete.cancel}
        onConfirm={agentDelete.confirm}
        title={t.agents.confirmDeleteTitle}
        description={deleteMessage}
        loading={agentDelete.isDeleting}
      />

      {drawerAgent && (
        <AgentDrawer
          agent={drawerAgent}
          onClose={() => setSelected(null)}
          onChanged={() => {
            load();
            loadExtras(profiles.map((p) => p.name));
          }}
          onActivate={(name) => void activate(name)}
          onRequestDelete={(name) => agentDelete.requestDelete(name)}
          activating={activating === drawerAgent.name}
          notify={(msg, kind) => showToast(msg, kind)}
        />
      )}
    </div>
  );
}
