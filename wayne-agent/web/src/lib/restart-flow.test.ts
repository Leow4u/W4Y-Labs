import { describe, it, expect } from "vitest";
import {
  hasPendingRestart,
  hydrateRestartFlow,
  initialRestartFlow,
  isRestarting,
  reduceRestartFlow,
  restartNoticeMode,
  type RestartFlowEvent,
  type RestartFlowState,
  type RestartProfile,
  type RestartSource,
} from "./restart-flow";

/** Drives the machine like the hook does: applies events, records the effects. */
function run(events: RestartFlowEvent[], from = initialRestartFlow()) {
  let state: RestartFlowState = from;
  const effects: string[] = [];
  for (const event of events) {
    const result = reduceRestartFlow(state, event);
    state = result.state;
    effects.push(result.effect);
  }
  return { state, effects };
}

const change = (source: RestartSource, auto = true): RestartFlowEvent => ({
  type: "change-applied",
  source,
  auto, profile: null,
});

const ENTRY_POINTS: RestartSource[] = [
  "channel-toggle",
  "channel-config",
  "agent-channel-toggle",
];

describe("reduceRestartFlow — the three entry points", () => {
  it.each(ENTRY_POINTS)("%s restarts for the end user and settles clean", (source) => {
    const { state, effects } = run([change(source), { type: "restart-accepted" }]);
    // The restart is actually REQUESTED — the old code only flagged it.
    expect(effects).toEqual(["restart", "none"]);
    expect(state).toEqual(initialRestartFlow());
    expect(hasPendingRestart(state)).toBe(false);
  });

  it.each(ENTRY_POINTS)("%s leaves the restart to the operator internally", (source) => {
    const { state, effects } = run([change(source, false)]);
    expect(effects).toEqual(["none"]);
    expect(state.phase).toBe("pending");
    expect(state.source).toBe(source);
    // Saved but not live: the "gateway not running" banner must stay away.
    expect(hasPendingRestart(state)).toBe(true);
  });
});

describe("reduceRestartFlow — failure keeps the change pending", () => {
  it("moves to failed and holds the error instead of going idle", () => {
    const { state, effects } = run([
      change("channel-config"),
      { type: "restart-failed", error: "boom" },
    ]);
    expect(effects).toEqual(["restart", "none"]);
    expect(state.phase).toBe("failed");
    expect(state.error).toBe("boom");
    expect(state.source).toBe("channel-config");
    expect(hasPendingRestart(state)).toBe(true);
    expect(isRestarting(state)).toBe(false);
  });

  it("retries from failed and clears the error once accepted", () => {
    const failed = run([
      change("channel-toggle"),
      { type: "restart-failed", error: "boom" },
    ]).state;

    const retry = reduceRestartFlow(failed, { type: "restart-requested", profile: null });
    expect(retry.effect).toBe("restart");
    expect(retry.state.phase).toBe("restarting");
    expect(retry.state.error).toBeNull();

    const done = reduceRestartFlow(retry.state, { type: "restart-accepted" });
    expect(done.effect).toBe("none");
    expect(done.state).toEqual(initialRestartFlow());
  });

  it("stays failed — and retryable — when the retry fails too", () => {
    const { state } = run([
      change("agent-channel-toggle"),
      { type: "restart-failed", error: "first" },
      { type: "restart-requested", profile: null },
      { type: "restart-failed", error: "second" },
    ]);
    expect(state.phase).toBe("failed");
    expect(state.error).toBe("second");
  });
});

describe("reduceRestartFlow — deduplication", () => {
  it("does not fire a second restart for two toggles in a row", () => {
    const { state, effects } = run([change("channel-toggle"), change("channel-toggle")]);
    expect(effects).toEqual(["restart", "none"]);
    expect(state.phase).toBe("restarting");
    expect(state.queued).toEqual([null]);
  });

  it("restarts once more when the in-flight one settles, then stops", () => {
    const { state, effects } = run([
      change("channel-toggle"),
      change("channel-config"),
      { type: "restart-accepted" }, // covers the first change; a newer one exists
      { type: "restart-accepted" }, // covers the queued one
    ]);
    expect(effects).toEqual(["restart", "none", "restart", "none"]);
    expect(state).toEqual(initialRestartFlow());
  });

  it("ignores the manual button while a restart is already in flight", () => {
    const { effects } = run([change("channel-toggle"), { type: "restart-requested", profile: null }]);
    expect(effects).toEqual(["restart", "none"]);
  });

  it("drops the queued follow-up when the in-flight restart fails", () => {
    // The retry the user then presses covers everything written so far, so a
    // queued extra restart would be a duplicate.
    const { state } = run([
      change("channel-toggle"),
      change("channel-toggle"),
      { type: "restart-failed", error: "boom" },
    ]);
    expect(state.queued).toEqual([]);
    expect(reduceRestartFlow(state, { type: "restart-requested", profile: null }).effect).toBe("restart");
  });
});

