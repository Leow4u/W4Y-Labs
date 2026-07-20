/**
 * AchievementsPage — "Conquistas" (native product screen).
 *
 * Replaces the wayne-achievements plugin's own dashboard bundle, which was
 * hard-wired to English copy and brand-named the agent runtime ("Wayne
 * Achievements", "run Wayne more"). The route `/achievements` is registered in
 * BUILTIN_ROUTES_CORE, and `buildRoutes` skips any plugin addon whose path
 * already exists in the built-in map — so this page wins while the plugin's
 * REST surface (/api/plugins/wayne-achievements) remains the data source.
 *
 * Reached from the user-chip menu (AuthWidget → "Conquistas"), not from the
 * sidebar: it is a personal, occasional surface, not a work tool.
 *
 * Design rules: no monospace in chrome, 13px floor for readable text (12px only
 * for uppercase section labels), design tokens instead of raw palette colors,
 * GREEN for earned and neutral gray for locked (terracotta now means "needs
 * you", so it must not read as success).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  AudioLines,
  Award,
  BookOpen,
  Box,
  Calendar,
  Camera,
  Check,
  Clock,
  Code,
  Compass,
  Cpu,
  Database,
  Eye,
  FileText,
  Flame,
  FolderOpen,
  Footprints,
  Gem,
  GitBranch,
  Globe,
  Hammer,
  Image,
  KeyRound,
  Landmark,
  Layers,
  Loader2,
  Lock,
  MousePointerClick,
  Network,
  Package,
  Pencil,
  Plug,
  Puzzle,
  Quote,
  Radio,
  RefreshCw,
  Repeat,
  Rocket,
  RotateCw,
  Router,
  Ruler,
  ScrollText,
  Ship,
  Shuffle,
  Sparkles,
  Terminal,
  Timer,
  Trophy,
  Undo2,
  Wand2,
  Wine,
  Zap,
  type LucideIcon,
} from "lucide-react";

import { Button } from "@nous-research/ui/ui/components/button";
import { api } from "@/lib/api";
import type { AchievementItem, AchievementsResponse } from "@/lib/api";
import { usePageHeader } from "@/contexts/usePageHeader";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Catalog helpers                                                     */
/* ------------------------------------------------------------------ */

/**
 * The plugin catalog is authored in English and brand-names the runtime.
 * The product surface only ever says Work4You.
 */
function sanitize(text: string): string {
  return text
    .replace(/\bWayne Agent\b/g, "Work4You")
    .replace(/\bWayne\b/g, "Work4You");
}

/** Plugin icon slug → lucide glyph. Unknown slugs fall back to a medal. */
const ICONS: Record<string, LucideIcon> = {
  antenna: Radio,
  anvil: Hammer,
  avalanche: Layers,
  blueprint: Ruler,
  branch: GitBranch,
  browser: Globe,
  cache: Database,
  calendar: Calendar,
  clock: Clock,
  codex: BookOpen,
  colon: Code,
  compass: Compass,
  container: Box,
  crystal: Gem,
  daemon: Cpu,
  docs: FileText,
  dragon: Flame,
  eye: Eye,
  flame: Flame,
  folder: FolderOpen,
  hammer_scroll: Hammer,
  key: KeyRound,
  lock: Lock,
  marathon: Footprints,
  melting_clock: Timer,
  moon: Clock,
  needle: MousePointerClick,
  nodes: Network,
  package_skull: Package,
  palace: Landmark,
  pencil: Pencil,
  pixel: Image,
  plug: Plug,
  prism: Sparkles,
  puzzle: Puzzle,
  quote: Quote,
  restart: RotateCw,
  rewind: Undo2,
  rocket: Rocket,
  router: Router,
  scroll: ScrollText,
  screenshot: Camera,
  secret: Lock,
  ship: Ship,
  spark_cursor: Zap,
  spiral: Repeat,
  swap: Shuffle,
  terminal: Terminal,
  wand: Wand2,
  warning: AlertTriangle,
  wave: AudioLines,
  wine: Wine,
};

