"""Plan 130 — plan rules, Patreon membership parsing, and the caps.

Players never pay; with ``PRICING=off`` (the default) nothing is capped. With
``PRICING=on`` a Free DM has 2 campaigns and 250 MB; Patrons (admins, comped
DMs, and active Patreon members at $4/month or $40/year checked within 40
days) have unlimited campaigns and 5 GB; admins have no caps at all.
"""

import uuid
from datetime import UTC, datetime, timedelta

import pytest

from db.repos.campaign_repo import CampaignRepo
from db.repos.upload_repo import UploadRepo
from db.repos.user_repo import UserRepo
from domain.campaign import CampaignCreate
from domain.upload import Upload
from domain.user import User
from integrations.oauth import PatreonMembership, parse_patreon_membership
from services import campaign_service, plan_service
from services.plan_service import PlanLimitError

_ADMIN = "plan130.admin@example.com"
_CAMPAIGN = "1234567"
_NOW = datetime(2026, 11, 1, 12, 0, tzinfo=UTC)


@pytest.fixture(autouse=True)
def _env(monkeypatch):
    monkeypatch.setenv("BOOTSTRAP_ADMIN_EMAILS", _ADMIN)
    monkeypatch.delenv("PRICING", raising=False)


def _email(tag: str) -> str:
    """A fresh address per test (the session engine keeps committed rows)."""
    return f"plan130.{tag}.{uuid.uuid4().hex[:8]}@example.com"


# ── Patreon membership parsing (fixture JSON, no network) ─────────────────────


def _member(mid, campaign, status="active_patron", cents=400, cadence=1, tiers=()):
    return {
        "id": mid,
        "type": "member",
        "attributes": {
            "patron_status": status,
            "currently_entitled_amount_cents": cents,
            "pledge_cadence": cadence,
        },
        "relationships": {
            "campaign": {"data": {"id": campaign, "type": "campaign"}},
            "currently_entitled_tiers": {"data": [{"id": t, "type": "tier"} for t in tiers]},
        },
    }


def _tier(tid, cents):
    return {"id": tid, "type": "tier", "attributes": {"amount_cents": cents, "title": "Patron"}}


def _identity(*included):
    members = [o for o in included if o["type"] == "member"]
    return {
        "data": {
            "id": "pat-1",
            "type": "user",
            "attributes": {"full_name": "Pat Ron"},
            "relationships": {
                "memberships": {"data": [{"id": m["id"], "type": "member"} for m in members]}
            },
        },
        "included": [*included, {"id": _CAMPAIGN, "type": "campaign", "attributes": {}}],
    }


def test_active_monthly_membership():
    m = parse_patreon_membership(_identity(_member("m1", _CAMPAIGN, cents=400)), _CAMPAIGN)
    assert m.found and m.active and m.entitled_cents == 400 and m.cadence_months == 1
    assert plan_service.membership_cents(m) == 400


def test_declined_membership_is_not_active():
    doc = _identity(_member("m1", _CAMPAIGN, status="declined_patron", cents=400))
    m = parse_patreon_membership(doc, _CAMPAIGN)
    assert m.found and not m.active and m.patron_status == "declined_patron"


def test_membership_of_another_campaign_is_ignored():
    m = parse_patreon_membership(_identity(_member("m1", "999", cents=2000)), _CAMPAIGN)
    assert not m.found and not m.active and plan_service.membership_cents(m) == 0


def test_missing_membership():
    assert not parse_patreon_membership({"data": {"id": "pat-1"}}, _CAMPAIGN).found
    assert not parse_patreon_membership({}, _CAMPAIGN).found
    # No campaign configured: nothing can match.
    assert not parse_patreon_membership(_identity(_member("m1", _CAMPAIGN)), "").found


def test_annual_forty_dollars_counts_as_the_four_dollar_tier():
    doc = _identity(_member("m1", _CAMPAIGN, cents=4000, cadence="12"))
    m = parse_patreon_membership(doc, _CAMPAIGN)
    assert m.cadence_months == 12
    assert plan_service.membership_cents(m) == plan_service.PATRON_MIN_CENTS


def test_annual_low_tier_does_not_count():
    m = parse_patreon_membership(
        _identity(_member("m1", _CAMPAIGN, cents=1200, cadence=12)), _CAMPAIGN
    )
    assert plan_service.membership_cents(m) < plan_service.PATRON_MIN_CENTS


def test_entitled_tier_price_counts_in_the_campaign_currency():
    """A patron paying a converted local price still gets the tier they're entitled to."""
    doc = _identity(_member("m1", _CAMPAIGN, cents=320, tiers=("t4",)), _tier("t4", 400))
    m = parse_patreon_membership(doc, _CAMPAIGN)
    assert m.tier_cents == 400 and plan_service.membership_cents(m) == 400


