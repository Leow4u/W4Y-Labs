/**
 * One place that turns a rejected api call into a sentence for a person.
 *
 * `String(e)` on an `ApiError` renders the transport verbatim —
 * `ApiError: 502: {"detail":"upstream refused"}` — and screens were putting
 * that straight into a toast. The status and the response body ARE worth
 * keeping: they are how you debug the thing. They are just not a sentence.
 * So the two are split here: `errorMessage` for the interface,
 * `technicalDetail` (and `logApiError`) for the console.
 *
 * The mapping reads the HTTP status via `httpStatus`, never the backend's
 * English prose — the prose is not a contract, the status is. Same principle
 * as `describeFileError` in FilesPage; this is the shared version.
 */
import { ApiError, httpStatus } from "@/lib/api";

/** The localized sentences — `t.errors` from the i18n bundle. */
export interface ErrorStrings {
  network: string;
  unauthorized: string;
  forbidden: string;
  notFound: string;
  rateLimited: string;
  server: string;
  unexpected: string;
}

/**
 * A human, localized sentence for a failed request.
 *
 * Never returns the raw error: no class name, no status number, no response
 * body. Callers that want those should log `technicalDetail(e)`.
 */
export function errorMessage(e: unknown, s: ErrorStrings): string {
  const status = httpStatus(e);
  if (status === null) {
    // No HTTP answer at all — `fetch` itself rejected (offline, DNS, CORS,
    // aborted). A TypeError is what fetch throws for a transport failure.
    return e instanceof TypeError ? s.network : s.unexpected;
  }
  if (status === 401) return s.unauthorized;
  if (status === 403) return s.forbidden;
  if (status === 404) return s.notFound;
  if (status === 429) return s.rateLimited;
  // 5xx is the gateway/upstream family the user kept seeing as "ApiError: 502".
  if (status >= 500) return s.server;
  return s.unexpected;
}

/** The technical side of a failure — for the console and logs, never the screen. */
export function technicalDetail(e: unknown): string {
  if (e instanceof ApiError) return `HTTP ${e.status} ${e.body}`.trim();
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  return String(e);
}

/**
 * Log a failure with its status and body, so nothing is lost by showing the
 * user a plain sentence instead.
 */
export function logApiError(scope: string, e: unknown): void {
  console.error(`[${scope}] ${technicalDetail(e)}`);
}
