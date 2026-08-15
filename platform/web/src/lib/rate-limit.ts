/**
 * In-memory sliding-window rate limiter for serverless routes.
 * Sufficient for MVP; replace with Redis/Memorystore at scale.
 */

const buckets = new Map<string, number[]>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): { allowed: boolean; retryAfterSec: number } {
  const now = Date.now();
  const windowStart = now - windowMs;
  const hits = (buckets.get(key) ?? []).filter((t) => t > windowStart);
  if (hits.length >= limit) {
    const oldest = hits[0] ?? now;
    const retryAfterSec = Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
    buckets.set(key, hits);
    return { allowed: false, retryAfterSec };
  }
  hits.push(now);
  buckets.set(key, hits);
  return { allowed: true, retryAfterSec: 0 };
}

/** Trim stale keys periodically (best-effort, serverless-safe). */
export function pruneRateLimitBuckets(maxAgeMs = 3600_000): void {
  const cutoff = Date.now() - maxAgeMs;
  for (const [key, hits] of buckets) {
    const fresh = hits.filter((t) => t > cutoff);
    if (fresh.length === 0) buckets.delete(key);
    else buckets.set(key, fresh);
  }
}
