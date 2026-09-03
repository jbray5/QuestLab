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
