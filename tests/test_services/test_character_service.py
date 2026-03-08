"""Tests for services/character_service.py — business logic, spell slots, and authorization."""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as svc
from domain.character import PlayerCharacterUpdate
from domain.enums import AbilityScore, CharacterClass

DM2 = "dm2@example.com"


def _unique_dm() -> str:
    """Return a unique DM email to avoid per-DM campaign limits across the session-scoped DB."""
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _make_campaign(session: Session, dm_email: str | None = None):
    """Create a campaign owned by dm_email (unique per call by default)."""
    owner = dm_email if dm_email is not None else _unique_dm()
    return camp_svc.create_campaign(
        session,
        name=f"Camp {uuid.uuid4().hex[:6]}",
        setting="Faerûn",
        tone="Heroic",
        dm_email=owner,
    )


def _make_character(
    session: Session,
    campaign_id: uuid.UUID,
    dm_email: str | None = None,
    character_class: CharacterClass = CharacterClass.FIGHTER,
    level: int = 1,
    character_name: str = "Arya",
):
    """Create a minimal character via service. dm_email defaults to a new unique address."""
    owner = dm_email if dm_email is not None else _unique_dm()
    return svc.create_character(
        session,
        campaign_id=campaign_id,
        dm_email=owner,
        player_name="Player",
        character_name=character_name,
        race="Human",
        character_class=character_class,
        level=level,
        score_str=16,
        score_dex=14,
        score_con=14,
        score_int=10,
        score_wis=12,
        score_cha=10,
        hp_max=12,
        hp_current=12,
        ac=16,
        speed=30,
    )


# ── ability_modifier ───────────────────────────────────────────────────────────


class TestAbilityModifier:
    """Tests for character_service.ability_modifier."""

    def test_score_10_gives_zero(self):
        """Score 10 → modifier 0."""
        assert svc.ability_modifier(10) == 0

    def test_score_11_gives_zero(self):
        """Score 11 → modifier 0 (floor division)."""
        assert svc.ability_modifier(11) == 0

    def test_score_12_gives_plus1(self):
        """Score 12 → modifier +1."""
        assert svc.ability_modifier(12) == 1

    def test_score_8_gives_minus1(self):
        """Score 8 → modifier -1."""
        assert svc.ability_modifier(8) == -1

    def test_score_20_gives_plus5(self):
        """Score 20 → modifier +5."""
        assert svc.ability_modifier(20) == 5

    def test_score_1_gives_minus5(self):
        """Score 1 → modifier -5."""
        assert svc.ability_modifier(1) == -5


# ── compute_spell_slots ────────────────────────────────────────────────────────


class TestComputeSpellSlots:
    """Tests for character_service.compute_spell_slots per 2024 D&D rules."""

    def test_fighter_has_no_slots(self):
        """Fighter (non-caster) returns empty dict at any level."""
        assert svc.compute_spell_slots(CharacterClass.FIGHTER, 5) == {}
        assert svc.compute_spell_slots(CharacterClass.BARBARIAN, 20) == {}
        assert svc.compute_spell_slots(CharacterClass.MONK, 10) == {}

    def test_wizard_level1_has_two_first_level(self):
        """Wizard level 1 → 2 first-level slots."""
        slots = svc.compute_spell_slots(CharacterClass.WIZARD, 1)
        assert slots == {"1": 2}

    def test_wizard_level5_correct_slots(self):
        """Wizard level 5 → 4/3/2 slots (full caster table)."""
        slots = svc.compute_spell_slots(CharacterClass.WIZARD, 5)
        assert slots["1"] == 4
        assert slots["2"] == 3
        assert slots["3"] == 2
        assert "4" not in slots

    def test_wizard_level20_has_ninth_level(self):
        """Wizard level 20 → has 9th-level slots."""
        slots = svc.compute_spell_slots(CharacterClass.WIZARD, 20)
        assert "9" in slots
        assert slots["9"] == 1

    def test_cleric_same_as_wizard_at_level5(self):
        """Cleric and Wizard use same full-caster table at level 5."""
        assert svc.compute_spell_slots(CharacterClass.CLERIC, 5) == svc.compute_spell_slots(
            CharacterClass.WIZARD, 5
        )

    def test_paladin_level1_no_slots(self):
        """Paladin level 1 → no spell slots (half-caster starts at level 2)."""
        slots = svc.compute_spell_slots(CharacterClass.PALADIN, 1)
        assert slots == {}

    def test_paladin_level2_has_slots(self):
        """Paladin level 2 → 2 first-level slots."""
        slots = svc.compute_spell_slots(CharacterClass.PALADIN, 2)
        assert slots == {"1": 2}

    def test_paladin_level5_has_two_levels(self):
        """Paladin level 5 → 4 first-level, 2 second-level slots."""
        slots = svc.compute_spell_slots(CharacterClass.PALADIN, 5)
        assert slots["1"] == 4
        assert slots["2"] == 2

    def test_warlock_level1_pact_magic(self):
        """Warlock level 1 → 1 pact slot at level 1."""
        slots = svc.compute_spell_slots(CharacterClass.WARLOCK, 1)
        assert slots["pact"] == 1
        assert slots["level"] == 1

    def test_warlock_level5_pact_level3(self):
        """Warlock level 5 → 2 pact slots at level 3."""
        slots = svc.compute_spell_slots(CharacterClass.WARLOCK, 5)
        assert slots["pact"] == 2
        assert slots["level"] == 3

    def test_warlock_level11_has_three_slots(self):
        """Warlock level 11 → 3 pact slots at level 5."""
        slots = svc.compute_spell_slots(CharacterClass.WARLOCK, 11)
        assert slots["pact"] == 3
        assert slots["level"] == 5

    def test_artificer_level1_has_slots(self):
        """Artificer level 1 → 2 first-level slots (starts at level 1)."""
        slots = svc.compute_spell_slots(CharacterClass.ARTIFICER, 1)
        assert slots == {"1": 2}

    def test_artificer_level5_correct(self):
        """Artificer level 5 → 4 first-level, 2 second-level slots."""
        slots = svc.compute_spell_slots(CharacterClass.ARTIFICER, 5)
        assert slots["1"] == 4
        assert slots["2"] == 2

    def test_bard_level17_has_ninth_level(self):
        """Bard level 17 → first 9th-level slot appears."""
        slots = svc.compute_spell_slots(CharacterClass.BARD, 17)
        assert "9" in slots
        assert slots["9"] == 1


