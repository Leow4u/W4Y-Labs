/**
 * Restart flow — the state machine behind "this change only goes live after
 * the gateway restarts".
 *
 * Three entry points write channel config and all three used to stop halfway:
 * the Channels toggle, the Channels config modal ("save and turn on") and the
 * per-agent toggle in the agent drawer. Each one marked the change as pending
 * and then left the restart to somebody else — while the button that resolves
 * it lives behind the internal view (?full=1). For the end user that meant a
 * badge stuck on "applying…" with no way out, and when the automatic restart
 * failed there was no visible second chance at all.
 *
 * Keeping the transitions here — pure, no React, no api — is what lets the
 * three entry points share ONE behaviour instead of three near-copies, and
 * what makes the behaviour testable without a DOM.
 */

/** Which entry point produced the change waiting to go live. */
export type RestartSource = "channel-toggle" | "channel-config" | "agent-channel-toggle";

export type RestartPhase =
  /** Nothing waiting: what is on screen is what the gateway is running. */
  | "idle"
  /** Saved, restart deliberately NOT fired — the operator owns the button. */
  | "pending"
  /** A restart request is in flight. */
  | "restarting"
  /** The restart request was rejected; the change is saved but not live. */
  | "failed";

/**
 * Which gateway a restart targets: an agent's profile slug, or null for the
 * global one. Channels are profile-scoped end to end — the config write already
 * carries `profile`, and `POST /api/gateway/restart` takes `?profile=`. Losing
 * it between those two points restarts the WRONG gateway: the agent's change
 * stays dead while the global one is bounced for nothing.
 */
export type RestartProfile = string | null;

/** Stable key for a target, so "global" and "" never split into two entries. */
export function restartProfileKey(profile: RestartProfile): string {
  return profile || "";
}

export interface RestartFlowState {
  phase: RestartPhase;
  source: RestartSource | null;
  /** Raw failure text, kept so the retry affordance can explain itself. */
  error: string | null;
  /** The gateway this phase is about — null means the global one. */
  profile: RestartProfile;
  /**
   * Targets whose change landed mid-restart, deduplicated by profile.
   *
   * A list rather than a flag because the targets are DIFFERENT gateways: a
   * change on agent A while agent B is restarting is not the same change, and
   * collapsing them meant A's config never went live.
   */
  queued: RestartProfile[];
  /**
   * True when this phase was rebuilt from the backend rather than produced by
   * an action in this session — i.e. nobody is currently acting on it.
   */
  hydrated?: boolean;
}

export type RestartFlowEvent =
  /**
   * A change was persisted. `auto` is false for the internal view, where the
   * restart stays a manual operator step.
   */
  | { type: "change-applied"; source: RestartSource; auto: boolean; profile: RestartProfile }
  /** Manual restart: the operator button, or the user's "try again". */
  | { type: "restart-requested"; profile: RestartProfile }
  /** The restart FINISHED successfully — not merely that it was spawned. */
  | { type: "restart-accepted" }
  | { type: "restart-failed"; error: string };

/** Whether the caller must actually issue the restart request. */
export type RestartEffect = "none" | "restart";

export interface RestartFlowResult {
  state: RestartFlowState;
  effect: RestartEffect;
}

export function initialRestartFlow(): RestartFlowState {
  return { phase: "idle", source: null, error: null, profile: null, queued: [] };
}

function enqueue(queued: RestartFlowState["queued"], profile: RestartProfile): RestartProfile[] {
  const key = restartProfileKey(profile);
  return queued.some((p) => restartProfileKey(p) === key) ? queued : [...queued, profile];
}

export function reduceRestartFlow(
  state: RestartFlowState,
  event: RestartFlowEvent,
): RestartFlowResult {
  switch (event.type) {
    case "change-applied": {
      if (!event.auto) {
        // Internal view: saved and left pending on purpose — the header's
        // "Restart gateway" button is the operator's, not ours to press.
        return {
          state: {
            phase: "pending",
            source: event.source,
            error: null,
            profile: event.profile,
            queued: [],
          },
          effect: "none",
        };
      }
      if (state.phase === "restarting") {
        // Deduplication, per gateway. Two toggles in a row must not fire two
        // concurrent restarts of the SAME profile: the in-flight one may
        // already have read the config, so we queue one more run and no more.
        // A different profile queues as its own entry — it is another gateway
        // and would otherwise never be restarted at all.
        return {
          state: { ...state, source: event.source, queued: enqueue(state.queued, event.profile) },
          effect: "none",
        };
      }
      return {
        state: {
          phase: "restarting",
          source: event.source,
          error: null,
          profile: event.profile,
          queued: [],
        },
        effect: "restart",
      };
    }
    case "restart-requested": {
      if (state.phase === "restarting") {
        // Same deduplication, from the button side.
        return {
          state:
            restartProfileKey(state.profile) === restartProfileKey(event.profile)
              ? state
              : { ...state, queued: enqueue(state.queued, event.profile) },
          effect: "none",
        };
      }
      return {
        state: {
          ...state,
          phase: "restarting",
          error: null,
          profile: event.profile,
          queued: [],
        },
        effect: "restart",
      };
    }
    case "restart-accepted": {
      const [next, ...rest] = state.queued;
      if (state.queued.length > 0) {
        return {
          state: { ...state, phase: "restarting", error: null, profile: next, queued: rest },
          effect: "restart",
        };
      }
      return { state: initialRestartFlow(), effect: "none" };
    }
    case "restart-failed": {
      // The change stays saved-but-not-live: the phase keeps the pending
      // meaning AND gains a retry affordance. The queue is dropped on purpose —
      // the retry re-reads config from disk, so a queued run would be a second
      // restart for a change the first one will already pick up.
      return {
        state: {
          phase: "failed",
          source: state.source,
          error: event.error,
          profile: state.profile,
          queued: [],
        },
        effect: "none",
      };
    }
  }
}

