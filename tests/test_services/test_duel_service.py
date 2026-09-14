"""Plan 104 — duels fought on separate devices.

The hot-seat duel keeps the whole fight on one phone. When two players are on
two phones, the fight has to live somewhere with an authority, and the one
question that matters is: whose turn is it, and did the server check?
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.class_feature_repo import ClassFeatureRepo
from domain.arena import ArenaAction
from domain.enums import CharacterClass
from integrations.dnd_rules.class_features_2024 import CLASS_FEATURES_2024
from services import arena_service as arena
from services import duel_service, feature_service
from tests.test_services.test_arena_rules import (  # noqa: F401 — fixtures
    _MADE,
    _Fixed,
    _owners_table,
    _tidy,
)


def _table(db: Session, *classes: CharacterClass):
    """One campaign, several characters — everything a duel needs.

    ``_pc`` in the rules suite makes a fresh campaign per character, and a duel
    refuses anyone from another table, so this builds them side by side.
    """
    dm = f"duel104_{uuid.uuid4().hex[:6]}@example.com"
    campaign = camp_svc.create_campaign(db, name="The Ring", setting="R", tone="T", dm_email=dm)
    _MADE.append((campaign.id, dm))
    made = []
    for i, cls in enumerate(classes):
        pc = char_svc.create_character(
            db,
            campaign_id=campaign.id,
            dm_email=dm,
            player_name=f"Player {i + 1}",
            character_name=f"Duellist {i + 1}",
            race="Human",
            character_class=cls,
            level=3,
            hp_max=30,
            hp_current=30,
            ac=15,
            speed=30,
            score_str=16,
            score_dex=20,
            score_con=14,
            score_int=10,
            score_wis=16,
            score_cha=16,
        )
        for payload in CLASS_FEATURES_2024:
            if payload.character_class == cls and payload.level_acquired <= 3:
                if (
                    ClassFeatureRepo.find_by_name_class(db, payload.name, payload.character_class)
                    is None
                ):
                    ClassFeatureRepo.create(db, payload)
        feature_service.sync_for_level(db, pc.id, dm)
        made.append(pc)
    return made


@pytest.fixture(autouse=True)
def _steady_dice(monkeypatch):
    """Fix the dice so a scripted fight lands the same way every run."""
    monkeypatch.setattr(arena, "_RNG", _Fixed(high=True))


class TestCallingOneOut:
    """Starting a duel that two phones can both see."""

    def test_it_seats_everyone_and_rolls_initiative(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        duel = duel_service.start(duckdb_session, nya.id, [nya.id, thane.id])

        assert duel.phase == "live"
        assert {s.pc_id for s in duel.seats} == {nya.id, thane.id}
        assert duel.up_pc_id in (nya.id, thane.id)
        # Every seat knows which real character sits in it — that is what makes
        # turn ownership checkable at all.
        assert all(slot.pc_id is not None for slot in duel.state.roster)
        assert any("Initiative" in line.text for line in duel.state.log)

    def test_one_character_is_not_a_duel(self, duckdb_session: Session):
        (nya,) = _table(duckdb_session, CharacterClass.SORCERER)
        with pytest.raises(ValueError, match="at least two"):
            duel_service.start(duckdb_session, nya.id, [nya.id])

    def test_you_cannot_set_up_a_fight_you_are_not_in(self, duckdb_session: Session):
        nya, thane, creed = _table(
            duckdb_session,
            CharacterClass.SORCERER,
            CharacterClass.ROGUE,
            CharacterClass.PALADIN,
        )
        with pytest.raises(PermissionError, match="your own duel"):
            duel_service.start(duckdb_session, creed.id, [nya.id, thane.id])

    def test_another_table_is_refused(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        (stranger,) = _table(duckdb_session, CharacterClass.FIGHTER)
        with pytest.raises(ValueError, match="same table"):
            duel_service.start(duckdb_session, nya.id, [nya.id, stranger.id])


class TestWhoMayAct:
    """The check that makes two devices safe."""

    def test_the_other_phone_cannot_act_out_of_turn(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        duel = duel_service.start(duckdb_session, nya.id, [nya.id, thane.id])
        waiting = next(s.pc_id for s in duel.seats if s.pc_id != duel.up_pc_id)

        with pytest.raises(PermissionError, match="turn"):
            duel_service.act(duckdb_session, duel.id, waiting, ArenaAction(kind="end_turn"))

    def test_a_stranger_cannot_read_or_act(self, duckdb_session: Session):
        nya, thane, creed = _table(
            duckdb_session,
            CharacterClass.SORCERER,
            CharacterClass.ROGUE,
            CharacterClass.PALADIN,
        )
        duel = duel_service.start(duckdb_session, nya.id, [nya.id, thane.id])

        with pytest.raises(PermissionError, match="not in that duel"):
            duel_service.read(duckdb_session, duel.id, creed.id)
        with pytest.raises(PermissionError, match="not in that duel"):
            duel_service.act(duckdb_session, duel.id, creed.id, ArenaAction(kind="end_turn"))

    def test_the_turn_passes_to_the_other_device(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        duel = duel_service.start(duckdb_session, nya.id, [nya.id, thane.id])
        first = duel.up_pc_id
        second = next(s.pc_id for s in duel.seats if s.pc_id != first)

        after = duel_service.act(duckdb_session, duel.id, first, ArenaAction(kind="end_turn"))
        assert after.up_pc_id == second
        assert after.your_turn is False, "the phone that just acted is now waiting"

        # And the other phone, asking on its own, sees the same fight.
        theirs = duel_service.read(duckdb_session, duel.id, second)
        assert theirs.your_turn is True
        assert theirs.state.round == after.state.round


class TestTheFightItself:
    """The rules engine is untouched — the row is only where the fight rests."""

    def test_a_swing_lands_and_both_phones_see_the_damage(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        duel = duel_service.start(duckdb_session, nya.id, [nya.id, thane.id])
        attacker = duel.up_pc_id
        defender = next(s.pc_id for s in duel.seats if s.pc_id != attacker)
        before = next(s.hp for s in duel.seats if s.pc_id == defender)

        swing = next(a for a in duel.state.pc.attacks if a.cost == "action" and a.damage != "0")
        duel_service.act(
            duckdb_session, duel.id, attacker, ArenaAction(kind="attack", key=swing.key)
        )

        theirs = duel_service.read(duckdb_session, duel.id, defender)
        after = next(s.hp for s in theirs.seats if s.pc_id == defender)
        assert after < before, "the defender's own phone shows the hit it took"

    def test_the_seal_survives_the_round_trip_through_the_database(self, duckdb_session: Session):
        """The state is JSON in a column between turns; the HMAC still verifies."""
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        duel = duel_service.start(duckdb_session, nya.id, [nya.id, thane.id])
        up = duel.up_pc_id
        for _ in range(3):
            reread = duel_service.read(duckdb_session, duel.id, up)
            if reread.state.phase == "over":
                break
            duel_service.act(duckdb_session, duel.id, up, ArenaAction(kind="end_turn"))
            up = duel_service.read(duckdb_session, duel.id, up).up_pc_id
        assert duel_service.read(duckdb_session, duel.id, nya.id).state.round >= 2


class TestWalkingOut:
    """Anyone can call it off, and it stops being a live challenge."""

    def test_ending_closes_it_for_everyone(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        duel = duel_service.start(duckdb_session, nya.id, [nya.id, thane.id])

        closed = duel_service.end(duckdb_session, duel.id, thane.id)
        assert closed.phase == "over" and closed.state.phase == "over"
        assert duel_service.read(duckdb_session, duel.id, nya.id).phase == "over"
        with pytest.raises(ValueError, match="finished"):
            duel_service.act(duckdb_session, duel.id, nya.id, ArenaAction(kind="end_turn"))

    def test_the_challenge_banner_lists_live_duels_only(self, duckdb_session: Session):
        nya, thane = _table(duckdb_session, CharacterClass.SORCERER, CharacterClass.ROGUE)
        assert duel_service.called_for(duckdb_session, thane.id) == []

        duel = duel_service.start(duckdb_session, nya.id, [nya.id, thane.id])
        called = duel_service.called_for(duckdb_session, thane.id)
        assert [c.id for c in called] == [duel.id]
        assert called[0].host_pc_id == nya.id and called[0].host_name

        duel_service.end(duckdb_session, duel.id, nya.id)
        assert duel_service.called_for(duckdb_session, thane.id) == []
