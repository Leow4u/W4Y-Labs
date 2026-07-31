"""Welcome banner, ASCII art, skills summary, and update check for the CLI.

Pure display functions with no WayneCLI state dependency.
"""

import logging
import os
import shutil
import subprocess
import threading
from pathlib import Path
from wayne_constants import get_wayne_home
from typing import TYPE_CHECKING, Dict, List, Optional

# rich and prompt_toolkit are imported lazily (inside the functions that use
# them) rather than at module level.  Importing this module is on the TUI
# gateway's critical startup path purely to reach the lightweight update-check
# helpers (``prefetch_update_check``); pulling rich.console + prompt_toolkit
# eagerly added ~50ms of wasted imports before ``gateway.ready`` could fire.
# Keep the type-only reference available to checkers without the runtime cost.
if TYPE_CHECKING:
    from rich.console import Console

logger = logging.getLogger(__name__)


# =========================================================================
# ANSI building blocks for conversation display
# =========================================================================

_GOLD = "\033[1;38;2;255;215;0m"  # True-color #FFD700 bold
_BOLD = "\033[1m"
_DIM = "\033[2m"
_RST = "\033[0m"


def cprint(text: str):
    """Print ANSI-colored text through prompt_toolkit's renderer."""
    from prompt_toolkit import print_formatted_text as _pt_print
    from prompt_toolkit.formatted_text import ANSI as _PT_ANSI
    _pt_print(_PT_ANSI(text))


# =========================================================================
# Skin-aware color helpers
# =========================================================================

def _skin_color(key: str, fallback: str) -> str:
    """Get a color from the active skin, or return fallback."""
    try:
        from wayne_cli.skin_engine import get_active_skin
        return get_active_skin().get_color(key, fallback)
    except Exception:
        return fallback
# =========================================================================
# ASCII Art & Branding
# =========================================================================

from wayne_cli import __version__ as VERSION, __release_date__ as RELEASE_DATE

# Compact W4Y monogram — real ANSI-Shadow W (not K-shaped) + 4 + Y.
W4Y_MARK = """[bold #FF7A2E]██╗    ██╗██╗  ██╗██╗   ██╗[/]
[bold #FF7A2E]██║    ██║██║  ██║╚██╗ ██╔╝[/]
[#FF8C42]██║ █╗ ██║███████║ ╚████╔╝ [/]
[#FF8C42]██║███╗██║╚════██║  ╚██╔╝  [/]
[#E86A1F]╚███╔███╔╝     ██║   ██║   [/]
[#E86A1F] ╚══╝╚══╝      ╚═╝   ╚═╝   [/]"""

W4Y_TAGLINE = "O teu agente no terminal"

# Back-compat aliases (skins/docs/tests may still import old names).
WORK4YOU_LOGO = W4Y_MARK
WAYNE_AGENT_LOGO = W4Y_MARK
WAYNE_CADUCEUS = W4Y_MARK


# =========================================================================
# Skills scanning
# =========================================================================

def get_available_skills() -> Dict[str, List[str]]:
    """Return skills grouped by category, filtered by platform and disabled state.

    Delegates to ``_find_all_skills()`` from ``tools/skills_tool`` which already
    handles platform gating (``platforms:`` frontmatter) and respects the
    user's ``skills.disabled`` config list.
    """
    try:
        from tools.skills_tool import _find_all_skills
        all_skills = _find_all_skills()  # already filtered
    except Exception:
        return {}

    skills_by_category: Dict[str, List[str]] = {}
    for skill in all_skills:
        category = skill.get("category") or "general"
        skills_by_category.setdefault(category, []).append(skill["name"])
    return skills_by_category


# =========================================================================
# Update check — DISABLED in the W4Y fork
# =========================================================================
#
# Upstream Hermes compares the local checkout / installed version against
# github.com/NousResearch/hermes-agent (git ls-remote) and PyPI, and the
# companion `wayne update` command then downloads and applies that UPSTREAM
# code over the checkout. In this fork that would overwrite Wayne with Nous
# code, so the whole check is a quiet no-op: every probe below returns None
# ("nothing to report") and the banner/TUI/dashboard render no update badge.
# Wayne updates ship exclusively via the W4Y platform deploy flow.

