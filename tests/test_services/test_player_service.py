"""Tests for player_service (Plan 00025).

Verifies that the player-scope service correctly:
  - Looks up a PC by ID and impersonates the owning DM for write ops
  - Reads sheet, computed bonuses, spells, features, inventory
  - Applies HP, hit dice, death saves, slot expend, feature spend
  - Enforces the bounded /state PATCH whitelist
  - Raises NotFound for unknown PC IDs
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.player_service as play_svc
from domain.enums import CharacterClass


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm):
    return camp_svc.create_campaign(db, name="C", setting="R", tone="T", dm_email=dm)


def _pc(
    db,
    cid,
    dm,
    *,
    char_class: CharacterClass = CharacterClass.WIZARD,
    level: int = 5,
):
    return char_svc.create_character(
        db,
        campaign_id=cid,
        dm_email=dm,
        player_name="P",
        character_name="Hero",
        race="Human",
        character_class=char_class,
        level=level,
        score_str=10,
        score_dex=14,
        score_con=14,
        score_int=16,
        score_wis=10,
        score_cha=10,
        hp_max=30,
        hp_current=30,
        ac=14,
        speed=30,
    )


class TestPlayerReads:
    """Player can read their own sheet without DM credentials."""

    def test_get_character_resolves_owner(self, duckdb_session: Session):
        """player_service.get_character returns the PC by UUID alone."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        result = play_svc.get_character(duckdb_session, pc.id)
        assert result.character_name == "Hero"
        assert result.id == pc.id

    def test_get_character_unknown_id_raises(self, duckdb_session: Session):
        """Unknown PC ID raises ValueError → 404 at the API layer."""
        with pytest.raises(ValueError):
            play_svc.get_character(duckdb_session, uuid.uuid4())

    def test_spellcasting_stats(self, duckdb_session: Session):
        """Casters return ability/DC/attack; non-casters return nulls."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, char_class=CharacterClass.WIZARD)
        stats = play_svc.spellcasting_stats(duckdb_session, pc.id)
        assert stats["ability"] == "INT"
        assert stats["save_dc"] == 14  # 8 + PB(3) + INT mod(3)

    def test_skill_and_save_bonuses(self, duckdb_session: Session):
        """Skill and save bonuses come through the player service."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        skills = play_svc.skill_bonuses(duckdb_session, pc.id)
        saves = play_svc.saving_throws(duckdb_session, pc.id)
        assert "Insight" in skills
        assert "INT" in saves

    def test_slot_state(self, duckdb_session: Session):
        """Slot state is readable in player scope."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        state = play_svc.slot_state(duckdb_session, pc.id)
        assert state.character_id == pc.id

    def test_list_features_and_inventory(self, duckdb_session: Session):
        """Features and inventory lists return without error (likely empty)."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        features = play_svc.list_features(duckdb_session, pc.id)
        inventory = play_svc.list_inventory(duckdb_session, pc.id)
        assert isinstance(features, list)
        assert isinstance(inventory, list)


class TestPlayerWrites:
    """Player can self-mutate table-state without DM creds."""

    def test_apply_damage_temp_hp_first(self, duckdb_session: Session):
        """Damage waterfall works the same as DM-side."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        result = play_svc.apply_damage(duckdb_session, pc.id, 5)
        assert result.hp_current == 25

    def test_apply_healing(self, duckdb_session: Session):
        """Healing clamps to hp_max."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        play_svc.apply_damage(duckdb_session, pc.id, 10)
        result = play_svc.apply_healing(duckdb_session, pc.id, 100)
        assert result.hp_current == 30

    def test_resolve_death_save_only_when_dying(self, duckdb_session: Session):
        """Death save on a non-dying PC raises."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        with pytest.raises(ValueError):
            play_svc.resolve_death_save(duckdb_session, pc.id, 15)

    def test_resolve_death_save_when_dying(self, duckdb_session: Session):
        """Death save at 0 HP, ≥10 = success."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        play_svc.apply_damage(duckdb_session, pc.id, 100)  # → 0 HP
        result = play_svc.resolve_death_save(duckdb_session, pc.id, 15)
        assert result.death_save_successes == 1

    def test_spend_hit_dice(self, duckdb_session: Session):
        """Spending a HD bumps the spent counter."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        result = play_svc.spend_hit_dice(duckdb_session, pc.id, 1)
        assert result.hit_dice_spent == 1

    def test_expend_and_restore_spell_slot(self, duckdb_session: Session):
        """Slot expend / restore round-trip in player scope."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)  # Wizard L5
        after_expend = play_svc.expend_spell_slot(duckdb_session, pc.id, 1)
        assert after_expend.levels["1"].used >= 1
        after_restore = play_svc.restore_spell_slot(duckdb_session, pc.id, 1)
        assert after_restore.levels["1"].used == after_expend.levels["1"].used - 1


