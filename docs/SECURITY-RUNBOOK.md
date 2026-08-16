# Security runbook — Work4You

## Incident types

### Suspected cross-tenant access

1. Confirm topology: 1 Fly app per tenant — cross-tenant requires separate bug (SSO ticket, platform DB).
2. Revoke affected tenant dashboard secrets via Fly secrets rotate.
3. Force user re-login (invalidate session — rotate `W4Y_SESSION_SECRET` invalidates all platform sessions).

### Leaked OpenRouter / device key

1. Revoke key in OpenRouter / provisioner registry.
2. `billing_events` audit by tenant_id.
3. Issue new device key on next desktop login.

### Leaked Composio project key

The tenant's connector key reaches devices from the tenant's own engine
(`GET /api/device/connector-bootstrap`), and it is the same key the tenant's Fly
app uses. There is **no rotation path**: the org has `regenerate_api_key`
disabled (403) and the per-key endpoint is not exposed under org-key auth, so
"rotate the key" is not an option — see `docs/BACKEND-MAP.md`.

1. Disconnect the affected accounts in the Composio dashboard (revokes the OAuth
   grants the key could reach) and disable the project's triggers.
2. Create a **new** project for the tenant, set `COMPOSIO_API_KEY` on its Fly app
   from the creation response, and have the user reconnect the apps.
3. Audit `connected_accounts` for that project for connections the user did not
   make.

Blast radius while a key is out: the whole project. On a dedicated tenant that
is one customer; on the shared motor the project is shared, so treat it as a
cross-tenant incident and follow that section too.

### Compromised GCS update bucket

1. Disable public access; rotate engine signing key pair.
2. Publish new signed manifest + casca with new public key embedded.
3. Notify users to update immediately.

### Abuse (free tier farming)

1. Enable / tighten Turnstile on provision path.
2. Block IP at Cloud Armor.
3. Suspend tenant: set billing status + revoke keys.

## Kill switch (tenant)

```sql
-- Platform DB: mark tenant suspended (adjust to your schema)
UPDATE billing SET status = 'suspended' WHERE tenant_id = '<id>';
```

Revoke Fly secrets for that app via provisioner admin tooling.

## Contacts

- security@work4you.ai — vulnerabilities
- abuse@work4you.ai — ToS violations

## Rotation schedule

| Secret | Interval |
|--------|----------|
| `W4Y_SESSION_SECRET` | 90 days (forces re-login) |
| Engine signing key pair | 12 months |
| SSL.com code signing cert | Per CA expiry |
| Stripe webhook secret | On compromise only |
