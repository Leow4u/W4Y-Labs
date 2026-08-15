import { describe, expect, it, vi } from "vitest";
import { FREE_ALLOWANCE_USD } from "./billing";
import { resolveTenantKey, type TenantKeyDeps } from "./tenant-runtime-key";

function deps(over: Partial<TenantKeyDeps> = {}): TenantKeyDeps {
  return {
    load: async () => null,
    store: async () => true,
    mint: async () => ({ key: "sk-or-new", hash: "hash-new" }),
    recordHash: async () => {},
    secretsEnabled: () => true,
    log: () => {},
    ...over,
  };
}

describe("tenant runtime key", () => {
  it("returns the stored key without minting", async () => {
    const mint = vi.fn();
    const key = await resolveTenantKey("t-stored", 20, deps({
      load: async () => "sk-or-stored",
      mint,
    }));

    expect(key).toBe("sk-or-stored");
    expect(mint).not.toHaveBeenCalled();
  });

  it("mints and persists for a tenant that predates the shared motor", async () => {
    const store = vi.fn(async () => true);
    const recordHash = vi.fn(async () => {});

    const key = await resolveTenantKey("t-legacy", 70, deps({ store, recordHash }));

    expect(key).toBe("sk-or-new");
    expect(store).toHaveBeenCalledWith("t-legacy", "sk-or-new");
    expect(recordHash).toHaveBeenCalledWith("t-legacy", "hash-new");
  });

  it("floors the ceiling at the free allowance", async () => {
    // A zero ceiling is refused by OpenRouter, which would strand the tenant.
    const mint = vi.fn(async () => ({ key: "sk-or-free", hash: "h" }));

    await resolveTenantKey("t-free", 0, deps({ mint }));

    expect(mint).toHaveBeenCalledWith("t-free", FREE_ALLOWANCE_USD);
  });

  it("mints once when several requests bootstrap at the same time", async () => {
    let release = () => {};
    const gate = new Promise<void>((r) => (release = r));
    const mint = vi.fn(async () => {
      await gate;
      return { key: "sk-or-once", hash: "h" };
    });

    const all = Promise.all([
      resolveTenantKey("t-burst", 20, deps({ mint })),
      resolveTenantKey("t-burst", 20, deps({ mint })),
      resolveTenantKey("t-burst", 20, deps({ mint })),
    ]);
    release();

    expect(await all).toEqual(["sk-or-once", "sk-or-once", "sk-or-once"]);
    expect(mint).toHaveBeenCalledTimes(1);
  });

  it("refuses to hand out a key it could not store", async () => {
    // Returning it anyway would give the motor a key we can never look up
    // again, so the next bootstrap would mint yet another one.
    const key = await resolveTenantKey("t-nostore", 20, deps({ store: async () => false }));

    expect(key).toBe("");
  });

  it("does not mint when there is no secret store", async () => {
    const mint = vi.fn();

    const key = await resolveTenantKey("t-dev", 20, deps({
      secretsEnabled: () => false,
      mint,
    }));

    expect(key).toBe("");
    expect(mint).not.toHaveBeenCalled();
  });

  it("reports a mint failure instead of throwing", async () => {
    const key = await resolveTenantKey("t-down", 20, deps({
      mint: async () => {
        throw new Error("openrouter unreachable");
      },
    }));

    expect(key).toBe("");
  });

  it("retries on the next request after a failure", async () => {
    const mint = vi
      .fn()
      .mockRejectedValueOnce(new Error("openrouter unreachable"))
      .mockResolvedValueOnce({ key: "sk-or-later", hash: "h" });

    expect(await resolveTenantKey("t-retry", 20, deps({ mint }))).toBe("");
    expect(await resolveTenantKey("t-retry", 20, deps({ mint }))).toBe("sk-or-later");
  });
});
