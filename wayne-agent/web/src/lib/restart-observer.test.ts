/**
 * Watching the RIGHT restart job.
 *
 * The defect: the POST answered with the global action name `gateway-restart`
 * and the client polled that name. Two profiles restarting in sequence were
 * indistinguishable through it, so job A could be handed process B's result —
 * and "success" was decided from an exit code, which cannot answer the question
 * at all (the gateway may run in the foreground and never exit).
 */
import { describe, expect, it, vi } from "vitest";

import { observeRestart, type RestartJobLike } from "./restart-observer";

const job = (over: Partial<RestartJobLike> = {}): RestartJobLike => ({
  job_id: "job-1",
  profile: null,
  state: "running",
  pid: 4242,
  reused: false,
  error: null,
  ...over,
});

/** A clock the test drives; sleep just advances it. */
const fakeTime = (step = 1500) => {
  let t = 0;
  return {
    now: () => t,
    sleep: async () => {
      t += step;
    },
  };
};

const deps = (over: Partial<Parameters<typeof observeRestart>[1]>) => {
  const clock = fakeTime();
  return {
    start: vi.fn().mockResolvedValue(job()),
    poll: vi.fn().mockResolvedValue(job({ state: "succeeded" })),
    sleep: clock.sleep,
    now: clock.now,
    ...over,
  };
};

describe("observeRestart — identity", () => {
  it("polls the job id the POST returned, not a global name", async () => {
    const d = deps({
      start: vi.fn().mockResolvedValue(job({ job_id: "abc123" })),
      poll: vi.fn().mockResolvedValue(job({ job_id: "abc123", state: "succeeded" })),
    });
    const res = await observeRestart("vendas", d);
    expect(d.poll).toHaveBeenCalledWith("abc123");
    expect(res).toMatchObject({ ok: true, jobId: "abc123" });
  });

  it("starts the restart for the profile it was given", async () => {
    const d = deps({});
    await observeRestart("suporte", d);
    expect(d.start).toHaveBeenCalledWith("suporte");
  });

  it("passes null through for the GLOBAL gateway", async () => {
    const d = deps({});
    await observeRestart(null, d);
    expect(d.start).toHaveBeenCalledWith(null);
  });

  it("never mixes two profiles' jobs", async () => {
    // Each observation must follow its own id even when both run at once.
    const mk = (id: string, profile: string) =>
      deps({
        start: vi.fn().mockResolvedValue(job({ job_id: id, profile })),
        poll: vi.fn(async (asked: string) =>
          job({ job_id: asked, profile, state: asked === id ? "succeeded" : "running" }),
        ),
      });
    const a = mk("job-A", "vendas");
    const b = mk("job-B", "suporte");
    const [ra, rb] = await Promise.all([
      observeRestart("vendas", a),
      observeRestart("suporte", b),
    ]);
    expect(ra).toMatchObject({ ok: true, jobId: "job-A" });
    expect(rb).toMatchObject({ ok: true, jobId: "job-B" });
    expect(a.poll).toHaveBeenCalledWith("job-A");
    expect(b.poll).toHaveBeenCalledWith("job-B");
  });

  it("reports that it joined an operation already queued", async () => {
    const d = deps({
      start: vi.fn().mockResolvedValue(job({ reused: true, state: "queued" })),
      poll: vi.fn().mockResolvedValue(job({ reused: true, state: "succeeded" })),
    });
    const res = await observeRestart("vendas", d);
    expect(res).toMatchObject({ ok: true, reused: true });
  });

  it("refuses to poll a response with no job identity", async () => {
    const d = deps({
      start: vi.fn().mockResolvedValue({ ...job(), job_id: "" }),
    });
    const res = await observeRestart(null, d);
    expect(res.ok).toBe(false);
    expect(d.poll).not.toHaveBeenCalled();
  });
});

describe("observeRestart — verdict comes from the backend", () => {
  it("keeps waiting through queued and running", async () => {
    const states = ["queued", "running", "running", "succeeded"];
    let i = 0;
    const d = deps({
      poll: vi.fn(async () => job({ state: states[i++] ?? "succeeded" })),
    });
    const res = await observeRestart("vendas", d);
    expect(res.ok).toBe(true);
    expect(d.poll).toHaveBeenCalledTimes(4);
  });

  it("succeeds when the backend says succeeded — even with the process alive", async () => {
    // Foreground gateway on Linux/macOS: pid is still there, and that is fine.
    const d = deps({
      poll: vi.fn().mockResolvedValue(job({ state: "succeeded", pid: 4242 })),
    });
    await expect(observeRestart("vendas", d)).resolves.toMatchObject({ ok: true });
  });

  it("fails with the backend's own reason", async () => {
    const d = deps({
      poll: vi.fn().mockResolvedValue(
        job({ state: "failed", error: "restart exited with code 1" }),
      ),
    });
    const res = await observeRestart("vendas", d);
    expect(res).toMatchObject({ ok: false, error: "restart exited with code 1" });
  });

  it("does not poll a job the POST already failed", async () => {
    const d = deps({
      start: vi.fn().mockResolvedValue(job({ state: "failed", error: "no such profile" })),
    });
    const res = await observeRestart("ghost", d);
    expect(res).toMatchObject({ ok: false, error: "no such profile" });
    expect(d.poll).not.toHaveBeenCalled();
  });

  it("accepts a POST that already came back succeeded", async () => {
    const d = deps({ start: vi.fn().mockResolvedValue(job({ state: "succeeded" })) });
    const res = await observeRestart("vendas", d);
    expect(res.ok).toBe(true);
    expect(d.poll).not.toHaveBeenCalled();
  });
});

describe("observeRestart — failures that are not verdicts", () => {
  it("survives a transient poll error and keeps waiting", async () => {
    let n = 0;
    const d = deps({
      poll: vi.fn(async () => {
        n += 1;
        if (n < 3) throw new Error("connection reset"); // the gateway bouncing
        return job({ state: "succeeded" });
      }),
    });
    await expect(observeRestart("vendas", d)).resolves.toMatchObject({ ok: true });
  });

  it("gives up at the deadline instead of polling forever", async () => {
    const d = deps({ poll: vi.fn().mockResolvedValue(job({ state: "running" })) });
    const res = await observeRestart("vendas", { ...d, timeoutMs: 4500 });
    expect(res).toMatchObject({ ok: false, error: "restart did not confirm in time" });
  });

  it("never reports unverified success when polling never succeeds", async () => {
    const d = deps({ poll: vi.fn().mockRejectedValue(new Error("gone")) });
    const res = await observeRestart("vendas", { ...d, timeoutMs: 3000 });
    expect(res.ok).toBe(false);
  });

  it("reports a POST that throws", async () => {
    const d = deps({ start: vi.fn().mockRejectedValue(new Error("network down")) });
    const res = await observeRestart(null, d);
    expect(res).toMatchObject({ ok: false });
    expect(res.ok === false && res.error).toContain("network down");
  });
});
