"""Tests for work4you_cli/completion.py — shell completion script generation."""

import argparse
import os
import re
import shutil
import subprocess
import tempfile

import pytest

from work4you_cli.completion import _walk, generate_bash, generate_zsh, generate_fish


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _bash_exe() -> str | None:
    """Return the path to a *runnable* bash, or ``None``.

    Two Windows traps this avoids:

    - Bare ``"bash"`` in an argv is resolved by ``CreateProcess``, which
      searches ``System32`` *before* PATH — so it finds the WSL stub and fails
      with ``execvpe(/bin/bash) failed`` even when Git Bash is first on PATH.
      Passing the absolute path from ``shutil.which`` bypasses that.
    - If the only bash *is* that stub, probing with a real command turns a
      spurious failure into an honest skip.
    """
    candidate = shutil.which("bash")
    if not candidate:
        return None
    try:
        ok = subprocess.run(
            [candidate, "-c", "exit 0"], capture_output=True, timeout=30
        ).returncode == 0
    except (OSError, subprocess.SubprocessError):
        return None
    return candidate if ok else None


def _make_parser() -> argparse.ArgumentParser:
    """Build a minimal parser that mirrors the real wayne structure."""
    p = argparse.ArgumentParser(prog="wayne")
    p.add_argument("--version", "-V", action="store_true")
    p.add_argument("-p", "--profile", help="Profile name")
    sub = p.add_subparsers(dest="command")

    chat = sub.add_parser("chat", help="Interactive chat with the agent")
    chat.add_argument("-q", "--query")
    chat.add_argument("-m", "--model")

    gw = sub.add_parser("gateway", help="Messaging gateway management")
    gw_sub = gw.add_subparsers(dest="gateway_command")
    gw_sub.add_parser("start", help="Start service")
    gw_sub.add_parser("stop", help="Stop service")
    gw_sub.add_parser("status", help="Show status")
    # alias — should NOT appear as a duplicate in completions
    gw_sub.add_parser("run", aliases=["foreground"], help="Run in foreground")

    sess = sub.add_parser("sessions", help="Manage session history")
    sess_sub = sess.add_subparsers(dest="sessions_action")
    sess_sub.add_parser("list", help="List sessions")
    sess_sub.add_parser("delete", help="Delete a session")

    prof = sub.add_parser("profile", help="Manage profiles")
    prof_sub = prof.add_subparsers(dest="profile_command")
    prof_sub.add_parser("list", help="List profiles")
    prof_sub.add_parser("use", help="Switch to a profile")
    prof_sub.add_parser("create", help="Create a new profile")
    prof_sub.add_parser("delete", help="Delete a profile")
    prof_sub.add_parser("show", help="Show profile details")
    prof_sub.add_parser("alias", help="Set profile alias")
    prof_sub.add_parser("rename", help="Rename a profile")
    prof_sub.add_parser("export", help="Export a profile")

    sub.add_parser("version", help="Show version")

    return p


# ---------------------------------------------------------------------------
# 1. Parser extraction
# ---------------------------------------------------------------------------

class TestWalk:
    def test_top_level_subcommands_extracted(self):
        tree = _walk(_make_parser())
        assert set(tree["subcommands"].keys()) == {"chat", "gateway", "sessions", "profile", "version"}

    def test_nested_subcommands_extracted(self):
        tree = _walk(_make_parser())
        gw_subs = set(tree["subcommands"]["gateway"]["subcommands"].keys())
        assert {"start", "stop", "status", "run"}.issubset(gw_subs)

    def test_aliases_not_duplicated(self):
        """'foreground' is an alias of 'run' — must not appear as separate entry."""
        tree = _walk(_make_parser())
        gw_subs = tree["subcommands"]["gateway"]["subcommands"]
        assert "foreground" not in gw_subs

    def test_flags_extracted(self):
        tree = _walk(_make_parser())
        chat_flags = tree["subcommands"]["chat"]["flags"]
        assert "-q" in chat_flags or "--query" in chat_flags

    def test_help_text_captured(self):
        tree = _walk(_make_parser())
        assert tree["subcommands"]["chat"]["help"] != ""
        assert tree["subcommands"]["gateway"]["help"] != ""


# ---------------------------------------------------------------------------
# 2. Bash output
# ---------------------------------------------------------------------------

