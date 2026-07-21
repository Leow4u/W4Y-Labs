import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import { observeRestart } from "@/lib/restart-observer";
import {
  hydrateRestartFlow,
  initialRestartFlow,
  reduceRestartFlow,
  type RestartEffect,
  type RestartFlowEvent,
  type RestartFlowState,
  type RestartHydrationInput,
  restartProfileKey,
  type RestartProfile,
  type RestartSource,
} from "@/lib/restart-flow";

/** How long a gateway restart may take before we call it failed. */
const RESTART_TIMEOUT_MS = 90_000;
const POLL_INTERVAL_MS = 1_500;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export type RestartOutcome =
  | { ok: true; restarted: boolean; verified?: boolean }
  | { ok: false; error: string };

export interface RestartFlow {
  state: RestartFlowState;
  /**
   * A change that only takes effect after a restart was persisted. Pass
   * `auto: false` for the internal view, where the restart stays manual.
   * Resolves once the restart request was accepted (or refused) — callers must
   * not report success before that.
   */
  changeApplied: (
    source: RestartSource,
    auto: boolean,
    profile?: RestartProfile,
  ) => Promise<RestartOutcome>;
  /** Operator button / user retry. */
  restartNow: (profile?: RestartProfile) => Promise<RestartOutcome>;
  /** Feed the machine a restart somebody else performed (Telegram onboarding). */
  reportOutcome: (ok: boolean, error?: string) => void;
  /**
   * Rebuild "saved but not live" from the backend's DURABLE marker, so it
   * survives reload, remount and a second tab. Call it whenever the screen
   * (re)loads; it never overwrites a phase this session is actively driving.
   */
  hydrate: (profile?: RestartProfile) => Promise<void>;
}

/**
 * The single restart flow shared by every surface that writes channel config.
 * The transitions live in lib/restart-flow (pure, tested); this hook only owns
 * the React state and the one side effect — asking the gateway to restart.
 */
export function useRestartFlow(onRestarted?: () => void): RestartFlow {
  const [state, setState] = useState<RestartFlowState>(initialRestartFlow);
  // The machine is driven from inside async runs, so the reducer reads from a
  // ref: awaiting a restart must not reduce against a stale snapshot.
  const stateRef = useRef(state);
  const onRestartedRef = useRef(onRestarted);
  useEffect(() => {
    onRestartedRef.current = onRestarted;
  }, [onRestarted]);

  const apply = useCallback((event: RestartFlowEvent): RestartEffect => {
    const result = reduceRestartFlow(stateRef.current, event);
    stateRef.current = result.state;
    setState(result.state);
    return result.effect;
  }, []);

  /**
   * Ask the gateway to restart AND wait for the action to actually finish.
   *
   * The POST only starts (or joins) the operation. This waits on the JOB the
   * backend created for it; the backend decides success from real gateway
   * health, so this hook no longer judges anything — it observes.
   */
  const awaitRestart = useCallback(
    async (profile: RestartProfile): Promise<{ ok: true; verified: boolean } | { ok: false; error: string }> => {
      // Start the operation and watch THAT job. Polling the global
      // `gateway-restart` action name meant job A could be handed process B's
      // result. The logic lives in lib/restart-observer so it is testable
      // without a DOM; success comes from the backend's health check, so
      // `verified` is no longer a guess this hook makes.
      const res = await observeRestart(profile, {
        start: (p) => api.restartGateway(p ?? undefined),
        poll: (id) => api.getRestartJob(id),
        sleep,
        now: () => Date.now(),
        intervalMs: POLL_INTERVAL_MS,
        timeoutMs: RESTART_TIMEOUT_MS,
      });
      return res.ok ? { ok: true, verified: true } : { ok: false, error: res.error };
    },
    [],
  );

  const performRestart = useCallback(async (): Promise<RestartOutcome> => {
    let verified = true;
    // Loops so a change that landed mid-restart still gets its own restart —
    // reading the target from the machine each pass, because the queued entry
    // may be a DIFFERENT profile (another agent's gateway).
    for (;;) {
      const res = await awaitRestart(stateRef.current.profile);
      if (!res.ok) {
        apply({ type: "restart-failed", error: res.error });
        return { ok: false, error: res.error };
      }
      verified = verified && res.verified;
      onRestartedRef.current?.();
      if (apply({ type: "restart-accepted" }) !== "restart") {
        return { ok: true, restarted: true, verified };
      }
    }
  }, [apply, awaitRestart]);

  const changeApplied = useCallback(
    async (
      source: RestartSource,
      auto: boolean,
      profile: RestartProfile = null,
    ): Promise<RestartOutcome> => {
      if (apply({ type: "change-applied", source, auto, profile }) !== "restart") {
        return { ok: true, restarted: false };
      }
      return performRestart();
    },
    [apply, performRestart],
  );

  const restartNow = useCallback(
    async (profile: RestartProfile = null): Promise<RestartOutcome> => {
      if (apply({ type: "restart-requested", profile }) !== "restart") {
        return { ok: true, restarted: false };
      }
      return performRestart();
    },
    [apply, performRestart],
  );

  const hydrate = useCallback(async (profile: RestartProfile = null) => {
    // The backend owns this truth now. Reading its durable marker (rather than
    // guessing from the platform list) is what makes a DISABLE visible and what
    // keeps pending/retry alive across a reload, a remount and a second tab.
    let pending: RestartHydrationInput | null = null;
    try {
      pending = await api.getRestartPending(profile ?? undefined);
    } catch {
      // Unknown is not "nothing pending" — leave whatever we have rather than
      // clearing a notice the user may need.
      return;
    }
    // Never fight a phase this session is driving: a restart in flight has the
    // marker still on disk, and overwriting would resurrect the very notice the
    // restart is about to clear.
    const current = stateRef.current;
    if (current.phase === "restarting" || current.phase === "failed") return;
    const next = hydrateRestartFlow(pending, profile) ?? initialRestartFlow();
    // Compare the PROFILE too: switching between two pending agents must move
    // the state, not sit on the first one's phase because the phase matched.
    if (
      next.phase === current.phase &&
      next.hydrated === current.hydrated &&
      restartProfileKey(next.profile) === restartProfileKey(current.profile)
    ) {
      return;
    }
    stateRef.current = next;
    setState(next);
  }, []);

  const reportOutcome = useCallback(
    (ok: boolean, error = "") => {
      const effect = apply(
        ok ? { type: "restart-accepted" } : { type: "restart-failed", error },
      );
      if (effect === "restart") void performRestart();
    },
    [apply, performRestart],
  );

  return { state, changeApplied, restartNow, reportOutcome, hydrate };
}
