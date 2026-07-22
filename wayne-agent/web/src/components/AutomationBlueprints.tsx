/**
 * Template (blueprint) gallery — the "Ou comece com um modelo" surface of the
 * Agenda, faithful to Claude's template cards and to our Editorial.
 *
 * The blueprints are NATIVE (/api/cron/blueprints): each card expands into a
 * form (one field per typed slot); "Agendar" does a POST /instantiate, which
 * fills the blueprint and creates the job through the SAME path as everything
 * else. It instantiates on the agent (profile) picked up top. Zero new backend
 * — just a reskin.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  ChevronDown,
  Clock,
  FileText,
  FlaskConical,
  GitPullRequest,
  ListChecks,
  Mail,
  Package,
  Sun,
  Wand2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@nous-research/ui/ui/components/button";
import { Select, SelectOption } from "@nous-research/ui/ui/components/select";
import { Spinner } from "@nous-research/ui/ui/components/spinner";
import { Input } from "@nous-research/ui/ui/components/input";
import { Label } from "@nous-research/ui/ui/components/label";
import { useToast } from "@nous-research/ui/hooks/use-toast";
import { Toast } from "@nous-research/ui/ui/components/toast";
import { api } from "@/lib/api";
import type { AutomationBlueprint, AutomationBlueprintField, CronJob } from "@/lib/api";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { isLocalEngine } from "@/lib/projects";
import { cloudBridge, cloudPostJson } from "@/lib/cloudSession";
import { localizeBlueprint, sortBlueprintsForDisplay } from "@/lib/blueprint-i18n";

interface AutomationBlueprintsProps {
  profile: string;
  /** Called after instantiating a blueprint so the parent refreshes the list. */
  onCreated?: () => void;
}

/** Icon by blueprint category/theme (keyword heuristic). */
function iconFor(bp: AutomationBlueprint): LucideIcon {
  const s = `${bp.category} ${bp.key} ${bp.title}`.toLowerCase();
  if (/brief|summary|digest|standup|morning/.test(s)) return Sun;
  if (/email|inbox|mail/.test(s)) return Mail;
  if (/health|monitor|uptime|status|system|incident/.test(s)) return Activity;
  if (/issue|triage|bug|ticket/.test(s)) return ListChecks;
  if (/pr\b|pull|review|merge/.test(s)) return GitPullRequest;
  if (/dep|package|security|patch|update|upgrade/.test(s)) return Package;
  if (/release|notes|changelog|deploy/.test(s)) return FileText;
  if (/test|flaky|ci\b/.test(s)) return FlaskConical;
  return Wand2;
}

