"""Tests for domain/spell.py — Pydantic boundary validation."""

import pytest
from pydantic import ValidationError

from domain.spell import SpellCreate, SpellUpdate


def _minimal_payload(**overrides) -> dict:
    """Build a minimal valid SpellCreate payload, with overrides applied."""
    base = {
        "name": "Fire Bolt",
        "level": 0,
        "school": "Evocation",
        "casting_time": "1 action",
        "range": "120 feet",
        "components_v": True,
        "components_s": True,
        "duration": "Instantaneous",
        "description": "Hurl a mote of fire.",
        "classes": ["Sorcerer", "Wizard"],
    }
    base.update(overrides)
    return base


class TestSpellCreate:
    """Pydantic validation for SpellCreate."""

    def test_minimal_payload_validates(self):
        """A minimal payload with required fields validates."""
        c = SpellCreate.model_validate(_minimal_payload())
        assert c.name == "Fire Bolt"
        assert c.level == 0
        assert c.is_ritual is False
        assert c.is_concentration is False
        assert c.source == "SRD 5.5e (2024)"

    def test_empty_name_rejected(self):
        """An empty name fails validation."""
        with pytest.raises(ValidationError):
            SpellCreate.model_validate(_minimal_payload(name=""))

    def test_negative_level_rejected(self):
        """Negative spell levels are rejected."""
        with pytest.raises(ValidationError):
            SpellCreate.model_validate(_minimal_payload(level=-1))

    def test_level_above_9_rejected(self):
        """Levels above 9 are rejected (max spell level in 5e is 9)."""
        with pytest.raises(ValidationError):
            SpellCreate.model_validate(_minimal_payload(level=10))

    def test_cantrip_level_0_allowed(self):
        """Level 0 (cantrip) is allowed."""
        c = SpellCreate.model_validate(_minimal_payload(level=0))
        assert c.level == 0

    def test_level_9_allowed(self):
        """Level 9 (highest 5e spell level) is allowed."""
        c = SpellCreate.model_validate(_minimal_payload(level=9))
        assert c.level == 9

    def test_classes_default_empty(self):
        """When classes is omitted it defaults to an empty list."""
        payload = _minimal_payload()
        payload.pop("classes")
        c = SpellCreate.model_validate(payload)
        assert c.classes == []

    def test_optional_mechanical_hints_round_trip(self):
        """Mechanical hint fields survive a round-trip."""
        c = SpellCreate.model_validate(
            _minimal_payload(
                damage_dice="1d10",
                damage_type="fire",
                attack_type="ranged",
            )
        )
        assert c.damage_dice == "1d10"
        assert c.damage_type == "fire"
        assert c.attack_type == "ranged"

    def test_save_ability_round_trip(self):
        """Save-DC spells store the ability targeted."""
        c = SpellCreate.model_validate(
            _minimal_payload(
                save_ability="DEX",
                damage_dice="8d6",
                damage_type="fire",
            )
        )
        assert c.save_ability == "DEX"


class TestSpellUpdate:
    """Pydantic validation for SpellUpdate (partial)."""

    def test_all_fields_optional(self):
        """An empty update payload is valid (no-op patch)."""
        u = SpellUpdate.model_validate({})
        assert u.model_dump(exclude_unset=True) == {}

    def test_invalid_level_rejected(self):
        """Bad level on partial update is still rejected."""
        with pytest.raises(ValidationError):
            SpellUpdate.model_validate({"level": 10})

    def test_partial_patch_round_trip(self):
        """A partial patch only sets the supplied fields."""
        u = SpellUpdate.model_validate({"description": "Updated text."})
        assert u.description == "Updated text."
        assert u.name is None