# Sentinel returned when we know an update exists but can't count commits
# (e.g. nix-built wayne — no local git history to count against). Kept for
# API compatibility with render paths; never produced while the check is
# disabled.
UPDATE_AVAILABLE_NO_COUNT = -1


def _check_via_rev(local_rev: str) -> Optional[int]:
    """Disabled in the W4Y fork — never probes upstream.

    Upstream Hermes ran ``git ls-remote`` against
    github.com/NousResearch/hermes-agent here. Returns ``None`` ("check
    doesn't apply") unconditionally, without any network access.
    """
    return None


def _check_via_local_git(repo_dir: Path) -> Optional[int]:
    """Disabled in the W4Y fork — never fetches or counts commits.

    Upstream Hermes fetched origin and counted commits behind origin/main
    here. Returns ``None`` unconditionally, without touching git or the
    network.
    """
    return None


def _version_tuple(v: str) -> tuple[int, ...]:
    """Parse '0.13.0' into (0, 13, 0) for comparison. Non-numeric segments become 0."""
    parts = []
    for segment in v.split("."):
        try:
            parts.append(int(segment))
        except ValueError:
            parts.append(0)
    return tuple(parts)


def _fetch_pypi_latest(package: str = "wayne-agent") -> Optional[str]:
    """Disabled in the W4Y fork — never queries PyPI.

    The upstream "wayne-agent"/"hermes-agent" PyPI package is not this
    fork's code, so comparing against (or installing from) it would be
    wrong. Returns ``None`` unconditionally, without any network access.
    """
    return None


def check_via_pypi() -> Optional[int]:
    """Disabled in the W4Y fork — reports "nothing to check" (None)."""
    return None


def check_for_updates() -> Optional[int]:
    """Check whether a Wayne update is available — disabled in the W4Y fork.

    Always returns ``None`` ("check doesn't apply"), quietly and without
    touching git, PyPI, or the on-disk cache. All render paths — the Rich
    banner (build_welcome_banner), the Ink TUI badge (branding.tsx), and
    the dashboard's `/api/wayne/update/check` endpoint — treat ``None`` as
    "no update available" and show nothing. Updates ship via the W4Y
    platform deploy flow.
    """
    return None


def _resolve_repo_dir() -> Optional[Path]:
    """Return the active Wayne git checkout, or None if this isn't a git install.

    Prefers the running code's location over the profile-scoped path
    because ``$WAYNE_HOME/wayne-agent/`` may be a stale copy carried
    over by ``--clone-all``.
    """
    repo_dir = Path(__file__).parent.parent.resolve()
    if not (repo_dir / ".git").exists():
        wayne_home = get_wayne_home()
        repo_dir = wayne_home / "wayne-agent"
    return repo_dir if (repo_dir / ".git").exists() else None


def _git_short_hash(repo_dir: Path, rev: str) -> Optional[str]:
    """Resolve a git revision to an 8-character short hash."""
    try:
        result = subprocess.run(
            ["git", "rev-parse", "--short=8", rev],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=str(repo_dir),
        )
    except Exception:
        return None
    if result.returncode != 0:
        return None
    value = (result.stdout or "").strip()
    return value or None


