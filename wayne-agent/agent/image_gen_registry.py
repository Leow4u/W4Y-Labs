"""
Image Generation Provider Registry
==================================

Central map of registered providers. Populated by plugins at import-time via
``PluginContext.register_image_gen_provider()``; consumed by the
``image_generate`` tool to dispatch each call to the active backend.

Active selection
----------------
The active provider is chosen by ``image_gen.provider`` in ``config.yaml``.
If unset, :func:`get_active_provider` applies fallback logic:

1. If exactly one *available* provider is registered (excluding ``fal``),
   use it.
2. Otherwise prefer ``openrouter`` when available (Work4You / shared
   OpenRouter billing — same key as chat).
3. Otherwise the first remaining available non-``fal`` provider, or
   ``None``.

``fal`` is never auto-selected — Work4You bills media via OpenRouter only.
Explicit ``image_gen.provider: fal`` still works for power users.
"""

from __future__ import annotations

import logging
import threading
from typing import Dict, List, Optional

from agent.image_gen_provider import ImageGenProvider

logger = logging.getLogger(__name__)


_providers: Dict[str, ImageGenProvider] = {}
_lock = threading.Lock()


def register_provider(provider: ImageGenProvider) -> None:
    """Register an image generation provider.

    Re-registration (same ``name``) overwrites the previous entry.
    """
    if not isinstance(provider, ImageGenProvider):
        raise TypeError(
            f"register_provider() expects an ImageGenProvider instance, "
            f"got {type(provider).__name__}"
        )
    name = provider.name
    if not isinstance(name, str) or not name.strip():
        raise ValueError("Image gen provider .name must be a non-empty string")
    with _lock:
        existing = _providers.get(name)
        _providers[name] = provider
    if existing is not None:
        logger.debug("Image gen provider '%s' re-registered (was %r)", name, type(existing).__name__)
    else:
        logger.debug("Registered image gen provider '%s' (%s)", name, type(provider).__name__)


def list_providers() -> List[ImageGenProvider]:
    """Return all registered providers, sorted by name."""
    with _lock:
        items = list(_providers.values())
    return sorted(items, key=lambda p: p.name)


def get_provider(name: str) -> Optional[ImageGenProvider]:
    """Return the provider registered under *name*, or None."""
    if not isinstance(name, str):
        return None
    with _lock:
        return _providers.get(name.strip())


def get_active_provider() -> Optional[ImageGenProvider]:
    """Resolve the currently-active provider.

    Reads ``image_gen.provider`` from config.yaml; falls back per the
    module docstring.

    **Availability semantics:**

    - When ``image_gen.provider`` is explicitly set **and available**, that
      provider wins.
    - When the configured provider is missing or ``is_available()`` is False,
      fall through to an available backend (OpenRouter preferred). Returning
      an unavailable configured provider made the tool stay in the schema
      (another backend was ready) while dispatch asked the agent for an API
      key — never acceptable in Work4You.
    """
    configured: Optional[str] = None
    try:
        from wayne_cli.config import load_config

        cfg = load_config()
        section = cfg.get("image_gen") if isinstance(cfg, dict) else None
        if isinstance(section, dict):
            raw = section.get("provider")
            if isinstance(raw, str) and raw.strip():
                configured = raw.strip()
    except Exception as exc:
        logger.debug("Could not read image_gen.provider from config: %s", exc)

    with _lock:
        snapshot = dict(_providers)

    def _is_available_safe(p: ImageGenProvider) -> bool:
        """Wrap ``is_available()`` so a buggy provider doesn't kill resolution."""
        try:
            return bool(p.is_available())
        except Exception as exc:  # noqa: BLE001
            logger.debug("image_gen provider %s.is_available() raised %s", p.name, exc)
            return False

    # 1. Explicit config wins only when that provider can actually run.
    if configured:
        provider = snapshot.get(configured)
        if provider is not None and _is_available_safe(provider):
            return provider
        logger.debug(
            "image_gen.provider='%s' configured but missing/unavailable; falling back",
            configured,
        )

    # 2. Prefer OpenRouter (same billing key as chat / Work4You tenant).
    openrouter = snapshot.get("openrouter")
    if openrouter is not None and _is_available_safe(openrouter):
        return openrouter

    # 3. Remaining available providers — never auto-pick ``fal``.
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
