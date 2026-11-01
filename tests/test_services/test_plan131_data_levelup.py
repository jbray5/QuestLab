"""Plan 131 — the 2014 level-up data (``levelup_2014``) mirrors the 2024 module's interface.

Pure data checks against known SRD 5.1 values (the dataset isn't in the repo, so every value
here is hard-coded): the same public names as ``levelup_2024``, empty 2024-only tables, the
2014 improvement levels, subclass levels, class choices and their counts, always-prepared
spells, and the per-level numbers each class tracks.
"""

import pytest

from integrations.dnd_rules import levelup_2014 as rules
from integrations.dnd_rules import levelup_2024 as rules_2024
from integrations.dnd_rules import rulesets

CLASSES = [
    "Barbarian",
    "Bard",
    "Cleric",
    "Druid",
    "Fighter",
    "Monk",
    "Paladin",
    "Ranger",
    "Rogue",
    "Sorcerer",
    "Warlock",
    "Wizard",
]

# Class → (SRD 5.1 subclass, level the subclass is chosen).
SRD_SUBCLASSES = {
    "Barbarian": ("Path of the Berserker", 3),
    "Bard": ("College of Lore", 3),
    "Cleric": ("Life Domain", 1),
    "Druid": ("Circle of the Land", 2),
    "Fighter": ("Champion", 3),
    "Monk": ("Way of the Open Hand", 3),
    "Paladin": ("Oath of Devotion", 3),
    "Ranger": ("Hunter", 3),
    "Rogue": ("Thief", 3),
    "Sorcerer": ("Draconic Bloodline", 1),
    "Warlock": ("The Fiend", 1),
    "Wizard": ("School of Evocation", 2),
}


def _public(module) -> set[str]:
    """Public (non-underscore) names a module exposes."""
    return {n for n in dir(module) if not n.startswith("_")}


def _scale(cls: str, label: str) -> list[list]:
    """One class_scales table as [[from_level, value], ...]."""
    rows = {r["label"]: r["table"] for r in rules.class_scales()[cls]}
    return rows[label]


def _at(table: list[list], level: int):
    """The value of a scales table at ``level`` (None before its first row)."""
    out = None
    for at, value in table:
        if level >= at:
            out = value
    return out


# ── Interface ─────────────────────────────────────────────────────────────────


def test_dispatch_returns_the_2014_module():
    """rulesets.levelup picks the edition's module."""
    assert rulesets.levelup("2014") is rules
    assert rulesets.levelup("2024") is rules_2024


def test_every_2024_public_name_exists_with_the_same_type():
    """Every 2024 name exists, same type."""
    missing = _public(rules_2024) - _public(rules)
    assert not missing, missing
    for name in _public(rules_2024):
        old, new = getattr(rules_2024, name), getattr(rules, name)
        if callable(old):
            assert callable(new), name
        else:
            assert type(new) is type(old), name


def test_2024_only_names_are_empty():
    """Names with no 2014 meaning are empty or neutral."""
    assert rules.WEAPON_MASTERY_FILTER == {}
    assert rules.FIGHTING_STYLE_EXTRAS == {}
    assert rules.POPULAR_FEATS == {}
    assert rules.CANTRIP_SWAP_CLASSES == frozenset()
    assert rules.SCHOLAR_SKILLS == []
    assert rules.EXTRA_SPELL_LISTS == {}
    assert rules.ALWAYS_PREPARED_CLASS == {}
    assert rules.ALWAYS_PREPARED_SOURCE == {}
    assert rules.UNARMORED_AC_SUBCLASS == {}
    assert not rules.mastery_weapon_ok("Fighter", "Martial Melee", ["Versatile"])
    assert rules.extra_spell_lists("Bard", 20) == []
    for key in ("weapon_mastery", "scholar", "divine_order", "primal_order", "blessed_strikes"):
        assert key not in rules.CHOICE_KINDS


