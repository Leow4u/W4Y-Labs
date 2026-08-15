"""Tests for plan-aware model gating."""

from work4you_cli.plan_model_gating import (
    assert_model_allowed_for_plan,
    filter_models_for_plan,
    plan_locked_model_detail,
)
from work4you_cli.relay_free_model import (
    RELAY_FREE_PRIMARY_MODEL,
    is_gratis_plan,
    is_plan_locked_model,
    is_relay_free_model,
)


def test_is_relay_free_model_primary_and_tail():
    assert is_relay_free_model(RELAY_FREE_PRIMARY_MODEL)
    assert is_relay_free_model("vendor/qwen3.7-flash")
    assert not is_relay_free_model("openrouter/auto")


def test_is_gratis_plan_normalizes_keys():
    assert is_gratis_plan("free")
    assert is_gratis_plan("gratis")
    assert not is_gratis_plan("starter")
    assert not is_gratis_plan("pro")


def test_is_plan_locked_model_free_tier():
    assert is_plan_locked_model("openrouter/auto", "free")
    assert not is_plan_locked_model(RELAY_FREE_PRIMARY_MODEL, "free")
    assert not is_plan_locked_model("openrouter/auto", "starter")


def test_filter_models_for_plan():
    models = [RELAY_FREE_PRIMARY_MODEL, "openrouter/auto"]
    assert filter_models_for_plan(models, "free") == [RELAY_FREE_PRIMARY_MODEL]
    assert filter_models_for_plan(models, "pro") == models


def test_assert_model_allowed_for_plan_rejects_premium_on_free():
    detail = plan_locked_model_detail("openrouter/auto", "free")
    assert detail
    try:
        assert_model_allowed_for_plan(
            provider="openrouter",
            model="openrouter/auto",
            plan="free",
            scope="main",
        )
        raise AssertionError("expected ValueError")
    except ValueError as exc:
        assert "Relay 2.5 Fast" in str(exc)


def test_assert_model_allowed_for_plan_allows_relay_on_free():
    assert_model_allowed_for_plan(
        provider="openrouter",
        model=RELAY_FREE_PRIMARY_MODEL,
        plan="free",
        scope="main",
    )


def test_assert_model_allowed_for_plan_skips_byo_provider():
    assert_model_allowed_for_plan(
        provider="anthropic",
        model="claude-opus-5",
        plan="free",
        scope="main",
    )


def test_fetch_tenant_plan_payload_from_runtime(monkeypatch):
    from work4you_cli.plan_model_gating import fetch_tenant_plan_payload

    monkeypatch.setattr(
        "work4you_cli.platform_tenant.fetch_tenant_runtime",
        lambda tenant_id: {
            "ok": True,
            "plan": "starter",
            "status": "active",
            "has_customer": True,
            "included_usd": 20,
            "ondemand": {"enabled": False},
        },
    )
    payload = fetch_tenant_plan_payload("tenant-1")
    assert payload is not None
    assert payload["plan"] == "starter"
    assert payload["included_usd"] == 20