def get_git_banner_state(repo_dir: Optional[Path] = None) -> Optional[dict]:
    """Return upstream/local git hashes for the startup banner.

    For source installs and dev images this runs ``git rev-parse`` against
    the active checkout.  When no checkout is available — the canonical case
    is the published Docker image, which excludes ``.git`` from the build
    context — we fall back to the baked-in build SHA (see
    ``wayne_cli/build_info.py``) and return it as a frozen
    ``upstream == local`` state with ``ahead=0``.  A built image is by
    definition pinned to one commit, so "ahead" is always zero and the
    banner correctly shows ``· upstream <sha>`` with no carried-commits
    annotation.
    """
    repo_dir = repo_dir or _resolve_repo_dir()
    if repo_dir is None:
        # No git checkout — try the baked build SHA (Docker image path).
        try:
            from wayne_cli.build_info import get_build_sha
            baked = get_build_sha(short=8)
            if baked:
                return {"upstream": baked, "local": baked, "ahead": 0}
        except Exception:
            pass
        return None

    upstream = _git_short_hash(repo_dir, "origin/main")
    local = _git_short_hash(repo_dir, "HEAD")
    if not upstream or not local:
        # Live-git lookup failed (e.g. shallow clone without origin/main).
        # Fall back to the baked build SHA if available.
        try:
            from wayne_cli.build_info import get_build_sha
            baked = get_build_sha(short=8)
            if baked:
                return {"upstream": baked, "local": baked, "ahead": 0}
        except Exception:
            pass
        return None

    ahead = 0
    try:
        result = subprocess.run(
            ["git", "rev-list", "--count", "origin/main..HEAD"],
            capture_output=True,
            text=True,
            timeout=5,
            cwd=str(repo_dir),
        )
        if result.returncode == 0:
            ahead = int((result.stdout or "0").strip() or "0")
    except Exception:
        ahead = 0

    return {"upstream": upstream, "local": local, "ahead": max(ahead, 0)}


_RELEASE_URL_BASE = "https://github.com/NousResearch/hermes-agent/releases/tag"
_latest_release_cache: Optional[tuple] = None  # (tag, url) once resolved


def get_latest_release_tag(repo_dir: Optional[Path] = None) -> Optional[tuple]:
    """Return ``(tag, release_url)`` for the latest git tag, or None.

    Local-only — runs ``git describe --tags --abbrev=0`` against the
    Wayne checkout. Cached per-process. Release URL always points at the
    canonical NousResearch/hermes-agent repo (forks don't get a link).
    """
    global _latest_release_cache
    if _latest_release_cache is not None:
        return _latest_release_cache or None

    repo_dir = repo_dir or _resolve_repo_dir()
    if repo_dir is None:
        _latest_release_cache = ()  # falsy sentinel — skip future lookups
        return None

    try:
        result = subprocess.run(
            ["git", "describe", "--tags", "--abbrev=0"],
            capture_output=True,
            text=True,
            timeout=3,
            cwd=str(repo_dir),
        )
    except Exception:
        _latest_release_cache = ()
        return None

    if result.returncode != 0:
        _latest_release_cache = ()
        return None

    tag = (result.stdout or "").strip()
    if not tag:
        _latest_release_cache = ()
        return None

    url = f"{_RELEASE_URL_BASE}/{tag}"
    _latest_release_cache = (tag, url)
    return _latest_release_cache


def format_banner_version_label() -> str:
    """Return the version label shown in the startup banner title."""
    base = f"Work4You v{VERSION} ({RELEASE_DATE})"
    state = get_git_banner_state()
    if not state:
        return base

    upstream = state["upstream"]
    local = state["local"]
    ahead = int(state.get("ahead") or 0)

    if ahead <= 0 or upstream == local:
        return f"{base} · upstream {upstream}"

    carried_word = "commit" if ahead == 1 else "commits"
    return f"{base} · upstream {upstream} · local {local} (+{ahead} carried {carried_word})"


# =========================================================================
# Non-blocking update check
# =========================================================================

_update_result: Optional[int] = None
_update_check_done = threading.Event()


def prefetch_update_check():
    """Kick off update check in a background daemon thread."""
    def _run():
        global _update_result
        _update_result = check_for_updates()
        _update_check_done.set()
    t = threading.Thread(target=_run, daemon=True)
    t.start()


def get_update_result(timeout: float = 0.5) -> Optional[int]:
    """Get result of prefetched check. Returns None if not ready."""
    _update_check_done.wait(timeout=timeout)
    return _update_result


# =========================================================================
# Welcome banner
# =========================================================================