# ── compute_skill_bonuses ──────────────────────────────────────────────────────


class TestComputeSkillBonuses:
    """Tests for character_service.compute_skill_bonuses."""

    def _stub(
        self,
        level=1,
        score_str=10,
        score_dex=14,
        score_int=10,
        score_wis=12,
        score_con=10,
        score_cha=10,
        skill_profs=None,
    ):
        """Return a minimal stub object for compute_skill_bonuses."""

        class _Stub:
            pass

        s = _Stub()
        s.level = level
        s.score_str = score_str
        s.score_dex = score_dex
        s.score_con = score_con
        s.score_int = score_int
        s.score_wis = score_wis
        s.score_cha = score_cha
        s.skill_proficiencies = skill_profs
        return s

    def test_no_proficiency_uses_raw_modifier(self):
        """Stealth with DEX 14 and no proficiency → +2."""
        stub = self._stub(score_dex=14)
        bonuses = svc.compute_skill_bonuses(stub)
        assert bonuses["Stealth"] == 2

    def test_proficiency_adds_pb(self):
        """Stealth proficient at level 1 → +2 (mod) + 2 (PB) = +4."""
        stub = self._stub(score_dex=14, skill_profs={"Stealth": 1})
        bonuses = svc.compute_skill_bonuses(stub)
        assert bonuses["Stealth"] == 4

    def test_expertise_doubles_pb(self):
        """Stealth expertise at level 1 → +2 (mod) + 4 (2×PB) = +6."""
        stub = self._stub(score_dex=14, skill_profs={"Stealth": 2})
        bonuses = svc.compute_skill_bonuses(stub)
        assert bonuses["Stealth"] == 6

    def test_pb_increases_at_level5(self):
        """Stealth proficiency at level 5 (PB=3) → +2 + 3 = +5."""
        stub = self._stub(level=5, score_dex=14, skill_profs={"Stealth": 1})
        bonuses = svc.compute_skill_bonuses(stub)
        assert bonuses["Stealth"] == 5

    def test_athletics_uses_str(self):
        """Athletics uses STR modifier."""
        stub = self._stub(score_str=18)
        bonuses = svc.compute_skill_bonuses(stub)
        assert bonuses["Athletics"] == 4  # (18-10)//2 = 4

    def test_all_18_skills_present(self):
        """All 18 skills are present in the result."""
        stub = self._stub()
        bonuses = svc.compute_skill_bonuses(stub)
        assert len(bonuses) == 18
        assert "Perception" in bonuses
        assert "Persuasion" in bonuses


# ── create_character ───────────────────────────────────────────────────────────


