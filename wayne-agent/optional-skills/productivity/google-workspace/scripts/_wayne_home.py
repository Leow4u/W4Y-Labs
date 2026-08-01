"""Resolve WAYNE_HOME for standalone skill scripts.

Skill scripts may run outside the Wayne process (e.g. system Python,
nix env, CI) where ``work4you_constants`` is not importable.  This module
provides the same ``get_wayne_home()`` and ``display_wayne_home()``
contracts as ``work4you_constants`` without requiring it on ``sys.path``.

When ``work4you_constants`` IS available it is used directly so that any
future enhancements (profile resolution, Docker detection, etc.) are
picked up automatically.  The fallback path replicates the core logic
from ``work4you_constants.py`` using only the stdlib.

All scripts under ``google-workspace/scripts/`` should import from here
instead of duplicating the ``WAYNE_HOME = Path(os.getenv(...))`` pattern.
"""

from __future__ import annotations

import os
from pathlib import Path

try:
    from work4you_constants import display_wayne_home as display_wayne_home
    from work4you_constants import get_wayne_home as get_wayne_home
except (ModuleNotFoundError, ImportError):

    def get_wayne_home() -> Path:
        """Return the Work4You home directory (default: ``~/.work4you``).

        Mirrors ``work4you_constants.get_wayne_home()``, including the
        brand migration: the default root moved from ``~/.wayne`` to
        ``~/.work4you``, and an install that has not been migrated yet
        still keeps its data under the legacy name."""
        val = (
            os.environ.get("WAYNE_HOME", "").strip()
            or os.environ.get("WORK4YOU_HOME", "").strip()
        )
        if val:
            return Path(val)
        new_root, legacy_root = Path.home() / ".work4you", Path.home() / ".wayne"
        if new_root.is_dir():
            return new_root
        if legacy_root.is_dir():
            return legacy_root
        return new_root

    def display_wayne_home() -> str:
        """Return a user-friendly ``~/``-shortened display string.

        Mirrors ``work4you_constants.display_wayne_home()``."""
        home = get_wayne_home()
        try:
            return "~/" + str(home.relative_to(Path.home()))
        except ValueError:
            return str(home)
