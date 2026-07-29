"""Tests for execute_code sandbox filesystem write guard."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

import pytest

from tools.sandbox_fs_guard import (
    SandboxFSPermissionError,
    build_sandbox_fs_env,
    check_write_allowed,
    local_bootstrap_source,
)


class TestSandboxFSGuardUnit:
    def test_deny_exact_path(self, tmp_path):
        allow = [str(tmp_path / "ok")]
        (tmp_path / "ok").mkdir()
        deny = [str(tmp_path / "secret.yaml")]
        with pytest.raises(SandboxFSPermissionError):
            check_write_allowed(
                str(tmp_path / "secret.yaml"),
                allow_roots=allow,
                deny_paths=deny,
                deny_prefixes=[],
            )

    def test_deny_prefix_wayne_home(self, tmp_path):
        home = tmp_path / "wayne"
        home.mkdir()
        allow = [str(tmp_path / "proj")]
        (tmp_path / "proj").mkdir()
        with pytest.raises(SandboxFSPermissionError):
            check_write_allowed(
                str(home / "config.yaml"),
                allow_roots=allow,
                deny_paths=[],
                deny_prefixes=[str(home)],
            )

    def test_allow_under_root(self, tmp_path):
        allow = [str(tmp_path)]
        check_write_allowed(
            str(tmp_path / "out.txt"),
            allow_roots=allow,
            deny_paths=[],
            deny_prefixes=[],
        )

    def test_outside_allow_roots_denied(self, tmp_path):
        allow = [str(tmp_path / "a")]
        (tmp_path / "a").mkdir()
        with pytest.raises(SandboxFSPermissionError):
            check_write_allowed(
                str(tmp_path / "b" / "x.txt"),
                allow_roots=allow,
                deny_paths=[],
                deny_prefixes=[],
            )


class TestSandboxFSGuardViaBootstrap:
    def _run_script(self, *, proj: Path, staging: Path, script_body: str, wayne_home: Path):
        script = staging / "script.py"
        script.write_text(script_body, encoding="utf-8")

        env = os.environ.copy()
        env.update(build_sandbox_fs_env([str(proj), str(staging)]))
        env["WAYNE_HOME"] = str(wayne_home)
        env["WAYNE_SANDBOX_SCRIPT"] = str(script)
        env["PYTHONDONTWRITEBYTECODE"] = "1"
        root = str(Path(__file__).resolve().parents[2])
        env["PYTHONPATH"] = os.pathsep.join(
            [str(staging), root, env.get("PYTHONPATH", "")]
        )

        bootstrap = staging / "_bootstrap.py"
        bootstrap.write_text(local_bootstrap_source(), encoding="utf-8")

        return subprocess.run(
            [sys.executable, str(bootstrap)],
            cwd=str(proj),
            env=env,
            capture_output=True,
            text=True,
            timeout=30,
        )

    def test_child_cannot_rewrite_config_via_open(self, tmp_path, monkeypatch):
        wayne_home = tmp_path / ".wayne"
        wayne_home.mkdir()
        config = wayne_home / "config.yaml"
        config.write_text("approvals:\n  mode: manual\n", encoding="utf-8")
        monkeypatch.setenv("WAYNE_HOME", str(wayne_home))

        proj = tmp_path / "proj"
        proj.mkdir()
        staging = tmp_path / "stage"
        staging.mkdir()

        proc = self._run_script(
            proj=proj,
            staging=staging,
            wayne_home=wayne_home,
            script_body=(
                f"open(r'{config}', 'w', encoding='utf-8').write('approvals:\\n  mode: off\\n')\n"
                "print('should-not-print')\n"
            ),
        )
        assert proc.returncode != 0
        assert "should-not-print" not in proc.stdout
        combined = (proc.stderr + proc.stdout).lower()
        assert "refuses to write" in combined or "permissionerror" in combined
        assert "mode: off" not in config.read_text(encoding="utf-8")

    def test_child_cannot_rewrite_config_via_pathlib(self, tmp_path, monkeypatch):
        wayne_home = tmp_path / ".wayne"
        wayne_home.mkdir()
        config = wayne_home / "config.yaml"
        config.write_text("approvals:\n  mode: manual\n", encoding="utf-8")
        monkeypatch.setenv("WAYNE_HOME", str(wayne_home))

        proj = tmp_path / "proj"
        proj.mkdir()
        staging = tmp_path / "stage"
        staging.mkdir()

        proc = self._run_script(
            proj=proj,
            staging=staging,
            wayne_home=wayne_home,
            script_body=(
                "from pathlib import Path\n"
                f"Path(r'{config}').write_text('approvals:\\n  mode: off\\n')\n"
                "print('should-not-print')\n"
            ),
        )
        assert proc.returncode != 0
        assert "should-not-print" not in proc.stdout
        assert "mode: off" not in config.read_text(encoding="utf-8")

    def test_child_can_write_project(self, tmp_path, monkeypatch):
        wayne_home = tmp_path / ".wayne"
        wayne_home.mkdir()
        monkeypatch.setenv("WAYNE_HOME", str(wayne_home))

        proj = tmp_path / "proj"
        proj.mkdir()
        staging = tmp_path / "stage"
        staging.mkdir()
        out = proj / "hello.txt"

        proc = self._run_script(
            proj=proj,
            staging=staging,
            wayne_home=wayne_home,
            script_body=(
                f"open(r'{out}', 'w', encoding='utf-8').write('hi\\n')\n"
                "print('ok')\n"
            ),
        )
        assert proc.returncode == 0, proc.stderr
        assert "ok" in proc.stdout
        assert out.read_text(encoding="utf-8") == "hi\n"


class TestExecuteCodeIntegration:
    def test_execute_code_blocks_config_write(self, tmp_path, monkeypatch):
        wayne_home = tmp_path / ".wayne"
        wayne_home.mkdir()
        config = wayne_home / "config.yaml"
        config.write_text("approvals:\n  mode: manual\n", encoding="utf-8")
        monkeypatch.setenv("WAYNE_HOME", str(wayne_home))
        monkeypatch.setenv("TERMINAL_CWD", str(tmp_path))

        import tools.approval as approval
        import tools.code_execution_tool as cet
        from tools import terminal_tool as TT

        monkeypatch.setattr(TT, "_get_env_config", lambda: {"env_type": "local"})
        monkeypatch.setattr(
            approval,
            "check_execute_code_guard",
            lambda *a, **k: {"approved": True, "message": None},
        )
        monkeypatch.setattr(cet, "_get_execution_mode", lambda: "project")

        code = (
            "from pathlib import Path\n"
            f"Path(r'{config.as_posix()}').write_text('approvals:\\n  mode: off\\n')\n"
            "print('wrote')\n"
        )
        result = json.loads(cet.execute_code(code=code, task_id="test-fs-guard"))

        assert "mode: off" not in config.read_text(encoding="utf-8")
        assert result.get("status") != "success" or "wrote" not in (
            result.get("output") or ""
        )
        blob = json.dumps(result).lower()
        assert (
            "permission" in blob
            or "refuses to write" in blob
            or result.get("status") in ("error", "failed")
            or result.get("exit_code", 0) != 0
        )
