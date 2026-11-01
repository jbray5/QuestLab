"""Plan 131 — the 2014 (SRD 5.1) character-creation data: true to the book, in 2024's shapes.

The dataset the module was built from isn't in the repo, so the SRD 5.1 values checked here
are typed in by hand from the class and race tables.
"""

import pytest

from integrations.dnd_rules import rulesets
from integrations.dnd_rules import srd_character_options_2014 as srd14
from integrations.dnd_rules import srd_character_options_2024 as srd24
from integrations.dnd_rules.srd_weapons_2024 import SRD_WEAPONS_2024

_ARMOR_WORDS = {"light", "medium", "heavy", "shields"}


def _public(module) -> set[str]:
    """Names a module exposes, without the private ones."""
    return {n for n in dir(module) if not n.startswith("_")}


def _race(name: str) -> dict:
    """The race row called ``name``."""
    return next(r for r in srd14.SPECIES if r["name"] == name)


# ── Shape: the same names as 2024, served by the dispatcher ──────────────────


def test_exposes_every_public_name_of_the_2024_module():
    """Every 2024 public name exists in 2014."""
    assert _public(srd24) <= _public(srd14)
    assert set(srd14.__all__) <= _public(srd14)


def test_edition_neutral_tables_are_the_2024_objects():
    """Shared tables are re-exported, not copied."""
    for name in (
        "ABILITIES",
        "SKILLS",
        "STANDARD_ARRAY",
        "POINT_BUY_COST",
        "POINT_BUY_BUDGET",
        "ARMOR",
        "SHIELD_BONUS",
        "ability_mod",
        "proficiency_bonus",
    ):
        assert getattr(srd14, name) is getattr(srd24, name), name


def test_dispatcher_serves_the_2014_module():
    """rulesets.options picks the module by ruleset."""
    assert rulesets.options("2014") is srd14
    assert rulesets.options("2024") is srd24


# ── Classes ──────────────────────────────────────────────────────────────────


def test_twelve_classes_with_the_2024_keys():
    """The 12 SRD classes, each with 2024's keys and sane values."""
    assert list(srd14.CLASSES) == list(srd24.CLASSES)
    for name, cls in srd14.CLASSES.items():
        assert set(srd24.CLASSES[name]) <= set(cls), name
        assert set(cls["saves"]) <= set(srd14.ABILITIES) and len(cls["saves"]) == 2
        assert set(cls["primary"]) <= set(srd14.ABILITIES)
        assert set(cls["armor"]) <= _ARMOR_WORDS
        assert set(cls["skills"]["from"]) <= set(srd14.SKILLS)
        assert cls["skills"]["choose"] <= len(cls["skills"]["from"])


def test_subclass_levels():
    """Cleric, Sorcerer, Warlock at 1; Druid, Wizard at 2; the rest at 3."""
    levels = {c: cls["subclass_level"] for c, cls in srd14.CLASSES.items()}
    assert {c for c, lv in levels.items() if lv == 1} == {"Cleric", "Sorcerer", "Warlock"}
    assert {c for c, lv in levels.items() if lv == 2} == {"Druid", "Wizard"}
    assert {c for c, lv in levels.items() if lv == 3} == {
        "Barbarian",
        "Bard",
        "Fighter",
        "Monk",
        "Paladin",
        "Ranger",
        "Rogue",
    }


def test_srd_subclasses_use_the_2014_names():
    """The SRD 5.1 subclass names other tables key by."""
    names = {c: cls["srd_subclasses"] for c, cls in srd14.CLASSES.items()}
    assert names == {
        "Barbarian": ["Path of the Berserker"],
        "Bard": ["College of Lore"],
        "Cleric": ["Life Domain"],
        "Druid": ["Circle of the Land"],
        "Fighter": ["Champion"],
        "Monk": ["Way of the Open Hand"],
        "Paladin": ["Oath of Devotion"],
        "Ranger": ["Hunter"],
        "Rogue": ["Thief"],
        "Sorcerer": ["Draconic Bloodline"],
        "Warlock": ["The Fiend"],
        "Wizard": ["School of Evocation"],
    }


