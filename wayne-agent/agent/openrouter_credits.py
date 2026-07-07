"""OpenRouter credit-usage source for the in-chat usage notices (Work4You).

The Nous path (agent/credits_tracker.py) reads usage from ``x-nous-credits-*``
response headers that piggyback on every inference call. OpenRouter does NOT
send those headers — usage lives behind ``GET /api/v1/key`` (per-key ``usage`` /
``limit``). This module bridges that gap and REUSES the existing, battle-tested
notice machinery:

  * ``credits_state_from_key_payload`` maps the OpenRouter key payload into the
    same ``CreditsState`` the Nous parser produces (so ``used_fraction`` and the
    depletion flag compute identically).
  * ``evaluate_openrouter_notices`` delegates ALL escalation / latch / fire-once
    / clear logic to ``evaluate_credits_notices`` verbatim, then only REWRITES
    the notice copy to Work4You's i18n strings (percentage-based, credits — no
    dollars, no Nous ``/credits`` command).

Money mapping: the OpenRouter cap is the denominator. We store
``subscription_limit_micros = limit`` and ``subscription_micros = remaining``
(so ``used_fraction == usage/limit``), and ``paid_access = remaining > 0`` (a key
whose limit is spent gets a 402 from OpenRouter → depleted notice). An unlimited
key (``limit is None``) yields a no-cap state → no usage notices (correct: there
is no cap to warn about).
"""

from __future__ import annotations

import json
import logging
import time
import urllib.request
from typing import Any, Optional

from agent.credits_tracker import (
    AgentNotice,
    CREDITS_USAGE_KEY,
    CreditsState,
    evaluate_credits_notices,
)
from agent.i18n import t

logger = logging.getLogger(__name__)

OPENROUTER_KEY_URL = "https://openrouter.ai/api/v1/key"


def _to_micros(dollars: float) -> int:
    return int(round(dollars * 1_000_000))


def credits_state_from_key_payload(payload: Any) -> Optional[CreditsState]:
    """Map an OpenRouter ``GET /api/v1/key`` payload into a CreditsState.

    Response shape: ``{"data": {"usage": <usd>, "limit": <usd|null>,
    "limit_remaining": <usd|null>, "is_free_tier": <bool>, ...}}``.

    Returns None on a malformed payload (fail-open miss → keep last-known).
    A None/absent/zero ``limit`` → uncapped key → a valid paid state with NO
    denominator (``used_fraction`` is None → no usage-band notices).
    """
    try:
        data = payload.get("data") if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            data = payload if isinstance(payload, dict) else None
        if not isinstance(data, dict):
            return None
        usage = data.get("usage")
        if not isinstance(usage, (int, float)):
            return None
        limit = data.get("limit")
        # Uncapped key (shared/unlimited): no cap to gauge → no usage notices.
        if not isinstance(limit, (int, float)) or limit <= 0:
            return CreditsState(
                denominator_kind="none",
                paid_access=True,
                purchased_usd="0.00",
                from_header=False,
                captured_at=time.time(),
            )
        rem_raw = data.get("limit_remaining")
        remaining = float(rem_raw) if isinstance(rem_raw, (int, float)) else (limit - usage)
        paid = remaining > 0
        rem_nonneg = max(0.0, remaining)
        return CreditsState(
            remaining_micros=_to_micros(rem_nonneg),
            remaining_usd=f"{rem_nonneg:.2f}",
            subscription_micros=_to_micros(remaining),  # remaining under the cap
            subscription_usd=f"{remaining:.2f}",
            subscription_limit_micros=_to_micros(limit),
            subscription_limit_usd=f"{limit:.2f}",
            denominator_kind="subscription_cap",
            paid_access=paid,
            purchased_micros=0,
            purchased_usd="0.00",
            from_header=False,
            captured_at=time.time(),
        )
    except Exception:
        logger.debug("openrouter ▸ key payload map failed", exc_info=True)
        return None


def fetch_openrouter_credits_state(
    api_key: str, *, timeout: float = 6.0
) -> Optional[CreditsState]:
    """GET the OpenRouter key usage and map it to a CreditsState (or None)."""
    if not api_key:
        return None
    try:
        req = urllib.request.Request(
            OPENROUTER_KEY_URL, headers={"Authorization": f"Bearer {api_key}"}
        )
        with urllib.request.urlopen(req, timeout=timeout) as resp:  # noqa: S310 (fixed https URL)
            payload = json.loads(resp.read().decode("utf-8"))
        return credits_state_from_key_payload(payload)
    except Exception:
        logger.debug("openrouter ▸ key usage fetch failed (fail-open)", exc_info=True)
        return None


def _localize(notice: AgentNotice, band: Optional[int], lang: Optional[str]) -> AgentNotice:
    """Rewrite a Nous-copy AgentNotice into Work4You's i18n copy, by key.

    Preserves level / kind / ttl_ms / key / id (so the latch + clear machinery
    keeps working) — only ``text`` changes. Unknown keys (e.g. Nous grant_spent,
    which never fires for OpenRouter since purchased==0) pass through unchanged.
    """
    key = notice.id or notice.key or ""
    if key == CREDITS_USAGE_KEY and band is not None:
        sym = "⚠" if notice.level == "warn" else "•"
        text = t("credits.usage", lang=lang, sym=sym, pct=band)
    elif key == "credits.depleted":
        text = t("credits.depleted", lang=lang)
    elif key == "credits.restored":
        text = t("credits.restored", lang=lang)
    else:
        return notice
    return AgentNotice(
        text=text,
        level=notice.level,
        kind=notice.kind,
        ttl_ms=notice.ttl_ms,
        key=notice.key,
        id=notice.id,
    )


def evaluate_openrouter_notices(
    state: CreditsState, latch: dict, *, lang: Optional[str] = None
) -> tuple[list[AgentNotice], list[str]]:
    """Work4You usage notices from an OpenRouter CreditsState.

    Delegates the escalation/latch/clear reconciliation to
    ``evaluate_credits_notices`` VERBATIM (model_is_free=False — OpenRouter has
    no free-model depletion suppression here), then localizes the copy. Returns
    ``(to_show, to_clear)``; caller emits clears first, then shows.
    """
    to_show, to_clear = evaluate_credits_notices(state, latch, model_is_free=False)
    band = latch.get("usage_band")
    localized = [_localize(n, band, lang) for n in to_show]
    return localized, to_clear
