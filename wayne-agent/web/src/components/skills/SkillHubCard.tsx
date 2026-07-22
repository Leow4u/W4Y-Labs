/**
 * SkillHubCard — the card for a skill from the Official catalog: icon by
 * category, ORIGINAL name, description, category badge and the
 * Install/Installing/Installed/Failed control. Presentational; extracted from
 * SkillMarketplace so both it and PluginsHub can reuse it.
 */
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Coins,
  Database,
  Download,
  Gamepad2,
  Globe,
  HeartPulse,
  Loader2,
  Package,
  Paintbrush,
  Shield,
  Wallet,
  Wrench,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { SkillHubResult } from "@/lib/api";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";
import { hasCuratedSkillName, skillDisplayName } from "@/lib/skill-curation";

const CAT_ICON: Record<string, LucideIcon> = {
  general: Package,
  blockchain: Coins,
  crypto: Coins,
  finance: Wallet,
  payments: Wallet,
  gaming: Gamepad2,
  health: HeartPulse,
  security: Shield,
  "red-teaming": Shield,
  mcp: Globe,
  web: Globe,
  data: Database,
  "data-science": Database,
  mlops: Bot,
  ml: Bot,
  ai: Bot,
  agent: Bot,
  creative: Paintbrush,
  design: Paintbrush,
  productivity: Zap,
  automation: Zap,
};

export function catIcon(cat?: string): LucideIcon {
  const c = (cat || "general").toLowerCase();
  if (CAT_ICON[c]) return CAT_ICON[c];
  for (const [key, icon] of Object.entries(CAT_ICON)) if (c.includes(key)) return icon;
  return Wrench;
}

/** Title-case of the category slug (NO translation — presentation only). */
export function prettyCat(cat: string, generalLabel: string): string {
  if (!cat || cat === "general") return generalLabel;
  return cat
    .split(/[-_/]/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The install affordance for one catalog skill, shared by the card and the
 * detail modal so both read the SAME lifecycle.
 *
 * States mirror exactly what the backend reports for the spawned install
 * action (`GET /api/actions/<name>/status` → {running, exit_code, lines}):
 * "installing" while the process runs and a terminal state from `exit_code`.
 * The action exposes no percentage, so there is no progress bar. On failure
 * the control turns into a retry whose tooltip carries the real CLI log line.
 */
export function SkillInstallControl({
  skill,
  installed,
  installing,
  failed,
  onInstall,
}: {
  skill: SkillHubResult;
  installed: boolean;
  installing: boolean;
  /** Reason from the failed attempt (may be ""), or undefined when none. */
  failed?: string;
  onInstall: (skill: SkillHubResult) => void;
}) {
  const { t } = useI18n();

  if (installing) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 type-ui text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
        {t.skills.installing}
      </span>
    );
  }
  if (installed) {
    return (
      <span className="inline-flex items-center gap-1 type-ui text-live">
        <CheckCircle2 className="h-3.5 w-3.5" />
        {t.skills.installed}
      </span>
    );
  }
  if (failed != null) {
    return (
      <button
        type="button"
        onClick={() => onInstall(skill)}
        title={failed || undefined}
        className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-1.5 type-ui font-medium text-destructive transition-colors hover:bg-destructive/10"
      >
        <AlertCircle className="h-3.5 w-3.5" />
        {t.skills.installFailed}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={() => onInstall(skill)}
      className="inline-flex items-center gap-1.5 rounded-lg bg-foreground px-3 py-1.5 type-ui font-medium text-background transition-opacity hover:opacity-90"
    >
      <Download className="h-3.5 w-3.5" />
      {t.skills.install}
    </button>
  );
}

export function SkillHubCard({
  skill,
  installed,
  installing,
  failed,
  onInstall,
  onOpen,
}: {
  skill: SkillHubResult;
  installed: boolean;
  installing: boolean;
  /** Reason from the failed attempt (may be ""), or undefined when none. */
  failed?: string;
  onInstall: (skill: SkillHubResult) => void;
  /** Card body click → read the skill before installing. Omitted = inert body. */
  onOpen?: (skill: SkillHubResult) => void;
}) {
  const { t, locale } = useI18n();
  const Icon = catIcon(skill.category);

  // E1 (GAP-INT-05): featured skills get a friendly pt-BR title; the technical
  // identifier stays as a subtitle so nothing gets lost in translation.
  const title = skillDisplayName(skill.name, locale);
  const curated = hasCuratedSkillName(skill.name, locale);

  const body = (
    <>
      <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted text-foreground">
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={cn("truncate text-sm text-foreground", curated ? "font-medium" : "font-mono-ui")}>
            {title}
          </span>
          {skill.category && skill.category !== "general" && (
            <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 type-micro text-muted-foreground">
              {prettyCat(skill.category, t.common.general)}
            </span>
          )}
        </div>
        {curated && (
          <span className="mt-0.5 block truncate font-mono-ui text-[0.6875rem] text-muted-foreground/80">
            {skill.name}
          </span>
        )}
        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
          {skill.description}
        </p>
      </div>
    </>
  );

  return (
    <div className="flex h-full items-start gap-3 rounded-xl border border-border bg-card p-3.5 transition-shadow hover:shadow-pop">
      {onOpen ? (
        <button
          type="button"
          onClick={() => onOpen(skill)}
          className="flex min-w-0 flex-1 items-start gap-3 rounded-lg text-left focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-current/40"
        >
          {body}
        </button>
      ) : (
        <div className="flex min-w-0 flex-1 items-start gap-3">{body}</div>
      )}
      <div className="shrink-0 pt-0.5">
        <SkillInstallControl
          skill={skill}
          installed={installed}
          installing={installing}
          failed={failed}
          onInstall={onInstall}
        />
      </div>
    </div>
  );
}