def test_an_active_membership_wins_over_a_former_one():
    doc = _identity(
        _member("old", _CAMPAIGN, status="former_patron", cents=0),
        _member("new", _CAMPAIGN, status="active_patron", cents=400),
    )
    assert parse_patreon_membership(doc, _CAMPAIGN).active


# ── Plan rules ────────────────────────────────────────────────────────────────


def _patron(cents=400, days_ago=1, active=True, comped=False, email=None):
    return User(
        email=email or _email("rule"),
        patron_active=active,
        patron_tier_cents=cents,
        patron_checked_at=(_NOW - timedelta(days=days_ago)).replace(tzinfo=None),
        patron_comped=comped,
    )


def test_admin_is_patron():
    assert plan_service.plan_for(_ADMIN, None, _NOW) == ("patron", "admin")
    assert plan_service.limits_for("patron", "admin") == (None, None)


def test_comped_is_patron():
    user = _patron(active=False, cents=0, comped=True)
    assert plan_service.plan_for(user.email, user, _NOW) == ("patron", "comped")


def test_active_recent_patreon_is_patron():
    user = _patron()
    assert plan_service.plan_for(user.email, user, _NOW) == ("patron", "patreon")
    assert plan_service.limits_for("patron", "patreon") == (None, plan_service.PATRON_UPLOAD_BYTES)


def test_lapsed_check_is_free():
    user = _patron(days_ago=plan_service.MEMBERSHIP_FRESH_DAYS + 1)
    assert plan_service.plan_for(user.email, user, _NOW) == ("free", None)
    # On the 40th day it still counts.
    user = _patron(days_ago=plan_service.MEMBERSHIP_FRESH_DAYS)
    assert plan_service.plan_for(user.email, user, _NOW)[0] == "patron"


def test_low_tier_is_free():
    user = _patron(cents=plan_service.PATRON_MIN_CENTS - 1)
    assert plan_service.plan_for(user.email, user, _NOW) == ("free", None)


def test_inactive_or_never_checked_is_free():
    user = _patron(active=False)
    assert plan_service.plan_for(user.email, user, _NOW) == ("free", None)
    user = User(email=_email("never"), patron_active=True, patron_tier_cents=500)
    assert plan_service.plan_for(user.email, user, _NOW) == ("free", None)
    assert plan_service.plan_for(_email("nobody"), None, _NOW) == ("free", None)
    assert plan_service.limits_for("free", None) == (
        plan_service.FREE_CAMPAIGNS,
        plan_service.FREE_UPLOAD_BYTES,
    )


def test_apply_membership_writes_the_snapshot():
    user = User(email=_email("apply"))
    m = PatreonMembership(found=True, patron_status="active_patron", entitled_cents=400)
    plan_service.apply_membership(user, m, _NOW)
    assert user.patron_active and user.patron_tier_cents == 400
    assert user.patron_checked_at == _NOW.replace(tzinfo=None)
    # Not asked (no campaign configured): the snapshot is left alone.
    plan_service.apply_membership(user, None, _NOW + timedelta(days=3))
    assert user.patron_checked_at == _NOW.replace(tzinfo=None)
    # Asked and not found: a lapsed Patron stops counting straight away.
    plan_service.apply_membership(user, PatreonMembership(), _NOW)
    assert not user.patron_active and user.patron_tier_cents == 0


# ── Caps: off vs on ───────────────────────────────────────────────────────────


def _campaigns(db, email, n):
    for i in range(n):
        CampaignRepo.create(db, CampaignCreate(name=f"C{i}", setting="", tone="", dm_email=email))


def test_campaign_cap_only_when_pricing_is_on(duckdb_session, monkeypatch):
    email = _email("camps")
    _campaigns(duckdb_session, email, 2)
    plan_service.check_can_create_campaign(duckdb_session, email)  # off: no cap
    monkeypatch.setenv("PRICING", "on")
    with pytest.raises(PlanLimitError) as exc:
        plan_service.check_can_create_campaign(duckdb_session, email)
    assert exc.value.limit == "campaigns"
    assert exc.value.message.startswith("Free DMs run two campaigns.")
    assert exc.value.detail()["code"] == "plan_limit"


def test_campaign_service_refuses_the_third(duckdb_session, monkeypatch):
    monkeypatch.setenv("PRICING", "on")
    email = _email("third")
    campaign_service.create_campaign(duckdb_session, "One", dm_email=email)
    campaign_service.create_campaign(duckdb_session, "Two", dm_email=email)
    with pytest.raises(PlanLimitError):
        campaign_service.create_campaign(duckdb_session, "Three", dm_email=email)
    assert len(CampaignRepo.list_by_dm(duckdb_session, email)) == 2


