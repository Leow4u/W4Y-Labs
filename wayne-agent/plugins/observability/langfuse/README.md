# Langfuse Observability Plugin

This plugin ships bundled with Wayne but is **opt-in** — it only loads when
you explicitly enable it.

## Enable

Pick one:

```bash
# Interactive: walks you through credentials + SDK install + enable
wayne tools  # → Langfuse Observability

# Manual
pip install langfuse
wayne plugins enable observability/langfuse
```

## Required credentials

Set these in `~/.wayne/.env` (or via `wayne tools`):

```bash
WAYNE_LANGFUSE_PUBLIC_KEY=pk-lf-...
WAYNE_LANGFUSE_SECRET_KEY=sk-lf-...
WAYNE_LANGFUSE_BASE_URL=https://cloud.langfuse.com   # or your self-hosted URL
```

Without the SDK or credentials the hooks no-op silently — the plugin fails
open.

## Verify

```bash
wayne plugins list                 # observability/langfuse should show "enabled"
wayne chat -q "hello"              # then check Langfuse for a "Wayne turn" trace
```

## Optional tuning

```bash
WAYNE_LANGFUSE_ENV=production       # environment tag
WAYNE_LANGFUSE_RELEASE=v1.0.0       # release tag
WAYNE_LANGFUSE_SAMPLE_RATE=0.5      # sample 50% of traces
WAYNE_LANGFUSE_MAX_CHARS=12000      # max chars per field (default: 12000)
WAYNE_LANGFUSE_DEBUG=true           # verbose plugin logging
```

## Disable

```bash
wayne plugins disable observability/langfuse
```
