"""Relay 2.5 Fast — subsidized free-tier house model (Cursor Hobby pattern).

Users on plan ``free`` see only this product name; other models stay locked
until upgrade. Slugs are operational — swap here without redeploying copy.
See docs/BILLING-ARQUITETURA.md §Relay 2.5 Fast.
"""

from __future__ import annotations

RELAY_25_FAST_LABEL = "Relay 2.5 Fast"

# OpenRouter primary (~$0.03 / $0.13 per M, tools, 1M ctx).
RELAY_FREE_PRIMARY_MODEL = "qwen/qwen3.7-flash"

# Fallback when primary errors or rate-limits (~$0.03 / $0.14 per M).
RELAY_FREE_FALLBACK_MODEL = "openai/gpt-oss-20b"

RELAY_FREE_REASONING = "medium"
RELAY_FREE_PROVIDER = "openrouter"


def relay_free_fallback_chain() -> list[dict[str, str]]:
    """``fallback_model`` chain for config.yaml (openrouter provider)."""
    return [{"provider": RELAY_FREE_PROVIDER, "model": RELAY_FREE_FALLBACK_MODEL}]


def relay_free_model_config_patch() -> dict:
    """Minimal config fragment for a free-tier tenant default."""
    return {
        "model": {
            "default": RELAY_FREE_PRIMARY_MODEL,
            "provider": RELAY_FREE_PROVIDER,
        },
        "agent": {"reasoning_effort": RELAY_FREE_REASONING},
        "fallback_model": relay_free_fallback_chain(),
    }
