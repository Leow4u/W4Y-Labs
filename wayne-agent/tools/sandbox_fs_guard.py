"""Filesystem write guard for ``execute_code`` sandbox children.

Cursor / Codex / Claude all confine code-execution (or Bash) writes with an
OS-level or tool-level boundary: workspace + temp are writable; agent home /
security config are not. Wayne's RPC ``write_file`` / ``patch`` already hit
``file_tools._check_sensitive_path`` and ``is_write_denied``, but the child
process is otherwise a normal Python interpreter — raw ``open()`` /
``pathlib`` could still rewrite ``~/.wayne/config.yaml`` or ``.env``.

This module installs builtins/os/pathlib wrappers **inside the child** so
those writes raise ``PermissionError`` before they touch disk. It is
deliberately dependency-light so the same source can be shipped to remote
backends that do not have the Wayne package tree.
"""

from __future__ import annotations

import builtins
import os
import tempfile
from typing import Iterable

_ENV_ALLOW = "WAYNE_SANDBOX_ALLOW_ROOTS"
_ENV_DENY_PATHS = "WAYNE_SANDBOX_DENY_PATHS"
_ENV_DENY_PREFIXES = "WAYNE_SANDBOX_DENY_PREFIXES"

_installed = False
_orig_open = builtins.open


def _split_env_paths(value: str) -> list[str]:
    if not value:
        return []
    out: list[str] = []
    for part in value.split(os.pathsep):
        part = part.strip()
        if part:
            out.append(part)
    return out


def _realpath(path: str) -> str:
    return os.path.realpath(os.path.expanduser(str(path)))


def _mode_writes(mode: str | None) -> bool:
    if mode is None:
        mode = "r"
    # Any of w/a/x/+ means the file may be modified.
    return any(flag in mode for flag in "wax+")


def _under_root(resolved: str, root: str) -> bool:
    if not root:
        return False
    if resolved == root:
        return True
    prefix = root if root.endswith(os.sep) else root + os.sep
    return resolved.startswith(prefix)


class SandboxFSPermissionError(PermissionError):
    """Raised when sandboxed code tries to write a protected path."""


def check_write_allowed(
    path: str,
    *,
    allow_roots: Iterable[str],
    deny_paths: Iterable[str],
    deny_prefixes: Iterable[str],
) -> None:
    """Raise ``SandboxFSPermissionError`` when ``path`` must not be written."""
    try:
        resolved = _realpath(path)
    except (OSError, ValueError):
        resolved = os.path.abspath(os.path.expanduser(str(path)))

    deny_path_set = {_realpath(p) for p in deny_paths if p}
    if resolved in deny_path_set:
        raise SandboxFSPermissionError(
            f"execute_code sandbox refuses to write protected path: {path}"
        )

    for prefix in deny_prefixes:
        if not prefix:
            continue
        try:
            pref = _realpath(prefix.rstrip("/\\"))
        except (OSError, ValueError):
            pref = prefix.rstrip("/\\")
        if _under_root(resolved, pref):
            raise SandboxFSPermissionError(
                f"execute_code sandbox refuses to write under protected tree: {path}"
            )

    roots = [_realpath(r) for r in allow_roots if r]
    if roots and not any(_under_root(resolved, root) for root in roots):
        raise SandboxFSPermissionError(
            f"execute_code sandbox refuses to write outside allowed roots: {path}"
        )