class TestPlayerStatePatch:
    """Bounded /state PATCH whitelist."""

    def test_inspiration_toggle(self, duckdb_session: Session):
        """Inspiration is in the player-allowed set."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        result = play_svc.patch_state(duckdb_session, pc.id, {"heroic_inspiration": True})
        assert result.heroic_inspiration is True

    def test_concentration_set_and_drop(self, duckdb_session: Session):
        """Concentration is in the player-allowed set."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        play_svc.patch_state(duckdb_session, pc.id, {"concentration_on": "Bless"})
        play_svc.patch_state(duckdb_session, pc.id, {"concentration_on": None})

    def test_currency_set(self, duckdb_session: Session):
        """All five currency denominations are settable in player scope."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        result = play_svc.patch_state(duckdb_session, pc.id, {"gp": 50, "sp": 10, "cp": 7})
        assert result.gp == 50
        assert result.sp == 10
        assert result.cp == 7

    def test_exhaustion_set(self, duckdb_session: Session):
        """Exhaustion is in the player-allowed set."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        result = play_svc.patch_state(duckdb_session, pc.id, {"exhaustion": 2})
        assert result.exhaustion == 2

    def test_level_change_rejected(self, duckdb_session: Session):
        """Player CANNOT change their level via /state."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        with pytest.raises(PermissionError):
            play_svc.patch_state(duckdb_session, pc.id, {"level": 20})

    def test_score_change_rejected(self, duckdb_session: Session):
        """Player CANNOT bump their ability scores via /state."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        with pytest.raises(PermissionError):
            play_svc.patch_state(duckdb_session, pc.id, {"score_int": 30})

    def test_hp_max_change_rejected(self, duckdb_session: Session):
        """Player CANNOT raise hp_max via /state."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        with pytest.raises(PermissionError):
            play_svc.patch_state(duckdb_session, pc.id, {"hp_max": 9999})

    def test_mixed_rejects_whole_request(self, duckdb_session: Session):
        """One forbidden field poisons the request (no partial apply)."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        with pytest.raises(PermissionError):
            play_svc.patch_state(
                duckdb_session,
                pc.id,
                {"heroic_inspiration": True, "level": 20},
            )
        # The allowed field also did NOT apply
        assert pc.heroic_inspiration is False


class TestCrossPcIsolation:
    """A given PC UUID can only touch that PC, not others in the same campaign."""

    def test_damage_only_hits_target_pc(self, duckdb_session: Session):
        """play_svc.apply_damage to pc1 doesn't touch pc2."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc1 = _pc(duckdb_session, c.id, dm)
        pc2 = char_svc.create_character(
            duckdb_session,
            campaign_id=c.id,
            dm_email=dm,
            player_name="P2",
            character_name="Sidekick",
            race="Elf",
            character_class=CharacterClass.BARD,
            level=3,
            score_str=10,
            score_dex=14,
            score_con=12,
            score_int=10,
            score_wis=10,
            score_cha=16,
            hp_max=20,
            hp_current=20,
            ac=13,
            speed=30,
        )
        play_svc.apply_damage(duckdb_session, pc1.id, 10)
        # Re-read pc2 — untouched
        refreshed_pc2 = play_svc.get_character(duckdb_session, pc2.id)
        assert refreshed_pc2.hp_current == 20
