/**
 * Agenda / Rotinas — the tenant's automation screen, faithful to Claude's
 * "Routines" and to our Editorial way.
 *
 * Onda 1: composer "O que você quer automatizar?" + chips → pre-filled drawer;
 *   redesigned routine list (icon, human schedule, AGENT chip, next run, status,
 *   actions on hover); empty "Nenhuma rotina ainda"; agent picker; system×user
 *   curation (lib/cron-curation) — system only under ?full=1.
 * Onda 2: the "Ou comece com um modelo" gallery reuses the native blueprints.
 * Onda 3: "Rotinas"↔"Calendário" toggle (RoutineCalendar, next runs per agent).
 *
 * Routines are INDEPENDENT per agent (every job has a `profile`); the form
 * always creates aiming at one agent. Technical fields (provider/model/script/…)
 * stay hidden under ?full=1.
 *
 * S2 slice 1 (local-engine desktop, "one product, two computers"): the list
 * merges the CLOUD brain's routines through the shell bridge (fail-open — no
 * bridge/401/5s timeout leaves the local list alone, zero error on screen).
 * NEW routines default to the CLOUD (a local routine dies with the app; the
 * cloud one is the 24/7 story), falling back to a local create with an honest
 * note when the bridge refuses. Cloud routines support pause/resume/trigger
 * (bridge POSTs) and — since shell 0.3.5 widened the bridge allowlist to
 * PATCH/PUT/DELETE — edit (PUT /api/cron/jobs/{id}, the same verb/path
 * api.updateCronJob uses) and delete (DELETE /api/cron/jobs/{id}). Both are
 * gated on cloudMutateAvailable(): older shells coerced those verbs to GET,
 * so there the affordances stay hidden as before.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Clock, Cloud, Pause, Play, Plus, Trash2, X, Zap } from "lucide-react";
import { Badge } from "@nous-research/ui/ui/components/badge";
import { Button } from "@nous-research/ui/ui/components/button";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { api } from "@/lib/api";
import type {
  CronJob,
  CronDeliveryTarget,
  ModelOptionsResponse,
  ProfileInfo,
  SkillInfo,
  ToolsetInfo,
} from "@/lib/api";
import {
  buildCronJobPayload,
  cronJobHasExecutionContent,
  cronJobFormFromJob,
  type CronJobFormState,
} from "@/lib/cron-job";
import { DeleteConfirmDialog } from "@/components/DeleteConfirmDialog";
import { AgentSchedulePicker } from "@/components/agents/AgentSchedulePicker";
import { RoutineCalendar } from "@/components/agenda/RoutineCalendar";
import {
  DEFAULT_SCHEDULE_STATE,
  buildScheduleString,
  describeSchedule,
  englishOrdinal,
  parseScheduleString,
  type ScheduleBuilderState,
  type ScheduleDescribeStrings,
} from "@/lib/schedule";
import { partitionJobs } from "@/lib/cron-curation";
import { agentColorOf } from "@/lib/agent-colors";
import { agentLabel, realAgents } from "@/lib/agents";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { useConfirmDelete } from "@nous-research/ui/hooks/use-confirm-delete";
import { useModalBehavior } from "@/hooks/useModalBehavior";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { Input } from "@nous-research/ui/ui/components/input";
import { Label } from "@nous-research/ui/ui/components/label";
import { useI18n } from "@/i18n";
import { usePageHeader } from "@/contexts/usePageHeader";
import { PluginSlot } from "@/plugins";
import { AutomationBlueprints } from "@/components/AutomationBlueprints";
import { cn, themedBody } from "@/lib/utils";
import { isInternalView } from "@/lib/internal-view";
import { isLocalEngine } from "@/lib/projects";
import {
  cloudBridge,
  cloudGetJson,
  cloudMutateAvailable,
  cloudMutateJson,
  cloudPostJson,
} from "@/lib/cloudSession";

function formatTime(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function truncateText(value: string, maxLength: number): string {
  return value.length > maxLength ? value.slice(0, maxLength) + "..." : value;
}

function getJobPrompt(job: CronJob): string {
  return asText(job.prompt);
}

function NameCheckboxPicker({
  id,
  available,
  selected,
  onChange,
  emptyLabel,
}: {
  id: string;
  available: Array<{ name: string; description?: string | null }>;
  selected: string[];
  onChange: (names: string[]) => void;
  emptyLabel: string;
}) {
  const names = available.map((item) => item.name);
  const orphaned = selected.filter((s) => !names.includes(s));
  const all = [...orphaned.map((name) => ({ name, description: "" })), ...available];

  if (all.length === 0) {
    return <p className="text-xs text-muted-foreground">{emptyLabel}</p>;
  }

  const toggle = (name: string, checked: boolean) => {
    if (checked) onChange([...selected, name]);
    else onChange(selected.filter((s) => s !== name));
  };

  return (
    <div id={id} className="max-h-36 overflow-y-auto rounded-lg border border-border bg-background/40 p-1">
      {all.map((item) => (
        <label
          key={item.name}
          className="flex cursor-pointer items-center gap-2 px-2 py-1 text-xs hover:bg-muted/40"
          title={item.description || undefined}
        >
          <input
            type="checkbox"
            className="accent-live"
            checked={selected.includes(item.name)}
            onChange={(e) => toggle(item.name, e.target.checked)}
          />
          <span className="font-mono-ui truncate">{item.name}</span>
        </label>
      ))}
    </div>
  );
}

interface CronJobEditorState extends CronJobFormState {
  scheduleState: ScheduleBuilderState;
}

interface CronJobFormResources {
  availableSkills: SkillInfo[];
  availableToolsets: ToolsetInfo[];
  modelOptions: ModelOptionsResponse | null;
  deliveryTargets: CronDeliveryTarget[];
}

function emptyCronJobForm(): CronJobEditorState {
  return {
    name: "",
    prompt: "",
    schedule: "",
    deliver: "local",
    skills: [],
    provider: "",
    model: "",
    base_url: "",
    script: "",
    no_agent: false,
    context_from: "",
    enabled_toolsets: [],
    // Deep-link: /cron?workdir=<folder> pre-fills the new job's workspace.
    workdir: new URLSearchParams(window.location.search).get("workdir") ?? "",
    // Routine = recurring → starts at "daily at 9am" (not the 30min interval).
    scheduleState: { ...DEFAULT_SCHEDULE_STATE, mode: "daily", timeOfDay: "09:00" },
  };
}

function editorFormFromJob(job: CronJob): CronJobEditorState {
  const form = cronJobFormFromJob(job);
  return { ...form, scheduleState: parseScheduleString(form.schedule) };
}

function buildCronJobPayloadFromEditor(form: CronJobEditorState) {
  const { scheduleState, ...payloadForm } = form;
  return buildCronJobPayload({
    ...payloadForm,
    schedule: buildScheduleString(scheduleState),
  });
}

function selectOptions(
  current: string,
  options: Array<{ value: string; label: string }>,
) {
  const known = new Set(options.map((option) => option.value));
  return [
    ...options.map((option) => (
      <SelectOption key={option.value} value={option.value}>
        {option.label}
      </SelectOption>
    )),
    ...(current && !known.has(current)
      ? [
          <SelectOption key={current} value={current}>
            {current}
          </SelectOption>,
        ]
      : []),
  ];
}

function CronAdvancedFields({
  idPrefix,
  form,
  onChange,
  modelOptions,
  availableToolsets,
}: {
  idPrefix: string;
  form: CronJobEditorState;
  onChange: (form: CronJobEditorState) => void;
  modelOptions: ModelOptionsResponse | null;
  availableToolsets: ToolsetInfo[];
}) {
  const update = <K extends keyof CronJobEditorState,>(
    key: K,
    next: CronJobEditorState[K],
  ) => {
    onChange({ ...form, [key]: next });
  };

  const providers = (modelOptions?.providers ?? []).filter(
    (p) => p.authenticated !== false,
  );
  const selectedProvider = providers.find((p) => p.slug === form.provider);
  const models = selectedProvider?.models ?? [];

  return (
    <details className="rounded-lg border border-border bg-background/30 p-3" open>
      <summary className="cursor-pointer text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Advanced fields
      </summary>
      <div className="mt-3 grid gap-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor={`${idPrefix}-provider`}>Provider</Label>
            <Select
              id={`${idPrefix}-provider`}
              value={form.provider}
              onValueChange={(v) => onChange({ ...form, provider: v, model: "" })}
            >
              <SelectOption value="">Default</SelectOption>
              {selectOptions(form.provider, providers.map((p) => ({ value: p.slug, label: p.name })))}
            </Select>
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`${idPrefix}-model`}>Model</Label>
            <Select id={`${idPrefix}-model`} value={form.model} onValueChange={(v) => update("model", v)}>
              <SelectOption value="">Default</SelectOption>
              {selectOptions(form.model, models.map((model) => ({ value: model, label: model })))}
            </Select>
          </div>
        </div>

        <div className="grid gap-1">
          <Label htmlFor={`${idPrefix}-base-url`}>Base URL override</Label>
          <Input
            id={`${idPrefix}-base-url`}
            placeholder="https://api.example.com/v1"
            value={form.base_url}
            onChange={(e) => update("base_url", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              className="accent-live"
              checked={form.no_agent}
              onChange={(e) => update("no_agent", e.target.checked)}
            />
            no_agent: run the script only and deliver stdout verbatim
          </label>
          <div className="grid gap-1">
            <Label htmlFor={`${idPrefix}-script`}>Script</Label>
            <Input
              id={`${idPrefix}-script`}
              value={form.script}
              onChange={(e) => update("script", e.target.value)}
              placeholder="relative/path/in/scripts"
            />
          </div>
        </div>

        <div className="grid gap-1">
          <Label htmlFor={`${idPrefix}-workdir`}>Workdir</Label>
          <Input
            id={`${idPrefix}-workdir`}
            value={form.workdir}
            onChange={(e) => update("workdir", e.target.value)}
            placeholder="/absolute/project/path"
          />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="grid gap-1">
            <Label htmlFor={`${idPrefix}-context-from`}>context_from job IDs</Label>
            <textarea
              id={`${idPrefix}-context-from`}
              className="flex min-h-[64px] w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-xs font-courier shadow-sm placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
              placeholder="one job id per line"
              value={form.context_from}
              onChange={(e) => update("context_from", e.target.value)}
            />
          </div>
          <div className="grid gap-1">
            <Label htmlFor={`${idPrefix}-toolsets`}>enabled_toolsets</Label>
            <NameCheckboxPicker
              id={`${idPrefix}-toolsets`}
              available={availableToolsets}
              selected={form.enabled_toolsets}
              onChange={(v) => update("enabled_toolsets", v)}
              emptyLabel="No toolsets available."
            />
          </div>
        </div>
      </div>
    </details>
  );
}

interface CronJobFormFieldsProps {
  idPrefix: string;
  autoFocus?: boolean;
  form: CronJobEditorState;
  resources: CronJobFormResources;
  onChange: (form: CronJobEditorState) => void;
}

function CronJobFormFields({ idPrefix, autoFocus, form, resources, onChange }: CronJobFormFieldsProps) {
  const { t } = useI18n();
  const { availableSkills, availableToolsets, deliveryTargets, modelOptions } = resources;
  const update = <K extends keyof CronJobEditorState,>(
    key: K,
    next: CronJobEditorState[K],
  ) => {
    onChange({ ...form, [key]: next });
  };
  const onlyLocalAvailable =
    deliveryTargets.filter((target) => target.id !== "local").length === 0;

  const deliveryOptions = selectOptions(
    form.deliver,
    deliveryTargets.map((target) => {
      const base = target.id === "local" ? t.cron.delivery.local : target.name;
      if (target.id !== "local" && !target.home_target_set) {
        const hint = t.cron.delivery.needsHomeChannel ?? "set a home channel first";
        return { value: target.id, label: `${base} — ${hint}` };
      }
      return { value: target.id, label: base };
    }),
  );

  return (
    <>
      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-name`}>{t.cron.nameOptional}</Label>
        <Input
          id={`${idPrefix}-name`}
          autoFocus={autoFocus}
          placeholder={t.cron.namePlaceholder}
          value={form.name}
          onChange={(e) => update("name", e.target.value)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-prompt`}>{t.cron.prompt}</Label>
        <textarea
          id={`${idPrefix}-prompt`}
          className="flex min-h-[96px] w-full rounded-lg border border-border bg-background/40 px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:border-foreground/25 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-foreground/30"
          placeholder={t.cron.promptPlaceholder}
          value={form.prompt}
          onChange={(e) => update("prompt", e.target.value)}
        />
      </div>

      <div className="grid gap-1.5">
        <Label>{t.cron.scheduleMode}</Label>
        <AgentSchedulePicker
          value={form.scheduleState}
          onChange={(state) => update("scheduleState", state)}
        />
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-deliver`}>{t.cron.deliverTo}</Label>
        <Select id={`${idPrefix}-deliver`} value={form.deliver} onValueChange={(v) => update("deliver", v)}>
          {deliveryOptions}
        </Select>
        {onlyLocalAvailable && (
          <p className="text-xs text-muted-foreground">
            {t.cron.delivery.noneConfigured ??
              "No messaging platforms configured. Set one up under Channels to deliver reports."}
          </p>
        )}
      </div>

      <div className="grid gap-2">
        <Label htmlFor={`${idPrefix}-skills`}>Skills (optional)</Label>
        <NameCheckboxPicker
          id={`${idPrefix}-skills`}
          available={availableSkills}
          selected={form.skills}
          onChange={(skills) => update("skills", skills)}
          emptyLabel="No skills installed for this profile."
        />
      </div>

      {/* Curation: technical/admin fields stay hidden from the end user.
          Creation proceeds with the form's defaults. They come back under
          ?full=1 (us/support). */}
      {isInternalView() && (
        <CronAdvancedFields
          idPrefix={`${idPrefix}-advanced`}
          form={form}
          onChange={onChange}
          modelOptions={modelOptions}
          availableToolsets={availableToolsets}
        />
      )}
    </>
  );
}

