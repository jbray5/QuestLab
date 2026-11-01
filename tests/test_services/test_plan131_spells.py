"""Plan 131 — the 2014 (SRD 5.1) spell catalog beside the 2024 one.

Covers the generated ``srd_spells_2014`` module (count, known SRD values, validation), the
startup seed of both editions (idempotent, insert-if-missing per edition), the ruleset
filter on the catalog lists, and homebrew staying edition-free.

The dataset the module was generated from is not in the repo, so the SRD values checked
here are hard-coded.
"""

import uuid

import pytest
from sqlmodel import Session, delete

import services.spell_service as spell_svc
from db.repos.spell_repo import SpellRepo
from domain.enums import CharacterClass, Ruleset
from domain.spell import Spell, SpellCreate
from integrations.dnd_rules import rulesets
from integrations.dnd_rules.srd_spells_2014 import SRD_SPELLS_2014
from integrations.dnd_rules.srd_spells_2024 import SRD_SPELLS_2024

_BY_NAME = {s.name: s for s in SRD_SPELLS_2014}


@pytest.fixture(autouse=True)
def _clean_spells(duckdb_session: Session):
    """Start and finish every test with an empty spells table (the engine is shared)."""
    duckdb_session.exec(delete(Spell))
    duckdb_session.commit()
    yield
    duckdb_session.rollback()
    duckdb_session.exec(delete(Spell))
    duckdb_session.commit()


def _make(name: str, ruleset=None, level: int = 1, **extras) -> SpellCreate:
    """A small SpellCreate for filter and seed tests."""
    payload = {
        "name": name,
        "level": level,
        "school": "Evocation",
        "casting_time": "1 action",
        "range": "60 feet",
        "duration": "Instantaneous",
        "description": f"{name} description.",
        "classes": ["Wizard"],
        "ruleset": ruleset,
    }
    payload.update(extras)
    return SpellCreate.model_validate(payload)


# ── The generated module ──────────────────────────────────────────────────────


def test_module_has_every_srd51_spell_once():
    """319 spells, unique names, all stamped as the 2014 SRD rows."""
    assert len(SRD_SPELLS_2014) == 319
    names = [s.name.casefold() for s in SRD_SPELLS_2014]
    assert len(set(names)) == len(names)
    assert {s.ruleset for s in SRD_SPELLS_2014} == {"2014"}
    assert {s.source for s in SRD_SPELLS_2014} == {"SRD 5.1 (2014)"}


def test_module_is_sorted_by_level_then_name():
    """The generator writes records in a stable order: level, then name."""
    keys = [(s.level, s.name) for s in SRD_SPELLS_2014]
    assert keys == sorted(keys)
    assert sum(1 for s in SRD_SPELLS_2014 if s.level == 0) == 24  # SRD 5.1 cantrips


def test_dispatch_returns_the_2014_list():
    """``rulesets.spell_seed("2014")`` hands back this module's list."""
    assert rulesets.spell_seed("2014") is SRD_SPELLS_2014
    assert rulesets.spell_seed(Ruleset.R2014) is SRD_SPELLS_2014


def test_fireball_matches_the_srd():
    """Fireball: 3rd-level evocation, 8d6 fire, Dexterity save, Sorcerer and Wizard."""
    fb = _BY_NAME["Fireball"]
    assert fb.level == 3
    assert fb.school == "Evocation"
    assert fb.damage_dice == "8d6"
    assert fb.damage_type == "fire"
    assert fb.save_ability == "DEX"
    assert fb.attack_type is None
    assert {"Sorcerer", "Wizard"} <= set(fb.classes)
    assert fb.range == "150 feet"
    assert fb.components_v and fb.components_s
    assert fb.components_m == "a tiny ball of bat guano and sulfur"
    assert "4th level or higher" in fb.higher_levels
    assert "Dexterity saving throw" in fb.description


