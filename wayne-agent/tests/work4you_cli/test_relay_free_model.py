"""Contract tests for Relay 2.5 Fast free-tier model stack."""

from work4you_cli.relay_free_model import (
    RELAY_FREE_FALLBACK_MODEL,
    RELAY_FREE_PRIMARY_MODEL,
    RELAY_FREE_PROVIDER,
    relay_free_fallback_chain,
    relay_free_model_config_patch,
)


def test_relay_free_primary_is_qwen_flash():
    assert RELAY_FREE_PRIMARY_MODEL == "qwen/qwen3.7-flash"


def test_relay_free_fallback_is_gpt_oss():
    assert RELAY_FREE_FALLBACK_MODEL == "openai/gpt-oss-20b"


def test_relay_free_fallback_chain_openrouter():
    chain = relay_free_fallback_chain()
    assert len(chain) == 1
    assert chain[0]["provider"] == RELAY_FREE_PROVIDER
    assert chain[0]["model"] == RELAY_FREE_FALLBACK_MODEL


def test_relay_free_config_patch_wires_primary_and_fallback():
    patch = relay_free_model_config_patch()
    assert patch["model"]["default"] == RELAY_FREE_PRIMARY_MODEL
    assert patch["model"]["provider"] == RELAY_FREE_PROVIDER
    assert patch["fallback_model"] == relay_free_fallback_chain()
