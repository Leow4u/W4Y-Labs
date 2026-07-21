import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import {
  hydrateRestartFlow,
  initialRestartFlow,
  judgeRestartAction,
  reduceRestartFlow,
  type RestartEffect,
  type RestartFlowEvent,
  type RestartFlowState,
  type RestartHydrationInput,
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
   * Rebuild "saved but not live" from the backend's own per-platform state, so
   * it survives a remount. Call it whenever the platform list is (re)loaded;
   * it never overwrites a phase this session is actively driving.
   */
  hydrate: (platforms: RestartHydrationInput[], profile?: RestartProfile) => void;
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
   * The POST resolves as soon as the restart process is spawned. Reporting
   * success there told the user "applied" while the gateway was still coming
   * up — or had already died — so the badge went green over a change that was
   * not live. `judgeRestartAction` (pure, tested) reads the real verdict from
   * the action status; this function only does the waiting.
   */
  const awaitRestart = useCallback(
    async (profile: RestartProfile): Promise<{ ok: true; verified: boolean } | { ok: false; error: string }> => {
      let name: string;
      try {
        const res = await api.restartGateway(profile ?? undefined);
        if (res.ok === false) return { ok: false, error: res.error || "restart refused" };
        name = res.name || "gateway-restart";
      } catch (e) {
        return { ok: false, error: String(e) };
      }
      const startedAt = Date.now();
      for (;;) {
        await sleep(POLL_INTERVAL_MS);
        let status;
        try {
          status = await api.getActionStatus(name, 1);
        } catch {
          // A transient status read must not condemn a restart that is very
          // likely fine — the gateway bouncing can itself break this request.
          // Only the timeout below ends the wait.
          if (Date.now() - startedAt >= RESTART_TIMEOUT_MS) {
            return { ok: false, error: "restart status unreadable" };
          }
          continue;
        }
        const verdict = judgeRestartAction(status, Date.now() - startedAt, RESTART_TIMEOUT_MS);
        if (verdict.kind === "waiting") continue;
        if (verdict.kind === "failed") return { ok: false, error: verdict.error };
        return { ok: true, verified: verdict.kind === "done" };
      }
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

  const hydrate = useCallback(
    (platforms: RestartHydrationInput[], profile: RestartProfile = null) => {
      // Never fight a phase this session is driving: an in-flight restart makes
      // the backend report `pending_restart` too, and overwriting it would
      // resurrect the very "stuck" notice the restart is about to clear.
      const current = stateRef.current;
      if (current.phase === "restarting" || current.phase === "failed") return;
      const next = hydrateRestartFlow(platforms, profile) ?? initialRestartFlow();
      if (next.phase === current.phase && next.hydrated === current.hydrated) return;
      stateRef.current = next;
      setState(next);
    },
    [],
  );

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
