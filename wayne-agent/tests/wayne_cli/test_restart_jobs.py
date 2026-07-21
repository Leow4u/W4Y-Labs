"""Restart jobs: identity, queue, durable marker and health-based verdict.

Every test here is a defect that shipped, not a hypothetical. The coordination
used to live in a React hook, so a reload lost the queue, a disable was
invisible, and "the process started" was reported to the user as "applied".
"""

from __future__ import annotations

import pytest

from wayne_cli import restart_jobs as rj


class FakeProc:
    """Minimal stand-in for subprocess.Popen: pid + poll()."""

    def __init__(self, pid: int, code=None):
        self.pid = pid
        self._code = code

    def poll(self):
        return self._code

    def finish(self, code=0):
        self._code = code


class Harness:
    """A coordinator wired to fakes, with a clock the test drives."""

    def __init__(self, tmp_path, timeout=90.0):
        self.now = 1000.0
        self.spawned = []
        self.procs = {}
        self.health = {}
        self.spawn_error = {}
        self.generation = {}
        self.tmp = tmp_path
        self.coord = rj.RestartCoordinator(
            spawn=self._spawn,
            probe=lambda p, baseline: self.health.get(rj.profile_key(p), rj.HealthReport()),
            home_for=self.home_for,
            identity=self.identity,
            clock=lambda: self.now,
            timeout=timeout,
        )

    def identity(self, profile):
        """Pre-restart gateway identity; the fake bumps it when a restart lands."""
        return self.generation.get(rj.profile_key(profile), 0)

    def home_for(self, profile):
        home = self.tmp / (rj.profile_key(profile) or "__global__")
        home.mkdir(parents=True, exist_ok=True)
        return home

    def _spawn(self, profile):
        key = rj.profile_key(profile)
        if key in self.spawn_error:
            err = self.spawn_error[key]
            raise err if isinstance(err, BaseException) else RuntimeError(err)
        self.spawned.append(key)
        proc = FakeProc(pid=9000 + len(self.spawned))
        self.procs[key] = proc
        return proc

    def healthy(self, profile, *, applied=True):
        self.health[rj.profile_key(profile)] = rj.HealthReport(
            healthy=True, config_applied=applied
        )


@pytest.fixture()
def h(tmp_path):
    return Harness(tmp_path)


# ── Identity ──────────────────────────────────────────────────────────────────
class TestJobIdentity:
    def test_request_returns_an_opaque_unique_job_id_with_profile_and_pid(self, h):
        a = h.coord.request("vendas")
        b = h.coord.request("suporte")
        assert a.job_id and b.job_id and a.job_id != b.job_id
        assert a.profile == "vendas"
        assert a.state == rj.RUNNING and a.pid is not None
        # Global slot is serialized, so the second waits with no PID yet.
        assert b.state == rj.QUEUED and b.pid is None

    def test_status_is_read_by_job_id_not_by_a_global_name(self, h):
        a = h.coord.request("vendas")
        b = h.coord.request("suporte")
        assert h.coord.get(a.job_id).job_id == a.job_id
        assert h.coord.get(b.job_id).job_id == b.job_id
        assert h.coord.get("nope") is None

    def test_job_A_never_inherits_the_result_of_process_B(self, h):
        a = h.coord.request("vendas")
        b = h.coord.request("suporte")
        # A succeeds; B has not even started.
        h.healthy("vendas")
        h.now += 1
        assert h.coord.get(a.job_id).state == rj.SUCCEEDED
        # B took the slot but its own gateway is not healthy yet.
        b = h.coord.get(b.job_id)
        assert b.state == rj.RUNNING
        assert b.pid != a.pid

    def test_reuse_is_reported(self, h):
        h.coord.request("vendas")  # takes the slot
        first = h.coord.request("suporte")
        again = h.coord.request("suporte")
        assert again.job_id == first.job_id
        assert again.reused is True


