"""One-time data migration of the legacy home (~/.wayne) to ~/.work4you.

Brand migration, Fase 2b. DATA moves; CODE stays: the legacy root also hosts
the engine checkout/venv/toolchain on installer layouts, and the running
process executes from inside them (files are locked on Windows), so the
code dirs are excluded and keep living in the legacy root until the
distribution phase relocates them via the installer/update path.

Runs at the very top of ``main()``. Because 30+ modules capture the home at
import time, a successful migration is followed by a one-shot re-exec of the
same argv (``wayne_cli.relaunch``) so every reader resolves the new root from
a clean process. ``_get_platform_default_wayne_home`` resolves dynamically
(new root if it exists, else legacy, else new), which keeps un-migrated and
half-migrated installs working no matter when the move happens.

Follows the codex_runtime_plugin_migration pattern: never raises, loudly
reports, refuses to guess in ambiguous states.
"""

from __future__ import annotations

import os
import sys
import time
from pathlib import Path
from typing import Optional

# Entries that stay in the legacy root: engine code, toolchains, and markers
# owned by the code/install layer (the desktop update chip reads
# engine-source.json next to the engine checkout; gateway-service holds the
# Windows scheduled-task wrapper that points at code paths).
_CODE_ENTRIES = {
    "wayne-agent",
    "wayne-agent-main",
    "venv",
    "git",
    "node",
    "bin",
    "engine-source.json",
    "engine-version.json",
    "gateway-service",
}

_MIGRATED_MARKER = ".migrated-from"
_MOVED_STUB = ".moved-to-work4you"
_LOCK_NAME = ".home-migration.lock"

# Textual path-prefix rewrite targets: files whose VALUES may embed the
# absolute legacy root (user config, env, cron job workdirs). Databases are
# deliberately not rewritten here — kanban.db absolute workspace paths are a
# documented follow-up (see the migration PR / BACKEND-MAP).
_PREFIX_REWRITE_FILES = ("config.yaml", ".env", os.path.join("cron", "jobs.json"))


def _legacy_default_home() -> Path:
    if sys.platform == "win32":
        local_appdata = os.environ.get("LOCALAPPDATA", "").strip()
        base = Path(local_appdata) if local_appdata else Path.home() / "AppData" / "Local"
        return base / "wayne"
    return Path.home() / ".wayne"


def _new_default_home() -> Path:
    if sys.platform == "win32":
        local_appdata = os.environ.get("LOCALAPPDATA", "").strip()
        base = Path(local_appdata) if local_appdata else Path.home() / "AppData" / "Local"
        return base / "work4you"
    return Path.home() / ".work4you"


def _say(msg: str) -> None:
    try:
        sys.stderr.write(msg + "\n")
        sys.stderr.flush()
    except Exception:
        pass


def _new_root_is_effectively_empty(new_root: Path) -> bool:
    """True when the new root doesn't exist or only holds ignorable stubs."""
    if not new_root.exists():
        return True
    try:
        entries = [e.name for e in new_root.iterdir()]
    except OSError:
        return False
    return all(name in {_MIGRATED_MARKER, _LOCK_NAME} for name in entries)


def _rewrite_path_prefixes(new_root: Path, old_root: Path) -> None:
    """Swap absolute legacy-root prefixes inside known text files.

    Only files that MOVED are touched, and only the absolute old-root string
    (native and forward-slash spellings) is replaced — values pointing at the
    user's own folders are left alone by construction.
    """
    old_variants = {str(old_root), str(old_root).replace("\\", "/")}
    new_native = str(new_root)
    for rel in _PREFIX_REWRITE_FILES:
        target = new_root / rel
        if not target.is_file():
            continue
        try:
            text = target.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue
        rewritten = text
        for old in old_variants:
            if old in rewritten:
                replacement = new_native if "\\" in old else new_native.replace("\\", "/")
                rewritten = rewritten.replace(old, replacement)
        if rewritten != text:
            try:
                target.write_text(rewritten, encoding="utf-8")
                _say(f"  ✓ Updated stored paths in {rel}")
            except OSError as exc:
                _say(f"  ⚠ Could not update paths in {rel}: {exc}")


def _update_windows_registry_env(new_root: Path) -> None:
    """User-scope env: set WORK4YOU_HOME, drop WAYNE_HOME (installer wrote it)."""
    if sys.platform != "win32":
        return
    try:
        import winreg

        with winreg.OpenKey(
            winreg.HKEY_CURRENT_USER, "Environment", 0, winreg.KEY_ALL_ACCESS
        ) as key:
            had_wayne_home = False
            try:
                winreg.QueryValueEx(key, "WAYNE_HOME")
                had_wayne_home = True
            except FileNotFoundError:
                pass
            if had_wayne_home:
                winreg.SetValueEx(
                    key, "WORK4YOU_HOME", 0, winreg.REG_SZ, str(new_root)
                )
                winreg.DeleteValue(key, "WAYNE_HOME")
                _say("  ✓ Registry: WAYNE_HOME → WORK4YOU_HOME (User scope)")
    except Exception as exc:
        _say(f"  ⚠ Could not update the registry env var (non-fatal): {exc}")
        return
    try:
        import ctypes

        # Tell running shells the environment block changed.
        ctypes.windll.user32.SendMessageTimeoutW(
            0xFFFF, 0x1A, 0, "Environment", 0x0002, 5000, None
        )
    except Exception:
        pass