def install(
    *,
    allow_roots: Iterable[str] | None = None,
    deny_paths: Iterable[str] | None = None,
    deny_prefixes: Iterable[str] | None = None,
) -> None:
    """Patch builtins/os/pathlib so denied writes raise PermissionError."""
    global _installed
    if _installed:
        return

    allow = list(allow_roots or [])
    deny_p = list(deny_paths or [])
    deny_x = list(deny_prefixes or [])

    def _guard(path: str) -> None:
        check_write_allowed(
            path,
            allow_roots=allow,
            deny_paths=deny_p,
            deny_prefixes=deny_x,
        )

    def _open_guard(file, mode="r", *args, **kwargs):
        if _mode_writes(mode if isinstance(mode, str) else "r"):
            _guard(file)
        return _orig_open(file, mode, *args, **kwargs)

    builtins.open = _open_guard  # type: ignore[assignment]

    # os.replace / rename — destination must be writable under policy.
    _orig_replace = getattr(os, "replace", None)
    _orig_rename = os.rename

    if _orig_replace is not None:
        def _replace_guard(src, dst, *args, **kwargs):
            _guard(dst)
            return _orig_replace(src, dst, *args, **kwargs)

        os.replace = _replace_guard  # type: ignore[assignment]

    def _rename_guard(src, dst, *args, **kwargs):
        _guard(dst)
        return _orig_rename(src, dst, *args, **kwargs)

    os.rename = _rename_guard  # type: ignore[assignment]

    try:
        import pathlib

        # Subclassing pathlib.Path fails on Python < 3.12 (no _flavour on the
        # abstract base). Patch the concrete classes instead so
        # ``Path(...).write_text`` / ``open('w')`` hit the guard.
        concrete = []
        for name in ("WindowsPath", "PosixPath"):
            cls = getattr(pathlib, name, None)
            if cls is not None:
                concrete.append(cls)
        if not concrete:
            concrete = [pathlib.Path]

        def _wrap_method(orig, path_arg_index=0, mode_arg=None):
            def _wrapped(self, *args, **kwargs):
                if mode_arg is not None:
                    mode = kwargs.get("mode", args[mode_arg] if len(args) > mode_arg else "r")
                    if _mode_writes(mode if isinstance(mode, str) else "r"):
                        _guard(str(self))
                elif path_arg_index == 0:
                    _guard(str(self))
                else:
                    target = args[path_arg_index - 1] if len(args) >= path_arg_index else kwargs.get("target")
                    _guard(str(target))
                return orig(self, *args, **kwargs)

            return _wrapped

        for cls in concrete:
            cls.open = _wrap_method(cls.open, mode_arg=0)  # type: ignore[method-assign]
            cls.write_text = _wrap_method(cls.write_text)  # type: ignore[method-assign]
            cls.write_bytes = _wrap_method(cls.write_bytes)  # type: ignore[method-assign]
            cls.touch = _wrap_method(cls.touch)  # type: ignore[method-assign]
            cls.unlink = _wrap_method(cls.unlink)  # type: ignore[method-assign]
            cls.mkdir = _wrap_method(cls.mkdir)  # type: ignore[method-assign]
            cls.rename = _wrap_method(cls.rename, path_arg_index=1)  # type: ignore[method-assign]
            cls.replace = _wrap_method(cls.replace, path_arg_index=1)  # type: ignore[method-assign]
    except Exception:
        pass

    try:
        import shutil

        for name in ("copy", "copy2", "copyfile", "move", "copymode", "copystat"):
            orig = getattr(shutil, name, None)
            if orig is None:
                continue

            def _make(fn):
                def _wrapped(src, dst, *args, **kwargs):
                    _guard(dst)
                    return fn(src, dst, *args, **kwargs)

                return _wrapped

            setattr(shutil, name, _make(orig))
    except Exception:
        pass

    _installed = True


def install_from_env() -> None:
    """Install using ``WAYNE_SANDBOX_*`` env vars set by the parent."""
    allow = _split_env_paths(os.environ.get(_ENV_ALLOW, ""))
    if not allow:
        # Fail closed on missing allow-list: only system temp is writable.
        allow = [tempfile.gettempdir()]
    deny_paths = _split_env_paths(os.environ.get(_ENV_DENY_PATHS, ""))
    deny_prefixes = _split_env_paths(os.environ.get(_ENV_DENY_PREFIXES, ""))
    install(allow_roots=allow, deny_paths=deny_paths, deny_prefixes=deny_prefixes)


