import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isEmailAllowed } from "./allowlist";

describe("isEmailAllowed", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env };
  });

  afterEach(() => {
    process.env = env;
  });

  it("denies unknown emails in production when allowlist empty", () => {
    process.env.NODE_ENV = "production";
    delete process.env.ALLOWED_EMAILS;
    delete process.env.ALLOW_ALL_EMAILS;
    expect(isEmailAllowed("stranger@example.com")).toBe(false);
  });

  it("allows all when ALLOW_ALL_EMAILS=1 in production", () => {
    process.env.NODE_ENV = "production";
    process.env.ALLOW_ALL_EMAILS = "1";
    expect(isEmailAllowed("anyone@example.com")).toBe(true);
  });

  it("allows everyone in dev when allowlist empty", () => {
    process.env.NODE_ENV = "development";
    delete process.env.ALLOWED_EMAILS;
    expect(isEmailAllowed("dev@local.test")).toBe(true);
  });
});
