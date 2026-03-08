"""Tests for domain/encounter.py — Encounter validation."""

import uuid

import pytest

from domain.encounter import EncounterCreate
from domain.enums import EncounterDifficulty


class TestEncounterCreate:
    """Tests for EncounterCreate input validation."""

    def _valid_encounter(self, **overrides):
        """Return a valid encounter create dict."""
        base = dict(
            adventure_id=uuid.uuid4(),
            name="Goblin Ambush",
            difficulty=EncounterDifficulty.MODERATE,
            xp_budget=450,
        )
        base.update(overrides)
        return base

    def test_valid_encounter(self):
        """Valid encounter creates without error."""
        e = EncounterCreate(**self._valid_encounter())
        assert e.name == "Goblin Ambush"
        assert e.monster_roster == []

    def test_roster_validated_missing_monster_id(self):
        """Roster entry without monster_id raises validation error."""
        bad_roster = [{"count": 2}]
        with pytest.raises(Exception, match="monster_id"):
            EncounterCreate(**self._valid_encounter(monster_roster=bad_roster))

    def test_roster_validated_zero_count(self):
        """Roster entry with count=0 raises validation error."""
        bad_roster = [{"monster_id": str(uuid.uuid4()), "count": 0}]
        with pytest.raises(Exception, match="count >= 1"):
            EncounterCreate(**self._valid_encounter(monster_roster=bad_roster))

    def test_roster_valid(self):
        """Valid roster entries are accepted."""
        roster = [{"monster_id": str(uuid.uuid4()), "count": 3}]
        e = EncounterCreate(**self._valid_encounter(monster_roster=roster))
        assert len(e.monster_roster) == 1

    def test_default_difficulty(self):
        """Default difficulty is MODERATE."""
        e = EncounterCreate(adventure_id=uuid.uuid4(), name="Test", xp_budget=0)
        assert e.difficulty == EncounterDifficulty.MODERATE

    def test_xp_budget_non_negative(self):
        """Negative XP budget raises validation error."""
        with pytest.raises(Exception):
            EncounterCreate(**self._valid_encounter(xp_budget=-1))