def test_2014_numbers_for_hp_and_armor():
    """Hill Dwarf and Draconic HP, armor and swap tables."""
    assert rules.HP_PER_LEVEL_SPECIES == {"Hill Dwarf": 1}
    assert rules.HP_PER_LEVEL_SUBCLASS == {"Draconic Bloodline": 1}
    assert rules.UNARMORED_AC_BASE_SUBCLASS == {"Draconic Bloodline": 13}
    assert rules.SUBCLASS_ARMOR == {"Life Domain": ["heavy"]}
    assert rules.FIGHTING_STYLE_LEVEL == {"Fighter": 1, "Paladin": 2, "Ranger": 2}
    assert rules.SPELL_SWAP_CLASSES == {"Bard", "Ranger", "Sorcerer", "Warlock"}


# ── Class tables ──────────────────────────────────────────────────────────────


def test_every_class_has_a_table():
    """All 12 classes have a level 1-20 feature table."""
    assert set(rules.CLASS_LEVEL_FEATURES) == set(CLASSES)
    for cls, table in rules.CLASS_LEVEL_FEATURES.items():
        assert all(1 <= lvl <= 20 for lvl in table), cls
        assert all(names for names in table.values()), cls


def test_asi_levels():
    """4/8/12/16/19 for all; Fighter 6 and 14; Rogue 10; no Epic Boon."""
    for cls in CLASSES:
        assert {4, 8, 12, 16, 19} <= rules.asi_levels(cls), cls
    assert rules.asi_levels("Fighter") == {4, 6, 8, 12, 14, 16, 19}
    assert rules.asi_levels("Rogue") == {4, 8, 10, 12, 16, 19}
    assert rules.asi_levels("Wizard") == {4, 8, 12, 16, 19}
    every = [n for t in rules.CLASS_LEVEL_FEATURES.values() for ns in t.values() for n in ns]
    assert "Epic Boon" not in every


def test_subclass_arrives_at_its_level():
    """Subclass at 1 (Cleric, Sorcerer, Warlock), 2, or 3."""
    for cls, (sub, at) in SRD_SUBCLASSES.items():
        assert f"{cls} Subclass" in rules.features_at(cls, at), cls
        placeholders = [
            lvl
            for lvl, names in rules.CLASS_LEVEL_FEATURES[cls].items()
            if any(n.endswith(" Subclass") for n in names)
        ]
        assert placeholders == [at], cls
        assert min(rules.SUBCLASS_LEVEL_FEATURES[sub]) == at, sub
    assert set(rules.SUBCLASS_LEVEL_FEATURES) == {s for s, _ in SRD_SUBCLASSES.values()}


def test_known_features_by_level():
    """Spot checks of SRD 5.1 features at their levels."""
    assert rules.features_at("Paladin", 1) == ["Divine Sense", "Lay on Hands"]
    assert "Spellcasting" in rules.features_at("Paladin", 2)
    assert "Spellcasting" in rules.features_at("Ranger", 2)
    assert "Pact Boon" in rules.features_at("Warlock", 3)
    assert "Metamagic" in rules.features_at("Sorcerer", 3)
    assert rules.features_at("Fighter", 20) == ["Three Extra Attacks"]
    assert rules.SUBCLASS_LEVEL_FEATURES["Champion"][10] == ["Additional Fighting Style"]
    assert rules.SUBCLASS_LEVEL_FEATURES["Life Domain"][17] == ["Supreme Healing"]
    assert rules.features_at("Nobody", 3) == []


def test_every_feature_has_a_note():
    """No class or subclass feature lacks a plain-words note."""
    skip = {"Ability Score Improvement", "Subclass feature"}
    for cls, table in rules.CLASS_LEVEL_FEATURES.items():
        for names in table.values():
            for name in names:
                if name in skip or name.endswith(" Subclass"):
                    continue
                assert rules.feature_note(cls, name), (cls, name)
    for sub, table in rules.SUBCLASS_LEVEL_FEATURES.items():
        for names in table.values():
            for name in names:
                assert rules.feature_note("", name), (sub, name)
    assert "Wisdom" in rules.feature_note("Monk", "Unarmored Defense")
    assert "Constitution" in rules.feature_note("Barbarian", "Unarmored Defense")
    assert "thieves' tools" in rules.feature_note("Rogue", "Expertise")


