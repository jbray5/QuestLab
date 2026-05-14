"""Tests for db/repos/spell_repo.py — CRUD and filter behavior."""

import pytest
from sqlmodel import Session, delete

from db.repos.spell_repo import SpellRepo
from domain.spell import Spell, SpellCreate, SpellUpdate


@pytest.fixture(autouse=True)
def _clean_spells(duckdb_session: Session):
    """Wipe the spells table before each test for isolation.

    The shared engine fixture commits across tests; assertions on exact row
    lists require a fresh table each time.
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


class TestSpellRepoCrud:
    """Core CRUD operations."""

    def test_create_and_get(self, duckdb_session: Session):
        """A created spell can be fetched by id."""
        spell = SpellRepo.create(duckdb_session, _make("Magic Missile"))
        fetched = SpellRepo.get_by_id(duckdb_session, spell.id)
        assert fetched is not None
        assert fetched.name == "Magic Missile"

    def test_get_by_name_case_insensitive(self, duckdb_session: Session):
        """get_by_name matches case-insensitively."""
        SpellRepo.create(duckdb_session, _make("Fire Bolt", level=0))
        assert SpellRepo.get_by_name(duckdb_session, "fire bolt") is not None
        assert SpellRepo.get_by_name(duckdb_session, "FIRE BOLT") is not None

    def test_update_partial(self, duckdb_session: Session):
        """A partial update only changes the supplied fields."""
        spell = SpellRepo.create(duckdb_session, _make("Cure Wounds", school="Abjuration"))
        updated = SpellRepo.update(
            duckdb_session,
            spell,
            SpellUpdate(school="Evocation"),
        )
        assert updated.school == "Evocation"
        assert updated.name == "Cure Wounds"

    def test_delete(self, duckdb_session: Session):
        """Delete removes the row."""
        spell = SpellRepo.create(duckdb_session, _make("Shield"))
        SpellRepo.delete(duckdb_session, spell)
        assert SpellRepo.get_by_id(duckdb_session, spell.id) is None

    def test_bulk_create_returns_count(self, duckdb_session: Session):
        """bulk_create persists every row in one transaction."""
        before = SpellRepo.count(duckdb_session)
        inserted = SpellRepo.bulk_create(
            duckdb_session,
            [
                _make("Acid Splash", level=0),
                _make("Light", level=0),
                _make("Mage Hand", level=0),
            ],
        )
        assert inserted == 3
        assert SpellRepo.count(duckdb_session) == before + 3


class TestSpellRepoFilters:
    """Filter behavior of list_all."""

    def _seed(self, db: Session) -> None:
        """Insert a small variety pack for filter tests."""
        SpellRepo.bulk_create(
            db,
            [
                _make("Acid Splash", level=0, school="Conjuration", classes=["Wizard"]),
                _make("Cure Wounds", level=1, school="Abjuration", classes=["Cleric", "Bard"]),
                _make("Magic Missile", level=1, school="Evocation", classes=["Wizard", "Sorcerer"]),
                _make("Fireball", level=3, school="Evocation", classes=["Wizard", "Sorcerer"]),
                _make(
                    "Detect Magic",
                    level=1,
                    school="Divination",
                    classes=["Wizard", "Cleric", "Druid"],
                    is_ritual=True,
                ),
                _make(
                    "Bless",
                    level=1,
                    school="Enchantment",
                    classes=["Cleric", "Paladin"],
                    is_concentration=True,
                ),
            ],
        )

    def test_filter_by_level(self, duckdb_session: Session):
        """level filter returns only that level."""
        self._seed(duckdb_session)
        cantrips = SpellRepo.list_all(duckdb_session, level=0)
        assert len(cantrips) == 1
        assert cantrips[0].name == "Acid Splash"

    def test_filter_by_school(self, duckdb_session: Session):
        """school filter is case-insensitive."""
        self._seed(duckdb_session)
        evocations = SpellRepo.list_all(duckdb_session, school="evocation")
        assert {s.name for s in evocations} == {"Magic Missile", "Fireball"}

    def test_filter_by_class(self, duckdb_session: Session):
        """class_name filter scopes to spells the class can learn."""
        self._seed(duckdb_session)
        cleric_spells = SpellRepo.list_all(duckdb_session, class_name="Cleric")
        assert {s.name for s in cleric_spells} == {"Cure Wounds", "Detect Magic", "Bless"}

    def test_filter_combined(self, duckdb_session: Session):
        """Multiple filters AND together."""
        self._seed(duckdb_session)
        wizard_l1 = SpellRepo.list_all(duckdb_session, class_name="Wizard", level=1)
        assert {s.name for s in wizard_l1} == {"Magic Missile", "Detect Magic"}

    def test_filter_ritual(self, duckdb_session: Session):
        """is_ritual filter returns only rituals."""
        self._seed(duckdb_session)
        rituals = SpellRepo.list_all(duckdb_session, is_ritual=True)
        assert [s.name for s in rituals] == ["Detect Magic"]

    def test_filter_concentration(self, duckdb_session: Session):
        """is_concentration filter returns only concentration spells."""
        self._seed(duckdb_session)
        conc = SpellRepo.list_all(duckdb_session, is_concentration=True)
        assert [s.name for s in conc] == ["Bless"]

    def test_q_substring_search(self, duckdb_session: Session):
        """q does a case-insensitive name substring search."""
        self._seed(duckdb_session)
        results = SpellRepo.list_all(duckdb_session, q="magic")
        assert {s.name for s in results} == {"Magic Missile", "Detect Magic"}

    def test_results_ordered_by_level_then_name(self, duckdb_session: Session):
        """list_all returns spells ordered by level, then name."""
        self._seed(duckdb_session)
        all_spells = SpellRepo.list_all(duckdb_session)
        names_and_levels = [(s.level, s.name) for s in all_spells]
        # Cantrip first, then level-1 alphabetised, then level-3
        assert names_and_levels[0] == (0, "Acid Splash")
        assert names_and_levels[-1] == (3, "Fireball")