def test_cure_wounds_uses_the_2014_class_list():
    """2014 Cure Wounds: Bard, Cleric, Druid, Paladin, Ranger, and 1d8 healing."""
    cw = _BY_NAME["Cure Wounds"]
    assert {"Bard", "Cleric", "Druid", "Paladin", "Ranger"} <= set(cw.classes)
    assert cw.level == 1
    assert "1d8" in cw.description
    assert cw.damage_dice is None  # healing, not damage


def test_cantrip_hints_and_scaling():
    """Fire Bolt: ranged attack, 1d10 fire, its 5th-level scaling kept as higher_levels."""
    fire_bolt = _BY_NAME["Fire Bolt"]
    assert fire_bolt.level == 0
    assert fire_bolt.attack_type == "ranged"
    assert (fire_bolt.damage_dice, fire_bolt.damage_type) == ("1d10", "fire")
    assert "5th level (2d10)" in fire_bolt.higher_levels
    assert "5th level" not in fire_bolt.description


def test_printed_srd_forms():
    """Concentration in the duration, reaction triggers, and no hit-point pool as damage."""
    bless = _BY_NAME["Bless"]
    assert bless.is_concentration
    assert bless.duration == "Concentration, up to 1 minute"
    assert _BY_NAME["Shield"].casting_time.startswith("1 reaction, which you take when")
    assert _BY_NAME["Sleep"].damage_dice is None  # 5d8 is the hit points it affects
    assert _BY_NAME["Detect Magic"].is_ritual


def test_every_record_passes_spellcreate_validation():
    """Each record round-trips through SpellCreate and keeps within the table's caps."""
    classes = {c.value for c in CharacterClass}
    for spell in SRD_SPELLS_2014:
        again = SpellCreate.model_validate(spell.model_dump())
        assert again == spell
        assert len(spell.name) <= 120
        assert len(spell.casting_time) <= 400
        assert len(spell.range) <= 120
        assert len(spell.duration) <= 120
        assert spell.components_m is None or len(spell.components_m) <= 600
        assert spell.classes and set(spell.classes) <= classes, spell.name
        assert spell.save_ability in (None, "STR", "DEX", "CON", "INT", "WIS", "CHA")
        assert spell.attack_type in (None, "ranged", "melee")


# ── Seeding ───────────────────────────────────────────────────────────────────


def test_seed_creates_both_editions_once(duckdb_session: Session):
    """An empty catalog gets both editions; a second run inserts nothing."""
    first = spell_svc.seed_srd_spells(duckdb_session)
    assert first == {"2024": len(SRD_SPELLS_2024), "2014": 319}
    assert SpellRepo.count(duckdb_session, ruleset="2024") == len(SRD_SPELLS_2024)
    assert SpellRepo.count(duckdb_session, ruleset="2014") == 319
    # Fireball exists once in each edition.
    fb_2014 = SpellRepo.get_by_name(duckdb_session, "Fireball", ruleset="2014")
    fb_2024 = SpellRepo.get_by_name(duckdb_session, "Fireball", ruleset="2024")
    assert fb_2014.ruleset == "2014" and fb_2014.source == "SRD 5.1 (2014)"
    assert fb_2024.ruleset == "2024" and fb_2024.id != fb_2014.id

    assert spell_svc.seed_srd_spells(duckdb_session) == {"2024": 0, "2014": 0}
    assert SpellRepo.count(duckdb_session) == len(SRD_SPELLS_2024) + 319


def test_seed_stamps_and_skips_per_edition(duckdb_session: Session):
    """Prod's case: 2024 rows exist, so only the missing edition goes in, stamped."""
    SpellRepo.create(duckdb_session, _make("Old 2024 Row", ruleset="2024"))
    assert spell_svc.seed_spells(duckdb_session, [_make("New 2024")], ruleset="2024") == 0
    inserted = spell_svc.seed_spells(duckdb_session, [_make("Unstamped")], ruleset=Ruleset.R2014)
    assert inserted == 1
    assert SpellRepo.get_by_name(duckdb_session, "Unstamped").ruleset == "2014"
    assert SpellRepo.get_by_name(duckdb_session, "New 2024") is None


