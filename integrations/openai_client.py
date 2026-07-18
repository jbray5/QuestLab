"""OpenAI API client — thin wrapper around the ``openai`` SDK.

Used for image generation (NPC + PC portraits, Plan 00034). Mirrors
``integrations/claude_client.py`` — services never import ``openai``
directly; they call helpers here.
"""

from __future__ import annotations

import base64
import os
from typing import Literal

import openai

# gpt-image-1 is the current default image model. dall-e-3 is still
# supported but produces lower-fidelity / older results.
_DEFAULT_IMAGE_MODEL = "gpt-image-1"


def _get_client() -> openai.OpenAI:
    """Return an OpenAI client using ``OPENAI_API_KEY`` from env.

    Returns:
        openai.OpenAI instance.

    Raises:
        PermissionError: If ``OPENAI_API_KEY`` is not set.
    """
    api_key = os.environ.get("OPENAI_API_KEY", "").strip()
    if not api_key:
        raise PermissionError(
            "OPENAI_API_KEY is not configured. "
            "Add it to your .env file (or Render dashboard) to enable "
            "image generation."
        )
    return openai.OpenAI(api_key=api_key)


def generate_image(
    prompt: str,
    *,
    size: Literal["1024x1024", "1024x1536", "1536x1024"] = "1024x1024",
    quality: Literal["low", "medium", "high"] = "medium",
    model: str = _DEFAULT_IMAGE_MODEL,
    background: Literal["transparent", "opaque", "auto"] | None = None,
) -> bytes:
    """Generate one PNG image from a text prompt.

    Args:
        prompt: Plain-text description of the image. The OpenAI API will
            faithfully render fantasy / portrait subjects; system prompts
            for "safe content" are applied automatically by the model.
        size: Output resolution. 1024×1024 is the default; portrait or
            landscape variants are also valid for ``gpt-image-1``.
        quality: ``"low"`` ~ $0.011, ``"medium"`` ~ $0.04, ``"high"`` ~ $0.17.
        model: Image model id. Defaults to ``gpt-image-1``.
        background: ``"transparent"`` yields an alpha-channel PNG cut-out
            (gpt-image-1 only; used for minifig standees, Plan 45). ``None``
            omits the parameter for full backward compatibility.

    Returns:
        Raw PNG bytes, ready to upload to storage.

    Raises:
        PermissionError: If ``OPENAI_API_KEY`` is unset.
        RuntimeError: If the API returns no images or no decodable data.
    """
    client = _get_client()
    kwargs: dict = {"model": model, "prompt": prompt, "size": size, "quality": quality, "n": 1}
    if background is not None:
        kwargs["background"] = background
    try:
        response = client.images.generate(**kwargs)
    except openai.OpenAIError as exc:
        # Surface a clean error message so the router can return a
        # proper 502 (and CORS headers get attached). Without this catch
        # the openai.BadRequestError / RateLimitError / etc. would
        # bubble out as a raw 500 and the browser would see a
        # misleading CORS error instead of the real cause.
        raise RuntimeError(f"OpenAI image API error: {exc}") from exc

    return _response_bytes(response)


def edit_image(
    prompt: str,
    image_bytes: bytes,
    *,
    size: Literal["1024x1024", "1024x1536", "1536x1024"] = "1536x1024",
    quality: Literal["low", "medium", "high"] = "medium",
    model: str = _DEFAULT_IMAGE_MODEL,
    background: Literal["transparent", "opaque", "auto"] | None = None,
) -> bytes:
    """Transform an input image with gpt-image-1 (Plan 45 auto-terrain).

    Args:
        prompt: What to do to the image (e.g. "convert to a grayscale
            height map of the same scene").
        image_bytes: The source PNG/JPEG bytes.
        size: Output resolution.
        quality: Generation quality tier.
        model: Image model id. Defaults to ``gpt-image-1``.

    Returns:
        Raw PNG bytes of the transformed image.

    Raises:
        PermissionError: If ``OPENAI_API_KEY`` is unset.
        RuntimeError: If the API call fails or returns no decodable data.
    """
    client = _get_client()
    edit_kwargs: dict = {
        "model": model,
        "image": ("source.png", image_bytes, "image/png"),
        "prompt": prompt,
        "size": size,
        "quality": quality,
        "n": 1,
    }
    if background is not None:
        edit_kwargs["background"] = background
    try:
        response = client.images.edit(**edit_kwargs)
    except openai.OpenAIError as exc:
        raise RuntimeError(f"OpenAI image edit API error: {exc}") from exc
    return _response_bytes(response)


def _response_bytes(response: object) -> bytes:
    """Extract PNG bytes from an images API response (b64 or URL fallback).

    Args:
        response: The OpenAI images API response object.

    Returns:
        Raw image bytes.

    Raises:
        RuntimeError: If the response carries no decodable image.
    """
    data = getattr(response, "data", None)
    if not data:
        raise RuntimeError("OpenAI image API returned no data.")
    item = data[0]
    if getattr(item, "b64_json", None):
        return base64.b64decode(item.b64_json)
    # Fallback — older models may return a URL instead.
    if getattr(item, "url", None):
        import httpx

        try:
            resp = httpx.get(item.url, timeout=30.0)
            resp.raise_for_status()
        except httpx.HTTPError as exc:
            raise RuntimeError(f"OpenAI image URL fetch failed: {exc}") from exc
        return resp.content
    raise RuntimeError("OpenAI image API response missing both b64_json and url.")
