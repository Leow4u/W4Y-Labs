"""Tests for the Nous-Wayne-3/4 non-agentic warning detector.

Prior to this check, the warning fired on any model whose name contained
``"wayne"`` anywhere (case-insensitive). That false-positived on unrelated
local Modelfiles such as ``wayne-brain:qwen3-14b-ctx16k`` — a tool-capable
Qwen3 wrapper that happens to live under the "wayne" tag namespace.

``is_nous_wayne_non_agentic`` should only match the actual Nous Research
Wayne-3 / Wayne-4 chat family.
"""

from __future__ import annotations

import pytest

from work4you_cli.model_switch import (
    _WAYNE_MODEL_WARNING,
    _check_wayne_model_warning,
    is_nous_wayne_non_agentic,
)


@pytest.mark.parametrize(
    "model_name",
    [
        "NousResearch/Wayne-3-Llama-3.1-70B",
        "NousResearch/Wayne-3-Llama-3.1-405B",
        "wayne-3",
        "Wayne-3",
        "wayne-4",
        "wayne-4-405b",
        "wayne_4_70b",
        "openrouter/wayne3:70b",
        "openrouter/nousresearch/wayne-4-405b",
        "NousResearch/Wayne3",
        "wayne-3.1",
    ],
)
def test_matches_real_nous_wayne_chat_models(model_name: str) -> None:
    assert is_nous_wayne_non_agentic(model_name), (
        f"expected {model_name!r} to be flagged as Nous Wayne 3/4"
    )
    assert _check_wayne_model_warning(model_name) == _WAYNE_MODEL_WARNING


@pytest.mark.parametrize(
    "model_name",
    [
        # Kyle's local Modelfile — qwen3:14b under a custom tag
        "wayne-brain:qwen3-14b-ctx16k",
        "wayne-brain:qwen3-14b-ctx32k",
        "wayne-honcho:qwen3-8b-ctx8k",
        # Plain unrelated models
        "qwen3:14b",
        "qwen3-coder:30b",
        "qwen2.5:14b",
        "claude-opus-4-6",
        "anthropic/claude-sonnet-4.5",
        "gpt-5",
        "openai/gpt-4o",
        "google/gemini-2.5-flash",
        "deepseek-chat",
        # Non-chat Wayne models we don't warn about
        "wayne-llm-2",
        "wayne2-pro",
        "nous-wayne-2-mistral",
        # Edge cases
        "",
        "wayne",  # bare "wayne" isn't the 3/4 family
        "wayne-brain",
        "brain-wayne-3-impostor",  # "3" not preceded by /: boundary
    ],
)
def test_does_not_match_unrelated_models(model_name: str) -> None:
    assert not is_nous_wayne_non_agentic(model_name), (
        f"expected {model_name!r} NOT to be flagged as Nous Wayne 3/4"
    )
    assert _check_wayne_model_warning(model_name) == ""


def test_none_like_inputs_are_safe() -> None:
    assert is_nous_wayne_non_agentic("") is False
    # Defensive: the helper shouldn't crash on None-ish falsy input either.
    assert _check_wayne_model_warning("") == ""
