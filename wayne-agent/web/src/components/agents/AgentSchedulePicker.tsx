/**
 * AgentSchedulePicker — the schedule composer for the agent's routines.
 *
 * Feedback 10/07 ("the user is the one who chooses the routine; they can pick
 * whatever time and day they want"): it isn't 3 fixed presets — the user
 * freely composes frequency + time + day. Reuses the native logic from the
 * Cron screen (lib/schedule: ScheduleBuilderState + buildScheduleString) and
 * the labels already translated ×16 (t.cron.scheduleModes, with the day names)
 * — zero new i18n. Editorial style to match the agent's form; no raw-cron
 * escape hatch (that lives in the chat in natural language) and no "uma vez"
 * (routine = recurring). Controlled: the parent owns the ScheduleBuilderState.
 */
import { useI18n } from "@/i18n";
import {
  WEEKDAY_INDEXES,
  type IntervalUnit,
  type ScheduleBuilderState,
  type ScheduleMode,
  type Weekday,
} from "@/lib/schedule";
import { cn } from "@/lib/utils";

const inputCls =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-live/50";

// Modes that make sense for an agent routine (no "once"/"custom").
const MODES: ScheduleMode[] = ["daily", "weekly", "monthly", "interval"];

export function AgentSchedulePicker({
  value,
  onChange,
}: {
  value: ScheduleBuilderState;
  onChange: (state: ScheduleBuilderState) => void;
}) {
  const { t } = useI18n();
  const m = t.cron.scheduleModes;
  const freqLabel = t.cron.scheduleMode ?? m.timeOfDay;
  const patch = (p: Partial<ScheduleBuilderState>) => onChange({ ...value, ...p });
  const toggleWeekday = (d: Weekday) => {
    const on = value.weekdays.includes(d);
    patch({
      weekdays: on ? value.weekdays.filter((x) => x !== d) : [...value.weekdays, d],
    });
  };
  // If an exotic schedule came in (parse landed on once/custom), show it as daily.
  const mode = MODES.includes(value.mode) ? value.mode : "daily";
  const hasTime = mode === "daily" || mode === "weekly" || mode === "monthly";

  return (
    <div className="grid gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <select
          className={cn(inputCls, "flex-1")}
          value={mode}
          onChange={(e) => patch({ mode: e.target.value as ScheduleMode })}
          aria-label={freqLabel}
        >
          <option value="daily">{m.daily}</option>
          <option value="weekly">{m.weekly}</option>
          <option value="monthly">{m.monthly}</option>
          <option value="interval">{m.interval}</option>
        </select>

        {hasTime && (
          <input
            type="time"
            className={cn(inputCls, "shrink-0")}
            value={value.timeOfDay}
            onChange={(e) => patch({ timeOfDay: e.target.value })}
            aria-label={m.timeOfDay}
          />
        )}

        {mode === "monthly" && (
          <label className="flex shrink-0 items-center gap-1.5 text-sm text-muted-foreground">
            {m.dayOfMonth}
            <input
              type="number"
              min={1}
              max={31}
              className={cn(inputCls, "w-16")}
              value={String(value.dayOfMonth)}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                patch({ dayOfMonth: Number.isFinite(n) && n >= 1 && n <= 31 ? n : 1 });
              }}
            />
          </label>
        )}

        {mode === "interval" && (
          <div className="flex shrink-0 items-center gap-2">
            <input
              type="number"
              min={1}
              max={9999}
              className={cn(inputCls, "w-16")}
              value={String(value.intervalValue)}
              onChange={(e) => {
                const n = parseInt(e.target.value, 10);
                patch({ intervalValue: Number.isFinite(n) && n > 0 ? n : 1 });
              }}
              aria-label={m.intervalEvery}
            />
            <select
              className={inputCls}
              value={value.intervalUnit}
              onChange={(e) => patch({ intervalUnit: e.target.value as IntervalUnit })}
              aria-label={m.intervalUnit}
            >
              <option value="minutes">{m.unitMinutes}</option>
              <option value="hours">{m.unitHours}</option>
              <option value="days">{m.unitDays}</option>
            </select>
          </div>
        )}
      </div>

      {mode === "weekly" && (
        <div className="flex flex-wrap gap-1.5" role="group" aria-label={m.weekdays}>
          {WEEKDAY_INDEXES.map((d) => {
            const on = value.weekdays.includes(d);
            return (
              <button
                key={d}
                type="button"
                aria-pressed={on}
                onClick={() => toggleWeekday(d)}
                className={cn(
                  "min-w-[2.75rem] rounded-lg border px-2 py-1.5 text-xs font-medium transition-colors",
                  on
                    ? "border-live bg-live/10 text-live"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {m.weekdaysShort[d]}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
