"""
LocalDesktopEnvironment — Onda 1 of "Local (desktop)".

Routes the session's file/shell to the USER'S MACHINE (the desktop app), keeping
the brain in the cloud (see the architecture-cloud-brain memory). It is a subclass
of BaseEnvironment whose `_run_bash` MARSHALS the command to the desktop executor
via an injected `exec_fn` — which, in the gateway, calls `local_exec()` (Onda 0) →
sends a `local.exec.request` down the resident executor's WS and blocks until `local.exec.result`.

Why implementing `_run_bash` + `cleanup` is enough: shell, file-ops (ShellFile-
Operations uses `cat`/`sed`/`base64` via `env.execute`) and `execute_code`
ALL converge on `env.execute()` → `_run_bash`. So by routing `_run_bash`
to the desktop, everything starts running on the user's machine — without touching
the agent loop. BaseEnvironment's machinery (snapshot, cwd, timeout) is reused, running
in the bash of the user's machine (git-bash on Windows). Native file ops
(machines without bash) is left for a later refinement.

exec_fn contract:
    exec_fn(tool: str, args: dict, timeout: int) -> dict
    tool="shell", args={cmd, login, cwd, stdin} → {output | stdout/stderr,
                                                   exit_code, error?}
"""
from __future__ import annotations

from typing import Callable

from tools.environments.base import BaseEnvironment, _ThreadedProcessHandle


def _channel_error(detail: str) -> str:
    """Local CHANNEL error (not a command error) — in unambiguous wording.

    The model needs to understand that the MACHINE did not answer, not that the
    command went wrong; otherwise it "fixes" what isn't broken and invents the rest.
    And it must NEVER conclude that the files are gone — they are on the PC, intact.
    """
    return (
        "[Work4You] Esta conversa está ligada a uma pasta do SEU COMPUTADOR e ele "
        f"não executou o comando: {detail}. Isto NÃO é falha do comando e os "
        "arquivos NÃO sumiram — o computador é que não está conectado agora. "
        "Não tente contornar, não recrie arquivos e não rode na nuvem: peça ao "
        "usuário para abrir o app Work4You e selecionar a pasta novamente."
    )


class LocalDesktopEnvironment(BaseEnvironment):
    """Remote executor = the user's local machine, via the gateway channel."""

    # stdin embedded as a heredoc in the command itself: the request/response
    # channel has no separate stdin pipe. It's the same mode Modal/Daytona use.
    _stdin_mode = "heredoc"

    def __init__(
        self,
        exec_fn: Callable[[str, dict, int], dict],
        *,
        session_key: str = "",
        cwd: str = "",
        timeout: int = 120,
        env: dict | None = None,
    ):
        super().__init__(cwd=cwd, timeout=timeout, env=env)
        self._exec_fn = exec_fn
        self._session_key = session_key

    def _run_bash(
        self,
        cmd_string: str,
        *,
        login: bool = False,
        timeout: int = 120,
        stdin_data: str | None = None,
    ):
        def _marshal():
            try:
                res = (
                    self._exec_fn(
                        "shell",
                        {
                            "cmd": cmd_string,
                            "login": login,
                            "cwd": self.cwd,
                            "stdin": stdin_data,
                        },
                        timeout,
                    )
                    or {}
                )
            except Exception as exc:  # executor died / transport error
                return (_channel_error(str(exc)), 1)
            if res.get("error"):
                # CHANNEL error (PC disconnected, folder outside the vault), NOT a
                # command error. Without that distinction the model reads it as "the
                # command failed", tries to fix it on its own and hallucinates — when
                # the truth is that the user's machine is not there.
                return (_channel_error(str(res.get("error"))), int(res.get("exit_code") or 1))
            out = res.get("output")
            if out is None:
                out = (res.get("stdout") or "") + (res.get("stderr") or "")
            return (out, int(res.get("exit_code") or 0))

        return _ThreadedProcessHandle(_marshal)

    def cleanup(self):
        # Nothing to release on the cloud side: the executor (WS + processes) lives
        # on the user's machine and has its own lifecycle.
        return