class TestCreateCharacter:
    """Tests for character_service.create_character."""

    def test_create_returns_read_schema(self, duckdb_session: Session):
        """create_character returns a populated PlayerCharacterRead."""
        campaign = _make_campaign(duckdb_session)
        char = _make_character(duckdb_session, campaign.id, dm_email=campaign.dm_email)
        assert char.character_name == "Arya"
        assert char.id is not None
        assert char.campaign_id == campaign.id

    def test_spell_slots_auto_populated_for_wizard(self, duckdb_session: Session):
        """Wizard level 5 gets spell slots auto-computed on create."""
        campaign = _make_campaign(duckdb_session)
        char = _make_character(
            duckdb_session,
            campaign.id,
            dm_email=campaign.dm_email,
            character_class=CharacterClass.WIZARD,
            level=5,
        )
        assert char.spell_slots is not None
        assert char.spell_slots.get("1") == 4
        assert char.spell_slots.get("2") == 3
        assert char.spell_slots.get("3") == 2

    def test_proficiency_bonus_computed_from_level(self, duckdb_session: Session):
        """computed_proficiency_bonus reflects the character level."""
        campaign = _make_campaign(duckdb_session)
        char = _make_character(duckdb_session, campaign.id, dm_email=campaign.dm_email, level=5)
        assert char.computed_proficiency_bonus == 3

    def test_non_caster_has_no_spell_slots(self, duckdb_session: Session):
        """Fighter (non-caster) has no spell slots stored."""
        campaign = _make_campaign(duckdb_session)
        char = _make_character(
            duckdb_session,
            campaign.id,
            dm_email=campaign.dm_email,
            character_class=CharacterClass.FIGHTER,
            level=5,
        )
        assert not char.spell_slots

    def test_wrong_owner_raises_permission_error(self, duckdb_session: Session):
        """An outsider cannot create a character in another DM's campaign."""
        campaign = _make_campaign(duckdb_session)
        outsider = _unique_dm()
        with pytest.raises(PermissionError):
            _make_character(duckdb_session, campaign.id, dm_email=outsider)

    def test_max_characters_limit(self, duckdb_session: Session):
        """Creating more than MAX_CHARACTERS_PER_CAMPAIGN raises ValueError."""
        campaign = _make_campaign(duckdb_session)
        dm = campaign.dm_email
        for i in range(svc.MAX_CHARACTERS_PER_CAMPAIGN):
            _make_character(
                duckdb_session,
                campaign.id,
                dm_email=dm,
                character_name=f"Char{i}_{uuid.uuid4().hex[:4]}",
            )
        with pytest.raises(ValueError, match="maximum"):
            _make_character(duckdb_session, campaign.id, dm_email=dm, character_name="Overflow")

    def test_count_increases_after_create(self, duckdb_session: Session):
        """Character count increases by 1 after create."""
        campaign = _make_campaign(duckdb_session)
        dm = campaign.dm_email
        before = len(svc.list_characters(duckdb_session, campaign.id, dm))
        _make_character(duckdb_session, campaign.id, dm_email=dm)
        after = len(svc.list_characters(duckdb_session, campaign.id, dm))
        assert after == before + 1


# ── get_character / list_characters ───────────────────────────────────────────


class TestGetAndList:
    """Tests for get_character and list_characters."""

    def test_get_character_returns_correct_char(self, duckdb_session: Session):
        """get_character returns the character matching the ID."""
        campaign = _make_campaign(duckdb_session)
        dm = campaign.dm_email
        char = _make_character(duckdb_session, campaign.id, dm_email=dm, character_name="Zara")
        fetched = svc.get_character(duckdb_session, char.id, dm)
        assert fetched.id == char.id
        assert fetched.character_name == "Zara"

    def test_get_nonexistent_raises(self, duckdb_session: Session):
        """get_character raises ValueError for unknown ID."""
        with pytest.raises(ValueError):
            svc.get_character(duckdb_session, uuid.uuid4(), _unique_dm())

    def test_list_returns_characters_for_campaign(self, duckdb_session: Session):
        """list_characters returns only characters in the given campaign."""
        c1 = _make_campaign(duckdb_session)
        c2 = _make_campaign(duckdb_session)
        dm1 = c1.dm_email
        dm2 = c2.dm_email
        _make_character(duckdb_session, c1.id, dm_email=dm1, character_name="A1")
        _make_character(duckdb_session, c1.id, dm_email=dm1, character_name="A2")
        _make_character(duckdb_session, c2.id, dm_email=dm2, character_name="B1")
        chars_c1 = svc.list_characters(duckdb_session, c1.id, dm1)
        names = [c.character_name for c in chars_c1]
        assert "A1" in names
        assert "A2" in names
        assert "B1" not in names

    def test_wrong_owner_list_raises(self, duckdb_session: Session):
        """An outsider cannot list characters in another DM's campaign."""
        campaign = _make_campaign(duckdb_session)
        outsider = _unique_dm()
        with pytest.raises(PermissionError):
            svc.list_characters(duckdb_session, campaign.id, outsider)


