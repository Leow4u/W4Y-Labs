/**
 * backend-probes.cjs
 *
 * Cheap "does this candidate backend actually work" checks used by the
 * backend resolver (main.cjs). The resolver walks a ladder of
 * candidates -- bootstrap marker, `wayne` on PATH, system Python with
 * wayne_cli installed -- and historically returned the first candidate
 * whose binary existed on disk. That assumption breaks when a user has
 * a pre-installed Python 3.11-3.13 (so findSystemPython() returns a
 * path) but no wayne_cli in its site-packages: the resolver hands back
 * a backend the spawn step can't actually run, and the user gets a
 * dead-on-arrival "ModuleNotFoundError: No module named 'wayne_cli'"
 * instead of the first-launch installer.
 *
 * These probes give the resolver a way to verify a candidate before
 * trusting it. Failure (non-zero exit, exception, timeout) means "skip
 * this rung, try the next one"; success means "spawn this for real."
 * Falling off the bottom of the ladder lands on the bootstrap-needed
 * sentinel, which is exactly what we want when nothing pre-existing
 * actually works.
 *
 * Both probes are deliberately forgiving:
 *   - 60s timeout (Windows cold import of wayne_cli.config was measured at
 *     ~34s; 5s produced a false "motor não utilizável" after a successful
 *     install). Still fails in under a minute if the interpreter is truly
 *     hung. Override per-call via opts.timeoutMs when a caller knows better.
 *   - stdio ignored (we only care about exit code; stdout/stderr are
 *     not surfaced to the user, just to the boot log for forensics
 *     via the caller's catch block if it chooses)
 *   - any throw -> false (never propagate -- resolver wants a boolean)
 *
 * Kept in a standalone cjs module so it can be unit-tested with
 * `node --test` without dragging in the electron runtime.
 */

const { execFileSync } = require('node:child_process')

// Cold Windows import of yaml+dotenv+wayne_cli.config ~34s (2026-07-22).
// 5s was a false-error factory; 60s covers that with margin.
const PROBE_TIMEOUT_MS = 60_000

/**
 * Return the Python snippet used to verify the Wayne runtime can import far
 * enough to launch the CLI. Kept exported for tests so dependency regressions
 * are caught without needing a real broken venv fixture.
 *
 * @returns {string}
 */
function wayneRuntimeImportProbe() {
  return 'import yaml; import dotenv; import wayne_cli.config'
}

/**
 * Return true iff the Wayne runtime import probe exits 0.
 *
 * Used to gate the "fallback to system Python with wayne_cli installed"
 * rung of the backend resolver. Without this, a system Python 3.11-3.13
 * registered in PEP 514 makes findSystemPython() succeed regardless of
 * whether wayne_cli has actually been pip-installed into its
 * site-packages -- and the resolver returns a backend that immediately
 * dies on spawn.
 *
 * The probe intentionally imports wayne_cli.config, not just the top-level
 * package: a broken/empty Windows launcher venv can still see the source tree
 * through PYTHONPATH but lack PyYAML, then die on the first real CLI import.
 *
 * @param {string} pythonPath - Absolute path to a python.exe / python.
 * @param {object} [opts]
 * @param {object} [opts.env] - Additional environment for the probe.
 * @returns {boolean}
 */
function canImportWayneCli(pythonPath, opts = {}) {
  if (!pythonPath) return false
  const timeoutMs =
    typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0
      ? opts.timeoutMs
      : PROBE_TIMEOUT_MS
  try {
    // execFileSync kills the child on timeout — so a live, progressing import
    // is waited out until it exits or the budget expires (no false fail while
    // the process is still working).
    execFileSync(pythonPath, ['-c', wayneRuntimeImportProbe()], {
      env: { ...process.env, ...(opts.env || {}) },
      stdio: 'ignore',
      timeout: timeoutMs,
      windowsHide: true
    })
    return true
  } catch {
    return false
  }
}

/**
 * Return true iff `<wayneCommand> --version` exits 0.
 *
 * Used to gate the "existing `wayne` on PATH" rung. Without this, a
 * stale wayne.cmd shim left behind by an uninstalled pip install (or
 * a half-built venv whose `wayne` entry-point points at a deleted
 * Python) survives findOnPath() and gets selected as the backend.
 *
 * We intentionally avoid invoking the command with the dashboard args
 * here -- `--version` is the cheapest "is this binary alive" smoke
 * test the CLI entry-point supports.
 *
 * @param {string} wayneCommand - Resolved absolute path to a wayne
 *   executable (or an interpreter+script wrapper).
 * @param {object} [opts]
 * @param {boolean} [opts.shell] - Whether to run through a shell. For
 *   .cmd/.bat shims on Windows execFileSync needs shell:true to find
 *   the cmd interpreter; mirrors the same flag isCommandScript() drives
 *   in the backend resolver.
 * @returns {boolean}
 */
function verifyWayneCli(wayneCommand, opts = {}) {
  if (!wayneCommand) return false
  const timeoutMs =
    typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0
      ? opts.timeoutMs
      : PROBE_TIMEOUT_MS
  try {
    execFileSync(wayneCommand, ['--version'], {
      stdio: 'ignore',
      timeout: timeoutMs,
      shell: Boolean(opts.shell),
      windowsHide: true
    })
    return true
  } catch {
    return false
  }
}

module.exports = {
  canImportWayneCli,
  wayneRuntimeImportProbe,
  verifyWayneCli,
  PROBE_TIMEOUT_MS
}
