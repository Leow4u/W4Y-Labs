/**
 * staged-plan.cjs — is the engine plan we pinned still the artifact on disk?
 *
 * Reproduced before this existed: an engine plan of kind "ready" fell straight
 * through to `applyEngineUpdate()` — kill the engine, relaunch, exit — WITHOUT
 * re-reading `readStaged()` or re-checking `engineSlots.isComplete()`. The
 * check had proved a complete staged build; the apply simply trusted that
 * minutes-old proof.
 *
 * So if the staged directory was deleted, replaced by a newer download, or left
 * half-written between the check and the click, the old token still restarted
 * the whole application and installed nothing. The user watched the app bounce
 * and came back to the same version, with the chip cleared.
 *
 * The snapshot therefore has to carry the artifact's identity, and this decides
 * — purely, so it can be tested without a filesystem — whether that identity
 * still holds.
 */

/**
 * The identity worth pinning. `root` and `zipUrl` together say WHICH build:
 * the directory it was unpacked into and the archive it came from. Version is
 * carried when available but is not sufficient on its own — two downloads of
 * the same version land in different slots.
 *
 * @param {{root?: string, zipUrl?: string, version?: string|null}|null} staged
 */
function stagedIdentity(staged) {
  if (!staged || typeof staged !== "object") return null;
  const root = typeof staged.root === "string" ? staged.root : null;
  const zipUrl = typeof staged.zipUrl === "string" ? staged.zipUrl : null;
  if (!root && !zipUrl) return null;
  return { root, zipUrl, version: staged.version ?? null };
}

/**
 * May this pinned plan still be applied?
 *
 * @param {object} input
 * @param {{root?: string, zipUrl?: string}|null} input.pinned identity from the snapshot
 * @param {{root?: string, zipUrl?: string}|null} input.current what is on disk NOW
 * @param {boolean|null} input.complete result of engineSlots.isComplete(root)
 * @returns {{ok: true} | {ok: false, reason: string}}
 */
function validateStagedPlan({ pinned, current, complete }) {
  const now = stagedIdentity(current);
  if (!now) return { ok: false, reason: "staged-gone" };
  if (complete !== true) return { ok: false, reason: "staged-incomplete" };

  const want = stagedIdentity(pinned);
  if (!want) {
    // Older snapshot with no identity recorded. We cannot prove it is the same
    // artifact, so we do not act on it — fail closed rather than relaunch on a
    // guess. A fresh check costs the user one click and no data.
    return { ok: false, reason: "identity-unknown" };
  }
  // Compare only the fields the snapshot actually captured; a missing field on
  // one side must not silently pass as equal.
  if (want.root && now.root && want.root !== now.root) {
    return { ok: false, reason: "staged-changed" };
  }
  if (want.zipUrl && now.zipUrl && want.zipUrl !== now.zipUrl) {
    return { ok: false, reason: "staged-changed" };
  }
  if ((want.root && !now.root) || (want.zipUrl && !now.zipUrl)) {
    return { ok: false, reason: "staged-changed" };
  }
  return { ok: true };
}

/**
 * Is a freshly re-checked plan the SAME intention as the one that just expired?
 *
 * Used for the single controlled recovery after a `stale-plan`: reapplying
 * automatically is only honest when the new plan means exactly what the user
 * pressed for. A different layer, kind or version is a different decision and
 * must be shown, not performed.
 *
 * @param {{kind?: string, version?: string|null, source?: string}|null} before
 * @param {{kind?: string, version?: string|null, source?: string}|null} after
 */
function sameIntention(before, after) {
  if (!before || !after) return false;
  const src = (p) => p.source ?? p.kind ?? null;
  if (src(before) !== src(after)) return false;
  if ((before.kind ?? null) !== (after.kind ?? null)) return false;
  // A version on only one side is not proof of sameness.
  if ((before.version ?? null) !== (after.version ?? null)) return false;
  return true;
}

module.exports = { stagedIdentity, validateStagedPlan, sameIntention };
