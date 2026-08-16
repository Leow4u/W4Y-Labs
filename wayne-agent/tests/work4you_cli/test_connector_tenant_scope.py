"""Composio connector state must follow the tenant, not the process.

On a shared motor one Fly app serves every tenant, so anything that resolves
from the process-wide WAYNE_HOME (the Composio key, the ``mcp_servers`` config
entry, the Composio ``user_id``) silently collapses all tenants into one.
"""

from __future__ import annotations

import asyncio

import pytest

from work4you_cli import web_server as ws
from work4you_constants import reset_wayne_home_override, set_wayne_home_override


@pytest.fixture
def shared_motor(tmp_path, monkeypatch):
    """A shared motor with two tenant homes, neither of which is the default."""
    root = tmp_path / "tenants"
    root.mkdir(parents=True, exist_ok=True)
    monkeypatch.setenv("W4Y_SHARED_MOTOR", "1")
    monkeypatch.setenv("W4Y_TENANTS_ROOT", str(root))
    monkeypatch.setenv("W4Y_PLATFORM_SSO_SECRET", "test-secret")
    for name in ("t-alpha", "t-beta"):
        (root / name).mkdir(parents=True, exist_ok=True)
    return root


@pytest.fixture
def dedicated_motor(monkeypatch):
    monkeypatch.delenv("W4Y_SHARED_MOTOR", raising=False)


def _in_tenant(home):
    """Pin ``home`` the way ``platform_tenant_request_scope`` does per request."""

    class _Scope:
        def __enter__(self):
            self.token = set_wayne_home_override(str(home))
            return home

        def __exit__(self, *exc):
            reset_wayne_home_override(self.token)
            return False

    return _Scope()


def test_user_id_is_tenant_scoped_on_a_shared_motor(shared_motor):
    with _in_tenant(shared_motor / "t-alpha"):
        alpha = ws._connector_user_id("global")
    with _in_tenant(shared_motor / "t-beta"):
        beta = ws._connector_user_id("global")

    assert alpha == "t-alpha:global"
    assert beta == "t-beta:global"
    # The leak this guards: without the prefix both tenants ask Composio as
    # "global" and each sees the other's connected accounts.
    assert alpha != beta


def test_user_id_stays_bare_off_a_shared_motor(dedicated_motor):
    """A dedicated install has no prefix on either side, so the id stays bare."""
    assert ws._connector_user_id("global") == "global"
    assert ws._connector_user_id("vendas") == "vendas"


@pytest.fixture
def desktop_home(dedicated_motor, tmp_path, monkeypatch):
    """A local engine's home, with a helper to write the identity line."""
    home = tmp_path / "desktop-home"
    home.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(ws, "_connector_base_home", lambda: home)

    def _identity(value: str | None):
        (home / ".env").write_text(
            "" if value is None else f"W4Y_CONNECTOR_USER_ID={value}\n",
            encoding="utf-8",
        )

    return _identity


def test_desktop_adopts_the_tenant_identity_the_cloud_handed_it(desktop_home):
    """The desktop must ask under the id the cloud filed the connections under.

    This is the bug where the connectors page came back empty on a cloud tenant:
    the cloud stores "t-alpha:global", the local engine asked for bare "global",
    and nothing matched — while the tools kept working, because the MCP session
    was minted cloud-side with the right id.
    """
    desktop_home("t-alpha:global")

    assert ws._connector_user_id("global") == "t-alpha:global"
    assert ws._connector_user_id("vendas") == "t-alpha:vendas"


def test_desktop_reads_both_the_new_and_the_legacy_id(desktop_home):
    """Apps connected before the hint existed are filed under the bare id."""
    desktop_home("t-alpha:global")

    assert ws._connector_user_ids("global") == ["t-alpha:global", "global"]


def test_identity_does_not_survive_an_account_switch(desktop_home, monkeypatch):
    """The shell clears the line on switch, and the engine must follow at once.

    Reading through ``os.environ`` would not: dotenv never unsets what it has
    already put there, so the previous tenant's prefix would outlive the switch
    and this device would ask for their scope with the new account's key.
    """
    desktop_home("t-alpha:global")
    assert ws._connector_user_id("global") == "t-alpha:global"

    monkeypatch.setenv("W4Y_CONNECTOR_USER_ID", "t-alpha:global")
    desktop_home(None)

    assert ws._connector_user_id("global") == "global"


