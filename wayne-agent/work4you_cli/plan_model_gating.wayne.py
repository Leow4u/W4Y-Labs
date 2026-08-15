"""Plan-aware model assignment validation (Relay 2.5 Fast on Free tier)."""

from __future__ import annotations

import logging
import os
from typing import Optional

from wayne_cli.relay_free_model import (
    RELAY_25_FAST_LABEL,
    is_gratis_plan,
    is_plan_locked_model,
)

_log = logging.getLogger(__name__)


def fetch_tenant_plan(cookie: str) -> Optional[str]:
    """Resolve tenant plan from the platform billing API (cookie-forward)."""
    payload = fetch_tenant_plan_payload_via_cookie(cookie)
    if payload and payload.get("plan"):
        return str(payload["plan"])
    return None


def fetch_tenant_plan_payload_via_cookie(cookie: str) -> Optional[dict]:
    """Full plan payload from platform ``GET /planos/plan`` (cookie-forward)."""
    cookie = (cookie or "").strip()
    if not cookie:
        return None
    import httpx

    platform = (os.environ.get("W4Y_PLATFORM_ORIGIN") or "https://work4you.ai").rstrip("/")
    try:
        with httpx.Client(timeout=httpx.Timeout(8.0), follow_redirects=True) as client:
            response = client.get(
                f"{platform}/planos/plan",
                headers={"cookie": cookie, "accept": "application/json"},
            )
        if response.status_code != 200:
            return None
        data = response.json()
        if isinstance(data, dict) and data.get("plan"):
            return data
    except Exception as exc:
        _log.debug("fetch_tenant_plan_payload_via_cookie failed: %s", exc)
    return None


def fetch_tenant_plan_payload(tenant_id: str) -> Optional[dict]:
    """Plan payload for shared motor (HMAC internal API — no platform cookies)."""
    tenant_id = (tenant_id or "").strip()
    if not tenant_id:
        return None
    from wayne_cli.platform_tenant import fetch_tenant_runtime

    data = fetch_tenant_runtime(tenant_id)
    if not data.get("plan"):
        return None
    return {
        "plan": data.get("plan"),
        "status": data.get("status", "inactive"),
        "has_customer": bool(data.get("has_customer")),
        "included_usd": data.get("included_usd", 0),
        "ondemand": data.get("ondemand") or {},
    }


def resolve_tenant_plan_for_cli() -> Optional[str]:
    """Best-effort plan lookup for ``work4you model`` (optional session cookie)."""
    cookie = os.environ.get("W4Y_PLATFORM_SESSION_COOKIE", "").strip()
    if not cookie:
        return None
    return fetch_tenant_plan(cookie)


def filter_models_for_plan(model_ids: list[str], plan: str | None) -> list[str]:
    """Return model ids allowed for *plan* (Free → Relay primary only)."""
    if not is_gratis_plan(plan):
        return list(model_ids)
    return [mid for mid in model_ids if not is_plan_locked_model(mid, plan)]


def plan_locked_model_detail(model: str, plan: str | None) -> str | None:
    """Human-readable rejection reason, or None when the pick is allowed."""
    if not model or not is_plan_locked_model(model, plan):
        return None
    return (
        f"Plano Grátis inclui apenas {RELAY_25_FAST_LABEL}. "
        "Faça upgrade para Essencial para desbloquear o catálogo completo."
    )


def assert_model_allowed_for_plan(
    *,
    provider: str,
    model: str,
    plan: str | None,
    scope: str = "main",
) -> None:
    """Raise ValueError when a free-tier tenant selects a locked catalog model."""
    if scope not in {"main", "auxiliary"} or not model:
        return
    if not is_gratis_plan(plan):
        return
    slug = (provider or "").strip().lower()
    # Platform billing applies to the Work4You catalog provider; BYO/custom stays untouched.
    if slug and slug not in ("openrouter", "moa"):
        return
    detail = plan_locked_model_detail(model, plan)
    if detail:
        raise ValueError(detail)
