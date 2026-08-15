"""Tests for shared-motor tenant bootstrap (WAYNE_HOME per org)."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import patch

import pytest
import yaml
from starlette.requests import Request

from work4you_cli import platform_tenant
from work4you_cli.platform_tenant import (
    _should_reset_platform_default,
    activate_platform_tenant_scope,
    deactivate_platform_tenant_scope,
    ensure_tenant_home,
    ensure_tenant_platform_config,
    open_session_db,
    session_db_path,
    shared_motor_tenant_violation_response,
    tenant_home_path,
)
from work4you_cli.relay_free_model import RELAY_FREE_PRIMARY_MODEL


@pytest.fixture
def tenant_env(tmp_path, monkeypatch):
    root = tmp_path / "tenants"
    root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("W4Y_SHARED_MOTOR", "1")
    monkeypatch.setenv("W4Y_TENANTS_ROOT", str(root))
    monkeypatch.setenv("W4Y_PLATFORM_SSO_SECRET", "test-secret")
    return root


@pytest.fixture(autouse=True)
def _clear_runtime_cache():
    """The runtime cache is module state; keep it from crossing tests."""
    platform_tenant._TENANT_RUNTIME_CACHE.clear()
    yield
    platform_tenant._TENANT_RUNTIME_CACHE.clear()


def test_should_reset_nemotron_and_free_slugs():
    assert _should_reset_platform_default("nvidia/nemotron-nano-9b-v2:free", "free")
    assert _should_reset_platform_default("", "free")
    assert not _should_reset_platform_default(RELAY_FREE_PRIMARY_MODEL, "free")


def test_ensure_tenant_platform_config_free_applies_relay(tenant_env):
    home = tenant_env / "t1"
    home.mkdir(parents=True)
    (home / "config.yaml").write_text(
        yaml.safe_dump({"model": {"default": "nvidia/nemotron-nano-9b-v2:free"}}),
        encoding="utf-8",
    )

    ensure_tenant_platform_config(home, "free")

    config = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    assert config["model"]["default"] == RELAY_FREE_PRIMARY_MODEL
    assert config["model"]["provider"] == "openrouter"


def test_ensure_tenant_platform_config_paid_resets_bad_default(tenant_env):
    home = tenant_env / "t2"
    home.mkdir(parents=True)
    (home / "config.yaml").write_text(
        yaml.safe_dump({"model": {"default": "nvidia/nemotron-nano-9b-v2:free"}}),
        encoding="utf-8",
    )

    ensure_tenant_platform_config(home, "starter")

    config = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    assert config["model"]["default"] == "openrouter/auto"


def test_ensure_tenant_home_bootstraps_env_and_config(tenant_env):
    tenant_id = "org-abc"
    runtime = {
        "ok": True,
        "openrouterKey": "sk-or-test",
        "plan": "free",
        "status": "inactive",
    }

    with patch(
        "work4you_cli.platform_tenant.fetch_tenant_runtime",
        return_value=runtime,
    ):
        home = ensure_tenant_home(tenant_id)

    assert home == tenant_home_path(tenant_id)
    env_text = (home / ".env").read_text(encoding="utf-8")
    assert "OPENROUTER_API_KEY=sk-or-test" in env_text
    config = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    assert config["model"]["default"] == RELAY_FREE_PRIMARY_MODEL


def test_ensure_tenant_home_refreshes_config_when_env_exists(tenant_env):
    tenant_id = "org-refresh"
    home = tenant_home_path(tenant_id)
    home.mkdir(parents=True)
    (home / ".env").write_text("OPENROUTER_API_KEY=existing\n", encoding="utf-8")
    (home / "config.yaml").write_text(
        yaml.safe_dump({"model": {"default": "nvidia/nemotron-nano-9b-v2:free"}}),
        encoding="utf-8",
    )

    runtime = {"ok": True, "openrouterKey": "sk-or-test", "plan": "free"}

    with patch(
        "work4you_cli.platform_tenant.fetch_tenant_runtime",
        return_value=runtime,
    ):
        ensure_tenant_home(tenant_id)

    config = yaml.safe_load((home / "config.yaml").read_text(encoding="utf-8"))
    assert config["model"]["default"] == RELAY_FREE_PRIMARY_MODEL


def test_ensure_tenant_home_reuses_the_cached_runtime(tenant_env):
    """Bootstrap runs on every request; it must not re-hit the platform."""
    calls: list[str] = []

    def fake_fetch(tenant_id: str):
        calls.append(tenant_id)
        return {"ok": True, "openrouterKey": "sk-or-test", "plan": "free"}

    with patch(
        "work4you_cli.platform_tenant.fetch_tenant_runtime",
        side_effect=fake_fetch,
    ):
        for _ in range(3):
            ensure_tenant_home("org-cached")

    assert calls == ["org-cached"]


def test_ensure_tenant_home_retries_after_a_failed_fetch(tenant_env):
    """A tenant whose key is momentarily unavailable must heal, not stay stuck."""
    calls: list[str] = []

    def flaky(tenant_id: str):
        calls.append(tenant_id)
        # First bootstrap finds the platform down; the second one succeeds.
        if len(calls) == 1:
            return {}
        return {"ok": True, "openrouterKey": "sk-or-late", "plan": "free"}

    with patch(
        "work4you_cli.platform_tenant.fetch_tenant_runtime",
        side_effect=flaky,
    ):
        home = ensure_tenant_home("org-flaky")
        assert not (home / ".env").exists()
        ensure_tenant_home("org-flaky")

    assert len(calls) == 2
    assert "OPENROUTER_API_KEY=sk-or-late" in (home / ".env").read_text(encoding="utf-8")


def test_tenant_runtime_cache_is_per_tenant(tenant_env):
    """One tenant's cached answer must never be served to another."""
    keys = {"org-one": "sk-or-one", "org-two": "sk-or-two"}

    with patch(
        "work4you_cli.platform_tenant.fetch_tenant_runtime",
        side_effect=lambda t: {"ok": True, "openrouterKey": keys[t], "plan": "free"},
    ):
        home_one = ensure_tenant_home("org-one")
        home_two = ensure_tenant_home("org-two")

    assert "sk-or-one" in (home_one / ".env").read_text(encoding="utf-8")
    assert "sk-or-two" in (home_two / ".env").read_text(encoding="utf-8")