# ── Queue ─────────────────────────────────────────────────────────────────────
class TestQueue:
    def test_several_changes_to_the_same_profile_collapse_into_one_run(self, h):
        h.coord.request("global-holder")  # occupy the slot
        ids = {h.coord.request("vendas").job_id for _ in range(4)}
        assert len(ids) == 1

    def test_different_profiles_each_get_their_own_job(self, h):
        h.coord.request("holder")
        a = h.coord.request("vendas")
        b = h.coord.request("suporte")
        assert a.job_id != b.job_id
        assert h.coord.pending_profiles() == ["vendas", "suporte"]

    def test_a_change_while_the_same_profile_is_running_earns_one_extra_run(self, h):
        first = h.coord.request("vendas")  # running
        second = h.coord.request("vendas")  # config may already have been read
        third = h.coord.request("vendas")  # but only ONE extra, not two
        assert second.job_id != first.job_id
        assert third.job_id == second.job_id

    def test_failure_of_one_profile_does_not_drop_the_others(self, h):
        # THE regression: restart-failed used to wipe the whole queue, so a
        # failure on A silently discarded B's saved change.
        a = h.coord.request("vendas")
        b = h.coord.request("suporte")
        c = h.coord.request(None)  # global
        h.procs["vendas"].finish(1)  # A dies with an error
        h.now += 1
        assert h.coord.get(a.job_id).state == rj.FAILED
        assert h.coord.get(b.job_id).state == rj.RUNNING  # B took the slot
        assert h.coord.get(c.job_id).state == rj.QUEUED  # global still owed

    def test_global_failing_does_not_drop_an_agent_in_the_queue(self, h):
        g = h.coord.request(None)
        a = h.coord.request("vendas")
        h.procs[""].finish(2)
        h.now += 1
        assert h.coord.get(g.job_id).state == rj.FAILED
        assert h.coord.get(a.job_id).state == rj.RUNNING

    def test_a_spawn_that_explodes_does_not_stall_the_queue(self, h):
        h.spawn_error["vendas"] = "no such profile"
        a = h.coord.request("vendas")
        b = h.coord.request("suporte")
        assert h.coord.get(a.job_id).state == rj.FAILED
        assert "no such profile" in h.coord.get(a.job_id).error
        assert h.coord.get(b.job_id).state == rj.RUNNING

    def test_retry_after_a_failure_is_a_fresh_job_for_that_profile_only(self, h):
        a = h.coord.request("vendas")
        h.procs["vendas"].finish(1)
        h.now += 1
        h.coord.get(a.job_id)
        retry = h.coord.request("vendas")
        assert retry.job_id != a.job_id
        assert retry.profile == "vendas"

    def test_only_one_restart_process_runs_at_a_time(self, h):
        h.coord.request("a")
        h.coord.request("b")
        h.coord.request("c")
        assert h.spawned == ["a"]  # b and c wait for the global slot


# ── Verdict ───────────────────────────────────────────────────────────────────
class TestVerdict:
    def j(self, **kw):
        base = dict(
            exited=False,
            exit_code=None,
            health=rj.HealthReport(),
            elapsed=0.0,
            timeout=90.0,
        )
        base.update(kw)
        return rj.judge_restart(**base)

    def test_process_exiting_with_an_error_is_a_failure(self):
        state, err = self.j(exited=True, exit_code=1)
        assert state == rj.FAILED and "1" in err

    def test_exit_zero_alone_is_not_success(self):
        # The old flow reported success here. It only proves a command ran.
        state, _ = self.j(exited=True, exit_code=0)
        assert state == rj.RUNNING

    def test_missing_status_is_not_success(self):
        state, _ = self.j(exited=False, exit_code=None)
        assert state == rj.RUNNING

    def test_health_plus_applied_config_is_success_even_while_the_process_lives(self):
        # Linux/macOS foreground gateway: the supervisor never exits, and
        # waiting for it timed a perfectly healthy gateway out.
        state, err = self.j(
            exited=False, health=rj.HealthReport(healthy=True, config_applied=True)
        )
        assert state == rj.SUCCEEDED and err is None

    def test_healthy_but_config_not_applied_is_not_success(self):
        # The old gateway answering with the OLD config.
        state, _ = self.j(health=rj.HealthReport(healthy=True, config_applied=False))
        assert state == rj.RUNNING

    def test_unknown_health_keeps_waiting_until_the_timeout(self):
        state, _ = self.j(health=rj.HealthReport(healthy=None), elapsed=10.0)
        assert state == rj.RUNNING

    def test_timeout_without_confirmed_health_is_a_failure_not_unverified_success(self):
        state, err = self.j(elapsed=90.0)
        assert state == rj.FAILED and "timed out" in err

    def test_an_erroring_process_beats_a_healthy_looking_gateway(self):
        # Health can be the PREVIOUS gateway still serving the old config.
        state, _ = self.j(
            exited=True,
            exit_code=3,
            health=rj.HealthReport(healthy=True, config_applied=True),
        )
        assert state == rj.FAILED


