import { describe, it, expect } from "vitest";
import {
  hasPendingRestart,
  initialRestartFlow,
  isRestarting,
  reduceRestartFlow,
  restartNoticeMode,
  type RestartFlowEvent,
  type RestartFlowState,
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
  auto,
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

    const retry = reduceRestartFlow(failed, { type: "restart-requested" });
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
      { type: "restart-requested" },
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
    expect(state.queued).toBe(true);
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
    const { effects } = run([change("channel-toggle"), { type: "restart-requested" }]);
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
    expect(state.queued).toBe(false);
    expect(reduceRestartFlow(state, { type: "restart-requested" }).effect).toBe("restart");
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
