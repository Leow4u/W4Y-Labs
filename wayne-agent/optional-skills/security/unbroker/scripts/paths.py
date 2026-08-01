"""Filesystem paths for the unbroker skill (stdlib only).

All per-subject data lives under PDD_DATA_DIR (default: $WAYNE_HOME/unbroker),
which is the same trust boundary Wayne uses for .env and OAuth tokens.
"""
from __future__ import annotations

import os
from pathlib import Path


def wayne_home() -> Path:
    """Resolve the Work4You home, preferring the engine's own resolver.

    Standalone runs (system python, nix, CI) may not have
    ``work4you_constants`` importable, so the fallback mirrors its logic:
    the brand migration moved the default from ``~/.wayne`` to
    ``~/.work4you``, and an unmigrated install still has the old root.
    """
    try:
        from work4you_constants import get_wayne_home

        return get_wayne_home()
    except (ModuleNotFoundError, ImportError):
        pass
    val = (os.environ.get("WAYNE_HOME") or os.environ.get("WORK4YOU_HOME") or "").strip()
    if val:
        return Path(val)
    new_root, legacy_root = Path.home() / ".work4you", Path.home() / ".wayne"
    return legacy_root if (legacy_root.is_dir() and not new_root.is_dir()) else new_root


def display_wayne_home() -> str:
    """``~/``-shortened display string for :func:`wayne_home`."""
    try:
        from work4you_constants import display_wayne_home as _real

        return _real()
    except (ModuleNotFoundError, ImportError):
        pass
    home = wayne_home()
    try:
        return "~/" + str(home.relative_to(Path.home()))
    except ValueError:
        return str(home)


def data_dir() -> Path:
    override = os.environ.get("PDD_DATA_DIR")
    return Path(override) if override else wayne_home() / "unbroker"


def config_path() -> Path:
    return data_dir() / "config.json"


def subjects_dir() -> Path:
    return data_dir() / "subjects"


def subject_dir(subject_id: str) -> Path:
    return subjects_dir() / subject_id


def dossier_path(subject_id: str) -> Path:
    return subject_dir(subject_id) / "dossier.json"


def ledger_path(subject_id: str) -> Path:
    return subject_dir(subject_id) / "ledger.json"


def audit_path(subject_id: str) -> Path:
    return subject_dir(subject_id) / "audit.jsonl"


def evidence_dir(subject_id: str) -> Path:
    return subject_dir(subject_id) / "evidence"


def skill_root() -> Path:
    """The skill directory (parent of scripts/)."""
    return Path(__file__).resolve().parent.parent


def brokers_dir() -> Path:
    return skill_root() / "references" / "brokers"


def brokers_cache_path() -> Path:
    """Live broker snapshot pulled from BADBOOL (merged under the curated DB)."""
    return data_dir() / "brokers-cache" / "badbool.json"


def registry_cache_path() -> Path:
    """CA Data Broker Registry snapshot (separate coverage lane; DROP/email, not scanned)."""
    return data_dir() / "brokers-cache" / "ca-registry.json"


def age_identity_path() -> Path:
    """age identity (private key) used for at-rest encryption when enabled.

    Defaults beside the data; point PDD_AGE_IDENTITY at a separate volume/token
    for real key separation from the encrypted data.
    """
    override = os.environ.get("PDD_AGE_IDENTITY")
    return Path(override) if override else data_dir() / "age-identity.txt"


def templates_dir() -> Path:
    return skill_root() / "templates"