def test_shared_motor_never_reads_the_bare_id(shared_motor):
    """Widening the read set there would undo what the prefix bought.

    The bare id is what dedicated installs and desktops use, so nothing says it
    belongs to the tenant asking.
    """
    with _in_tenant(shared_motor / "t-alpha"):
        assert ws._connector_user_ids("global") == ["t-alpha:global"]


def test_a_junk_hint_is_ignored(desktop_home):
    """A hand-edited .env must not turn into a bogus prefix."""
    desktop_home("someone@example.com")

    assert ws._connector_user_id("global") == "global"
    assert ws._connector_user_ids("global") == ["global"]


def test_accounts_merge_across_ids_without_duplicates(desktop_home, monkeypatch):
    desktop_home("t-alpha:global")
    by_uid = {
        "t-alpha:global": [{"id": "acc-cloud"}, {"id": "acc-both"}],
        "global": [{"id": "acc-legacy"}, {"id": "acc-both"}],
    }

    def fake_request(method, path, *, params=None, body=None):
        return {"items": by_uid.get((params or {}).get("user_ids") or "", [])}

    monkeypatch.setattr(ws, "_composio_request", fake_request)

    ids = [it["id"] for it in ws._connector_accounts("global")]
    assert ids == ["acc-cloud", "acc-both", "acc-legacy"]


def test_connector_state_is_written_to_the_tenant_home(shared_motor):
    alpha = shared_motor / "t-alpha"
    with _in_tenant(alpha):
        assert ws._connector_base_home() == alpha
        # No fan-out across profiles: `list_profiles` is anchored on the
        # container's HOME, so it would enumerate other tenants' profiles.
        assert ws._connector_homes("global") == [alpha]


def test_composio_key_does_not_leak_between_tenants(shared_motor, monkeypatch):
    """The tenant's own key wins, and does not survive into the next request.

    The ordering is the point: reading A's key through a dotenv load would
    leave it in ``os.environ``, and B — which has no key of its own — would be
    handed A's instead of the platform secret.
    """
    alpha = shared_motor / "t-alpha"
    (alpha / ".env").write_text("COMPOSIO_API_KEY=tenant-key\n", encoding="utf-8")
    monkeypatch.setenv("COMPOSIO_API_KEY", "shared-fly-secret")

    with _in_tenant(alpha):
        assert ws._composio_key() == "tenant-key"

    with _in_tenant(shared_motor / "t-beta"):
        assert ws._composio_key() == "shared-fly-secret"


@pytest.mark.parametrize(
    "uid,expected",
    [
        ("t-alpha:global", ("t-alpha", "global")),
        ("t-alpha:vendas", ("t-alpha", "vendas")),
        ("global", ("", "global")),
        ("vendas", ("", "vendas")),
        ("someone@example.com", None),
        ("", None),
    ],
)
def test_event_scope_round_trips_the_user_id(uid, expected):
    """Webhooks bypass the auth gate, so the uid is the only owner signal."""
    assert ws._connector_event_scope(uid) == expected


def test_event_scope_reverses_what_user_id_produces(shared_motor):
    with _in_tenant(shared_motor / "t-beta"):
        uid = ws._connector_user_id("vendas")

    assert ws._connector_event_scope(uid) == ("t-beta", "vendas")


def test_event_home_pins_the_owning_tenant(shared_motor, monkeypatch):
    """A webhook must land in the home of the tenant that owns the connection."""
    from work4you_cli import platform_tenant
    from work4you_constants import get_wayne_home

    monkeypatch.setattr(
        platform_tenant,
        "fetch_tenant_runtime",
        lambda tenant_id: {"ok": True, "openrouterKey": "sk-or-test", "plan": "free"},
    )

    with ws._connector_event_home("t-beta"):
        assert get_wayne_home() == platform_tenant.tenant_home_path("t-beta")

    assert get_wayne_home() != platform_tenant.tenant_home_path("t-beta")


