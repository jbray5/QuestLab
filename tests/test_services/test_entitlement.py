"""AI entitlements (Plan 73): gate modes, allowlist, patron flag, daily quota."""

import pytest
from sqlmodel import Session

from db.repos.user_repo import UserRepo
from domain.user import User
from services import entitlement_service as ent


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    monkeypatch.delenv("AI_GATE", raising=False)
    monkeypatch.delenv("AI_FREE_EMAILS", raising=False)
    monkeypatch.delenv("BOOTSTRAP_ADMIN_EMAILS", raising=False)
    monkeypatch.setenv("AI_DAILY_LIMIT", "3")
    monkeypatch.setenv("PATREON_URL", "https://patreon.com/questlab")


class TestGate:
    """Personal deployments stay open; public ones gate on Patreon."""

    def test_off_allows_everyone(self, duckdb_session: Session):
        e = ent.check_ai(duckdb_session, "anyone@example.com")
        assert e.allowed and e.remaining_today == 3

    def test_patreon_mode_blocks_non_patrons(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setenv("AI_GATE", "patreon")
        e = ent.check_ai(duckdb_session, "stranger@example.com")
        assert not e.allowed and e.reason == "patreon_required"
        assert e.patreon_url == "https://patreon.com/questlab"

    def test_patreon_mode_allows_active_patron(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setenv("AI_GATE", "patreon")
        UserRepo.save(duckdb_session, User(email="patron@example.com", patron_active=True))
        assert ent.check_ai(duckdb_session, "patron@example.com").allowed

    def test_allowlist_and_admins_bypass(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setenv("AI_GATE", "patreon")
        monkeypatch.setenv("AI_FREE_EMAILS", "friend@example.com")
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "Owner@Example.com")
        assert ent.check_ai(duckdb_session, "friend@example.com").allowed
        owner = ent.check_ai(duckdb_session, "owner@example.com")
        assert owner.allowed and owner.remaining_today is None  # no daily wall for the admin


class TestQuota:
    """The daily allowance counts down and then refuses."""

    def test_counts_down_then_refuses(self, duckdb_session: Session):
        email = "busy@example.com"
        for expected in (2, 1, 0):
            ent.record_ai(duckdb_session, email)
            e = ent.check_ai(duckdb_session, email)
            assert e.remaining_today == expected if expected else not e.allowed
        e = ent.check_ai(duckdb_session, email)
        assert not e.allowed and e.reason == "daily_limit"

    def test_zero_limit_means_unlimited(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setenv("AI_DAILY_LIMIT", "0")
        for _ in range(5):
            ent.record_ai(duckdb_session, "free@example.com")
        e = ent.check_ai(duckdb_session, "free@example.com")
        assert e.allowed and e.remaining_today is None
