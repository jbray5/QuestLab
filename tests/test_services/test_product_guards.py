"""Plan 54 tests — product-readiness guards (waitlist).

The AI kill switch these tests once covered went with generative AI (Plan 124).
"""

import pytest
from sqlmodel import Session

import services.waitlist_service as wl_svc
from domain.waitlist import WaitlistCreate


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