def test_event_home_is_a_noop_off_a_shared_motor(dedicated_motor):
    from work4you_constants import get_wayne_home

    before = get_wayne_home()
    with ws._connector_event_home("wayne-w4y"):
        # A legacy "<app>:<scope>" uid must not conjure a bogus tenant home.
        assert get_wayne_home() == before


def _composio_stub(monkeypatch, owned_by_uid):
    """Stand in for Composio, answering list calls per ``user_ids``.

    Returns the recorded calls so a test can assert that a refused delete never
    reached the upstream API.
    """
    calls: list[tuple[str, str]] = []

    def fake_request(method, path, *, params=None, body=None):
        calls.append((method, path))
        if method == "GET":
            uid = (params or {}).get("user_ids") or ""
            return {"items": [{"id": i} for i in owned_by_uid.get(uid, [])]}
        return {"ok": True}

    monkeypatch.setattr(ws, "_composio_request", fake_request)
    return calls


def test_disconnect_refuses_an_account_owned_by_another_tenant(shared_motor, monkeypatch):
    """The id alone is enough for the upstream API, so it cannot be enough here.

    One Composio project serves every tenant on a shared motor. Deleting by id
    without checking the owner let any signed-in tenant revoke another tenant's
    Gmail through our own API — no key extraction needed.
    """
    calls = _composio_stub(
        monkeypatch,
        {"t-alpha:global": ["acc-alpha"], "t-beta:global": ["acc-beta"]},
    )

    with _in_tenant(shared_motor / "t-alpha"):
        with pytest.raises(ws.HTTPException) as err:
            asyncio.run(ws.connectors_disconnect("acc-beta"))

    assert err.value.status_code == 404
    assert not [c for c in calls if c[0] == "DELETE"]


def test_disconnect_still_removes_the_callers_own_account(shared_motor, monkeypatch):
    calls = _composio_stub(monkeypatch, {"t-alpha:global": ["acc-alpha"]})

    with _in_tenant(shared_motor / "t-alpha"):
        assert asyncio.run(ws.connectors_disconnect("acc-alpha")) == {"ok": True}

    assert ("DELETE", "/api/v3/connected_accounts/acc-alpha") in calls


def test_trigger_delete_checks_ownership_too(shared_motor, monkeypatch):
    calls = _composio_stub(
        monkeypatch,
        {"t-alpha:global": ["trg-alpha"], "t-beta:global": ["trg-beta"]},
    )

    with _in_tenant(shared_motor / "t-alpha"):
        with pytest.raises(ws.HTTPException) as err:
            asyncio.run(ws.connector_trigger_delete("trg-beta"))
        assert asyncio.run(ws.connector_trigger_delete("trg-alpha")) == {"ok": True}

    assert err.value.status_code == 404
    assert ("DELETE", "/api/v3.1/trigger_instances/manage/trg-alpha") in calls


def test_ownership_check_reads_the_ids_composio_actually_returns(shared_motor, monkeypatch):
    """Accounts carry ``nanoid`` and triggers ``triggerId`` — both are the id we list."""

    def fake_request(method, path, *, params=None, body=None):
        if method == "GET":
            return {"items": [{"nanoid": "acc-nano"}, {"triggerId": "trg-camel"}]}
        return {"ok": True}

    monkeypatch.setattr(ws, "_composio_request", fake_request)

    with _in_tenant(shared_motor / "t-alpha"):
        ws._require_owned_connector_resource("account", "acc-nano", "global")
        ws._require_owned_connector_resource("trigger", "trg-camel", "global")


def test_ownership_check_cannot_be_widened_by_the_scope_argument(shared_motor, monkeypatch):
    """A caller choosing the scope still only ever enumerates their own tenant."""
    seen: list[str] = []

    def fake_request(method, path, *, params=None, body=None):
        seen.append((params or {}).get("user_ids") or "")
        return {"items": []}

    monkeypatch.setattr(ws, "_composio_request", fake_request)

    with _in_tenant(shared_motor / "t-alpha"):
        with pytest.raises(ws.HTTPException):
            ws._require_owned_connector_resource("account", "acc-beta", "t-beta:global")

    assert all(uid.startswith("t-alpha:") for uid in seen)
