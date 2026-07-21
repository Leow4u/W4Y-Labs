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
 *        "apply-failed" | "applied" | "recovered". Only "stale-plan" reads the
 *        return value, as a boolean "the user wants to try again".
 * @param {(line: string) => void} [deps.log]
 * @param {number} [deps.maxRetries] how many extra rounds a stale plan may buy.
 * @returns {Promise<{ok: boolean, applied: boolean, reason?: string, attempts: number}>}
 */
/**
 * Everything that is NOT "here is a plan you can apply".
 *
 * Exhaustive and FAIL-CLOSED on purpose: the previous shape asked
 * `if (!plan.available)` and said "you are on the latest version", so every
 * status that was not `available` — including `in-progress`, `preparing` and
 * anything added later — silently claimed the machine was current. Only an
 * explicit `up-to-date` may say that now; an unrecognised status is treated as
 * a failed verification.
 *
 * @returns a terminal result, or null when the caller should apply the plan.
 */
async function settleNonApplicable(plan, say, attempts = 0) {
  const status = plan && plan.status;
  if (!plan) {
    await say("check-failed", { unverified: [] });
    return { ok: false, applied: false, reason: "check-failed", attempts };
  }
  switch (status) {
    case "available":
      return null; // the caller applies it
    case "up-to-date":
      await say("up-to-date", { version: plan.version || null });
      return { ok: true, applied: false, attempts };
    case "in-progress":
    case "preparing":
      // A newer build exists but cannot be applied yet. Never "up to date".
      await say(status, { version: plan.version || null });
      return { ok: true, applied: false, pending: true, attempts };
    case "unknown":
      await say("check-failed", { unverified: plan.unverified || [] });
      return { ok: false, applied: false, reason: "check-failed", attempts };
    default:
      // No status at all (an older shell), or one this build does not know.
      // Fail closed: an unrecognised answer is not evidence of being current.
      if (plan.available) return null;
      await say("check-failed", { unverified: plan.unverified || [] });
      return {
        ok: false,
        applied: false,
        reason: status ? `unknown-status:${status}` : "check-failed",
        attempts,
      };
  }
}

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
  const first = await settleNonApplicable(plan, say);
  if (first) return first;

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
      // `recovered` = the shell install FAILED and the fallback reopened the
      // current build. Operationally fine, but it is not an update, and the
      // log and the dialog must not read as if it were.
      // `staged`    = bytes are ready; the update lands on the NEXT restart.
      // `recovered`  = the install failed and the current build was reopened.
      // `applied`    = the install actually fired.
      const outcome = res.outcome || (res.status === "staged" ? "staged" : "applied");
      log(
        outcome === "recovered"
          ? `tray apply RECOVERED (update failed: ${res.error || "unknown"})`
          : outcome === "staged"
            ? `tray apply STAGED (restart to finish, version=${plan.version || "?"})`
            : `tray apply applied (version=${plan.version || "?"})`,
      );
      // Tell the user it worked. On the shell/relaunch paths this never renders
      // because the process dies inside the apply — which is exactly why it was
      // missing. But a STALLED engine retry survives: it downloads for minutes
      // and returns ok without relaunching, so without this the tray closed and
      // nothing ever happened on screen. The same silence this flow exists to
      // end.
      await say(outcome, {
        version: plan.version || null,
        error: res.error || null,
      });
      return {
        ok: true,
        applied: outcome === "applied",
        recovered: outcome === "recovered",
        staged: outcome === "staged",
        attempts,
      };
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
    // The recheck goes through the SAME exhaustive rule. It used to decide on
    // `available` alone, so an in-progress or unverified recheck reported "you
    // are on the latest version" just like the first check did.
    const settled = await settleNonApplicable(fresh, say, attempts);
    if (settled) return settled;
    plan = fresh;
  }
}

module.exports = { runTrayUpdateCheck };
