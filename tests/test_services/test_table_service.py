"""Plan 42 tests — battle-map library + Table View projection safety.

The projection is the one surface players see (on a projector), served without
auth via a capability URL, so these tests are the guard that it never leaks HP,
initiative, or the names of unrevealed fog regions.
"""

import queue
import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.battle_map_service as map_svc
import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.session_service as sess_svc
import services.table_service as table_svc
from db.repos.monster_repo import MonsterRepo
from domain.battle_map import BattleMapCreate, FogRegion
from domain.character import PlayerCharacterUpdate
from domain.enums import CharacterClass, CreatureSize, CreatureType
from domain.monster import MonsterStatBlockCreate
from domain.session import SessionCombatantCreate, SessionCombatantUpdate, SessionCombatStateWrite
from domain.table_state import TableStateUpdate, Token
from integrations.event_bus import event_bus


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _campaign_and_session(db: Session, dm: str):
    campaign = camp_svc.create_campaign(db, name="C", setting="R", tone="T", dm_email=dm)
    adventure = adv_svc.create_adventure(
        db,
        campaign_id=campaign.id,
        title="Adv",
        synopsis="s",
        tier="Tier1",
        act_count=3,
        dm_email=dm,
    )
    gs = sess_svc.create_session(
        db,
        adventure_id=adventure.id,
        session_number=1,
        title="S1",
        dm_email=dm,
        date_planned=None,
        attending_pc_ids=[],
    )
    return campaign, adventure, gs


def _make_pc(db: Session, campaign_id: uuid.UUID, dm: str):
    return char_svc.create_character(
        db,
        campaign_id=campaign_id,
        dm_email=dm,
        player_name="P",
        character_name="Willa",
        race="Human",
        character_class=CharacterClass.FIGHTER,
        level=3,
        score_str=14,
        score_dex=14,
        score_con=14,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=24,
        hp_current=24,
        ac=15,
        speed=30,
    )


def _make_map(db, campaign_id, dm, name="Hearth"):
    return map_svc.create_map(
        db,
        campaign_id,
        dm,
        BattleMapCreate(
            name=name,
            image_url="https://blob.example/map.jpg",
            width=2000,
            height=1400,
            grid_size=140,
            regions=[
                # Region names are deliberately DISJOINT from the map name:
                # the map's name is player-safe and ships in the projection
                # (Plan 59 — per-map dressing); region names never do.
                FogRegion(id="r1", name="Undercroft", points=[[0, 0], [100, 0], [100, 100]]),
                FogRegion(id="r2", name="Graveyard", points=[[200, 200], [300, 200], [300, 300]]),
            ],
        ),
    )


class TestBattleMapLibrary:
    """Owner-scoped CRUD for the map library."""

    def test_create_and_list(self, duckdb_session: Session):
        """A created map appears in the campaign's library."""
        dm = _dm()
        campaign, _adv, _gs = _campaign_and_session(duckdb_session, dm)
        _make_map(duckdb_session, campaign.id, dm)
        maps = map_svc.list_maps(duckdb_session, campaign.id, dm)
        assert [m.name for m in maps] == ["Hearth"]

    def test_non_owner_denied(self, duckdb_session: Session):
        """A different DM cannot list another campaign's maps."""
        dm = _dm()
        campaign, _adv, _gs = _campaign_and_session(duckdb_session, dm)
        with pytest.raises(PermissionError):
            map_svc.list_maps(duckdb_session, campaign.id, _dm())


