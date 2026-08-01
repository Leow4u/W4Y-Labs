"""Tests for ``wayne debug`` CLI command and debug utilities.

W4Y fork: ``wayne debug share`` writes bundles to local files only — remote
upload (public paste services / Nous S3) is disabled and must never happen.
"""

import os
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

import pytest

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

@pytest.fixture
def wayne_home(tmp_path, monkeypatch):
    """Set up an isolated WAYNE_HOME with minimal logs."""
    home = tmp_path / ".wayne"
    home.mkdir()
    monkeypatch.setenv("WAYNE_HOME", str(home))

    # Create log files
    logs_dir = home / "logs"
    logs_dir.mkdir()
    (logs_dir / "agent.log").write_text(
        "2026-04-12 17:00:00 INFO agent: session started\n"
        "2026-04-12 17:00:01 INFO tools.terminal: running ls\n"
        "2026-04-12 17:00:02 WARNING agent: high token usage\n"
    )
    (logs_dir / "errors.log").write_text(
        "2026-04-12 17:00:05 ERROR gateway.run: connection lost\n"
    )
    (logs_dir / "gateway.log").write_text(
        "2026-04-12 17:00:10 INFO gateway.run: started\n"
    )
    (logs_dir / "gui.log").write_text(
        "2026-04-12 17:00:12 INFO work4you_cli.web_server: dashboard request\n"
    )
    (logs_dir / "desktop.log").write_text(
        "2026-04-12 17:00:15 INFO desktop: backend spawned\n"
    )

    return home


# ---------------------------------------------------------------------------
# Unit tests for the (neutered) upload helper
# ---------------------------------------------------------------------------

class TestUploadToPastebin:
    """W4Y fork: ``upload_to_pastebin`` writes locally instead of uploading."""

    def test_writes_content_to_local_file(self, wayne_home):
        from work4you_cli.debug import upload_to_pastebin

        result = upload_to_pastebin("hello world")

        path = Path(result)
        assert path.is_file()
        assert path.read_text(encoding="utf-8") == "hello world"
        # The file lands inside WAYNE_HOME, not on any remote service.
        assert path.is_relative_to(wayne_home / "debug-shares")

    def test_never_touches_the_network(self, wayne_home):
        from work4you_cli.debug import upload_to_pastebin

        with patch(
            "work4you_cli.debug.urllib.request.urlopen",
            side_effect=AssertionError("network egress attempted"),
        ) as urlopen:
            upload_to_pastebin("content", expiry_days=7)

        urlopen.assert_not_called()


# ---------------------------------------------------------------------------
# Log reading
# ---------------------------------------------------------------------------

class TestCaptureLogSnapshot:
    """Test _capture_log_snapshot for log reading and truncation."""

    def test_reads_small_file(self, wayne_home):
        from work4you_cli.debug import _capture_log_snapshot

        snap = _capture_log_snapshot("agent", tail_lines=10)
        assert snap.full_text is not None
        assert "session started" in snap.full_text
        assert "session started" in snap.tail_text

    def test_returns_none_for_missing(self, tmp_path, monkeypatch):
        home = tmp_path / ".wayne"
        home.mkdir()
        monkeypatch.setenv("WAYNE_HOME", str(home))

        from work4you_cli.debug import _capture_log_snapshot
        snap = _capture_log_snapshot("agent", tail_lines=10)
        assert snap.full_text is None
        assert snap.tail_text == "(file not found)"

    def test_empty_primary_reports_file_empty(self, wayne_home):
        """Empty primary (no .1 fallback) surfaces as '(file empty)', not missing."""
        (wayne_home / "logs" / "agent.log").write_text("")

        from work4you_cli.debug import _capture_log_snapshot
        snap = _capture_log_snapshot("agent", tail_lines=10)
        assert snap.full_text is None
        assert snap.tail_text == "(file empty)"

    def test_race_truncate_after_resolve_reports_empty(self, wayne_home, monkeypatch):
        """If the log is truncated between resolve and stat, say 'empty', not 'missing'."""
        log_path = wayne_home / "logs" / "agent.log"
        from work4you_cli import debug

        monkeypatch.setattr(debug, "_resolve_log_path", lambda _name: log_path)
        log_path.write_text("")

        snap = debug._capture_log_snapshot("agent", tail_lines=10)
        assert snap.path == log_path
        assert snap.full_text is None
        assert snap.tail_text == "(file empty)"

    def test_truncates_large_file(self, wayne_home):
        """Files larger than max_bytes get tail-truncated."""
        from work4you_cli.debug import _capture_log_snapshot

        # Write a file larger than 1KB
        big_content = "x" * 100 + "\n"
        (wayne_home / "logs" / "agent.log").write_text(big_content * 200)

        snap = _capture_log_snapshot("agent", tail_lines=10, max_bytes=1024)
        assert snap.full_text is not None
        assert "truncated" in snap.full_text

    def test_keeps_first_line_when_truncation_on_boundary(self, wayne_home):
        """When truncation lands on a line boundary, keep the first full line."""
        from work4you_cli.debug import _capture_log_snapshot

        # File must exceed the initial chunk_size (8192) used by the
        # backward-reading loop so the truncation path actually fires.
        line = "A" * 99 + "\n"  # 100 bytes per line
        num_lines = 200  # 20000 bytes
        (wayne_home / "logs" / "agent.log").write_text(line * num_lines)

        # max_bytes = 1000 = 100 * 10 → cut at byte 20000 - 1000 = 19000,
        # and byte 19000 - 1 is '\n'.  Boundary hit → keep all 10 lines.
        snap = _capture_log_snapshot("agent", tail_lines=5, max_bytes=1000)
        assert snap.full_text is not None
        assert "truncated" in snap.full_text
        raw = snap.full_text.split("\n", 1)[1]
        kept = [l for l in raw.strip().splitlines() if l.startswith("A")]
        assert len(kept) == 10

    def test_drops_partial_when_truncation_mid_line(self, wayne_home):
        """When truncation lands mid-line, drop the partial fragment."""
        from work4you_cli.debug import _capture_log_snapshot

        line = "A" * 99 + "\n"  # 100 bytes per line
        num_lines = 200  # 20000 bytes
        (wayne_home / "logs" / "agent.log").write_text(line * num_lines)

        # max_bytes = 950 doesn't divide evenly into 100 → mid-line cut.
        snap = _capture_log_snapshot("agent", tail_lines=5, max_bytes=950)
        assert snap.full_text is not None
        assert "truncated" in snap.full_text
        raw = snap.full_text.split("\n", 1)[1]
        kept = [l for l in raw.strip().splitlines() if l.startswith("A")]
        # 950 / 100 = 9.5 → 9 complete lines after dropping partial
        assert len(kept) == 9

    def test_unknown_log_returns_none(self, wayne_home):
        from work4you_cli.debug import _capture_log_snapshot
        snap = _capture_log_snapshot("nonexistent", tail_lines=10)
        assert snap.full_text is None

    def test_falls_back_to_rotated_file(self, wayne_home):
        """When gateway.log doesn't exist, falls back to gateway.log.1."""
        from work4you_cli.debug import _capture_log_snapshot

        logs_dir = wayne_home / "logs"
        # Remove the primary (if any) and create a .1 rotation
        (logs_dir / "gateway.log").unlink(missing_ok=True)
        (logs_dir / "gateway.log.1").write_text(
            "2026-04-12 10:00:00 INFO gateway.run: rotated content\n"
        )

        snap = _capture_log_snapshot("gateway", tail_lines=10)
        assert snap.full_text is not None
        assert "rotated content" in snap.full_text

    def test_prefers_primary_over_rotated(self, wayne_home):
        """Primary log is used when it exists, even if .1 also exists."""
        from work4you_cli.debug import _capture_log_snapshot

        logs_dir = wayne_home / "logs"
        (logs_dir / "gateway.log").write_text("primary content\n")
        (logs_dir / "gateway.log.1").write_text("rotated content\n")

        snap = _capture_log_snapshot("gateway", tail_lines=10)
        assert "primary content" in snap.full_text
        assert "rotated" not in snap.full_text

    def test_falls_back_when_primary_empty(self, wayne_home):
        """Empty primary log falls back to .1 rotation."""
        from work4you_cli.debug import _capture_log_snapshot

        logs_dir = wayne_home / "logs"
        (logs_dir / "agent.log").write_text("")
        (logs_dir / "agent.log.1").write_text("rotated agent data\n")

        snap = _capture_log_snapshot("agent", tail_lines=10)
        assert snap.full_text is not None
        assert "rotated agent data" in snap.full_text


