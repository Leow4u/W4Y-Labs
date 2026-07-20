/**
 * delegate-draft — the brain behind "Delegar um objetivo" (Operations): turns
 * the owner's objective into an editable TEAM PLAN — 2-6 concrete subtasks
 * assigned across the roster, with dependencies (parallel when independent)
 * and at most ONE recurring routine.
 *
 * Zero new backend: same throwaway-gateway-session pattern as agent-draft —
 * opens a THROWAWAY session (session.create), runs ONE turn on the fast model
 * (gemini flash, low) instructed to answer with JSON ONLY, parses it and
 * DELETES the session (so it doesn't pollute "Recentes").
 */
import { api } from "@/lib/api";
import { GatewayClient } from "@/lib/gatewayClient";
import { DEFAULT_SCHEDULE_STATE, type ScheduleBuilderState, type Weekday } from "@/lib/schedule";

export interface PlanStep {
  title: string;
  body: string;
  /** Roster profile slug that executes this step (validated against roster). */
  assignee: string;
  /** Indices of steps that must finish first (empty = starts immediately). */
  depends_on: number[];
  /** At most ONE step per plan is a routine — and it must have NO dependents. */
  recurring: null | { frequency: string; time: string; weekdays?: string[] };
}

export interface TeamPlan {
  steps: PlanStep[];
}

export interface RosterEntry {
  name: string;
  description: string;
}

/** LLM weekday tokens → cron weekday indexes (Sunday = 0, croniter convention). */
const WEEKDAY_TOKEN: Record<string, Weekday> = {
  sun: 0,
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
};

/** Converts a recurring marker into the structured schedule the Cron screen
 *  uses (becomes a backend string via buildScheduleString on create).
 *  Defensive: any invalid field falls back to daily 9am. */
export function scheduleStateFromRecurring(
  rec: NonNullable<PlanStep["recurring"]>,
): ScheduleBuilderState {
  const time = /^\d{1,2}:\d{2}$/.test(rec.time) ? rec.time : "09:00";
  if (rec.frequency === "weekly") {
    const wd = (rec.weekdays ?? [])
      .map((t) => WEEKDAY_TOKEN[t.toLowerCase()])
      .filter((d): d is Weekday => d !== undefined);
    return {
      ...DEFAULT_SCHEDULE_STATE,
      mode: "weekly",
      timeOfDay: time,
      weekdays: wd.length ? [...new Set(wd)] : [1],
    };
  }
  return { ...DEFAULT_SCHEDULE_STATE, mode: "daily", timeOfDay: time };
}

/**
 * Dependency depth per step (0 = starts immediately). Used by the preview to
 * lay the plan out as columns. Relaxation with a hard pass cap so a cycle the
 * LLM sneaks in can never hang the UI.
 */
export function planStepDepths(steps: PlanStep[]): number[] {
  const depths = steps.map(() => 0);
  for (let pass = 0; pass < steps.length; pass++) {
    let changed = false;
    steps.forEach((s, i) => {
      for (const p of s.depends_on) {
        if (p >= 0 && p < steps.length && depths[i] < depths[p] + 1) {
          depths[i] = depths[p] + 1;
          changed = true;
        }
      }
    });
    if (!changed) break;
  }
  return depths;
}

/**
 * Creation order: every step comes after its parents (Kahn-style). Defensive
 * cycle break: if no step can be placed, the leftovers are appended as
 * parentless work instead of looping forever.
 */
export function topologicalOrder(steps: PlanStep[]): number[] {
  const order: number[] = [];
  const placed = new Set<number>();
  while (order.length < steps.length) {
    let progressed = false;
    steps.forEach((s, i) => {
      if (placed.has(i)) return;
      if (s.depends_on.every((p) => placed.has(p))) {
        order.push(i);
        placed.add(i);
        progressed = true;
      }
    });
    if (!progressed) {
      steps.forEach((_, i) => {
        if (!placed.has(i)) {
          order.push(i);
          placed.add(i);
        }
      });
    }
  }
  return order;
}

/** Instruction for the throwaway turn — English, strict JSON output. */
function buildInstruction(objective: string, roster: RosterEntry[]): string {
  const rosterLines = roster
    .map((r) => `- ${r.name}: ${r.description || "(no specialty listed)"}`)
    .join("\n");
  return `You are the delegation planner for a team of AI agents. Do NOT use tools. Reply ONLY with a valid JSON object (no markdown, no code fences, no comments) exactly in this shape:
{"steps":[{"title":"short imperative subtask title","body":"1-3 sentences of concrete instructions for the assignee","assignee":"exact roster name","depends_on":[zero-based indices of steps that must finish first],"recurring":null}]}
Rules:
- Split the objective into 2 to 6 concrete subtasks.
- Assign each subtask to the BEST-suited roster member below, using its EXACT name.
- "depends_on" lists the zero-based indices of steps that must finish before this one starts; an empty list means it starts immediately. Parallel steps are allowed and encouraged when they are independent.
- At most ONE step may be a recurring routine (e.g. publish 3x/week). Mark it with "recurring": {"frequency":"daily"|"weekly","time":"HH:MM","weekdays":["mon","wed","fri"]} ("weekdays" only when frequency is "weekly") — and NO other step may depend on it. Every other step keeps "recurring": null.
Roster:
${rosterLines}
Objective: ${objective}`;
}

