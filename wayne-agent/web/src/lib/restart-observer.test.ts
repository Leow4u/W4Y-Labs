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

import { observeRestart, watchRestartJob, type RestartJobLike } from "./restart-observer";

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

  it("accepts the backend succeeded verdict without relying on an exit code", async () => {
    // Only proves that a `succeeded` verdict is honoured while a pid is still
    // reported. It creates no process and says nothing about foreground
    // gateways or slot release — that belongs to the backend/E2E round.
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

/**
 * Release gate: the flows that do NOT start the restart themselves.
 *
 * Telegram onboarding and enabling a webhook both restart as a side effect and
 * hand back `restart_job_id`. Both screens were still polling the global
 * `gateway-restart` action and judging it by exit code — the same defect the
 * channels flow had already shed. With two profiles that name cannot say whose
 * process it reports, and on a no-service install the restart command BECOMES
 * the foreground gateway and never exits, so there is no exit code to read.
 */
describe("watchRestartJob — following a restart somebody else started", () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, sleep: async () => { t += 1500; } };
  };

  it("polls the given job id and nothing else", async () => {
    const c = clock();
    const poll = vi.fn().mockResolvedValue(job({ job_id: "tg-1", state: "succeeded" }));
    const res = await watchRestartJob("tg-1", { poll, sleep: c.sleep, now: c.now });
    expect(poll).toHaveBeenCalledWith("tg-1");
    expect(res).toMatchObject({ ok: true, jobId: "tg-1" });
  });

  it("succeeds only when the BACKEND says succeeded", async () => {
    const c = clock();
    const states = ["queued", "running", "running", "succeeded"];
    let i = 0;
    const poll = vi.fn(async () => job({ state: states[i++] ?? "succeeded" }));
    await expect(
      watchRestartJob("j", { poll, sleep: c.sleep, now: c.now }),
    ).resolves.toMatchObject({ ok: true });
    expect(poll).toHaveBeenCalledTimes(4);
  });

  it("reports the backend's own failure reason", async () => {
    const c = clock();
    const poll = vi.fn().mockResolvedValue(
      job({ state: "failed", error: "restart timed out after 90s" }),
    );
    const res = await watchRestartJob("j", { poll, sleep: c.sleep, now: c.now });
    expect(res).toMatchObject({ ok: false, error: "restart timed out after 90s" });
  });

  it("survives transient poll errors — the gateway bouncing breaks requests", async () => {
    const c = clock();
    let n = 0;
    const poll = vi.fn(async () => {
      n += 1;
      if (n < 3) throw new Error("connection reset");
      return job({ state: "succeeded" });
    });
    await expect(
      watchRestartJob("j", { poll, sleep: c.sleep, now: c.now }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("accepts the backend succeeded verdict without relying on an exit code", async () => {
    // Same narrow claim as above: a `succeeded` verdict is honoured even though
    // a pid is still reported and no exit code ever appears. No process is
    // created here, so this proves nothing about a real foreground gateway.
    const c = clock();
    const poll = vi.fn().mockResolvedValue(job({ state: "succeeded", pid: 4242 }));
    await expect(
      watchRestartJob("j", { poll, sleep: c.sleep, now: c.now }),
    ).resolves.toMatchObject({ ok: true });
  });

  it("stopping being able to follow is NOT a gateway failure", async () => {
    const c = clock();
    const poll = vi.fn().mockRejectedValue(new Error("gone"));
    const res = await watchRestartJob("j", {
      poll,
      sleep: c.sleep,
      now: c.now,
      timeoutMs: 4500,
    });
    expect(res.ok).toBe(false);
    // The wording must say we lost track, not that the gateway failed.
    expect(res.ok === false && res.error).toBe("restart did not confirm in time");
    expect(res.ok === false && res.reason).toBe("unconfirmed");
  });
});

/**
 * Closing gate: "the backend judged it" and "we lost track" are different
 * facts, and the screens act on them differently — a proven failure names the
 * gateway, an unconfirmed one only says we could not follow. Neither may clear
 * a pending state.
 */
describe("failure is discriminated: proven vs unconfirmed", () => {
  const clock = () => {
    let t = 0;
    return { now: () => t, sleep: async () => { t += 1500; } };
  };

  it("a backend verdict is reason 'failed' and carries its reason", async () => {
    const c = clock();
    const poll = vi.fn().mockResolvedValue(
      job({ state: "failed", error: "restart exited with code 1" }),
    );
    const res = await watchRestartJob("j", { poll, sleep: c.sleep, now: c.now });
    expect(res).toMatchObject({
      ok: false,
      reason: "failed",
      error: "restart exited with code 1",
    });
  });

  it("running out of time is reason 'unconfirmed', not a gateway failure", async () => {
    const c = clock();
    const poll = vi.fn().mockResolvedValue(job({ state: "running" }));
    const res = await watchRestartJob("j", {
      poll,
      sleep: c.sleep,
      now: c.now,
      timeoutMs: 4500,
    });
    expect(res).toMatchObject({ ok: false, reason: "unconfirmed" });
  });

  it("a POST that throws is 'unconfirmed' — nothing was judged", async () => {
    const d = deps({ start: vi.fn().mockRejectedValue(new Error("network down")) });
    const res = await observeRestart(null, d);
    expect(res).toMatchObject({ ok: false, reason: "unconfirmed" });
  });

  it("a response with no job identity is 'unconfirmed', never a failure", async () => {
    const d = deps({ start: vi.fn().mockResolvedValue({ ...job(), job_id: "" }) });
    const res = await observeRestart(null, d);
    expect(res).toMatchObject({ ok: false, reason: "unconfirmed" });
  });

  it("a job the POST already failed is 'failed' — that one WAS judged", async () => {
    const d = deps({
      start: vi.fn().mockResolvedValue(job({ state: "failed", error: "no such profile" })),
    });
    const res = await observeRestart("ghost", d);
    expect(res).toMatchObject({ ok: false, reason: "failed", error: "no such profile" });
  });
});