# ---------------------------------------------------------------------------
# Capture log redaction (force=True applies regardless of WAYNE_REDACT_SECRETS)
# ---------------------------------------------------------------------------

# A vendor-prefixed token used across redaction tests. Long enough to clear
# the redactor's `floor` parameter so it actually masks rather than fully blanks.
_REDACT_FIXTURE_TOKEN = "sk-proj-A1B2C3D4E5F6G7H8I9J0aA"


class TestCaptureLogSnapshotRedaction:
    """Pin upload-time redaction at the _capture_log_snapshot boundary."""

    @pytest.fixture
    def wayne_home_with_secret(self, tmp_path, monkeypatch):
        """Isolated WAYNE_HOME whose agent.log contains a vendor-prefixed token."""
        home = tmp_path / ".wayne"
        home.mkdir()
        monkeypatch.setenv("WAYNE_HOME", str(home))
        # Baseline fixture: no explicit env-var opinion. With the post-#17691
        # default of ON, the default-path tests below exercise the
        # secure-default behaviour. The `force=True` regression test
        # setenvs to "false" inline to prove force=True works even when
        # the runtime flag is disabled.
        monkeypatch.delenv("WAYNE_REDACT_SECRETS", raising=False)

        logs_dir = home / "logs"
        logs_dir.mkdir()
        (logs_dir / "agent.log").write_text(
            f"2026-04-12 17:00:00 INFO config: api_key={_REDACT_FIXTURE_TOKEN} loaded\n"
        )
        (logs_dir / "errors.log").write_text("")
        (logs_dir / "gateway.log").write_text("")
        return home

    def test_default_redacts_tail_and_full_text(self, wayne_home_with_secret):
        from work4you_cli.debug import _capture_log_snapshot

        snap = _capture_log_snapshot("agent", tail_lines=10)

        # Both views the upload uses must be sanitized.
        assert _REDACT_FIXTURE_TOKEN not in snap.tail_text
        assert snap.full_text is not None
        assert _REDACT_FIXTURE_TOKEN not in snap.full_text

    def test_redact_false_passes_through(self, wayne_home_with_secret):
        from work4you_cli.debug import _capture_log_snapshot

        snap = _capture_log_snapshot("agent", tail_lines=10, redact=False)

        # Original token survives when the caller opts out.
        assert _REDACT_FIXTURE_TOKEN in snap.tail_text
        assert _REDACT_FIXTURE_TOKEN in (snap.full_text or "")

    def test_force_true_works_when_redaction_disabled(
        self, wayne_home_with_secret, monkeypatch
    ):
        """Regression test: redact_sensitive_text short-circuits without force=True.

        If a future refactor drops `force=True` from `_redact_log_text`, this
        test fails immediately. Without `force=True`, the redactor returns the
        input unchanged when WAYNE_REDACT_SECRETS=false, and the share-time
        redaction feature ships silently broken for users who opted out of
        runtime redaction (e.g. developers working on the redactor itself).
        """

        # Force the runtime flag off so we're exercising the force=True path,
        # not the default-on path.
        monkeypatch.setenv("WAYNE_REDACT_SECRETS", "false")

        from work4you_cli.debug import _capture_log_snapshot

        assert os.environ.get("WAYNE_REDACT_SECRETS", "") == "false"

        snap = _capture_log_snapshot("agent", tail_lines=10)

        assert _REDACT_FIXTURE_TOKEN not in snap.tail_text
        assert snap.full_text is not None
        assert _REDACT_FIXTURE_TOKEN not in snap.full_text

    def test_default_redacts_email_addresses_for_public_share(
        self, wayne_home_with_secret
    ):
        from work4you_cli.debug import _capture_log_snapshot

        log_path = wayne_home_with_secret / "logs" / "agent.log"
        log_path.write_text(
            "2026-04-12 17:00:00 INFO gateway.run: "
            "inbound message: platform=bluebubbles "
            "user=person@example.com chat=iMessage;-;person@example.com msg='hello'\n"
        )

        snap = _capture_log_snapshot("agent", tail_lines=10)

        assert "person@example.com" not in snap.tail_text
        assert "[REDACTED_EMAIL]" in snap.tail_text
        assert snap.full_text is not None
        assert "person@example.com" not in snap.full_text

    def test_no_redact_preserves_email_addresses(self, wayne_home_with_secret):
        from work4you_cli.debug import _capture_log_snapshot

        log_path = wayne_home_with_secret / "logs" / "agent.log"
        log_path.write_text(
            "2026-04-12 17:00:00 INFO gateway.run: "
            "inbound message: platform=bluebubbles "
            "user=person@example.com chat=iMessage;-;person@example.com msg='hello'\n"
        )

        snap = _capture_log_snapshot("agent", tail_lines=10, redact=False)

        assert "person@example.com" in snap.tail_text
        assert "person@example.com" in (snap.full_text or "")

    def test_capture_default_log_snapshots_threads_redact(
        self, wayne_home_with_secret
    ):
        from work4you_cli.debug import _capture_default_log_snapshots

        snaps = _capture_default_log_snapshots(50)

        # Default threads redact=True to all three captured logs.
        assert _REDACT_FIXTURE_TOKEN not in snaps["agent"].tail_text
        assert _REDACT_FIXTURE_TOKEN not in (snaps["agent"].full_text or "")

    def test_capture_default_log_snapshots_no_redact_passes_through(
        self, wayne_home_with_secret
    ):
        from work4you_cli.debug import _capture_default_log_snapshots

        snaps = _capture_default_log_snapshots(50, redact=False)

        assert _REDACT_FIXTURE_TOKEN in snaps["agent"].tail_text
        assert _REDACT_FIXTURE_TOKEN in (snaps["agent"].full_text or "")