class TestGenerateBash:
    def test_contains_completion_function_and_register(self):
        out = generate_bash(_make_parser())
        assert "_work4you_completion()" in out
        assert "complete -F _work4you_completion work4you wayne" in out

    def test_top_level_commands_present(self):
        out = generate_bash(_make_parser())
        for cmd in ("chat", "gateway", "sessions", "version"):
            assert cmd in out

    def test_nested_subcommands_in_case(self):
        out = generate_bash(_make_parser())
        assert "start" in out
        assert "stop" in out

    def test_valid_bash_syntax(self):
        """Script must pass `bash -n` syntax check."""
        bash = _bash_exe()
        if not bash:
            pytest.skip("no runnable bash")
        out = generate_bash(_make_parser())
        with tempfile.NamedTemporaryFile(
            mode="w", suffix=".bash", delete=False, encoding="utf-8"
        ) as f:
            f.write(out)
            path = f.name
        try:
            result = subprocess.run([bash, "-n", path], capture_output=True)
            assert result.returncode == 0, result.stderr.decode()
        finally:
            os.unlink(path)


# ---------------------------------------------------------------------------
# 3. Zsh output
# ---------------------------------------------------------------------------

class TestGenerateZsh:
    def test_contains_compdef_header(self):
        out = generate_zsh(_make_parser())
        assert "#compdef work4you wayne" in out

    def test_top_level_commands_present(self):
        out = generate_zsh(_make_parser())
        for cmd in ("chat", "gateway", "sessions", "version"):
            assert cmd in out

    def test_nested_describe_blocks(self):
        out = generate_zsh(_make_parser())
        assert "_describe" in out
        # gateway has subcommands so a _cmds array must be generated
        assert "gateway_cmds" in out

    def test_registers_compdef_instead_of_invoking_completion_function(self):
        out = generate_zsh(_make_parser())
        assert 'compdef _work4you work4you wayne' in out
        assert '_work4you "$@"' not in out

    def test_preserves_valid_zsh_arguments_alias_syntax(self):
        out = generate_zsh(_make_parser())
        assert "'(-)'{-h,--help}'[Show help and exit]'" in out
        assert "'(-)'{-V,--version}'[Show version and exit]'" in out
        assert "'(-)'{-p,--profile}'[Profile name]:profile:_work4you_profiles'" in out
        assert "'(-h --help){-h,--help}[Show help and exit]'" not in out
        assert '"(-h --help)"{-h,--help}"[Show help and exit]"' not in out

    def test_valid_zsh_syntax(self):
        if not shutil.which("zsh"):
            pytest.skip("zsh not installed")
        out = generate_zsh(_make_parser())
        with tempfile.NamedTemporaryFile(mode="w", suffix=".zsh", delete=False) as f:
            f.write(out)
            path = f.name
        try:
            result = subprocess.run(["zsh", "-n", path], capture_output=True, text=True)
            assert result.returncode == 0, result.stderr
        finally:
            os.unlink(path)

    def test_zsh_eval_style_source_registers_after_compinit(self):
        if not shutil.which("zsh"):
            pytest.skip("zsh not installed")
        out = generate_zsh(_make_parser())
        with tempfile.NamedTemporaryFile(mode="w", suffix=".zsh", delete=False) as f:
            f.write(out)
            path = f.name
        try:
            result = subprocess.run(
                [
                    "zsh",
                    "-fc",
                    f"autoload -Uz compinit && compinit -D; source {path}; [[ ${{_comps[wayne]}} == _work4you && ${{_comps[work4you]}} == _work4you ]]",
                ],
                capture_output=True,
                text=True,
            )
            assert result.returncode == 0, result.stderr
            assert result.stderr == ""
        finally:
            os.unlink(path)


# ---------------------------------------------------------------------------
# 4. Fish output
# ---------------------------------------------------------------------------

class TestGenerateFish:
    def test_disables_file_completion(self):
        out = generate_fish(_make_parser())
        assert "complete -c work4you -c wayne -f" in out

    def test_top_level_commands_present(self):
        out = generate_fish(_make_parser())
        for cmd in ("chat", "gateway", "sessions", "version"):
            assert cmd in out

    def test_subcommand_guard_present(self):
        out = generate_fish(_make_parser())
        assert "__fish_seen_subcommand_from" in out

    def test_valid_fish_syntax(self):
        """Script must be accepted by fish without errors."""
        if not shutil.which("fish"):
            pytest.skip("fish not installed")
        out = generate_fish(_make_parser())
        with tempfile.NamedTemporaryFile(mode="w", suffix=".fish", delete=False) as f:
            f.write(out)
            path = f.name
        try:
            result = subprocess.run(["fish", path], capture_output=True)
            assert result.returncode == 0, result.stderr.decode()
        finally:
            os.unlink(path)


