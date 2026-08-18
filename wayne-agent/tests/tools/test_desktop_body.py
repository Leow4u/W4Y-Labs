"""F3: Fly brain → Electron body path joining and RPC wait."""

import json
import threading

from tools.approval import reset_current_session_key, set_current_session_key
from tools import desktop_body as body


def setup_function():
    body._cwd_by_session.clear()
    body._notify_cbs.clear()
    body._pending.clear()


def test_normalize_desktop_cwd_accepts_pc_rejects_fly():
    assert body.normalize_desktop_cwd(r"C:\Users\x\repo") == r"C:\Users\x\repo"
    assert body.normalize_desktop_cwd("D:/code/app") == "D:/code/app"
    assert body.normalize_desktop_cwd(r"\\server\share\x") == r"\\server\share\x"
    assert body.normalize_desktop_cwd("/Users/x/proj") == "/Users/x/proj"
    assert body.normalize_desktop_cwd("/home/x/proj") == "/home/x/proj"
    assert body.normalize_desktop_cwd("/opt/data/projects/acme") == ""
    assert body.normalize_desktop_cwd("") == ""
    assert body.normalize_desktop_cwd(None) == ""


def test_join_desktop_path_windows_and_escape():
    root = r"C:\Users\x\repo"
    assert body.join_desktop_path(root, "README.md") == r"C:\Users\x\repo\README.md"
    assert body.join_desktop_path(root, r"C:\Users\x\repo\src\a.py") == r"C:\Users\x\repo\src\a.py"
    try:
        body.join_desktop_path(root, r"..\..\Windows\system32")
        assert False, "expected escape"
    except ValueError as exc:
        assert "escapes" in str(exc)


def test_join_desktop_path_posix():
    root = "/Users/x/proj"
    assert body.join_desktop_path(root, "a.txt") == "/Users/x/proj/a.txt"
    try:
        body.join_desktop_path(root, "/etc/passwd")
        assert False, "expected escape"
    except ValueError:
        pass


def test_try_desktop_body_none_without_cwd():
    token = set_current_session_key("sess-a")
    try:
        assert body.try_desktop_body("read_file", {"path": "a.txt"}) is None
    finally:
        reset_current_session_key(token)


def test_call_desktop_body_request_and_respond():
    token = set_current_session_key("sess-b")
    body.set_desktop_cwd("sess-b", r"C:\Users\x\repo")
    seen = []

    def notify(data):
        seen.append(data)
        threading.Thread(
            target=lambda: body.resolve_desktop_body(
                data["request_id"],
                {"ok": True, "result": {"content": "hello", "path": data["args"]["path"]}},
            ),
            daemon=True,
        ).start()

    body.register_desktop_body_notify("sess-b", notify)
    try:
        raw = body.try_desktop_body("read_file", {"path": "hello.txt"})
        assert raw is not None
        parsed = json.loads(raw)
        assert parsed["content"] == "hello"
        assert parsed["path"].endswith("hello.txt")
        assert seen[0]["op"] == "read_file"
        assert seen[0]["desktop_cwd"] == r"C:\Users\x\repo"
    finally:
        body.unregister_desktop_body("sess-b")
        body.clear_desktop_cwd("sess-b")
        reset_current_session_key(token)


def test_escape_returns_error_json_not_none():
    token = set_current_session_key("sess-c")
    body.set_desktop_cwd("sess-c", r"C:\Users\x\repo")
    body.register_desktop_body_notify("sess-c", lambda data: None)
    try:
        raw = body.try_desktop_body("write_file", {"path": r"..\secret.txt", "content": "x"})
        assert raw is not None
        parsed = json.loads(raw)
        assert "error" in parsed
        assert "escapes" in parsed["error"]
    finally:
        body.unregister_desktop_body("sess-c")
        body.clear_desktop_cwd("sess-c")
        reset_current_session_key(token)