# ---------------------------------------------------------------------------
# Debug report collection
# ---------------------------------------------------------------------------

class TestCollectDebugReport:
    """Test the debug report builder."""

    def test_report_includes_dump_output(self, wayne_home):
        from work4you_cli.debug import collect_debug_report

        with patch("work4you_cli.dump.run_dump") as mock_dump:
            mock_dump.side_effect = lambda args: print(
                "--- wayne dump ---\nversion: 0.8.0\n--- end dump ---"
            )
            report = collect_debug_report(log_lines=50)

        assert "--- wayne dump ---" in report
        assert "version: 0.8.0" in report

    def test_report_includes_agent_log(self, wayne_home):
        from work4you_cli.debug import collect_debug_report

        with patch("work4you_cli.dump.run_dump"):
            report = collect_debug_report(log_lines=50)

        assert "--- agent.log" in report
        assert "session started" in report

    def test_report_includes_errors_log(self, wayne_home):
        from work4you_cli.debug import collect_debug_report

        with patch("work4you_cli.dump.run_dump"):
            report = collect_debug_report(log_lines=50)

        assert "--- errors.log" in report
        assert "connection lost" in report

    def test_report_includes_gateway_log(self, wayne_home):
        from work4you_cli.debug import collect_debug_report

        with patch("work4you_cli.dump.run_dump"):
            report = collect_debug_report(log_lines=50)

        assert "--- gateway.log" in report

    def test_report_includes_gui_log(self, wayne_home):
        from work4you_cli.debug import collect_debug_report

        with patch("work4you_cli.dump.run_dump"):
            report = collect_debug_report(log_lines=50)

        assert "--- gui.log" in report
        assert "dashboard request" in report

    def test_report_includes_desktop_log(self, wayne_home):
        from work4you_cli.debug import collect_debug_report

        with patch("work4you_cli.dump.run_dump"):
            report = collect_debug_report(log_lines=50)

        assert "--- desktop.log" in report
        assert "backend spawned" in report

    def test_missing_logs_handled(self, tmp_path, monkeypatch):
        home = tmp_path / ".wayne"
        home.mkdir()
        monkeypatch.setenv("WAYNE_HOME", str(home))

        from work4you_cli.debug import collect_debug_report

        with patch("work4you_cli.dump.run_dump"):
            report = collect_debug_report(log_lines=50)

        assert "(file not found)" in report


# ---------------------------------------------------------------------------
# CLI entry point — run_debug_share
# ---------------------------------------------------------------------------

