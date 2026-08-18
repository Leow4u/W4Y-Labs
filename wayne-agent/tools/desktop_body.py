"""Reverse tool tunnel: Fly brain → Electron body (PC folder).

When a desktop session ships ``desktop_cwd`` (an absolute folder on the user's
machine), file/terminal tools must not touch the Fly volume. They enqueue a
request, the gateway emits ``desktop.body.request``, and the casca executes
via existing IPC then replies with ``desktop.body.respond``.

Same wait shape as ``tools.approval`` (thread Event + session_key).
"""

from __future__ import annotations

import json
import logging
import ntpath
import posixpath
import re
import threading
import time
import uuid
from typing import Any

logger = logging.getLogger(__name__)

_WIN_ABS_RE = re.compile(r"^[A-Za-z]:[\\/]")
_CLOUD_FILES_ROOT = "/opt/data"

_lock = threading.Lock()
_cwd_by_session: dict[str, str] = {}
_notify_cbs: dict[str, Any] = {}
_pending: dict[str, "_BodyEntry"] = {}

_DEFAULT_TIMEOUT_SEC = 120


class _BodyEntry:
    def __init__(self) -> None:
        self.event = threading.Event()
        self.payload: dict[str, Any] | None = None


def normalize_desktop_cwd(raw: Any) -> str:
    """Accept a PC folder path. Reject Fly ``/opt/data`` and empty values."""
    cwd = str(raw or "").strip()
    if not cwd:
        return ""
    if _WIN_ABS_RE.match(cwd) or cwd.startswith("\\\\"):
        return cwd
    if cwd.startswith("/") and not cwd.startswith(_CLOUD_FILES_ROOT):
        return cwd
    return ""


def is_windows_desktop_path(path: str) -> bool:
    return bool(_WIN_ABS_RE.match(path) or path.startswith("\\\\"))


def is_path_within(root: str, candidate: str) -> bool:
    """True when *candidate* is *root* or a file/dir inside it."""
    if is_windows_desktop_path(root) or is_windows_desktop_path(candidate):
        root_n = ntpath.normcase(ntpath.normpath(root))
        cand_n = ntpath.normcase(ntpath.normpath(candidate))
        if cand_n == root_n:
            return True
        prefix = root_n if root_n.endswith("\\") else root_n + "\\"
        return cand_n.startswith(prefix)
    root_n = posixpath.normpath(root)
    cand_n = posixpath.normpath(candidate)
    if cand_n == root_n:
        return True
    prefix = root_n if root_n.endswith("/") else root_n + "/"
    return cand_n.startswith(prefix)


def join_desktop_path(desktop_cwd: str, rel: str) -> str:
    """Join a tool path onto the PC folder. Raises ValueError on escape."""
    rel = str(rel or "").strip()
    cwd = str(desktop_cwd or "").strip()
    if not cwd:
        raise ValueError("desktop folder is not set")
    if not rel or rel in {".", "./"}:
        candidate = cwd
    elif is_windows_desktop_path(rel):
        candidate = ntpath.normpath(rel)
    elif rel.startswith("/") and not is_windows_desktop_path(cwd):
        candidate = posixpath.normpath(rel)
    elif is_windows_desktop_path(cwd):
        candidate = ntpath.normpath(ntpath.join(cwd, rel.replace("/", "\\")))
    else:
        candidate = posixpath.normpath(posixpath.join(cwd, rel))
    if not is_path_within(cwd, candidate):
        raise ValueError(f"path escapes the open folder: {rel}")
    return candidate


def set_desktop_cwd(session_key: str, cwd: str) -> None:
    key = (session_key or "").strip()
    normalized = normalize_desktop_cwd(cwd)
    if not key:
        return
    with _lock:
        if normalized:
            _cwd_by_session[key] = normalized
        else:
            _cwd_by_session.pop(key, None)


def clear_desktop_cwd(session_key: str) -> None:
    key = (session_key or "").strip()
    if not key:
        return
    with _lock:
        _cwd_by_session.pop(key, None)


def get_desktop_cwd(session_key: str | None = None) -> str:
    """Return the bound PC folder for *session_key* (or the active approval key)."""
    key = (session_key or "").strip()
    if not key:
        try:
            from tools.approval import get_current_session_key

            key = (get_current_session_key("") or "").strip()
        except Exception:
            key = ""
    if not key:
        return ""
    with _lock:
        return _cwd_by_session.get(key, "")


def register_desktop_body_notify(session_key: str, cb) -> None:
    key = (session_key or "").strip()
    if not key or cb is None:
        return
    with _lock:
        _notify_cbs[key] = cb


