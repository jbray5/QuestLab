"""Plan 91 — an NPC's true form: the disguise shows until the DM reveals it."""

from sqlmodel import Session

import services.npc_service as npc_svc
import services.player_service as play_svc
from domain.npc import NpcCreate, NpcUpdate
from tests.test_services.test_player_service import _campaign, _dm, _pc


def _seen(db, pc_id, name):
    return [n["portrait_url"] for n in play_svc.list_visible_npcs(db, pc_id) if n["name"] == name]


def test_players_see_the_disguise_until_the_reveal(duckdb_session: Session):
    """The true form is stored from day one but only replaces the portrait once revealed."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, c.id, dm)
    npc = npc_svc.create_npc(
        duckdb_session,
        c.id,
        dm,
        NpcCreate(
            name="Aunti Sorrel",
            portrait_url="https://art.test/aunt.png",
            true_form_url="https://art.test/hag.png",
            is_revealed=True,
        ),
    )
    assert npc.true_form_url == "https://art.test/hag.png" and npc.true_form_revealed is False
    assert _seen(duckdb_session, pc.id, "Aunti Sorrel") == ["https://art.test/aunt.png"]

    npc_svc.update_npc(duckdb_session, npc.id, dm, NpcUpdate(true_form_revealed=True))
    assert _seen(duckdb_session, pc.id, "Aunti Sorrel") == ["https://art.test/hag.png"]

    npc_svc.update_npc(duckdb_session, npc.id, dm, NpcUpdate(true_form_revealed=False))
    assert _seen(duckdb_session, pc.id, "Aunti Sorrel") == ["https://art.test/aunt.png"]


def test_reveal_without_a_true_form_keeps_the_portrait(duckdb_session: Session):
    """Flipping the switch on an NPC with no true form changes nothing."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, c.id, dm)
    npc_svc.create_npc(
        duckdb_session,
        c.id,
        dm,
        NpcCreate(
            name="Tavish",
            portrait_url="https://art.test/satyr.jpg",
            is_revealed=True,
            true_form_revealed=True,
        ),
    )
    assert _seen(duckdb_session, pc.id, "Tavish") == ["https://art.test/satyr.jpg"]
