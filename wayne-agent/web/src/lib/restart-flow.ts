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

export interface RestartFlowState {
  phase: RestartPhase;
  source: RestartSource | null;
  /** Raw failure text, kept so the retry affordance can explain itself. */
  error: string | null;
  /** A further change landed while a restart was already in flight. */
  queued: boolean;
}

export type RestartFlowEvent =
  /**
   * A change was persisted. `auto` is false for the internal view, where the
   * restart stays a manual operator step.
   */
  | { type: "change-applied"; source: RestartSource; auto: boolean }
  /** Manual restart: the operator button, or the user's "try again". */
  | { type: "restart-requested" }
  /** The gateway accepted the restart request. */
  | { type: "restart-accepted" }
  | { type: "restart-failed"; error: string };

/** Whether the caller must actually issue the restart request. */
export type RestartEffect = "none" | "restart";

export interface RestartFlowResult {
  state: RestartFlowState;
  effect: RestartEffect;
}

export function initialRestartFlow(): RestartFlowState {
  return { phase: "idle", source: null, error: null, queued: false };
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
          state: { phase: "pending", source: event.source, error: null, queued: false },
          effect: "none",
        };
      }
      if (state.phase === "restarting") {
        // Deduplication: two toggles in a row must not fire two concurrent
        // restarts. The in-flight one may already have read the config, so we
        // remember that a newer change exists and restart once more when it
        // settles — instead of dropping it silently.
        return { state: { ...state, source: event.source, queued: true }, effect: "none" };
      }
      return {
        state: { phase: "restarting", source: event.source, error: null, queued: false },
        effect: "restart",
      };
    }
    case "restart-requested": {
      if (state.phase === "restarting") {
        // Same deduplication, from the button side.
        return { state, effect: "none" };
      }
      return {
        state: { ...state, phase: "restarting", error: null, queued: false },
        effect: "restart",
      };
    }
    case "restart-accepted": {
      if (state.queued) {
        return {
          state: { ...state, phase: "restarting", error: null, queued: false },
          effect: "restart",
        };
      }
      return { state: initialRestartFlow(), effect: "none" };
    }
    case "restart-failed": {
      // The change stays saved-but-not-live: the phase keeps the pending
      // meaning AND gains a retry affordance.
      return {
        state: { phase: "failed", source: state.source, error: event.error, queued: false },
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
  if (internal && (state.phase === "pending" || state.phase === "restarting")) return "pending";
  return "hidden";
}
