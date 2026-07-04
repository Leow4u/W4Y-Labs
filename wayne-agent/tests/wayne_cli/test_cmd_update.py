"""Tests for `wayne update` — DISABLED in the W4Y fork.

Upstream Hermes' update command pulled and applied code from
github.com/NousResearch/hermes-agent (git pull / GitHub ZIP / PyPI). In this
fork every entry point must print the disabled notice and return (exit 0)
without spawning a single subprocess. Updates ship via the W4Y platform
deploy flow.
"""

from types import SimpleNamespace
from unittest.mock import patch

from wayne_cli.main import (
    SELF_UPDATE_DISABLED_MESSAGE,
    _cmd_update_check,
    _cmd_update_pip,
    _update_via_zip,
    cmd_update,
)


class TestSelfUpdateDisabled:
    """Every self-update entry point prints the notice and does nothing."""

    def test_cmd_update_prints_disabled_notice_and_exits_zero(self, capsys):
        with patch("subprocess.run") as mock_run:
            cmd_update(SimpleNamespace())  # returning (no SystemExit) == exit 0

        mock_run.assert_not_called()
        out = capsys.readouterr().out
        assert SELF_UPDATE_DISABLED_MESSAGE in out

    def test_cmd_update_check_flag_is_also_disabled(self, capsys):
        args = SimpleNamespace(check=True, branch=None)
        with patch("subprocess.run") as mock_run:
            cmd_update(args)

        mock_run.assert_not_called()
        assert SELF_UPDATE_DISABLED_MESSAGE in capsys.readouterr().out

    def test_cmd_update_ignores_branch_gateway_yes_force_flags(self, capsys):
        """Legacy flags stay parseable but are ignored — no git, no prompts."""
        args = SimpleNamespace(
            check=False,
            branch="bb/gui",
            gateway=True,
            yes=True,
            force=True,
            force_venv=True,
            backup=False,
            no_backup=True,
        )
        with patch("subprocess.run") as mock_run, \
             patch("builtins.input") as mock_input:
            cmd_update(args)

        mock_run.assert_not_called()
        mock_input.assert_not_called()
        assert SELF_UPDATE_DISABLED_MESSAGE in capsys.readouterr().out

    def test_cmd_update_check_direct_entry_disabled(self, capsys):
        with patch("subprocess.run") as mock_run:
            _cmd_update_check(branch="main")

        mock_run.assert_not_called()
        assert SELF_UPDATE_DISABLED_MESSAGE in capsys.readouterr().out

    def test_update_via_zip_disabled_never_downloads(self, capsys):
        """The Windows ZIP fallback must not fetch the upstream GitHub archive."""
        import urllib.request

        with patch("subprocess.run") as mock_run, \
             patch.object(urllib.request, "urlretrieve") as mock_urlretrieve:
            _update_via_zip(SimpleNamespace(branch=None))

        mock_run.assert_not_called()
        mock_urlretrieve.assert_not_called()
        out = capsys.readouterr().out
        assert SELF_UPDATE_DISABLED_MESSAGE in out
        assert "Downloading" not in out

    def test_cmd_update_pip_disabled_never_installs(self, capsys):
        """The PyPI path must not run uv/pipx/pip against the upstream package."""
        with patch("subprocess.run") as mock_run:
            _cmd_update_pip(SimpleNamespace())

        mock_run.assert_not_called()
        assert SELF_UPDATE_DISABLED_MESSAGE in capsys.readouterr().out

    def test_sync_with_upstream_is_a_noop(self, tmp_path, capsys):
        """The fork/upstream sync (git remote add upstream + pull) must be dead."""
        from wayne_cli.main import _sync_with_upstream_if_needed

        with patch("subprocess.run") as mock_run, \
             patch("builtins.input") as mock_input:
            result = _sync_with_upstream_if_needed(["git"], tmp_path)

        assert result is None
        mock_run.assert_not_called()
        mock_input.assert_not_called()
        # No interactive upstream offer is printed either.
        assert "upstream" not in capsys.readouterr().out.lower()


# ---------------------------------------------------------------------------
# General environment helpers (not update mechanics) — still live code.
# ---------------------------------------------------------------------------


def test_is_termux_env_true_for_termux_prefix():
    from wayne_cli import main as hm

    assert hm._is_termux_env({"PREFIX": "/data/data/com.termux/files/usr"}) is True


def test_is_termux_env_false_for_non_termux_prefix():
    from wayne_cli import main as hm

    assert hm._is_termux_env({"PREFIX": "/usr/local"}) is False


def test_load_installable_optional_extras_supports_termux_group(tmp_path, monkeypatch):
    from wayne_cli import main as hm

    pyproject = tmp_path / "pyproject.toml"
    pyproject.write_text(
        """
[project]
name = "x"
version = "0.0.0"

[project.optional-dependencies]
all = ["x[mcp]"]
termux-all = ["x[termux]", "x[mcp]"]
mcp = ["mcp>=1"]
termux = ["rich>=14"]
""".strip()
    )
    monkeypatch.setattr(hm, "PROJECT_ROOT", tmp_path)

    assert hm._load_installable_optional_extras(group="all") == ["mcp"]
    assert hm._load_installable_optional_extras(group="termux-all") == ["termux", "mcp"]
