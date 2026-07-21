import { useCallback, useEffect, useRef, useState } from "react";

import { api } from "@/lib/api";
import {
  initialRestartFlow,
  reduceRestartFlow,
  type RestartEffect,
  type RestartFlowEvent,
  type RestartFlowState,
  type RestartSource,
} from "@/lib/restart-flow";

export type RestartOutcome =
  | { ok: true; restarted: boolean }
  | { ok: false; error: string };

export interface RestartFlow {
  state: RestartFlowState;
  /**
   * A change that only takes effect after a restart was persisted. Pass
   * `auto: false` for the internal view, where the restart stays manual.
   * Resolves once the restart request was accepted (or refused) — callers must
   * not report success before that.
   */
  changeApplied: (source: RestartSource, auto: boolean) => Promise<RestartOutcome>;
  /** Operator button / user retry. */
  restartNow: () => Promise<RestartOutcome>;
  /** Feed the machine a restart somebody else performed (Telegram onboarding). */
  reportOutcome: (ok: boolean, error?: string) => void;
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

  const performRestart = useCallback(async (): Promise<RestartOutcome> => {
    // Loops so a change that landed mid-restart still gets its own restart.
    for (;;) {
      try {
        await api.restartGateway();
      } catch (e) {
        const error = String(e);
        apply({ type: "restart-failed", error });
        return { ok: false, error };
      }
      onRestartedRef.current?.();
      if (apply({ type: "restart-accepted" }) !== "restart") {
        return { ok: true, restarted: true };
      }
    }
  }, [apply]);

  const changeApplied = useCallback(
    async (source: RestartSource, auto: boolean): Promise<RestartOutcome> => {
      if (apply({ type: "change-applied", source, auto }) !== "restart") {
        return { ok: true, restarted: false };
      }
      return performRestart();
    },
    [apply, performRestart],
  );

  const restartNow = useCallback(async (): Promise<RestartOutcome> => {
    if (apply({ type: "restart-requested" }) !== "restart") {
      return { ok: true, restarted: false };
    }
    return performRestart();
  }, [apply, performRestart]);

  const reportOutcome = useCallback(
    (ok: boolean, error = "") => {
      const effect = apply(
        ok ? { type: "restart-accepted" } : { type: "restart-failed", error },
      );
      if (effect === "restart") void performRestart();
    },
    [apply, performRestart],
  );

  return { state, changeApplied, restartNow, reportOutcome };
}
