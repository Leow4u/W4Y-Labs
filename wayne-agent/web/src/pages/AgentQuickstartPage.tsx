/**
 * AgentQuickstartPage — "Início rápido" do módulo Agentes (Onda 1 + reforma
 * UX 10/07). Benchmark: Claude Console → Agentes Gerenciados → Início rápido,
 * com o acabamento pedido pelo Leonardo: stepper no topo, pergunta no CENTRO
 * da tela, composer ancorado na base e os modelos prontos num PAINEL DIREITO
 * expansível (não mais um grid que esmaga a tela). Submódulos viraram
 * dropdown na sidebar (App.tsx SidebarNavGroup) — sem abas internas.
 *
 * Criar CONVERSANDO, mas devolvendo LINGUAGEM NATURAL em campos editáveis
 * (nunca YAML): descreva em uma frase → draft LLM (lib/agent-draft, sessão
 * descartável) → formulário Nome/Especialidade/Modelo (TODOS os OpenRouter)/
 * Instruções/Rotina → "Criar este agente" | "Continuar refinando".
 * Templates = presets plug-and-play com gating Pro (plano intermediário).
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
import { draftAgent, defaultRoutineSchedule } from "@/lib/agent-draft";
import type { AgentDraft } from "@/lib/agent-draft";
import { AGENT_TEMPLATES } from "@/lib/agent-templates";
import { AgentSchedulePicker } from "@/components/agents/AgentSchedulePicker";
import { buildScheduleString } from "@/lib/schedule";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { cn } from "@/lib/utils";

/** "Redator Financeiro" → "redator-financeiro" (id válido de profile). */
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

  // Painel direito de modelos prontos (expansível, persiste a escolha).
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
        /* melhor esforço */
      }
      return next;
    });
  const [tplQuery, setTplQuery] = useState("");

  // Título bonito no header da página ("Início rápido", não o path cru).
  useEffect(() => {
    setTitle(ag.quickTab);
    return () => setTitle(null);
  }, [setTitle, ag.quickTab]);

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
        const schedule = buildScheduleString(draft.routine.schedule);
        if (schedule) {
          await api
            .createCronJob({ name: draft.name, prompt: draft.routine.prompt, schedule }, slug)
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

  // Passo a passo do topo (benchmark Claude, em linguagem de produto).
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
    // Altura EXPLÍCITA (padrão AgentsPage): o wrapper das rotas é um block
    // (`w-full pb-8`), então `flex-1` aqui não estica — sem isto a coluna
    // central colapsava na altura do conteúdo e o hero perdia a centralização
    // quando o painel de modelos era recolhido. `relative` ancora o handle
    // do painel recolhido na borda direita.
    <div className="relative flex h-[calc(100dvh-112px)] min-h-[480px] flex-col overflow-hidden lg:flex-row">
      <Toast toast={toast} />

      {/* ─────────── Coluna central ─────────── */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Passo a passo (1 Descrever · 2 Revisar · 3 Entra pro time). */}
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
            {/* Pergunta no CENTRO da tela (padrão Claude). */}
            <div className="grid min-h-0 flex-1 content-center px-6">
              <div className="mx-auto w-full max-w-[640px] text-center">
                {/* Só o título — o exemplo vive no placeholder do composer
                    (feedback 10/07: legenda + exemplo = redundância infantil). */}
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

            {/* Composer ancorado na base da coluna (padrão Claude). */}
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

        {/* ── Formulário editável (o "YAML" virou linguagem natural) ── */}
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
                              routine: { schedule: defaultRoutineSchedule(), prompt: "" },
                            })
                          }
                          className="flex items-center gap-1 type-caption text-foreground transition-colors hover:text-live"
                        >
                          <Plus className="h-3.5 w-3.5" />
                          {ag.qsRoutineAdd}
                        </button>
                      )}
                    </div>
                    {draft.routine && (
                      <div className="mt-3 flex flex-col gap-3">
                        <AgentSchedulePicker
                          value={draft.routine.schedule}
                          onChange={(schedule) =>
                            patchDraft({ routine: { ...draft.routine!, schedule } })
                          }
                        />
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
          </div>
        )}
      </div>

      {/* ─────────── Painel direito: modelos prontos (expansível) ─────────── */}
      {showTplPanel &&
        (tplOpen ? (
          <aside className="relative flex min-h-0 w-full shrink-0 flex-col border-t border-border lg:w-[400px] lg:border-l lg:border-t-0">
            {/* Handle na borda (padrão Claude) — clique recolhe. Sem botão. */}
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
          /* Recolhido: só o handle encostado na borda direita — clique expande. */
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
