"""Tests for domain/character.py — PlayerCharacter validation and computed fields."""

import pytest

from domain.character import PlayerCharacterCreate, PlayerCharacterRead, proficiency_bonus
from domain.enums import AbilityScore, CharacterClass


class TestProficiencyBonus:
    """Tests for the proficiency_bonus helper function."""

    def test_levels_1_to_4(self):
        """Levels 1-4 give proficiency bonus +2."""
        for level in range(1, 5):
            assert proficiency_bonus(level) == 2

    def test_levels_5_to_8(self):
        """Levels 5-8 give proficiency bonus +3."""
        for level in range(5, 9):
            assert proficiency_bonus(level) == 3

    def test_levels_9_to_12(self):
        """Levels 9-12 give proficiency bonus +4."""
        for level in range(9, 13):
            assert proficiency_bonus(level) == 4

    def test_level_17(self):
        """Level 17 gives proficiency bonus +6."""
        assert proficiency_bonus(17) == 6

    def test_level_20(self):
        """Level 20 gives proficiency bonus +6."""
        assert proficiency_bonus(20) == 6


class TestPlayerCharacterCreate:
    """Tests for PlayerCharacterCreate input validation."""

    def _valid_pc(self, **overrides):
        """Return a valid PC create dict with optional overrides."""
        base = dict(
            campaign_id="00000000-0000-0000-0000-000000000001",
            player_name="Alice",
            character_name="Elara Moonshadow",
            race="Elf",
            character_class=CharacterClass.WIZARD,
            level=5,
            score_str=10,
            score_dex=14,
            score_con=12,
            score_int=18,
            score_wis=13,
            score_cha=11,
            hp_max=28,
            hp_current=28,
            ac=13,
            speed=30,
        )
        base.update(overrides)
        return base

    def test_valid_wizard(self):
        """Valid level 5 wizard creates without error."""
        pc = PlayerCharacterCreate(**self._valid_pc())
        assert pc.character_class == CharacterClass.WIZARD
        assert pc.level == 5

    def test_hp_current_exceeds_hp_max_raises(self):
        """hp_current > hp_max raises a validation error."""
        with pytest.raises(Exception, match="hp_current"):
            PlayerCharacterCreate(**self._valid_pc(hp_max=20, hp_current=21))

    def test_hp_current_equals_hp_max_ok(self):
        """hp_current == hp_max is valid."""
        pc = PlayerCharacterCreate(**self._valid_pc(hp_max=20, hp_current=20))
        assert pc.hp_current == 20

    def test_hp_current_zero_ok(self):
        """hp_current of 0 (unconscious) is valid."""
        pc = PlayerCharacterCreate(**self._valid_pc(hp_current=0))
        assert pc.hp_current == 0

    def test_level_out_of_range_raises(self):
        """Level 21 raises a validation error."""
        with pytest.raises(Exception):
            PlayerCharacterCreate(**self._valid_pc(level=21))

    def test_saving_throw_proficiencies_default_empty(self):
        """saving_throw_proficiencies defaults to empty list."""
        pc = PlayerCharacterCreate(**self._valid_pc())
        assert pc.saving_throw_proficiencies == []

    def test_saving_throw_proficiencies_accepted(self):
        """Valid AbilityScore list is accepted."""
        pc = PlayerCharacterCreate(
            **self._valid_pc(saving_throw_proficiencies=[AbilityScore.INT, AbilityScore.WIS])
        )
        assert AbilityScore.INT in pc.saving_throw_proficiencies


class TestPlayerCharacterReadComputedBonus:
    """Tests for PlayerCharacterRead.computed_proficiency_bonus property."""

    def test_level_5_wizard_bonus(self):
        """Level 5 wizard has computed proficiency bonus +3."""
        import uuid
        from datetime import UTC, datetime

        read = PlayerCharacterRead(
            id=uuid.uuid4(),
            campaign_id=uuid.uuid4(),
            player_name="Alice",
            character_name="Elara",
            race="Elf",
            character_class=CharacterClass.WIZARD,
            level=5,
            score_str=10,
            score_dex=14,
            score_con=12,
            score_int=18,
            score_wis=13,
            score_cha=11,
            hp_max=28,
            hp_current=28,
            ac=13,
            speed=30,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        assert read.computed_proficiency_bonus == 3