describe("restartNoticeMode", () => {
  it("hides everything while nothing is pending", () => {
    expect(restartNoticeMode(initialRestartFlow(), false)).toBe("hidden");
    expect(restartNoticeMode(initialRestartFlow(), true)).toBe("hidden");
  });

  it("keeps the automatic restart backstage for the end user", () => {
    const { state } = run([change("channel-toggle")]);
    expect(state.phase).toBe("restarting");
    expect(restartNoticeMode(state, false)).toBe("hidden");
  });

  it("shows the operator notice in the internal view", () => {
    const { state } = run([change("channel-toggle", false)]);
    expect(restartNoticeMode(state, true)).toBe("pending");
  });

  it("shows a retry to the END USER when the automatic restart failed", () => {
    const { state } = run([
      change("channel-toggle"),
      { type: "restart-failed", error: "boom" },
    ]);
    // This is the hole being closed: the user's only path failed and the old
    // screen gated the retry behind ?full=1.
    expect(restartNoticeMode(state, false)).toBe("failed");
    expect(restartNoticeMode(state, true)).toBe("failed");
  });
});

/**
 * Phase 2 — the four channel defects. Each test below is a defect that shipped,
 * not a hypothetical.
 */
describe("restart targets the right gateway", () => {
  it("carries the profile from the change to the restart", () => {
    // The write went to profile=vendas and the restart bounced the GLOBAL
    // gateway: the agent's channel stayed dead and an unrelated gateway was
    // restarted for nothing.
    const r = reduceRestartFlow(initialRestartFlow(), {
      type: "change-applied",
      source: "agent-channel-toggle",
      auto: true,
      profile: "vendas",
    });
    expect(r.effect).toBe("restart");
    expect(r.state.profile).toBe("vendas");
  });

  it("keeps the global target as null", () => {
    const r = reduceRestartFlow(initialRestartFlow(), {
      type: "change-applied",
      source: "channel-toggle",
      auto: true,
      profile: null,
    });
    expect(r.state.profile).toBeNull();
  });
});

describe("queueing while a restart is in flight", () => {
  const restarting = reduceRestartFlow(initialRestartFlow(), {
    type: "change-applied",
    source: "channel-toggle",
    auto: true,
    profile: "vendas",
  }).state;

  it("queues the SAME profile exactly once, never two concurrent runs", () => {
    let s = restarting;
    for (let i = 0; i < 3; i += 1) {
      const r = reduceRestartFlow(s, {
        type: "change-applied",
        source: "channel-toggle",
        auto: true,
        profile: "vendas",
      });
      expect(r.effect).toBe("none"); // no second concurrent restart
      s = r.state;
    }
    expect(s.queued).toEqual(["vendas"]);

    const done = reduceRestartFlow(s, { type: "restart-accepted" });
    expect(done.effect).toBe("restart"); // exactly one extra run
    expect(done.state.profile).toBe("vendas");
    expect(reduceRestartFlow(done.state, { type: "restart-accepted" }).effect).toBe("none");
  });

  it("queues a DIFFERENT profile as its own run — it is another gateway", () => {
    // Collapsing them into one flag meant the second agent's change never went
    // live: its restart was swallowed by the first one's.
    const r = reduceRestartFlow(restarting, {
      type: "change-applied",
      source: "agent-channel-toggle",
      auto: true,
      profile: "suporte",
    });
    expect(r.state.queued).toEqual(["suporte"]);
    const next = reduceRestartFlow(r.state, { type: "restart-accepted" });
    expect(next.effect).toBe("restart");
    expect(next.state.profile).toBe("suporte");
  });

  it("drains a mixed queue one gateway at a time", () => {
    let s = restarting;
    for (const profile of ["suporte", "vendas", "suporte", null]) {
      s = reduceRestartFlow(s, {
        type: "change-applied",
        source: "channel-toggle",
        auto: true,
        profile,
      }).state;
    }
    expect(s.queued).toEqual(["suporte", "vendas", null]);
    // "vendas" is re-queued on purpose even though it is the one running: the
    // in-flight restart may already have read config, so the newer change needs
    // its own run. Each gateway is then drained exactly once, in order.
    let cur = s;
    for (const expected of ["suporte", "vendas", null]) {
      const r = reduceRestartFlow(cur, { type: "restart-accepted" });
      expect(r.effect).toBe("restart");
      expect(r.state.profile).toBe(expected);
      cur = r.state;
    }
    expect(reduceRestartFlow(cur, { type: "restart-accepted" }).effect).toBe("none");
  });

  it("a manual press for the profile already restarting does nothing", () => {
    const r = reduceRestartFlow(restarting, { type: "restart-requested", profile: "vendas" });
    expect(r.effect).toBe("none");
    expect(r.state.queued).toEqual([]);
  });
});

