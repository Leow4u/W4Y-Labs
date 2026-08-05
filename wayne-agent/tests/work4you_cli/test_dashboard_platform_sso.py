"""Tests for platform → app SSO ticket verification."""
import base64
import hashlib
import hmac
import json
import os
import time

import pytest

from work4you_cli.dashboard_auth.platform_sso import verify_platform_sso_ticket


def _mint(secret: str, tenant_id: str, *, exp: int | None = None) -> str:
    payload = json.dumps(
        {"exp": exp if exp is not None else int(time.time()) + 60, "tid": tenant_id},
        separators=(",", ":"),
    )
    b64 = base64.urlsafe_b64encode(payload.encode()).decode().rstrip("=")
    sig = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), b64.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    return f"{b64}.{sig}"


@pytest.fixture
def sso_env(monkeypatch):
    monkeypatch.setenv("W4Y_PLATFORM_SSO_SECRET", "test-sso-secret")
    monkeypatch.setenv("W4Y_TENANT_ID", "t-acme")


def test_valid_ticket_returns_tenant(sso_env):
    ticket = _mint("test-sso-secret", "t-acme")
    assert verify_platform_sso_ticket(ticket) == "t-acme"


def test_expired_ticket_rejected(sso_env):
    ticket = _mint("test-sso-secret", "t-acme", exp=int(time.time()) - 10)
    assert verify_platform_sso_ticket(ticket) is None


def test_wrong_tenant_rejected_when_env_pinned(sso_env):
    ticket = _mint("test-sso-secret", "t-other")
    assert verify_platform_sso_ticket(ticket) is None