class TestRunDebugShare:
    """Test the run_debug_share CLI handler (W4Y fork: local writes only)."""

    def _args(self, **over):
        base = dict(lines=50, local=False, nous=False, no_redact=False)
        base.update(over)
        return SimpleNamespace(**base)

    def _share_files(self, home):
        """All files written under <home>/debug-shares, any depth."""
        root = home / "debug-shares"
        if not root.exists():
            return []
        return sorted(p for p in root.rglob("*") if p.is_file())

    def test_share_sweeps_expired_pastes(self, wayne_home, capsys):
        """The share path should sweep old pending deletes before writing."""
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"), \
             patch("work4you_cli.debug._sweep_expired_pastes", return_value=(0, 0)) as mock_sweep:
            run_debug_share(self._args())

        mock_sweep.assert_called_once()
        assert "Debug bundle written" in capsys.readouterr().out

    def test_share_survives_sweep_failure(self, wayne_home, capsys):
        """Expired-paste cleanup is best-effort and must not block sharing."""
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"), \
             patch(
                 "work4you_cli.debug._sweep_expired_pastes",
                 side_effect=RuntimeError("offline"),
             ):
            run_debug_share(self._args())

        assert "Debug bundle written" in capsys.readouterr().out

    def test_local_flag_prints_full_logs(self, wayne_home, capsys):
        """--local prints the report plus full log contents."""
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args(local=True))

        out = capsys.readouterr().out
        assert "--- agent.log" in out
        assert "FULL agent.log" in out
        assert "FULL gateway.log" in out

    def test_local_flag_writes_no_files(self, wayne_home):
        """--local renders to stdout and never writes bundle files."""
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args(local=True))

        assert self._share_files(wayne_home) == []

    def test_share_writes_five_files(self, wayne_home, capsys):
        """Successful share writes report + agent/gateway/gui/desktop logs."""
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump") as mock_dump:
            mock_dump.side_effect = lambda a: print("--- wayne dump ---\nversion: test\n--- end dump ---")
            run_debug_share(self._args())

        files = self._share_files(wayne_home)
        assert {f.name for f in files} == {
            "report.txt", "agent.log", "gateway.log", "gui.log", "desktop.log"
        }

        # Every written path is printed so the user can find the bundle.
        out = capsys.readouterr().out
        for f in files:
            assert str(f) in out

        # Each full-log file should start with the dump header + its section.
        by_name = {f.name: f.read_text(encoding="utf-8") for f in files}
        assert "--- wayne dump ---" in by_name["agent.log"]
        assert "--- full agent.log ---" in by_name["agent.log"]
        assert "--- full gateway.log ---" in by_name["gateway.log"]
        assert "--- full gui.log ---" in by_name["gui.log"]
        assert "--- full desktop.log ---" in by_name["desktop.log"]

    def test_share_never_touches_the_network(self, wayne_home):
        """The point of the fork change: zero egress on the default path."""
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"), \
             patch(
                 "work4you_cli.debug.urllib.request.urlopen",
                 side_effect=AssertionError("network egress attempted"),
             ) as urlopen:
            run_debug_share(self._args())

        urlopen.assert_not_called()

    def test_share_prints_upload_disabled_note(self, wayne_home, capsys):
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args())

        assert "remote upload is disabled in the W4Y fork" in capsys.readouterr().out

    def test_share_keeps_report_and_full_log_on_same_snapshot(self, wayne_home, capsys):
        """A mid-run rotation must not make full agent.log older than the report."""
        from work4you_cli.debug import run_debug_share, collect_debug_report as real_collect_debug_report

        logs_dir = wayne_home / "logs"
        (logs_dir / "agent.log").write_text(
            "2026-04-22 12:00:00 INFO agent: newest line\n"
        )
        (logs_dir / "agent.log.1").write_text(
            "2026-04-10 12:00:00 INFO agent: old rotated line\n"
        )

        def _wrapped_collect_debug_report(*, log_lines=200, dump_text="", log_snapshots=None):
            report = real_collect_debug_report(
                log_lines=log_lines,
                dump_text=dump_text,
                log_snapshots=log_snapshots,
            )
            # Simulate the live log rotating after the report is built but
            # before a naive implementation would re-read agent.log for the
            # standalone bundle file.
            (logs_dir / "agent.log").write_text("")
            (logs_dir / "agent.log.1").write_text(
                "2026-04-10 12:00:00 INFO agent: old rotated line\n"
            )
            return report

        with patch("work4you_cli.dump.run_dump"), \
             patch("work4you_cli.debug.collect_debug_report", side_effect=_wrapped_collect_debug_report):
            run_debug_share(self._args())

        by_name = {
            f.name: f.read_text(encoding="utf-8")
            for f in self._share_files(wayne_home)
        }
        assert "2026-04-22 12:00:00 INFO agent: newest line" in by_name["report.txt"]
        assert "2026-04-22 12:00:00 INFO agent: newest line" in by_name["agent.log"]
        assert "old rotated line" not in by_name["agent.log"]

    def test_share_skips_missing_logs(self, tmp_path, monkeypatch, capsys):
        """Only writes files for logs that exist."""
        home = tmp_path / ".wayne"
        home.mkdir()
        monkeypatch.setenv("WAYNE_HOME", str(home))

        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args())

        files = self._share_files(home)
        # Only the report should be written (no log files exist).
        assert [f.name for f in files] == ["report.txt"]
        assert "Report" in capsys.readouterr().out

    def test_share_exits_on_report_write_failure(self, wayne_home, capsys):
        """If the bundle folder can't be created, exit with code 1."""
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"), \
             patch("work4you_cli.debug._new_share_dir",
                    side_effect=OSError("disk full")):
            with pytest.raises(SystemExit) as exc_info:
                run_debug_share(self._args())

        assert exc_info.value.code == 1
        out = capsys.readouterr()
        assert "disk full" in out.err


# ---------------------------------------------------------------------------
# Share-time redaction wiring + visible banner
# ---------------------------------------------------------------------------

class TestRunDebugShareRedaction:
    """End-to-end: --no-redact flag, banner injection, default behavior."""

    @pytest.fixture
    def wayne_home_with_secret(self, tmp_path, monkeypatch):
        """Isolated WAYNE_HOME whose agent.log contains a vendor-prefixed token."""
        home = tmp_path / ".wayne"
        home.mkdir()
        monkeypatch.setenv("WAYNE_HOME", str(home))
        monkeypatch.delenv("WAYNE_REDACT_SECRETS", raising=False)

        logs_dir = home / "logs"
        logs_dir.mkdir()
        (logs_dir / "agent.log").write_text(
            f"2026-04-12 17:00:00 INFO config: api_key={_REDACT_FIXTURE_TOKEN} loaded\n"
        )
        (logs_dir / "errors.log").write_text("")
        (logs_dir / "gateway.log").write_text(
            f"2026-04-12 17:00:01 INFO gateway.run: token {_REDACT_FIXTURE_TOKEN}\n"
        )
        return home

    def _args(self, **over):
        base = dict(lines=50, local=False, nous=False, no_redact=False)
        base.update(over)
        return SimpleNamespace(**base)

    def _written_contents(self, home):
        root = home / "debug-shares"
        return [
            p.read_text(encoding="utf-8")
            for p in sorted(root.rglob("*"))
            if p.is_file()
        ]

    def test_default_share_redacts_written_content(
        self, wayne_home_with_secret, capsys
    ):
        """The written report and full-log files do not contain the raw token."""
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"), \
             patch("work4you_cli.debug._sweep_expired_pastes", return_value=(0, 0)):
            run_debug_share(self._args())

        contents = self._written_contents(wayne_home_with_secret)
        # At least the report plus one full log file were written.
        assert len(contents) >= 2
        for content in contents:
            assert _REDACT_FIXTURE_TOKEN not in content, (
                "raw token leaked into a bundle file"
            )

    def test_default_share_includes_redaction_banner(
        self, wayne_home_with_secret, capsys
    ):
        """Each bundle file carries the visible redaction banner."""
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"), \
             patch("work4you_cli.debug._sweep_expired_pastes", return_value=(0, 0)):
            run_debug_share(self._args())

        for content in self._written_contents(wayne_home_with_secret):
            assert "redacted at collection time" in content, (
                "redaction banner missing from bundle file"
            )

    def test_no_redact_flag_disables_redaction_and_banner(
        self, wayne_home_with_secret, capsys
    ):
        """--no-redact preserves original log content and omits the banner."""
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"), \
             patch("work4you_cli.debug._sweep_expired_pastes", return_value=(0, 0)):
            run_debug_share(self._args(no_redact=True))

        contents = self._written_contents(wayne_home_with_secret)
        # The agent.log file should now contain the raw token.
        assert any(_REDACT_FIXTURE_TOKEN in c for c in contents), (
            "expected raw token in --no-redact bundle"
        )
        # No banner anywhere when redaction is disabled.
        for content in contents:
            assert "redacted at collection time" not in content, (
                "banner present with --no-redact"
            )


# ---------------------------------------------------------------------------
# run_debug router
# ---------------------------------------------------------------------------

