"""The sensitive-file edit floor: credentials and repo internals always ask.

``acp_adapter/edit_approval.py`` refused to auto-approve edits to .env files,
SSH keys, and .git internals "even under autonomous policies", but that rule
only ever ran for ACP clients — the requester is bound in a ContextVar for the
length of one ACP run. CLI, gateway, and desktop sessions left it unset and
rewrote those files with no prompt in any mode, because ``file_tools`` has no
approval gate of its own.

These tests pin the contract that matters: the ask survives YOLO and
``approvals.mode: off``, and it is the same rule on both surfaces.
"""

import os

import pytest

from tools.approval import (
    check_sensitive_edit_approval,
    extract_edit_paths,
    is_sensitive_edit_path,
)


def _clear_approval_state():
    from tools import approval as mod

    mod._gateway_queues.clear()
    mod._gateway_notify_cbs.clear()
    mod._session_approved.clear()
    mod._permanent_approved.clear()
    mod._pending.clear()
    mod._session_yolo.clear()


class TestSensitivePathRule:
    @pytest.mark.parametrize(
        "path",
        [
            ".env",
            "project/.env",
            "project/.env.local",
            "project/.env.production",
            # The ACP list enumerated three .env spellings; everything else
            # sailed through, so a staging secrets file was fair game.
            "project/.env.staging",
            "~/.ssh/config",
            "repo/.git/config",
            "keys/id_rsa",
            "keys/id_ed25519",
        ],
    )
    def test_asks_for_credentials_and_repo_internals(self, path):
        assert is_sensitive_edit_path(path) is True

    @pytest.mark.parametrize(
        "path",
        ["src/app.py", "README.md", "config/settings.yaml", "environment.ts", "docs/.envrc.md"],
    )
    def test_ordinary_files_pass(self, path):
        assert is_sensitive_edit_path(path) is False

    def test_acp_and_core_share_one_rule(self):
        """The ACP adapter must not keep a second, narrower copy of the list."""
        from acp_adapter.edit_approval import _is_sensitive_auto_approve_path

        assert _is_sensitive_auto_approve_path("project/.env.staging") is True
        assert _is_sensitive_auto_approve_path("src/app.py") is False


class TestEditPathExtraction:
    def test_write_file(self):
        assert extract_edit_paths("write_file", {"path": ".env", "content": "x"}) == [".env"]

    def test_patch_replace(self):
        args = {"path": "src/app.py", "old_string": "a", "new_string": "b"}
        assert extract_edit_paths("patch", args) == ["src/app.py"]

    def test_patch_v4a_reads_the_body(self):
        body = "*** Update File: .env\n*** Add File: src/new.py\n"
        assert extract_edit_paths("patch", {"mode": "patch", "patch": body}) == [".env", "src/new.py"]

    def test_tools_that_do_not_write_files(self):
        assert extract_edit_paths("read_file", {"path": ".env"}) == []


class TestFloorSurvivesBypass:
    """The point of the floor: YOLO buys unattended work, not silent secrets."""

    SESSION_KEY = "sensitive-edit-test-session"

    def setup_method(self):
        _clear_approval_state()
        self._saved = {
            k: os.environ.get(k)
            for k in ("WAYNE_GATEWAY_SESSION", "WAYNE_SESSION_KEY", "WAYNE_CRON_SESSION")
        }
        os.environ["WAYNE_GATEWAY_SESSION"] = "1"
        os.environ["WAYNE_SESSION_KEY"] = self.SESSION_KEY
        os.environ.pop("WAYNE_CRON_SESSION", None)

    def teardown_method(self):
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        _clear_approval_state()

    def _answer(self, choice):
        """Register a gateway notifier that answers *choice* immediately."""
        from tools.approval import register_gateway_notify, resolve_gateway_approval

        seen = []

        def _notify(approval_data):
            seen.append(approval_data)
            resolve_gateway_approval(self.SESSION_KEY, choice)

        register_gateway_notify(self.SESSION_KEY, _notify)
        return seen

    def test_env_edit_asks_even_with_session_yolo_armed(self):
        from tools.approval import enable_session_yolo

        enable_session_yolo(self.SESSION_KEY)
        seen = self._answer("deny")

        result = check_sensitive_edit_approval("write_file", {"path": ".env", "content": "KEY=1"})

        assert seen, "bypass swallowed the prompt instead of asking"
        assert result["approved"] is False

    def test_env_edit_asks_with_approvals_mode_off(self, monkeypatch):
        monkeypatch.setattr("tools.approval._get_approval_mode", lambda: "off")
        seen = self._answer("deny")

        result = check_sensitive_edit_approval("write_file", {"path": ".env", "content": "KEY=1"})

        assert seen
        assert result["approved"] is False

    def test_approving_lets_the_edit_through(self):
        self._answer("once")

        result = check_sensitive_edit_approval("write_file", {"path": ".env", "content": "KEY=1"})

        assert result["approved"] is True

    def test_ordinary_file_never_prompts(self):
        seen = self._answer("deny")

        result = check_sensitive_edit_approval("write_file", {"path": "src/app.py", "content": "x"})

        assert result["approved"] is True
        assert seen == []

    def test_always_does_not_persist_past_the_session(self):
        """A permanent allowlist entry would carry the bypass across restarts."""
        from tools import approval as mod

        self._answer("always")

        assert check_sensitive_edit_approval("write_file", {"path": ".env", "content": "x"})["approved"]
        assert not mod._permanent_approved

    def test_session_approval_is_scoped_to_the_file_the_user_saw(self):
        seen = self._answer("session")

        assert check_sensitive_edit_approval("write_file", {"path": ".env", "content": "x"})["approved"]
        # A second, different secret has to ask again.
        check_sensitive_edit_approval("write_file", {"path": "keys/id_rsa", "content": "x"})
        assert len(seen) == 2

    def test_denied_env_write_does_not_reach_disk_through_dispatch(self, tmp_path):
        """End to end: YOLO armed, the agent calls write_file, the user says no."""
        import json

        from model_tools import handle_function_call
        from tools.approval import enable_session_yolo

        target = tmp_path / ".env"
        target.write_text("SECRET=original\n", encoding="utf-8")

        enable_session_yolo(self.SESSION_KEY)
        seen = self._answer("deny")

        raw = handle_function_call(
            "write_file",
            {"path": str(target), "content": "SECRET=stolen\n"},
            task_id="sensitive-edit-e2e",
        )

        assert seen, "the agent wrote to a .env under YOLO without asking"
        assert "error" in json.loads(raw)
        assert target.read_text(encoding="utf-8") == "SECRET=original\n"

    def test_cron_cannot_answer_so_it_is_blocked(self):
        os.environ["WAYNE_CRON_SESSION"] = "1"

        result = check_sensitive_edit_approval("write_file", {"path": ".env", "content": "x"})

        assert result["approved"] is False
        assert "cron" in result["message"].lower()
