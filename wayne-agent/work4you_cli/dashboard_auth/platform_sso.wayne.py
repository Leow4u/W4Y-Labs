"""Cross-subdomain SSO ticket (platform work4you.ai → app.work4you.ai)."""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from dataclasses import dataclass
from typing import Optional


@dataclass(frozen=True)
class PlatformSsoClaims:
    tenant_id: str
    email: str = ""


def _secret() -> str:
    return (
        os.environ.get("W4Y_PLATFORM_SSO_SECRET")
        or os.environ.get("PROVISIONER_SHARED_SECRET")
        or ""
    ).strip()


def _shared_motor() -> bool:
    return (os.environ.get("W4Y_SHARED_MOTOR") or "").strip() in ("1", "true", "yes")


def verify_platform_sso_ticket(ticket: str) -> Optional[str]:
    """Return tenant_id when *ticket* is valid; else None."""
    claims = verify_platform_sso_claims(ticket)
    return claims.tenant_id if claims else None


def verify_platform_sso_claims(ticket: str) -> Optional[PlatformSsoClaims]:
    """Parse and validate SSO ticket; return tenant + email claims."""
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
    # Dedicated Fly apps pin one tenant; shared motor accepts all platform tenants.
    if env_tid and not _shared_motor() and tid != env_tid:
        return None
    email = str(payload.get("email") or "").strip().lower()
    return PlatformSsoClaims(tenant_id=tid, email=email)
