# -*- coding: utf-8 -*-
"""Create Stripe Billing Meter + metered overage price ($0.01/unit).

Requires STRIPE_SECRET_KEY in the environment (or platform/web/.env.local).
Wires STRIPE_PRICE_OVERAGE into .env.local and deploy-web.ps1.
"""
from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(r"C:\DEV\W4Y Labs")
ENV_LOCAL = ROOT / "platform" / "web" / ".env.local"
DEPLOY = ROOT / "platform" / "infra" / "deploy-web.ps1"
API = "https://api.stripe.com/v1"
STRIPE_VERSION = "2025-03-31.basil"
EVENT_NAME = "w4y_ondemand_overage_cent"
META = "ondemand_overage_cent"


def load_secret() -> str:
    env = (os.environ.get("STRIPE_SECRET_KEY") or "").strip()
    if env:
        return env
    if ENV_LOCAL.exists():
        text = ENV_LOCAL.read_text(encoding="utf-8")
        m = re.search(r"^STRIPE_SECRET_KEY=(.+)$", text, re.M)
        if m:
            return m.group(1).strip().strip('"').strip("'")
    raise SystemExit("STRIPE_SECRET_KEY missing (env or .env.local)")


def stripe(secret: str, path: str, form: dict[str, str] | None = None, method: str | None = None) -> dict:
    data = None
    headers = {
        "Authorization": f"Bearer {secret}",
        "Stripe-Version": STRIPE_VERSION,
    }
    verb = method or ("POST" if form is not None else "GET")
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        headers["Content-Type"] = "application/x-www-form-urlencoded"
    req = urllib.request.Request(f"{API}/{path}", data=data, headers=headers, method=verb)
    try:
        with urllib.request.urlopen(req, timeout=60) as res:
            return json.loads(res.read().decode())
    except urllib.error.HTTPError as e:
        body = e.read().decode(errors="replace")
        raise SystemExit(f"stripe {path} failed: {e.code} {body[:800]}") from e


def find_meter(secret: str) -> str | None:
    payload = stripe(secret, "billing/meters?limit=100")
    for meter in payload.get("data", []):
        if meter.get("event_name") == EVENT_NAME and meter.get("status") != "inactive":
            return meter["id"]
    return None


def ensure_meter(secret: str) -> str:
    existing = find_meter(secret)
    if existing:
        print(f"reusing meter {existing}")
        return existing
    meter = stripe(
        secret,
        "billing/meters",
        {
            "display_name": "Work4You On-Demand Overage (cents)",
            "event_name": EVENT_NAME,
            "default_aggregation[formula]": "sum",
            "customer_mapping[type]": "by_id",
            "customer_mapping[event_payload_key]": "stripe_customer_id",
            "value_settings[event_payload_key]": "value",
        },
    )
    print(f"created meter {meter['id']}")
    return meter["id"]


def find_existing_overage_price(secret: str) -> str | None:
    payload = stripe(secret, "prices?limit=100&active=true")
    for price in payload.get("data", []):
        meta = price.get("metadata") or {}
        if meta.get("w4y") == META:
            return price["id"]
    return None


def create_overage_price(secret: str, meter_id: str) -> str:
    product = stripe(
        secret,
        "products",
        {
            "name": "Work4You On-Demand Overage",
            "description": "Usage beyond included plan credits. $0.01 per unit (1 unit = $0.01 USD).",
            "metadata[w4y]": "ondemand_overage",
        },
    )
    price = stripe(
        secret,
        "prices",
        {
            "product": product["id"],
            "currency": "usd",
            "unit_amount": "1",
            "nickname": "On-demand overage ($0.01)",
            "billing_scheme": "per_unit",
            "recurring[interval]": "month",
            "recurring[usage_type]": "metered",
            "recurring[meter]": meter_id,
            "metadata[w4y]": META,
            "metadata[w4y_event_name]": EVENT_NAME,
        },
    )
    return price["id"]


def upsert_env_local(price_id: str) -> None:
    if not ENV_LOCAL.exists():
        ENV_LOCAL.write_text(f"STRIPE_PRICE_OVERAGE={price_id}\n", encoding="utf-8")
        return
    text = ENV_LOCAL.read_text(encoding="utf-8")
    line = f"STRIPE_PRICE_OVERAGE={price_id}"
    if re.search(r"^STRIPE_PRICE_OVERAGE=", text, re.M):
        text = re.sub(r"^STRIPE_PRICE_OVERAGE=.*$", line, text, count=1, flags=re.M)
    else:
        if not text.endswith("\n"):
            text += "\n"
        text += line + "\n"
    ENV_LOCAL.write_text(text, encoding="utf-8")


def upsert_deploy(price_id: str) -> None:
    text = DEPLOY.read_text(encoding="utf-8")
    entry = f"'STRIPE_PRICE_OVERAGE={price_id}'"
    if re.search(r"STRIPE_PRICE_OVERAGE=price_[A-Za-z0-9]+", text):
        text = re.sub(
            r"'STRIPE_PRICE_OVERAGE=price_[A-Za-z0-9]+'",
            entry,
            text,
            count=1,
        )
    else:
        text = text.replace(
            "'STRIPE_PRICE_MAX_YEAR=price_1TqadmCn608ngT3W1TyH0tDQ'",
            f"'STRIPE_PRICE_MAX_YEAR=price_1TqadmCn608ngT3W1TyH0tDQ',\n        {entry}",
            1,
        )
        # Drop leftover placeholder comments.
        text = re.sub(r"[ \t]*# After creating a metered.*\n", "", text)
        text = re.sub(r"[ \t]*# 'STRIPE_PRICE_OVERAGE=price_XXXXXXXX'.*\n?", "", text)
    DEPLOY.write_text(text, encoding="utf-8")


def main() -> None:
    secret = load_secret()
    print(f"mode={'test' if secret.startswith('sk_test_') else 'live'}")
    meter_id = ensure_meter(secret)
    existing = find_existing_overage_price(secret)
    if existing:
        price_id = existing
        print(f"reusing existing price {price_id}")
    else:
        price_id = create_overage_price(secret, meter_id)
        print(f"created price {price_id}")
    upsert_env_local(price_id)
    upsert_deploy(price_id)
    print("wired STRIPE_PRICE_OVERAGE into .env.local and deploy-web.ps1")
    print(f"meter_event_name={EVENT_NAME}")


if __name__ == "__main__":
    main()
