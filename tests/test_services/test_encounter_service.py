"""Tests for services/encounter_service.py — business logic and authorization."""

import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.encounter_service as enc_svc
from db.repos.monster_repo import MonsterRepo
from domain.encounter import EncounterUpdate
from domain.enums import AdventureTier, EncounterDifficulty
from domain.monster import MonsterStatBlockCreate

# ---------------------------------------------------------------------------
# Helper factories
# ---------------------------------------------------------------------------


def _unique_dm() -> str:
    """Return a unique DM email to avoid per-DM limits in the shared in-memory DB."""
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _make_campaign(session: Session, dm_email: str | None = None):
    """Create a campaign owned by dm_email (defaults to unique DM)."""
    owner = dm_email or _unique_dm()
    return camp_svc.create_campaign(
        session, name="Test Campaign", setting="Forgotten Realms", tone="Epic", dm_email=owner
    )


def _make_adventure(session: Session, campaign_id: uuid.UUID, dm_email: str):
    """Create an adventure in the given campaign."""
    return adv_svc.create_adventure(
        session,
        campaign_id=campaign_id,
        title="Test Adventure",
        tier=AdventureTier.TIER2,
        dm_email=dm_email,
    )


def _make_monster(session: Session, name: str = "Test Goblin", cr: str = "1/4") -> uuid.UUID:
    """Insert a minimal monster stat block and return its ID."""
    xp_map = {"1/4": 50, "1": 200, "5": 1800, "17": 18000}
    payload = MonsterStatBlockCreate(
        name=name,
        size="Small",
        creature_type="Humanoid",
        ac=15,
        hp_average=7,
        hp_formula="2d6",
        score_str=8,
        score_dex=14,
        score_con=10,
        score_int=10,
        score_wis=8,
        score_cha=8,
        challenge_rating=cr,
        xp=xp_map.get(cr, 50),
        proficiency_bonus=2,
        speed={"walk": 30},
    )
    m = MonsterRepo.create(session, payload)
    return m.id


# ---------------------------------------------------------------------------
# list_encounters
# ---------------------------------------------------------------------------


class TestListEncounters:
    """Tests for encounter_service.list_encounters."""

    def test_returns_empty_list_for_new_adventure(self, duckdb_session: Session):
        """Fresh adventure has no encounters."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        result = enc_svc.list_encounters(duckdb_session, adv.id, dm)
        assert result == []

    def test_non_owner_cannot_list(self, duckdb_session: Session):
        """DM who doesn't own the campaign cannot list encounters."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        with pytest.raises(PermissionError):
            enc_svc.list_encounters(duckdb_session, adv.id, dm2)

    def test_missing_adventure_raises(self, duckdb_session: Session):
        """Non-existent adventure UUID raises ValueError."""
        dm = _unique_dm()
        with pytest.raises(ValueError):
            enc_svc.list_encounters(duckdb_session, uuid.uuid4(), dm)


# ---------------------------------------------------------------------------
# create_encounter
# ---------------------------------------------------------------------------