def test_patrons_and_admins_pass_the_campaign_cap(duckdb_session, monkeypatch):
    monkeypatch.setenv("PRICING", "on")
    comped = _email("comped")
    UserRepo.save(duckdb_session, User(email=comped, patron_comped=True))
    _campaigns(duckdb_session, comped, 3)
    plan_service.check_can_create_campaign(duckdb_session, comped)
    _campaigns(duckdb_session, _ADMIN, 3)
    plan_service.check_can_create_campaign(duckdb_session, _ADMIN)


def test_unlimited_means_past_the_old_soft_limit(duckdb_session):
    """Patrons aren't held to the 20-campaign soft limit; free DMs still are."""
    comped = _email("many")
    UserRepo.save(duckdb_session, User(email=comped, patron_comped=True))
    _campaigns(duckdb_session, comped, campaign_service.MAX_CAMPAIGNS_PER_DM)
    campaign_service.create_campaign(duckdb_session, "One more", dm_email=comped)
    free = _email("soft")
    _campaigns(duckdb_session, free, campaign_service.MAX_CAMPAIGNS_PER_DM)
    with pytest.raises(ValueError):
        campaign_service.create_campaign(duckdb_session, "One more", dm_email=free)


def _ledger(db, email, size):
    UploadRepo.add(db, Upload(owner_email=email, url="https://blob.test/x", size_bytes=size))


def test_upload_cap_only_when_pricing_is_on(duckdb_session, monkeypatch):
    email = _email("bytes")
    _ledger(duckdb_session, email, plan_service.FREE_UPLOAD_BYTES - 10)
    plan_service.check_can_upload(duckdb_session, email, 100)  # off: no cap
    monkeypatch.setenv("PRICING", "on")
    plan_service.check_can_upload(duckdb_session, email, 10)  # exactly at the line is fine
    with pytest.raises(PlanLimitError) as exc:
        plan_service.check_can_upload(duckdb_session, email, 11)
    assert exc.value.limit == "storage" and "250 MB" in exc.value.message


def test_patron_storage_is_five_gb_and_admins_have_none(duckdb_session, monkeypatch):
    monkeypatch.setenv("PRICING", "on")
    comped = _email("bigger")
    UserRepo.save(duckdb_session, User(email=comped, patron_comped=True))
    _ledger(duckdb_session, comped, plan_service.FREE_UPLOAD_BYTES * 4)
    plan_service.check_can_upload(duckdb_session, comped, 1000)
    _ledger(duckdb_session, comped, plan_service.PATRON_UPLOAD_BYTES)
    with pytest.raises(PlanLimitError) as exc:
        plan_service.check_can_upload(duckdb_session, comped, 1)
    assert "5 GB" in exc.value.message
    _ledger(duckdb_session, _ADMIN, plan_service.PATRON_UPLOAD_BYTES * 2)
    plan_service.check_can_upload(duckdb_session, _ADMIN, 1000)


def test_record_upload_feeds_usage(duckdb_session):
    email = _email("ledger")
    assert plan_service.upload_bytes_used(duckdb_session, email) == 0
    plan_service.record_upload(
        duckdb_session, email.upper(), "https://blob.test/a.png", 1500, "portrait"
    )
    plan_service.record_upload(duckdb_session, email, "https://blob.test/b.webm", 2500, "map")
    assert plan_service.upload_bytes_used(duckdb_session, email) == 4000
    kinds = sorted(r.kind for r in UploadRepo.list_by_owner(duckdb_session, email))
    assert kinds == ["map", "portrait"]


def test_status_during_the_beta(duckdb_session, monkeypatch):
    monkeypatch.setenv("PATREON_URL", "https://www.patreon.com/questlab")
    email = _email("status")
    _campaigns(duckdb_session, email, 3)
    s = plan_service.status(duckdb_session, email)
    assert s.plan == "free" and s.why is None and s.pricing_on is False
    assert s.campaigns_used == 3 and s.campaigns_limit == 2
    assert s.upload_bytes_limit == plan_service.FREE_UPLOAD_BYTES
    assert s.support_url == "https://www.patreon.com/questlab"
    assert (s.price_monthly, s.price_yearly) == ("$4/month", "$40/year")


def test_set_comped_is_admin_only_and_toggles(duckdb_session):
    email = _email("comp")
    UserRepo.save(duckdb_session, User(email=email))
    with pytest.raises(PermissionError):
        plan_service.set_comped(duckdb_session, email, email, True)
    assert plan_service.set_comped(duckdb_session, _ADMIN, email, True).plan == "patron"
    result = plan_service.set_comped(duckdb_session, _ADMIN, email, False)
    assert result.plan == "free" and result.comped is False
    with pytest.raises(ValueError):
        plan_service.set_comped(duckdb_session, _ADMIN, _email("ghost"), True)