def _format_context_length(tokens: int) -> str:
    """Format a token count for display (e.g. 128000 → '128K', 1048576 → '1M')."""
    if tokens >= 1_000_000:
        val = tokens / 1_000_000
        rounded = round(val)
        if abs(val - rounded) < 0.05:
            return f"{rounded}M"
        return f"{val:.1f}M"
    elif tokens >= 1_000:
        val = tokens / 1_000
        rounded = round(val)
        if abs(val - rounded) < 0.05:
            return f"{rounded}K"
        return f"{val:.1f}K"
    return str(tokens)


def _display_toolset_name(toolset_name: str) -> str:
    """Normalize internal/legacy toolset identifiers for banner display."""
    if not toolset_name:
        return "unknown"
    return (
        toolset_name[:-6]
        if toolset_name.endswith("_tools")
        else toolset_name
    )


def build_welcome_banner(console: "Console", model: str, cwd: str,
                         tools: List[dict] = None,
                         enabled_toolsets: List[str] = None,
                         session_id: str = None,
                         get_toolset_for_tool=None,
                         context_length: int = None,
                         provider: str = None):
    """Print a Claude-style welcome panel: one box, short tips, no tool dump.

    Left: greeting + W4Y mark + model/cwd/session.
    Right: getting-started tips + compact status (counts, MCP, alerts).
    """
    from model_tools import check_tool_availability, TOOLSET_REQUIREMENTS
    from rich.panel import Panel
    from rich.table import Table
    if get_toolset_for_tool is None:
        from model_tools import get_toolset_for_tool

    tools = tools or []
    enabled_toolsets = enabled_toolsets or []

    _, unavailable_toolsets = check_tool_availability(quiet=True)
    # Restrict unavailable toolsets to those enabled for this agent so global
    # registry noise (discord/feishu on CLI) never leaks into the banner.
    _enabled_ts = {str(t) for t in enabled_toolsets}
    if _enabled_ts:
        unavailable_toolsets = [
            item for item in unavailable_toolsets
            if str(item.get("id", item.get("name", ""))) in _enabled_ts
        ]
    disabled_tools = set()
    lazy_tools = set()
    for item in unavailable_toolsets:
        toolset_name = item.get("name", "")
        ts_req = TOOLSET_REQUIREMENTS.get(toolset_name, {})
        tools_in_ts = item.get("tools", [])
        if ts_req.get("check_fn"):
            lazy_tools.update(tools_in_ts)
        else:
            disabled_tools.update(tools_in_ts)

    accent = _skin_color("banner_accent", "#FFBF00")
    dim = _skin_color("banner_dim", "#B8860B")
    text = _skin_color("banner_text", "#FFF8DC")
    session_color = _skin_color("session_border", "#8B8682")
    title_color = _skin_color("banner_title", "#FFD700")
    border_color = _skin_color("banner_border", "#CD7F32")

    try:
        from wayne_cli.skin_engine import get_active_skin
        _bskin = get_active_skin()
        _hero = _bskin.banner_hero if getattr(_bskin, "banner_hero", None) else W4Y_MARK
    except Exception:
        _bskin = None
        _hero = W4Y_MARK

    # ── Left: greeting + mark + session meta ─────────────────────────────
    try:
        import getpass
        _user = (getpass.getuser() or "").strip()
    except Exception:
        _user = ""
    _first = _user.split("\\")[-1].split()[0] if _user else ""
    if _first:
        greet = f"[bold {text}]Olá, {_first[:1].upper() + _first[1:]}![/]"
    else:
        greet = f"[bold {text}]Bem-vindo![/]"

    left_lines = [greet, "", _hero, ""]

    if (provider or "").strip().lower() == "moa":
        preset_name = model
        agg_label = ""
        try:
            from wayne_cli.config import load_config
            from wayne_cli.moa_config import normalize_moa_config

            _moa = normalize_moa_config(load_config().get("moa") or {})
            _preset = _moa.get("presets", {}).get(preset_name)
            if _preset:
                _agg = _preset.get("aggregator") or {}
                _am = str(_agg.get("model") or "")
                agg_label = _am.split("/")[-1] if "/" in _am else _am
        except Exception:
            agg_label = ""
        if len(preset_name) > 28:
            preset_name = preset_name[:25] + "..."
        meta = f"[{accent}]MoA: {preset_name}[/]"
        if agg_label:
            meta += f" [dim {dim}]·[/] [dim {dim}]agg {agg_label}[/]"
        if context_length:
            meta += f" [dim {dim}]·[/] [dim {dim}]{_format_context_length(context_length)} context[/]"
        left_lines.append(meta)
    else:
        model_short = model.split("/")[-1] if "/" in model else model
        if model_short.endswith(".gguf"):
            model_short = model_short[:-5]
        if len(model_short) > 36:
            model_short = model_short[:33] + "..."
        meta = f"[{accent}]{model_short}[/]"
        if context_length:
            meta += f" [dim {dim}]·[/] [dim {dim}]{_format_context_length(context_length)} context[/]"
        left_lines.append(meta)

    if os.getenv("WAYNE_YOLO_MODE"):
        left_lines.append(f"[bold red]⚠ YOLO mode[/] [dim {dim}]— approvals bypassed[/]")
    left_lines.append(f"[dim {dim}]{cwd}[/]")
    if session_id:
        left_lines.append(f"[dim {session_color}]{session_id}[/]")

    # ── Right: tips + compact status (no tool/skill dump) ─────────────────
    right_lines = [
        f"[bold {accent}]Para começar[/]",
        f"[{text}]·[/] [dim {dim}]/help[/] [{text}]— comandos[/]",
        f"[{text}]·[/] [dim {dim}]/tools[/] [{text}]— ferramentas[/]",
        f"[{text}]·[/] [dim {dim}]/skills[/] [{text}]— skills[/]",
        "",
        f"[bold {accent}]Estado[/]",
    ]

    _skills_enabled = (not _enabled_ts) or ("skills" in _enabled_ts)
    if _skills_enabled:
        skills_by_category = get_available_skills()
        total_skills = sum(len(s) for s in skills_by_category.values())
    else:
        skills_by_category = {}
        total_skills = 0

    # Compact toolset names (normalized) for status — never dump every tool.
    toolsets_seen: list = []
    _seen = set()
    for tool in tools:
        tool_name = tool["function"]["name"]
        display = _display_toolset_name(get_toolset_for_tool(tool_name) or "other")
        if display not in _seen:
            _seen.add(display)
            toolsets_seen.append(display)
    for item in unavailable_toolsets:
        display = _display_toolset_name(item.get("id", item.get("name", "unknown")))
        if display not in _seen:
            _seen.add(display)
            toolsets_seen.append(display)

    summary = f"[{text}]{len(tools)} tools[/] [dim {dim}]·[/] [{text}]{total_skills} skills[/]"
    if toolsets_seen:
        shown = ", ".join(sorted(toolsets_seen)[:6])
        if len(toolsets_seen) > 6:
            shown += f" +{len(toolsets_seen) - 6}"
        right_lines.append(f"[dim {dim}]toolsets:[/] [{text}]{shown}[/]")
    right_lines.append(summary)

    if not _skills_enabled:
        right_lines.append(f"[dim {dim}]Skills toolset disabled[/]")

    # Unavailable / lazy tools — short notice only when relevant
    if disabled_tools:
        sample = ", ".join(sorted(disabled_tools)[:3])
        extra = f" +{len(disabled_tools) - 3}" if len(disabled_tools) > 3 else ""
        right_lines.append(f"[red]unavailable:[/] [{text}]{sample}{extra}[/]")
    if lazy_tools:
        sample = ", ".join(sorted(lazy_tools)[:3])
        extra = f" +{len(lazy_tools) - 3}" if len(lazy_tools) > 3 else ""
        right_lines.append(f"[yellow]lazy:[/] [{text}]{sample}{extra}[/]")

    try:
        from tools.mcp_tool import get_mcp_status
        mcp_status = get_mcp_status()
    except Exception:
        mcp_status = []

    if mcp_status:
        right_lines.append("")
        right_lines.append(f"[bold {accent}]MCP[/]")
        for srv in mcp_status:
            status = srv.get("status")
            if srv["connected"]:
                right_lines.append(
                    f"[dim {dim}]{srv['name']}[/] [{text}]({srv['transport']})[/] "
                    f"[dim {dim}]·[/] [{text}]{srv['tools']} tool(s)[/]"
                )
            elif srv.get("disabled") or status == "disabled":
                right_lines.append(
                    f"[dim {dim}]{srv['name']}[/] [dim]({srv['transport']})[/] "
                    f"[dim {dim}]— disabled[/]"
                )
            elif status == "connecting":
                right_lines.append(
                    f"[dim {dim}]{srv['name']}[/] [dim]({srv['transport']})[/] "
                    f"[yellow]— connecting[/]"
                )
            elif status == "configured":
                right_lines.append(
                    f"[dim {dim}]{srv['name']}[/] [dim]({srv['transport']})[/] "
                    f"[dim {dim}]— configured[/]"
                )
            else:
                right_lines.append(
                    f"[red]{srv['name']}[/] [dim]({srv['transport']})[/] "
                    f"[red]— failed[/]"
                )

    try:
        from wayne_cli.codex_runtime_switch import get_current_runtime
        from wayne_cli.config import load_config as _load_cfg
        if get_current_runtime(_load_cfg()) == "codex_app_server":
            right_lines.append(
                f"[bold {accent}]Runtime:[/] [{text}]codex app-server[/]"
            )
    except Exception:
        pass

    try:
        from wayne_cli.profiles import get_active_profile_name
        _profile_name = get_active_profile_name()
        if _profile_name and _profile_name != "default":
            right_lines.append(f"[bold {accent}]Profile:[/] [{text}]{_profile_name}[/]")
    except Exception:
        pass

    alerts: list = []
    try:
        behind = get_update_result(timeout=0.5)
        if behind is not None and behind != 0:
            from wayne_cli.config import get_managed_update_command, recommended_update_command
            if behind > 0:
                commits_word = "commit" if behind == 1 else "commits"
                alerts.append(
                    f"[bold yellow]⚠ {behind} {commits_word} behind[/]"
                    f"[dim yellow] · run [bold]{recommended_update_command()}[/bold][/]"
                )
            else:
                managed_cmd = get_managed_update_command()
                line = "[bold yellow]⚠ update available[/]"
                if managed_cmd:
                    line += f"[dim yellow] · run [bold]{managed_cmd}[/bold][/]"
                alerts.append(line)
    except Exception:
        pass

    try:
        from wayne_cli.config import detect_install_method
        if detect_install_method() == "pip":
            alerts.append(
                "[bold yellow]⚠ pip install not officially supported[/]"
                "[dim yellow] · expect instability[/]"
            )
    except Exception:
        pass

    layout_table = Table.grid(padding=(0, 3))
    layout_table.add_column("left", justify="left", ratio=1)
    layout_table.add_column("right", justify="left", ratio=1)
    layout_table.add_row("\n".join(left_lines), "\n".join(right_lines))

    version_label = format_banner_version_label()
    release_info = get_latest_release_tag()
    if release_info:
        _tag, _url = release_info
        title_markup = f"[bold {title_color}][link={_url}]{version_label}[/link][/]"
    else:
        title_markup = f"[bold {title_color}]{version_label}[/]"

    outer_panel = Panel(
        layout_table,
        title=title_markup,
        title_align="left",
        border_style=border_color,
        padding=(1, 2),
        subtitle=f"[dim {dim}]{W4Y_TAGLINE}[/]",
        subtitle_align="left",
    )

    console.print()
    console.print(outer_panel)
    for alert in alerts:
        console.print(f"  {alert}")
    if alerts:
        console.print()