# ---------------------------------------------------------------------------
# 5. Subcommand drift prevention
# ---------------------------------------------------------------------------

class TestSubcommandDrift:
    def test_SUBCOMMANDS_covers_required_commands(self):
        """_SUBCOMMANDS must include all known top-level commands so that
        multi-word session names after -c/-r are never accidentally split.
        """
        import inspect
        from work4you_cli.main import _coalesce_session_name_args

        source = inspect.getsource(_coalesce_session_name_args)
        match = re.search(r'_SUBCOMMANDS\s*=\s*\{([^}]+)\}', source, re.DOTALL)
        assert match, "_SUBCOMMANDS block not found in _coalesce_session_name_args()"
        defined = set(re.findall(r'"(\w+)"', match.group(1)))

        required = {
            "chat", "model", "gateway", "setup", "login", "logout", "auth",
            "status", "cron", "config", "sessions", "version", "update",
            "uninstall", "profile", "skills", "tools", "mcp", "plugins",
            "acp", "claw", "honcho", "completion", "logs",
        }
        missing = required - defined
        assert not missing, f"Missing from _SUBCOMMANDS: {missing}"


# ---------------------------------------------------------------------------
# 6. Profile completion (regression prevention)
# ---------------------------------------------------------------------------

class TestProfileCompletion:
    """Ensure profile name completion is present in all shell outputs."""

    def test_bash_has_profiles_helper(self):
        out = generate_bash(_make_parser())
        assert "_work4you_profiles()" in out
        # The profiles dir is derived from the resolved root, never hardcoded.
        assert 'profiles_dir="$(_work4you_root)/profiles"' in out

    def test_bash_completes_profiles_after_p_flag(self):
        out = generate_bash(_make_parser())
        assert '"-p"' in out or "== \"-p\"" in out
        assert '"--profile"' in out or '== "--profile"' in out
        assert "_work4you_profiles" in out

    def test_bash_profile_subcommand_has_action_completion(self):
        out = generate_bash(_make_parser())
        assert "use|delete|show|alias|rename|export)" in out

    def test_bash_profile_actions_complete_profile_names(self):
        """After 'work4you profile use', complete with profile names."""
        out = generate_bash(_make_parser())
        # The profile case should have _work4you_profiles for name-taking actions
        lines = out.split("\n")
        in_profile_case = False
        has_profiles_in_action = False
        for line in lines:
            if "profile)" in line:
                in_profile_case = True
            if in_profile_case and "_work4you_profiles" in line:
                has_profiles_in_action = True
                break
        assert has_profiles_in_action, "profile actions should complete with _work4you_profiles"

    def test_zsh_has_profiles_helper(self):
        out = generate_zsh(_make_parser())
        assert "_work4you_profiles()" in out
        assert 'profiles_dir="$(_work4you_root)/profiles"' in out

    def test_zsh_has_profile_flag_completion(self):
        out = generate_zsh(_make_parser())
        assert "--profile" in out
        assert "_work4you_profiles" in out

    def test_zsh_profile_actions_complete_names(self):
        out = generate_zsh(_make_parser())
        assert "use|delete|show|alias|rename|export)" in out

    def test_fish_has_profiles_helper(self):
        out = generate_fish(_make_parser())
        assert "__work4you_profiles" in out
        assert "set -l profiles_dir (__work4you_root)/profiles" in out

    def test_fish_has_profile_flag_completion(self):
        out = generate_fish(_make_parser())
        assert "-s p -l profile" in out
        assert "(__work4you_profiles)" in out

    def test_fish_profile_actions_complete_names(self):
        out = generate_fish(_make_parser())
        # Should have profile name completion for actions like use, delete, etc.
        assert "__work4you_profiles" in out
        count = out.count("(__work4you_profiles)")
        # At least the -p flag + the profile action completions
        assert count >= 2, f"Expected >=2 profile completion entries, got {count}"


# ---------------------------------------------------------------------------
# 7. Data-root resolution (the completion scripts run OUTSIDE Python, so they
#    cannot call get_default_wayne_root() — they must re-derive it correctly)
# ---------------------------------------------------------------------------

