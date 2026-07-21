/**
 * unified-check.cjs — combining the shell and engine layers honestly.
 *
 * "Você já está na versão mais recente" was being said on evidence that did not
 * support it. Two independent holes, both confirmed in the code:
 *
 *  - `shellUpdater.check()` is fail-open by design: an unreachable feed, a dev
 *    run, a broken electron-updater all return `null`. The caller treated that
 *    as "no shell update", i.e. as a verified answer.
 *  - `checkEngineUpdate()` reads ONLY local state — `readStaged()` and the
 *    on-disk update state. It never fetches the manifest. So "nothing staged
 *    locally" was being reported as "the remote engine is up to date".
 *
 * With both layers silent for the wrong reasons, a machine that had verified
 * nothing at all was told it was current.
 *
 * The fix is a third state. A layer answers `available`, `up-to-date` or
 * `unknown`, and this combines them under one rule: an "up to date" verdict
 * requires EVERY applicable layer to have actually been verified.
 *
 * Electron-free so the matrix can be tested without a feed or a filesystem.
 */

/** This layer has something to install. */
const AVAILABLE = "available";
/** This layer was really checked and has nothing to install. */
const UP_TO_DATE = "up-to-date";
/** This layer could not be checked. Says nothing either way. */
const UNKNOWN = "unknown";
/** This layer is mid-flight (downloading/installing) RIGHT NOW. */
const IN_PROGRESS = "in-progress";
/**
 * A newer build exists but is not usable yet: discovered in the manifest and
 * not staged, so there is nothing to apply. Distinct from IN_PROGRESS, which
 * used to cover this and was simply untrue — merely reading a manifest starts
 * no download. Either way it is NOT "up to date".
 */
const PREPARING = "preparing";

/**
 * A layer's answer.
 * @param {string} status one of the four above
 * @param {object} [extra] version/kind/reason carried through untouched
 */
function layer(status, extra = {}) {
  return { status, ...extra };
}

/** Not applicable on this install (e.g. no local engine in cloud-shell mode). */
function skipped() {
  return { status: UP_TO_DATE, skipped: true };
}

/**
 * Combine layer answers into the single result the chip, IPC and tray consume.
 *
 * Rules, in order:
 *  1. Any layer with an update — offer it. A partial failure elsewhere does not
 *     hide it, but it IS recorded in `unverified` rather than swept away.
 *  2. Nothing available and every applicable layer verified — up to date.
 *  3. Nothing available but some layer unverified — unknown. This is the case
 *     that used to masquerade as "up to date".
 *
 * @param {{shell?: object, engine?: object}} layers
 * @returns {{status: string, version: string|null, kind: string|null,
 *            unverified: string[], layers: object}}
 */
function combineUpdateLayers(layers = {}) {
  const named = Object.entries(layers).filter(([, v]) => v && v.status);
  const unverified = named
    .filter(([, v]) => v.status === UNKNOWN)
    .map(([name]) => name);

  // 1. Something to install wins, and says which layer it came from.
  const offer = named.find(([, v]) => v.status === AVAILABLE);
  if (offer) {
    const [name, value] = offer;
    return {
      status: AVAILABLE,
      source: name,
      version: value.version ?? null,
      kind: value.kind ?? null,
      // Identity of the artifact this offer is about, when the layer knows it.
      staged: value.staged ?? null,
      unverified,
      layers,
    };
  }

  // A layer that is working, or that knows a newer build exists, is not "up to
  // date". Neither may fall through to the verified-current branch.
  const busy = named.find(
    ([, v]) => v.status === IN_PROGRESS || v.status === PREPARING,
  );
  if (busy) {
    return {
      status: busy[1].status,
      source: busy[0],
      version: busy[1].version ?? null,
      kind: busy[1].kind ?? null,
      unverified,
      layers,
    };
  }

  // 3. before 2.: an unverified layer poisons the "up to date" claim.
  if (unverified.length) {
    return { status: UNKNOWN, version: null, kind: null, unverified, layers };
  }

  // 2. Everything applicable was really checked and there is nothing to do.
  return { status: UP_TO_DATE, version: null, kind: null, unverified: [], layers };
}

/**
 * Should a fresh (failed) check be allowed to replace a plan we already proved?
 *
 * A transient check failure must not erase a chip the user can act on: the
 * bytes for a staged update are already on disk, and a stalled update still
 * needs their attention. Only a verified answer may clear it.
 *
 * @param {{status: string}|null} previous last result we showed
 * @param {{status: string}} next what the new check concluded
 */
function preferPreviousPlan(previous, next) {
  if (!previous || previous.status !== AVAILABLE) return next;
  if (next.status === UNKNOWN) return { ...previous, stale: true };
  return next;
}

module.exports = {
  AVAILABLE,
  UP_TO_DATE,
  UNKNOWN,
  IN_PROGRESS,
  PREPARING,
  layer,
  skipped,
  combineUpdateLayers,
  preferPreviousPlan,
};