class TestCreateEncounter:
    """Tests for encounter_service.create_encounter."""

    def test_create_minimal_encounter(self, duckdb_session: Session):
        """Create encounter with only required fields."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)

        enc = enc_svc.create_encounter(
            duckdb_session, adventure_id=adv.id, name="Goblin Ambush", dm_email=dm
        )
        assert enc.name == "Goblin Ambush"
        assert enc.adventure_id == adv.id
        assert enc.xp_budget == 0

    def test_create_with_monster_roster_and_pc_levels(self, duckdb_session: Session):
        """Encounter with roster + PC levels auto-calculates XP budget and difficulty."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        mid = _make_monster(duckdb_session, name=f"goblin_{uuid.uuid4().hex[:4]}", cr="1/4")

        enc = enc_svc.create_encounter(
            duckdb_session,
            adventure_id=adv.id,
            name="Goblin Scout",
            dm_email=dm,
            monster_roster=[{"monster_id": str(mid), "count": 4}],
            pc_levels=[5, 5, 5, 5],
        )
        # 4 goblins × 50 XP = 200 raw; multiplier 2.0 → 400 adjusted
        assert enc.xp_budget == 400
        # 4×L5 thresholds: easy=1000, med=2000 → 400 < 1000 → LOW
        assert enc.difficulty == EncounterDifficulty.LOW

    def test_adult_red_dragon_vs_l5_party_is_deadly(self, duckdb_session: Session):
        """Adult Red Dragon (18000 XP) vs 4 L5 PCs → DEADLY."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        mid = _make_monster(duckdb_session, name=f"red_dragon_{uuid.uuid4().hex[:4]}", cr="17")

        enc = enc_svc.create_encounter(
            duckdb_session,
            adventure_id=adv.id,
            name="Dragon Lair",
            dm_email=dm,
            monster_roster=[{"monster_id": str(mid), "count": 1}],
            pc_levels=[5, 5, 5, 5],
        )
        # Deadly threshold for 4×L5 = 4400 XP; dragon = 18000 → DEADLY
        assert enc.difficulty == EncounterDifficulty.DEADLY
        assert enc.xp_budget == 18000

    def test_empty_name_raises(self, duckdb_session: Session):
        """Empty encounter name raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        with pytest.raises(ValueError, match="name"):
            enc_svc.create_encounter(duckdb_session, adventure_id=adv.id, name="   ", dm_email=dm)

    def test_non_owner_cannot_create(self, duckdb_session: Session):
        """DM who doesn't own the campaign cannot create encounters."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        with pytest.raises(PermissionError):
            enc_svc.create_encounter(
                duckdb_session, adventure_id=adv.id, name="Ambush", dm_email=dm2
            )

    def test_creates_multiple_encounters(self, duckdb_session: Session):
        """Multiple encounters can be created in one adventure."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        for i in range(3):
            enc_svc.create_encounter(
                duckdb_session, adventure_id=adv.id, name=f"Encounter {i}", dm_email=dm
            )
        encounters = enc_svc.list_encounters(duckdb_session, adv.id, dm)
        assert len(encounters) == 3

    def test_encounter_limit_enforced(self, duckdb_session: Session):
        """Creating more than MAX_ENCOUNTERS_PER_ADVENTURE raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        limit = enc_svc.MAX_ENCOUNTERS_PER_ADVENTURE
        for i in range(limit):
            enc_svc.create_encounter(
                duckdb_session, adventure_id=adv.id, name=f"Enc {i}", dm_email=dm
            )
        with pytest.raises(ValueError, match="maximum"):
            enc_svc.create_encounter(
                duckdb_session, adventure_id=adv.id, name="One Too Many", dm_email=dm
            )


# ---------------------------------------------------------------------------
# get_encounter
# ---------------------------------------------------------------------------


class TestGetEncounter:
    """Tests for encounter_service.get_encounter."""

    def test_get_existing_encounter(self, duckdb_session: Session):
        """get_encounter returns the correct encounter."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        created = enc_svc.create_encounter(
            duckdb_session, adventure_id=adv.id, name="The Vault", dm_email=dm
        )
        fetched = enc_svc.get_encounter(duckdb_session, created.id, dm)
        assert fetched.id == created.id

    def test_get_missing_encounter_raises(self, duckdb_session: Session):
        """Non-existent UUID raises ValueError."""
        dm = _unique_dm()
        with pytest.raises(ValueError):
            enc_svc.get_encounter(duckdb_session, uuid.uuid4(), dm)

    def test_non_owner_cannot_get(self, duckdb_session: Session):
        """DM who doesn't own the campaign cannot fetch an encounter."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        enc = enc_svc.create_encounter(
            duckdb_session, adventure_id=adv.id, name="Ambush", dm_email=dm1
        )
        with pytest.raises(PermissionError):
            enc_svc.get_encounter(duckdb_session, enc.id, dm2)


# ---------------------------------------------------------------------------
# update_encounter
# ---------------------------------------------------------------------------


class TestUpdateEncounter:
    """Tests for encounter_service.update_encounter."""

    def test_update_name(self, duckdb_session: Session):
        """Updating name changes the stored value."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        enc = enc_svc.create_encounter(
            duckdb_session, adventure_id=adv.id, name="Old Name", dm_email=dm
        )
        updated = enc_svc.update_encounter(
            duckdb_session, enc.id, dm, EncounterUpdate(name="New Name")
        )
        assert updated.name == "New Name"

    def test_update_recalculates_xp_with_pc_levels(self, duckdb_session: Session):
        """Updating roster + pc_levels recalculates xp_budget."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        mid = _make_monster(duckdb_session, name=f"upd_goblin_{uuid.uuid4().hex[:4]}", cr="1/4")
        enc = enc_svc.create_encounter(
            duckdb_session, adventure_id=adv.id, name="Ambush", dm_email=dm
        )
        assert enc.xp_budget == 0  # no roster initially

        updated = enc_svc.update_encounter(
            duckdb_session,
            enc.id,
            dm,
            EncounterUpdate(monster_roster=[{"monster_id": str(mid), "count": 1}]),
            pc_levels=[5, 5, 5, 5],
        )
        # 1 goblin × 50 XP, multiplier 1.0 → 50 adjusted
        assert updated.xp_budget == 50

    def test_non_owner_cannot_update(self, duckdb_session: Session):
        """DM who doesn't own the campaign cannot update an encounter."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        enc = enc_svc.create_encounter(
            duckdb_session, adventure_id=adv.id, name="Ambush", dm_email=dm1
        )
        with pytest.raises(PermissionError):
            enc_svc.update_encounter(duckdb_session, enc.id, dm2, EncounterUpdate(name="Hijack"))