class TestVerdictInCoordinator:
    def test_foreground_gateway_succeeds_without_the_process_ever_exiting(self, h):
        job = h.coord.request("vendas")
        assert h.procs["vendas"].poll() is None  # still running, as on Linux
        h.healthy("vendas")
        h.now += 2
        assert h.coord.get(job.job_id).state == rj.SUCCEEDED

    def test_timeout_fails_and_leaves_the_profile_retryable(self, h):
        job = h.coord.request("vendas")
        h.now += 91
        done = h.coord.get(job.job_id)
        assert done.state == rj.FAILED
        assert h.coord.request("vendas").state == rj.RUNNING  # retry allowed


# ── Durable marker ────────────────────────────────────────────────────────────
class TestDurableMarker:
    def test_absent_marker_means_nothing_pending(self, tmp_path):
        assert rj.is_restart_needed(tmp_path) is False
        assert rj.read_pending(tmp_path) == {}

    @pytest.mark.parametrize(
        "reason", [rj.REASON_ENABLE, rj.REASON_DISABLE, rj.REASON_CREDENTIALS]
    )
    def test_every_kind_of_change_can_be_recorded(self, tmp_path, reason):
        # A DISABLE is the case current-state derivation cannot see: the backend
        # reports "disabled" while the running gateway still serves the channel.
        rj.mark_restart_needed(tmp_path, reason=reason, platform="slack")
        assert rj.is_restart_needed(tmp_path) is True
        assert reason in rj.read_pending(tmp_path)["reasons"]

    def test_it_survives_being_read_by_a_brand_new_process(self, tmp_path):
        rj.mark_restart_needed(tmp_path, reason=rj.REASON_ENABLE, platform="slack")
        # Nothing cached in memory: this is what a reload / server restart sees.
        assert rj.read_pending(tmp_path)["platforms"] == ["slack"]

    def test_marks_accumulate_and_keep_the_original_timestamp(self, tmp_path):
        first = rj.mark_restart_needed(
            tmp_path, reason=rj.REASON_ENABLE, platform="slack", now=100.0
        )
        second = rj.mark_restart_needed(
            tmp_path, reason=rj.REASON_DISABLE, platform="telegram", now=200.0
        )
        assert second["since"] == first["since"] == 100.0
        assert second["reasons"] == ["disable", "enable"]
        assert second["platforms"] == ["slack", "telegram"]

    def test_clearing_is_idempotent(self, tmp_path):
        rj.mark_restart_needed(tmp_path, reason=rj.REASON_ENABLE)
        rj.clear_restart_needed(tmp_path)
        rj.clear_restart_needed(tmp_path)
        assert rj.is_restart_needed(tmp_path) is False

    def test_a_corrupt_marker_does_not_brick_the_screen(self, tmp_path):
        (tmp_path / rj.PENDING_FILENAME).write_text("{not json", encoding="utf-8")
        assert rj.read_pending(tmp_path) == {}

    def test_an_unknown_reason_is_refused(self, tmp_path):
        with pytest.raises(ValueError):
            rj.mark_restart_needed(tmp_path, reason="whatever")

    def test_marker_is_cleared_ONLY_after_confirmed_application(self, h):
        home = h.home_for("vendas")
        rj.mark_restart_needed(home, reason=rj.REASON_DISABLE, platform="slack")
        job = h.coord.request("vendas")

        # Process exited 0 but health is unknown → still owed.
        h.procs["vendas"].finish(0)
        h.now += 1
        h.coord.get(job.job_id)
        assert rj.is_restart_needed(home) is True

        h.healthy("vendas")
        h.now += 1
        assert h.coord.get(job.job_id).state == rj.SUCCEEDED
        assert rj.is_restart_needed(home) is False

    def test_a_failed_restart_leaves_the_marker_in_place(self, h):
        home = h.home_for("vendas")
        rj.mark_restart_needed(home, reason=rj.REASON_ENABLE)
        job = h.coord.request("vendas")
        h.procs["vendas"].finish(1)
        h.now += 1
        assert h.coord.get(job.job_id).state == rj.FAILED
        assert rj.is_restart_needed(home) is True

    def test_each_profile_owns_its_own_marker(self, h):
        rj.mark_restart_needed(h.home_for("vendas"), reason=rj.REASON_ENABLE)
        assert rj.is_restart_needed(h.home_for("vendas")) is True
        assert rj.is_restart_needed(h.home_for("suporte")) is False
        assert rj.is_restart_needed(h.home_for(None)) is False


