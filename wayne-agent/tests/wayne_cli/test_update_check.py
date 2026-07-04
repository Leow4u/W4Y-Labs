"""Tests for the update check in wayne_cli.banner — DISABLED in the W4Y fork.

Upstream Hermes compared the local checkout against
github.com/NousResearch/hermes-agent (git ls-remote / origin fetch) and PyPI.
In this fork every probe must be a quiet no-op that returns None, without
touching git, the network, or the on-disk cache — otherwise the banner/TUI
would advertise (and `wayne update` used to apply) UPSTREAM Nous code.
"""

import json
import os
import threading
import time
from pathlib import Path
from unittest.mock import patch


def test_version_string_no_v_prefix():
    """__version__ should be bare semver without a 'v' prefix."""
    from wayne_cli import __version__
    assert not __version__.startswith("v"), f"__version__ should not start with 'v', got {__version__!r}"


def test_check_for_updates_disabled_returns_none_without_git_or_cache(tmp_path, monkeypatch):
    """check_for_updates() is a no-op: None, no subprocess, no cache writes."""
    import wayne_cli.banner as banner

    monkeypatch.setenv("WAYNE_HOME", str(tmp_path))
    monkeypatch.setenv("WAYNE_REVISION", "deadbeef")  # nix path must be dead too
    cache_file = tmp_path / ".update_check"

    with patch("wayne_cli.banner.subprocess.run") as mock_run:
        result = banner.check_for_updates()

    assert result is None
    mock_run.assert_not_called()
    assert not cache_file.exists()


def test_check_for_updates_ignores_stale_cache(tmp_path, monkeypatch):
    """A pre-fork cache claiming 'behind' must never be surfaced again."""
    import wayne_cli.banner as banner
    from wayne_cli import __version__

    cache_file = tmp_path / ".update_check"
    cache_file.write_text(
        json.dumps({"ts": time.time(), "behind": 3, "rev": None, "ver": __version__})
    )

    monkeypatch.setenv("WAYNE_HOME", str(tmp_path))
    with patch("wayne_cli.banner.subprocess.run") as mock_run:
        result = banner.check_for_updates()

    assert result is None
    mock_run.assert_not_called()


def test_check_via_rev_disabled_never_probes_upstream():
    """_check_via_rev must not run `git ls-remote` against the upstream repo."""
    import wayne_cli.banner as banner

    with patch("wayne_cli.banner.subprocess.run") as mock_run:
        assert banner._check_via_rev("some-local-sha") is None
    mock_run.assert_not_called()


def test_check_via_local_git_disabled_never_fetches(tmp_path):
    """_check_via_local_git must not fetch or count commits."""
    import wayne_cli.banner as banner

    repo_dir = tmp_path / "wayne-agent"
    repo_dir.mkdir()
    (repo_dir / ".git").mkdir()

    with patch("wayne_cli.banner.subprocess.run") as mock_run:
        assert banner._check_via_local_git(repo_dir) is None
    mock_run.assert_not_called()


def test_prefetch_non_blocking_yields_none():
    """prefetch_update_check() returns immediately and resolves to None."""
    import wayne_cli.banner as banner

    # Reset module state
    banner._update_result = None
    banner._update_check_done = threading.Event()

    start = time.monotonic()
    banner.prefetch_update_check()
    elapsed = time.monotonic() - start

    # Should return almost immediately (well under 1 second)
    assert elapsed < 1.0

    # Wait for the background thread to finish; the disabled check reports None.
    banner._update_check_done.wait(timeout=5)
    assert banner._update_result is None
    assert banner.get_update_result(timeout=1) is None


def test_invalidate_update_cache_clears_all_profiles(tmp_path):
    """_invalidate_update_cache() should delete .update_check from ALL profiles."""
    from wayne_cli.main import _invalidate_update_cache

    # Build a fake ~/.wayne with default + two named profiles
    default_home = tmp_path / ".wayne"
    default_home.mkdir()
    (default_home / ".update_check").write_text('{"ts":1,"behind":50}')

    profiles_root = default_home / "profiles"
    for name in ("ops", "dev"):
        p = profiles_root / name
        p.mkdir(parents=True)
        (p / ".update_check").write_text('{"ts":1,"behind":50}')

    with patch.object(Path, "home", return_value=tmp_path), \
         patch.dict(os.environ, {"WAYNE_HOME": str(default_home)}):
        _invalidate_update_cache()

    # All three caches should be gone
    assert not (default_home / ".update_check").exists(), "default profile cache not cleared"
    assert not (profiles_root / "ops" / ".update_check").exists(), "ops profile cache not cleared"
    assert not (profiles_root / "dev" / ".update_check").exists(), "dev profile cache not cleared"


def test_invalidate_update_cache_no_profiles_dir(tmp_path):
    """Works fine when no profiles directory exists (single-profile setup)."""
    from wayne_cli.main import _invalidate_update_cache

    default_home = tmp_path / ".wayne"
    default_home.mkdir()
    (default_home / ".update_check").write_text('{"ts":1,"behind":5}')

    with patch.object(Path, "home", return_value=tmp_path), \
         patch.dict(os.environ, {"WAYNE_HOME": str(default_home)}):
        _invalidate_update_cache()

    assert not (default_home / ".update_check").exists()