def build_sandbox_fs_env(allow_roots: Iterable[str]) -> dict[str, str]:
    """Build child env vars describing allow/deny policy (parent-side helper)."""
    from agent.file_safety import (  # local import — parent only
        _wayne_home_path,
        _wayne_root_path,
        build_write_denied_paths,
        build_write_denied_prefixes,
    )

    home = os.path.realpath(os.path.expanduser("~"))
    deny_paths = set(build_write_denied_paths(home))
    # Unify with file_tools: config.yaml is security policy.
    for base in (_wayne_home_path(), _wayne_root_path()):
        deny_paths.add(os.path.realpath(str(base / "config.yaml")))

    deny_prefixes = set(build_write_denied_prefixes(home))
    # Raw child I/O must not write anywhere under WAYNE_HOME / root — RPC
    # write_file remains the gated path for legitimate skill/memory edits.
    for base in (_wayne_home_path(), _wayne_root_path()):
        try:
            deny_prefixes.add(os.path.realpath(str(base)))
        except (OSError, ValueError):
            continue

    allow = []
    for root in allow_roots:
        if not root:
            continue
        try:
            allow.append(os.path.realpath(root))
        except (OSError, ValueError):
            allow.append(os.path.abspath(root))
    try:
        allow.append(os.path.realpath(tempfile.gettempdir()))
    except (OSError, ValueError):
        pass

    # De-dupe while preserving order
    seen: set[str] = set()
    allow_unique = []
    for item in allow:
        if item not in seen:
            seen.add(item)
            allow_unique.append(item)

    return {
        _ENV_ALLOW: os.pathsep.join(allow_unique),
        _ENV_DENY_PATHS: os.pathsep.join(sorted(deny_paths)),
        _ENV_DENY_PREFIXES: os.pathsep.join(sorted(deny_prefixes)),
    }


_BOOTSTRAP_SOURCE = '''\
import os
import runpy
import tools.sandbox_fs_guard as _wayne_sfg
_wayne_sfg.install_from_env()
runpy.run_path(os.environ["WAYNE_SANDBOX_SCRIPT"], run_name="__main__")
'''

_BOOTSTRAP_STANDALONE_SOURCE = '''\
import os
import runpy
import wayne_sandbox_fs as _wayne_sfg
_wayne_sfg.install_from_env()
runpy.run_path(os.environ["WAYNE_SANDBOX_SCRIPT"], run_name="__main__")
'''


def local_bootstrap_source() -> str:
    """Bootstrap that imports ``tools.sandbox_fs_guard`` (local PYTHONPATH)."""
    return _BOOTSTRAP_SOURCE


def remote_bootstrap_source() -> str:
    """Bootstrap that imports shipped ``wayne_sandbox_fs`` module."""
    return _BOOTSTRAP_STANDALONE_SOURCE


def render_standalone_module() -> str:
    """Return a self-contained module body for remote backends (no Wayne deps)."""
    return _STANDALONE_MODULE


