"""Plan 131 — the ruleset foundation: a campaign plays by the 2024 or the 2014 rules.

Covers the default (2024), creating a 2014 campaign, the PC copy of the ruleset, the
lock once a campaign has characters, the spell catalog filter, the 2014 half-caster
slots, and the dispatch helpers.
"""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.spell_repo import SpellRepo
from domain.campaign import CampaignUpdate
from domain.enums import CharacterClass, Ruleset
from domain.spell import SpellCreate
from integrations.dnd_rules import rulesets


def _dm() -> str:
    return f"dm131_{uuid.uuid4().hex[:8]}@example.com"


def _pc(db, cid, dm, cls=CharacterClass.PALADIN, level=1):
    return char_svc.create_character(
        db,
        campaign_id=cid,
        dm_email=dm,
        player_name="P",
        character_name="Hero",
        race="Human",
        character_class=cls,
        level=level,
        score_str=15,
        score_dex=10,
        score_con=14,
        score_int=10,
        score_wis=10,
        score_cha=14,
        hp_max=12,
        hp_current=12,
        ac=16,
    )


def test_campaigns_default_to_2024(duckdb_session: Session):
    """No ruleset given → the 2024 rules, and its PCs are stamped 2024."""
    dm = _dm()
    c = camp_svc.create_campaign(duckdb_session, name="Default", dm_email=dm)
    assert c.ruleset == Ruleset.R2024
    pc = _pc(duckdb_session, c.id, dm)
    assert pc.ruleset == Ruleset.R2024


def test_2014_campaign_stamps_its_pcs(duckdb_session: Session):
    """A 2014 campaign's PCs read back as 2014 (the stored value is the plain "2014")."""
    dm = _dm()
    c = camp_svc.create_campaign(duckdb_session, name="Old School", dm_email=dm, ruleset="2014")
    assert c.ruleset == Ruleset.R2014
    pc = _pc(duckdb_session, c.id, dm)
    assert pc.ruleset == Ruleset.R2014
    assert char_svc.CharacterRepo.get_by_id(duckdb_session, pc.id).ruleset == "2014"


def test_ruleset_changes_until_the_first_character(duckdb_session: Session):
    """Free to switch while empty; locked (RulesetLockedError) once a PC exists."""
    dm = _dm()
    c = camp_svc.create_campaign(duckdb_session, name="Switch", dm_email=dm)
    switched = camp_svc.update_campaign(
        duckdb_session, c.id, dm, CampaignUpdate(ruleset=Ruleset.R2014)
    )
    assert switched.ruleset == Ruleset.R2014
    _pc(duckdb_session, c.id, dm)
    with pytest.raises(camp_svc.RulesetLockedError, match="locked"):
        camp_svc.update_campaign(duckdb_session, c.id, dm, CampaignUpdate(ruleset="2024"))
    # Sending the same value, or other fields, is fine.
    same = camp_svc.update_campaign(
        duckdb_session, c.id, dm, CampaignUpdate(ruleset="2014", name="Renamed")
    )
    assert same.ruleset == Ruleset.R2014 and same.name == "Renamed"


def test_spell_repo_filters_by_ruleset(duckdb_session: Session):
    """A ruleset keeps that edition's rows plus homebrew (NULL); None keeps everything."""
    tag = uuid.uuid4().hex[:6]

    def make(name: str, ruleset):
        return SpellRepo.create(
            duckdb_session,
            SpellCreate(
                name=name,
                level=1,
                school="Evocation",
                casting_time="1 action",
                range="60 feet",
                duration="Instantaneous",
                description="x",
                classes=["Wizard"],
                ruleset=ruleset,
            ),
        )

    make(f"Zap {tag}", "2024")
    make(f"Zap {tag}", "2014")
    make(f"Homebrew {tag}", None)
    names_2014 = [
        (s.name, s.ruleset) for s in SpellRepo.list_all(duckdb_session, q=tag, ruleset="2014")
    ]
    assert sorted(names_2014, key=str) == sorted(
        [(f"Zap {tag}", "2014"), (f"Homebrew {tag}", None)], key=str
    )
    assert len(SpellRepo.list_all(duckdb_session, q=tag)) == 3
    assert SpellRepo.get_by_name(duckdb_session, f"Zap {tag}", ruleset="2014").ruleset == "2014"
    assert (
        SpellRepo.get_by_name(duckdb_session, f"Zap {tag}", ruleset=Ruleset.R2024).ruleset == "2024"
    )


def test_2014_half_casters_have_no_slots_at_level_1():
    """2014 Paladin/Ranger cast from level 2; from there the table matches 2024."""
    for cls in (CharacterClass.PALADIN, CharacterClass.RANGER):
        assert char_svc.compute_spell_slots(cls, 1, "2014") == {}
        assert char_svc.compute_spell_slots(cls, 1) == char_svc.compute_spell_slots(cls, 1, "2024")
        assert char_svc.compute_spell_slots(cls, 1, "2024")
        for lvl in range(2, 21):
            assert char_svc.compute_spell_slots(cls, lvl, "2014") == char_svc.compute_spell_slots(
                cls, lvl, "2024"
            )
    # Full casters and the Warlock are the same in both editions.
    assert char_svc.compute_spell_slots(CharacterClass.WIZARD, 1, "2014") == {"1": 2}


def test_2014_paladin_pc_starts_without_slots(duckdb_session: Session):
    """The PC row itself gets no slots at level 1 in a 2014 campaign."""
    dm = _dm()
    c = camp_svc.create_campaign(duckdb_session, name="Oath", dm_email=dm, ruleset="2014")
    assert not _pc(duckdb_session, c.id, dm, CharacterClass.PALADIN, 1).spell_slots
    c24 = camp_svc.create_campaign(duckdb_session, name="Oath 24", dm_email=dm)
    assert _pc(duckdb_session, c24.id, dm, CharacterClass.PALADIN, 1).spell_slots


def test_dispatch_helpers():
    """normalize/is_2014 accept enums, strings and None; unknown values are refused."""
    assert rulesets.normalize(None) == "2024"
    assert rulesets.normalize(Ruleset.R2014) == "2014"
    assert rulesets.is_2014("2014") and not rulesets.is_2014(Ruleset.R2024)
    with pytest.raises(ValueError):
        rulesets.normalize("3.5")
    assert rulesets.options("2024").__name__.endswith("srd_character_options_2024")
    assert rulesets.levelup(None).__name__.endswith("levelup_2024")
    assert rulesets.class_features("2024")
    assert rulesets.spell_seed("2024")


def test_create_schemas_refuse_unknown_rulesets():
    """The create schemas only take "2024"/"2014" (pydantic pattern, not SQLModel's regex)."""
    from pydantic import ValidationError

    from domain.character import ClassFeatureCreate, PlayerCharacterCreate

    base = dict(
        player_name="p",
        character_name="c",
        race="r",
        character_class="Fighter",
        level=1,
        score_str=10,
        score_dex=10,
        score_con=10,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=5,
        hp_current=5,
        ac=10,
    )
    assert PlayerCharacterCreate(**base, ruleset="2014").ruleset == "2014"
    with pytest.raises(ValidationError):
        PlayerCharacterCreate(**base, ruleset="2020")
    with pytest.raises(ValidationError):
        ClassFeatureCreate(
            name="x",
            character_class="Fighter",
            level_acquired=1,
            recovery="long",
            uses_formula="fixed_1",
            description="d",
            ruleset="5e",
        )
