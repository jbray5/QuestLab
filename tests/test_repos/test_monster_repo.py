"""Tests for db/repos/monster_repo.py — CRUD against in-memory DuckDB."""

import uuid

from sqlmodel import Session

from db.repos.monster_repo import MonsterRepo
from domain.enums import CreatureSize, CreatureType
from domain.monster import MonsterStatBlockCreate, MonsterStatBlockUpdate


def _make_monster(**overrides) -> MonsterStatBlockCreate:
    """Return a minimal valid MonsterStatBlockCreate."""
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
    return MonsterStatBlockCreate(**base)


class TestMonsterRepoCreate:
    """Tests for MonsterRepo.create."""

    def test_create_persists_monster(self, duckdb_session: Session):
        """Created monster is stored with all core fields."""
        monster = MonsterRepo.create(duckdb_session, _make_monster())
        assert monster.id is not None
        assert monster.name == "Goblin"
        assert monster.challenge_rating == "1/4"

    def test_create_custom_monster(self, duckdb_session: Session):
        """Custom monster stores is_custom and creator email."""
        data = _make_monster(name="Homebrew Beast", is_custom=True, created_by_email="dm@test.com")
        monster = MonsterRepo.create(duckdb_session, data)
        assert monster.is_custom is True
        assert monster.created_by_email == "dm@test.com"


class TestMonsterRepoGetById:
    """Tests for MonsterRepo.get_by_id."""

    def test_get_existing(self, duckdb_session: Session):
        """get_by_id returns the stored monster."""
        monster = MonsterRepo.create(duckdb_session, _make_monster())
        fetched = MonsterRepo.get_by_id(duckdb_session, monster.id)
        assert fetched is not None
        assert fetched.id == monster.id

    def test_get_missing_returns_none(self, duckdb_session: Session):
        """get_by_id returns None for an unknown UUID."""
        assert MonsterRepo.get_by_id(duckdb_session, uuid.uuid4()) is None


class TestMonsterRepoListAll:
    """Tests for MonsterRepo.list_all."""

    def test_list_returns_all(self, duckdb_session: Session):
        """list_all returns all stored monsters."""
        MonsterRepo.create(duckdb_session, _make_monster(name="A Monster"))
        MonsterRepo.create(duckdb_session, _make_monster(name="B Monster"))
        results = MonsterRepo.list_all(duckdb_session)
        names = [m.name for m in results]
        assert "A Monster" in names
        assert "B Monster" in names

    def test_count_increases_after_insert(self, duckdb_session: Session):
        """count increases by 1 after inserting a monster."""
        before = MonsterRepo.count(duckdb_session)
        MonsterRepo.create(duckdb_session, _make_monster(name="Counted Monster"))
        assert MonsterRepo.count(duckdb_session) == before + 1


class TestMonsterRepoUpdate:
    """Tests for MonsterRepo.update."""

    def test_update_xp(self, duckdb_session: Session):
        """Updating xp changes only the xp field."""
        monster = MonsterRepo.create(duckdb_session, _make_monster(xp=50))
        updated = MonsterRepo.update(duckdb_session, monster, MonsterStatBlockUpdate(xp=100))
        assert updated.xp == 100
        assert updated.name == "Goblin"


class TestMonsterRepoDelete:
    """Tests for MonsterRepo.delete."""

    def test_delete_removes_record(self, duckdb_session: Session):
        """Deleted monster is no longer retrievable."""
        monster = MonsterRepo.create(duckdb_session, _make_monster())
        monster_id = monster.id
        MonsterRepo.delete(duckdb_session, monster)
        assert MonsterRepo.get_by_id(duckdb_session, monster_id) is None
