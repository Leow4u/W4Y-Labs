"""Cross-subdomain SSO ticket (platform work4you.ai → app.work4you.ai)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time


def _secret() -> str:
    return (os.environ.get("W4Y_PLATFORM_SSO_SECRET") or "").strip()


def verify_platform_sso_ticket(ticket: str) -> str | None:
    """Return tenant_id when *ticket* is valid; else None."""
    secret = _secret()
    if not secret or not ticket or "." not in ticket:
        return None
    b64, sig_b64 = ticket.split(".", 1)
    expected_sig = base64.urlsafe_b64encode(
        hmac.new(secret.encode(), b64.encode(), hashlib.sha256).digest()
    ).decode().rstrip("=")
    if not hmac.compare_digest(expected_sig, sig_b64):
        return None
    pad = "=" * (-len(b64) % 4)
    try:
        payload = json.loads(base64.urlsafe_b64decode(b64 + pad))
    except (json.JSONDecodeError, ValueError, TypeError):
        return None
    if int(payload.get("exp") or 0) < int(time.time()):
        return None
    tid = str(payload.get("tid") or "").strip()
    if not tid:
        return None
    env_tid = (os.environ.get("W4Y_TENANT_ID") or "").strip()
    if env_tid and tid != env_tid:
        return None
    return tid
