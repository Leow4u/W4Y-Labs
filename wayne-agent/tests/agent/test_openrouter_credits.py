"""Tests for the OpenRouter credit-usage source (agent/openrouter_credits.py).

Covers the payload→CreditsState mapping and the i18n copy rewrite that reuses
the Nous escalation/latch machinery. Pure — no network (the fetch wrapper is a
thin urllib call over these pure pieces).
"""

from agent.credits_tracker import CREDITS_USAGE_KEY
from agent.openrouter_credits import (
    credits_state_from_key_payload,
    evaluate_openrouter_notices,
)


def _payload(usage, limit, limit_remaining=None):
    d = {"usage": usage, "limit": limit}
    if limit_remaining is not None:
        d["limit_remaining"] = limit_remaining
    return {"data": d}


def _latch():
    # seen_below_90 primed → usage bands may fire on first observation (mirrors
    # the cold-start seed), so a single-shot test doesn't need a prior crossing.
    return {"active": set(), "seen_below_90": True, "usage_band": None}


# ── mapping ──────────────────────────────────────────────────────────────────


def test_maps_usage_fraction():
    st = credits_state_from_key_payload(_payload(15.0, 20.0))
    assert st is not None
    assert abs(st.used_fraction - 0.75) < 1e-6
    assert st.paid_access is True
    assert st.depleted is False


def test_depleted_when_limit_spent():
    st = credits_state_from_key_payload(_payload(20.0, 20.0, limit_remaining=0.0))
    assert st is not None
    assert st.paid_access is False
    assert st.depleted is True


def test_uncapped_key_has_no_denominator():
    # limit None (shared/unlimited key) → no cap to gauge → no usage notices.
    st = credits_state_from_key_payload(_payload(3.0, None))
    assert st is not None
    assert st.used_fraction is None
    assert st.paid_access is True


def test_malformed_payload_returns_none():
    assert credits_state_from_key_payload({"data": {}}) is None
    assert credits_state_from_key_payload({}) is None
    assert credits_state_from_key_payload(None) is None


# ── i18n copy rewrite (reuses evaluate_credits_notices) ──────────────────────


def test_usage_notice_localized_en():
    st = credits_state_from_key_payload(_payload(15.0, 20.0))  # 75%
    to_show, _ = evaluate_openrouter_notices(st, _latch(), lang="en")
    usage = [n for n in to_show if n.key == CREDITS_USAGE_KEY]
    assert len(usage) == 1
    n = usage[0]
    assert "75%" in n.text
    assert "$" not in n.text  # credits, never dollars
    assert n.level == "warn"


def test_usage_notice_localized_pt():
    st = credits_state_from_key_payload(_payload(10.0, 20.0))  # 50%
    to_show, _ = evaluate_openrouter_notices(st, _latch(), lang="pt")
    usage = [n for n in to_show if n.key == CREDITS_USAGE_KEY]
    assert len(usage) == 1
    assert "50%" in usage[0].text
    assert "créditos" in usage[0].text.lower()
    assert usage[0].level == "info"


def test_depleted_notice_localized_no_nous_command():
    st = credits_state_from_key_payload(_payload(20.0, 20.0, limit_remaining=0.0))
    to_show, _ = evaluate_openrouter_notices(st, _latch(), lang="en")
    dep = [n for n in to_show if n.key == "credits.depleted"]
    assert len(dep) == 1
    assert "$" not in dep[0].text
    assert "/credits" not in dep[0].text  # not the Nous top-up command
    assert dep[0].level == "error"