class TestLiveness:
    """Found by independent review AFTER the first pass — both confirmed live."""

    def test_polling_a_queued_job_advances_the_one_holding_the_slot(self, h):
        # Nothing here runs on a timer. Advancing only the polled job meant a
        # client watching its OWN queued job waited forever for a slot whose
        # holder nobody was looking at — past that holder's timeout included.
        a = h.coord.request("vendas")
        b = h.coord.request("suporte")
        h.healthy("vendas")
        h.now += 1
        assert h.coord.get(b.job_id).state == rj.RUNNING  # polled B, A advanced
        assert h.coord.get(a.job_id).state == rj.SUCCEEDED

    def test_a_queued_job_still_starts_when_the_holder_times_out(self, h):
        a = h.coord.request("vendas")
        b = h.coord.request("suporte")
        h.now += 91  # A never reports healthy
        assert h.coord.get(b.job_id).state == rj.RUNNING
        assert h.coord.get(a.job_id).state == rj.FAILED

    def test_a_throwing_home_resolver_never_wedges_the_queue(self, tmp_path):
        # This was real: _restart_home_for(None) raised NameError, and because
        # the marker was cleared BEFORE the slot was released, one successful
        # global restart left _active held forever.
        harness = Harness(tmp_path)

        def boom(_profile):
            raise RuntimeError("home resolver exploded")

        harness.coord._home_for = boom
        a = harness.coord.request(None)
        b = harness.coord.request("vendas")
        harness.healthy(None)
        harness.now += 1
        assert harness.coord.get(a.job_id).state == rj.SUCCEEDED
        assert harness.coord.get(b.job_id).state == rj.RUNNING  # slot released


class TestBusyIsNotFailure:
    """A spawner that refuses because the OS slot is taken must not lose work."""

    def test_a_busy_spawner_requeues_instead_of_failing_the_job(self, h):
        h.spawn_error["vendas"] = rj.RestartBusy("already in progress")
        job = h.coord.request("vendas")
        assert job.state == rj.QUEUED  # still owed, not FAILED
        assert h.coord.pending_profiles() == ["vendas"]

    def test_busy_does_not_drain_the_rest_of_the_queue(self, h):
        # The regression: _spawn_gateway_restart raises for a DIFFERENT profile,
        # and letting that surface as a job failure emptied the whole queue into
        # FAILED in one _pump pass — the refusal had been moved, not removed.
        h.spawn_error["vendas"] = rj.RestartBusy("already in progress")
        h.spawn_error["suporte"] = rj.RestartBusy("already in progress")
        a = h.coord.request("vendas")
        b = h.coord.request("suporte")
        assert h.coord.get(a.job_id).state == rj.QUEUED
        assert h.coord.get(b.job_id).state == rj.QUEUED

    def test_a_requeued_job_starts_once_the_slot_frees_up(self, h):
        h.spawn_error["vendas"] = rj.RestartBusy("already in progress")
        job = h.coord.request("vendas")
        assert h.coord.get(job.job_id).state == rj.QUEUED
        del h.spawn_error["vendas"]  # the outside restart finished
        assert h.coord.get(job.job_id).state == rj.RUNNING