# ── Feats ─────────────────────────────────────────────────────────────────────


def test_feats_are_grappler_the_asi_and_the_styles():
    """Grappler, the ASI row and six styles."""
    by_cat: dict[str, set[str]] = {}
    for f in rules.FEATS:
        by_cat.setdefault(f["category"], set()).add(f["name"])
        assert set(f) >= set(rules_2024.FEATS[0]), f["name"]  # every 2024 row key
        assert len(f["blurb"]) <= 120
    assert by_cat["general"] == {"Ability Score Improvement", "Grappler"}
    assert by_cat["fighting_style"] == {
        "Archery",
        "Defense",
        "Dueling",
        "Great Weapon Fighting",
        "Protection",
        "Two-Weapon Fighting",
    }
    assert "origin" not in by_cat
    grappler = rules.FEATS_BY_NAME["grappler"]
    assert grappler["prereq"] == {"any_ability": {"STR": 13}}
    assert grappler["asi_options"] is None and grappler["srd"]
    assert rules.FEATS_BY_NAME["defense"]["ac_bonus_in_armor"] == 1
    assert rules.FEATS_BY_NAME["ability score improvement"]["repeatable"]


def test_feat_qualifies():
    """Grappler needs STR 13; a style is never an improvement pick."""
    common = dict(is_caster=False, armor_training=set(), current_feats=[])
    low = dict.fromkeys(rules.ABILITIES, 10)
    grappler = rules.FEATS_BY_NAME["grappler"]
    ok, why = rules.feat_qualifies(grappler, scores=low, has_fighting_style=False, **common)
    assert not ok and why == "Needs STR 13+."
    strong = {**low, "STR": 13}
    ok, _ = rules.feat_qualifies(grappler, scores=strong, has_fighting_style=False, **common)
    assert ok
    ok, _ = rules.feat_qualifies(
        grappler,
        scores=strong,
        is_caster=False,
        armor_training=set(),
        has_fighting_style=False,
        current_feats=["Grappler"],
    )
    assert not ok  # not repeatable
    # A fighting style is never an improvement pick in 2014, even with the feature.
    archery = rules.FEATS_BY_NAME["archery"]
    ok, why = rules.feat_qualifies(archery, scores=low, has_fighting_style=True, **common)
    assert not ok and "Fighting Style feature" in why


def test_fighting_style_options_per_class():
    """Each class is offered only its own SRD styles."""
    names = {c: {o["name"] for o in rules.choice_options(c, "fighting_style")} for c in CLASSES}
    assert len(names["Fighter"]) == 6
    assert names["Paladin"] == {"Defense", "Dueling", "Great Weapon Fighting", "Protection"}
    assert names["Ranger"] == {"Archery", "Defense", "Dueling", "Two-Weapon Fighting"}
    assert names["Wizard"] == set()


# ── Class choices ─────────────────────────────────────────────────────────────


def test_choice_tables_are_consistent():
    """Every choice key has a kind; option kinds list options."""
    assert set(rules.CLASS_CHOICES) == set(CLASSES)
    keys = {k for t in rules.CLASS_CHOICES.values() for k in t}
    keys |= {k for t in rules.SUBCLASS_CHOICES.values() for k in t}
    assert keys == set(rules.CHOICE_KINDS)
    assert set(rules.SUBCLASS_CHOICES) <= set(rules.SUBCLASS_LEVEL_FEATURES)
    for key, spec in rules.CHOICE_KINDS.items():
        assert spec["kind"] in {"feat", "option", "expertise", "skill", "spell"}, key
        if spec["kind"] == "option":
            assert rules.choice_options("Warlock", key), key
        if spec["kind"] == "spell":
            assert spec["book"] and "spell" in spec, key


