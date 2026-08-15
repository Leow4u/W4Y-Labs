"""Sanitize user-visible strings — strip legacy Wayne/Hermes/Nous product names."""

from __future__ import annotations

import re

from work4you_cli.relay_free_model import W4Y_DOCS_BASE, W4Y_LOGIN_URL

# Order matters: longer / specific phrases before bare tokens.
_BRAND_REPLACEMENTS: tuple[tuple[re.Pattern[str], str], ...] = (
    (re.compile(r"\bMotor Wayne\b", re.I), "Work4You"),
    (re.compile(r"\bWayne Agent\b", re.I), "Work4You"),
    (re.compile(r"\bHermes Agent\b", re.I), "Work4You"),
    (re.compile(r"\bNous Research\b", re.I), "Work4You"),
    (re.compile(r"\bNous Portal\b", re.I), "Work4You account"),
    (re.compile(r"\bNous subscription\b", re.I), "Work4You subscription"),
    (re.compile(r"\bNous credits\b", re.I), "Work4You credits"),
    (re.compile(r"\bWayne Setup\b", re.I), "Work4You Setup"),
    (re.compile(r"\bWayne\b", re.I), "Work4You"),
    (re.compile(r"\bHermes\b", re.I), "Work4You"),
)

_LEGACY_DOCS_PREFIX = "https://hermes-agent.nousresearch.com/docs"


def product_docs_url(path: str = "") -> str:
    """Map a legacy Hermes docs path to Work4You documentation."""
    segment = (path or "").strip().lstrip("/")
    return f"{W4Y_DOCS_BASE}/{segment}" if segment else W4Y_DOCS_BASE


def sanitize_product_copy(text: str) -> str:
    if not text:
        return text
    out = text.replace(_LEGACY_DOCS_PREFIX, W4Y_DOCS_BASE)
    for pattern, replacement in _BRAND_REPLACEMENTS:
        out = pattern.sub(replacement, out)
    return out


__all__ = ["W4Y_DOCS_BASE", "W4Y_LOGIN_URL", "product_docs_url", "sanitize_product_copy"]
