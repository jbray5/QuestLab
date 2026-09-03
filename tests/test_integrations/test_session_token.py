"""Signed session tokens (Plan 73): issue/verify round-trip, tamper, expiry, fail-closed."""

import time

import pytest

from integrations import session_token


@pytest.fixture(autouse=True)
def _secret(monkeypatch):
    monkeypatch.setenv("APP_SECRET", "test-secret-do-not-ship")


class TestTokens:
    """HMAC tokens behave like a tiny, boring JWT."""

    def test_round_trip(self):
        tok = session_token.issue("DM@Example.com")
        claims = session_token.verify(tok)
        assert claims is not None and claims["sub"] == "dm@example.com"

    def test_tampered_payload_rejected(self):
        tok = session_token.issue("dm@example.com")
        body, sig = tok.split(".")
        # Flip a character in the payload; signature no longer matches.
        bad = ("A" if body[0] != "A" else "B") + body[1:]
        assert session_token.verify(f"{bad}.{sig}") is None

    def test_expired_rejected(self):
        tok = session_token.issue("dm@example.com", ttl_seconds=-1)
        time.sleep(0.01)
        assert session_token.verify(tok) is None

    def test_kind_must_match(self):
        state = session_token.issue("anon", kind="state", extra={"provider": "discord"})
        assert session_token.verify(state) is None  # not a session
        assert session_token.verify(state, kind="state")["provider"] == "discord"

    def test_no_secret_fails_closed(self, monkeypatch):
        tok = session_token.issue("dm@example.com")
        monkeypatch.delenv("APP_SECRET")
        assert session_token.verify(tok) is None
        with pytest.raises(RuntimeError):
            session_token.issue("dm@example.com")
