/**
 * RoutineCalendar — the real "Agenda" view (Onda 3): a MONTH grid with the
 * routines' next runs plotted on the days they run, colored by AGENT. Clicking
 * an event opens the routine.
 *
 * Client-side projection from the schedule (reuses lib/schedule):
 *   - daily → every day · weekly → on the checked days · monthly → on the day of the month;
 *   - short interval (min/h) → marks every day with "↻";
 *   - interval in days / once / exotic cron → a single dot on next_run_at.
 * No new backend.
 */
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Repeat } from "lucide-react";

import type { CronJob } from "@/lib/api";
import { parseScheduleString, describeSchedule, type ScheduleDescribeStrings } from "@/lib/schedule";
import { agentColorOf } from "@/lib/agent-colors";
import { useI18n } from "@/i18n";
import { cn } from "@/lib/utils";

function jobProfile(job: CronJob): string {
  return (job.profile || job.profile_name || "default") as string;
}
function jobTitle(job: CronJob): string {
  const n = (job.name || "").trim();
  if (n) return n;
  const p = (job.prompt || "").trim();
  if (p) return p.length > 40 ? p.slice(0, 40) + "…" : p;
  return job.id || "—";
}
function pad2(n: number) {
  return n < 10 ? `0${n}` : String(n);
}
function fmtTime(d: Date) {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

type Plan =
  | { kind: "daily"; time: string }
  | { kind: "weekly"; time: string; weekdays: number[] }
  | { kind: "monthly"; time: string; dom: number }
  | { kind: "interval" }
  | { kind: "point"; date: Date | null };

function planFor(job: CronJob): Plan {
  const exprStr = String(job.schedule?.expr || job.schedule_display || job.schedule?.display || "");
  const st = parseScheduleString(exprStr);
  if (st.mode === "daily") return { kind: "daily", time: st.timeOfDay };
  if (st.mode === "weekly") return { kind: "weekly", time: st.timeOfDay, weekdays: st.weekdays };
  if (st.mode === "monthly") return { kind: "monthly", time: st.timeOfDay, dom: st.dayOfMonth };
  if (st.mode === "interval" && st.intervalUnit !== "days") return { kind: "interval" };
  return { kind: "point", date: job.next_run_at ? new Date(job.next_run_at) : null };
}

interface DayEvent {
  job: CronJob;
  time: string; // "" when it's a short interval
  repeat: boolean;
}

function eventOn(plan: Plan, date: Date, job: CronJob): DayEvent | null {
  switch (plan.kind) {
    case "daily":
      return { job, time: plan.time, repeat: false };
    case "weekly":
      return plan.weekdays.includes(date.getDay()) ? { job, time: plan.time, repeat: false } : null;
    case "monthly":
      return date.getDate() === plan.dom ? { job, time: plan.time, repeat: false } : null;
    case "interval":
      return { job, time: "", repeat: true };
    case "point":
      return plan.date && sameDay(plan.date, date) ? { job, time: fmtTime(plan.date), repeat: false } : null;
  }
}

export function RoutineCalendar({
  jobs,
  strings,
  locale,
  onOpen,
}: {
  jobs: CronJob[];
  strings: ScheduleDescribeStrings;
  locale: string;
  onOpen: (job: CronJob) => void;
}) {
  const { t } = useI18n();
  const today = new Date();
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const plans = useMemo(() => jobs.map((job) => ({ job, plan: planFor(job) })), [jobs]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat(locale || undefined, { month: "long", year: "numeric" }).format(cursor),
    [cursor, locale],
  );

  // 6-week grid starting on the Sunday of the week containing the 1st.
  const cells = useMemo(() => {
    const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
    const start = new Date(first.getFullYear(), first.getMonth(), 1 - first.getDay());
    return Array.from({ length: 42 }, (_, i) => new Date(start.getFullYear(), start.getMonth(), start.getDate() + i));
  }, [cursor]);

  const eventsFor = (date: Date): DayEvent[] => {
    const out: DayEvent[] = [];
    for (const { job, plan } of plans) {
      const ev = eventOn(plan, date, job);
      if (ev) out.push(ev);
    }
    return out.sort((a, b) => (a.time || "99").localeCompare(b.time || "99"));
  };

  const go = (delta: number) => setCursor((c) => new Date(c.getFullYear(), c.getMonth() + delta, 1));
  const goToday = () => setCursor(new Date(today.getFullYear(), today.getMonth(), 1));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      {/* Month bar. */}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => go(-1)}
          aria-label="←"
          className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => go(1)}
          aria-label="→"
          className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        <span className="type-body font-medium capitalize text-foreground">{monthLabel}</span>
        <button
          type="button"
          onClick={goToday}
          className="ml-auto rounded-lg border border-border px-3 py-1.5 type-ui text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          {t.cron.today}
        </button>
      </div>

      {/* Weekday header. */}
      <div className="grid grid-cols-7 gap-px">
        {strings.weekdaysShort.map((d, i) => (
          <div key={i} className="px-2 py-1 type-micro uppercase tracking-wide text-muted-foreground">
            {d}
          </div>
        ))}
      </div>

      {/* Grid. */}
      <div className="grid flex-1 grid-cols-7 grid-rows-6 gap-px overflow-hidden rounded-xl border border-border bg-border">
        {cells.map((date, i) => {
          const inMonth = date.getMonth() === cursor.getMonth();
          const isToday = sameDay(date, today);
          const events = eventsFor(date);
          const visible = events.slice(0, 3);
          const extra = events.length - visible.length;
          return (
            <div
              key={i}
              className={cn(
                "flex min-h-[92px] flex-col gap-1 overflow-hidden bg-background p-1.5",
                !inMonth && "bg-muted/30",
              )}
            >
              <span
                className={cn(
                  "self-end type-micro tabular-nums",
                  isToday
                    ? "grid h-5 w-5 place-items-center rounded-full bg-live font-semibold text-background"
                    : inMonth
                      ? "text-muted-foreground"
                      : "text-text-tertiary",
                )}
              >
                {date.getDate()}
              </span>
              {visible.map((ev, j) => (
                <button
                  key={`${ev.job.id}-${j}`}
                  type="button"
                  onClick={() => onOpen(ev.job)}
                  title={`${describeSchedule(ev.job.schedule, ev.job.schedule_display ?? undefined, strings)} · ${jobProfile(ev.job)}`}
                  className="flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-left type-micro text-foreground transition-colors hover:bg-muted"
                  style={{ borderLeft: `2px solid ${agentColorOf(jobProfile(ev.job))}` }}
                >
                  {ev.repeat ? (
                    <Repeat className="h-2.5 w-2.5 shrink-0 text-muted-foreground" />
                  ) : (
                    <span className="shrink-0 tabular-nums text-muted-foreground">{ev.time}</span>
                  )}
                  <span className="truncate">{jobTitle(ev.job)}</span>
                </button>
              ))}
              {extra > 0 && <span className="px-1.5 type-micro text-muted-foreground">+{extra}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
