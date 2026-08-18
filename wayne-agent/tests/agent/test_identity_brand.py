"""Baked-in agent identity must be Work4You — never a legacy product brand."""

from agent.prompt_builder import DEFAULT_AGENT_IDENTITY, WAYNE_AGENT_HELP_GUIDANCE
from work4you_cli.default_soul import (
    claims_legacy_product_brand,
    is_product_seeded_soul,
)


def test_default_identity_is_work4you_only():
    assert "Work4You" in DEFAULT_AGENT_IDENTITY
    assert "You are Wayne" not in DEFAULT_AGENT_IDENTITY
    assert "Wayne Agent" not in DEFAULT_AGENT_IDENTITY
    assert "Nous Research" not in DEFAULT_AGENT_IDENTITY
    assert "Hermes Agent" not in DEFAULT_AGENT_IDENTITY
    assert "hermes-agent.nousresearch.com" not in DEFAULT_AGENT_IDENTITY


def test_help_guidance_does_not_teach_legacy_brands():
    assert "Work4You" in WAYNE_AGENT_HELP_GUIDANCE
    assert "Wayne Agent" not in WAYNE_AGENT_HELP_GUIDANCE
    assert "Nous Research" not in WAYNE_AGENT_HELP_GUIDANCE


def test_claims_legacy_product_brand_catches_near_matches():
    assert claims_legacy_product_brand(
        "# Wayne Agent Persona\nYou are Wayne Agent, created by Nous Research.\n"
    )
    assert claims_legacy_product_brand(
        "Sim! Sou o Wayne Agent, criado pela Nous Research."
    )
    assert not claims_legacy_product_brand("You are a helpful pirate named Wayne.")
    assert is_product_seeded_soul(
        "You are Wayne Agent, an intelligent AI assistant created by Nous Research."
    )


def test_heal_legacy_product_soul_unlinks_seed(tmp_path):
    from work4you_cli.default_soul import heal_legacy_product_soul

    soul = tmp_path / "SOUL.md"
    soul.write_text(
        "You are Wayne Agent, an intelligent AI assistant created by Nous Research.",
        encoding="utf-8",
    )
    assert heal_legacy_product_soul(tmp_path) is True
    assert not soul.exists()


def test_heal_legacy_product_soul_keeps_custom_persona(tmp_path):
    from work4you_cli.default_soul import heal_legacy_product_soul

    soul = tmp_path / "SOUL.md"
    soul.write_text("You are a concise technical expert. No fluff.", encoding="utf-8")
    assert heal_legacy_product_soul(tmp_path) is False
    assert soul.exists()


def test_stored_prompt_rejects_legacy_brand_identity():
    from agent.conversation_loop import _stored_prompt_matches_runtime

    class _Agent:
        model = "x"
        provider = "y"

    legacy = (
        "You are Wayne Agent, an intelligent AI assistant created by Nous Research.\n"
        "Model: x\n"
        "Provider: y\n"
    )
    assert _stored_prompt_matches_runtime(_Agent(), legacy) is False
    clean = "You are Work4You.\nModel: x\nProvider: y\n"
    assert _stored_prompt_matches_runtime(_Agent(), clean) is True