def test_open_session_db_uses_runtime_wayne_home(tenant_env):
    """SessionDB must bind to runtime get_wayne_home(), not import-time default."""
    from work4you_constants import (
        get_wayne_home,
        reset_wayne_home_override,
        set_wayne_home_override,
    )

    tenant_a = tenant_env / "t-a"
    tenant_b = tenant_env / "t-b"
    tenant_a.mkdir()
    tenant_b.mkdir()

    token = set_wayne_home_override(str(tenant_a))
    try:
        db_a = open_session_db()
        assert db_a.db_path == tenant_a / "state.db"
        db_a.close()
    finally:
        reset_wayne_home_override(token)

    token = set_wayne_home_override(str(tenant_b))
    try:
        db_b = open_session_db()
        assert db_b.db_path == tenant_b / "state.db"
        db_b.close()
    finally:
        reset_wayne_home_override(token)

    assert get_wayne_home() != tenant_a


def test_every_api_route_is_public_or_needs_a_tenant(tenant_env):
    """No route may quietly serve the container's home to a tenant's session.

    Walks the real app rather than a list, so a route added tomorrow is
    covered on arrival instead of silently falling outside the net.
    """
    from work4you_cli.dashboard_auth.public_paths import PUBLIC_API_PATHS
    from work4you_cli.platform_tenant import (
        _path_requires_tenant_scope,
        _SHARED_MOTOR_TENANTLESS_PREFIXES,
    )
    from work4you_cli.web_server import app

    api_paths = {
        route.path
        for route in app.routes
        if getattr(route, "path", "").startswith("/api/")
    }
    assert api_paths, "no /api routes discovered — the walk is broken"

    unaccounted = {
        path
        for path in api_paths
        if not _path_requires_tenant_scope(path)
        and path not in PUBLIC_API_PATHS
        and not any(
            path == prefix or path.startswith(prefix + "/")
            for prefix in _SHARED_MOTOR_TENANTLESS_PREFIXES
        )
    }
    assert not unaccounted


def test_tenant_private_routes_fail_closed(tenant_env):
    """Spot-check the surfaces that hurt most when served unscoped."""
    from work4you_cli.platform_tenant import _path_requires_tenant_scope

    for path in (
        "/api/env/reveal",
        "/api/ops/dump",
        "/api/credentials/pool",
        "/api/fs/read-text",
        "/api/profiles",
        "/api/sessions",
        "/api/connectors/accounts",
        "/api/device/connector-bootstrap",
    ):
        assert _path_requires_tenant_scope(path), path


def test_login_and_liveness_do_not_require_a_tenant(tenant_env):
    """Requiring a tenant on the login path would be circular."""
    from work4you_cli.platform_tenant import _path_requires_tenant_scope

    for path in ("/api/auth/providers", "/api/auth/callback", "/api/status"):
        assert not _path_requires_tenant_scope(path), path


def test_shared_motor_tenant_violation_blocks_sessions_without_org_id(tenant_env):
    request = Request({"type": "http", "path": "/api/sessions", "headers": []})
    session = SimpleNamespace(user_id="u1", org_id="")

    response = shared_motor_tenant_violation_response(request, session)
    assert response is not None
    assert response.status_code == 403


def test_shared_motor_tenant_violation_allows_when_org_id_present(tenant_env):
    request = Request({"type": "http", "path": "/api/sessions", "headers": []})
    session = SimpleNamespace(user_id="u1", org_id="t-flavia-49a8ab")

    assert shared_motor_tenant_violation_response(request, session) is None


def test_activate_platform_tenant_scope_pins_wayne_home(tenant_env):
    from work4you_constants import get_wayne_home

    tenant_id = "t-scope-test"
    token = activate_platform_tenant_scope(tenant_id)
    try:
        assert get_wayne_home() == tenant_home_path(tenant_id)
        assert session_db_path() == tenant_home_path(tenant_id) / "state.db"
    finally:
        deactivate_platform_tenant_scope(token)