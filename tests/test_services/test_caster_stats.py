"""Tests for caster-stats, hit-dice, exhaustion, currency helpers (Plan 00024)."""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.rest_service as rest_svc
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
    score_int: int = 16,
    score_wis: int = 10,
    score_cha: int = 10,
    score_con: int = 14,
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
        score_dex=10,
        score_con=score_con,
        score_int=score_int,
        score_wis=score_wis,
        score_cha=score_cha,
        hp_max=30,
        hp_current=30,
        ac=14,
        speed=30,
    )


class TestSpellcastingStats:
    """Spell save DC and attack bonus per 2024 RAW."""

    def test_wizard_int_caster(self, duckdb_session: Session):
        """Wizard L5, INT 16 → DC 14, attack +6."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, char_class=CharacterClass.WIZARD, level=5, score_int=16)
        stats = char_svc.spellcasting_stats(pc)
        assert stats["ability"] == "INT"
        # PB(5)=3 + INT mod(16)=3 → DC 8+3+3=14, attack 3+3=6
        assert stats["save_dc"] == 14
        assert stats["attack_bonus"] == 6

    def test_cleric_wis_caster(self, duckdb_session: Session):
        """Cleric L1, WIS 14 → DC 12, attack +4."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(
            duckdb_session,
            c.id,
            dm,
            char_class=CharacterClass.CLERIC,
            level=1,
            score_wis=14,
        )
        stats = char_svc.spellcasting_stats(pc)
        assert stats["ability"] == "WIS"
        # PB(1)=2 + WIS mod(14)=2 → DC 8+2+2=12, attack 2+2=4
        assert stats["save_dc"] == 12
        assert stats["attack_bonus"] == 4

    def test_bard_cha_caster(self, duckdb_session: Session):
        """Bard L10, CHA 18 → DC 16, attack +8."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(
            duckdb_session,
            c.id,
            dm,
            char_class=CharacterClass.BARD,
            level=10,
            score_cha=18,
        )
        stats = char_svc.spellcasting_stats(pc)
        assert stats["ability"] == "CHA"
        # PB(10)=4 + CHA mod(18)=4 → DC 8+4+4=16, attack 4+4=8
        assert stats["save_dc"] == 16
        assert stats["attack_bonus"] == 8

    def test_non_caster_returns_nulls(self, duckdb_session: Session):
        """Fighter has no spellcasting stats."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, char_class=CharacterClass.FIGHTER, level=5)
        stats = char_svc.spellcasting_stats(pc)
        assert stats == {"ability": None, "save_dc": None, "attack_bonus": None}


class TestHitDie:
    """Hit-die size lookup per class."""

    @pytest.mark.parametrize(
        ("char_class", "expected"),
        [
            (CharacterClass.SORCERER, 6),
            (CharacterClass.WIZARD, 6),
            (CharacterClass.BARD, 8),
            (CharacterClass.CLERIC, 8),
            (CharacterClass.ROGUE, 8),
            (CharacterClass.FIGHTER, 10),
            (CharacterClass.PALADIN, 10),
            (CharacterClass.RANGER, 10),
            (CharacterClass.BARBARIAN, 12),
        ],
    )
    def test_die_size(self, char_class: CharacterClass, expected: int):
        """Each class returns its canonical die size."""
        assert char_svc.hit_die_for(char_class) == expected