/** Initial form values = each field's default (or ""). */
function initialValues(blueprint: AutomationBlueprint): Record<string, string> {
  const out: Record<string, string> = {};
  for (const f of blueprint.fields) out[f.name] = f.default ?? "";
  return out;
}

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: AutomationBlueprintField;
  value: string;
  onChange: (v: string) => void;
}) {
  if (field.type === "enum" || field.type === "weekdays") {
    return (
      <Select value={value} onValueChange={(v) => onChange(v)}>
        {field.options.map((opt) => (
          <SelectOption key={opt} value={opt}>
            {opt}
          </SelectOption>
        ))}
      </Select>
    );
  }
  if (field.type === "time") {
    return <Input type="time" value={value} onChange={(e) => onChange(e.target.value)} />;
  }
  return (
    <Input
      type="text"
      value={value}
      placeholder={field.help || field.label}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function BlueprintCard({
  blueprint,
  profile,
  showToast,
  onCreated,
}: {
  blueprint: AutomationBlueprint;
  profile: string;
  showToast: (message: string, type: "error" | "success") => void;
  onCreated?: () => void;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>(() => initialValues(blueprint));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const Icon = iconFor(blueprint);
  const timeDefault = blueprint.fields.find((f) => f.type === "time")?.default;

  const submit = useCallback(async () => {
    setSubmitting(true);
    setError(null);
    try {
      // S2 default (local-engine desktop): the routine a blueprint creates
      // lives on the CLOUD brain — same catalog on both brains, same
      // /instantiate POST, through the shell bridge. Fail-open: a bridge
      // refusal (signed out / timeout / unknown key) falls back to the LOCAL
      // create with an honest note of where it ended up.
      if (isLocalEngine() && cloudBridge()) {
        const cloudJob = await cloudPostJson<CronJob>(
          `/api/cron/blueprints/instantiate?profile=${encodeURIComponent(profile)}`,
          { blueprint: blueprint.key, values },
          8000,
        );
        if (cloudJob && typeof cloudJob.id === "string" && cloudJob.id) {
          showToast(`${blueprint.title} — ${t.cron.createdInCloud}`, "success");
          setOpen(false);
          setValues(initialValues(blueprint));
          onCreated?.();
          return;
        }
        const localJob = await api.instantiateAutomationBlueprint(
          { blueprint: blueprint.key, values },
          profile,
        );
        const localWhen = localJob.schedule_display ? ` — ${localJob.schedule_display}` : "";
        showToast(`${blueprint.title}${localWhen} — ${t.cron.createdLocalFallback}`, "error");
        setOpen(false);
        setValues(initialValues(blueprint));
        onCreated?.();
        return;
      }
      const job = await api.instantiateAutomationBlueprint({ blueprint: blueprint.key, values }, profile);
      const when = job.schedule_display ? ` — ${job.schedule_display}` : "";
      showToast(`${blueprint.title}${when}`, "success");
      setOpen(false);
      setValues(initialValues(blueprint));
      onCreated?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.replace(/^\d+:\s*/, ""));
    } finally {
      setSubmitting(false);
    }
  }, [blueprint, values, profile, showToast, onCreated, t]);

  return (
    <div className="flex flex-col rounded-2xl border border-border bg-card p-4 transition-shadow hover:shadow-pop">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted text-foreground">
          <Icon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="type-body font-medium text-foreground">{blueprint.title}</div>
          <p className="mt-0.5 type-caption text-muted-foreground">{blueprint.description}</p>
        </div>
        <Button ghost={open} size="sm" onClick={() => setOpen((o) => !o)} className="shrink-0">
          {open ? t.common.cancel : t.cron.configure}
        </Button>
      </div>

      {(timeDefault || blueprint.tags.length > 0) && (
        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 pl-12 type-micro text-muted-foreground">
          {timeDefault && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {timeDefault}
            </span>
          )}
          {blueprint.tags.map((tag) => (
            <span key={tag} className="rounded-full bg-muted px-2 py-0.5">
              {tag}
            </span>
          ))}
        </div>
      )}

      {open && (
        <div className="mt-3 grid gap-3 border-t border-border pt-3">
          {blueprint.fields.map((f) => (
            <div key={f.name} className="grid gap-1">
              <Label htmlFor={`${blueprint.key}-${f.name}`}>{f.label}</Label>
              <FieldInput
                field={f}
                value={values[f.name] ?? ""}
                onChange={(v) => setValues((prev) => ({ ...prev, [f.name]: v }))}
              />
              {f.help && f.type !== "text" ? <p className="type-micro text-muted-foreground">{f.help}</p> : null}
            </div>
          ))}
          {error ? (
            <p className="type-caption text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end">
            <Button onClick={() => void submit()} disabled={submitting} prefix={submitting ? <Spinner /> : <Clock />}>
              {t.cron.scheduleIt}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function BlueprintGrid({
  items,
  profile,
  showToast,
  onCreated,
}: {
  items: AutomationBlueprint[];
  profile: string;
  showToast: (message: string, type: "error" | "success") => void;
  onCreated?: () => void;
}) {
  return (
    <div className={cn("grid grid-cols-1 gap-2.5 md:grid-cols-2")}>
      {items.map((bp) => (
        <BlueprintCard key={bp.key} blueprint={bp} profile={profile} showToast={showToast} onCreated={onCreated} />
      ))}
    </div>
  );
}

export function AutomationBlueprints({ profile, onCreated }: AutomationBlueprintsProps) {
  const { locale, t } = useI18n();
  const { toast, showToast } = useToast();
  const [blueprints, setBlueprints] = useState<AutomationBlueprint[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [moreOpen, setMoreOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getAutomationBlueprints()
      .then((r) => {
        if (!cancelled) setBlueprints(r.blueprints);
      })
      .catch((e) => {
        if (!cancelled) setLoadError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const { featured, more } = useMemo(() => {
    if (!blueprints?.length) return { featured: [], more: [] };
    const localized = blueprints.map((bp) => localizeBlueprint(bp, locale));
    return sortBlueprintsForDisplay(localized);
  }, [blueprints, locale]);

  if (loadError) {
    return <p className="type-caption text-destructive">{loadError}</p>;
  }
  if (blueprints === null) {
    return (
      <div className="flex items-center gap-2 type-caption text-muted-foreground">
        <Spinner className="h-4 w-4" /> {t.common.loading}
      </div>
    );
  }
  if (blueprints.length === 0) {
    return null;
  }

  return (
    <>
      <Toast toast={toast} />
      <div className="grid gap-4">
        <BlueprintGrid items={featured} profile={profile} showToast={showToast} onCreated={onCreated} />
        {more.length > 0 && (
          <div className="grid gap-2">
            <button
              type="button"
              className="flex items-center gap-2 text-left type-ui font-medium text-muted-foreground hover:text-foreground"
              onClick={() => setMoreOpen((v) => !v)}
            >
              <ChevronDown className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")} />
              {t.cron.blueprintsMoreSection}
            </button>
            {moreOpen && (
              <BlueprintGrid items={more} profile={profile} showToast={showToast} onCreated={onCreated} />
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default AutomationBlueprints;
