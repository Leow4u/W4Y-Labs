# Security surfaces — Work4You (v1)

> **Modelo v1:** 1 email = 1 tenant Fly (isolamento físico). Sem multi-user intra-tenant.

## Platform web (`work4you.ai`)

| Route / area | Auth | Rate limit | Notes |
|--------------|------|------------|-------|
| `/`, marketing | Public | CDN/LB | CSP via middleware |
| `/login`, Firebase verify | Firebase JWT | 20/min/IP | Signed session cookie |
| `/instancias`, `/admin` | Session cookie | — | Middleware redirect |
| `/planos/*`, checkout | Session | — | Stripe webhook HMAC |
| `/device/engine-key` | Session | 3/min/email | Desktop key delivery |
| Auto-provision Free | Firebase + Turnstile | login bucket | `FREE_OPEN=1`, `ALLOW_ALL_EMAILS=1` prod |

**Env production:** `W4Y_SESSION_SECRET` (32+ bytes), `ALLOW_ALL_EMAILS=1` or allowlist.

## Cloud tenant (Fly / dashboard)

| Surface | Auth | Default bind |
|---------|------|--------------|
| Dashboard REST + WS | SSO ticket / session token | Public tenant URL |
| `api_server` | `API_SERVER_KEY` | **127.0.0.1:8642** |
| Gateway channels | Platform tokens + DM pairing | Per profile |
| Webhooks inbound | HMAC per route | Profile path |
| Config UI schema | Session | **Credentials hidden** from schema |

## Desktop (Electron)

| Surface | Auth | Notes |
|---------|------|-------|
| Login flow | Platform session → `/device/engine-key` | Key once to `WORK4YOU_HOME/.env` |
| Engine update | `latest.json` + optional Ed25519 | `W4Y_ENGINE_UPDATE_PUBLIC_KEY_B64` |
| NSIS installer | SSL.com code signing | `CSC_LINK` + `CSC_KEY_PASSWORD` at build |
| YOLO / approvals | User opt-in | Double-click arm + warnings |

## Terminal (TUI / CLI)

| Surface | Auth | Notes |
|---------|------|-------|
| Local CLI | OS user | Full terminal power |
| `work4you --tui` | Same as CLI | No network auth by default |
| Remote dashboard PTY | Dashboard session | WebSocket `?token=` on loopback |

## Secrets

- User API keys: `WORK4YOU_HOME/.env` only
- Platform: Secret Manager / Fly secrets
- Never in config.yaml UI for `basic_auth`, `auxiliary.*.api_key`, `delegation.api_key`