class TestSpendHitDice:
    """Spending hit dice on short rest."""

    def test_spend_one(self, duckdb_session: Session):
        """L5 PC, spend 1 → spent=1, level still 5."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, level=5)
        result = char_svc.spend_hit_dice(duckdb_session, pc.id, 1, dm)
        assert result.hit_dice_spent == 1

    def test_spend_more_than_available_raises(self, duckdb_session: Session):
        """Spending past available HD is rejected."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, level=3)
        with pytest.raises(ValueError):
            char_svc.spend_hit_dice(duckdb_session, pc.id, 4, dm)

    def test_zero_or_negative_raises(self, duckdb_session: Session):
        """count must be positive."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        with pytest.raises(ValueError):
            char_svc.spend_hit_dice(duckdb_session, pc.id, 0, dm)
        with pytest.raises(ValueError):
            char_svc.spend_hit_dice(duckdb_session, pc.id, -1, dm)

    def test_non_owner_denied(self, duckdb_session: Session):
        """Another DM cannot spend HD on a PC."""
        dm1, dm2 = _dm(), _dm()
        c = _campaign(duckdb_session, dm1)
        pc = _pc(duckdb_session, c.id, dm1)
        with pytest.raises(PermissionError):
            char_svc.spend_hit_dice(duckdb_session, pc.id, 1, dm2)


class TestLongRestRecovery:
    """Long rest restores HD (half level, min 1) and drops exhaustion."""

    def _setup(self, db, hp_current=30, hd_spent=0, exhaustion=0, level=8):
        dm = _dm()
        c = _campaign(db, dm)
        pc = _pc(db, c.id, dm, level=level)
        # Patch the persistent fields directly through the row.
        from db.repos.character_repo import CharacterRepo

        row = CharacterRepo.get_by_id(db, pc.id)
        row.hp_current = hp_current
        row.hit_dice_spent = hd_spent
        row.exhaustion = exhaustion
        db.add(row)
        db.commit()
        db.refresh(row)
        return dm, c, row

    def test_hd_half_recovery(self, duckdb_session: Session):
        """L8, spent 5 HD → long rest recovers 4 (8//2)."""
        dm, _c, pc = self._setup(duckdb_session, hd_spent=5, level=8)
        rest_svc.long_rest_pc(duckdb_session, pc.id, dm)
        from db.repos.character_repo import CharacterRepo

        refreshed = CharacterRepo.get_by_id(duckdb_session, pc.id)
        assert refreshed.hit_dice_spent == 1  # 5 - 4

    def test_hd_min_one_at_level_one(self, duckdb_session: Session):
        """L1, spent 1 HD → recovers at least 1."""
        dm, _c, pc = self._setup(duckdb_session, hd_spent=1, level=1)
        rest_svc.long_rest_pc(duckdb_session, pc.id, dm)
        from db.repos.character_repo import CharacterRepo

        refreshed = CharacterRepo.get_by_id(duckdb_session, pc.id)
        assert refreshed.hit_dice_spent == 0

    def test_hd_capped_by_spent(self, duckdb_session: Session):
        """L8, spent 2 → recovers 2 (not 4), spent goes to 0."""
        dm, _c, pc = self._setup(duckdb_session, hd_spent=2, level=8)
        rest_svc.long_rest_pc(duckdb_session, pc.id, dm)
        from db.repos.character_repo import CharacterRepo

        refreshed = CharacterRepo.get_by_id(duckdb_session, pc.id)
        assert refreshed.hit_dice_spent == 0

    def test_exhaustion_drops_by_one(self, duckdb_session: Session):
        """Exhaustion 3 → 2 after long rest."""
        dm, _c, pc = self._setup(duckdb_session, exhaustion=3)
        rest_svc.long_rest_pc(duckdb_session, pc.id, dm)
        from db.repos.character_repo import CharacterRepo

        refreshed = CharacterRepo.get_by_id(duckdb_session, pc.id)
        assert refreshed.exhaustion == 2

    def test_exhaustion_floor_zero(self, duckdb_session: Session):
        """Exhaustion 0 stays 0 (no underflow)."""
        dm, _c, pc = self._setup(duckdb_session, exhaustion=0)
        rest_svc.long_rest_pc(duckdb_session, pc.id, dm)
        from db.repos.character_repo import CharacterRepo

        refreshed = CharacterRepo.get_by_id(duckdb_session, pc.id)
        assert refreshed.exhaustion == 0


class TestPersistedDefaults:
    """The seven new columns default to zero."""

    def test_defaults(self, duckdb_session: Session):
        """Fresh PC has zero across the board."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        assert pc.hit_dice_spent == 0
        assert pc.exhaustion == 0
        assert pc.cp == 0
        assert pc.sp == 0
        assert pc.ep == 0
        assert pc.gp == 0
        assert pc.pp == 0
