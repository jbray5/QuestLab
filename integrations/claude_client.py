"""Claude API client — thin wrapper around anthropic.Anthropic.

All AI calls in QuestLab go through these helpers. Never import anthropic directly
in services or pages.
"""

import json
import os
from collections.abc import Generator
from typing import Any

import anthropic
from pydantic import BaseModel

_DEFAULT_MODEL = "claude-opus-4-6"


def _get_client() -> anthropic.Anthropic:
    """Return an Anthropic client using ANTHROPIC_API_KEY from env.

    Returns:
        anthropic.Anthropic instance.

    Raises:
        PermissionError: If ANTHROPIC_API_KEY is not set.
    """
    api_key = os.environ.get("ANTHROPIC_API_KEY", "").strip()
    if not api_key:
        raise PermissionError(
            "ANTHROPIC_API_KEY is not configured. "
            "Add it to your .env file to enable AI features."
        )
    return anthropic.Anthropic(api_key=api_key)


def complete(
    system: str,
    user: str,
    model: str = _DEFAULT_MODEL,
    max_tokens: int = 4096,
) -> str:
    """Call Claude and return the full text response.

    Args:
        system: System prompt providing context and instructions.
        user: User message / task for Claude.
        model: Claude model ID (default: claude-opus-4-6).
        max_tokens: Maximum output tokens.

    Returns:
        Full text response from Claude.

    Raises:
        PermissionError: If ANTHROPIC_API_KEY is missing.
        anthropic.APIError: On API-level failures.
    """
    client = _get_client()
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    )
    return next(b.text for b in response.content if b.type == "text")


def complete_json(
    system: str,
    user: str,
    schema: type[BaseModel],
    model: str = _DEFAULT_MODEL,
    max_tokens: int = 8192,
) -> Any:
    """Call Claude and parse the response into a validated Pydantic model.

    Instructs Claude to return raw JSON (no markdown fences) and validates the
    output against ``schema``.

    Args:
        system: System prompt.
        user: User message.
        schema: Pydantic BaseModel subclass defining the expected shape.
        model: Claude model ID.
        max_tokens: Maximum output tokens.

    Returns:
        Validated instance of ``schema``.

    Raises:
        PermissionError: If ANTHROPIC_API_KEY is missing.
        anthropic.APIError: On API-level failures.
        pydantic.ValidationError: If the response doesn't match the schema.
        json.JSONDecodeError: If the response is not valid JSON.
    """
    json_instruction = (
        "\n\nYou MUST respond with ONLY valid JSON — no markdown code fences, "
        "no commentary, no explanation. Raw JSON only."
    )
    client = _get_client()
    response = client.messages.create(
        model=model,
        max_tokens=max_tokens,
        system=system + json_instruction,
        messages=[{"role": "user", "content": user}],
    )
    raw = next(b.text for b in response.content if b.type == "text").strip()
    # Strip markdown code fences if Claude adds them despite instructions
    if raw.startswith("```"):
        lines = raw.split("\n")
        # Drop first and last lines (``` ... ```)
        raw = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
    return schema.model_validate(json.loads(raw))


def stream_complete(
    system: str,
    user: str,
    model: str = _DEFAULT_MODEL,
    max_tokens: int = 8192,
) -> Generator[str, None, None]:
    """Stream a Claude response, yielding text chunks as they arrive.

    Compatible with Streamlit's ``st.write_stream()``.

    Args:
        system: System prompt.
        user: User message.
        model: Claude model ID.
        max_tokens: Maximum output tokens.

    Yields:
        Text string chunks from the response stream.

    Raises:
        PermissionError: If ANTHROPIC_API_KEY is missing.
        anthropic.APIError: On API-level failures.
    """
    client = _get_client()
    with client.messages.stream(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
    ) as stream:
        yield from stream.text_stream