class TestRunDebug:
    def test_no_subcommand_shows_usage(self, capsys):
        from work4you_cli.debug import run_debug

        args = MagicMock()
        args.debug_command = None

        run_debug(args)

        out = capsys.readouterr().out
        assert "work4you debug" in out
        assert "share" in out
        assert "delete" in out

    def test_share_subcommand_routes(self, wayne_home):
        from work4you_cli.debug import run_debug

        args = MagicMock()
        args.debug_command = "share"
        args.lines = 200
        args.local = True
        args.nous = False

        with patch("work4you_cli.dump.run_dump"):
            run_debug(args)


# ---------------------------------------------------------------------------
# Argparse integration
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Delete / auto-delete
# ---------------------------------------------------------------------------

class TestExtractPasteId:
    def test_paste_rs_url(self):
        from work4you_cli.debug import _extract_paste_id
        assert _extract_paste_id("https://paste.rs/abc123") == "abc123"

    def test_paste_rs_trailing_slash(self):
        from work4you_cli.debug import _extract_paste_id
        assert _extract_paste_id("https://paste.rs/abc123/") == "abc123"

    def test_http_variant(self):
        from work4you_cli.debug import _extract_paste_id
        assert _extract_paste_id("http://paste.rs/xyz") == "xyz"

    def test_non_paste_rs_returns_none(self):
        from work4you_cli.debug import _extract_paste_id
        assert _extract_paste_id("https://dpaste.com/ABCDEF") is None

    def test_empty_returns_none(self):
        from work4you_cli.debug import _extract_paste_id
        assert _extract_paste_id("") is None


class TestDeletePaste:
    def test_delete_sends_delete_request(self):
        from work4you_cli.debug import delete_paste

        mock_resp = MagicMock()
        mock_resp.status = 200
        mock_resp.__enter__ = lambda s: s
        mock_resp.__exit__ = MagicMock(return_value=False)

        with patch("work4you_cli.debug.urllib.request.urlopen",
                    return_value=mock_resp) as mock_open:
            result = delete_paste("https://paste.rs/abc123")

        assert result is True
        req = mock_open.call_args[0][0]
        assert req.method == "DELETE"
        assert "paste.rs/abc123" in req.full_url

    def test_delete_rejects_non_paste_rs(self):
        from work4you_cli.debug import delete_paste

        with pytest.raises(ValueError, match="only paste.rs"):
            delete_paste("https://dpaste.com/something")


class TestScheduleAutoDelete:
    """``_schedule_auto_delete`` used to spawn a detached Python subprocess
    per call (one per paste URL batch).  Those subprocesses slept 6 hours
    and accumulated forever under repeated use — 15+ orphaned interpreters
    were observed in production.

    The new implementation is stateless: it records pending deletions to
    ``~/.wayne/pastes/pending.json`` and lets ``_sweep_expired_pastes``
    handle the DELETE requests synchronously on the next ``wayne debug``
    invocation.
    """

    def test_does_not_spawn_subprocess(self, wayne_home):
        """Regression guard: _schedule_auto_delete must NEVER spawn subprocesses.

        We assert this structurally rather than by mocking Popen: the new
        implementation doesn't even import ``subprocess`` at module scope,
        so a mock patch wouldn't find it.
        """
        import ast
        import inspect
        from work4you_cli.debug import _schedule_auto_delete

        # Strip the docstring before scanning so the regression-rationale
        # prose inside it doesn't trigger our banned-word checks.
        source = inspect.getsource(_schedule_auto_delete)
        tree = ast.parse(source)
        func_node = tree.body[0]
        if (
            func_node.body
            and isinstance(func_node.body[0], ast.Expr)
            and isinstance(func_node.body[0].value, ast.Constant)
            and isinstance(func_node.body[0].value.value, str)
        ):
            func_node.body = func_node.body[1:]
        code_only = ast.unparse(func_node)

        assert "Popen" not in code_only, (
            "_schedule_auto_delete must not spawn subprocesses — "
            "use pending.json + _sweep_expired_pastes instead"
        )
        assert "subprocess" not in code_only, (
            "_schedule_auto_delete must not reference subprocess at all"
        )
        assert "time.sleep" not in code_only, (
            "Regression: sleeping in _schedule_auto_delete is the bug being fixed"
        )

        # And verify that calling it doesn't produce any orphaned children
        # (it should just write pending.json synchronously).
        import os as _os
        before = set(_os.listdir("/proc")) if _os.path.exists("/proc") else None
        _schedule_auto_delete(
            ["https://paste.rs/abc", "https://paste.rs/def"],
            delay_seconds=10,
        )
        if before is not None:
            after = set(_os.listdir("/proc"))
            new = after - before
            # Filter to only integer-named entries (process PIDs)
            new_pids = [p for p in new if p.isdigit()]
            # It's fine if unrelated processes appeared — we just need to make
            # sure we didn't spawn a long-sleeping one.  The old bug spawned
            # a python interpreter whose cmdline contained "time.sleep".
            for pid in new_pids:
                try:
                    with open(f"/proc/{pid}/cmdline", "rb") as f:
                        cmdline = f.read().decode("utf-8", errors="replace")
                    assert "time.sleep" not in cmdline, (
                        f"Leaked sleeper subprocess PID {pid}: {cmdline}"
                    )
                except OSError:
                    pass  # process exited already

    def test_records_pending_to_json(self, wayne_home):
        """Scheduled URLs are persisted to pending.json with expiration."""
        from work4you_cli.debug import _schedule_auto_delete, _pending_file
        import json

        _schedule_auto_delete(
            ["https://paste.rs/abc", "https://paste.rs/def"],
            delay_seconds=10,
        )

        pending_path = _pending_file()
        assert pending_path.exists()

        entries = json.loads(pending_path.read_text())
        assert len(entries) == 2
        urls = {e["url"] for e in entries}
        assert urls == {"https://paste.rs/abc", "https://paste.rs/def"}

        # expire_at is ~now + delay_seconds
        import time
        for e in entries:
            assert e["expire_at"] > time.time()
            assert e["expire_at"] <= time.time() + 15

    def test_skips_non_paste_rs_urls(self, wayne_home):
        """dpaste.com URLs auto-expire — don't track them."""
        from work4you_cli.debug import _schedule_auto_delete, _pending_file

        _schedule_auto_delete(["https://dpaste.com/something"])

        # pending.json should not be created for non-paste.rs URLs
        assert not _pending_file().exists()

    def test_merges_with_existing_pending(self, wayne_home):
        """Subsequent calls merge into existing pending.json."""
        from work4you_cli.debug import _schedule_auto_delete, _load_pending

        _schedule_auto_delete(["https://paste.rs/first"], delay_seconds=10)
        _schedule_auto_delete(["https://paste.rs/second"], delay_seconds=10)

        entries = _load_pending()
        urls = {e["url"] for e in entries}
        assert urls == {"https://paste.rs/first", "https://paste.rs/second"}

    def test_dedupes_same_url(self, wayne_home):
        """Same URL recorded twice → one entry with the later expire_at."""
        from work4you_cli.debug import _schedule_auto_delete, _load_pending

        _schedule_auto_delete(["https://paste.rs/dup"], delay_seconds=10)
        _schedule_auto_delete(["https://paste.rs/dup"], delay_seconds=100)

        entries = _load_pending()
        assert len(entries) == 1
        assert entries[0]["url"] == "https://paste.rs/dup"


