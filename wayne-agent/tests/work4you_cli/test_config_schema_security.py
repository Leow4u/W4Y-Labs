"""Config schema must not expose tenant credentials in the dashboard UI."""

from work4you_cli.web_server import CONFIG_SCHEMA, PUBLIC_CONFIG_SCHEMA


def test_public_schema_hides_dashboard_basic_auth():
    for key in CONFIG_SCHEMA:
        if key.startswith("dashboard.basic_auth."):
            assert key not in PUBLIC_CONFIG_SCHEMA


def test_public_schema_hides_delegation_api_key():
    assert "delegation.api_key" in CONFIG_SCHEMA
    assert "delegation.api_key" not in PUBLIC_CONFIG_SCHEMA


def test_public_schema_hides_auxiliary_api_keys():
    hidden = [k for k in CONFIG_SCHEMA if k.startswith("auxiliary.") and k.endswith(".api_key")]
    assert hidden, "expected auxiliary.*.api_key entries in full schema"
    for key in hidden:
        assert key not in PUBLIC_CONFIG_SCHEMA


def test_public_schema_still_exposes_safe_security_fields():
    assert "security.redact_secrets" in PUBLIC_CONFIG_SCHEMA
    assert "approvals.mode" in PUBLIC_CONFIG_SCHEMA
