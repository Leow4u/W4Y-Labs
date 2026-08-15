"""``work4you portal`` — Work4You account + Relay model setup.

Running ``work4you portal`` with no subcommand performs one-shot Relay setup:
apply Relay 2.5 Fast defaults and ensure an OpenRouter key (platform or BYO).
It is identical to ``work4you setup --portal``.

Subcommands:
  (none)   Relay 2.5 Fast setup (default).
  login    Alias for the default one-shot setup.
  info     Show current model provider + OpenRouter key state.
  open     Open the Work4You login page in the default browser.
"""
from __future__ import annotations

import sys
import webbrowser

from work4you_cli.colors import Colors, color
from work4you_cli.config import get_env_value, load_config
from work4you_cli.relay_free_model import (
    RELAY_25_FAST_LABEL,
    RELAY_FREE_PRIMARY_MODEL,
    W4Y_DOCS_BASE,
    W4Y_LOGIN_URL,
)

ACCOUNT_URL = W4Y_LOGIN_URL
DOCS_URL = f"{W4Y_DOCS_BASE}/integrations/providers"


def _cmd_status(args) -> int:
    """Show Work4You model + OpenRouter key summary."""
    config = load_config() or {}
    model_cfg = config.get("model") if isinstance(config.get("model"), dict) else {}
    provider = str(model_cfg.get("provider") or "").strip().lower()
    model = str(model_cfg.get("default") or "").strip()
    has_key = bool((get_env_value("OPENROUTER_API_KEY") or "").strip())

    print()
    print(color("  Work4You models", Colors.MAGENTA))
    print(color("  ──────────────", Colors.MAGENTA))
    if has_key:
        print(f"  OpenRouter key: {color('✓ configured', Colors.GREEN)}")
    else:
        print(f"  OpenRouter key: {color('not configured', Colors.YELLOW)}")
        print(f"  Sign in: {ACCOUNT_URL}")
        print("  Setup:   work4you portal")

    if provider == "openrouter" and model:
        label = RELAY_25_FAST_LABEL if model == RELAY_FREE_PRIMARY_MODEL else model
        print(f"  Default model: {label} ({provider})")
    elif provider:
        print(f"  Provider: {provider}")
        if model:
            print(f"  Model:    {model}")
    else:
        print("  No default model configured — run: work4you portal")

    print()
    print(color(f"  Docs: {DOCS_URL}", Colors.DIM))
    return 0


def _cmd_open(args) -> int:
    """Open the Work4You login page in the default browser."""
    target = ACCOUNT_URL
    print(f"Opening {target}")
    try:
        opened = webbrowser.open(target)
    except Exception:
        opened = False
    if not opened:
        print()
        print("Could not launch a browser. Visit the URL above manually.")
        return 1
    return 0


def _cmd_login(args) -> int:
    """Run one-shot Relay 2.5 Fast setup."""
    from work4you_cli.setup import _run_portal_one_shot

    config = load_config() or {}
    try:
        _run_portal_one_shot(config)
    except (KeyboardInterrupt, EOFError):
        print()
        print("Setup cancelled.")
        return 1
    return 0


def portal_command(args) -> int:
    """Top-level dispatch for ``work4you portal <subcommand>``."""
    sub = getattr(args, "portal_command", None)
    if sub in {None, "", "login"}:
        return _cmd_login(args)
    if sub in {"info", "status"}:
        return _cmd_status(args)
    if sub == "open":
        return _cmd_open(args)
    if sub == "tools":
        print(
            "The Tool Gateway was a Nous Portal feature and is not available in Work4You.",
            file=sys.stderr,
        )
        print(f"Configure tools with: work4you setup tools", file=sys.stderr)
        return 1
    print(f"Unknown portal subcommand: {sub}", file=sys.stderr)
    print("Run `work4you portal -h` for usage.", file=sys.stderr)
    return 1


def add_parser(subparsers) -> None:
    """Register ``work4you portal`` on the given argparse subparsers object."""
    portal_parser = subparsers.add_parser(
        "portal",
        help="Set up Work4You models (Relay 2.5 Fast); see also `portal info`",
        description=(
            "Run `work4you portal` with no subcommand to apply Relay 2.5 Fast "
            "defaults and configure your OpenRouter key (platform or BYO). "
            "Identical to `work4you setup --portal`. "
            "Subcommands: login (default), info, open."
        ),
    )
    portal_sub = portal_parser.add_subparsers(dest="portal_command")

    portal_sub.add_parser(
        "login",
        help="Relay 2.5 Fast setup (default; one-shot onboarding)",
    )
    portal_sub.add_parser(
        "info",
        help="Show model provider + OpenRouter key state",
    )
    portal_sub.add_parser("status")
    portal_sub.add_parser(
        "open",
        help="Open the Work4You login page in your default browser",
    )
    portal_sub.add_parser(
        "tools",
        help="(Deprecated) Nous Tool Gateway — not available in Work4You",
    )

    portal_parser.set_defaults(func=portal_command)
