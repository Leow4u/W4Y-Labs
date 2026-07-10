/**
 * AgentQuickstartPage — "Início rápido" do módulo Agentes (Onda 1).
 * Benchmark: Claude Console (criar agente conversando + galeria de modelos),
 * mas com a NOSSA tese: nada de YAML — o rascunho volta como um FORMULÁRIO
 * em linguagem natural, editável, com [Criar este agente] [Continuar refinando].
 *
 * Tudo nativo: rascunho via sessão descartável no gateway (lib/agent-draft),
 * criação via POST /api/profiles (clone do default = herda .env/chave) +
 * PUT soul/description/model + rotina opcional no cron DO agente (?profile=).
 * Templates plug-and-play em lib/agent-templates (gating premium via
 * /planos/plan — mesma regra do TierPicker: plano desconhecido = liberado).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  ArrowUp,
  CalendarClock,
  Loader2,
  Lock,
  Plus,
  Sparkles,
  Trash2,
  Users,
  Zap,
} from "lucide-react";

import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { api } from "@/lib/api";
import { draftAgent, ROUTINE_PRESETS, type AgentDraft } from "@/lib/agent-draft";
import { AGENT_TEMPLATES } from "@/lib/agent-templates";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/** Espelha AgentsPage.slugify (wayne_cli/profiles.py::_PROFILE_ID_RE). */
function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

const inputCls =
  "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/50";