function getJobName(job: CronJob): string {
  return asText(job.name).trim();
}

function getJobTitle(job: CronJob): string {
  const name = getJobName(job);
  if (name) return name;
  const prompt = getJobPrompt(job);
  if (prompt) return truncateText(prompt, 60);
  const script = asText(job.script);
  if (script) return truncateText(script, 60);
  return job.id || "Cron job";
}

function getJobScheduleDisplay(job: CronJob, strings: ScheduleDescribeStrings): string {
  return describeSchedule(
    job.schedule,
    asText(job.schedule_display) || asText(job.schedule?.display),
    strings,
  );
}

function getJobState(job: CronJob): string {
  return asText(job.state) || (job.enabled === false ? "disabled" : "scheduled");
}

function getJobProfile(job: CronJob): string {
  return asText(job.profile) || asText(job.profile_name) || "default";
}

function getJobKey(job: CronJob): string {
  return `${getJobProfile(job)}:${job.id}`;
}

function splitJobKey(key: string): { profile: string; id: string } {
  const idx = key.indexOf(":");
  if (idx === -1) return { profile: "default", id: key };
  return { profile: key.slice(0, idx) || "default", id: key.slice(idx + 1) };
}

/** Delete keys of CLOUD rows carry this prefix so the confirm flow knows
 *  which brain to hit; strip it BEFORE splitJobKey (which splits on the
 *  first ":" and would read "cloud" as the profile). */