# Driver for test_bash_root_resolution_matches_engine: sources the generated
# completion script ($1), builds a throwaway home layout under $2, and asserts
# the resolver's answers. Exits non-zero (and prints every mismatch) on failure.
_ROOT_RESOLUTION_DRIVER = r'''
set -u
source "$1"

SANDBOX="$2"
rm -rf "$SANDBOX"
export HOME="$SANDBOX/home"
CUSTOM="$SANDBOX/opt/data"
mkdir -p "$HOME/.wayne/profiles/coder" "$CUSTOM/profiles/bot"

fail=0
check() {
    if [ "$2" != "$3" ]; then
        echo "FAIL $1: expected [$2] got [$3]"
        fail=1
    fi
}

unset WAYNE_HOME WORK4YOU_HOME || true

# A legacy home the migration has not moved yet is still found.
check legacy-root "$HOME/.wayne" "$(_work4you_root)"
check legacy-profiles "default coder" "$(_work4you_profiles)"

# Once migrated, the new root wins over the leftover legacy one.
mkdir -p "$HOME/.work4you/profiles/coder"
check migrated-root "$HOME/.work4you" "$(_work4you_root)"
check migrated-profiles "default coder" "$(_work4you_profiles)"

# A profile home resolves back to the root that owns profiles/.
export WORK4YOU_HOME="$HOME/.work4you/profiles/coder"
check profile-mode-root "$HOME/.work4you" "$(_work4you_root)"
check profile-mode-names "default coder" "$(_work4you_profiles)"

# Custom/Docker root, plain and in profile mode.
unset WORK4YOU_HOME
export WAYNE_HOME="$CUSTOM"
check custom-root "$CUSTOM" "$(_work4you_root)"
check custom-profiles "default bot" "$(_work4you_profiles)"
export WAYNE_HOME="$CUSTOM/profiles/bot"
check custom-profile-mode "$CUSTOM" "$(_work4you_root)"

# WAYNE_HOME wins over WORK4YOU_HOME, matching get_wayne_home().
export WAYNE_HOME="$CUSTOM"
export WORK4YOU_HOME="$HOME/.work4you"
check legacy-env-precedence "$CUSTOM" "$(_work4you_root)"

# WORK4YOU_HOME alone is honoured too (no in-process bridge in a shell).
unset WAYNE_HOME
check new-env-spelling "$HOME/.work4you" "$(_work4you_root)"

exit $fail
'''

class TestDataRootResolution:
    """The home moved from ~/.wayne to ~/.work4you in the brand migration.

    A hardcoded path in the generated script silently completes nothing, so
    every generator has to probe both roots and honour both env spellings.
    """

    @pytest.mark.parametrize(
        "generator", [generate_bash, generate_zsh, generate_fish]
    )
    def test_no_hardcoded_legacy_profiles_path(self, generator):
        out = generator(_make_parser())
        assert "$HOME/.wayne/profiles" not in out

    @pytest.mark.parametrize(
        "generator", [generate_bash, generate_zsh, generate_fish]
    )
    def test_probes_both_home_roots(self, generator):
        out = generator(_make_parser())
        assert "$HOME/.work4you" in out
        assert "$HOME/.wayne" in out
        # New root is checked before the legacy one.
        assert out.index("$HOME/.work4you") < out.index("$HOME/.wayne")

    @pytest.mark.parametrize(
        "generator", [generate_bash, generate_zsh, generate_fish]
    )
    def test_honours_both_home_env_spellings(self, generator):
        """WORK4YOU_HOME is the user-facing spelling, WAYNE_HOME the one the
        engine actually reads first — a shell snippet gets no in-process
        bridge, so it must check both itself."""
        out = generator(_make_parser())
        assert "WORK4YOU_HOME" in out
        assert "WAYNE_HOME" in out
        # Same precedence as work4you_constants.get_wayne_home().
        assert out.index("WAYNE_HOME") < out.index("WORK4YOU_HOME")

    def test_bash_root_resolution_matches_engine(self, tmp_path):
        """Source the generated bash and exercise the resolver end to end.

        All comparisons happen *inside* bash: Git Bash rewrites paths handed to
        it through the environment (``%TEMP%`` becomes ``/tmp``), so comparing
        its stdout against a Python-side string would test path translation
        rather than the resolver.
        """
        bash = _bash_exe()
        if not bash:
            pytest.skip("no runnable bash")

        script = tmp_path / "completion.bash"
        script.write_text(generate_bash(_make_parser()), encoding="utf-8")
        driver = tmp_path / "driver.bash"
        driver.write_text(_ROOT_RESOLUTION_DRIVER, encoding="utf-8")

        res = subprocess.run(
            [bash, driver.as_posix(), script.as_posix(),
             (tmp_path / "sandbox").as_posix()],
            capture_output=True, text=True,
        )
        assert res.returncode == 0, res.stdout + res.stderr
