"""OpenRouter video generation backend.

Async workflow (OpenRouter Videos API):

1. ``POST {base}/videos`` → job id + ``polling_url``
2. Poll ``GET polling_url`` until ``status == completed``
3. Download ``unsigned_urls[0]`` (or ``/videos/{id}/content``) and save under
   ``$WAYNE_HOME/cache/videos/``

Authentication reuses the shared OpenRouter runtime key
(``resolve_runtime_provider(requested="openrouter")``) — same billing as chat
and image gen. No FAL credits required.

Image routing mirrors the unified ``video_generate`` contract:

- ``image_url`` → ``frame_images`` with ``frame_type: first_frame`` (i2v)
- ``reference_image_urls`` → ``input_references`` (style/content guidance)
"""

from __future__ import annotations

import logging
import mimetypes
import os
import time
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.parse import urljoin

from agent.video_gen_provider import (
    DEFAULT_ASPECT_RATIO,
    DEFAULT_RESOLUTION,
    VideoGenProvider,
    error_response,
    save_bytes_video,
    success_response,
)

logger = logging.getLogger(__name__)


DEFAULT_MODEL = "google/veo-3.1"
_FALLBACK_MODEL = "alibaba/wan-2.7"
_DEFAULT_MODEL_CHAIN = (DEFAULT_MODEL, _FALLBACK_MODEL)

DEFAULT_DURATION = 8
DEFAULT_TIMEOUT_SECONDS = 600
DEFAULT_POLL_INTERVAL_SECONDS = 8
_MAX_REFERENCE_IMAGES = 4

VALID_ASPECT_RATIOS = {
    "16:9",
    "9:16",
    "1:1",
    "4:3",
    "3:4",
    "3:2",
    "2:3",
    "21:9",
    "9:21",
}
VALID_RESOLUTIONS = {"480p", "720p", "1080p", "1K", "2K", "4K"}

_MODELS: List[Dict[str, Any]] = [
    {
        "id": DEFAULT_MODEL,
        "display": "Veo 3.1",
        "speed": "~60-180s",
        "strengths": "Google cinematic default — Work4You Pro video",
        "tier": "pro",
        "modalities": ["text", "image"],
    },
    {
        "id": "bytedance/seedance-2.0",
        "display": "Seedance 2.0",
        "speed": "~60-180s",
        "strengths": "ByteDance cinematic; strong character consistency",
        "tier": "pro",
        "modalities": ["text", "image"],
    },
    {
        "id": _FALLBACK_MODEL,
        "display": "Wan 2.7",
        "speed": "~45-150s",
        "strengths": "Alibaba Wan — solid i2v / reference routing",
        "tier": "pro",
        "modalities": ["text", "image"],
    },
    {
        "id": "google/veo-3.1-fast",
        "display": "Veo 3.1 Fast",
        "speed": "~45-120s",
        "strengths": "Faster/cheaper Veo when Pro fidelity isn't required",
        "tier": "pro",
        "modalities": ["text", "image"],
    },
    {
        "id": "openai/sora-2-pro",
        "display": "Sora 2 Pro",
        "speed": "~120-300s",
        "strengths": "OpenAI Sora when enabled on the OpenRouter account",
        "tier": "max",
        "modalities": ["text", "image"],
    },
]


def _load_video_gen_section() -> Dict[str, Any]:
    try:
        from work4you_cli.config import load_config

        cfg = load_config()
        section = cfg.get("video_gen") if isinstance(cfg, dict) else None
        return section if isinstance(section, dict) else {}
    except Exception as exc:  # noqa: BLE001
        logger.debug("Could not load video_gen config: %s", exc)
        return {}


def _dedupe_models(models: List[str]) -> List[str]:
    out: List[str] = []
    seen: set[str] = set()
    for model in models:
        m = (model or "").strip()
        if not m or m in seen:
            continue
        seen.add(m)
        out.append(m)
    return out


def _to_image_url_part(ref: str) -> Optional[str]:
    """Turn a local path or URL into an image_url value for OpenRouter."""
    ref = str(ref or "").strip()
    if not ref:
        return None
    if ref.startswith(("http://", "https://", "data:")):
        return ref

    path = Path(ref).expanduser()
    if not path.is_file():
        return None

    from agent.file_safety import raise_if_read_blocked

    raise_if_read_blocked(ref)

    import base64

    try:
        raw = path.read_bytes()
    except OSError as exc:
        logger.debug("Could not read reference image %s: %s", ref, exc)
        return None
    mime = mimetypes.guess_type(path.name)[0] or "image/png"
    encoded = base64.b64encode(raw).decode("ascii")
    return f"data:{mime};base64,{encoded}"


