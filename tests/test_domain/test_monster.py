"""Tests for domain/monster.py — MonsterStatBlock validation."""

import pytest

from domain.enums import CreatureSize, CreatureType
from domain.monster import MonsterStatBlockCreate


class TestMonsterStatBlockCreate:
    """Tests for MonsterStatBlockCreate validation."""

    def _valid_monster(self, **overrides):
        """Return a valid monster stat block dict."""
        base = dict(
            name="Goblin",
            size=CreatureSize.SMALL,
            creature_type=CreatureType.HUMANOID,
            ac=15,
            hp_average=7,
            hp_formula="2d6",
            score_str=8,
            score_dex=14,
            score_con=10,
            score_int=10,
            score_wis=8,
            score_cha=8,
            challenge_rating="1/4",
            xp=50,
            proficiency_bonus=2,
        )
        base.update(overrides)
        return base

    def test_valid_goblin(self):
        """Valid goblin stat block creates without error."""
        m = MonsterStatBlockCreate(**self._valid_monster())
        assert m.name == "Goblin"
        assert m.challenge_rating == "1/4"
        assert m.xp == 50

    def test_fractional_cr_accepted(self):
        """CR fractions (1/8, 1/4, 1/2) are accepted."""
        for cr in ("1/8", "1/4", "1/2"):
            m = MonsterStatBlockCreate(**self._valid_monster(challenge_rating=cr))
            assert m.challenge_rating == cr

    def test_invalid_cr_raises(self):
        """Non-standard CR strings raise a validation error."""
        with pytest.raises(Exception, match="Invalid challenge rating"):
            MonsterStatBlockCreate(**self._valid_monster(challenge_rating="3.5"))

    def test_cr_30_accepted(self):
        """CR 30 (Tarrasque-level) is accepted."""
        m = MonsterStatBlockCreate(**self._valid_monster(challenge_rating="30", xp=155000))
        assert m.challenge_rating == "30"

    def test_default_source_is_srd(self):
        """Source defaults to 'SRD'."""
        m = MonsterStatBlockCreate(**self._valid_monster())
        assert m.source == "SRD"

    def test_custom_monster(self):
        """Custom monster (is_custom=True) is accepted with creator email."""
        m = MonsterStatBlockCreate(
            **self._valid_monster(is_custom=True, created_by_email="dm@example.com")
        )
        assert m.is_custom is True
        assert m.created_by_email == "dm@example.com"
