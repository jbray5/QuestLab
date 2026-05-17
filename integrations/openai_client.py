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

    Returns:
        Raw PNG bytes, ready to upload to storage.

    Raises:
        PermissionError: If ``OPENAI_API_KEY`` is unset.
        RuntimeError: If the API returns no images or no decodable data.
    """
    client = _get_client()
    response = client.images.generate(
        model=model,
        prompt=prompt,
        size=size,
        quality=quality,
        n=1,
    )
    if not response.data:
        raise RuntimeError("OpenAI image API returned no data.")
    item = response.data[0]
    if getattr(item, "b64_json", None):
        return base64.b64decode(item.b64_json)
    # Fallback — older models may return a URL instead.
    if getattr(item, "url", None):
        import httpx

        resp = httpx.get(item.url, timeout=30.0)
        resp.raise_for_status()
        return resp.content
    raise RuntimeError("OpenAI image API response missing both b64_json and url.")
