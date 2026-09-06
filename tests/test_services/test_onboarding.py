"""Starter campaign (Plan 73): one click gives a new DM a runnable table."""

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from services import onboarding_service, session_service, table_service


def test_seed_starter_builds_a_runnable_night(duckdb_session: Session):
    dm = "newbie@example.com"
    assert not onboarding_service.has_starter(duckdb_session, dm)
    out = onboarding_service.seed_starter(duckdb_session, dm)
    assert onboarding_service.has_starter(duckdb_session, dm)
    camp = next(c for c in CampaignRepo.list_by_dm(duckdb_session, dm))
    assert camp.name == onboarding_service.STARTER_NAME
    # Four pregens attend session 1; the map is staged with a token per PC.
    import uuid

    sid = uuid.UUID(out["session_id"])
    gs = session_service.get_session(duckdb_session, sid, dm)
    assert len(gs.attending_pc_ids or []) == 4
    proj = table_service.get_projection(duckdb_session, sid)
    assert proj.map is not None and proj.map.name == "The Mill Road"
    assert len(proj.tokens) == 4 and all(t.kind == "pc" for t in proj.tokens)


def test_find_starter_upgrades_an_old_sample(duckdb_session: Session):
    """A sample built before Plan 83 gains the runbook, the NPCs and a clean title."""
    import uuid

    from db.repos.npc_repo import NpcRepo
    from db.repos.session_repo import SessionRepo, SessionRunbookRepo

    dm = f"old_{uuid.uuid4().hex[:6]}@example.com"
    out = onboarding_service.seed_starter(duckdb_session, dm)
    sid = uuid.UUID(out["session_id"])
    cid = uuid.UUID(out["campaign_id"])
    # Age it: strip the runbook and NPCs, restore the doubled title.
    rb = SessionRunbookRepo.get_by_session(duckdb_session, sid)
    duckdb_session.delete(rb)
    for n in NpcRepo.list_by_campaign(duckdb_session, cid):
        duckdb_session.delete(n)
    gs = SessionRepo.get_by_id(duckdb_session, sid)
    gs.title = "Session 1 — The Millpond Bells"
    duckdb_session.add(gs)
    duckdb_session.commit()
    assert SessionRunbookRepo.get_by_session(duckdb_session, sid) is None

    found = onboarding_service.find_starter(duckdb_session, dm)
    assert found and found["session_id"] == out["session_id"]
    assert SessionRunbookRepo.get_by_session(duckdb_session, sid) is not None
    assert {n.name for n in NpcRepo.list_by_campaign(duckdb_session, cid)} >= {
        "Aldous Fenwright",
        "Tansy Quill",
    }
    assert SessionRepo.get_by_id(duckdb_session, sid).title == "The Millpond Bells"
    # Idempotent: a second look adds nothing.
    onboarding_service.find_starter(duckdb_session, dm)
    assert len(NpcRepo.list_by_campaign(duckdb_session, cid)) == 2
