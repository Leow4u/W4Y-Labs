"""Work4You: tools must not enter the schema (or dispatch) when they need a missing API.

Regression: stale ``web.backend: firecrawl`` / ``image_gen.provider: fal`` without
credentials previously kept the tool visible (another backend ready) while the
call asked the agent to configure an API key.
"""
from __future__ import annotations

import os
from unittest.mock import patch

import pytest


class TestWebBackendNeverDispatchesUnavailableConfig:
    def test_stale_firecrawl_config_uses_parallel_key(self, monkeypatch):
        from tools import web_tools

        monkeypatch.setattr(
            web_tools, "_load_web_config", lambda: {"backend": "firecrawl"}
        )
        monkeypatch.setattr(web_tools, "check_firecrawl_api_key", lambda: False)
        monkeypatch.setattr(web_tools, "_is_tool_gateway_ready", lambda: False)
        monkeypatch.setattr(web_tools, "_ddgs_package_importable", lambda: False)
        monkeypatch.setenv("PARALLEL_API_KEY", "par-test")
        for key in ("FIRECRAWL_API_KEY", "FIRECRAWL_API_URL", "EXA_API_KEY", "TAVILY_API_KEY"):
            monkeypatch.delenv(key, raising=False)

        assert web_tools._get_backend() == "parallel"

    def test_no_backend_returns_empty_not_firecrawl_name(self, monkeypatch):
        from tools import web_tools

        monkeypatch.setattr(web_tools, "_load_web_config", lambda: {})
        monkeypatch.setattr(web_tools, "_ddgs_package_importable", lambda: False)
        monkeypatch.setattr(web_tools, "_is_tool_gateway_ready", lambda: False)
        monkeypatch.setattr(web_tools, "_list_registered_web_providers", lambda: [])
        for key in (
            "FIRECRAWL_API_KEY",
            "FIRECRAWL_API_URL",
            "PARALLEL_API_KEY",
            "EXA_API_KEY",
            "TAVILY_API_KEY",
            "SEARXNG_URL",
            "BRAVE_SEARCH_API_KEY",
        ):
            monkeypatch.delenv(key, raising=False)

        assert web_tools._get_backend() == ""
        assert web_tools.check_web_api_key() is False


class TestImageGenGateFollowsAvailableActiveProvider:
    def test_unavailable_fal_config_check_true_when_openrouter_ready(
        self, tmp_path, monkeypatch
    ):
        import yaml

        from agent import image_gen_registry
        from agent.image_gen_provider import ImageGenProvider
        from tools.image_generation_tool import check_image_generation_requirements

        class _P(ImageGenProvider):
            def __init__(self, name: str, available: bool):
                self._name = name
                self._available = available

            @property
            def name(self) -> str:
                return self._name

            def is_available(self) -> bool:
                return self._available

            def generate(self, prompt, aspect_ratio="landscape", **kw):
                return {"success": True}

        monkeypatch.setenv("WAYNE_HOME", str(tmp_path))
        (tmp_path / "config.yaml").write_text(
            yaml.safe_dump({"image_gen": {"provider": "fal"}})
        )
        image_gen_registry._reset_for_tests()
        image_gen_registry.register_provider(_P("fal", False))
        image_gen_registry.register_provider(_P("openrouter", True))

        with patch(
            "work4you_cli.plugins._ensure_plugins_discovered", return_value=None
        ):
            assert check_image_generation_requirements() is True
            active = image_gen_registry.get_active_provider()
            assert active is not None and active.name == "openrouter"

        image_gen_registry._reset_for_tests()