/** True while a saved change is not running in the gateway yet. */
export function hasPendingRestart(state: RestartFlowState): boolean {
  return state.phase !== "idle";
}

export function isRestarting(state: RestartFlowState): boolean {
  return state.phase === "restarting";
}

export type RestartNoticeMode =
  | "hidden"
  /** Operator notice: saved, restart is yours to run. */
  | "pending"
  /** Everyone's notice: the automatic restart failed, here is another try. */
  | "failed";

/**
 * What the restart notice should look like for this viewer.
 *
 * The end user only ever sees it after a FAILED restart — the one case where
 * "behind the scenes" leaves them stuck with nothing to press. Everything else
 * stays backstage, exactly as before.
 */
export function restartNoticeMode(
  state: RestartFlowState,
  internal: boolean,
): RestartNoticeMode {
  if (state.phase === "failed") return "failed";
  // A hydrated pending state (below) is shown to EVERYONE: it means a change is
  // saved and not live with nobody currently acting on it, which is exactly the
  // dead end the user cannot escape without an affordance. A pending state from
  // this session stays backstage — the operator owns that button.
  if (state.phase === "pending" && state.hydrated) return "pending";
  if (internal && (state.phase === "pending" || state.phase === "restarting")) return "pending";
  return "hidden";
}

/** Just enough of `ActionStatusResponse` to decide; keeps this file api-free. */
export interface RestartActionStatus {
  running: boolean;
  exit_code: number | null;
}

export type RestartVerdict =
  /** Still going — poll again. */
  | { kind: "waiting" }
  /** Finished, exit code 0. */
  | { kind: "done" }
  /**
   * Finished, but the action left no exit code (the backend does not track it
   * any more). We cannot prove success and we cannot prove failure — reporting
   * failure would be a lie, so it resolves, flagged.
   */
  | { kind: "done-unverified" }
  | { kind: "failed"; error: string };

/**
 * Whether a restart actually finished.
 *
 * `POST /api/gateway/restart` returns `{ok:true, pid}` the moment the process
 * is SPAWNED — it says nothing about whether the gateway came back. The flow
 * treated that as success, so the badge went green and the toast said "done"
 * while the restart was still running, or had already died. The real answer is
 * in `GET /api/actions/gateway-restart/status`.
 */
export function judgeRestartAction(
  status: RestartActionStatus,
  elapsedMs: number,
  timeoutMs: number,
): RestartVerdict {
  if (status.running) {
    return elapsedMs >= timeoutMs
      ? { kind: "failed", error: `restart still running after ${Math.round(timeoutMs / 1000)}s` }
      : { kind: "waiting" };
  }
  if (status.exit_code === null) return { kind: "done-unverified" };
  if (status.exit_code === 0) return { kind: "done" };
  return { kind: "failed", error: `restart exited with code ${status.exit_code}` };
}

/** The channel shape hydration needs — the backend's derived per-platform state. */
export interface RestartHydrationInput {
  state: string;
  enabled?: boolean;
}

/**
 * Rebuild "saved but not live" from the backend after a remount.
 *
 * The flow lived only in React state, so navigating away and back reset it to
 * idle while the gateway was still running the OLD config: the badge said
 * `pending_restart` and nothing on screen would ever resolve it. The backend
 * derives that state itself (enabled + configured + gateway up + the platform
 * absent from the running gateway — web_server.py), so it is the durable
 * source of truth and survives any remount, reload or second tab.
 */
export function hydrateRestartFlow(
  platforms: RestartHydrationInput[],
  profile: RestartProfile,
): RestartFlowState | null {
  const stale = platforms.some((p) => p.state === "pending_restart");
  if (!stale) return null;
  return {
    phase: "pending",
    source: null,
    error: null,
    profile,
    queued: [],
    hydrated: true,
  };
}