# ---------------------------------------------------------------------------
# delete_encounter
# ---------------------------------------------------------------------------


class TestDeleteEncounter:
    """Tests for encounter_service.delete_encounter."""

    def test_delete_removes_encounter(self, duckdb_session: Session):
        """Deleted encounter no longer appears in list."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        adv = _make_adventure(duckdb_session, c.id, dm)
        enc = enc_svc.create_encounter(
            duckdb_session, adventure_id=adv.id, name="To Delete", dm_email=dm
        )
        result = enc_svc.delete_encounter(duckdb_session, enc.id, dm)
        assert result is True
        encounters = enc_svc.list_encounters(duckdb_session, adv.id, dm)
        assert all(e.id != enc.id for e in encounters)

    def test_non_owner_cannot_delete(self, duckdb_session: Session):
        """DM who doesn't own the campaign cannot delete an encounter."""
        dm1 = _unique_dm()
        dm2 = _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        adv = _make_adventure(duckdb_session, c.id, dm1)
        enc = enc_svc.create_encounter(
            duckdb_session, adventure_id=adv.id, name="Ambush", dm_email=dm1
        )
        with pytest.raises(PermissionError):
            enc_svc.delete_encounter(duckdb_session, enc.id, dm2)

    def test_delete_missing_raises(self, duckdb_session: Session):
        """Deleting non-existent UUID raises ValueError."""
        dm = _unique_dm()
        with pytest.raises(ValueError):
            enc_svc.delete_encounter(duckdb_session, uuid.uuid4(), dm)


# ---------------------------------------------------------------------------
# list_monsters
# ---------------------------------------------------------------------------


class TestListMonsters:
    """Tests for encounter_service.list_monsters."""

    def test_list_all(self, duckdb_session: Session):
        """list_monsters returns at least any inserted monsters."""
        unique_name = f"UniqueM_{uuid.uuid4().hex[:6]}"
        _make_monster(duckdb_session, name=unique_name, cr="1")
        monsters = enc_svc.list_monsters(duckdb_session)
        names = [m.name for m in monsters]
        assert unique_name in names

    def test_search_filter(self, duckdb_session: Session):
        """Search filter returns only matching names (case-insensitive)."""
        unique_name = f"Shadowbeast_{uuid.uuid4().hex[:4]}"
        _make_monster(duckdb_session, name=unique_name, cr="1")
        results = enc_svc.list_monsters(duckdb_session, search="shadowbeast")
        assert any(unique_name in m.name for m in results)

    def test_search_no_match(self, duckdb_session: Session):
        """Search returning no match gives empty list."""
        results = enc_svc.list_monsters(duckdb_session, search="zzz_nomatch_zzz")
        assert results == []
