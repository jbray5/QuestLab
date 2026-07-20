"""Plan 54 tests — product-readiness guards (AI kill switch, waitlist).

The kill switch must trip BEFORE any client construction so no API key —
and no network — is ever touched on a disabled deployment.
"""

import pytest
from sqlmodel import Session

import services.waitlist_service as wl_svc
from domain.waitlist import WaitlistCreate
from integrations import claude_client, openai_client


class TestAiKillSwitch:
    """AI_GENERATION_ENABLED=false blocks every AI entry point."""

    def test_image_generation_blocked(self, monkeypatch):
        """generate_image refuses before touching keys or network."""
        monkeypatch.setenv("AI_GENERATION_ENABLED", "false")
        with pytest.raises(PermissionError, match="disabled on this deployment"):
            openai_client.generate_image("a lantern")

    def test_image_edit_blocked(self, monkeypatch):
        """edit_image refuses too."""
        monkeypatch.setenv("AI_GENERATION_ENABLED", "false")
        with pytest.raises(PermissionError, match="disabled on this deployment"):
            openai_client.edit_image("repaint", b"\x89PNG")

    def test_text_generation_blocked(self, monkeypatch):
        """Claude completions refuse."""
        monkeypatch.setenv("AI_GENERATION_ENABLED", "false")
        with pytest.raises(PermissionError, match="disabled on this deployment"):
            claude_client.complete("system", "user")

    def test_enabled_by_default(self, monkeypatch):
        """Unset means enabled — the guard itself passes (key check is next)."""
        monkeypatch.delenv("AI_GENERATION_ENABLED", raising=False)
        openai_client._require_ai_enabled()
        claude_client._require_ai_enabled()


class TestWaitlist:
    """Public signup: validation + idempotency."""

    def test_join_and_repeat(self, duckdb_session: Session):
        """First signup registers; the second flags already_registered."""
        first = wl_svc.join(duckdb_session, WaitlistCreate(email="A@Example.com "))
        again = wl_svc.join(duckdb_session, WaitlistCreate(email="a@example.com"))

        assert first.email == "a@example.com"
        assert first.already_registered is False
        assert again.already_registered is True

    def test_garbage_rejected(self, duckdb_session: Session):
        """Non-emails raise."""
        with pytest.raises(ValueError):
            wl_svc.join(duckdb_session, WaitlistCreate(email="not-an-email"))
