/**
 * single-flight — one in-progress operation, shared by every caller.
 *
 * WHY THIS EXISTS
 * The engine updater guarded itself with a plain boolean:
 *
 *     if (engine.updating) return;          // main.cjs:1693 (before)
 *     const manifest = await fetchEngineManifest();
 *     ...
 *     engine.updating = true;               // main.cjs:1716 (before)
 *
 * The flag was READ before the first `await` and WRITTEN long after it, so two
 * callers (the 30-minute timer, the tray, the renderer's retry) could both pass
 * the guard and run two installs over the same slot tree. That is the race that
 * produced "the installer did not finish" on a real machine.
 *
 * The rule this module enforces: the lock is taken SYNCHRONOUSLY, before the
 * work function gets a chance to await anything. `run()` returns to its caller
 * with the lock already held.
 *
 * Callers never reject: `run()` resolves to a tagged result. That keeps
 * `void singleFlight.run(...)` safe at call sites that intentionally do not
 * await (the boot timer), without leaving unhandled rejections behind.
 *
 * Deliberately dependency-free so it can be unit-tested without Electron.
 */

/**
 * @typedef {Object} RunHandle
 * @property {boolean} started  false when another run already held the lock
 * @property {number}  token    identifies THIS run (see main.cjs's apply path)
 * @property {Promise<{ok: boolean, value?: unknown, error?: string}>} promise
 */

function createSingleFlight() {
  /** @type {{token: number, promise: Promise<any>, startedAt: number} | null} */
  let current = null;
  let seq = 0;

  /**
   * Runs `fn` unless a run is already in flight.
   *
   * Concurrent callers get `started: false` AND the SAME promise, so they can
   * await the in-flight work instead of guessing. That is what lets
   * retryEngineUpdate() stop returning before the work is done.
   *
   * @param {(token: number) => unknown} fn
   * @returns {RunHandle}
   */
  function run(fn) {
    if (current) {
      return { started: false, token: current.token, promise: current.promise };
    }

    const token = ++seq;

    // The work is deferred to a microtask so `current` below is assigned
    // BEFORE fn can execute — that ordering is the whole point of the module.
    // A synchronous throw inside fn lands in the same catch as a rejection.
    const promise = Promise.resolve()
      .then(() => fn(token))
      .then(
        (value) => ({ ok: true, value }),
        (error) => ({ ok: false, error: String((error && error.message) || error) }),
      )
      .finally(() => {
        // Only the owner clears the slot: a late finally from a superseded run
        // must never unlock a newer one.
        if (current && current.token === token) current = null;
      });

    current = { token, promise, startedAt: Date.now() };
    return { started: true, token, promise };
  }

  return {
    run,
    /** True while a run holds the lock (including during its awaits). */
    isRunning: () => current !== null,
    /** Token of the in-flight run, or null. */
    activeToken: () => (current ? current.token : null),
    /** Promise of the in-flight run, or null — for callers that want to join. */
    activePromise: () => (current ? current.promise : null),
  };
}

module.exports = { createSingleFlight };