def _absolute_url(base_url: str, maybe_relative: str) -> str:
    url = (maybe_relative or "").strip()
    if not url:
        return ""
    if url.startswith(("http://", "https://")):
        return url
    root = base_url.rstrip("/") + "/"
    # base_url is typically https://openrouter.ai/api/v1 — join carefully
    if url.startswith("/"):
        # Absolute path on the same host as base_url
        from urllib.parse import urlparse

        parsed = urlparse(base_url)
        return f"{parsed.scheme}://{parsed.netloc}{url}"
    return urljoin(root, url)


def _clamp_duration(duration: Optional[int]) -> int:
    if duration is None:
        return DEFAULT_DURATION
    try:
        value = int(duration)
    except (TypeError, ValueError):
        return DEFAULT_DURATION
    return max(1, min(60, value))


class OpenRouterVideoGenProvider(VideoGenProvider):
    """OpenRouter async Videos API backend."""

    @property
    def name(self) -> str:
        return "openrouter"

    @property
    def display_name(self) -> str:
        return "OpenRouter"

    def _resolve_runtime(self) -> Dict[str, Any]:
        from work4you_cli.runtime_provider import resolve_runtime_provider

        return resolve_runtime_provider(requested="openrouter")

    def is_available(self) -> bool:
        try:
            runtime = self._resolve_runtime()
        except Exception as exc:  # noqa: BLE001
            logger.debug("openrouter video runtime resolution failed: %s", exc)
            return False
        return bool(str(runtime.get("api_key") or "").strip())

    def list_models(self) -> List[Dict[str, Any]]:
        return [dict(entry) for entry in _MODELS]

    def default_model(self) -> Optional[str]:
        return self._resolve_model_chain()[0]

    def get_setup_schema(self) -> Dict[str, Any]:
        return {
            "name": "OpenRouter (video)",
            "badge": "paid",
            "tag": (
                "Veo 3.1, Seedance, Wan & more via OpenRouter Videos API; "
                "uses the same OPENROUTER_API_KEY as chat/image"
            ),
            "env_vars": [
                {
                    "key": "OPENROUTER_API_KEY",
                    "prompt": "OpenRouter API key",
                    "url": "https://openrouter.ai/keys",
                }
            ],
        }

    def capabilities(self) -> Dict[str, Any]:
        return {
            "modalities": ["text", "image"],
            "aspect_ratios": sorted(VALID_ASPECT_RATIOS),
            "resolutions": sorted(VALID_RESOLUTIONS),
            "max_duration": 60,
            "min_duration": 1,
            "supports_audio": True,
            "supports_negative_prompt": False,
            "max_reference_images": _MAX_REFERENCE_IMAGES,
        }

    def _resolve_model_chain(self, explicit: Optional[str] = None) -> List[str]:
        if isinstance(explicit, str) and explicit.strip():
            return [explicit.strip()]
        env_override = os.environ.get("OPENROUTER_VIDEO_MODEL", "").strip()
        if env_override:
            return [env_override]
        cfg = _load_video_gen_section()
        scoped = cfg.get("openrouter") if isinstance(cfg.get("openrouter"), dict) else {}
        if isinstance(scoped, dict):
            value = scoped.get("model")
            if isinstance(value, str) and value.strip():
                return [value.strip()]
        top = cfg.get("model")
        if isinstance(top, str) and top.strip():
            # Only honour top-level model when it looks like an OpenRouter slug
            # (contains '/') — FAL family ids like "pixverse-v6" must not pin OR.
            if "/" in top.strip():
                return [top.strip()]
        return _dedupe_models(list(_DEFAULT_MODEL_CHAIN))

    def generate(
        self,
        prompt: str,
        *,
        model: Optional[str] = None,
        image_url: Optional[str] = None,
        reference_image_urls: Optional[List[str]] = None,
        duration: Optional[int] = None,
        aspect_ratio: str = DEFAULT_ASPECT_RATIO,
        resolution: str = DEFAULT_RESOLUTION,
        negative_prompt: Optional[str] = None,
        audio: Optional[bool] = None,
        seed: Optional[int] = None,
        **kwargs: Any,
    ) -> Dict[str, Any]:
        import requests

        _ = negative_prompt  # OR uses provider passthrough; not on the unified surface yet

        try:
            runtime = self._resolve_runtime()
        except Exception as exc:  # noqa: BLE001
            return error_response(
                error=f"Could not resolve OpenRouter credentials: {exc}",
                error_type="missing_api_key",
                provider=self.name,
                prompt=prompt or "",
                aspect_ratio=aspect_ratio,
            )

        api_key = str(runtime.get("api_key") or "").strip()
        base_url = str(runtime.get("base_url") or "").strip().rstrip("/")
        if not api_key or not base_url:
            return error_response(
                error=(
                    "No OpenRouter credentials found. Configure OpenRouter in "
                    "`work4you tools` → Video Generation (same key as chat)."
                ),
                error_type="missing_api_key",
                provider=self.name,
                prompt=prompt or "",
                aspect_ratio=aspect_ratio,
            )

        prompt = (prompt or "").strip()
        if not prompt:
            return error_response(
                error="prompt is required for OpenRouter video generation",
                error_type="missing_prompt",
                provider=self.name,
                prompt=prompt,
            )

        aspect = (aspect_ratio or DEFAULT_ASPECT_RATIO).strip()
        if aspect not in VALID_ASPECT_RATIOS:
            aspect = DEFAULT_ASPECT_RATIO
        res = (resolution or DEFAULT_RESOLUTION).strip()
        if res not in VALID_RESOLUTIONS:
            res = DEFAULT_RESOLUTION
        clamped_duration = _clamp_duration(duration)

        frame_images: List[Dict[str, Any]] = []
        if (image_url or "").strip():
            part = _to_image_url_part(image_url or "")
            if not part:
                return error_response(
                    error=(
                        "image_url must be a public HTTPS URL, data URI, or readable "
                        "local image path"
                    ),
                    error_type="invalid_image_url",
                    provider=self.name,
                    prompt=prompt,
                )
            frame_images.append(
                {
                    "type": "image_url",
                    "image_url": {"url": part},
                    "frame_type": "first_frame",
                }
            )

        input_references: List[Dict[str, Any]] = []
        for ref in reference_image_urls or []:
            part = _to_image_url_part(ref)
            if not part:
                return error_response(
                    error=(
                        "reference_image_urls entries must be public HTTPS URLs, "
                        "data URIs, or readable local image paths"
                    ),
                    error_type="invalid_reference_image_urls",
                    provider=self.name,
                    prompt=prompt,
                )
            input_references.append(
                {"type": "image_url", "image_url": {"url": part}}
            )
            if len(input_references) >= _MAX_REFERENCE_IMAGES:
                break

        modality = "image" if frame_images else ("reference" if input_references else "text")
        model_chain = self._resolve_model_chain(model)
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://github.com/NousResearch/hermes-agent",
            "X-Title": "Work4You",
        }

        last_error: Optional[Dict[str, Any]] = None
        for i, model_id in enumerate(model_chain):
            payload: Dict[str, Any] = {
                "model": model_id,
                "prompt": prompt,
                "duration": clamped_duration,
                "aspect_ratio": aspect,
                "resolution": res,
            }
            if frame_images:
                payload["frame_images"] = frame_images
            elif input_references:
                payload["input_references"] = input_references
            if audio is not None:
                payload["generate_audio"] = bool(audio)
            if seed is not None:
                try:
                    payload["seed"] = int(seed)
                except (TypeError, ValueError):
                    pass

            is_last = i == len(model_chain) - 1
            try:
                submit = requests.post(
                    f"{base_url}/videos",
                    headers=headers,
                    json=payload,
                    timeout=60,
                )
                submit.raise_for_status()
            except requests.HTTPError as exc:
                resp = exc.response
                status = resp.status_code if resp is not None else 0
                try:
                    body = resp.json() if resp is not None else {}
                    err_msg = (
                        (body.get("error") or {}).get("message")
                        if isinstance(body.get("error"), dict)
                        else body.get("error") or (resp.text[:300] if resp is not None else str(exc))
                    )
                except Exception:  # noqa: BLE001
                    err_msg = resp.text[:300] if resp is not None else str(exc)
                logger.error(
                    "OpenRouter video submit failed (%d) on %s: %s",
                    status,
                    model_id,
                    err_msg,
                )
                last_error = error_response(
                    error=f"OpenRouter video submit failed ({status}): {err_msg}",
                    error_type="api_error",
                    provider=self.name,
                    model=model_id,
                    prompt=prompt,
                    aspect_ratio=aspect,
                )
                if not is_last and status in (402, 403, 404):
                    continue
                return last_error
            except Exception as exc:  # noqa: BLE001
                return error_response(
                    error=f"OpenRouter video submit failed: {exc}",
                    error_type="api_error",
                    provider=self.name,
                    model=model_id,
                    prompt=prompt,
                    aspect_ratio=aspect,
                )

            try:
                submit_body = submit.json()
            except Exception as exc:  # noqa: BLE001
                return error_response(
                    error=f"OpenRouter video submit returned non-JSON: {exc}",
                    error_type="api_error",
                    provider=self.name,
                    model=model_id,
                    prompt=prompt,
                    aspect_ratio=aspect,
                )

            job_id = str(submit_body.get("id") or "").strip()
            polling_url = _absolute_url(
                base_url, str(submit_body.get("polling_url") or "")
            )
            if not polling_url and job_id:
                polling_url = f"{base_url}/videos/{job_id}"
            if not polling_url:
                return error_response(
                    error="OpenRouter video response missing polling_url",
                    error_type="empty_response",
                    provider=self.name,
                    model=model_id,
                    prompt=prompt,
                    aspect_ratio=aspect,
                )

            poll_result = self._poll_until_done(
                requests_mod=requests,
                polling_url=polling_url,
                headers=headers,
            )
            status_name = poll_result.get("status")
            body = poll_result.get("body") or {}

            if status_name == "completed":
                urls = body.get("unsigned_urls") if isinstance(body, dict) else None
                content_url = ""
                if isinstance(urls, list) and urls:
                    content_url = str(urls[0] or "").strip()
                if not content_url and job_id:
                    content_url = f"{base_url}/videos/{job_id}/content?index=0"
                content_url = _absolute_url(base_url, content_url)
                if not content_url:
                    return error_response(
                        error="OpenRouter video completed without a download URL",
                        error_type="empty_response",
                        provider=self.name,
                        model=model_id,
                        prompt=prompt,
                        aspect_ratio=aspect,
                    )

                try:
                    video_resp = requests.get(
                        content_url,
                        headers={"Authorization": f"Bearer {api_key}"},
                        timeout=120,
                    )
                    video_resp.raise_for_status()
                    raw = video_resp.content
                except Exception as exc:  # noqa: BLE001
                    return error_response(
                        error=f"Failed to download OpenRouter video: {exc}",
                        error_type="download_error",
                        provider=self.name,
                        model=model_id,
                        prompt=prompt,
                        aspect_ratio=aspect,
                    )
                if not raw:
                    return error_response(
                        error="OpenRouter video download was empty",
                        error_type="empty_response",
                        provider=self.name,
                        model=model_id,
                        prompt=prompt,
                        aspect_ratio=aspect,
                    )

                saved = save_bytes_video(raw, prefix="openrouter_video", extension="mp4")
                extra: Dict[str, Any] = {
                    "job_id": job_id or body.get("id"),
                    "source_url": content_url,
                }
                if body.get("generation_id"):
                    extra["generation_id"] = body["generation_id"]
                if body.get("usage"):
                    extra["usage"] = body["usage"]
                return success_response(
                    video=str(saved),
                    model=model_id,
                    prompt=prompt,
                    modality=modality if modality != "reference" else "image",
                    aspect_ratio=aspect,
                    duration=clamped_duration,
                    provider=self.name,
                    extra=extra,
                )

            if status_name == "timeout":
                last_error = error_response(
                    error=(
                        f"Timed out waiting for OpenRouter video after "
                        f"{DEFAULT_TIMEOUT_SECONDS}s"
                    ),
                    error_type="timeout",
                    provider=self.name,
                    model=model_id,
                    prompt=prompt,
                    aspect_ratio=aspect,
                )
                return last_error

            err = ""
            if isinstance(body, dict):
                err = str(body.get("error") or "")
            last_error = error_response(
                error=err or f"OpenRouter video ended with status '{status_name}'",
                error_type=f"openrouter_{status_name or 'failed'}",
                provider=self.name,
                model=model_id,
                prompt=prompt,
                aspect_ratio=aspect,
            )
            if not is_last:
                continue
            return last_error

        return last_error or error_response(
            error="OpenRouter video generation failed after trying all candidate models.",
            error_type="api_error",
            provider=self.name,
            model=model_chain[-1] if model_chain else "",
            prompt=prompt,
            aspect_ratio=aspect,
        )

    def _poll_until_done(
        self,
        *,
        requests_mod: Any,
        polling_url: str,
        headers: Dict[str, str],
    ) -> Dict[str, Any]:
        elapsed = 0.0
        last_status = "pending"
        last_body: Dict[str, Any] = {}
        while elapsed < DEFAULT_TIMEOUT_SECONDS:
            try:
                resp = requests_mod.get(polling_url, headers=headers, timeout=30)
                resp.raise_for_status()
                body = resp.json()
            except Exception as exc:  # noqa: BLE001
                logger.debug("OpenRouter video poll error: %s", exc)
                time.sleep(DEFAULT_POLL_INTERVAL_SECONDS)
                elapsed += DEFAULT_POLL_INTERVAL_SECONDS
                continue

            if not isinstance(body, dict):
                body = {}
            last_body = body
            last_status = str(body.get("status") or "").lower() or last_status
            if last_status == "completed":
                return {"status": "completed", "body": body}
            if last_status in {"failed", "cancelled", "expired", "error"}:
                return {"status": last_status, "body": body}

            time.sleep(DEFAULT_POLL_INTERVAL_SECONDS)
            elapsed += DEFAULT_POLL_INTERVAL_SECONDS

        return {"status": "timeout", "body": last_body or {"status": last_status}}


def register(ctx: Any) -> None:
    """Plugin entry point — wire OpenRouter into the video_gen registry."""
    ctx.register_video_gen_provider(OpenRouterVideoGenProvider())