def _warn_stale_services(old_root: Path) -> None:
    """Installed gateway services pin WAYNE_HOME=<old root> inside their unit
    definitions. Regenerating them safely needs the gateway machinery (and
    often elevation), so the migration only detects and instructs."""
    hints = []
    if sys.platform == "win32":
        if (old_root / "gateway-service").exists():
            hints.append("Windows scheduled task")
    else:
        for probe in (
            Path.home() / ".config" / "systemd" / "user",
            Path.home() / "Library" / "LaunchAgents",
        ):
            try:
                if probe.exists() and any(
                    "wayne" in p.name for p in probe.iterdir()
                ):
                    hints.append(str(probe))
            except OSError:
                continue
    if hints:
        _say(
            "  ⚠ A gateway service definition still points at the old home. "
            "Run `work4you gateway install` once to regenerate it."
        )


def maybe_migrate_home(argv: Optional[list[str]] = None) -> bool:
    """Move legacy home data to the new root. Returns True when a re-exec is
    required (migration happened this call). Never raises."""
    try:
        return _maybe_migrate_home_inner()
    except Exception as exc:  # pragma: no cover - belt and braces
        _say(f"⚠ Home migration skipped after unexpected error: {exc}")
        return False


def _maybe_migrate_home_inner() -> bool:
    # Explicit home (Docker /opt/data, profiles, power users): nothing to do.
    if os.environ.get("WAYNE_HOME", "").strip() or os.environ.get(
        "WORK4YOU_HOME", ""
    ).strip():
        return False
    try:
        from wayne_constants import is_container

        if is_container():
            return False
    except Exception:
        pass
    if os.environ.get("WORK4YOU_SKIP_HOME_MIGRATION", "").strip() == "1":
        return False

    old_root = _legacy_default_home()
    new_root = _new_default_home()
    if old_root == new_root or not old_root.is_dir():
        return False
    if (old_root / _MOVED_STUB).exists():
        return False
    if not _new_root_is_effectively_empty(new_root):
        # Both roots have real content and no marker: refuse to guess.
        if not (new_root / _MIGRATED_MARKER).exists():
            _say(
                f"⚠ Both {old_root} and {new_root} contain data; leaving both "
                f"untouched. Remove or merge one of them manually (or set "
                f"WORK4YOU_HOME) to silence this."
            )
            return False
        # Marker present: a previous run migrated but may have left entries
        # behind (locked files). Resume — the move loop skips entries that
        # already exist in the new root.
        try:
            has_leftovers = any(
                e.name not in _CODE_ENTRIES
                and e.name not in {_LOCK_NAME, _MOVED_STUB}
                for e in old_root.iterdir()
            )
        except OSError:
            return False
        if not has_leftovers:
            return False

    # Single-runner guard. O_EXCL creation in the OLD root: concurrent boots
    # (gateway + CLI) race here, first wins, others skip this launch.
    lock_path = old_root / _LOCK_NAME
    try:
        fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
        os.close(fd)
    except FileExistsError:
        return False
    except OSError:
        return False

    moved_any = False
    try:
        _say(f"→ Migrating your data home: {old_root} → {new_root}")
        new_root.mkdir(parents=True, exist_ok=True)
        failures = []
        for entry in sorted(old_root.iterdir(), key=lambda p: p.name):
            name = entry.name
            if name in _CODE_ENTRIES or name in {_LOCK_NAME, _MOVED_STUB}:
                continue
            target = new_root / name
            if target.exists():
                failures.append(f"{name} (already exists in new home)")
                continue
            try:
                os.rename(str(entry), str(target))
                moved_any = True
            except OSError as exc:
                failures.append(f"{name} ({exc})")

        if failures:
            _say("  ⚠ Some entries could not be moved:")
            for f in failures[:10]:
                _say(f"    • {f}")

        if not moved_any:
            # Nothing moved (e.g. code-only legacy root): don't relaunch, and
            # don't stamp markers that would block a future data migration.
            return False

        _rewrite_path_prefixes(new_root, old_root)
        _update_windows_registry_env(new_root)
        _warn_stale_services(old_root)

        stamp = f"{old_root}\n{time.strftime('%Y-%m-%dT%H:%M:%S')}\n"
        try:
            (new_root / _MIGRATED_MARKER).write_text(stamp, encoding="utf-8")
        except OSError:
            pass
        if not failures:
            try:
                (old_root / _MOVED_STUB).write_text(
                    f"Data moved to {new_root}. The engine code that remains "
                    f"here relocates via the installer in a later update.\n",
                    encoding="utf-8",
                )
            except OSError:
                pass
        _say(f"  ✓ Data home is now {new_root}")
        return True
    finally:
        try:
            lock_path.unlink()
        except OSError:
            pass
