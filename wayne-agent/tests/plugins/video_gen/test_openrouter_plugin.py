"""Smoke + unit tests for the OpenRouter video gen plugin."""

from __future__ import annotations

from pathlib import Path
from typing import Any, Dict, List

import pytest

from agent import video_gen_registry


@pytest.fixture(autouse=True)
def _reset_registry():
    video_gen_registry._reset_for_tests()
    yield
    video_gen_registry._reset_for_tests()


def test_openrouter_provider_registers():
    from plugins.video_gen.openrouter import OpenRouterVideoGenProvider

    provider = OpenRouterVideoGenProvider()
    video_gen_registry.register_provider(provider)

    assert video_gen_registry.get_provider("openrouter") is provider
    assert provider.display_name == "OpenRouter"
    assert provider.default_model() == "google/veo-3.1"


def test_openrouter_lists_curated_pro_models():
    from plugins.video_gen.openrouter import OpenRouterVideoGenProvider

    models = OpenRouterVideoGenProvider().list_models()
    ids = [m["id"] for m in models]
    assert "google/veo-3.1" in ids
    assert "alibaba/wan-2.7" in ids
    assert models[0]["tier"] == "pro"


def test_openrouter_unavailable_without_key(monkeypatch):
    from plugins.video_gen.openrouter import OpenRouterVideoGenProvider

    monkeypatch.delenv("OPENROUTER_API_KEY", raising=False)
    monkeypatch.setattr(
        "work4you_cli.runtime_provider.resolve_runtime_provider",
        lambda requested=None: {"api_key": "", "base_url": ""},
    )
    assert OpenRouterVideoGenProvider().is_available() is False


def test_openrouter_generate_requires_key(monkeypatch):
    from plugins.video_gen.openrouter import OpenRouterVideoGenProvider

    monkeypatch.setattr(
        "work4you_cli.runtime_provider.resolve_runtime_provider",
        lambda requested=None: {"api_key": "", "base_url": ""},
    )
    result = OpenRouterVideoGenProvider().generate("a happy dog")
    assert result["success"] is False
    assert result["error_type"] == "missing_api_key"


def test_openrouter_submit_poll_download(monkeypatch, tmp_path):
    """Happy path: submit → poll completed → download bytes → cache path."""
    from plugins.video_gen import openrouter as or_plugin
    from plugins.video_gen.openrouter import OpenRouterVideoGenProvider

    monkeypatch.setenv("WAYNE_HOME", str(tmp_path))
    monkeypatch.setattr(
        "work4you_cli.runtime_provider.resolve_runtime_provider",
        lambda requested=None: {
            "api_key": "sk-or-test",
            "base_url": "https://openrouter.ai/api/v1",
        },
    )

    calls: List[Dict[str, Any]] = []

    class _Resp:
        def __init__(self, payload=None, content=b"", status_code=200):
            self._payload = payload
            self.content = content
            self.status_code = status_code
            self.text = ""

        def raise_for_status(self):
            if self.status_code >= 400:
                raise RuntimeError(f"http {self.status_code}")

        def json(self):
            return self._payload

    def fake_post(url, headers=None, json=None, timeout=None):
        calls.append({"method": "POST", "url": url, "json": json})
        return _Resp(
            {
                "id": "job-1",
                "polling_url": "https://openrouter.ai/api/v1/videos/job-1",
                "status": "pending",
            }
        )

    poll_count = {"n": 0}

    def fake_get(url, headers=None, timeout=None):
        calls.append({"method": "GET", "url": url})
        if "content" in url or url.endswith("/content?index=0"):
            return _Resp(content=b"FAKEMP4DATA")
        poll_count["n"] += 1
        if poll_count["n"] == 1:
            return _Resp({"id": "job-1", "status": "in_progress"})
        return _Resp(
            {
                "id": "job-1",
                "status": "completed",
                "unsigned_urls": [
                    "https://openrouter.ai/api/v1/videos/job-1/content?index=0"
                ],
                "usage": {"cost": 0.25},
            }
        )

    class _Requests:
        post = staticmethod(fake_post)
        get = staticmethod(fake_get)

    monkeypatch.setitem(__import__("sys").modules, "requests", _Requests())
    # Also patch sleep so the test is fast
    monkeypatch.setattr(or_plugin.time, "sleep", lambda *_a, **_k: None)

    # Force import of requests inside generate to see our stub: inject via
    # sys.modules is enough when generate does `import requests`.
    result = OpenRouterVideoGenProvider().generate(
        "waves at sunset",
        duration=6,
        aspect_ratio="16:9",
    )
    assert result["success"] is True
    assert result["provider"] == "openrouter"
    assert result["model"] == "google/veo-3.1"
    assert result["duration"] == 6
    assert str(result["video"]).endswith(".mp4")
    assert Path(result["video"]).is_file()
    assert any(c["method"] == "POST" and c["url"].endswith("/videos") for c in calls)


def test_openrouter_image_to_video_payload(monkeypatch, tmp_path):
    from plugins.video_gen import openrouter as or_plugin
    from plugins.video_gen.openrouter import OpenRouterVideoGenProvider

    monkeypatch.setenv("WAYNE_HOME", str(tmp_path))
    monkeypatch.setattr(
        "work4you_cli.runtime_provider.resolve_runtime_provider",
        lambda requested=None: {
            "api_key": "sk-or-test",
            "base_url": "https://openrouter.ai/api/v1",
        },
    )
    captured: Dict[str, Any] = {}

    class _Resp:
        def __init__(self, payload=None, content=b"vid"):
            self._payload = payload or {}
            self.content = content
            self.status_code = 200
            self.text = ""

        def raise_for_status(self):
            return None

        def json(self):
            return self._payload

    def fake_post(url, headers=None, json=None, timeout=None):
        captured["payload"] = json
        return _Resp(
            {
                "id": "j2",
                "polling_url": "/api/v1/videos/j2",
                "status": "pending",
            }
        )

    def fake_get(url, headers=None, timeout=None):
        if "content" in url:
            return _Resp(content=b"vid")
        return _Resp(
            {
                "id": "j2",
                "status": "completed",
                "unsigned_urls": [
                    "https://openrouter.ai/api/v1/videos/j2/content?index=0"
                ],
            }
        )

    class _Requests:
        post = staticmethod(fake_post)
        get = staticmethod(fake_get)

    monkeypatch.setitem(__import__("sys").modules, "requests", _Requests())
    monkeypatch.setattr(or_plugin.time, "sleep", lambda *_a, **_k: None)

    result = OpenRouterVideoGenProvider().generate(
        "animate this still",
        image_url="https://example.com/frame.png",
    )
    assert result["success"] is True
    assert result["modality"] == "image"
    frames = captured["payload"].get("frame_images")
    assert isinstance(frames, list) and frames[0]["frame_type"] == "first_frame"
    assert frames[0]["image_url"]["url"] == "https://example.com/frame.png"