/** Extracts the first plausible JSON object from the model's text and
 *  normalizes it into a valid plan. Returns null when unusable. */
function parsePlan(text: string, roster: RosterEntry[]): TeamPlan | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  const names = roster.map((r) => r.name);
  if (names.length === 0) return null;
  try {
    const raw = JSON.parse(text.slice(start, end + 1)) as { steps?: unknown };
    if (!raw || !Array.isArray(raw.steps)) return null;
    // Clamp 2-6: hard-cap at 6; a 1-step answer is still accepted (we can't
    // invent a second subtask the model didn't propose).
    const list = raw.steps
      .filter((s): s is Record<string, unknown> => Boolean(s) && typeof s === "object")
      .slice(0, 6);
    const count = list.length;
    if (count === 0) return null;

    const byLower = new Map(names.map((n) => [n.toLowerCase(), n]));
    let recurringSeen = false;
    const steps: PlanStep[] = list.map((s, i) => {
      const title =
        String(s.title ?? "").trim().slice(0, 120) ||
        String(s.body ?? "").trim().slice(0, 80) ||
        `#${i + 1}`;
      const body = String(s.body ?? "").trim();
      // Assignee must be an exact roster name; fallback: first roster name.
      const assignee =
        byLower.get(String(s.assignee ?? "").trim().toLowerCase()) ?? names[0];
      const depends = (Array.isArray(s.depends_on) ? s.depends_on : []).filter(
        (n): n is number => Number.isInteger(n) && n >= 0 && n < count && n !== i,
      );
      let recurring: PlanStep["recurring"] = null;
      const rec = s.recurring;
      // At most ONE recurring step per plan — first one wins.
      if (!recurringSeen && rec && typeof rec === "object") {
        const r = rec as { frequency?: unknown; time?: unknown; weekdays?: unknown };
        const frequency = r.frequency === "weekly" ? "weekly" : "daily";
        const time =
          typeof r.time === "string" && /^\d{1,2}:\d{2}$/.test(r.time) ? r.time : "09:00";
        const weekdays = Array.isArray(r.weekdays)
          ? r.weekdays
              .filter(
                (d): d is string =>
                  typeof d === "string" && d.toLowerCase() in WEEKDAY_TOKEN,
              )
              .map((d) => d.toLowerCase())
          : [];
        recurring = {
          frequency,
          time,
          ...(frequency === "weekly" && weekdays.length ? { weekdays } : {}),
        };
        recurringSeen = true;
      }
      return { title, body, assignee, depends_on: [...new Set(depends)], recurring };
    });

    // A routine must have NO dependents (it fires on a schedule, it never
    // "finishes"). If any step depends on the recurring one, demote it back to
    // a plain step — safer than silently dropping the dependency.
    const recIdx = steps.findIndex((s) => s.recurring);
    if (recIdx >= 0 && steps.some((s, i) => i !== recIdx && s.depends_on.includes(recIdx))) {
      steps[recIdx] = { ...steps[recIdx], recurring: null };
    }
    return { steps };
  } catch {
    return null;
  }
}

/**
 * Generates a team plan for the objective. Throwaway session: flash + low,
 * one turn, deleted from history at the end. Throws on timeout/parse-fail.
 */
export async function draftPlan(
  objective: string,
  roster: RosterEntry[],
): Promise<TeamPlan> {
  const gw = new GatewayClient();
  let storedId: string | null = null;
  try {
    await gw.connect();
    const created = await gw.request<{ session_id: string; stored_session_id?: string }>(
      "session.create",
      {
        title: "Rascunho de delegação",
        model: "google/gemini-3.5-flash",
        provider: "openrouter",
        reasoning_effort: "low",
      },
    );
    storedId = created.stored_session_id ?? null;

    const text = await new Promise<string>((resolve, reject) => {
      const timer = window.setTimeout(() => {
        off();
        reject(new Error("plan draft timeout"));
      }, 90_000);
      const off = gw.on<{ text?: string; status?: string }>("message.complete", (ev) => {
        // Only the turn from OUR throwaway session.
        if ((ev as { session_id?: string }).session_id !== created.session_id) return;
        window.clearTimeout(timer);
        off();
        resolve(ev.payload?.text ?? "");
      });
      void gw
        .request("prompt.submit", {
          session_id: created.session_id,
          text: buildInstruction(objective, roster),
        })
        .catch((e) => {
          window.clearTimeout(timer);
          off();
          reject(e instanceof Error ? e : new Error(String(e)));
        });
    });

    const plan = parsePlan(text, roster);
    if (!plan) throw new Error("plan parse failed");
    return plan;
  } finally {
    gw.close();
    // Clears the draft from history (best-effort — does not block the flow).
    if (storedId) void api.deleteSession(storedId).catch(() => {});
  }
}
