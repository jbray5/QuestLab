"""A spell that isn't in the free rules: the DM adds it, and the level-up can take it.

Reported by a player levelling a 2024 Paladin to 4, whose spell isn't in SRD 5.2.1.
"""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.levelup_service as levelup_svc
import services.spell_service as spell_svc
import services.spellcasting_service as cast_svc
from domain.enums import CharacterClass
from domain.level_up import FeatChoice, LevelUpChoices
from domain.spell import SpellCreate


def _paladin(db: Session, dm: str):
    """A level 3 Paladin with a level-up waiting."""
    campaign = camp_svc.create_campaign(db, name="Unlisted", dm_email=dm)
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Sir Test",
        race="Human",
        character_class=CharacterClass.PALADIN,
        subclass="Oath of Devotion",
        level=3,
        score_str=16,
        score_dex=10,
        score_con=12,
        score_int=10,
        score_wis=12,
        score_cha=14,
        hp_max=28,
        hp_current=28,
        ac=16,
    )
    levelup_svc.grant(db, pc.id, dm)
    return pc


def _homebrew(db: Session, dm: str):
    """The DM's own Paladin spell."""
    return spell_svc.create_spell(
        db,
        SpellCreate(
            name=f"Called Out {uuid.uuid4().hex[:5]}",
            level=1,
            school="Enchantment",
            casting_time="Bonus Action",
            range="30 feet",
            duration="Concentration, up to 1 minute",
            description="A test spell.",
            classes=["Paladin"],
        ),
        dm_email=dm,
    )


def _choices(spells: list[str]) -> LevelUpChoices:
    """Take the average hit points and a +2 to Strength; pick ``spells``."""
    return LevelUpChoices(
        hp_method="average",
        feat=FeatChoice(name="Ability Score Improvement", asi={"STR": 2}),
        spells=spells,
    )


def test_the_dms_spell_on_a_paladins_level_up(duckdb_session: Session) -> None:
    """Paladin 3 to 4: one new spell, the DM's own among the options, and it lands on the sheet."""
    db = duckdb_session
    dm = f"unlisted.{uuid.uuid4().hex[:6]}@example.com"
    pc = _paladin(db, dm)
    spell = _homebrew(db, dm)
    step = levelup_svc.plan_for(db, pc.id).spellcasting
    assert step is not None and step.new_spells == 1
    assert spell.name in [o.name for o in step.options]
    result = levelup_svc.apply(db, pc.id, _choices([spell.name]))
    assert not result.warnings
    known = cast_svc.list_known_for_character(db, pc.id, dm)
    assert spell.id in [row.spell_id for row in known]


def test_an_open_pick_is_noted_on_the_sheet(duckdb_session: Session) -> None:
    """Leaving the pick open warns the player and stays on the sheet for the DM."""
    db = duckdb_session
    dm = f"unlisted.{uuid.uuid4().hex[:6]}@example.com"
    pc = _paladin(db, dm)
    result = levelup_svc.apply(db, pc.id, _choices([]))
    assert any("Still to pick: 1 spell" in w for w in result.warnings)
    assert not any("Still to pick" in s for s in result.summary)
    assert "Still to pick: 1 spell" in char_svc.get_character(db, pc.id, dm).notes
