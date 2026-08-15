import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { signSession, verifySession } from "./session-cookie";

describe("session-cookie", () => {
  const env = process.env;

  beforeEach(() => {
    process.env = { ...env, W4Y_SESSION_SECRET: "test-secret-at-least-32-bytes-long!!" };
  });

  afterEach(() => {
    process.env = env;
  });

  it("round-trips email and tenantId", async () => {
    const token = await signSession({ email: "a@b.com", tenantId: "t-1" });
    const payload = await verifySession(token);
    expect(payload).toEqual({ email: "a@b.com", tenantId: "t-1" });
  });

  it("rejects tampered token", async () => {
    const token = await signSession({ email: "a@b.com", tenantId: "t-1" });
    const bad = token.slice(0, -4) + "xxxx";
    expect(await verifySession(bad)).toBeNull();
  });
});