describe("hydrateRestartFlow — surviving a remount", () => {
  it("rebuilds pending from the backend's own pending_restart", () => {
    const s = hydrateRestartFlow({ pending: true, reasons: ["disable"] }, "vendas");
    expect(s).toMatchObject({ phase: "pending", profile: "vendas", hydrated: true });
  });

  it("stays null when nothing is waiting", () => {
    expect(hydrateRestartFlow({ pending: false, reasons: [] }, null)).toBeNull();
  });

  it("shows the notice to the END USER, not only the internal view", () => {
    // The whole point: after a remount nobody is acting on it, so a user with
    // no affordance is stuck exactly as before.
    const s = hydrateRestartFlow({ pending: true, reasons: ["enable"] }, null)!;
    expect(restartNoticeMode(s, false)).toBe("pending");
  });

  it("an in-session pending stays backstage for the end user", () => {
    const s = reduceRestartFlow(initialRestartFlow(), {
      type: "change-applied",
      source: "channel-toggle",
      auto: false,
      profile: null,
    }).state;
    expect(restartNoticeMode(s, false)).toBe("hidden");
    expect(restartNoticeMode(s, true)).toBe("pending");
  });
});

/**
 * Round 3: a failure on one gateway must not throw away another one's change.
 *
 * `restart-failed` used to clear the whole queue. With one gateway that was
 * defensible (the retry re-reads that profile's config from disk). With two it
 * silently discarded the other agent's saved change — and the retry the user
 * pressed restarts the FAILED profile, which cannot apply anybody else's
 * config. The change was simply lost, with the screen showing success.
 */
describe("a failure never drains another profile's queue", () => {
  const startWith = (profile: RestartProfile) =>
    reduceRestartFlow(initialRestartFlow(), {
      type: "change-applied",
      source: "channel-toggle",
      auto: true,
      profile,
    }).state;

  const queue = (state: RestartFlowState, profile: RestartProfile) =>
    reduceRestartFlow(state, {
      type: "change-applied",
      source: "channel-toggle",
      auto: true,
      profile,
    }).state;

  it("A failing keeps B queued", () => {
    let s = startWith("vendas");
    s = queue(s, "suporte");
    s = reduceRestartFlow(s, { type: "restart-failed", error: "boom" }).state;
    expect(s.phase).toBe("failed");
    expect(s.queued).toEqual(["suporte"]); // B's change is still owed
  });

  it("global failing keeps an agent queued", () => {
    let s = startWith(null);
    s = queue(s, "vendas");
    s = reduceRestartFlow(s, { type: "restart-failed", error: "boom" }).state;
    expect(s.queued).toEqual(["vendas"]);
  });

  it("an agent failing keeps global queued", () => {
    let s = startWith("vendas");
    s = queue(s, null);
    s = reduceRestartFlow(s, { type: "restart-failed", error: "boom" }).state;
    expect(s.queued).toEqual([null]);
  });

  it("only the FAILED profile is dropped — its retry re-reads that config", () => {
    let s = startWith("vendas");
    s = queue(s, "vendas"); // a change landed mid-restart for the same profile
    s = queue(s, "suporte");
    s = reduceRestartFlow(s, { type: "restart-failed", error: "boom" }).state;
    expect(s.queued).toEqual(["suporte"]);
  });

  it("retrying the failed profile still leaves the others queued", () => {
    let s = startWith("vendas");
    s = queue(s, "suporte");
    s = reduceRestartFlow(s, { type: "restart-failed", error: "boom" }).state;
    const retry = reduceRestartFlow(s, { type: "restart-requested", profile: "vendas" });
    expect(retry.effect).toBe("restart");
    expect(retry.state.profile).toBe("vendas");
    expect(retry.state.queued).toEqual(["suporte"]); // NOT wiped by the retry
    // …and when the retry lands, suporte is next in line.
    const after = reduceRestartFlow(retry.state, { type: "restart-accepted" });
    expect(after.effect).toBe("restart");
    expect(after.state.profile).toBe("suporte");
  });

  it("starting a fresh restart does not discard a waiting profile", () => {
    let s = startWith("vendas");
    s = queue(s, "suporte");
    s = reduceRestartFlow(s, { type: "restart-failed", error: "boom" }).state;
    const fresh = reduceRestartFlow(s, {
      type: "change-applied",
      source: "channel-config",
      auto: true,
      profile: "vendas",
    });
    expect(fresh.state.queued).toEqual(["suporte"]);
  });
});