def test_warlock_invocation_counts():
    """Invocations known: 2/3/4/5/6/7/8 at 2/5/7/9/12/15/18."""
    known = {1: 0, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 4, 8: 4, 9: 5, 10: 5, 11: 5}
    known |= {12: 6, 13: 6, 14: 6, 15: 7, 16: 7, 17: 7, 18: 8, 19: 8, 20: 8}
    for level, n in known.items():
        assert rules.class_choice_counts("Warlock", level).get("invocations", 0) == n, level
        assert (_at(_scale("Warlock", "Eldritch Invocations"), level) or 0) == n, level


def test_invocations_match_the_srd():
    """The 32 SRD invocations with their prerequisites."""
    by_name = {o["name"]: o for o in rules.INVOCATIONS}
    assert len(by_name) == 32
    assert by_name["Agonizing Blast"].get("cantrip") == "Eldritch Blast"
    assert by_name["Thirsting Blade"]["level"] == 5
    assert by_name["Thirsting Blade"]["requires"] == "Pact of the Blade"
    assert by_name["Lifedrinker"]["level"] == 12
    assert by_name["Chains of Carceri"]["requires"] == "Pact of the Chain"
    assert by_name["Book of Ancient Secrets"]["requires"] == "Pact of the Tome"
    assert by_name["Witch Sight"]["level"] == 15
    assert "level" not in by_name["Devil's Sight"]
    pacts = {o["name"] for o in rules.choice_options("Warlock", "pact_boon")}
    assert pacts == {"Pact of the Chain", "Pact of the Blade", "Pact of the Tome"}
    assert {o["requires"] for o in rules.INVOCATIONS if o.get("requires")} <= pacts


def test_pact_boon_at_3():
    """The Pact Boon is chosen at Warlock 3."""
    assert "pact_boon" not in rules.class_choice_counts("Warlock", 2)
    assert rules.class_choice_counts("Warlock", 3)["pact_boon"] == 1
    assert rules.class_choice_counts("Warlock", 20)["pact_boon"] == 1


def test_metamagic_counts():
    """Metamagic: 2 at 3, 3 at 10, 4 at 17; the 8 SRD 5.1 options."""
    assert "metamagic" not in rules.class_choice_counts("Sorcerer", 2)
    for level, n in {3: 2, 9: 2, 10: 3, 16: 3, 17: 4, 20: 4}.items():
        assert rules.class_choice_counts("Sorcerer", level)["metamagic"] == n, level
    assert len(rules.METAMAGIC) == 8
    assert "Seeking Spell" not in {o["name"] for o in rules.METAMAGIC}  # 2024 only


def test_sorcerer_dragon_ancestor_at_1():
    """Draconic Bloodline picks a dragon at Sorcerer 1."""
    assert rules.class_choice_counts("Sorcerer", 1) == {}
    assert rules.class_choice_counts("Sorcerer", 1, "Draconic Bloodline") == {"dragon_ancestor": 1}
    dragons = {
        o["name"]: o["damage_type"] for o in rules.choice_options("Sorcerer", "dragon_ancestor")
    }
    assert len(dragons) == 10
    assert dragons["Red"] == "fire" and dragons["Silver"] == "cold" and dragons["Green"] == "poison"