# ── update_character ───────────────────────────────────────────────────────────


class TestUpdateCharacter:
    """Tests for character_service.update_character."""

    def test_update_name(self, duckdb_session: Session):
        """Updating character_name is reflected in the returned schema."""
        campaign = _make_campaign(duckdb_session)
        dm = campaign.dm_email
        char = _make_character(duckdb_session, campaign.id, dm_email=dm)
        updated = svc.update_character(
            duckdb_session,
            char.id,
            dm,
            PlayerCharacterUpdate(character_name="Lyra"),
        )
        assert updated.character_name == "Lyra"

    def test_level_change_recomputes_spell_slots(self, duckdb_session: Session):
        """Updating level on a Wizard recomputes spell_slots automatically."""
        campaign = _make_campaign(duckdb_session)
        dm = campaign.dm_email
        char = _make_character(
            duckdb_session,
            campaign.id,
            dm_email=dm,
            character_class=CharacterClass.WIZARD,
            level=1,
        )
        assert char.spell_slots == {"1": 2}
        updated = svc.update_character(
            duckdb_session,
            char.id,
            dm,
            PlayerCharacterUpdate(level=5),
        )
        assert updated.spell_slots.get("1") == 4
        assert updated.spell_slots.get("3") == 2

    def test_proficiency_bonus_reflects_new_level(self, duckdb_session: Session):
        """After levelling up, computed_proficiency_bonus reflects new level."""
        campaign = _make_campaign(duckdb_session)
        dm = campaign.dm_email
        char = _make_character(duckdb_session, campaign.id, dm_email=dm, level=4)
        assert char.computed_proficiency_bonus == 2
        updated = svc.update_character(
            duckdb_session,
            char.id,
            dm,
            PlayerCharacterUpdate(level=5),
        )
        assert updated.computed_proficiency_bonus == 3

    def test_wrong_owner_update_raises(self, duckdb_session: Session):
        """An outsider cannot update a character in another DM's campaign."""
        campaign = _make_campaign(duckdb_session)
        dm = campaign.dm_email
        char = _make_character(duckdb_session, campaign.id, dm_email=dm)
        outsider = _unique_dm()
        with pytest.raises(PermissionError):
            svc.update_character(
                duckdb_session,
                char.id,
                outsider,
                PlayerCharacterUpdate(character_name="Hacker"),
            )

    def test_saving_throw_proficiencies_updated(self, duckdb_session: Session):
        """Saving throw proficiencies can be updated."""
        campaign = _make_campaign(duckdb_session)
        dm = campaign.dm_email
        char = _make_character(duckdb_session, campaign.id, dm_email=dm)
        updated = svc.update_character(
            duckdb_session,
            char.id,
            dm,
            PlayerCharacterUpdate(saving_throw_proficiencies=[AbilityScore.STR, AbilityScore.CON]),
        )
        sts = updated.saving_throw_proficiencies or []
        assert AbilityScore.STR in sts or AbilityScore.STR.value in sts


# ── delete_character ───────────────────────────────────────────────────────────


class TestDeleteCharacter:
    """Tests for character_service.delete_character."""

    def test_delete_removes_character(self, duckdb_session: Session):
        """Deleting a character removes it from list_characters."""
        campaign = _make_campaign(duckdb_session)
        dm = campaign.dm_email
        char = _make_character(duckdb_session, campaign.id, dm_email=dm)
        before = len(svc.list_characters(duckdb_session, campaign.id, dm))
        svc.delete_character(duckdb_session, char.id, dm)
        after = len(svc.list_characters(duckdb_session, campaign.id, dm))
        assert after == before - 1

    def test_delete_nonexistent_raises(self, duckdb_session: Session):
        """Deleting unknown character ID raises ValueError."""
        with pytest.raises(ValueError):
            svc.delete_character(duckdb_session, uuid.uuid4(), _unique_dm())

    def test_wrong_owner_delete_raises(self, duckdb_session: Session):
        """An outsider cannot delete a character in another DM's campaign."""
        campaign = _make_campaign(duckdb_session)
        dm = campaign.dm_email
        char = _make_character(duckdb_session, campaign.id, dm_email=dm)
        outsider = _unique_dm()
        with pytest.raises(PermissionError):
            svc.delete_character(duckdb_session, char.id, outsider)
