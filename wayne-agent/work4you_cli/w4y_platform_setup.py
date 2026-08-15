"""Work4You platform setup — Relay 2.5 Fast + OpenRouter key from account."""

from __future__ import annotations

from work4you_cli.relay_free_model import (
    RELAY_25_FAST_LABEL,
    RELAY_FREE_PRIMARY_MODEL,
    W4Y_LOGIN_URL,
    apply_relay_free_defaults,
)


def ensure_platform_openrouter_key(*, interactive: bool = True) -> bool:
    """Return True when OPENROUTER_API_KEY is present (platform or BYO)."""
    from work4you_cli.config import get_env_value

    if (get_env_value("OPENROUTER_API_KEY") or "").strip():
        return True
    if not interactive:
        return False

    print()
    print(f"  Sign in to Work4You to provision your model key: {W4Y_LOGIN_URL}")
    print("  In the desktop app: Account → sign in, then apply updates if prompted.")
    print("  Or paste an OpenRouter key below if you bring your own.")
    print()

    from work4you_cli.auth import ProviderConfig
    from work4you_cli.main import _prompt_api_key

    pconfig = ProviderConfig(
        id="openrouter",
        name="Work4You models",
        auth_type="api_key",
        api_key_env_vars=("OPENROUTER_API_KEY",),
    )
    resolved, abort = _prompt_api_key(pconfig, "", provider_id="openrouter")
    if abort or not (resolved or "").strip():
        print()
        print("  No API key configured — finish login in the app or run setup again.")
        return False
    return True


def run_w4y_relay_setup(config: dict, *, interactive: bool = True) -> bool:
    """Apply Relay 2.5 Fast defaults and ensure an OpenRouter key exists."""
    from work4you_cli.config import load_config, save_config

    apply_relay_free_defaults(config)
    if not ensure_platform_openrouter_key(interactive=interactive):
        return False

    refreshed = load_config() or {}
    if not isinstance(refreshed, dict):
        refreshed = {}
    apply_relay_free_defaults(refreshed)
    save_config(refreshed)
    config.clear()
    config.update(refreshed)

    print()
    print(f"  Default model: {RELAY_25_FAST_LABEL} ({RELAY_FREE_PRIMARY_MODEL})")
    print("  Provider: Work4You models (OpenRouter)")
    print()
    return True
