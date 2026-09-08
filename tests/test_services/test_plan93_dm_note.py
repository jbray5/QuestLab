"""Plan 93 — the DM's Obsidian path, and the boundary it must never cross.

``dm_note`` names a secret ("People/Auntie Sorrel — the hag"). It rides on the
DM's own reads of an NPC, a monster and a battle map, and on nothing a player
or the shared projector can fetch.
"""

import uuid

from sqlmodel import Session

import services.battle_map_service as map_svc
import services.encounter_service as enc_svc
import services.npc_service as npc_svc
import services.player_service as play_svc
import services.table_service as table_svc
from domain.battle_map import BattleMapCreate, BattleMapUpdate
from domain.enums import CreatureSize, CreatureType
from domain.monster import MonsterStatBlockCreate, MonsterStatBlockUpdate
from domain.npc import NpcCreate, NpcUpdate
from tests.test_services.test_player_service import _campaign, _dm, _pc

SPOILER = "People/Auntie Sorrel"


class TestItRoundTrips:
    """The DM sets a path on each card-bearing entity and reads it back."""

    def test_npc(self, duckdb_session: Session):
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        npc = npc_svc.create_npc(
            duckdb_session, c.id, dm, NpcCreate(name="Aunti Sorrel", dm_note=SPOILER)
        )
        assert npc.dm_note == SPOILER
        cleared = npc_svc.update_npc(duckdb_session, npc.id, dm, NpcUpdate(dm_note=None))
        assert cleared.dm_note is None

    def test_monster(self, duckdb_session: Session):
        monster = enc_svc.create_custom_monster(
            duckdb_session,
            MonsterStatBlockCreate(
                name="Green Hag (note test)",
                size=CreatureSize.MEDIUM,
                creature_type=CreatureType.FEY,
                ac=17,
                hp_average=82,
                hp_formula="11d8+33",
                score_str=18,
                score_dex=12,
                score_con=16,
                score_int=13,
                score_wis=14,
                score_cha=14,
                challenge_rating="3",
                xp=700,
                proficiency_bonus=2,
            ),
            _dm(),
        )
        assert monster.dm_note is None
        updated = enc_svc.update_monster(
            duckdb_session, monster.id, MonsterStatBlockUpdate(dm_note="Bestiary/Green Hag")
        )
        assert updated.dm_note == "Bestiary/Green Hag"

    def test_battle_map(self, duckdb_session: Session):
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        bm = map_svc.create_map(
            duckdb_session,
            c.id,
            dm,
            BattleMapCreate(
                name="The Hearth", image_url="https://art.test/h.jpg", width=100, height=80
            ),
        )
        assert bm.dm_note is None
        updated = map_svc.update_map(
            duckdb_session, bm.id, dm, BattleMapUpdate(dm_note="Places/The Hearth")
        )
        assert updated.dm_note == "Places/The Hearth"


class TestItNeverReachesAPlayer:
    """The spoiler rule, enforced where it matters: the payload, not the render."""

    def test_the_players_npc_list_omits_it(self, duckdb_session: Session):
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        npc_svc.create_npc(
            duckdb_session,
            c.id,
            dm,
            NpcCreate(name="Aunti Sorrel", is_revealed=True, dm_note=SPOILER),
        )
        seen = play_svc.list_visible_npcs(duckdb_session, pc.id)
        assert [n["name"] for n in seen] == ["Aunti Sorrel"]
        for entry in seen:
            assert "dm_note" not in entry
            assert SPOILER not in str(entry)

    def test_the_table_projection_omits_the_maps_note(self, duckdb_session: Session):
        """The projector fetches this with no auth — the map's note must not ride along."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        adventure = _adventure(duckdb_session, c.id, dm)
        gs = _session(duckdb_session, adventure.id, dm)
        bm = map_svc.create_map(
            duckdb_session,
            c.id,
            dm,
            BattleMapCreate(
                name="The Hearth", image_url="https://art.test/h.jpg", width=100, height=80
            ),
        )
        map_svc.update_map(
            duckdb_session, bm.id, dm, BattleMapUpdate(dm_note="Places/The Hearth — the cellar")
        )
        table_svc.update_table_state(duckdb_session, gs.id, dm, _table_update(active_map_id=bm.id))
        projection = table_svc.get_projection(duckdb_session, gs.id)
        assert projection.map is not None and projection.map.name == "The Hearth"
        assert "dm_note" not in projection.map.model_dump()
        assert "cellar" not in projection.model_dump_json()


# ── local helpers (the session-shaped fixtures live in the session suite) ──────


def _adventure(db: Session, campaign_id: uuid.UUID, dm: str):
    import services.adventure_service as adv_svc
    from domain.enums import AdventureTier

    return adv_svc.create_adventure(db, campaign_id, "A", AdventureTier.TIER1, dm)


def _session(db: Session, adventure_id: uuid.UUID, dm: str):
    import services.session_service as sess_svc

    return sess_svc.create_session(db, adventure_id, 1, "S", dm)


def _table_update(**kwargs):
    from domain.table_state import TableStateUpdate

    return TableStateUpdate(**kwargs)
