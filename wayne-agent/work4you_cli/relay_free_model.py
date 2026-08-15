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


def apply_relay_free_defaults(config: dict) -> None:
    """Merge Relay 2.5 Fast platform defaults into *config* in place."""
    patch = relay_free_model_config_patch()
    model_patch = patch.get("model") or {}
    existing = config.get("model")
    if not isinstance(existing, dict):
        config["model"] = {}
    config["model"].update(model_patch)
    agent = config.setdefault("agent", {})
    if isinstance(agent, dict):
        agent["reasoning_effort"] = patch["agent"]["reasoning_effort"]
    config["fallback_model"] = patch.get("fallback_model", relay_free_fallback_chain())


def is_relay_free_model(model_id: str) -> bool:
    """True for the subsidized house model (primary slug or qwen3.7-flash tail)."""
    mid = (model_id or "").strip()
    if not mid:
        return False
    if mid == RELAY_FREE_PRIMARY_MODEL:
        return True
    tail = mid.rsplit("/", 1)[-1]
    return tail == "qwen3.7-flash"


def is_catalog_auto_model(model_id: str) -> bool:
    """True for the OpenRouter auto-router (paid-plan Relay preset)."""
    mid = (model_id or "").strip()
    if not mid:
        return False
    if mid == "openrouter/auto":
        return True
    tail = mid.rsplit("/", 1)[-1].lower()
    return tail == "auto"


def normalize_plan(raw: str | None) -> str:
    """Platform plan key → canonical tier (free/starter/pro/max). Unknown → free."""
    p = (raw or "").strip().lower()
    if p in ("starter", "essencial"):
        return "starter"
    if p in ("pro", "plus"):
        return "pro"
    if p in ("max", "business"):
        return "max"
    if p in ("free", "gratis", ""):
        return "free"
    return "free"


def is_gratis_plan(raw: str | None) -> bool:
    """True when the tenant is on the subsidized Free tier."""
    return normalize_plan(raw) == "free"


def is_plan_locked_model(model_id: str, plan: str | None = None) -> bool:
    """True when *model_id* is unavailable on the Free tier."""
    if not is_gratis_plan(plan):
        return False
    if is_relay_free_model(model_id):
        return False
    return True


W4Y_DOCS_BASE = "https://work4you.ai/documentacao"
W4Y_LOGIN_URL = "https://work4you.ai/login"