def test_2014_differences_in_class_lists():
    """SRD 5.1 lists that differ from 2024: Druid armor, Fighter/Rogue/Wizard skills."""
    assert "medium" in srd14.CLASSES["Druid"]["armor"]
    assert "Persuasion" not in srd14.CLASSES["Fighter"]["skills"]["from"]
    assert "Performance" in srd14.CLASSES["Rogue"]["skills"]["from"]
    assert "Nature" not in srd14.CLASSES["Wizard"]["skills"]["from"]
    assert srd14.CLASSES["Bard"]["skills"] == {"choose": 3, "from": list(srd14.SKILLS)}


def test_spellcasting_blocks():
    """Known vs prepared casters, first spell level, spellbook."""
    kinds = {c: (cls["spellcasting"] or {}).get("kind") for c, cls in srd14.CLASSES.items()}
    assert {c for c, k in kinds.items() if k == "known"} == {
        "Bard",
        "Ranger",
        "Sorcerer",
        "Warlock",
    }
    assert {c for c, k in kinds.items() if k == "prepared"} == {
        "Cleric",
        "Druid",
        "Paladin",
        "Wizard",
    }
    assert {c for c, k in kinds.items() if k is None} == {"Barbarian", "Fighter", "Monk", "Rogue"}
    for c, cls in srd14.CLASSES.items():
        sc = cls["spellcasting"]
        if not sc:
            continue
        assert sc["ability"] in srd14.ABILITIES
        assert sc["first_level"] == (2 if c in ("Paladin", "Ranger") else 1), c
        assert sc["spellbook"] is (c == "Wizard"), c
        assert "prepared" not in sc, "2014 has no 20-level prepared list"
        if sc["kind"] == "known":
            assert len(sc["known"]) == 20 and sc["prepared_formula"] is None
            assert sc["known"] == sorted(sc["known"]), c
        else:
            assert sc["known"] is None
            assert sc["prepared_formula"] == ("half_level" if c == "Paladin" else "level"), c


@pytest.mark.parametrize(
    ("cls", "level", "known"),
    [
        ("Bard", 1, 4),
        ("Bard", 10, 14),
        ("Bard", 20, 22),
        ("Sorcerer", 1, 2),
        ("Sorcerer", 20, 15),
        ("Warlock", 1, 2),
        ("Warlock", 11, 11),
        ("Ranger", 1, 0),
        ("Ranger", 2, 2),
        ("Ranger", 20, 11),
        ("Cleric", 5, 0),
        ("Fighter", 5, 0),
    ],
)
def test_spells_known(cls, level, known):
    """Spells Known from the SRD 5.1 class tables."""
    assert srd14.spells_known(cls, level) == known


@pytest.mark.parametrize(
    ("cls", "level", "mod", "count"),
    [
        ("Cleric", 3, 3, 6),
        ("Druid", 1, 2, 3),
        ("Wizard", 1, -1, 1),  # never fewer than one
        ("Paladin", 1, 3, 0),  # no spells at level 1
        ("Paladin", 2, 2, 3),
        ("Paladin", 5, 3, 5),
        ("Bard", 1, 5, 4),  # a known caster's count ignores the modifier
        ("Ranger", 1, 3, 0),
        ("Rogue", 5, 3, 0),
    ],
)
def test_spells_prepared(cls, level, mod, count):
    """Prepared counts: mod + level (or half level), at least 1."""
    assert srd14.spells_prepared(cls, level, mod) == count


def test_spells_prepared_is_call_compatible_with_2024():
    """Services call ``spells_prepared(cls, level)``; the modifier defaults to +0."""
    assert srd14.spells_prepared("Cleric", 4) == 4
    assert srd14.spells_prepared("Sorcerer", 3) == 4