def test_expertise_and_ranger_choices():
    """Expertise, Favored Enemy and Natural Explorer counts."""
    assert rules.class_choice_counts("Rogue", 1)["expertise"] == 2
    assert rules.class_choice_counts("Rogue", 6)["expertise"] == 4
    assert "expertise" not in rules.class_choice_counts("Bard", 2)
    assert rules.class_choice_counts("Bard", 3)["expertise"] == 2
    assert rules.class_choice_counts("Bard", 10)["expertise"] == 4
    ranger = {lvl: rules.class_choice_counts("Ranger", lvl) for lvl in (1, 2, 6, 10, 14)}
    assert ranger[1] == {"favored_enemy": 1, "natural_explorer": 1}
    assert ranger[2]["fighting_style"] == 1
    assert (ranger[6]["favored_enemy"], ranger[6]["natural_explorer"]) == (2, 2)
    assert (ranger[10]["favored_enemy"], ranger[10]["natural_explorer"]) == (2, 3)
    assert ranger[14]["favored_enemy"] == 3
    assert len(rules.choice_options("Ranger", "favored_enemy")) == 14
    assert len(rules.choice_options("Ranger", "natural_explorer")) == 7


def test_subclass_choices():
    """Hunter, Champion, Land and Lore choices at their levels."""
    hunter = {lvl: rules.class_choice_counts("Ranger", lvl, "Hunter") for lvl in (3, 7, 11, 15)}
    assert "hunters_prey" in hunter[3] and "defensive_tactics" not in hunter[3]
    assert hunter[7]["defensive_tactics"] == 1
    assert hunter[11]["multiattack"] == 1
    assert hunter[15]["superior_hunters_defense"] == 1
    prey = {o["name"] for o in rules.choice_options("Ranger", "hunters_prey")}
    assert prey == {"Colossus Slayer", "Giant Killer", "Horde Breaker"}
    assert rules.class_choice_counts("Fighter", 9, "Champion")["fighting_style"] == 1
    assert rules.class_choice_counts("Fighter", 10, "Champion")["fighting_style"] == 2
    assert rules.class_choice_counts("Druid", 2, "Circle of the Land") == {"land": 1}
    assert rules.class_choice_counts("Bard", 3, "College of Lore")["bonus_proficiencies"] == 3
    lore6 = rules.class_choice_counts("Bard", 6, "College of Lore")
    assert lore6["additional_magical_secrets"] == 2


def test_spell_choices():
    """Magical Secrets and Mystic Arcanum counts and spell specs."""
    bard = {
        lvl: rules.class_choice_counts("Bard", lvl).get("magical_secrets", 0)
        for lvl in (9, 10, 14, 18)
    }
    assert bard == {9: 0, 10: 2, 14: 4, 18: 6}
    arcanum = {
        lvl: rules.class_choice_counts("Warlock", lvl).get("mystic_arcanum", 0)
        for lvl in (10, 11, 13, 15, 17)
    }
    assert arcanum == {10: 0, 11: 1, 13: 2, 15: 3, 17: 4}
    assert rules.CHOICE_KINDS["mystic_arcanum"]["spell"]["levels"] == [6, 7, 8, 9]
    assert rules.CHOICE_KINDS["magical_secrets"]["spell"]["known"] is True
    assert rules.CHOICE_KINDS["additional_magical_secrets"]["spell"]["known"] is False


# ── Spells that come with a subclass ──────────────────────────────────────────


def test_life_domain_spells():
    """Life Domain spells are always prepared from Cleric 1."""
    assert rules.always_prepared("Cleric", 1, "Life Domain") == [
        ("Bless", "Life Domain"),
        ("Cure Wounds", "Life Domain"),
    ]
    at9 = [name for name, _src in rules.always_prepared("Cleric", 9, "Life Domain")]
    assert len(at9) == 10
    assert {"Guardian of Faith", "Raise Dead", "Spiritual Weapon"} <= set(at9)
    assert rules.always_prepared("Cleric", 1, None) == []