const CLOUD_JOB_KEY_PREFIX = "cloud:";

/** Display only. `default` is the installation, never an assignable agent —
 *  system routines DO run on it, so its rows must stay readable while it is
 *  kept out of every picker below (see lib/agents). */
function profileLabel(profile: string): string {
  return agentLabel(profile);
}

// The agent's colored dot (same color on the card and in the calendar).
function AgentDot({ profile }: { profile: string }) {
  return (
    <span
      aria-hidden
      className="inline-block h-2 w-2 shrink-0 rounded-full"
      style={{ backgroundColor: agentColorOf(profile) }}
    />
  );
}

// Routine status pill (dot + translated label).
function StatusPill({ state, label }: { state: string; label: string }) {
  const tone =
    state === "paused" || state === "disabled"
      ? "text-amber-600 dark:text-amber-500"
      : state === "error"
        ? "text-destructive"
        : state === "completed"
          ? "text-muted-foreground"
          : "text-live";
  return (
    <span className={cn("inline-flex items-center gap-1 type-micro font-medium", tone)}>
      <span className="inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {label}
    </span>
  );
}

/** Claude-style composer: free text + chips → creates the routine (opens the
 *  pre-filled drawer). Cmd/Ctrl+Enter submits. */
function RoutineComposer({
  onCreate,
  chips,
  placeholder,
  createLabel,
}: {
  onCreate: (prompt: string) => void;
  chips: string[];
  placeholder: string;
  createLabel: string;
}) {
  const [text, setText] = useState("");
  const submit = () => {
    const v = text.trim();
    if (v) onCreate(v);
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-3 shadow-card">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        className="min-h-[60px] w-full resize-none bg-transparent px-2 py-1.5 text-sm text-foreground outline-none placeholder:text-muted-foreground"
      />
      <div className="mt-1 flex flex-wrap items-center gap-2">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onCreate(c)}
            className="rounded-full border border-border px-3 py-1.5 type-caption text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {c}
          </button>
        ))}
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim()}
          className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3.5 py-2 type-ui font-medium text-background transition-opacity disabled:opacity-40"
        >
          <Plus className="h-3.5 w-3.5" />
          {createLabel}
        </button>
      </div>
    </div>
  );
}