class TestSweepExpiredPastes:
    """Test the opportunistic sweep that replaces the sleeping subprocess."""

    def test_sweep_empty_is_noop(self, wayne_home):
        from work4you_cli.debug import _sweep_expired_pastes

        deleted, remaining = _sweep_expired_pastes()
        assert deleted == 0
        assert remaining == 0

    def test_sweep_deletes_expired_entries(self, wayne_home):
        from work4you_cli.debug import (
            _sweep_expired_pastes,
            _save_pending,
            _load_pending,
        )
        import time

        # Seed pending.json with one expired + one future entry
        _save_pending([
            {"url": "https://paste.rs/expired", "expire_at": time.time() - 100},
            {"url": "https://paste.rs/future", "expire_at": time.time() + 3600},
        ])

        delete_calls = []

        def fake_delete(url):
            delete_calls.append(url)
            return True

        with patch("work4you_cli.debug.delete_paste", side_effect=fake_delete):
            deleted, remaining = _sweep_expired_pastes()

        assert delete_calls == ["https://paste.rs/expired"]
        assert deleted == 1
        assert remaining == 1

        entries = _load_pending()
        urls = {e["url"] for e in entries}
        assert urls == {"https://paste.rs/future"}

    def test_sweep_leaves_future_entries_alone(self, wayne_home):
        from work4you_cli.debug import _sweep_expired_pastes, _save_pending
        import time

        _save_pending([
            {"url": "https://paste.rs/future1", "expire_at": time.time() + 3600},
            {"url": "https://paste.rs/future2", "expire_at": time.time() + 7200},
        ])

        with patch("work4you_cli.debug.delete_paste") as mock_delete:
            deleted, remaining = _sweep_expired_pastes()

        mock_delete.assert_not_called()
        assert deleted == 0
        assert remaining == 2

    def test_sweep_survives_network_failure(self, wayne_home):
        """Failed DELETEs stay in pending.json until the 24h grace window."""
        from work4you_cli.debug import (
            _sweep_expired_pastes,
            _save_pending,
            _load_pending,
        )
        import time

        _save_pending([
            {"url": "https://paste.rs/flaky", "expire_at": time.time() - 100},
        ])

        with patch(
            "work4you_cli.debug.delete_paste",
            side_effect=Exception("network down"),
        ):
            deleted, remaining = _sweep_expired_pastes()

        # Failure within 24h grace → kept for retry
        assert deleted == 0
        assert remaining == 1
        assert len(_load_pending()) == 1

    def test_sweep_drops_entries_past_grace_window(self, wayne_home):
        """After 24h past expiration, give up even on network failures."""
        from work4you_cli.debug import (
            _sweep_expired_pastes,
            _save_pending,
            _load_pending,
        )
        import time

        # Expired 25 hours ago → past the 24h grace window
        very_old = time.time() - (25 * 3600)
        _save_pending([
            {"url": "https://paste.rs/ancient", "expire_at": very_old},
        ])

        with patch(
            "work4you_cli.debug.delete_paste",
            side_effect=Exception("network down"),
        ):
            deleted, remaining = _sweep_expired_pastes()

        assert deleted == 1
        assert remaining == 0
        assert _load_pending() == []


class TestRunDebugSweepsOnInvocation:
    """``run_debug`` must sweep expired pastes on every invocation."""

    def test_run_debug_calls_sweep(self, wayne_home):
        from work4you_cli.debug import run_debug

        args = MagicMock()
        args.debug_command = None  # default → prints help

        with patch("work4you_cli.debug._sweep_expired_pastes") as mock_sweep:
            run_debug(args)

        mock_sweep.assert_called_once()

    def test_run_debug_survives_sweep_failure(self, wayne_home, capsys):
        """If the sweep throws, the subcommand still runs."""
        from work4you_cli.debug import run_debug

        args = MagicMock()
        args.debug_command = None

        with patch(
            "work4you_cli.debug._sweep_expired_pastes",
            side_effect=RuntimeError("boom"),
        ):
            run_debug(args)  # must not raise

        # Default subcommand still printed help
        out = capsys.readouterr().out
        assert "Usage: work4you debug" in out


class TestRunDebugDelete:
    def test_deletes_valid_url(self, capsys):
        from work4you_cli.debug import run_debug_delete

        args = MagicMock()
        args.urls = ["https://paste.rs/abc"]

        with patch("work4you_cli.debug.delete_paste", return_value=True):
            run_debug_delete(args)

        out = capsys.readouterr().out
        assert "Deleted" in out
        assert "paste.rs/abc" in out

    def test_handles_delete_failure(self, capsys):
        from work4you_cli.debug import run_debug_delete

        args = MagicMock()
        args.urls = ["https://paste.rs/abc"]

        with patch("work4you_cli.debug.delete_paste",
                    side_effect=Exception("network error")):
            run_debug_delete(args)

        out = capsys.readouterr().out
        assert "Could not delete" in out

    def test_no_urls_shows_usage(self, capsys):
        from work4you_cli.debug import run_debug_delete

        args = MagicMock()
        args.urls = []

        run_debug_delete(args)

        out = capsys.readouterr().out
        assert "Usage" in out


class TestShareLocalOnly:
    """W4Y fork: the default share path writes locally — no pastes, no TTL."""

    def _args(self, **over):
        base = dict(lines=50, local=False, nous=False, no_redact=False)
        base.update(over)
        return SimpleNamespace(**base)

    def test_share_does_not_schedule_auto_delete(self, wayne_home, capsys):
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"), \
             patch("work4you_cli.debug._schedule_auto_delete") as mock_sched:
            run_debug_share(self._args())

        # Nothing was uploaded, so there is nothing to auto-delete.
        mock_sched.assert_not_called()
        assert "auto-delete" not in capsys.readouterr().out

    def test_share_has_no_public_paste_notice(self, wayne_home, capsys):
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args())

        out = capsys.readouterr().out
        assert "PUBLIC paste service" not in out
        assert "remote upload is disabled in the W4Y fork" in out

    def test_local_no_upload_note(self, wayne_home, capsys):
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args(local=True))

        out = capsys.readouterr().out
        assert "PUBLIC paste service" not in out