def test_oath_and_circle_spells():
    """Devotion and Circle of the Land spells by level and land."""
    devotion = rules.always_prepared("Paladin", 3, "Oath of Devotion")
    assert [n for n, _ in devotion] == ["Protection from Evil and Good", "Sanctuary"]
    assert len(rules.always_prepared("Paladin", 17, "Oath of Devotion")) == 10
    assert set(rules.LAND_SPELLS) == {
        "Arctic",
        "Coast",
        "Desert",
        "Forest",
        "Grassland",
        "Mountain",
        "Swamp",
    }
    assert rules.always_prepared("Druid", 2, "Circle of the Land", "Forest") == []
    forest = rules.always_prepared("Druid", 3, "Circle of the Land", "Forest")
    assert forest == [
        ("Barkskin", "Circle of the Land (Forest)"),
        ("Spider Climb", "Circle of the Land (Forest)"),
    ]
    # The land pick brings the circle's Bonus Cantrip with it.
    for opt in rules.choice_options("Druid", "land"):
        assert opt["cantrips"] == {"count": 1, "list": "Druid"}


def test_fiend_expanded_spells_are_choices_not_prepared():
    """Fiend spells widen the list only."""
    assert rules.always_prepared("Warlock", 9, "The Fiend") == []
    assert rules.expanded_spells("The Fiend", 1) == ["Burning Hands", "Command"]
    at9 = rules.expanded_spells("The Fiend", 9)
    assert len(at9) == 10 and at9[-2:] == ["Flame Strike", "Hallow"]
    assert rules.expanded_spells("Hunter", 9) == []
    assert rules.expanded_spells(None, 9) == []


# ── Numbers by level ──────────────────────────────────────────────────────────


def test_class_scales_spot_checks():
    """Rages, Sneak Attack, Ki, Martial Arts, Channel Divinity."""
    rages = _scale("Barbarian", "Rages")
    assert [_at(rages, lvl) for lvl in (1, 3, 6, 12, 17, 19)] == [2, 3, 4, 5, 6, 6]
    assert _at(rages, 20) == "Unlimited"
    sneak = _scale("Rogue", "Sneak Attack")
    assert _at(sneak, 1) == "1d6" and _at(sneak, 19) == "10d6" and _at(sneak, 20) == "10d6"
    ki = _scale("Monk", "Ki points")
    assert _at(ki, 1) is None
    assert all(_at(ki, lvl) == lvl for lvl in range(2, 21))
    martial = _scale("Monk", "Martial Arts die")
    assert [_at(martial, lvl) for lvl in (1, 5, 11, 17)] == ["d4", "d6", "d8", "d10"]
    channel = _scale("Cleric", "Channel Divinity uses")
    assert [_at(channel, lvl) for lvl in (1, 2, 6, 18)] == [None, 1, 2, 3]
    wild = _scale("Druid", "Wild Shape max CR")
    assert _at(wild, 7).startswith("1/2") and _at(wild, 8) == "1"


def test_scaling_notes():
    """Level-up number changes read as 'X: a → b' lines."""
    barb = rules.scaling_notes("Barbarian", 19, 20, is_caster=False)
    assert "Rages: 6 → Unlimited" in barb
    lock = rules.scaling_notes("Warlock", 4, 5, is_caster=True)
    assert "Eldritch Invocations: 2 → 3" in lock
    assert any(n.startswith("Proficiency bonus: +2 → +3") for n in lock)
    assert any("cantrip" in n for n in lock)
    rogue = rules.scaling_notes("Rogue", 4, 5, is_caster=False)
    assert "Sneak Attack: 2d6 → 3d6" in rogue
    wizard = rules.scaling_notes("Wizard", 1, 2, is_caster=True)
    assert any("spellbook" in n for n in wizard)


# ── Agreement with the 2014 character options (agent D1's module) ─────────────


def test_names_match_the_2014_options():
    """Subclass and subrace names agree with D1's module."""
    srd = pytest.importorskip("integrations.dnd_rules.srd_character_options_2014")
    for cls, row in srd.CLASSES.items():
        assert row["subclass_level"] == SRD_SUBCLASSES[cls][1], cls
        for sub in row["srd_subclasses"]:
            assert sub in rules.SUBCLASS_LEVEL_FEATURES, sub
    subraces = {s["name"] for sp in srd.SPECIES for s in sp.get("subraces") or []}
    assert set(rules.HP_PER_LEVEL_SPECIES) <= subraces