/** Claude-style routine card — icon, title, human schedule, next run,
 *  agent chip, status; actions on hover. Cloud-brain routines (S2) carry a
 *  discreet cloud badge; affordances the bridge cannot honor (edit/delete)
 *  arrive as undefined and simply do not render. */
function RoutineCard({
  job,
  scheduleText,
  stateLabel,
  cloud,
  onToggle,
  onTrigger,
  onEdit,
  onDelete,
  t,
}: {
  job: CronJob;
  scheduleText: string;
  stateLabel: string;
  /** Lives on the user's CLOUD computer (fetched through the shell bridge). */
  cloud?: boolean;
  onToggle: () => void;
  onTrigger: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  t: ReturnType<typeof useI18n>["t"];
}) {
  const state = getJobState(job);
  const title = getJobTitle(job);
  const profile = getJobProfile(job);
  const paused = state === "paused" || state === "disabled";
  const deliver = asText(job.deliver);
  const body = (
    <>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
        <Zap className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate type-body font-medium text-foreground">{title}</span>
          {cloud && (
            <span title={t.chat.cloudOriginTooltip} className="grid shrink-0 place-items-center">
              <Cloud className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
            </span>
          )}
          <StatusPill state={state} label={stateLabel} />
          {deliver && deliver !== "local" && <Badge tone="outline">{deliver}</Badge>}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 type-caption text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" />
            {scheduleText}
          </span>
          {job.next_run_at && (
            <span>
              {t.cron.next}: {formatTime(job.next_run_at)}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5" title={t.cron.agent}>
            <AgentDot profile={profile} />
            {profileLabel(profile)}
          </span>
        </div>
        {job.last_error && <p className="mt-1 type-micro text-destructive">{job.last_error}</p>}
      </div>
    </>
  );
  return (
    <div className="group flex items-center gap-3.5 rounded-2xl border border-border bg-card px-4 py-3.5 transition-shadow hover:shadow-pop">
      {onEdit ? (
        <button type="button" onClick={onEdit} title={title} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
          {body}
        </button>
      ) : (
        <div title={title} className="flex min-w-0 flex-1 items-center gap-3.5 text-left">
          {body}
        </div>
      )}
      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <Button
          ghost
          size="icon"
          title={paused ? t.cron.resume : t.cron.pause}
          aria-label={paused ? t.cron.resume : t.cron.pause}
          onClick={onToggle}
          className={paused ? "text-live" : "text-muted-foreground hover:text-foreground"}
        >
          {paused ? <Play /> : <Pause />}
        </Button>
        <Button ghost size="icon" title={t.cron.triggerNow} aria-label={t.cron.triggerNow} onClick={onTrigger}>
          <Zap />
        </Button>
        {onDelete && (
          <Button
            ghost
            destructive
            size="icon"
            title={t.common.delete}
            aria-label={t.common.delete}
            onClick={onDelete}
          >
            <Trash2 />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function CronPage() {
  const [jobs, setJobs] = useState<CronJob[]>([]);
  // S2: the CLOUD brain's routines, fetched through the shell bridge on the
  // local-engine desktop. [] = nothing/failed — the screen shows local only,
  // no error (fail-open by contract).
  const [cloudJobs, setCloudJobs] = useState<CronJob[]>([]);
  const [profiles, setProfiles] = useState<ProfileInfo[]>([]);
  // Every picker on this screen offers agents only — never the installation.
  const agentProfiles = useMemo(() => realAgents(profiles), [profiles]);
  const [selectedProfile, setSelectedProfile] = useState("all");
  const blueprintProfile =
    selectedProfile === "all" ? (agentProfiles[0]?.name ?? "") : selectedProfile;
  const [tab, setTab] = useState<"routines" | "calendar">("routines");
  const [loading, setLoading] = useState(true);
  const { toast, showToast } = useToast();
  const { t, locale } = useI18n();
  const { setEnd } = usePageHeader();
  const internal = isInternalView();

  const scheduleDescribeStrings: ScheduleDescribeStrings = {
    ...t.cron.scheduleDescribe,
    weekdaysShort: t.cron.scheduleModes.weekdaysShort,
    ordinal: locale === "en" ? englishOrdinal : (n: number) => String(n),
  };

  // New / edit modal state.
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [createProfile, setCreateProfile] = useState("");
  const [createForm, setCreateForm] = useState<CronJobEditorState>(emptyCronJobForm);
  const closeCreateModal = useCallback(() => setCreateModalOpen(false), []);
  const createModalRef = useModalBehavior({ open: createModalOpen, onClose: closeCreateModal });
  const [deliveryTargets, setDeliveryTargets] = useState<CronDeliveryTarget[]>([
    { id: "local", name: "Local", home_target_set: true, home_env_var: null },
  ]);
  const [creating, setCreating] = useState(false);

  const [editJob, setEditJob] = useState<CronJob | null>(null);
  // The job being edited lives on the CLOUD brain (0.3.5): save goes through
  // the bridge PUT instead of the local api.updateCronJob.
  const [editJobCloud, setEditJobCloud] = useState(false);
  const [editForm, setEditForm] = useState<CronJobEditorState>(emptyCronJobForm);
  const [saving, setSaving] = useState(false);
  const closeEditModal = useCallback(() => setEditJob(null), []);
  const editModalRef = useModalBehavior({ open: editJob !== null, onClose: closeEditModal });

  const [availableSkills, setAvailableSkills] = useState<SkillInfo[]>([]);
  const [availableToolsets, setAvailableToolsets] = useState<ToolsetInfo[]>([]);
  const [modelOptions, setModelOptions] = useState<ModelOptionsResponse | null>(null);

  const resourceProfile = editJob ? getJobProfile(editJob) : createProfile;

  const openEditModal = useCallback((job: CronJob, cloud = false) => {
    setEditJob(job);
    setEditJobCloud(cloud);
    setEditForm(editorFormFromJob(job));
  }, []);

  // Composer / chips / "+ Nova rotina" → opens the drawer pre-filled on the active agent.
  const openCreateWithPrompt = useCallback(
    (prompt: string) => {
      setCreateProfile(
        selectedProfile === "all" ? (agentProfiles[0]?.name ?? "") : selectedProfile,
      );
      setCreateForm({ ...emptyCronJobForm(), prompt });
      setCreateModalOpen(true);
    },
    [selectedProfile, agentProfiles],
  );

  const loadJobs = useCallback(() => {
    api
      .getCronJobs(selectedProfile)
      .then(setJobs)
      .catch(() => showToast(t.common.loading, "error"))
      .finally(() => setLoading(false));
    // S2 merge: the cloud brain's list on the same beat (load/refresh after
    // every mutation = the light cache). 5s deadline; null/failure clears to
    // local-only with zero error on screen. Agent filter forwarding is
    // best-effort — a LOCAL profile name unknown to the cloud simply returns
    // nothing there ("all" matches both brains).
    if (isLocalEngine() && cloudBridge()) {
      void cloudGetJson<CronJob[]>(
        `/api/cron/jobs?profile=${encodeURIComponent(selectedProfile)}`,
        5000,
      ).then((r) => setCloudJobs(Array.isArray(r) ? r : []));
    } else {
      setCloudJobs([]);
    }
  }, [selectedProfile, showToast, t.common.loading]);

  useEffect(() => {
    api.getProfiles().then((res) => setProfiles(res.profiles)).catch(() => setProfiles([]));
  }, []);

  useEffect(() => {
    api
      .getCronDeliveryTargets()
      .then((res) => setDeliveryTargets(res.targets))
      .catch(() =>
        setDeliveryTargets([{ id: "local", name: "Local", home_target_set: true, home_env_var: null }]),
      );
  }, []);

  useEffect(() => {
    loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getSkills(resourceProfile).catch(() => []),
      api.getToolsets(resourceProfile).catch(() => []),
      api.getModelOptions(resourceProfile).catch(() => null),
    ]).then(([skills, toolsets, options]) => {
      if (cancelled) return;
      setAvailableSkills([...skills].sort((a, b) => a.name.localeCompare(b.name)));
      setAvailableToolsets([...toolsets].sort((a, b) => a.name.localeCompare(b.name)));
      setModelOptions(options);
    });
    return () => {
      cancelled = true;
    };
  }, [resourceProfile]);

  const handleCreate = async () => {
    const payload = buildCronJobPayloadFromEditor(createForm);
    if (!payload.schedule || (!payload.no_agent && !cronJobHasExecutionContent(payload))) {
      showToast(`${t.cron.prompt} & ${t.cron.schedule} required`, "error");
      return;
    }
    if (payload.no_agent && !payload.script) {
      showToast("no_agent jobs require a script", "error");
      return;
    }
    setCreating(true);
    try {
      // S2 default: a routine born on the desktop lives on the CLOUD brain —
      // a local routine dies with the app; the cloud one is the product's
      // 24/7 story. Fail-open: any bridge refusal (CSRF/shape/timeout/signed
      // out) falls back to a LOCAL create with an honest note of where it
      // ended up. Off the local-engine desktop nothing changes.
      let toastMsg = t.common.create + " ✓";
      let toastTone: "success" | "error" = "success";
      if (isLocalEngine() && cloudBridge()) {
        const created = await cloudPostJson<CronJob>(
          `/api/cron/jobs?profile=${encodeURIComponent(createProfile)}`,
          payload,
          8000,
        );
        if (created && typeof created.id === "string" && created.id) {
          toastMsg = t.cron.createdInCloud;
        } else {
          await api.createCronJob(payload, createProfile);
          toastMsg = t.cron.createdLocalFallback;
          toastTone = "error";
        }
      } else {
        await api.createCronJob(payload, createProfile);
      }
      showToast(toastMsg, toastTone);
      setCreateForm(emptyCronJobForm());
      setCreateModalOpen(false);
      loadJobs();
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setCreating(false);
    }
  };

  const handleEdit = async () => {
    if (!editJob) return;
    const payload = buildCronJobPayloadFromEditor(editForm);
    if (!payload.schedule || (!payload.no_agent && !cronJobHasExecutionContent(payload))) {
      showToast(`${t.cron.prompt} & ${t.cron.schedule} required`, "error");
      return;
    }
    if (payload.no_agent && !payload.script) {
      showToast("no_agent jobs require a script", "error");
      return;
    }
    setSaving(true);
    try {
      if (editJobCloud) {
        // Cloud routine (0.3.5): the SAME PUT api.updateCronJob issues
        // locally (/api/cron/jobs/{id} {updates}), through the bridge.
        // Fail-open: no confirmation → toast, keep the modal open to retry.
        const r = await cloudMutateJson<CronJob>(
          `/api/cron/jobs/${encodeURIComponent(editJob.id)}?profile=${encodeURIComponent(getJobProfile(editJob))}`,
          "PUT",
          { updates: payload },
          8000,
        );
        if (!r) {
          showToast(t.cron.cloudUnavailable, "error");
          return;
        }
      } else {
        await api.updateCronJob(editJob.id, payload, getJobProfile(editJob));
      }
      showToast("Saved ✓", "success");
      setEditJob(null);
      loadJobs();
    } catch (e) {
      showToast(`${t.config.failedToSave}: ${e}`, "error");
    } finally {
      setSaving(false);
    }
  };

  const handlePauseResume = async (job: CronJob, cloud = false) => {
    try {
      const isPaused = getJobState(job) === "paused";
      const profile = getJobProfile(job);
      if (cloud) {
        // Cloud routine (S2): the same pause/resume POST, through the bridge.
        // Fail-open: null = the cloud didn't confirm — say so, change nothing.
        const r = await cloudPostJson<CronJob>(
          `/api/cron/jobs/${encodeURIComponent(job.id)}/${isPaused ? "resume" : "pause"}?profile=${encodeURIComponent(profile)}`,
          undefined,
          8000,
        );
        if (!r) {
          showToast(t.cron.cloudUnavailable, "error");
          return;
        }
      } else if (isPaused) await api.resumeCronJob(job.id, profile);
      else await api.pauseCronJob(job.id, profile);
      loadJobs();
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    }
  };

  const handleTrigger = async (job: CronJob, cloud = false) => {
    try {
      if (cloud) {
        const r = await cloudPostJson<CronJob>(
          `/api/cron/jobs/${encodeURIComponent(job.id)}/trigger?profile=${encodeURIComponent(getJobProfile(job))}`,
          undefined,
          8000,
        );
        if (!r) {
          showToast(t.cron.cloudUnavailable, "error");
          return;
        }
      } else {
        await api.triggerCronJob(job.id, getJobProfile(job));
      }
      showToast(`${t.cron.triggerNow}: "${truncateText(getJobTitle(job), 30)}"`, "success");
      loadJobs();
    } catch (e) {
      showToast(`${t.status.error}: ${e}`, "error");
    }
  };

  const jobDelete = useConfirmDelete({
    onDelete: useCallback(
      async (key: string) => {
        const cloud = key.startsWith(CLOUD_JOB_KEY_PREFIX);
        const { profile, id } = splitJobKey(
          cloud ? key.slice(CLOUD_JOB_KEY_PREFIX.length) : key,
        );
        try {
          if (cloud) {
            // Cloud routine (0.3.5): the SAME DELETE api.deleteCronJob issues
            // locally, through the bridge. Fail-open: no confirmation → toast
            // + throw (nothing changes, the dialog state stays consistent).
            const r = await cloudMutateJson<{ ok?: boolean }>(
              `/api/cron/jobs/${encodeURIComponent(id)}?profile=${encodeURIComponent(profile)}`,
              "DELETE",
              undefined,
              8000,
            );
            if (!r) {
              showToast(t.cron.cloudUnavailable, "error");
              throw new Error("cloud-unavailable");
            }
          } else {
            await api.deleteCronJob(id, profile);
          }
          loadJobs();
        } catch (e) {
          if (!(e instanceof Error && e.message === "cloud-unavailable")) {
            showToast(`${t.status.error}: ${e}`, "error");
          }
          throw e;
        }
      },
      [loadJobs, showToast, t.cron.cloudUnavailable, t.status.error],
    ),
  });

  // Header: "Rotinas"↔"Calendário" toggle + "+ Nova rotina".
  useLayoutEffect(() => {
    setEnd(
      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-lg border border-border p-0.5">
          <button
            type="button"
            onClick={() => setTab("routines")}
            className={cn(
              "rounded-md px-2.5 py-1 type-ui transition-colors",
              tab === "routines" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.cron.routines}
          </button>
          <button
            type="button"
            onClick={() => setTab("calendar")}
            className={cn(
              "rounded-md px-2.5 py-1 type-ui transition-colors",
              tab === "calendar" ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t.cron.viewCalendar}
          </button>
        </div>
        <Button size="sm" onClick={() => openCreateWithPrompt("")} prefix={<Plus />}>
          {t.cron.newRoutine}
        </Button>
      </div>,
    );
    return () => setEnd(null);
  }, [setEnd, tab, t.cron.routines, t.cron.viewCalendar, t.cron.newRoutine, openCreateWithPrompt]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Spinner className="text-2xl text-primary" />
      </div>
    );
  }

  const { user: userJobs } = partitionJobs(jobs);
  const { user: userCloudJobs } = partitionJobs(cloudJobs);
  const shownLocal = internal ? jobs : userJobs; // ?full=1 sees everything (incl. system jobs)
  const shownCloud = internal ? cloudJobs : userCloudJobs;
  // Merged view (S2): local first, then the cloud brain's — each row knows its
  // origin (badge + which actions the bridge can honor). The count sums both.
  const shown = [
    ...shownLocal.map((job) => ({ job, cloud: false })),
    ...shownCloud.map((job) => ({ job, cloud: true })),
  ];
  const cloudJobSet = new Set<CronJob>(cloudJobs);
  // The confirm dialog's subject may be a local key or a "cloud:"-prefixed one.
  const pendingKey = jobDelete.pendingId;
  const pendingJob = pendingKey
    ? pendingKey.startsWith(CLOUD_JOB_KEY_PREFIX)
      ? cloudJobs.find((j) => getJobKey(j) === pendingKey.slice(CLOUD_JOB_KEY_PREFIX.length))
      : jobs.find((j) => getJobKey(j) === pendingKey)
    : null;

  const stateLabelOf = (job: CronJob) => {
    const s = getJobState(job);
    if (s === "paused" || s === "disabled") return t.cron.statePaused;
    if (s === "error") return t.cron.stateError;
    if (s === "completed") return t.cron.stateDone;
    return t.cron.stateScheduled;
  };

  return (
    <div className="flex min-h-[calc(100dvh-140px)] flex-col gap-6">
      <PluginSlot name="cron:top" />
      <Toast toast={toast} />

      {tab === "calendar" ? (
        <RoutineCalendar
          jobs={shown.map((entry) => entry.job)}
          strings={scheduleDescribeStrings}
          locale={locale}
          // Cloud routines open the editor too since 0.3.5 (bridge PUT) —
          // still a no-op on older shells that can't ferry the verb.
          onOpen={(job) => {
            const cloud = cloudJobSet.has(job);
            if (!cloud || cloudMutateAvailable()) openEditModal(job, cloud);
          }}
        />
      ) : (
        <>
          {/* Composer hero (fiel ao Claude). */}
          <div className="grid gap-3">
            <p className="type-body text-muted-foreground">{t.cron.routinesSubtitle}</p>
            <RoutineComposer
              onCreate={openCreateWithPrompt}
              chips={[t.cron.chip1, t.cron.chip2, t.cron.chip3]}
              placeholder={t.cron.composerPlaceholder}
              createLabel={t.cron.createRoutine}
            />
          </div>

          {/* Filter by agent + count. */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="inline-flex items-center gap-2 type-ui text-muted-foreground">
              <Clock className="h-4 w-4" />
              {t.cron.routines} · {shown.length}
            </span>
            <div className="grid min-w-[200px] gap-1">
              <Label htmlFor="cron-agent-filter" className="type-micro uppercase tracking-wide">
                {t.cron.agent}
              </Label>
              <Select id="cron-agent-filter" value={selectedProfile} onValueChange={setSelectedProfile}>
                <SelectOption value="all">{t.cron.allAgents}</SelectOption>
                {agentProfiles.map((p) => (
                  <SelectOption key={p.name} value={p.name}>
                    {profileLabel(p.name)}
                  </SelectOption>
                ))}
              </Select>
            </div>
          </div>

          {/* Lista de rotinas. */}
          {shown.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-border py-16 text-center">
              <Clock className="mx-auto mb-3 h-6 w-6 text-text-tertiary" />
              <p className="type-body text-muted-foreground">{t.cron.noRoutines}</p>
            </div>
          ) : (
            <div className="grid gap-2.5">
              {shown.map(({ job, cloud }) => (
                <RoutineCard
                  key={`${cloud ? "cloud:" : ""}${getJobKey(job)}`}
                  job={job}
                  cloud={cloud}
                  scheduleText={getJobScheduleDisplay(job, scheduleDescribeStrings)}
                  stateLabel={stateLabelOf(job)}
                  onToggle={() => handlePauseResume(job, cloud)}
                  onTrigger={() => handleTrigger(job, cloud)}
                  // Cloud rows regained edit (bridge PUT) and delete (bridge
                  // DELETE) in 0.3.5 — gated on the shell actually ferrying
                  // those verbs (older shells keep them hidden, as before).
                  onEdit={
                    cloud && !cloudMutateAvailable()
                      ? undefined
                      : () => openEditModal(job, cloud)
                  }
                  onDelete={
                    cloud && !cloudMutateAvailable()
                      ? undefined
                      : () =>
                          jobDelete.requestDelete(
                            cloud ? CLOUD_JOB_KEY_PREFIX + getJobKey(job) : getJobKey(job),
                          )
                  }
                  t={t}
                />
              ))}
            </div>
          )}

          {/* Template gallery (native blueprints) — Onda 2. A blueprint creates
              a routine ON an agent, so with no agents there is nothing to
              create it on: the gallery stays hidden rather than defaulting to
              the installation. */}
          {blueprintProfile && (
            <div className="grid gap-3 pt-2">
              <h3 className="type-ui font-medium text-foreground">{t.cron.startFromTemplate}</h3>
              <AutomationBlueprints profile={blueprintProfile} onCreated={loadJobs} />
            </div>
          )}
        </>
      )}

      <DeleteConfirmDialog
        open={jobDelete.isOpen}
        onCancel={jobDelete.cancel}
        onConfirm={jobDelete.confirm}
        title={t.cron.confirmDeleteTitle}
        description={
          pendingJob
            ? `"${truncateText(getJobTitle(pendingJob), 40)}" — ${t.cron.confirmDeleteMessage}`
            : t.cron.confirmDeleteMessage
        }
        loading={jobDelete.isDeleting}
      />

      {/* Create routine drawer. */}
      {createModalOpen && (
        <div
          ref={createModalRef}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 p-4"
          onClick={(e) => e.target === e.currentTarget && setCreateModalOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="create-cron-title"
        >
          <div className={cn(themedBody, "relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-2xl")}>
            <Button
              ghost
              size="icon"
              onClick={() => setCreateModalOpen(false)}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              aria-label={t.common.close}
            >
              <X />
            </Button>
            <header className="border-b border-border p-5 pb-3">
              <h2 id="create-cron-title" className="type-body font-medium text-foreground">
                {t.cron.newRoutine}
              </h2>
            </header>
            <div className="grid min-h-0 gap-4 overflow-y-auto p-5">
              <div className="grid gap-2">
                <Label htmlFor="cron-agent">{t.cron.agent}</Label>
                <Select id="cron-agent" value={createProfile} onValueChange={(v) => setCreateProfile(v)}>
                  <SelectOption value="">{t.agents.opsPickAgent}</SelectOption>
                  {agentProfiles.map((profile) => (
                    <SelectOption key={profile.name} value={profile.name}>
                      {profileLabel(profile.name)}
                    </SelectOption>
                  ))}
                </Select>
              </div>
              <CronJobFormFields
                idPrefix="cron"
                autoFocus
                form={createForm}
                onChange={setCreateForm}
                resources={{ availableSkills, availableToolsets, modelOptions, deliveryTargets }}
              />
              <div className="flex justify-end">
                <Button
                  onClick={handleCreate}
                  disabled={creating || !createProfile}
                  prefix={creating ? <Spinner /> : <Plus />}
                >
                  {creating ? t.common.creating : t.cron.createRoutine}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit routine drawer. */}
      {editJob && (
        <div
          ref={editModalRef}
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/85 p-4"
          onClick={(e) => e.target === e.currentTarget && setEditJob(null)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-cron-title"
        >
          <div className={cn(themedBody, "relative flex max-h-[90vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-card shadow-2xl")}>
            <Button
              ghost
              size="icon"
              onClick={() => setEditJob(null)}
              className="absolute right-2 top-2 text-muted-foreground hover:text-foreground"
              aria-label={t.common.close}
            >
              <X />
            </Button>
            <header className="border-b border-border p-5 pb-3">
              <h2 id="edit-cron-title" className="type-body font-medium text-foreground">
                {getJobTitle(editJob)}
              </h2>
            </header>
            <div className="grid min-h-0 gap-4 overflow-y-auto p-5">
              <CronJobFormFields
                idPrefix="edit-cron"
                autoFocus
                form={editForm}
                onChange={setEditForm}
                resources={{ availableSkills, availableToolsets, modelOptions, deliveryTargets }}
              />
              <div className="flex items-center justify-between">
                <span className="truncate pr-4 type-micro font-mono-ui text-muted-foreground">{editJob.id}</span>
                <Button onClick={handleEdit} disabled={saving} prefix={saving ? <Spinner /> : undefined}>
                  {saving ? t.common.loading : t.common.save}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <PluginSlot name="cron:bottom" />
    </div>
  );
}