class TestTableStateWrites:
    """DM console reads/writes; cross-campaign maps rejected."""

    def test_update_reflects_in_read(self, duckdb_session: Session):
        """Setting map/fog/darkness/title/tokens round-trips through the read."""
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        pc = _make_pc(duckdb_session, campaign.id, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)

        table_svc.update_table_state(
            duckdb_session,
            gs.id,
            dm,
            TableStateUpdate(
                active_map_id=battle_map.id,
                fog_on=True,
                revealed_region_ids=["r1"],
                darkness=0.7,
                title="Hold the Hearth",
                tokens=[Token(id="t1", kind="pc", ref_id=str(pc.id), label="Willa", x=500, y=500)],
            ),
        )
        read = table_svc.get_table_state(duckdb_session, gs.id, dm)
        assert read.active_map_id == battle_map.id
        assert read.fog_on is True
        assert read.revealed_region_ids == ["r1"]
        assert read.darkness == pytest.approx(0.7)
        assert read.title == "Hold the Hearth"
        assert read.tokens[0]["label"] == "Willa"

    def test_cross_campaign_map_rejected(self, duckdb_session: Session):
        """A map from another campaign cannot be set as the active map."""
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        other_campaign, _oadv, _ogs = _campaign_and_session(duckdb_session, dm)
        foreign_map = _make_map(duckdb_session, other_campaign.id, dm, name="Foreign")
        with pytest.raises(ValueError):
            table_svc.update_table_state(
                duckdb_session, gs.id, dm, TableStateUpdate(active_map_id=foreign_map.id)
            )

    def test_non_owner_cannot_write(self, duckdb_session: Session):
        """A non-owning DM cannot mutate the table state."""
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        with pytest.raises(PermissionError):
            table_svc.update_table_state(
                duckdb_session, gs.id, _dm(), TableStateUpdate(darkness=0.5)
            )

    def test_update_publishes_table_event(self, duckdb_session: Session):
        """A table update fans a table.updated event to the table topic."""
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        q = event_bus.subscribe([f"table:{gs.id}"])
        try:
            table_svc.update_table_state(duckdb_session, gs.id, dm, TableStateUpdate(darkness=0.3))
            got = []
            while True:
                try:
                    got.append(q.get_nowait())
                except queue.Empty:
                    break
        finally:
            event_bus.unsubscribe([f"table:{gs.id}"], q)
        assert any(e.get("type") == "table.updated" for e in got)


