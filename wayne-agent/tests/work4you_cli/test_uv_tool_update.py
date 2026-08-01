"""Tests for uv-tool install detection (issue #29700).

``is_uv_tool_install`` / ``recommended_update_command_for_method`` are
display/detection helpers and stay live. The actual PyPI update path
(``_cmd_update_pip``) is DISABLED in the W4Y fork — the "wayne-agent"
package on PyPI is upstream's code, not this fork's — so it must never
spawn uv/pipx/pip (see TestCmdUpdatePipDisabled).
"""
from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch


# ---------------------------------------------------------------------------
# is_uv_tool_install
# ---------------------------------------------------------------------------


class TestIsUvToolInstall:
    def test_returns_true_when_sys_prefix_matches_uv_tool_layout(self):
        from work4you_cli import config

        with patch.object(config.sys, "prefix", "/home/user/.local/share/uv/tools/wayne-agent"):
            assert config.is_uv_tool_install() is True

    def test_returns_true_when_sys_executable_matches_uv_tool_layout(self):
        """Some uv-tool layouts surface the marker on ``sys.executable`` (bin/python)."""
        from work4you_cli import config

        with patch.object(config.sys, "prefix", "/some/unrelated/venv"), \
             patch.object(
                 config.sys,
                 "executable",
                 "/home/user/.local/share/uv/tools/wayne-agent/bin/python",
             ):
            assert config.is_uv_tool_install() is True

    def test_returns_false_when_neither_prefix_nor_executable_matches(self):
        from work4you_cli import config

        with patch.object(config.sys, "prefix", "/some/unrelated/venv"), \
             patch.object(config.sys, "executable", "/usr/bin/python3"):
            assert config.is_uv_tool_install() is False

    def test_does_not_consult_uv_tool_list(self):
        """Detection must NOT shell out: ``uv tool list`` would false-positive
        when the active install is pip/venv but the machine also has
        ``uv tool install wayne-agent`` somewhere on disk. Copilot review on
        PR #29703 flagged this; the fix is to never call ``uv tool list``
        from the detection path."""
        from work4you_cli import config

        with patch.object(config.sys, "prefix", "/some/unrelated/venv"), \
             patch.object(config.sys, "executable", "/usr/bin/python3"), \
             patch("subprocess.run") as mock_run:
            assert config.is_uv_tool_install() is False
            mock_run.assert_not_called()

    def test_case_insensitive_match(self):
        """Match must be case-insensitive — Windows paths preserve case
        (e.g. ``...AppData\\Local\\UV\\Tools\\wayne-agent``) and a case-sensitive
        check would miss them. We exercise the lower-cased compare path here
        without monkey-patching ``os.sep``, which would break the whole suite."""
        from work4you_cli import config

        with patch.object(
            config.sys, "prefix", "/HOME/USER/.local/share/UV/Tools/wayne-agent"
        ):
            assert config.is_uv_tool_install() is True

    def test_handles_empty_executable(self):
        from work4you_cli import config

        with patch.object(config.sys, "prefix", "/some/unrelated/venv"), \
             patch.object(config.sys, "executable", ""):
            assert config.is_uv_tool_install() is False


# ---------------------------------------------------------------------------
# recommended_update_command_for_method
# ---------------------------------------------------------------------------


class TestRecommendedUpdateCommandForUvTool:
    def test_pip_layouts_route_through_builtin_updater(self):
        """The fork is not on PyPI: recommending ``pip install --upgrade
        wayne-agent`` / ``uv tool upgrade wayne-agent`` would replace the
        engine with the upstream package, so every pip-ish layout routes
        through the built-in updater regardless of uv availability."""
        from work4you_cli import config

        for uv_on_path in ("/usr/local/bin/uv", None):
            for uv_tool in (True, False):
                with patch("shutil.which", return_value=uv_on_path), \
                     patch.object(config, "is_uv_tool_install", return_value=uv_tool):
                    cmd = config.recommended_update_command_for_method("pip")
                    assert cmd == "work4you update"

    def test_recommendation_does_not_spawn_subprocess(self):
        """Computing the recommendation string must be cheap — no ``uv tool list``
        spawn. Copilot review on PR #29703 flagged the prior subprocess hop
        as adding overhead and a multi-second timeout window for what is
        purely a display string."""
        from work4you_cli import config

        with patch.object(config.sys, "prefix", "/some/unrelated/venv"), \
             patch.object(config.sys, "executable", "/usr/bin/python3"), \
             patch("shutil.which", return_value="/usr/local/bin/uv"), \
             patch("subprocess.run") as mock_run:
            cmd = config.recommended_update_command_for_method("pip")
            mock_run.assert_not_called()
            assert cmd == "work4you update"


# ---------------------------------------------------------------------------
# _cmd_update_pip — disabled in the W4Y fork
# ---------------------------------------------------------------------------


class TestCmdUpdatePipDisabled:
    """The PyPI update path never spawns uv/pipx/pip in the fork."""

    @patch("subprocess.run")
    def test_prints_disabled_notice_and_spawns_nothing(self, mock_run, capsys):
        from work4you_cli.main import SELF_UPDATE_DISABLED_MESSAGE, _cmd_update_pip

        # Even in a uv-tool layout with uv on PATH, nothing runs.
        with patch("shutil.which", return_value="/usr/local/bin/uv"), \
             patch("work4you_cli.config.is_uv_tool_install", return_value=True):
            _cmd_update_pip(SimpleNamespace())  # returns; no SystemExit

        mock_run.assert_not_called()
        assert SELF_UPDATE_DISABLED_MESSAGE in capsys.readouterr().out