def test_cantrips_match_the_srd_tables_and_2024():
    """Cantrips known match SRD 5.1 and 2024."""
    table = {
        "Bard": [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
        "Cleric": [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
        "Druid": [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
        "Sorcerer": [4, 4, 4, 5, 5, 5, 5, 5, 5, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6, 6],
        "Warlock": [2, 2, 2, 3, 3, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4],
        "Wizard": [3, 3, 3, 4, 4, 4, 4, 4, 4, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    }
    for cls in srd14.CLASSES:
        got = [srd14.cantrips_known(cls, lv) for lv in range(1, 21)]
        assert got == table.get(cls, [0] * 20), cls
        assert got == [srd24.cantrips_known(cls, lv) for lv in range(1, 21)], cls


def test_max_spell_level():
    """Half casters start at 2; the rest match 2024."""
    half = [0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5]
    for cls in ("Paladin", "Ranger"):
        assert [srd14.max_spell_level(cls, lv) for lv in range(1, 21)] == half
    for cls in ("Bard", "Cleric", "Druid", "Sorcerer", "Warlock", "Wizard"):
        for lv in range(1, 21):
            assert srd14.max_spell_level(cls, lv) == srd24.max_spell_level(cls, lv), (cls, lv)
    assert srd14.max_spell_level("Wizard", 17) == 9
    assert srd14.max_spell_level("Warlock", 20) == 5
    assert srd14.max_spell_level("Fighter", 20) == 0


def test_spellbook_size():
    """A Wizard's spellbook: 6 at 1, +2 a level."""
    assert srd14.spellbook_size("Wizard", 1) == 6
    assert srd14.spellbook_size("Wizard", 3) == 10
    assert srd14.spellbook_size("Wizard", 20) == 44
    assert srd14.spellbook_size("Cleric", 5) == 0


def test_every_kit_item_is_in_the_catalog():
    """Kit weapons are catalog items; armor is an ARMOR key."""
    weapons = {w.name for w in SRD_WEAPONS_2024}
    for cls_name, cls in srd14.CLASSES.items():
        assert 2 <= len(cls["kits"]) <= 3, cls_name
        for kit in cls["kits"]:
            assert set(kit) == {"name", "items", "armor", "shield"}
            assert kit["items"], kit["name"]
            for item in kit["items"]:
                assert item in weapons or item in srd14.ARMOR, (cls_name, item)
            assert kit["armor"] is None or kit["armor"] in srd14.ARMOR, kit["name"]
            assert isinstance(kit["shield"], bool)
            if kit["armor"]:
                category = srd14.ARMOR[kit["armor"]]["category"]
                # Only the Cleric's chain mail kit needs training its class lacks (Life Domain).
                assert category in cls["armor"] or (cls_name, kit["armor"]) == (
                    "Cleric",
                    "Chain Mail",
                ), kit["name"]


# ── Races ────────────────────────────────────────────────────────────────────


def test_nine_races_with_the_2014_keys():
    """The 9 SRD 5.1 races carry every 2014 key."""
    assert [r["name"] for r in srd14.SPECIES] == [
        "Dragonborn",
        "Dwarf",
        "Elf",
        "Gnome",
        "Half-Elf",
        "Half-Orc",
        "Halfling",
        "Human",
        "Tiefling",
    ]
    keys = {"name", "size", "speed", "traits", "ability_bonuses", "ability_choice", "skills"}
    keys |= {"skill_choice", "subraces", "choices"}
    for r in srd14.SPECIES:
        assert keys <= set(r), r["name"]
        assert r["size"] in ("Medium", "Small")
        assert r["traits"] and all(isinstance(t, str) for t in r["traits"])
        assert set(r["ability_bonuses"]) <= set(srd14.ABILITIES)
        assert set(r["skills"]) <= set(srd14.SKILLS)
    speeds = {r["name"]: r["speed"] for r in srd14.SPECIES}
    assert {n for n, s in speeds.items() if s == 25} == {"Dwarf", "Gnome", "Halfling"}


@pytest.mark.parametrize(
    ("race", "bonuses"),
    [
        ("Dragonborn", {"STR": 2, "CHA": 1}),
        ("Dwarf", {"CON": 2}),
        ("Elf", {"DEX": 2}),
        ("Gnome", {"INT": 2}),
        ("Half-Elf", {"CHA": 2}),
        ("Half-Orc", {"STR": 2, "CON": 1}),
        ("Halfling", {"DEX": 2}),
        ("Human", {"STR": 1, "DEX": 1, "CON": 1, "INT": 1, "WIS": 1, "CHA": 1}),
        ("Tiefling", {"INT": 1, "CHA": 2}),
    ],
)
def test_racial_ability_bonuses(race, bonuses):
    """Each race's fixed ability bonuses."""
    assert _race(race)["ability_bonuses"] == bonuses


def test_half_elf_choices():
    """Half-Elf: +2 CHA, two +1s (not CHA), two skills of choice."""
    half_elf = _race("Half-Elf")
    assert half_elf["ability_bonuses"] == {"CHA": 2}
    assert half_elf["ability_choice"] == {"choose": 2, "amount": 1, "exclude": ["CHA"]}
    assert half_elf["skill_choice"] == 2
    assert half_elf["bonus_skill_choices"] == 2  # the key the builder already honours
    others = [r for r in srd14.SPECIES if r["name"] != "Half-Elf"]
    assert all(r["ability_choice"] is None and r["skill_choice"] == 0 for r in others)
    assert all("bonus_skill_choices" not in r for r in others)


def test_fixed_skills():
    """Elf Keen Senses and Half-Orc Menacing."""
    skills = {r["name"]: r["skills"] for r in srd14.SPECIES if r["skills"]}
    assert skills == {"Elf": ["Perception"], "Half-Orc": ["Intimidation"]}


def test_subraces():
    """The four SRD subraces and their bonuses."""
    subs = {r["name"]: r["subraces"] for r in srd14.SPECIES}
    assert {n for n, s in subs.items() if s} == {"Dwarf", "Elf", "Gnome", "Halfling"}
    assert all(s == [] for n, s in subs.items() if n not in {"Dwarf", "Elf", "Gnome", "Halfling"})
    flat = {s["name"]: s for row in subs.values() for s in row}
    assert {n: s["ability_bonuses"] for n, s in flat.items()} == {
        "Hill Dwarf": {"WIS": 1},
        "High Elf": {"INT": 1},
        "Rock Gnome": {"CON": 1},
        "Lightfoot Halfling": {"CHA": 1},
    }
    assert flat["Hill Dwarf"]["hp_per_level"] == 1
    assert flat["High Elf"]["cantrip_choice"] == {"count": 1, "list": "Wizard", "ability": "INT"}
    assert all("hp_per_level" not in s for n, s in flat.items() if n != "Hill Dwarf")
    assert all("cantrip_choice" not in s for n, s in flat.items() if n != "High Elf")
    for s in flat.values():
        assert s["traits"] and all(isinstance(t, str) for t in s["traits"])


def test_dragonborn_ancestry_choice():
    """The Draconic Ancestry table as a species choice."""
    dragonborn = _race("Dragonborn")
    assert dragonborn["choices"] == {"dragonborn_ancestry": 1}
    assert all(r["choices"] == {} for r in srd14.SPECIES if r["name"] != "Dragonborn")
    spec = srd14.SPECIES_CHOICE_KINDS["dragonborn_ancestry"]
    assert spec["kind"] == "option" and spec["record"] == "Draconic Ancestry"
    table = {o["name"]: (o["damage_type"], o["area"], o["save"]) for o in spec["options"]}
    assert table == {
        "Black": ("acid", "5 by 30 ft. line", "DEX"),
        "Blue": ("lightning", "5 by 30 ft. line", "DEX"),
        "Brass": ("fire", "5 by 30 ft. line", "DEX"),
        "Bronze": ("lightning", "5 by 30 ft. line", "DEX"),
        "Copper": ("acid", "5 by 30 ft. line", "DEX"),
        "Gold": ("fire", "15 ft. cone", "DEX"),
        "Green": ("poison", "15 ft. cone", "CON"),
        "Red": ("fire", "15 ft. cone", "DEX"),
        "Silver": ("cold", "15 ft. cone", "CON"),
        "White": ("cold", "15 ft. cone", "CON"),
    }
    assert all(o["blurb"] for o in spec["options"])


# ── Backgrounds and feats ────────────────────────────────────────────────────


def test_acolyte_is_the_only_background():
    """SRD 5.1's only background, with no bonuses or feat."""
    assert [b["name"] for b in srd14.BACKGROUNDS] == ["Acolyte"]
    acolyte = srd14.BACKGROUNDS[0]
    assert acolyte["skills"] == ["Insight", "Religion"]
    assert acolyte["abilities"] == [] and acolyte["feat"] is None and acolyte["tool"] is None
    assert acolyte["languages"] == 2
    assert acolyte["feature"].startswith("Shelter of the Faithful")
    assert acolyte["blurb"]


def test_no_origin_feats():
    """2014 has no Origin feats."""
    assert srd14.ORIGIN_FEATS == []