class TestProjectionSafety:
    """The player-safe projection — the security-critical surface."""

    def test_empty_when_no_state(self, duckdb_session: Session):
        """A session with no table state yields a valid empty projection."""
        dm = _dm()
        _campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        proj = table_svc.get_projection(duckdb_session, gs.id)
        assert proj.map is None
        assert proj.revealed_regions == []
        assert proj.tokens == []

    def test_reveals_only_revealed_regions_and_hides_all_names(self, duckdb_session: Session):
        """Only revealed region geometry is sent; no region NAME ever leaks."""
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        table_svc.update_table_state(
            duckdb_session,
            gs.id,
            dm,
            TableStateUpdate(active_map_id=battle_map.id, fog_on=True, revealed_region_ids=["r1"]),
        )
        proj = table_svc.get_projection(duckdb_session, gs.id)

        assert proj.map is not None and proj.map.width == 2000
        # The MAP name is part of the projection contract (player-safe).
        assert proj.map.name == "Hearth"
        # r1 revealed → its points present; r2 (Graveyard) absent.
        assert proj.revealed_regions == [[[0, 0], [100, 0], [100, 100]]]
        blob = proj.model_dump_json()
        assert "Graveyard" not in blob  # unrevealed region name
        assert "Undercroft" not in blob  # revealed region's NAME still never sent

    def test_projection_carries_no_hp(self, duckdb_session: Session):
        """Idle tables carry no HP or order; foe HP never crosses (Plan 83)."""
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        pc = _make_pc(duckdb_session, campaign.id, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        table_svc.update_table_state(
            duckdb_session,
            gs.id,
            dm,
            TableStateUpdate(
                active_map_id=battle_map.id,
                tokens=[Token(id="t1", kind="pc", ref_id=str(pc.id), label="Willa")],
            ),
        )
        proj = table_svc.get_projection(duckdb_session, gs.id)
        blob = proj.model_dump_json()
        # Plan 83 — the order and the party's HP ride along only while a fight
        # runs; idle tables carry no numbers at all, and foe HP never does.
        assert proj.combat_running is False and proj.initiative == []
        assert "hp_current" not in blob and "hp_max" not in blob

    def test_projection_resolves_figures(self, duckdb_session: Session):
        """Plan 111 — each token carries its row's model and a height: PCs by race,
        monsters by size, through the combatant the token references."""
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        pc = _make_pc(duckdb_session, campaign.id, dm)
        char_svc.update_character(
            duckdb_session,
            pc.id,
            dm,
            PlayerCharacterUpdate(race="Rock Gnome", model_url="https://cdn.test/steven.glb"),
        )
        ogre = MonsterRepo.create(
            duckdb_session,
            MonsterStatBlockCreate(
                name="Ogre",
                size=CreatureSize.LARGE,
                creature_type=CreatureType.GIANT,
                ac=11,
                hp_average=59,
                hp_formula="7d10+21",
                score_str=19,
                score_dex=8,
                score_con=16,
                score_int=5,
                score_wis=7,
                score_cha=7,
                challenge_rating="2",
                xp=450,
                proficiency_bonus=2,
                model_url="https://cdn.test/ogre.glb",
            ),
        )
        state = sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(
                combat_state="running",
                combatants=[
                    SessionCombatantCreate(
                        sort_index=0,
                        name="Ogre",
                        dex_score=8,
                        initiative_roll=5,
                        hp_current=59,
                        hp_max=59,
                        type="monster",
                        monster_id=ogre.id,
                    ),
                    SessionCombatantCreate(
                        sort_index=1,
                        name="Wolf",
                        dex_score=15,
                        initiative_roll=12,
                        hp_current=11,
                        hp_max=11,
                        type="monster",
                    ),
                ],
            ),
        )
        ogre_ref, wolf_ref = (str(c.id) for c in state.combatants)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        table_svc.update_table_state(
            duckdb_session,
            gs.id,
            dm,
            TableStateUpdate(
                active_map_id=battle_map.id,
                tokens=[
                    Token(id="t1", kind="pc", ref_id=str(pc.id), label="Steven"),
                    Token(id="t2", kind="monster", ref_id=ogre_ref, label="Ogre", size=2),
                    Token(id="t3", kind="monster", ref_id=wolf_ref, label="Wolf"),
                    Token(id="t4", kind="custom", label="Barrel"),
                ],
            ),
        )
        proj = table_svc.get_projection(duckdb_session, gs.id)
        by_id = {t.id: t for t in proj.tokens}
        assert by_id["t1"].model_url == "https://cdn.test/steven.glb"
        assert by_id["t1"].model_height_ft == 3.5
        assert by_id["t2"].model_url == "https://cdn.test/ogre.glb"
        assert by_id["t2"].model_height_ft == 10.0
        # An ad-hoc combatant has no stat block behind it; a marker has nothing.
        assert by_id["t3"].model_url is None and by_id["t3"].model_height_ft is None
        assert by_id["t4"].model_url is None
        # The projection never carries the DM's private note or a stat.
        blob = proj.model_dump_json()
        assert "dm_note" not in blob and "hp_average" not in blob

    def test_orphaned_foe_tokens_relink_by_name(self, duckdb_session: Session):
        """Rolling initiative gives combatants new ids; tokens made before that
        still find their combatant by name, so glow and the figure follow."""
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        ogre = MonsterRepo.create(
            duckdb_session,
            MonsterStatBlockCreate(
                name="Ogre",
                size=CreatureSize.LARGE,
                creature_type=CreatureType.GIANT,
                ac=11,
                hp_average=59,
                hp_formula="7d10+21",
                score_str=19,
                score_dex=8,
                score_con=16,
                score_int=5,
                score_wis=7,
                score_cha=7,
                challenge_rating="2",
                xp=450,
                proficiency_bonus=2,
                model_url="https://cdn.test/ogre.glb",
            ),
        )

        def roster(active_first: bool):
            return SessionCombatStateWrite(
                combat_state="running",
                combatants=[
                    SessionCombatantCreate(
                        sort_index=i,
                        name=f"Ogre {i + 1}",
                        dex_score=8,
                        initiative_roll=10 - i,
                        hp_current=59,
                        hp_max=59,
                        type="monster",
                        monster_id=ogre.id,
                    )
                    for i in range(2)
                ],
            )

        first = sess_svc.save_combat_state(duckdb_session, gs.id, dm, roster(True))
        old_ids = [str(c.id) for c in first.combatants]
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        table_svc.update_table_state(
            duckdb_session,
            gs.id,
            dm,
            TableStateUpdate(
                active_map_id=battle_map.id,
                tokens=[
                    Token(id="o1", kind="monster", ref_id=old_ids[0], label="Ogre", size=2),
                    Token(id="o2", kind="monster", ref_id=old_ids[1], label="Ogre", size=2),
                ],
            ),
        )
        # Initiative re-rolled: every row is new, the tokens are orphans.
        second = sess_svc.save_combat_state(duckdb_session, gs.id, dm, roster(True))
        new_ids = [str(c.id) for c in second.combatants]
        assert set(new_ids).isdisjoint(old_ids)

        proj = table_svc.get_projection(duckdb_session, gs.id)
        by_id = {t.id: t for t in proj.tokens}
        assert {by_id["o1"].ref_id, by_id["o2"].ref_id} == set(new_ids)
        assert by_id["o1"].model_url == "https://cdn.test/ogre.glb"
        assert proj.active_token_ref in (by_id["o1"].ref_id, by_id["o2"].ref_id)

    def test_revealed_exits_come_through_as_keys(self, duckdb_session: Session):
        """Plan 112 — an "exit:<key>" reveal names the exit on the projection and
        never appears among the fog polygons."""
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        battle_map = _make_map(duckdb_session, campaign.id, dm)
        table_svc.update_table_state(
            duckdb_session,
            gs.id,
            dm,
            TableStateUpdate(active_map_id=battle_map.id, revealed_region_ids=["exit:abode"]),
        )
        proj = table_svc.get_projection(duckdb_session, gs.id)
        assert proj.revealed_exits == ["abode"]
        assert proj.revealed_regions == []

    def test_glow_only_while_running(self, duckdb_session: Session):
        """active_token_ref resolves to the active PC only while combat runs."""
        dm = _dm()
        campaign, _adv, gs = _campaign_and_session(duckdb_session, dm)
        pc = _make_pc(duckdb_session, campaign.id, dm)
        state = sess_svc.save_combat_state(
            duckdb_session,
            gs.id,
            dm,
            SessionCombatStateWrite(
                combat_state="running",
                combatants=[
                    SessionCombatantCreate(
                        sort_index=0,
                        name="Willa",
                        dex_score=14,
                        initiative_roll=18,
                        hp_current=24,
                        hp_max=24,
                        type="pc",
                        character_id=pc.id,
                    ),
                    SessionCombatantCreate(
                        sort_index=1,
                        name="Pixie",
                        dex_score=14,
                        initiative_roll=10,
                        hp_current=3,
                        hp_max=3,
                        type="monster",
                    ),
                ],
            ),
        )
        pixie_id = state.combatants[1].id
        sess_svc.update_combatant(
            duckdb_session, gs.id, pixie_id, dm, SessionCombatantUpdate(defeated=True)
        )

        proj = table_svc.get_projection(duckdb_session, gs.id)
        assert proj.active_token_ref == str(pc.id)  # Willa is up
        assert str(pixie_id) in proj.defeated_refs  # dead pixie dimmed

        # End the fight → no glow leaks.
        sess_svc.clear_combat_state(duckdb_session, gs.id, dm)
        proj2 = table_svc.get_projection(duckdb_session, gs.id)
        assert proj2.active_token_ref is None
