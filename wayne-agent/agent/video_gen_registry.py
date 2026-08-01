"""
Video Generation Provider Registry
==================================

Central map of registered providers. Populated by plugins at import-time via
``PluginContext.register_video_gen_provider()``; consumed by the
``video_generate`` tool to dispatch each call to the active backend.

Active selection
----------------
The active provider is chosen by ``video_gen.provider`` in ``config.yaml``.
If unset, :func:`get_active_provider` applies fallback logic:

1. Prefer ``openrouter`` when available (Work4You / shared OpenRouter
   billing — same key as chat + image gen).
2. Otherwise the first remaining available non-``fal`` provider, or
   ``None``.

``fal`` is never auto-selected — Work4You bills media via OpenRouter only.
Explicit ``video_gen.provider: fal`` still works for power users.

Mirrors ``agent/image_gen_registry.py`` so the two surfaces behave the same.
"""

from __future__ import annotations

import logging
import threading
from typing import Dict, List, Optional

from agent.video_gen_provider import VideoGenProvider

logger = logging.getLogger(__name__)


_providers: Dict[str, VideoGenProvider] = {}
_lock = threading.Lock()


def register_provider(provider: VideoGenProvider) -> None:
    """Register a video generation provider.

    Re-registration (same ``name``) overwrites the previous entry and logs
    a debug message — this makes hot-reload scenarios (tests, dev loops)
    behave predictably.
    """
    if not isinstance(provider, VideoGenProvider):
        raise TypeError(
            f"register_provider() expects a VideoGenProvider instance, "
            f"got {type(provider).__name__}"
        )
    name = provider.name
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Video gen provider .name must be a non-empty string")
    with _lock:
        existing = _providers.get(name)
        _providers[name] = provider
    if existing is not None:
        logger.debug("Video gen provider '%s' re-registered (was %r)", name, type(existing).__name__)
    else:
        logger.debug("Registered video gen provider '%s' (%s)", name, type(provider).__name__)


def list_providers() -> List[VideoGenProvider]:
    """Return all registered providers, sorted by name."""
    with _lock:
        items = list(_providers.values())
    return sorted(items, key=lambda p: p.name)


def get_provider(name: str) -> Optional[VideoGenProvider]:
    """Return the provider registered under *name*, or None."""
    if not isinstance(name, str):
        return None
    with _lock:
        return _providers.get(name.strip())


def get_active_provider() -> Optional[VideoGenProvider]:
    """Resolve the currently-active provider.

    Reads ``video_gen.provider`` from config.yaml; falls back per the
    module docstring.

    **Availability semantics** (mirrors :mod:`agent.image_gen_registry`):

    - When ``video_gen.provider`` is explicitly set **and available**, that
      provider wins.
    - When the configured provider is missing or unavailable, fall through
      to an available backend (OpenRouter preferred) so the agent never
      receives a "set API key" error for a backend the product does not
      expose.
    """
    configured: Optional[str] = None
    try:
        from work4you_cli.config import load_config

        cfg = load_config()
        section = cfg.get("video_gen") if isinstance(cfg, dict) else None
        if isinstance(section, dict):
            raw = section.get("provider")
            if isinstance(raw, str) and raw.strip():
                configured = raw.strip()
    except Exception as exc:
        logger.debug("Could not read video_gen.provider from config: %s", exc)

    with _lock:
        snapshot = dict(_providers)

    def _is_available_safe(p: VideoGenProvider) -> bool:
        try:
            return bool(p.is_available())
        except Exception as exc:  # noqa: BLE001
            logger.debug("video_gen provider %s.is_available() raised %s", p.name, exc)
            return False

    if configured:
        provider = snapshot.get(configured)
        if provider is not None and _is_available_safe(provider):
            return provider
        logger.debug(
            "video_gen.provider='%s' configured but missing/unavailable; falling back",
            configured,
        )

    openrouter = snapshot.get("openrouter")
    if openrouter is not None and _is_available_safe(openrouter):
        return openrouter

    available = [
        p
        for p in snapshot.values()
        if p.name != "fal" and _is_available_safe(p)
    ]
    if len(available) == 1:
        return available[0]
    if available:
        return sorted(available, key=lambda p: p.name)[0]

    return None


def _reset_for_tests() -> None:
    """Clear the registry. **Test-only.**"""
    with _lock:
        _providers.clear()
