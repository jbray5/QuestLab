"""Plan 96 — switching boards must not clump the party in a corner.

Token coordinates are absolute image pixels. Swapping a 1536x1024 board for a
4060x8120 one left every token inside the old footprint — the whole party in
the top-left corner of the new map.
"""

import uuid

from sqlmodel import Session

import services.adventure_service as adv_svc
import services.battle_map_service as map_svc
import services.session_service as sess_svc
import services.table_service as table_svc
from domain.battle_map import BattleMapCreate
from domain.enums import AdventureTier
from domain.table_state import TableStateUpdate
from tests.test_services.test_player_service import _campaign, _dm


def _session(db: Session, dm: str):
    c = _campaign(db, dm)
    adventure = adv_svc.create_adventure(db, c.id, "A", AdventureTier.TIER1, dm)
    return c, sess_svc.create_session(db, adventure.id, 1, "S", dm)


def _map(db: Session, campaign_id: uuid.UUID, dm: str, name: str, w: int, h: int):
    return map_svc.create_map(
        db,
        campaign_id,
        dm,
        BattleMapCreate(name=name, image_url=f"https://art.test/{name}.jpg", width=w, height=h),
    )


def _tokens(db, gs_id, dm):
    rows = table_svc.get_table_state(db, gs_id, dm).tokens
    return {r["label"]: (float(r["x"]), float(r["y"])) for r in (dict(t) for t in rows)}


def test_a_map_swap_carries_tokens_by_fraction(duckdb_session: Session):
    """A token halfway across a small board is halfway across the big one."""
    dm = _dm()
    campaign, gs = _session(duckdb_session, dm)
    small = _map(duckdb_session, campaign.id, dm, "Restwater", 1536, 1024)
    big = _map(duckdb_session, campaign.id, dm, "LUNA", 4060, 8120)

    table_svc.update_table_state(
        duckdb_session,
        gs.id,
        dm,
        TableStateUpdate(
            active_map_id=small.id,
            tokens=[
                {"id": "a", "kind": "pc", "label": "Willa", "x": 768, "y": 512},
                {"id": "b", "kind": "pc", "label": "Nya", "x": 384, "y": 256},
            ],
        ),
    )
    table_svc.update_table_state(duckdb_session, gs.id, dm, TableStateUpdate(active_map_id=big.id))

    seen = _tokens(duckdb_session, gs.id, dm)
    # Dead centre stays dead centre; the quarter-point stays the quarter-point.
    assert seen["Willa"] == (2030.0, 4060.0)
    assert seen["Nya"] == (1015.0, 2030.0)


def test_switching_back_and_forth_stays_in_bounds(duckdb_session: Session):
    """A token near the far edge never lands outside the next map."""
    dm = _dm()
    campaign, gs = _session(duckdb_session, dm)
    wide = _map(duckdb_session, campaign.id, dm, "Harbor", 6440, 4620)
    tall = _map(duckdb_session, campaign.id, dm, "Street", 3920, 4900)

    table_svc.update_table_state(
        duckdb_session,
        gs.id,
        dm,
        TableStateUpdate(
            active_map_id=wide.id,
            tokens=[{"id": "a", "kind": "pc", "label": "Creed", "x": 6439, "y": 4619}],
        ),
    )
    for target in (tall, wide, tall):
        table_svc.update_table_state(
            duckdb_session, gs.id, dm, TableStateUpdate(active_map_id=target.id)
        )
        x, y = _tokens(duckdb_session, gs.id, dm)["Creed"]
        assert 0 <= x <= target.width and 0 <= y <= target.height


def test_the_same_map_and_explicit_tokens_are_left_alone(duckdb_session: Session):
    """Re-selecting the active map, or a caller sending its own tokens, is untouched."""
    dm = _dm()
    campaign, gs = _session(duckdb_session, dm)
    a = _map(duckdb_session, campaign.id, dm, "A", 1000, 1000)
    b = _map(duckdb_session, campaign.id, dm, "B", 2000, 2000)
    table_svc.update_table_state(
        duckdb_session,
        gs.id,
        dm,
        TableStateUpdate(
            active_map_id=a.id, tokens=[{"id": "t", "kind": "pc", "label": "T", "x": 100, "y": 100}]
        ),
    )
    # Same map again — no move.
    table_svc.update_table_state(duckdb_session, gs.id, dm, TableStateUpdate(active_map_id=a.id))
    assert _tokens(duckdb_session, gs.id, dm)["T"] == (100.0, 100.0)
    # A swap that also sets tokens: the caller's coordinates win.
    table_svc.update_table_state(
        duckdb_session,
        gs.id,
        dm,
        TableStateUpdate(
            active_map_id=b.id, tokens=[{"id": "t", "kind": "pc", "label": "T", "x": 7, "y": 9}]
        ),
    )
    assert _tokens(duckdb_session, gs.id, dm)["T"] == (7.0, 9.0)
