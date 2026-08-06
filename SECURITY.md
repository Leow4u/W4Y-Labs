# Security Policy — Work4You

## Supported versions

| Channel | Supported |
|---------|-----------|
| Desktop (latest published on GCS) | Yes |
| Cloud tenant (Fly / Cloud Run) | Yes |
| Platform web (work4you.ai) | Yes |

## Reporting a vulnerability

Email **security@work4you.ai** with:

- Description of the issue and impact
- Steps to reproduce
- Affected surface (web / desktop / cloud tenant / CLI)

Do **not** open public GitHub issues for security reports.

We aim to acknowledge reports within **3 business days** and provide a status
update within **10 business days**.

## Scope

In scope:

- Cross-tenant access, session forgery, authentication bypass
- Unauthorized access to tenant data, API keys, or billing
- Remote code execution via platform, dashboard, or update channel
- Supply-chain compromise of published installers or engine updates

Out of scope:

- Social engineering of individual users
- Issues in third-party services (Firebase, Stripe, Fly.io, OpenRouter) unless
  caused by our integration
- Denial of service without demonstrated tenant data impact

## Product security model (v1)

- **1 email = 1 tenant** — physical isolation per Fly app; no multi-user org in v1.
- Desktop and terminal run with the user's OS privileges — enable approvals and
  avoid YOLO on untrusted prompts.
- Engine and desktop updates are distributed via HTTPS; signed manifests are
  verified when `sha256` and `signature` are present in `latest.json`.

## Security documentation

- `docs/SECURITY-SURFACES.md` — exposed routes and auth boundaries
- `docs/SECURITY-RUNBOOK.md` — incident response
- `docs/SECURITY-SIGNING.md` — code signing and engine update keys