_STANDALONE_MODULE = r'''
"""Auto-generated standalone FS guard for remote execute_code sandboxes."""
from __future__ import annotations

import builtins
import os
import tempfile

_ENV_ALLOW = "WAYNE_SANDBOX_ALLOW_ROOTS"
_ENV_DENY_PATHS = "WAYNE_SANDBOX_DENY_PATHS"
_ENV_DENY_PREFIXES = "WAYNE_SANDBOX_DENY_PREFIXES"
_installed = False
_orig_open = builtins.open


def _split_env_paths(value):
    if not value:
        return []
    return [p.strip() for p in value.split(os.pathsep) if p.strip()]


def _realpath(path):
    return os.path.realpath(os.path.expanduser(str(path)))


def _mode_writes(mode):
    if mode is None:
        mode = "r"
    return any(flag in mode for flag in "wax+")


def _under_root(resolved, root):
    if not root:
        return False
    if resolved == root:
        return True
    prefix = root if root.endswith(os.sep) else root + os.sep
    return resolved.startswith(prefix)


class SandboxFSPermissionError(PermissionError):
    pass


def check_write_allowed(path, *, allow_roots, deny_paths, deny_prefixes):
    try:
        resolved = _realpath(path)
    except (OSError, ValueError):
        resolved = os.path.abspath(os.path.expanduser(str(path)))

    deny_path_set = {_realpath(p) for p in deny_paths if p}
    if resolved in deny_path_set:
        raise SandboxFSPermissionError(
            "execute_code sandbox refuses to write protected path: %s" % (path,)
        )

    for prefix in deny_prefixes:
        if not prefix:
            continue
        try:
            pref = _realpath(prefix.rstrip("/\\"))
        except (OSError, ValueError):
            pref = prefix.rstrip("/\\")
        if _under_root(resolved, pref):
            raise SandboxFSPermissionError(
                "execute_code sandbox refuses to write under protected tree: %s" % (path,)
            )

    roots = [_realpath(r) for r in allow_roots if r]
    if roots and not any(_under_root(resolved, root) for root in roots):
        raise SandboxFSPermissionError(
            "execute_code sandbox refuses to write outside allowed roots: %s" % (path,)
        )


def install(*, allow_roots=None, deny_paths=None, deny_prefixes=None):
    global _installed
    if _installed:
        return

    allow = list(allow_roots or [])
    deny_p = list(deny_paths or [])
    deny_x = list(deny_prefixes or [])

    def _guard(path):
        check_write_allowed(
            path, allow_roots=allow, deny_paths=deny_p, deny_prefixes=deny_x
        )

    def _open_guard(file, mode="r", *args, **kwargs):
        if _mode_writes(mode if isinstance(mode, str) else "r"):
            _guard(file)
        return _orig_open(file, mode, *args, **kwargs)

    builtins.open = _open_guard

    _orig_replace = getattr(os, "replace", None)
    _orig_rename = os.rename

    if _orig_replace is not None:
        def _replace_guard(src, dst, *args, **kwargs):
            _guard(dst)
            return _orig_replace(src, dst, *args, **kwargs)
        os.replace = _replace_guard

    def _rename_guard(src, dst, *args, **kwargs):
        _guard(dst)
        return _orig_rename(src, dst, *args, **kwargs)
    os.rename = _rename_guard

    try:
        import pathlib
        concrete = []
        for name in ("WindowsPath", "PosixPath"):
            cls = getattr(pathlib, name, None)
            if cls is not None:
                concrete.append(cls)
        if not concrete:
            concrete = [pathlib.Path]

        def _wrap_method(orig, path_arg_index=0, mode_arg=None):
            def _wrapped(self, *args, **kwargs):
                if mode_arg is not None:
                    mode = kwargs.get("mode", args[mode_arg] if len(args) > mode_arg else "r")
                    if _mode_writes(mode if isinstance(mode, str) else "r"):
                        _guard(str(self))
                elif path_arg_index == 0:
                    _guard(str(self))
                else:
                    target = args[path_arg_index - 1] if len(args) >= path_arg_index else kwargs.get("target")
                    _guard(str(target))
                return orig(self, *args, **kwargs)
            return _wrapped

        for cls in concrete:
            cls.open = _wrap_method(cls.open, mode_arg=0)
            cls.write_text = _wrap_method(cls.write_text)
            cls.write_bytes = _wrap_method(cls.write_bytes)
            cls.touch = _wrap_method(cls.touch)
            cls.unlink = _wrap_method(cls.unlink)
            cls.mkdir = _wrap_method(cls.mkdir)
            cls.rename = _wrap_method(cls.rename, path_arg_index=1)
            cls.replace = _wrap_method(cls.replace, path_arg_index=1)
    except Exception:
        pass

    try:
        import shutil
        for name in ("copy", "copy2", "copyfile", "move"):
            orig = getattr(shutil, name, None)
            if orig is None:
                continue
            def _make(fn):
                def _wrapped(src, dst, *args, **kwargs):
                    _guard(dst)
                    return fn(src, dst, *args, **kwargs)
                return _wrapped
            setattr(shutil, name, _make(orig))
    except Exception:
        pass

    _installed = True


def install_from_env():
    allow = _split_env_paths(os.environ.get(_ENV_ALLOW, ""))
    if not allow:
        allow = [tempfile.gettempdir()]
    install(
        allow_roots=allow,
        deny_paths=_split_env_paths(os.environ.get(_ENV_DENY_PATHS, "")),
        deny_prefixes=_split_env_paths(os.environ.get(_ENV_DENY_PREFIXES, "")),
    )
'''
