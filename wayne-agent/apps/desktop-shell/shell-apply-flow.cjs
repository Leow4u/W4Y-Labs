/**
 * shell-apply-flow.cjs — the whole shell update, as ONE shared operation.
 *
 * The previous shape serialized only the expensive middle: `killEngine()` plus
 * `shellUpdater.apply()` ran inside the single-flight, but the fail-open
 * fallback (`applyEngineUpdate()` — kill, relaunch, exit) sat AFTER the
 * `await`, outside the flight. So when the shell install failed, every caller
 * that had joined the flight woke up with the same failed outcome and each ran
 * its own relaunch: two callers, two `app.relaunch()` + `app.exit(0)` races
 * over the same process. The lock was real but it ended one line too early.
 *
 * The fix is to make the shared operation mean the whole decision — validate,
 * apply, fall back, produce the final answer — so joiners receive a RESULT,
 * never a chance to act again. Everything below runs exactly once per flight;
 * the caller's only job is to return what it is handed.
 *
 * Electron-free (see single-flight.cjs): the concurrency behaviour is the part
 * most worth testing, and main.cjs cannot be imported by a test.
 */

/**
 * Run the shell update and, on any failure, the relaunch fallback — once.
 *
 * Never throws: a thrower anywhere collapses into the fallback, and a failing
 * fallback still yields a result object. The single-flight above it turns that
 * into "every waiter gets this same object".
 *
 * @param {object} deps
 * @param {() => void} deps.killEngine        a live engine must not fight the installer
 * @param {() => Promise<any>} deps.shellApply download + quitAndInstall → {ok, error?}
 * @param {() => any} deps.engineFallback     relaunch the CURRENT shell → {ok, error?}
 * @param {(line: string) => void} [deps.log]
 * @returns {Promise<{ok: boolean, via: "shell"|"fallback", error?: string}>}
 */
async function runShellApplyWithFallback({ killEngine, shellApply, engineFallback, log = () => {} }) {
  let failure = null;
  try {
    killEngine();
    const r = await shellApply();
    if (r && r.ok) return { ok: true, via: "shell" };
    failure = (r && r.error) || "unknown";
  } catch (e) {
    failure = String((e && e.message) || e);
  }

  // Fail-open: the shell install did not happen, so bring the CURRENT shell
  // (and its engine) back rather than leaving the user on a dead window. This
  // is INSIDE the shared operation — that is the whole point.
  log(`shell apply fell back to relaunch: ${failure}`);
  try {
    const fb = engineFallback();
    if (fb && fb.ok) return { ok: true, via: "fallback", error: failure };
    return {
      ok: false,
      via: "fallback",
      error: `${failure}; fallback failed: ${(fb && fb.error) || "unknown"}`,
    };
  } catch (e) {
    return {
      ok: false,
      via: "fallback",
      error: `${failure}; fallback threw: ${String((e && e.message) || e)}`,
    };
  }
}

module.exports = { runShellApplyWithFallback };
