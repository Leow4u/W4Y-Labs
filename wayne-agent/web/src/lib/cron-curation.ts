/**
 * Routine (Schedule) curation — separates the system's INTERNAL jobs from what
 * the user created, along the same lines as the Files curation.
 *
 * Unlike Files (60 system folders), cron does NOT have a hard `system` flag in
 * the model. "Internal" here is, in practice:
 *   1. the form's technical fields (provider/model/script/no_agent/toolsets) —
 *      already hidden behind ?full=1 (CronPage);
 *   2. jobs eventually created by the PLATFORM (e.g. billing notices,
 *      maintenance), which we agreed to mark with a reserved name prefix.
 *
 * CONSERVATIVE heuristic: only treats as system what matches a reserved
 * prefix — never hides a user job by mistake. Confirmed live (if platform jobs
 * show up with another pattern, it's just a matter of adding it here). In the
 * ?full=1 view (us/support) everything shows.
 */
import type { CronJob } from "@/lib/api";

// Name prefixes reserved for platform-managed jobs.
const SYSTEM_NAME_PREFIXES = ["__", "wayne:", "sys:", "system:", "internal:"];

export function isSystemJob(job: CronJob): boolean {
  const name = (job.name ?? "").trim().toLowerCase();
  if (!name) return false;
  return SYSTEM_NAME_PREFIXES.some((p) => name.startsWith(p));
}

/** Splits the list into user routines and system jobs. */
export function partitionJobs(jobs: CronJob[]): { user: CronJob[]; system: CronJob[] } {
  const user: CronJob[] = [];
  const system: CronJob[] = [];
  for (const job of jobs) (isSystemJob(job) ? system : user).push(job);
  return { user, system };
}
