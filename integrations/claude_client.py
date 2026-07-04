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

# Model selection is centralized here (Plan 43). Override with ANTHROPIC_MODEL.
# Default is the current Opus tier, which also supports structured outputs.
DEFAULT_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-opus-4-8")
_DEFAULT_MODEL = DEFAULT_MODEL  # alias kept for existing helper signatures


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
    # If Claude ran out of tokens mid-response the JSON will be cut off
    # mid-string and json.loads will raise an unhelpful decode error.
    # Detect this up front so the caller knows to bump max_tokens.
    if response.stop_reason == "max_tokens":
        raise RuntimeError(
            f"Claude response truncated at max_tokens={max_tokens}; "
            "JSON output is incomplete. Bump max_tokens and retry."
        )
    raw = next(b.text for b in response.content if b.type == "text").strip()
    # Strip markdown code fences if Claude adds them despite instructions
    if raw.startswith("```"):
        lines = raw.split("\n")
        # Drop first and last lines (``` ... ```)
        raw = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
    return schema.model_validate(json.loads(raw))


def complete_structured(
    system: str,
    user: str,
    schema: type[BaseModel],
    model: str = DEFAULT_MODEL,
    max_tokens: int = 16000,
) -> Any:
    """Call Claude with structured outputs; return a validated model instance.

    Uses the SDK's ``messages.parse()`` (an ``output_config`` json_schema
    constraint applied server-side), which guarantees schema-valid JSON and
    eliminates the fence-stripping / JSONDecodeError failure class that
    ``complete_json`` guards against by hand. Requires a model that supports
    structured outputs — the default ``claude-opus-4-8`` does.

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
        RuntimeError: If the response is truncated at max_tokens.
        anthropic.APIError: On API-level failures.
        pydantic.ValidationError: If the parsed output fails validation.
    """
    client = _get_client()
    response = client.messages.parse(
        model=model,
        max_tokens=max_tokens,
        system=system,
        messages=[{"role": "user", "content": user}],
        output_format=schema,
    )
    if response.stop_reason == "max_tokens":
        raise RuntimeError(
            f"Claude response truncated at max_tokens={max_tokens}; "
            "structured output is incomplete. Bump max_tokens and retry."
        )
    return response.parsed_output


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
