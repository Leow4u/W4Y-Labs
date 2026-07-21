import { describe, expect, it } from "vitest";

import { ApiError } from "@/lib/api";
import { errorMessage, technicalDetail } from "@/lib/error-message";
import type { ErrorStrings } from "@/lib/error-message";

/** Stand-in for `t.errors`; distinct values so a wrong branch is visible. */
const S: ErrorStrings = {
  network: "no-connection-sentence",
  unauthorized: "expired-session-sentence",
  forbidden: "no-permission-sentence",
  notFound: "not-found-sentence",
  rateLimited: "too-many-sentence",
  server: "service-down-sentence",
  unexpected: "generic-sentence",
};

/** Everything the user must never read on screen. */
const LEAKS = ["ApiError", "502", "detail", "upstream", "HTTP", "{", "}"];

describe("errorMessage", () => {
  it("never lets the raw ApiError text reach the interface", () => {
    const e = new ApiError(502, '{"detail":"upstream refused the connection"}');

    // The defect, stated: this is what the screens used to render.
    expect(String(e)).toContain("ApiError: 502");

    const shown = errorMessage(e, S);
    expect(shown).toBe(S.server);
    for (const leak of LEAKS) expect(shown).not.toContain(leak);
  });

  it("maps the statuses a person can act on", () => {
    expect(errorMessage(new ApiError(401, ""), S)).toBe(S.unauthorized);
    expect(errorMessage(new ApiError(403, ""), S)).toBe(S.forbidden);
    expect(errorMessage(new ApiError(404, ""), S)).toBe(S.notFound);
    expect(errorMessage(new ApiError(429, ""), S)).toBe(S.rateLimited);
  });

  it("treats the whole 5xx family as the service being down", () => {
    for (const status of [500, 502, 503, 504]) {
      expect(errorMessage(new ApiError(status, "boom"), S)).toBe(S.server);
    }
  });

  it("falls back to one generic sentence for unmapped statuses", () => {
    expect(errorMessage(new ApiError(418, "teapot"), S)).toBe(S.unexpected);
    expect(errorMessage(new ApiError(400, "bad request"), S)).toBe(S.unexpected);
  });

  it("calls a transport failure a connection problem", () => {
    // What fetch() rejects with when it never got an answer.
    expect(errorMessage(new TypeError("Failed to fetch"), S)).toBe(S.network);
  });

  it("never echoes a non-ApiError throw either", () => {
    const shown = errorMessage(new Error("Session token not available"), S);
    expect(shown).toBe(S.unexpected);
    expect(shown).not.toContain("Session token");

    const thrownString = errorMessage("ApiError: 502: nope", S);
    expect(thrownString).toBe(S.unexpected);
    expect(thrownString).not.toContain("502");
  });
});

describe("technicalDetail", () => {
  it("keeps the status and the body for the console", () => {
    const detail = technicalDetail(new ApiError(502, '{"detail":"upstream"}'));
    expect(detail).toContain("502");
    expect(detail).toContain("upstream");
  });

  it("describes non-ApiError throws without losing them", () => {
    expect(technicalDetail(new TypeError("Failed to fetch"))).toContain(
      "Failed to fetch",
    );
    expect(technicalDetail("plain string")).toBe("plain string");
  });
});