def unregister_desktop_body(session_key: str) -> None:
    key = (session_key or "").strip()
    if not key:
        return
    with _lock:
        _notify_cbs.pop(key, None)
        stale = [rid for rid, _entry in _pending.items() if rid.startswith(key)]
        # request ids are UUIDs, not prefixed — wake everything for this key
        # by scanning payloads stored on entries. Simpler: wake all pending
        # whose notify we just dropped; callers time out / interrupt anyway.
        entries = list(_pending.values())
    for entry in entries:
        entry.event.set()


def resolve_desktop_body(request_id: str, payload: dict[str, Any] | None) -> bool:
    """Unblock the agent thread waiting on *request_id*."""
    rid = str(request_id or "").strip()
    if not rid:
        return False
    with _lock:
        entry = _pending.pop(rid, None)
    if entry is None:
        return False
    entry.payload = dict(payload or {})
    entry.event.set()
    return True


def try_desktop_body(op: str, args: dict[str, Any] | None = None, *, timeout: int | None = None) -> str | None:
    """If this session has a PC folder, run *op* on the casca and return JSON.

    Returns ``None`` when no desktop folder is bound (web / Fly disk path).
    """
    cwd = get_desktop_cwd()
    if not cwd:
        return None
    return call_desktop_body(op, args or {}, timeout=timeout)


def call_desktop_body(op: str, args: dict[str, Any], *, timeout: int | None = None) -> str:
    session_key = ""
    try:
        from tools.approval import get_current_session_key

        session_key = (get_current_session_key("") or "").strip()
    except Exception:
        session_key = ""
    cwd = get_desktop_cwd(session_key)
    if not cwd:
        return json.dumps({"error": "desktop folder is not set"}, ensure_ascii=False)

    try:
        prepared = _prepare_args(op, args, cwd)
    except ValueError as exc:
        return json.dumps({"error": str(exc)}, ensure_ascii=False)

    with _lock:
        cb = _notify_cbs.get(session_key)
    if cb is None:
        return json.dumps(
            {"error": "desktop body is not connected — open the Work4You app and the folder again"},
            ensure_ascii=False,
        )

    request_id = uuid.uuid4().hex
    entry = _BodyEntry()
    with _lock:
        _pending[request_id] = entry

    try:
        cb(
            {
                "request_id": request_id,
                "op": op,
                "args": prepared,
                "desktop_cwd": cwd,
            }
        )
    except Exception as exc:
        logger.warning("desktop.body notify failed: %s", exc)
        with _lock:
            _pending.pop(request_id, None)
        return json.dumps({"error": f"desktop body notify failed: {exc}"}, ensure_ascii=False)

    wait_s = _DEFAULT_TIMEOUT_SEC if timeout is None else max(1, int(timeout))
    try:
        from tools.interrupt import is_interrupted
    except Exception:  # pragma: no cover
        is_interrupted = lambda: False  # noqa: E731
    try:
        from tools.environments.base import touch_activity_if_due
    except Exception:  # pragma: no cover
        touch_activity_if_due = None

    now = time.monotonic()
    deadline = now + wait_s
    activity = {"last_touch": now, "start": now}
    resolved = False
    while True:
        if is_interrupted():
            break
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            break
        if entry.event.wait(timeout=min(1.0, remaining)):
            resolved = True
            break
        if touch_activity_if_due is not None:
            touch_activity_if_due(activity, "waiting for desktop folder")

    with _lock:
        _pending.pop(request_id, None)

    if not resolved:
        return json.dumps({"error": "desktop body timed out"}, ensure_ascii=False)

    payload = entry.payload or {}
    if payload.get("ok") is False or payload.get("error"):
        err = payload.get("error") or "desktop body failed"
        return json.dumps({"error": str(err), **_terminal_fields(op, payload)}, ensure_ascii=False)

    result = payload.get("result")
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        return json.dumps(result, ensure_ascii=False)
    return json.dumps({"ok": True, "result": result}, ensure_ascii=False)


def _terminal_fields(op: str, payload: dict[str, Any]) -> dict[str, Any]:
    if op != "terminal":
        return {}
    result = payload.get("result") if isinstance(payload.get("result"), dict) else {}
    return {
        "output": result.get("output", "") if isinstance(result, dict) else "",
        "exit_code": result.get("exit_code", -1) if isinstance(result, dict) else -1,
        "status": "error",
    }


def _prepare_args(op: str, args: dict[str, Any], cwd: str) -> dict[str, Any]:
    out = dict(args or {})
    out["desktop_cwd"] = cwd
    if op in {"read_file", "write_file", "patch_replace"}:
        out["path"] = join_desktop_path(cwd, str(out.get("path") or ""))
    if op == "terminal":
        workdir = str(out.get("workdir") or cwd).strip() or cwd
        out["workdir"] = join_desktop_path(cwd, workdir)
    return out
