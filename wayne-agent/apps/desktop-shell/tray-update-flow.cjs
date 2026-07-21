/**
 * tray-update-flow.cjs — what the tray's "Check for updates" actually does.
 *
 * The bug this exists to kill: the tray ran `checkUnifiedUpdate()`, got back a
 * plan complete with its `token`, and then called `applyUnifiedUpdate()` with
 * NO argument. A tokenless apply deliberately refuses to borrow somebody
 * else's plan, so it ran a SECOND check of its own — and if that second check
 * came back empty (feed blip, network gone, the plan consumed meanwhile), an
 * update the user had just been told about simply did not happen. The call was
 * `void`-ed too, so nothing was logged and nothing was shown: silence.
 *
 * Electron-free on purpose (same reason as single-flight.cjs and
 * update-scheduler.cjs): main.cjs cannot be imported by a test, so the
 * decisions live here and main.cjs only supplies check/apply/notify.
 *
 * `notify` is the tray's only channel to the user — it has no window of its
 * own. For a stale plan it is asked whether to try again, and a retry does a
 * FRESH check (the old plan is provably gone; reusing it would fail again).
 * That second check is the only one this flow ever runs, and it only happens
 * when the user asks for it.
 */

/**
 * @param {object} deps
 * @param {() => Promise<any>} deps.check      → {available, version, token} | null
 * @param {(token?: string) => Promise<any>} deps.apply  → {ok, error?, reason?}
 * @param {(kind: string, detail?: object) => Promise<any>} deps.notify
 *        Called with one of: "up-to-date" | "check-failed" | "stale-plan" |
 *        "apply-failed". Only "stale-plan" reads the return value, as a
 *        boolean "the user wants to try again".
 * @param {(line: string) => void} [deps.log]
 * @param {number} [deps.maxRetries] how many extra rounds a stale plan may buy.
 * @returns {Promise<{ok: boolean, applied: boolean, reason?: string, attempts: number}>}
 */
async function runTrayUpdateCheck({ check, apply, notify, log = () => {}, maxRetries = 1 }) {
  const say = async (kind, detail) => {
    try {
      return await notify(kind, detail);
    } catch {
      // A dialog that fails must not turn into an unhandled rejection in the
      // main process — it is informative only.
      return undefined;
    }
  };

  let plan;
  try {
    plan = await check();
  } catch (e) {
    log(`tray check threw: ${String((e && e.message) || e)}`);
    plan = null;
  }
  if (!plan) {
    await say("check-failed");
    return { ok: false, applied: false, reason: "check-failed", attempts: 0 };
  }
  if (!plan.available) {
    await say("up-to-date", { version: plan.version || null });
    return { ok: true, applied: false, attempts: 0 };
  }

  let attempts = 0;
  for (;;) {
    attempts += 1;
    let res;
    try {
      // THE fix: the token from the check we just did. Not undefined, not
      // somebody else's — this exact plan.
      res = await apply(plan.token);
    } catch (e) {
      res = { ok: false, error: String((e && e.message) || e) };
    }
    if (res && res.ok) {
      log(`tray apply ok (version=${plan.version || "?"})`);
      // Tell the user it worked. On the shell/relaunch paths this never renders
      // because the process dies inside the apply — which is exactly why it was
      // missing. But a STALLED engine retry survives: it downloads for minutes
      // and returns ok without relaunching, so without this the tray closed and
      // nothing ever happened on screen. The same silence this flow exists to
      // end.
      await say("applied", { version: plan.version || null });
      return { ok: true, applied: true, attempts };
    }

    const reason = (res && (res.reason || res.error)) || "unknown";
    log(`tray apply failed: ${reason}`);

    const stale = !!res && res.error === "stale-plan";
    if (!stale || attempts > maxRetries) {
      await say("apply-failed", { reason });
      return { ok: false, applied: false, reason, attempts };
    }

    // The plan went stale between the check and the apply. Offer a real second
    // chance instead of dying quietly — but only if the user asks for it.
    const retry = await say("stale-plan", { reason });
    if (!retry) return { ok: false, applied: false, reason, attempts };

    let fresh;
    try {
      fresh = await check();
    } catch (e) {
      log(`tray recheck threw: ${String((e && e.message) || e)}`);
      fresh = null;
    }
    if (!fresh) {
      await say("check-failed");
      return { ok: false, applied: false, reason: "check-failed", attempts };
    }
    if (!fresh.available) {
      // Nothing left to install — somebody else already applied it.
      await say("up-to-date", { version: fresh.version || null });
      return { ok: true, applied: false, attempts };
    }
    plan = fresh;
  }
}

module.exports = { runTrayUpdateCheck };
