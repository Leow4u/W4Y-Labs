# Third-Party Notices

Work4You includes open-source software components. Each component remains
subject to its original license. This file is generated/maintained as part of
release hygiene.

Run dependency license audit before each major release:

```bash
cd wayne-agent && uv pip install pip-licenses && pip-licenses --format=markdown
cd wayne-agent/apps/work4you && npm ls --all
```

Major runtime dependencies include (non-exhaustive):

- Python: FastAPI, Starlette, Pydantic, httpx, PyYAML, LiteLLM adapters
- Node: Electron, React, Next.js, jose, Firebase client SDKs
- Infrastructure: Fly.io, Google Cloud, Stripe, Firebase Auth, Cloudflare Turnstile

Product license: see `LEGAL/LICENSE.md`.