def test_seed_ignores_homebrew_when_counting(duckdb_session: Session):
    """A DM's homebrew (no ruleset) doesn't stop an edition from seeding."""
    SpellRepo.create(duckdb_session, _make("Homebrew Zap"), owner_email="dm@x.test")
    assert spell_svc.seed_spells(duckdb_session, [_make("SRD Zap")], ruleset="2014") == 1


def test_seed_does_not_touch_the_shared_2024_list(duckdb_session: Session):
    """Stamping copies the payloads; the 2024 module's objects keep ruleset=None."""
    spell_svc.seed_spells(duckdb_session, SRD_SPELLS_2024[:2], ruleset="2024")
    assert SRD_SPELLS_2024[0].ruleset is None


def test_seed_rejects_an_unknown_ruleset(duckdb_session: Session):
    """Anything but 2024/2014 is a ValueError."""
    with pytest.raises(ValueError):
        spell_svc.seed_spells(duckdb_session, [_make("X")], ruleset="1999")


# ── Catalog filter ────────────────────────────────────────────────────────────


def _three_rows(db: Session, dm: str) -> None:
    """A 2024 Fireball, a 2014 Fireball, and one DM homebrew spell."""
    SpellRepo.create(db, _make("Fireball", ruleset="2024", level=3))
    SpellRepo.create(db, _make("Fireball", ruleset="2014", level=3))
    SpellRepo.create(db, _make("Homebrew Bolt"), owner_email=dm)


def test_list_all_keeps_one_edition_plus_homebrew(duckdb_session: Session):
    """``list_all(ruleset="2014")`` returns the 2014 rows and homebrew only."""
    _three_rows(duckdb_session, "dm@x.test")
    rows = SpellRepo.list_all(duckdb_session, ruleset="2014")
    assert sorted((s.name, s.ruleset or "") for s in rows) == [
        ("Fireball", "2014"),
        ("Homebrew Bolt", ""),
    ]


def test_list_spells_filters_by_ruleset(duckdb_session: Session):
    """The service list takes the ruleset (str or enum); omitted lists every row."""
    dm = f"dm131s_{uuid.uuid4().hex[:6]}@x.test"
    _three_rows(duckdb_session, dm)
    only_2014 = spell_svc.list_spells(duckdb_session, viewer=dm, ruleset=Ruleset.R2014)
    assert {(s.name, s.ruleset) for s in only_2014} == {
        ("Fireball", "2014"),
        ("Homebrew Bolt", None),
    }
    only_2024 = spell_svc.list_spells(duckdb_session, viewer=dm, ruleset="2024")
    assert {(s.name, s.ruleset) for s in only_2024} == {
        ("Fireball", "2024"),
        ("Homebrew Bolt", None),
    }
    assert len(spell_svc.list_spells(duckdb_session, viewer=dm)) == 3
    with pytest.raises(ValueError):
        spell_svc.list_spells(duckdb_session, viewer=dm, ruleset="5e")


def test_list_for_class_filters_by_ruleset(duckdb_session: Session):
    """The class list takes the same optional ruleset."""
    _three_rows(duckdb_session, "dm@x.test")
    wizard_2014 = spell_svc.list_for_class(duckdb_session, "Wizard", ruleset="2014")
    assert sorted(s.ruleset or "" for s in wizard_2014) == ["", "2014"]
    assert len(spell_svc.list_for_class(duckdb_session, "Wizard")) == 3


def test_homebrew_never_carries_a_ruleset(duckdb_session: Session):
    """A DM's spell is stored with no ruleset even if the payload names one."""
    spell = spell_svc.create_spell(
        duckdb_session, _make("My Bolt", ruleset="2014"), dm_email="dm@x.test"
    )
    assert spell.ruleset is None
    assert spell.created_by_email == "dm@x.test"
    plain = spell_svc.create_spell(duckdb_session, _make("My Other Bolt"), dm_email="dm@x.test")
    assert plain.ruleset is None
