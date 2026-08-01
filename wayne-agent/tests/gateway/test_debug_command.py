"""Tests for the gateway /debug command."""

from unittest.mock import patch

import pytest

from gateway.config import GatewayConfig, Platform
from gateway.platforms.base import MessageEvent
from gateway.session import SessionSource


def _make_event(text="/debug", platform=Platform.TELEGRAM,
                user_id="12345", chat_id="67890"):
    source = SessionSource(
        platform=platform,
        user_id=user_id,
        chat_id=chat_id,
        user_name="testuser",
    )
    return MessageEvent(text=text, source=source)


def _make_runner():
    from gateway.run import GatewayRunner

    runner = object.__new__(GatewayRunner)
    runner.config = GatewayConfig()
    runner.adapters = {}
    return runner


# W4Y fork: ``upload_to_pastebin`` writes the report to a local file and
# returns its path — the handler surfaces that path instead of a paste URL.
_LOCAL_REPORT_PATH = "/home/user/.wayne/debug-shares/20260703-120000/report.txt"


class TestHandleDebugCommand:
    @pytest.mark.asyncio
    async def test_debug_sweeps_expired_pastes_before_writing(self):
        runner = _make_runner()
        event = _make_event()

        with patch("work4you_cli.debug._sweep_expired_pastes", return_value=(0, 0)) as mock_sweep, \
             patch("work4you_cli.debug._capture_dump", return_value="dump"), \
             patch("work4you_cli.debug.collect_debug_report", return_value="report"), \
             patch("work4you_cli.debug.upload_to_pastebin", return_value=_LOCAL_REPORT_PATH), \
             patch("work4you_cli.debug._schedule_auto_delete"):
            result = await runner._handle_debug_command(event)

        mock_sweep.assert_called_once()
        assert _LOCAL_REPORT_PATH in result

    @pytest.mark.asyncio
    async def test_debug_survives_sweep_failure(self):
        runner = _make_runner()
        event = _make_event()

        with patch("work4you_cli.debug._sweep_expired_pastes", side_effect=RuntimeError("offline")), \
             patch("work4you_cli.debug._capture_dump", return_value="dump"), \
             patch("work4you_cli.debug.collect_debug_report", return_value="report"), \
             patch("work4you_cli.debug.upload_to_pastebin", return_value=_LOCAL_REPORT_PATH), \
             patch("work4you_cli.debug._schedule_auto_delete"):
            result = await runner._handle_debug_command(event)

        assert _LOCAL_REPORT_PATH in result

    @pytest.mark.asyncio
    async def test_debug_writes_report_locally_without_network(self, tmp_path, monkeypatch):
        """End-to-end through the real upload_to_pastebin: local file, no egress."""
        monkeypatch.setenv("WAYNE_HOME", str(tmp_path / ".wayne"))
        runner = _make_runner()
        event = _make_event()

        with patch("work4you_cli.debug._sweep_expired_pastes", return_value=(0, 0)), \
             patch("work4you_cli.debug._capture_dump", return_value="dump"), \
             patch("work4you_cli.debug.collect_debug_report", return_value="report body"), \
             patch(
                 "work4you_cli.debug.urllib.request.urlopen",
                 side_effect=AssertionError("network egress attempted"),
             ) as urlopen:
            result = await runner._handle_debug_command(event)

        urlopen.assert_not_called()
        files = list((tmp_path / ".wayne" / "debug-shares").rglob("report.txt"))
        assert len(files) == 1
        assert files[0].read_text(encoding="utf-8") == "report body"
        assert str(files[0]) in result
