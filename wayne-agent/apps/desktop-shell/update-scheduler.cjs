/**
 * The background update tick — the part that must never stop ticking.
 *
 * WHY IT IS ITS OWN MODULE
 * The scheduler used to be three lines inline in main.cjs:
 *
 *     void runBackgroundEngineUpdate().finally(() => {
 *       engine.updateTimer = setTimeout(run, EVERY);
 *     });
 *
 * When runBackgroundEngineUpdate started returning a single-flight handle
 * ({started, token, promise}) instead of a Promise, `.finally` stopped
 * existing. The tick threw TypeError inside a setTimeout callback — an
 * uncaught exception in the main process — and, because the throw happened
 * before the reschedule, the background updater went silent forever after the
 * first tick. Nothing caught it: not node --check, not the type checker (this
 * is plain CJS), not any test, because there was none.
 *
 * Extracted here with its dependencies injected so that exact wiring can be
 * asserted without Electron and without waiting four hours.
 */

/**
 * Runs one tick and guarantees the next one is scheduled.
 *
 * Contract, in the order it matters:
 *   1. the tick NEVER throws — a timer callback that throws takes the main
 *      process with it;
 *   2. the next tick is scheduled whether the work succeeded, failed, or could
 *      not even start;
 *   3. the reschedule waits for the work to FINISH, so two updates can never
 *      overlap by the scheduler's own doing.
 *
 * @param {Object} deps
 * @param {() => {started?: boolean, promise?: Promise<unknown>} | Promise<unknown> | undefined} deps.run
 *        Starts the work. May return a single-flight handle, a bare promise,
 *        or nothing; all three are tolerated so a future change of shape
 *        degrades into "still reschedules" instead of "dies".
 * @param {(fn: () => void) => unknown} deps.schedule  usually setTimeout-with-delay bound by the caller
 * @param {(err: unknown) => void} [deps.onError]      best-effort logging
 * @returns {Promise<{ok: boolean, started: boolean, error?: string}>} for tests
 */
async function runUpdateTick({ run, schedule, onError }) {
  let started = false;
  let outcome = { ok: true, started: false };
  try {
    const handle = run();
    // Accept a handle, a promise, or nothing.
    const promise =
      handle && typeof handle === "object" && typeof handle.promise?.then === "function"
        ? handle.promise
        : handle && typeof handle.then === "function"
          ? handle
          : null;
    started = handle && typeof handle === "object" && "started" in handle
      ? Boolean(handle.started)
      : Boolean(promise);
    const value = promise ? await promise : undefined;
    // A single-flight result is {ok, error}; anything else counts as success.
    const failed = value && typeof value === "object" && value.ok === false;
    outcome = failed
      ? { ok: false, started, error: String(value.error || "update failed") }
      : { ok: true, started };
  } catch (err) {
    outcome = { ok: false, started, error: String((err && err.message) || err) };
    try {
      onError?.(err);
    } catch {
      /* logging must not break the tick either */
    }
  } finally {
    // Rescheduling is in `finally` on purpose: the ONE thing that must happen
    // no matter what. A throw in schedule() itself is swallowed for the same
    // reason — better a missed cycle than a dead main process.
    try {
      schedule();
    } catch (err) {
      try {
        onError?.(err);
      } catch {
        /* nothing left to do */
      }
    }
  }
  return outcome;
}

module.exports = { runUpdateTick };
