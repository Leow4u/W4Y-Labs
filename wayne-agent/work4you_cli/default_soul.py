"""SOUL.md product policy for Work4You.

Product identity is baked into the runtime (DEFAULT_AGENT_IDENTITY), like Cursor —
not a public SOUL.md the user is meant to treat as the product persona.

SOUL.md on disk is only an advanced override when the user wrote a real custom
persona. Product-seeded / legacy Wayne / Hermes / Nous templates are ignored
and cleaned up so they can never answer "você é wayne agent?" with yes.
"""

from __future__ import annotations

import re

# Historical product default (Wayne / Nous) — detection + heal only. Never seed.
_LEGACY_WAYNE_NOUS_DEFAULT_SOUL = (
    "You are Wayne Agent, an intelligent AI assistant created by Nous Research. "
    "You are helpful, knowledgeable, and direct. You assist users with a wide "
    "range of tasks including answering questions, writing and editing code, "
    "analyzing information, creative work, and executing actions via your tools. "
    "You communicate clearly, admit uncertainty when appropriate, and prioritize "
    "being genuinely useful over being verbose unless otherwise directed below. "
    "Be targeted and efficient in your exploration and investigations."
)

# Back-compat alias: callers that still import DEFAULT_SOUL_MD expect the legacy
# string for "was this the product seed?" comparisons. New code must not write
# this file as identity — use DOCTOR_SCAFFOLD_SOUL_MD or leave SOUL.md absent.
DEFAULT_SOUL_MD = _LEGACY_WAYNE_NOUS_DEFAULT_SOUL

# Scaffold `doctor --fix` seeds when SOUL.md is missing: heading + comment only,
# no persona text, so it must stay detected as product-seeded (zero user intent).
DOCTOR_SCAFFOLD_SOUL_MD = (
    "# Persona\n"
    "\n"
    "<!--\n"
    "Edit this file to customize how the assistant communicates.\n"
    "It is loaded fresh each message -- no restart needed.\n"
    "Delete the contents (or this file) to use the default personality.\n"
    "-->\n"
)

# Legacy SOUL.md boilerplate that older installers/doctor runs seeded.
# Safe to ignore/remove — zero user intent.
_LEGACY_TEMPLATE_SOULS = (
    DOCTOR_SCAFFOLD_SOUL_MD,
    (
        "# Wayne Agent Persona\n"
        "\n"
        "<!-- Edit this file to customize how Wayne communicates. -->\n"
        "\n"
        "You are Wayne, a helpful AI assistant.\n"
    ),
    (
        "# Wayne Agent Persona\n"
        "\n"
        "<!--\n"
        "This file defines the agent's personality and tone.\n"
        "The agent will embody whatever you write here.\n"
        "Edit this to customize how Wayne communicates with you.\n"
        "\n"
        "Examples:\n"
        '  - "You are a warm, playful assistant who uses kaomoji occasionally."\n'
        '  - "You are a concise technical expert. No fluff, just facts."\n'
        '  - "You speak like a friendly coworker who happens to know everything."\n'
        "\n"
        "This file is loaded fresh each message -- no restart needed.\n"
        "Delete the contents (or this file) to use the default personality.\n"
        "-->"
    ),
    (
        "# Wayne Agent Persona\n"
        "\n"
        "<!--\n"
        "This file defines the agent's personality and tone.\n"
        "The agent will embody whatever you write here.\n"
        "Edit this to customize how Wayne communicates with you.\n"
        "\n"
        "This file is loaded fresh each message -- no restart needed.\n"
        "Delete the contents (or this file) to use the default personality.\n"
        "-->"
    ),
)

# Any SOUL that claims the *product* identity is Wayne / Hermes / Nous must be
# treated as legacy even when the user (or an old installer) edited whitespace
# or wrapped it in a heading — exact-match alone let those files keep answering
# "sou o Wayne Agent" in chat (17/08/2026 QA machine).
_LEGACY_BRAND_IDENTITY_PATTERNS: tuple[re.Pattern[str], ...] = (
    re.compile(r"\byou are\s+wayne\s+agent\b", re.I),
    re.compile(r"\bi am\s+wayne\s+agent\b", re.I),
    re.compile(r"\bme chamo\s+\*?wayne\*?\b", re.I),
    re.compile(r"\bsou o\s+wayne\s+agent\b", re.I),
    re.compile(r"\bcreated by\s+nous research\b", re.I),
    re.compile(r"\bcriado pela?\s+nous research\b", re.I),
    re.compile(r"\byou are\s+hermes(\s+agent)?\b", re.I),
    re.compile(r"\bhermes-agent\.nousresearch\.com\b", re.I),
    re.compile(r"\bnousresearch/hermes-agent\b", re.I),
    re.compile(r"^#\s*wayne\s+agent\s+persona\b", re.I | re.M),
)


def _normalize_soul(text: str) -> str:
    """Normalize SOUL.md content for template comparison."""
    return text.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff").strip()


def is_legacy_template_soul(text: str) -> bool:
    """True if ``text`` is an old comment-only scaffold (no user persona)."""
    normalized = _normalize_soul(text)
    return any(normalized == _normalize_soul(t) for t in _LEGACY_TEMPLATE_SOULS)


def claims_legacy_product_brand(text: str) -> bool:
    """True when the text presents Wayne / Hermes / Nous as the product identity."""
    if not text or not str(text).strip():
        return False
    normalized = _normalize_soul(text)
    return any(p.search(normalized) for p in _LEGACY_BRAND_IDENTITY_PATTERNS)


def is_product_seeded_soul(text: str) -> bool:
    """True if ``text`` is a product/installer seed — not a user-authored persona.

    These must not override the baked-in Work4You identity (Cursor-style).
    """
    if not text or not str(text).strip():
        return True
    normalized = _normalize_soul(text)
    if normalized == _normalize_soul(_LEGACY_WAYNE_NOUS_DEFAULT_SOUL):
        return True
    if is_legacy_template_soul(text):
        return True
    # Near-exact legacy seed with extra heading / trailing commentary.
    if claims_legacy_product_brand(text):
        return True
    return False