# ---------------------------------------------------------------------------
# build_debug_share — structured core used by the dashboard endpoint
# ---------------------------------------------------------------------------


class TestBuildDebugShare:
    """The shared core that writes the bundle and returns structured paths.

    Backs both ``wayne debug share`` (CLI) and ``POST /api/ops/debug-share``
    (dashboard). W4Y fork: ``urls`` carries local file paths, not paste URLs —
    the contract here is the return value, not stdout.
    """

    def test_returns_structured_local_paths(self, wayne_home):
        from work4you_cli.debug import build_debug_share, DebugShareResult

        with patch("work4you_cli.dump.run_dump"):
            result = build_debug_share(log_lines=50, redact=True)

        assert isinstance(result, DebugShareResult)
        # All four seeded logs + the summary report, written as local files.
        assert set(result.urls) == {
            "Report", "agent.log", "gateway.log", "gui.log", "desktop.log"
        }
        for path in result.urls.values():
            p = Path(path)
            assert p.is_file()
            assert p.is_relative_to(wayne_home / "debug-shares")
        assert result.failures == []
        assert result.redacted is True
        # Local files are never auto-deleted.
        assert result.auto_delete_seconds == 0

    def test_never_touches_the_network(self, wayne_home):
        from work4you_cli.debug import build_debug_share

        with patch("work4you_cli.dump.run_dump"), patch(
            "work4you_cli.debug.urllib.request.urlopen",
            side_effect=AssertionError("network egress attempted"),
        ) as urlopen:
            build_debug_share(log_lines=50, redact=True)

        urlopen.assert_not_called()

    def test_skips_missing_logs_without_failure(self, wayne_home):
        from work4you_cli.debug import build_debug_share

        # Remove desktop.log so it should be neither written nor reported failed.
        (wayne_home / "logs" / "desktop.log").unlink()

        with patch("work4you_cli.dump.run_dump"):
            result = build_debug_share(log_lines=50, redact=True)

        assert "desktop.log" not in result.urls
        assert result.failures == []

    def test_redaction_keeps_secrets_out_of_files(self, wayne_home):
        from work4you_cli.debug import build_debug_share

        secret = "sk-proj-SUPERSECRETtoken1234567890"
        (wayne_home / "logs" / "agent.log").write_text(
            f"line one\nauthorization token={secret}\nline three\n"
        )

        with patch("work4you_cli.dump.run_dump"):
            result = build_debug_share(log_lines=50, redact=True)

        assert result.redacted is True
        joined = "\n".join(
            Path(p).read_text(encoding="utf-8") for p in result.urls.values()
        )
        assert secret not in joined, "secret leaked into a bundle file"

    def test_required_report_write_failure_raises(self, wayne_home):
        from work4you_cli.debug import build_debug_share

        with patch("work4you_cli.dump.run_dump"), patch(
            "work4you_cli.debug._new_share_dir",
            side_effect=OSError("disk full"),
        ):
            with pytest.raises(RuntimeError, match="disk full"):
                build_debug_share(log_lines=50, redact=True)


# ---------------------------------------------------------------------------
# Shared bundle collection + Nous-S3 path
# ---------------------------------------------------------------------------

class TestCollectShareBundle:
    def test_returns_report_and_logs(self, wayne_home):
        from work4you_cli.debug import collect_share_bundle

        with patch("work4you_cli.dump.run_dump"):
            bundle = collect_share_bundle(log_lines=50, redact=True)

        assert "report" in bundle
        assert "agent.log" in bundle
        assert "gateway.log" in bundle
        assert "desktop.log" in bundle
        # Banner is prepended under redact=True.
        assert "redacted at collection time" in bundle["report"]
        assert "session started" in bundle["agent.log"]

    def test_no_redact_omits_banner(self, wayne_home):
        from work4you_cli.debug import collect_share_bundle

        with patch("work4you_cli.dump.run_dump"):
            bundle = collect_share_bundle(log_lines=50, redact=False)

        assert "redacted at collection time" not in bundle["report"]

    def test_redaction_keeps_secrets_out(self, wayne_home):
        from work4you_cli.debug import collect_share_bundle

        secret = "sk-proj-abcdefghijklmnopqrstuvwxyz1234567890"
        (wayne_home / "logs" / "agent.log").write_text(
            f"line one\nOPENAI_API_KEY={secret}\nline three\n"
        )
        with patch("work4you_cli.dump.run_dump"):
            redacted = collect_share_bundle(log_lines=50, redact=True)
            unredacted = collect_share_bundle(log_lines=50, redact=False)

        # Sanity: without redaction the secret is present in the bundle.
        assert secret in "\n".join(unredacted.values())
        # With redaction it must be scrubbed everywhere.
        assert secret not in "\n".join(redacted.values())


    def test_build_debug_share_uses_collector(self, wayne_home):
        # build_debug_share must produce the same report text the collector
        # does (i.e. the local-write refactor preserved the report contract).
        from work4you_cli.debug import build_debug_share, collect_share_bundle

        with patch("work4you_cli.dump.run_dump"):
            expected = collect_share_bundle(log_lines=50, redact=True)["report"]

        with patch("work4you_cli.dump.run_dump"):
            result = build_debug_share(log_lines=50, redact=True)

        # The report file written should match the collector's report.
        written = Path(result.urls["Report"]).read_text(encoding="utf-8")
        assert written == expected
        assert result.report == expected


class TestBuildNousBundle:
    def test_envelope_shape_and_gzip(self, wayne_home):
        import gzip
        import json as _json

        from work4you_cli.debug import build_nous_bundle

        files = {"report": "hello", "agent.log": "log line"}
        blob = build_nous_bundle(files, redact=True)

        # It's gzip — magic bytes.
        assert blob[:2] == b"\x1f\x8b"
        envelope = _json.loads(gzip.decompress(blob).decode())
        assert envelope["format"] == "wayne-debug-share/1"
        assert envelope["redacted"] is True
        assert envelope["files"] == files
        assert "created" in envelope

    def test_redacted_false_recorded(self):
        import gzip
        import json as _json

        from work4you_cli.debug import build_nous_bundle

        blob = build_nous_bundle({"report": "x"}, redact=False)
        envelope = _json.loads(gzip.decompress(blob).decode())
        assert envelope["redacted"] is False