function iconFor(item: AchievementItem): LucideIcon {
  if (item.state === "secret") return Lock;
  return ICONS[item.icon] ?? Award;
}

type Filter = "all" | "earned" | "locked";

/** Percentage clamped to the 0-100 the bar can actually paint. */
function pct(item: AchievementItem): number {
  const raw = Number(item.progress_pct);
  if (!Number.isFinite(raw)) return 0;
  return Math.max(0, Math.min(100, Math.round(raw)));
}

/* ------------------------------------------------------------------ */
/* Card                                                                */
/* ------------------------------------------------------------------ */

function AchievementCard({ item }: { item: AchievementItem }) {
  const { t, locale } = useI18n();
  const tt = t.achievementsPage;
  const Icon = iconFor(item);
  const earned = item.unlocked;
  const secret = item.state === "secret";

  const name = secret ? tt.secretTitle : sanitize(item.name);
  const description = secret ? tt.secretBody : sanitize(item.description);

  const earnedLabel = (() => {
    if (!item.unlocked_at) return tt.earnedNoDate;
    const d = new Date(item.unlocked_at * 1000);
    if (Number.isNaN(d.getTime())) return tt.earnedNoDate;
    return tt.earnedOn.replace(
      "{date}",
      d.toLocaleDateString(locale, {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }),
    );
  })();

  const value = pct(item);

  return (
    <article
      className={cn(
        "flex gap-3 rounded-xl border bg-card p-4 transition-colors",
        earned ? "border-success/35" : "border-border",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "grid h-10 w-10 shrink-0 place-items-center rounded-full",
          earned
            ? "bg-success/15 text-success"
            : "bg-muted text-muted-foreground",
        )}
      >
        <Icon className="h-5 w-5" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex items-start gap-2">
          <h3
            className={cn(
              "min-w-0 flex-1 text-sm font-semibold leading-5",
              earned ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {name}
          </h3>
          {earned && (
            <Check
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-success"
            />
          )}
        </div>

        <p className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted-foreground">
          {description}
        </p>

        {earned ? (
          <p className="mt-2.5 text-[13px] font-medium text-success">
            {earnedLabel}
            {item.tier ? ` · ${item.tier}` : ""}
          </p>
        ) : (
          <div className="mt-2.5">
            <div
              aria-hidden="true"
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full rounded-full bg-foreground/30"
                style={{ width: `${value}%` }}
              />
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              {value}%
              {item.next_tier ? ` · ${tt.goal.replace("{tier}", item.next_tier)}` : ""}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function AchievementsPage() {
  const { t } = useI18n();
  const tt = t.achievementsPage;
  const { setTitle } = usePageHeader();
  const navigate = useNavigate();

  const [data, setData] = useState<AchievementsResponse | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    setTitle(tt.title);
    return () => setTitle(null);
  }, [setTitle, tt.title]);

  const load = useCallback(() => {
    setFailed(false);
    return api
      .getAchievements()
      .then((r) => setData(r))
      .catch(() => setFailed(true));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const refresh = useCallback(() => {
    setBusy(true);
    void api
      .rescanAchievements()
      .then((r) => setData(r))
      .catch(() => setFailed(true))
      .finally(() => setBusy(false));
  }, []);

  const items = useMemo(() => data?.achievements ?? [], [data]);
  const earnedCount = items.filter((a) => a.unlocked).length;
  const inProgressCount = items.filter(
    (a) => !a.unlocked && a.state !== "secret",
  ).length;

  /** Categories, in catalog order, with the visible items of each. */
  const groups = useMemo(() => {
    const visible = items.filter((a) => {
      if (filter === "earned") return a.unlocked;
      if (filter === "locked") return !a.unlocked;
      return true;
    });
    const out = new Map<string, AchievementItem[]>();
    for (const a of visible) {
      const key = a.category || "—";
      const bucket = out.get(key);
      if (bucket) bucket.push(a);
      else out.set(key, [a]);
    }
    for (const bucket of out.values()) {
      bucket.sort((a, b) => {
        if (a.unlocked !== b.unlocked) return a.unlocked ? -1 : 1;
        return pct(b) - pct(a);
      });
    }
    return [...out.entries()];
  }, [items, filter]);

  const loading = !data && !failed;

  const filters: Array<{ key: Filter; label: string }> = [
    { key: "all", label: tt.filterAll },
    { key: "earned", label: tt.filterEarned },
    { key: "locked", label: tt.filterLocked },
  ];

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-foreground">{tt.title}</h1>
          <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
            {tt.subtitle}
          </p>
        </div>
        {data && (
          <Button
            className="gap-2 text-[13px]"
            ghost
            disabled={busy}
            onClick={refresh}
            size="sm"
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            {tt.refresh}
          </Button>
        )}
      </header>

      {loading && (
        <p className="mt-10 flex items-center gap-2 text-[13px] text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {tt.loading}
        </p>
      )}

      {failed && !data && (
        <div className="mt-8 rounded-xl border border-border bg-card p-6">
          <h2 className="text-sm font-semibold text-foreground">
            {tt.unavailableTitle}
          </h2>
          <p className="mt-1.5 max-w-prose text-[13px] leading-5 text-muted-foreground">
            {tt.unavailableBody}
          </p>
          <Button
            className="mt-4 text-[13px]"
            onClick={() => void load()}
            ghost
            size="sm"
          >
            {tt.retry}
          </Button>
        </div>
      )}

      {data && (
        <>
          <dl className="mt-6 grid grid-cols-3 gap-3">
            {[
              { label: tt.statEarned, value: earnedCount, good: true },
              { label: tt.statInProgress, value: inProgressCount, good: false },
              { label: tt.statTotal, value: items.length, good: false },
            ].map((stat) => (
              <div
                className="rounded-xl border border-border bg-card px-4 py-3"
                key={stat.label}
              >
                <dt className="text-xs uppercase tracking-wider text-muted-foreground">
                  {stat.label}
                </dt>
                <dd
                  className={cn(
                    "mt-1 text-2xl font-semibold tabular-nums",
                    stat.good && stat.value > 0
                      ? "text-success"
                      : "text-foreground",
                  )}
                >
                  {stat.value}
                </dd>
              </div>
            ))}
          </dl>

          {earnedCount === 0 ? (
            <div className="mt-6 rounded-xl border border-border bg-card p-6">
              <span
                aria-hidden="true"
                className="grid h-10 w-10 place-items-center rounded-full bg-muted text-muted-foreground"
              >
                <Trophy className="h-5 w-5" />
              </span>
              <h2 className="mt-3 text-sm font-semibold text-foreground">
                {tt.emptyTitle}
              </h2>
              <p className="mt-1.5 max-w-prose text-[13px] leading-5 text-muted-foreground">
                {tt.emptyBody}
              </p>
              <Button
                className="mt-4 text-[13px]"
                onClick={() => navigate("/chat?new=1")}
                size="sm"
              >
                {tt.emptyCta}
              </Button>
            </div>
          ) : (
            <>
              <div className="mt-6 flex flex-wrap gap-1.5">
                {filters.map((f) => (
                  <button
                    aria-pressed={filter === f.key}
                    className={cn(
                      "rounded-full border px-3 py-1.5 text-[13px] transition-colors",
                      filter === f.key
                        ? "border-foreground/25 bg-muted text-foreground"
                        : "border-border text-muted-foreground hover:text-foreground",
                    )}
                    key={f.key}
                    onClick={() => setFilter(f.key)}
                    type="button"
                  >
                    {f.label}
                  </button>
                ))}
              </div>

              {groups.length === 0 ? (
                <p className="mt-8 text-[13px] text-muted-foreground">
                  {tt.filterEmpty}
                </p>
              ) : (
                groups.map(([category, bucket]) => (
                  <section className="mt-8" key={category}>
                    <h2 className="text-xs uppercase tracking-wider text-muted-foreground">
                      {sanitize(category)}
                    </h2>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {bucket.map((item) => (
                        <AchievementCard item={item} key={item.id} />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