class TestRealProbeSemantics:
    """The verdict rules the identity-based probe has to satisfy.

    These drive judge_restart with what _gateway_identity/_restart_probe
    actually produce, so the rules are pinned independently of the web_server
    wiring — which is where the first version's two blockers lived.
    """

    def probe_result(self, *, gateway_present, baseline, current):
        """Mirror of _restart_probe's decision, kept in lockstep by review."""
        if not gateway_present:
            return rj.HealthReport(healthy=False, config_applied=None)
        if baseline is None:
            return rj.HealthReport(healthy=True, config_applied=None)
        return rj.HealthReport(healthy=True, config_applied=current != baseline)

    def judge(self, health, elapsed=1.0):
        return rj.judge_restart(
            exited=False, exit_code=None, health=health, elapsed=elapsed, timeout=90.0
        )

    def test_the_OLD_gateway_still_answering_is_not_success(self):
        # This was the credential-change blocker: nothing about the platform set
        # changes, so the first poll ~1s in reported SUCCEEDED against the very
        # gateway that still held the old token.
        h = self.probe_result(gateway_present=True, baseline=(111, "t0"), current=(111, "t0"))
        assert self.judge(h)[0] == rj.RUNNING

    def test_a_replaced_gateway_is_success(self):
        h = self.probe_result(gateway_present=True, baseline=(111, "t0"), current=(222, "t1"))
        assert self.judge(h)[0] == rj.SUCCEEDED

    def test_the_same_pid_reused_with_a_new_start_time_still_counts_as_replaced(self):
        # The OS reuses pids; start_time is what stops a restart reading as
        # "nothing changed".
        h = self.probe_result(gateway_present=True, baseline=(111, "t0"), current=(111, "t1"))
        assert self.judge(h)[0] == rj.SUCCEEDED

    def test_a_disable_no_longer_depends_on_the_cumulative_platform_map(self):
        # gateway_state.json only ever merges — nothing removes a platform key —
        # so "known to the gateway" was monotonic and a DISABLE could never
        # satisfy the old check, failing at the 90s timeout every time. Identity
        # does not consult that map at all.
        h = self.probe_result(gateway_present=True, baseline=(111, "t0"), current=(222, "t1"))
        assert self.judge(h)[0] == rj.SUCCEEDED

    def test_a_gateway_that_is_briefly_gone_keeps_waiting(self):
        h = self.probe_result(gateway_present=False, baseline=(111, "t0"), current=None)
        assert self.judge(h)[0] == rj.RUNNING

    def test_an_unknown_baseline_never_claims_success(self):
        h = self.probe_result(gateway_present=True, baseline=None, current=(222, "t1"))
        assert self.judge(h)[0] == rj.RUNNING
        assert self.judge(h, elapsed=90.0)[0] == rj.FAILED  # and times out honestly

    def test_the_marker_survives_a_restart_that_never_replaced_the_gateway(self, h):
        home = h.home_for("vendas")
        rj.mark_restart_needed(home, reason=rj.REASON_CREDENTIALS, platform="slack")
        job = h.coord.request("vendas")
        # Identity never changes: same gateway throughout.
        h.health["vendas"] = rj.HealthReport(healthy=True, config_applied=False)
        h.now += 91
        assert h.coord.get(job.job_id).state == rj.FAILED
        assert rj.is_restart_needed(home) is True