/** Sub-nav do módulo (Início rápido | Equipe) — compartilhada com AgentsPage. */
export function AgentsSubNav({ active }: { active: "quickstart" | "team" }) {
  const { t } = useI18n();
  const tabs = [
    { key: "quickstart" as const, to: "/profiles/quickstart", label: t.agents.quickTab, icon: Zap },
    { key: "team" as const, to: "/profiles", label: t.agents.teamTab, icon: Users },
  ];
  return (
    <div className="mb-6 flex gap-1 border-b border-border">
      {tabs.map(({ key, to, label, icon: Icon }) => (
        <Link
          key={key}
          to={to}
          className={cn(
            "-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 font-sans text-sm transition-colors",
            active === key
              ? "border-foreground font-semibold text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {label}
        </Link>
      ))}
    </div>
  );
}

type Phase = "idle" | "drafting" | "editing" | "creating";

export default function AgentQuickstartPage() {
  const { t } = useI18n();
  const ag = t.agents;
  const { toast, showToast } = useToast();
  const navigate = useNavigate();

  const [phase, setPhase] = useState<Phase>("idle");
  const [request, setRequest] = useState("");
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [error, setError] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineText, setRefineText] = useState("");
  const lastRequestRef = useRef("");

  // Plano do tenant (gating dos templates premium) — regra do TierPicker.
  const [plan, setPlan] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch("/planos/plan", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.plan) setPlan(String(d.plan));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);
  const premiumLocked = plan !== null && plan !== "pro" && plan !== "max";

  // Catálogo OpenRouter pro datalist do campo Modelo (todos os modelos —
  // decisão: agentes NÃO ficam presos aos tiers do chat).
  const [modelOptions, setModelOptions] = useState<string[]>([]);
  useEffect(() => {
    let cancelled = false;
    api
      .getModelOptions()
      .then((res) => {
        if (cancelled) return;
        const or = (res.providers ?? []).find((p) => p.slug === "openrouter");
        setModelOptions((or?.models ?? []).slice(0, 600));
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const generate = useCallback(
    async (req: string, current?: AgentDraft, refinement?: string) => {
      setPhase("drafting");
      setError(false);
      try {
        const d = await draftAgent(req, current, refinement);
        setDraft(d);
        setPhase("editing");
        setRefineOpen(false);
        setRefineText("");
      } catch {
        setError(true);
        setPhase(current ? "editing" : "idle");
      }
    },
    [],
  );

  const onSubmitRequest = useCallback(() => {
    const req = request.trim();
    if (!req || phase === "drafting") return;
    lastRequestRef.current = req;
    void generate(req);
  }, [request, phase, generate]);

  const patchDraft = (patch: Partial<AgentDraft>) =>
    setDraft((d) => (d ? { ...d, ...patch } : d));

  const create = useCallback(async () => {
    if (!draft || phase === "creating") return;
    const slug = slugify(draft.name);
    if (!slug) return;
    setPhase("creating");
    try {
      // Clone do default = herda .env (chave OpenRouter) — sem isso o agente
      // nasce sem acesso a modelo. Depois personaliza alma/descrição/modelo.
      await api.createProfile({ name: slug, clone_from: "default", description: draft.specialty });
      await api.updateProfileSoul(slug, draft.soul);
      if (draft.model) {
        await api.setProfileModel(slug, "openrouter", draft.model).catch(() => {});
      }
      if (draft.routine) {
        await api
          .createCronJob(
            {
              name: draft.name,
              prompt: draft.routine.prompt,
              schedule: ROUTINE_PRESETS[draft.routine.preset].expr,
            },
            slug,
          )
          .catch(() => {});
      }
      showToast(ag.qsCreated, "success");
      navigate("/profiles");
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
      setPhase("editing");
    }
  }, [draft, phase, showToast, ag.qsCreated, t.status.error, navigate]);

  const presetLabel: Record<keyof typeof ROUTINE_PRESETS, string> = {
    daily_9: ag.presetDaily9,
    weekdays_8: ag.presetWeekdays8,
    weekly_mon_9: ag.presetWeeklyMon9,
  };

  const initials = useMemo(() => {
    const parts = (draft?.name ?? "").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (draft?.name ?? "??").slice(0, 2).toUpperCase();
  }, [draft?.name]);

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <Toast toast={toast} />
      <div className="mx-auto w-full max-w-[1100px] px-4 py-8">
        <AgentsSubNav active="quickstart" />

        {/* ── Hero: descrever o agente (sempre visível no idle/drafting) ── */}
        {(phase === "idle" || phase === "drafting") && (
          <div className="mx-auto mt-6 w-full max-w-[720px]">
            <h1
              className="mb-2 text-center text-[2rem] font-medium tracking-tight text-foreground"
              style={{ fontFamily: "var(--theme-font-serif)", textWrap: "balance" }}
            >
              {ag.qsTitle}
            </h1>
            <p className="mb-7 text-center type-ui text-muted-foreground">{ag.qsHint}</p>

            <div className="rounded-[24px] border border-border bg-card p-3 shadow-card">
              <textarea
                value={request}
                onChange={(e) => setRequest(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    onSubmitRequest();
                  }
                }}
                placeholder={ag.qsPlaceholder}
                rows={2}
                disabled={phase === "drafting"}
                className="w-full resize-none bg-transparent px-2 pt-1 type-body text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
              />
              <div className="flex items-center justify-end pt-1">
                <button
                  type="button"
                  aria-label={ag.qsGenerate}
                  disabled={!request.trim() || phase === "drafting"}
                  onClick={onSubmitRequest}
                  className="grid h-9 w-9 place-items-center rounded-full bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-30"
                >
                  {phase === "drafting" ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <ArrowUp className="h-4 w-4" />
                  )}
                </button>
              </div>
            </div>

            {phase === "drafting" && (
              <p className="mt-4 text-center type-ui">
                <span className="text-shimmer font-medium">{ag.qsGenerating}</span>
              </p>
            )}
            {error && phase === "idle" && (
              <p className="mt-4 text-center type-ui text-destructive">
                {ag.qsError}{" "}
                <button
                  type="button"
                  className="underline underline-offset-2"
                  onClick={() => void generate(lastRequestRef.current || request)}
                >
                  {ag.qsRetry}
                </button>
              </p>
            )}
          </div>
        )}

        {/* ── Formulário editável (o "YAML" virou linguagem natural) ── */}
        {(phase === "editing" || phase === "creating") && draft && (
          <div className="mx-auto w-full max-w-[720px]">
            <div className="rounded-2xl border border-border bg-card p-6 shadow-card">
              <div className="mb-5 flex items-center gap-3">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-midground/10 font-mono text-sm font-semibold text-foreground/90">
                  {initials}
                </span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold text-foreground">{ag.qsReviewTitle}</h2>
                  <p className="type-caption text-muted-foreground">{ag.qsReviewHint}</p>
                </div>
              </div>

              <div className="flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{ag.qsName}</span>
                  <input
                    className={inputCls}
                    value={draft.name}
                    onChange={(e) => patchDraft({ name: e.target.value })}
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{ag.qsSpecialty}</span>
                  <input
                    className={inputCls}
                    value={draft.specialty}
                    onChange={(e) => patchDraft({ specialty: e.target.value })}
                  />
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{ag.qsModel}</span>
                  <span className="type-micro text-muted-foreground">{ag.qsModelHint}</span>
                  <input
                    className={cn(inputCls, "font-mono text-[13px]")}
                    list="qs-model-options"
                    value={draft.model}
                    onChange={(e) => patchDraft({ model: e.target.value })}
                  />
                  <datalist id="qs-model-options">
                    {modelOptions.map((m) => (
                      <option key={m} value={m} />
                    ))}
                  </datalist>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-medium">{ag.qsSoul}</span>
                  <textarea
                    className={cn(inputCls, "min-h-[160px] resize-y leading-relaxed")}
                    value={draft.soul}
                    onChange={(e) => patchDraft({ soul: e.target.value })}
                    spellCheck={false}
                  />
                </label>

                {/* Rotina — a agenda nativa do agente (cron ?profile). */}
                <div className="rounded-xl border border-border bg-background p-4">
                  <div className="flex items-center justify-between gap-3">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <CalendarClock className="h-4 w-4 text-live" />
                      {ag.qsRoutine}
                    </span>
                    {draft.routine ? (
                      <button
                        type="button"
                        onClick={() => patchDraft({ routine: null })}
                        className="flex items-center gap-1 type-caption text-muted-foreground transition-colors hover:text-destructive"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        {ag.qsRoutineRemove}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          patchDraft({
                            routine: { preset: "daily_9", prompt: "" },
                          })
                        }
                        className="flex items-center gap-1 type-caption text-foreground transition-colors hover:text-live"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {ag.qsRoutineAdd}
                      </button>
                    )}
                  </div>
                  <p className="mt-0.5 type-micro text-muted-foreground">{ag.qsRoutineHint}</p>
                  {draft.routine && (
                    <div className="mt-3 flex flex-col gap-3">
                      <div className="flex flex-wrap gap-2">
                        {(Object.keys(ROUTINE_PRESETS) as Array<keyof typeof ROUTINE_PRESETS>).map(
                          (k) => (
                            <button
                              key={k}
                              type="button"
                              onClick={() =>
                                patchDraft({ routine: { ...draft.routine!, preset: k } })
                              }
                              className={cn(
                                "rounded-lg border px-3 py-1.5 type-caption transition-colors",
                                draft.routine!.preset === k
                                  ? "border-current/60 bg-current/10 font-semibold text-foreground"
                                  : "border-border text-muted-foreground hover:bg-current/5",
                              )}
                            >
                              {presetLabel[k]}
                            </button>
                          ),
                        )}
                      </div>
                      <textarea
                        className={cn(inputCls, "min-h-[64px] resize-y")}
                        placeholder={ag.qsRoutinePrompt}
                        value={draft.routine.prompt}
                        onChange={(e) =>
                          patchDraft({ routine: { ...draft.routine!, prompt: e.target.value } })
                        }
                      />
                    </div>
                  )}
                </div>
              </div>

              {/* Ações — os 2 botões do benchmark. */}
              <div className="mt-6 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={phase === "creating" || !draft.name.trim()}
                  onClick={() => void create()}
                  className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  {phase === "creating" ? "…" : ag.qsCreate}
                </button>
                <button
                  type="button"
                  disabled={phase === "creating"}
                  onClick={() => setRefineOpen((v) => !v)}
                  className="rounded-lg border border-border px-4 py-2.5 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-40"
                >
                  {ag.qsRefine}
                </button>
                {error && <span className="type-caption text-destructive">{ag.qsError}</span>}
              </div>

              {refineOpen && (
                <div className="mt-3 flex items-end gap-2">
                  <textarea
                    className={cn(inputCls, "min-h-[44px] flex-1 resize-none")}
                    placeholder={ag.qsRefinePlaceholder}
                    value={refineText}
                    autoFocus
                    onChange={(e) => setRefineText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (refineText.trim())
                          void generate(lastRequestRef.current, draft, refineText.trim());
                      }
                    }}
                  />
                  <button
                    type="button"
                    aria-label={ag.qsGenerate}
                    disabled={!refineText.trim()}
                    onClick={() => void generate(lastRequestRef.current, draft, refineText.trim())}
                    className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-foreground text-background transition-opacity hover:opacity-90 disabled:opacity-30"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setDraft(null);
                setPhase("idle");
                setError(false);
              }}
              className="mt-3 type-caption text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              {ag.qsStartOver}
            </button>
          </div>
        )}

        {/* ── Templates plug-and-play (o diferencial) ── */}
        {(phase === "idle" || phase === "drafting") && (
          <div className="mx-auto mt-12 w-full max-w-[980px]">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                <Sparkles className="h-4 w-4 text-live" />
                {ag.templatesTitle}
              </h2>
              <span className="type-caption text-muted-foreground">{ag.templatesHint}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {AGENT_TEMPLATES.map((tpl) => {
                const locked = tpl.premium && premiumLocked;
                return (
                  <button
                    key={tpl.key}
                    type="button"
                    onClick={() => {
                      if (locked) {
                        window.location.href = "/planos?plan=pro";
                        return;
                      }
                      setDraft({ ...tpl.draft });
                      setPhase("editing");
                      setError(false);
                      lastRequestRef.current = tpl.draft.specialty;
                    }}
                    className={cn(
                      "group flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left shadow-card transition-all hover:border-foreground/30",
                      locked && "opacity-75",
                    )}
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-midground/10 text-lg">
                        {tpl.emoji}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                        {tpl.draft.name}
                      </span>
                      {locked && <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />}
                    </div>
                    <p className="line-clamp-2 type-caption leading-relaxed text-muted-foreground">
                      {tpl.draft.specialty}
                    </p>
                    <div className="mt-auto flex items-center gap-1.5 pt-1">
                      {tpl.recurring && (
                        <span className="flex items-center gap-1 rounded-md bg-live/10 px-1.5 py-px type-micro font-medium text-live">
                          <CalendarClock className="h-3 w-3" />
                          {ag.recurringBadge}
                        </span>
                      )}
                      {tpl.premium && (
                        <span className="rounded-md bg-muted px-1.5 py-px type-micro font-medium text-muted-foreground">
                          {locked ? ag.upgradeToUse : ag.premiumBadge}
                        </span>
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
