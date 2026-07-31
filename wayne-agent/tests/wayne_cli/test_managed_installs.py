from types import SimpleNamespace
from unittest.mock import patch

from wayne_cli.config import (
    format_managed_message,
    get_managed_system,
    recommended_update_command,
)
from wayne_cli.main import cmd_update
from tools.skills_hub import OptionalSkillSource


def test_get_managed_system_homebrew(monkeypatch):
    monkeypatch.setenv("WAYNE_MANAGED", "homebrew")

    assert get_managed_system() == "Homebrew"
    assert recommended_update_command() == "brew upgrade wayne-agent"


def test_format_managed_message_homebrew(monkeypatch):
    monkeypatch.setenv("WAYNE_MANAGED", "homebrew")

    message = format_managed_message("update Wayne Agent")

    assert "managed by Homebrew" in message
    assert "Use your Homebrew formula" in message


def test_recommended_update_command_defaults_to_wayne_update(monkeypatch):
    monkeypatch.delenv("WAYNE_MANAGED", raising=False)

    # Also short-circuit the .managed marker path — CI runners may have an
    # ambient ~/.wayne/.managed if a prior test left WAYNE_HOME pointing
    # somewhere with that marker, which would make get_managed_update_command()
    # return "Update your Nix flake input ..." instead of falling through to
    # detect_install_method().
    with patch("wayne_cli.config.get_managed_update_command", return_value=None), \
         patch("wayne_cli.config.detect_install_method", return_value="git"):
        assert recommended_update_command() == "work4you update"


def test_cmd_update_disabled_even_on_managed_installs(monkeypatch, capsys):
    """Self-update is disabled fork-wide, so managed installs (Homebrew,
    Docker, ...) get the same disabled notice instead of the upstream
    'brew upgrade wayne-agent' hint — that would install upstream Nous code."""
    from wayne_cli.main import SELF_UPDATE_DISABLED_MESSAGE

    monkeypatch.setenv("WAYNE_MANAGED", "homebrew")

    with patch("wayne_cli.main.subprocess.run") as mock_run:
        cmd_update(SimpleNamespace())

    assert not mock_run.called
    captured = capsys.readouterr()
    assert SELF_UPDATE_DISABLED_MESSAGE in captured.out


def test_optional_skill_source_honors_env_override(monkeypatch, tmp_path):
    optional_dir = tmp_path / "optional-skills"
    optional_dir.mkdir()
    monkeypatch.setenv("WAYNE_OPTIONAL_SKILLS", str(optional_dir))

    source = OptionalSkillSource()

    assert source._optional_dir == optional_dir
