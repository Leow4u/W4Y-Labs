/**
 * AgentQuickstartPage — the Agents module's "Início rápido" (Onda 1 + the
 * 10/07 UX rework). Benchmark: Claude Console → Managed Agents → Quickstart,
 * with the finish Leonardo asked for: stepper at the top, question in the
 * CENTER of the screen, composer anchored at the bottom and the ready-made
 * templates in an expandable RIGHT PANEL (no longer a grid that crushes the
 * screen). Submodules became a sidebar dropdown (App.tsx SidebarNavGroup) —
 * no internal tabs.
 *
 * Create by TALKING, but returning NATURAL LANGUAGE in editable fields (never
 * YAML): describe it in one sentence → LLM draft (lib/agent-draft, throwaway
 * session) → Name/Specialty/Model (ALL of OpenRouter)/Instructions/Routine
 * form → "Criar este agente" | "Continuar refinando".
 * Templates = plug-and-play presets with Pro gating (mid-tier plan).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  ArrowUp,
  CalendarClock,
  Check,
  Loader2,
  Lock,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";

import { api } from "@/lib/api";
import { ModelCatalogPicker } from "@/components/agents/ModelCatalogPicker";
import { draftAgent, defaultRoutineSchedule } from "@/lib/agent-draft";
import type { AgentDraft, AgentRoutineDraft } from "@/lib/agent-draft";
import { AGENT_TEMPLATES } from "@/lib/agent-templates";
import { AgentSchedulePicker } from "@/components/agents/AgentSchedulePicker";
import { buildScheduleString } from "@/lib/schedule";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";

/** "Redator Financeiro" → "redator-financeiro" (valid profile id). */
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

const TPL_PANEL_KEY = "w4y-qs-templates";

type Phase = "idle" | "drafting" | "editing" | "creating";

