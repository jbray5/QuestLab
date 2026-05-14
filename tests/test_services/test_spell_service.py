"""Tests for services/spell_service.py — list/get/seed behavior."""

import uuid

import pytest
from sqlmodel import Session, delete

import services.spell_service as spell_svc
from db.repos.spell_repo import SpellRepo
from domain.spell import Spell, SpellCreate, SpellUpdate


@pytest.fixture(autouse=True)
def _clean_spells(duckdb_session: Session):
    """Wipe the spells table before each service test for isolation.

    The shared engine fixture commits across tests; assertions on exact lists
    require a fresh table each time.
    """
    duckdb_session.exec(delete(Spell))
    duckdb_session.commit()
    yield


def _make(name: str, level: int = 1, school: str = "Evocation", **extras) -> SpellCreate:
    """Build a SpellCreate with sane defaults."""
    payload = {
        "name": name,
        "level": level,
        "school": school,
        "casting_time": "1 action",
        "range": "60 feet",
        "components_v": True,
        "components_s": True,
        "duration": "Instantaneous",
        "description": f"{name} description.",
        "classes": ["Wizard"],
    }
    payload.update(extras)
    return SpellCreate.model_validate(payload)


class TestListSpells:
    """Tests for spell_service.list_spells."""

    def test_returns_spell_reads(self, duckdb_session: Session):
        """Service returns SpellRead Pydantic objects, not ORM rows."""
        SpellRepo.create(duckdb_session, _make("Magic Missile"))
        results = spell_svc.list_spells(duckdb_session)
        assert len(results) == 1
        assert results[0].name == "Magic Missile"
        # SpellRead is a BaseModel, not the SQLModel Spell
        assert results[0].__class__.__name__ == "SpellRead"

    def test_filter_passthrough(self, duckdb_session: Session):
        """Service filters delegate to the repo correctly."""
        SpellRepo.create(duckdb_session, _make("Fire Bolt", level=0))
        SpellRepo.create(duckdb_session, _make("Magic Missile", level=1))
        cantrips = spell_svc.list_spells(duckdb_session, level=0)
        assert [s.name for s in cantrips] == ["Fire Bolt"]


class TestGetSpell:
    """Tests for spell_service.get_spell."""

    def test_found(self, duckdb_session: Session):
        """Returns the Spell when it exists."""
        spell = SpellRepo.create(duckdb_session, _make("Shield"))
        fetched = spell_svc.get_spell(duckdb_session, spell.id)
        assert fetched.name == "Shield"

    def test_unknown_raises(self, duckdb_session: Session):
        """Unknown id raises ValueError."""
        with pytest.raises(ValueError):
            spell_svc.get_spell(duckdb_session, uuid.uuid4())


class TestListForClass:
    """Tests for spell_service.list_for_class."""

    def test_scopes_by_class(self, duckdb_session: Session):
        """Only spells in the given class's list are returned."""
        SpellRepo.bulk_create(
            duckdb_session,
            [
                _make("Magic Missile", level=1, classes=["Wizard", "Sorcerer"]),
                _make("Cure Wounds", level=1, classes=["Cleric", "Bard"]),
                _make("Fireball", level=3, classes=["Wizard", "Sorcerer"]),
            ],
        )
        wizard = spell_svc.list_for_class(duckdb_session, "Wizard")
        assert {s.name for s in wizard} == {"Magic Missile", "Fireball"}

    def test_max_level_cap(self, duckdb_session: Session):
        """max_level filters out spells above the cap."""
        SpellRepo.bulk_create(
            duckdb_session,
            [
                _make("Magic Missile", level=1, classes=["Wizard"]),
                _make("Fireball", level=3, classes=["Wizard"]),
                _make("Meteor Swarm", level=9, classes=["Wizard"]),
            ],
        )
        low = spell_svc.list_for_class(duckdb_session, "Wizard", max_level=3)
        assert {s.name for s in low} == {"Magic Missile", "Fireball"}


class TestUpdateSpell:
    """Tests for spell_service.update_spell."""

    def test_partial_update(self, duckdb_session: Session):
        """Partial update changes only provided fields."""
        spell = SpellRepo.create(duckdb_session, _make("Cure Wounds", school="Abjuration"))
        updated = spell_svc.update_spell(duckdb_session, spell.id, SpellUpdate(school="Evocation"))
        assert updated.school == "Evocation"
        assert updated.name == "Cure Wounds"

    def test_unknown_raises(self, duckdb_session: Session):
        """Updating an unknown spell raises ValueError."""
        with pytest.raises(ValueError):
            spell_svc.update_spell(duckdb_session, uuid.uuid4(), SpellUpdate(name="Whatever"))


class TestDeleteSpell:
    """Tests for spell_service.delete_spell."""

    def test_delete(self, duckdb_session: Session):
        """Delete removes the row."""
        spell = SpellRepo.create(duckdb_session, _make("Burning Hands"))
        spell_svc.delete_spell(duckdb_session, spell.id)
        assert SpellRepo.get_by_id(duckdb_session, spell.id) is None

    def test_unknown_raises(self, duckdb_session: Session):
        """Deleting an unknown spell raises ValueError."""
        with pytest.raises(ValueError):
            spell_svc.delete_spell(duckdb_session, uuid.uuid4())


class TestSeedSpells:
    """Tests for spell_service.seed_spells (idempotence)."""

    def test_seeds_when_empty(self, duckdb_session: Session):
        """Seed populates an empty catalog."""
        payloads = [_make("Acid Splash", level=0), _make("Magic Missile", level=1)]
        inserted = spell_svc.seed_spells(duckdb_session, payloads)
        assert inserted == 2
        assert SpellRepo.count(duckdb_session) >= 2

    def test_seed_is_idempotent(self, duckdb_session: Session):
        """Seeding a populated catalog is a no-op."""
        SpellRepo.create(duckdb_session, _make("Existing"))
        inserted = spell_svc.seed_spells(duckdb_session, [_make("Should Not Insert")])
        assert inserted == 0
        # Original "Existing" still there, "Should Not Insert" never was
        names = {s.name for s in SpellRepo.list_all(duckdb_session)}
        assert "Existing" in names
        assert "Should Not Insert" not in names