class TestRunDebugShareNous:
    """W4Y fork: ``--nous`` writes the gzip envelope locally — no upload."""

    def _args(self, **over):
        base = dict(lines=50, local=False, nous=True, no_redact=False)
        base.update(over)
        return SimpleNamespace(**base)

    def test_nous_writes_local_gzip_envelope(self, wayne_home, capsys):
        import gzip
        import json as _json

        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args())

        out = capsys.readouterr().out
        assert "disabled in the W4Y fork" in out

        files = list((wayne_home / "debug-shares").rglob("*.json.gz"))
        assert len(files) == 1
        # The written path is printed so the user can find the bundle.
        assert str(files[0]) in out

        blob = files[0].read_bytes()
        assert blob[:2] == b"\x1f\x8b"
        envelope = _json.loads(gzip.decompress(blob).decode())
        assert envelope["format"] == "wayne-debug-share/1"
        assert envelope["redacted"] is True
        assert "report" in envelope["files"]

    def test_nous_never_calls_the_upload_client_or_network(self, wayne_home):
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"), \
             patch(
                 "work4you_cli.diagnostics_upload.share_to_nous",
                 side_effect=AssertionError("remote upload attempted"),
             ) as nous, \
             patch(
                 "work4you_cli.debug.urllib.request.urlopen",
                 side_effect=AssertionError("network egress attempted"),
             ) as urlopen:
            run_debug_share(self._args())

        nous.assert_not_called()
        urlopen.assert_not_called()

    def test_nous_write_failure_suggests_local(self, wayne_home, capsys):
        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"), patch(
            "work4you_cli.debug._new_share_dir",
            side_effect=OSError("disk full"),
        ):
            with pytest.raises(SystemExit) as exc:
                run_debug_share(self._args())
        assert exc.value.code == 1
        err = capsys.readouterr().err
        assert "Failed to write debug bundle" in err
        assert "--local" in err

    def test_nous_no_redact_recorded_in_envelope(self, wayne_home, capsys):
        import gzip
        import json as _json

        from work4you_cli.debug import run_debug_share

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args(no_redact=True))

        files = list((wayne_home / "debug-shares").rglob("*.json.gz"))
        envelope = _json.loads(gzip.decompress(files[0].read_bytes()).decode())
        assert envelope["redacted"] is False
        assert "NOT be redacted" in capsys.readouterr().out


class TestDebugSlashCommand:
    """`/debug [nous|local]` parsing in the CLI/TUI handler.

    The classic CLI and the TUI slash worker both dispatch through
    ``WayneCLI.process_command`` → ``_handle_debug_command(cmd_original)``,
    which parses an optional destination word and builds the args namespace
    handed to ``run_debug_share``.
    """

    def _handler(self):
        from work4you_cli.cli_commands_mixin import CLICommandsMixin

        class _Stub(CLICommandsMixin):
            pass

        return _Stub()._handle_debug_command

    def _captured(self, cmd_original):
        captured = {}

        def _fake_run(args):
            captured.update(vars(args))

        with patch("work4you_cli.debug.run_debug_share", _fake_run):
            self._handler()(cmd_original)
        return captured

    def test_bare_debug_defaults_to_local_files(self):
        c = self._captured("/debug")
        assert c["nous"] is False and c["local"] is False
        assert c["lines"] == 200 and c["expire"] == 7
        # ``yes`` is a legacy compat attribute the mixin still passes;
        # run_debug_share ignores it (nothing is uploaded in the W4Y fork).
        assert c["yes"] is True

    def test_nous_word_sets_nous(self):
        c = self._captured("/debug nous")
        assert c["nous"] is True and c["local"] is False

    def test_local_word_sets_local(self):
        c = self._captured("/debug local")
        assert c["local"] is True and c["nous"] is False

    def test_word_parsing_is_case_insensitive(self):
        c = self._captured("/debug NOUS")
        assert c["nous"] is True

    def test_local_wins_over_nous(self):
        # local never touches the network, so it takes precedence.
        c = self._captured("/debug nous local")
        assert c["local"] is True and c["nous"] is False

    def test_unknown_word_falls_back_to_default(self):
        c = self._captured("/debug paste")
        assert c["nous"] is False and c["local"] is False

    def test_no_arg_default_keyword(self):
        # Calling with no cmd_original (legacy callers) must still work.
        c = self._captured("")
        assert c["nous"] is False and c["local"] is False


class TestShareNeverPromptsOrUploads:
    """W4Y fork: nothing is uploaded, so no consent prompt exists.

    Upstream gated the upload behind a [y/N] prompt (or --yes). With remote
    upload disabled the bundle only ever lands on local disk, so the share
    path must work unprompted — including in non-interactive contexts.
    """

    def _args(self, **over):
        base = dict(lines=50, local=False, nous=False, no_redact=False)
        base.update(over)
        return SimpleNamespace(**base)

    def test_default_share_never_prompts(self, wayne_home, capsys, monkeypatch):
        from work4you_cli.debug import run_debug_share

        def _boom(_):
            raise AssertionError("input() must not be called — nothing is uploaded")

        monkeypatch.setattr("builtins.input", _boom)

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args())

        assert "Debug bundle written" in capsys.readouterr().out

    def test_non_interactive_share_works_without_yes(
        self, wayne_home, capsys, monkeypatch
    ):
        """No TTY and no --yes → still writes the local bundle (no egress)."""
        from work4you_cli.debug import run_debug_share

        monkeypatch.setattr("sys.stdin.isatty", lambda: False)

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args())

        assert "Debug bundle written" in capsys.readouterr().out

    def test_nous_path_never_prompts(self, wayne_home, capsys, monkeypatch):
        from work4you_cli.debug import run_debug_share

        def _boom(_):
            raise AssertionError("input() must not be called — nothing is uploaded")

        monkeypatch.setattr("builtins.input", _boom)

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args(nous=True))

        assert "Debug bundle written" in capsys.readouterr().out

    def test_local_never_prompts(self, wayne_home, capsys, monkeypatch):
        """--local renders to stdout and must not prompt."""
        from work4you_cli.debug import run_debug_share

        def _boom(_):
            raise AssertionError("input() must not be called for --local")

        monkeypatch.setattr("builtins.input", _boom)

        with patch("work4you_cli.dump.run_dump"):
            run_debug_share(self._args(local=True))

        assert "Aborted" not in capsys.readouterr().out