export default function AgentQuickstartPage() {
  const { t } = useI18n();
  const ag = t.agents;
  const { toast, showToast } = useToast();
  const navigate = useNavigate();
  const { setTitle } = usePageHeader();

  const [phase, setPhase] = useState<Phase>("idle");
  const [request, setRequest] = useState("");
  const [draft, setDraft] = useState<AgentDraft | null>(null);
  const [error, setError] = useState(false);
  const [refineOpen, setRefineOpen] = useState(false);
  const [refineText, setRefineText] = useState("");
  const lastRequestRef = useRef("");

  // Right panel of ready-made templates (expandable, persists the choice).
  const [tplOpen, setTplOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TPL_PANEL_KEY) !== "0";
    } catch {
      return true;
    }
  });
  const toggleTpl = () =>
    setTplOpen((v) => {
      const next = !v;
      try {
        localStorage.setItem(TPL_PANEL_KEY, next ? "1" : "0");
      } catch {
        /* best effort */
      }
      return next;
    });
  const [tplQuery, setTplQuery] = useState("");

  // Pretty title in the page header ("Início rápido", not the raw path).
  useEffect(() => {
    setTitle(ag.quickTab);
    return () => setTitle(null);
  }, [setTitle, ag.quickTab]);

  // Tenant plan (gating for the premium templates) — TierPicker's rule.
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

  // The model OUR technology picked for THIS need (the draft LLM's choice,
  // or the template's curated model) — the picker's single "Recomendado".
  const [recommendedModel, setRecommendedModel] = useState<string | null>(null);

  const generate = useCallback(
    async (req: string, current?: AgentDraft, refinement?: string) => {
      setPhase("drafting");
      setError(false);
      try {
        const d = await draftAgent(req, current, refinement);
        setDraft(d);
        setRecommendedModel(d.model || null);
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

  // The agent's routines (several — different contexts).
  const addRoutine = () =>
    setDraft((d) =>
      d
        ? { ...d, routines: [...d.routines, { schedule: defaultRoutineSchedule(), prompt: "" }] }
        : d,
    );
  const updateRoutine = (i: number, patch: Partial<AgentRoutineDraft>) =>
    setDraft((d) =>
      d ? { ...d, routines: d.routines.map((r, idx) => (idx === i ? { ...r, ...patch } : r)) } : d,
    );
  const removeRoutine = (i: number) =>
    setDraft((d) => (d ? { ...d, routines: d.routines.filter((_, idx) => idx !== i) } : d));

  const create = useCallback(async () => {
    if (!draft || phase === "creating") return;
    const slug = slugify(draft.name);
    if (!slug) return;
    setPhase("creating");
    try {
      // Cloning default = inherits .env (OpenRouter key) — without this the
      // agent is born with no model access. Then customize soul/description/model.
      await api.createProfile({ name: slug, clone_from: "default", description: draft.specialty });
      await api.updateProfileSoul(slug, draft.soul);
      if (draft.model) {
        await api.setProfileModel(slug, "openrouter", draft.model).catch(() => {});
      }
      // Squad template: the agent is born with area + named subagent roles
      // (team.json sidecar) — the delegate crew it commands from day one.
      if (draft.team) {
        await api.updateProfileTeam(slug, draft.team).catch(() => {});
      }
      // One routine = its own cron job (different contexts).
      for (const r of draft.routines) {
        const schedule = buildScheduleString(r.schedule);
        if (schedule && r.prompt.trim()) {
          await api
            .createCronJob({ name: draft.name, prompt: r.prompt.trim(), schedule }, slug)
            .catch(() => {});
        }
      }
      showToast(ag.qsCreated, "success");
      navigate("/profiles");
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
      setPhase("editing");
    }
  }, [draft, phase, showToast, ag.qsCreated, t.status.error, navigate]);

  const initials = useMemo(() => {
    const parts = (draft?.name ?? "").split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return (draft?.name ?? "??").slice(0, 2).toUpperCase();
  }, [draft?.name]);

  // Top stepper (Claude benchmark, in product language).
  const step: 1 | 2 | 3 = phase === "editing" ? 2 : phase === "creating" ? 3 : 1;
  const steps = [ag.stepDescribe, ag.stepReview, ag.stepJoin];

  const filteredTemplates = useMemo(() => {
    const q = tplQuery.trim().toLowerCase();
    if (!q) return AGENT_TEMPLATES;
    return AGENT_TEMPLATES.filter(
      (tpl) =>
        tpl.draft.name.toLowerCase().includes(q) ||
        tpl.draft.specialty.toLowerCase().includes(q),
    );
  }, [tplQuery]);

  const showTplPanel = phase === "idle" || phase === "drafting";

  return (
    // EXPLICIT height (AgentsPage pattern): the routes wrapper is a block
    // (`w-full pb-8`), so `flex-1` here doesn't stretch — without this the
    // center column collapsed to the content's height and the hero lost its
    // centering when the templates panel was collapsed. `relative` anchors the
    // collapsed panel's handle to the right edge.
    <div className="relative flex h-[calc(100dvh-112px)] min-h-[480px] flex-col overflow-hidden lg:flex-row">
      <Toast toast={toast} />

      {/* ─────────── Center column ─────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Stepper (1 Descrever · 2 Revisar · 3 Entra pro time). */}
        <div className="flex items-center justify-center gap-0 px-6 pb-2 pt-6">
          {steps.map((label, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div key={label} className="flex items-center">
                <div className="flex items-center gap-2">
                  <span
                    className={cn(
                      "grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold transition-colors",
                      done || active
                        ? "bg-foreground text-background"
                        : "border border-border text-muted-foreground",
                    )}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : n}
                  </span>
                  <span
                    className={cn(
                      "font-sans text-sm transition-colors",
                      active ? "font-medium text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {label}
                  </span>
                </div>
                {n < steps.length && <span className="mx-4 h-px w-10 bg-border" />}
              </div>
            );
          })}
        </div>

        {(phase === "idle" || phase === "drafting") && (
          <>
            {/* Question in the CENTER of the screen (Claude pattern). */}
            <div className="grid min-h-0 flex-1 content-center px-6">
              <div className="mx-auto w-full max-w-[640px] text-center">
                {/* Title only — the example lives in the composer's placeholder
                    (10/07 feedback: caption + example = childish redundancy). */}
                <h1
                  className="mb-2 text-[2.1rem] font-medium tracking-tight text-foreground"
                  style={{ fontFamily: "var(--theme-font-serif)", textWrap: "balance" }}
                >
                  {ag.qsTitle}
                </h1>
                {phase === "drafting" && (
                  <p className="mt-5 type-ui">
                    <span className="text-shimmer font-medium">{ag.qsGenerating}</span>
                  </p>
                )}
                {error && phase === "idle" && (
                  <p className="mt-5 type-ui text-destructive">
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
            </div>

            {/* Composer anchored at the bottom of the column (Claude pattern). */}
            <div className="px-6 pb-7 pt-3">
              <div className="mx-auto w-full max-w-[720px] rounded-[24px] border border-border bg-card p-3 shadow-card">
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
            </div>
          </>
        )}

        {/* ── Editable form (the "YAML" became natural language) ── */}
        {(phase === "editing" || phase === "creating") && draft && (
          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
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

                  <div className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">{ag.qsModel}</span>
                    {/* SAME picker as everywhere else (drawer/studio):
                        commercial names, providers first, whole vetted
                        catalog in the search. The draft LLM's pick for THIS
                        need surfaces as the single "Recomendado". */}
                    <ModelCatalogPicker
                      value={draft.model}
                      onSelect={(m) => patchDraft({ model: m })}
                      recommendedModel={recommendedModel}
                    />
                  </div>

                  <label className="flex flex-col gap-1.5">
                    <span className="text-sm font-medium">{ag.qsSoul}</span>
                    <textarea
                      className={cn(inputCls, "min-h-[160px] resize-y leading-relaxed")}
                      value={draft.soul}
                      onChange={(e) => patchDraft({ soul: e.target.value })}
                      spellCheck={false}
                    />
                  </label>

                  {/* Routines — the agent's native schedule(s) (cron ?profile).
                      Several allowed: different contexts/times. */}
                  <div className="rounded-xl border border-border bg-background p-4">
                    <span className="flex items-center gap-2 text-sm font-medium">
                      <CalendarClock className="h-4 w-4 text-live" />
                      {ag.qsRoutine}
                    </span>

                    {draft.routines.length > 0 && (
                      <div className="mt-3 flex flex-col gap-2.5">
                        {draft.routines.map((r, i) => (
                          <div
                            key={i}
                            className="relative rounded-lg border border-border bg-card p-3"
                          >
                            <button
                              type="button"
                              onClick={() => removeRoutine(i)}
                              aria-label={ag.qsRoutineRemove}
                              className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:text-destructive"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                            <div className="pr-6">
                              <AgentSchedulePicker
                                value={r.schedule}
                                onChange={(schedule) => updateRoutine(i, { schedule })}
                              />
                            </div>
                            <textarea
                              className={cn(inputCls, "mt-2 w-full min-h-[56px] resize-y")}
                              placeholder={ag.qsRoutinePrompt}
                              value={r.prompt}
                              onChange={(e) => updateRoutine(i, { prompt: e.target.value })}
                            />
                          </div>
                        ))}
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={addRoutine}
                      className="mt-3 flex items-center gap-1 type-caption text-foreground transition-colors hover:text-live"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {ag.qsRoutineAdd}
                    </button>
                  </div>
                </div>

                {/* Actions — the benchmark's 2 buttons. */}
                <div className="mt-6 flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={phase === "creating" || !draft.name.trim()}
                    onClick={() => void create()}
                    className="rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition-opacity hover:opacity-90 disabled:opacity-40"
                  >
                    {phase === "creating" ? "…" : ag.qsAddToTeam}
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
          </div>
        )}
      </div>

      {/* ─────────── Right panel: ready-made templates (expandable) ─────────── */}
      {showTplPanel &&
        (tplOpen ? (
          <aside className="relative flex min-h-0 w-full shrink-0 flex-col border-t border-border lg:w-[400px] lg:border-l lg:border-t-0">
            {/* Handle on the edge (Claude pattern) — click collapses. No button. */}
            <button
              type="button"
              onClick={toggleTpl}
              aria-label={ag.tplCollapse}
              title={ag.tplCollapse}
              className="group absolute -left-2 top-1/2 z-10 hidden h-16 w-4 -translate-y-1/2 cursor-pointer items-center justify-center lg:flex"
            >
              <span className="h-9 w-1 rounded-full bg-border transition-all duration-150 group-hover:h-12 group-hover:w-1.5 group-hover:bg-foreground/40" />
            </button>

            <div className="flex items-center gap-2 px-5 pb-3 pt-5">
              <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold text-foreground">
                <Sparkles className="h-4 w-4 shrink-0 text-live" />
                <span className="truncate">{ag.templatesTitle}</span>
              </h2>
            </div>

            <div className="px-5 pb-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={tplQuery}
                  onChange={(e) => setTplQuery(e.target.value)}
                  placeholder={ag.tplSearch}
                  className={cn(inputCls, "pl-9")}
                />
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-6">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
                {filteredTemplates.map((tpl) => {
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
                        setRecommendedModel(tpl.draft.model || null);
                        setPhase("editing");
                        setError(false);
                        lastRequestRef.current = tpl.draft.specialty;
                      }}
                      className={cn(
                        "group flex min-w-0 flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-left shadow-card transition-all hover:border-foreground/30",
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
                {filteredTemplates.length === 0 && (
                  <p className="col-span-full py-6 text-center type-caption text-muted-foreground">
                    —
                  </p>
                )}
              </div>
            </div>
          </aside>
        ) : (
          /* Collapsed: just the handle against the right edge — click expands. */
          <button
            type="button"
            onClick={toggleTpl}
            aria-label={ag.tplExpand}
            title={ag.tplExpand}
            className="group absolute right-0 top-1/2 z-10 hidden h-16 w-4 -translate-y-1/2 cursor-pointer items-center justify-center lg:flex"
          >
            <span className="h-9 w-1 rounded-full bg-border transition-all duration-150 group-hover:h-12 group-hover:w-1.5 group-hover:bg-foreground/40" />
          </button>
        ))}
    </div>
  );
}
