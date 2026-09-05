"""AI tiers (Plan 77): pledge → tier, scope by kind, per-tier daily allowance, plans table."""

import pytest
from sqlmodel import Session

from db.repos.user_repo import UserRepo
from domain.user import User
from services import entitlement_service as ent


@pytest.fixture(autouse=True)
def _public_mode(monkeypatch):
    monkeypatch.setenv("AI_GATE", "patreon")
    monkeypatch.delenv("AI_TIERS", raising=False)
    monkeypatch.delenv("AI_FREE_EMAILS", raising=False)
    monkeypatch.delenv("BOOTSTRAP_ADMIN_EMAILS", raising=False)
    monkeypatch.setenv("PATREON_URL", "https://patreon.com/questlab")


def _patron(db: Session, email: str, cents: int) -> None:
    UserRepo.save(db, User(email=email, patron_active=True, patron_tier_cents=cents))


class TestTierTable:
    """The default ladder and env overrides."""

    def test_defaults(self):
        names = [(t.name, t.min_cents, t.daily, t.scope) for t in ent.tiers()]
        assert names == [
            ("hearth", 500, 15, "text"),
            ("lantern", 1200, 40, "all"),
            ("table", 2500, 120, "all"),
        ]

    def test_env_override_and_sorting(self, monkeypatch):
        monkeypatch.setenv("AI_TIERS", "1000:gold:50:all,300:copper:5:text")
        assert [t.name for t in ent.tiers()] == ["copper", "gold"]

    def test_malformed_env_falls_back(self, monkeypatch):
        monkeypatch.setenv("AI_TIERS", "nonsense")
        assert [t.name for t in ent.tiers()] == ["hearth", "lantern", "table"]

    def test_plans_are_public_shaped(self):
        p = ent.plans()
        assert [x["label"] for x in p] == ["Hearth", "Lantern", "Table"]
        assert p[0]["price_cents"] == 500 and p[1]["scope"] == "all"
        assert all(x["blurb"] for x in p)


class TestScope:
    """Text is the floor; art and packs need the all-scope tiers."""

    def test_hearth_gets_text_not_art(self, duckdb_session: Session):
        _patron(duckdb_session, "hearth@example.com", 500)
        text = ent.check_ai(duckdb_session, "hearth@example.com", "text")
        art = ent.check_ai(duckdb_session, "hearth@example.com", "art")
        pack = ent.check_ai(duckdb_session, "hearth@example.com", "pack")
        assert text.allowed and text.tier == "hearth" and text.daily_limit == 15
        assert not art.allowed and art.reason == "tier_required" and art.required_tier == "lantern"
        assert not pack.allowed and pack.required_tier == "lantern"

    def test_lantern_gets_everything(self, duckdb_session: Session):
        _patron(duckdb_session, "lantern@example.com", 1200)
        for kind in ("text", "art", "pack"):
            e = ent.check_ai(duckdb_session, "lantern@example.com", kind)
            assert e.allowed and e.tier == "lantern" and e.remaining_today == 40

    def test_overpledge_maps_to_highest_met_tier(self, duckdb_session: Session):
        _patron(duckdb_session, "big@example.com", 4000)
        assert ent.check_ai(duckdb_session, "big@example.com", "art").tier == "table"

    def test_legacy_pledge_below_floor_is_hearth(self, duckdb_session: Session):
        _patron(duckdb_session, "old@example.com", 100)
        e = ent.check_ai(duckdb_session, "old@example.com", "text")
        assert e.allowed and e.tier == "hearth"

    def test_non_patron_learns_which_tier(self, duckdb_session: Session):
        e = ent.check_ai(duckdb_session, "nobody@example.com", "art")
        assert not e.allowed and e.reason == "patreon_required" and e.required_tier == "lantern"
        t = ent.check_ai(duckdb_session, "nobody@example.com", "text")
        assert t.required_tier == "hearth"


class TestTierQuota:
    """Each tier has its own daily wall."""

    def test_hearth_wall_at_15(self, duckdb_session: Session):
        _patron(duckdb_session, "busy@example.com", 500)
        for _ in range(15):
            ent.record_ai(duckdb_session, "busy@example.com")
        e = ent.check_ai(duckdb_session, "busy@example.com", "text")
        assert not e.allowed and e.reason == "daily_limit" and e.daily_limit == 15

    def test_admin_ignores_tiers(self, duckdb_session: Session, monkeypatch):
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "owner@example.com")
        e = ent.check_ai(duckdb_session, "owner@example.com", "pack")
        assert e.allowed and e.tier == "admin" and e.remaining_today is None


class TestPersonalContent:
    """Non-SRD text only reaches the deployment's own admins."""

    def test_only_admins(self, monkeypatch):
        monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", "Owner@Example.com")
        assert ent.personal_content_allowed("owner@example.com")
        assert not ent.personal_content_allowed("someone@example.com")
