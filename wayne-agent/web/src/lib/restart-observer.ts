/**
 * Start a restart and watch THAT operation until the backend decides.
 *
 * Split out of useRestartFlow so it can be tested at all: this project's vitest
 * setup is `environment: node` with no jsdom and no @testing-library, so a hook
 * cannot be rendered. Everything worth testing here — which job is polled, what
 * counts as done, what happens when a read fails — is plain async logic, so it
 * lives where a test can reach it.
 *
 * What it deliberately does NOT do is judge the restart. That decision moved to
 * the backend (`wayne_cli/restart_jobs.judge_restart`), which is the only place
 * that can check real gateway health: the gateway may run in the FOREGROUND and
 * never exit, and a process exiting 0 proves only that a command ran.
 */

export interface RestartJobLike {
  job_id: string;
  profile: string | null;
  state: string;
  pid: number | null;
  reused: boolean;
  error: string | null;
}

export type ObserveResult =
  | { ok: true; jobId: string; reused: boolean }
  | { ok: false; error: string; jobId?: string };

export interface ObserveDeps {
  /** POST the restart; must answer with the identity of THIS operation. */
  start: (profile: string | null) => Promise<RestartJobLike>;
  /** GET one job by its own id — never a global action name. */
  poll: (jobId: string) => Promise<RestartJobLike>;
  sleep: (ms: number) => Promise<unknown>;
  now: () => number;
  intervalMs?: number;
  timeoutMs?: number;
}

/**
 * @returns ok only when the backend says `succeeded`. "queued"/"running" keep
 *          waiting; anything else is reported with the backend's own reason.
 */
export async function observeRestart(
  profile: string | null,
  deps: ObserveDeps,
): Promise<ObserveResult> {
  const { start, poll, sleep, now, intervalMs = 1500, timeoutMs = 90_000 } = deps;

  let job: RestartJobLike;
  try {
    job = await start(profile);
  } catch (e) {
    return { ok: false, error: String(e) };
  }
  if (!job || !job.job_id) {
    return { ok: false, error: (job && job.error) || "restart refused" };
  }
  // A job the backend already failed (an unknown profile, a spawn that blew up)
  // must not be polled — it will never change.
  if (job.state === "failed") {
    return { ok: false, error: job.error || "restart refused", jobId: job.job_id };
  }
  if (job.state === "succeeded") {
    return { ok: true, jobId: job.job_id, reused: !!job.reused };
  }

  const jobId = job.job_id;
  const startedAt = now();
  for (;;) {
    await sleep(intervalMs);
    let current: RestartJobLike | null = null;
    try {
      current = await poll(jobId);
    } catch {
      // One unreadable read proves nothing — the gateway bouncing can break
      // this very request. Only the deadline ends the wait.
      current = null;
    }
    if (current) {
      if (current.state === "succeeded") {
        return { ok: true, jobId, reused: !!current.reused };
      }
      if (current.state === "failed") {
        return { ok: false, error: current.error || "restart failed", jobId };
      }
    }
    if (now() - startedAt >= timeoutMs) {
      return { ok: false, error: "restart did not confirm in time", jobId };
    }
  }
}
