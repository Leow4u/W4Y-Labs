"""Product-facing provider labels must never say OpenRouter in user UI."""

import os
from unittest.mock import patch

from work4you_cli.model_switch import list_authenticated_providers
from work4you_cli.models import provider_label
from work4you_cli.providers import get_label


def test_get_label_openrouter_is_model_catalog():
    assert get_label("openrouter") == "Model catalog"
    assert "OpenRouter" not in get_label("openrouter")


def test_provider_label_openrouter_is_model_catalog():
    assert provider_label("openrouter") == "Model catalog"
    assert provider_label("OpenRouter") == "Model catalog"


@patch.dict(os.environ, {"OPENROUTER_API_KEY": "sk-test"}, clear=False)
def test_list_authenticated_providers_openrouter_display_name():
    with patch("agent.models_dev.fetch_models_dev", return_value={}):
        providers = list_authenticated_providers(current_provider="openrouter", max_models=5)
    row = next((p for p in providers if p["slug"] == "openrouter"), None)
    assert row is not None
    assert row["name"] == "Model catalog"
    assert "OpenRouter" not in row["name"]
