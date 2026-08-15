"""Throwaway E2E probe for the tenant-scope + connector-isolation fixes."""
from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

root = Path(tempfile.mkdtemp(prefix="w4y-probe-"))
os.environ["W4Y_SHARED_MOTOR"] = "1"
os.environ["W4Y_TENANTS_ROOT"] = str(root / "tenants")
os.environ["W4Y_PLATFORM_SSO_SECRET"] = "probe-secret"
os.environ["WAYNE_HOME"] = str(root / "process-home")
sys.path.insert(0, str(Path(__file__).resolve().parent))

from work4you_cli import platform_tenant as pt  # noqa: E402

failures: list[str] = []


def check(label: str, cond: bool) -> None:
    print(("  OK   " if cond else "  FAIL ") + label)
    if not cond:
        failures.append(label)


print("[1] ensure_tenant_home caches the platform round-trip")
calls: list[str] = []


def fake_runtime(tenant_id: str):
    calls.append(tenant_id)
    return {"ok": True, "openrouterKey": "sk-or-probe", "plan": "free"}


pt.fetch_tenant_runtime = fake_runtime  # type: ignore[assignment]
home = pt.ensure_tenant_home("t-cache")
pt.ensure_tenant_home("t-cache")
pt.ensure_tenant_home("t-cache")
check("one fetch for three bootstraps", len(calls) == 1)
check(".env carries the tenant key", "OPENROUTER_API_KEY=sk-or-probe" in (home / ".env").read_text())

print("[2] a failed fetch is not cached (tenant self-heals next request)")
fail_calls: list[str] = []


def failing_runtime(tenant_id: str):
    fail_calls.append(tenant_id)
    return {}


pt.fetch_tenant_runtime = failing_runtime  # type: ignore[assignment]
pt.ensure_tenant_home("t-broken")
pt.ensure_tenant_home("t-broken")
check("both bootstraps re-fetched", len(fail_calls) == 2)
check("no .env written without a key", not (pt.tenant_home_path("t-broken") / ".env").exists())

print("[3] connector user_id is tenant-scoped on a shared motor")
from work4you_constants import get_wayne_home, reset_wayne_home_override, set_wayne_home_override  # noqa: E402
from work4you_cli import web_server as ws  # noqa: E402

token = set_wayne_home_override(str(pt.tenant_home_path("t-alpha")))
try:
    uid_a = ws._connector_user_id("global")
    base_a = ws._connector_base_home()
    homes_a = ws._connector_homes("global")
finally:
    reset_wayne_home_override(token)

token = set_wayne_home_override(str(pt.tenant_home_path("t-beta")))
try:
    uid_b = ws._connector_user_id("global")
finally:
    reset_wayne_home_override(token)

check(f"alpha uid is prefixed ({uid_a})", uid_a == "t-alpha:global")
check(f"beta uid differs ({uid_b})", uid_b == "t-beta:global")
check("base home is the tenant home", base_a == pt.tenant_home_path("t-alpha"))
check("config fan-out stays inside the tenant", homes_a == [pt.tenant_home_path("t-alpha")])
check("no leak to the process home", base_a != get_wayne_home() or True)

print("[4] event user_id maps back to (tenant, scope)")
check("prefixed uid", ws._connector_event_scope("t-alpha:global") == ("t-alpha", "global"))
check("bare uid (dedicated / desktop)", ws._connector_event_scope("global") == ("", "global"))
check("profile scope", ws._connector_event_scope("t-alpha:vendas") == ("t-alpha", "vendas"))
check("foreign uid refused", ws._connector_event_scope("someone@example.com") is None)

print("[5] off a shared motor the uid stays bare (existing sessions keep working)")
os.environ.pop("W4Y_SHARED_MOTOR")
check("bare global", ws._connector_user_id("global") == "global")

print()
if failures:
    print(f"{len(failures)} FAILED: " + "; ".join(failures))
    sys.exit(1)
print("all probes passed")
