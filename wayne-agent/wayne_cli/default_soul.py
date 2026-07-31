"""SOUL.md product policy for Work4You.

Product identity is baked into the runtime (DEFAULT_AGENT_IDENTITY), like Cursor —
not a public SOUL.md the user is meant to treat as the product persona.

SOUL.md on disk is only an advanced override when the user wrote a real custom
persona. Product-seeded / legacy Wayne templates are ignored (and cleaned up).
"""

from __future__ import annotations

# Historical product default (Wayne / Nous) — treated as non-user content.
_WAYNE_NOUS_DEFAULT_SOUL = (
    "You are Wayne Agent, an intelligent AI assistant created by Nous Research. "
    "You are helpful, knowledgeable, and direct. You assist users with a wide "
    "range of tasks including answering questions, writing and editing code, "
    "analyzing information, creative work, and executing actions via your tools. "
    "You communicate clearly, admit uncertainty when appropriate, and prioritize "
    "being genuinely useful over being verbose unless otherwise directed below. "
    "Be targeted and efficient in your exploration and investigations."
)

# Kept as an alias for callers/tests that still import DEFAULT_SOUL_MD.
# Work4You no longer seeds this file as product identity.
DEFAULT_SOUL_MD = _WAYNE_NOUS_DEFAULT_SOUL

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
    # Old `doctor --fix` seed: carried actual persona text ("You are Wayne"),
    # but it was installer-written, so existing installs must be neutralized.
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


def _normalize_soul(text: str) -> str:
    """Normalize SOUL.md content for template comparison."""
    return text.replace("\r\n", "\n").replace("\r", "\n").lstrip("\ufeff").strip()


def is_legacy_template_soul(text: str) -> bool:
    """True if ``text`` is an old comment-only scaffold (no user persona)."""
    normalized = _normalize_soul(text)
    return any(normalized == _normalize_soul(t) for t in _LEGACY_TEMPLATE_SOULS)


def is_product_seeded_soul(text: str) -> bool:
    """True if ``text`` is a product/installer seed — not a user-authored persona.

    These must not override the baked-in Work4You identity (Cursor-style).
    """
    if not text or not str(text).strip():
        return True
    normalized = _normalize_soul(text)
    if normalized == _normalize_soul(_WAYNE_NOUS_DEFAULT_SOUL):
        return True
    return is_legacy_template_soul(text)
