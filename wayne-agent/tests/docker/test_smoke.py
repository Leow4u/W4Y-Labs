"""Runtime smoke tests for the Docker image entrypoint and subcommands.

Converted from the former ``.github/actions/wayne-smoke-test`` composite
action.  These tests exercise the image's real ENTRYPOINT (``/init`` +
``main-wrapper.sh``) via ``docker run --rm <image> --help`` and
``docker run --rm <image> dashboard --help`` to catch basic runtime
regressions before publishing.

The harness expects the ``built_image`` fixture from
``tests/docker/conftest.py``.  When Docker isn't available every test
here is skipped at collection time.
"""
from __future__ import annotations

import subprocess


def test_work4you_help(built_image: str) -> None:
    """``docker run --rm <image> --help`` must exit 0.

    Uses the image's real ENTRYPOINT (``/init`` + ``main-wrapper.sh``)
    so this exercises the actual production startup path.  PR #30136
    review caught that an ``--entrypoint`` override in the old composite
    action had been silently neutered by the s6-overlay migration —
    ``stage2-hook`` ignores CMD args passed after an overridden
    entrypoint, so the smoke test was a no-op.
    """
    r = subprocess.run(
        ["docker", "run", "--rm", built_image, "--help"],
        capture_output=True, text=True, timeout=60,
    )
    assert r.returncode == 0, (
        f"work4you --help failed (exit {r.returncode}): "
        f"stdout={r.stdout[-2000:]!r} stderr={r.stderr[-2000:]!r}"
    )
    assert "Traceback" not in r.stderr, (
        f"work4you --help produced a traceback: {r.stderr[-2000:]!r}"
    )


def test_dashboard_subcommand_present(built_image: str) -> None:
    """``docker run --rm <image> dashboard --help`` must exit 0.

    Regression guard for #9153: the ``dashboard`` subcommand was present
    in source but missing from the published image.  If this fails,
    something in the Dockerfile is excluding the dashboard subcommand
    from the installed package.
    """
    r = subprocess.run(
        ["docker", "run", "--rm", built_image, "dashboard", "--help"],
        capture_output=True, text=True, timeout=60,
    )
    assert r.returncode == 0, (
        f"work4you dashboard --help failed (exit {r.returncode}): "
        f"stdout={r.stdout[-2000:]!r} stderr={r.stderr[-2000:]!r}"
    )
    combined = (r.stdout + r.stderr).lower()
    assert "dashboard" in combined or "usage" in combined, (
        f"dashboard --help output unexpected: {combined[-2000:]!r}"
    )


# ---------------------------------------------------------------------------
# Wayne → Work4You rebrand: legacy-compatibility surfaces.
#
# The image DELIBERATELY keeps two pre-rebrand entry points alive so
# hand-written compose files, entrypoint overrides and old runbooks
# don't break on upgrade (see the Dockerfile's `ln -s /opt/work4you
# /opt/wayne` and the dual launcher install). Both are intentional
# compat shims, NOT stale pins — do not "modernize" these two tests to
# /opt/work4you or `work4you`, that would delete the coverage.
# ---------------------------------------------------------------------------


def test_legacy_opt_wayne_path_symlink_preserved(built_image: str) -> None:
    """``/opt/wayne`` must still resolve to the install tree.

    External wrappers and compose files written before the rebrand
    hard-code ``/opt/wayne`` paths (entrypoint overrides pointing at
    ``/opt/wayne/docker/entrypoint.sh``, bind-mount targets, exec
    shims). The Dockerfile keeps a compatibility symlink so those keep
    working; this guards it against a future cleanup pass.
    """
    r = subprocess.run(
        ["docker", "run", "--rm", "--entrypoint", "sh", built_image,
         "-c", "test -L /opt/wayne && readlink /opt/wayne"],
        capture_output=True, text=True, timeout=60,
    )
    assert r.returncode == 0, (
        "/opt/wayne compatibility symlink is missing from the image; "
        "pre-rebrand compose files and entrypoint overrides will break. "
        f"stderr={r.stderr[-1000:]!r}"
    )
    assert r.stdout.strip() == "/opt/work4you", (
        f"/opt/wayne points at {r.stdout.strip()!r}, expected /opt/work4you"
    )


def test_legacy_wayne_launcher_alias_still_works(built_image: str) -> None:
    """``docker exec <c> wayne …`` must still reach the real CLI.

    The shim is installed under both launcher names (``work4you``
    current, ``wayne`` legacy alias) so old runbooks keep working AND
    keep getting the privilege drop. Exercised here through the image's
    CMD path rather than docker exec so the test stays cheap.
    """
    r = subprocess.run(
        ["docker", "run", "--rm", "--entrypoint", "/opt/work4you/bin/wayne",
         built_image, "--help"],
        capture_output=True, text=True, timeout=60,
    )
    assert r.returncode == 0, (
        "legacy `wayne` launcher alias is broken; pre-rebrand runbooks "
        f"will fail. stdout={r.stdout[-1000:]!r} stderr={r.stderr[-1000:]!r}"
    )
    assert "Traceback" not in r.stderr, (
        f"legacy `wayne` launcher produced a traceback: {r.stderr[-2000:]!r}"
    )
