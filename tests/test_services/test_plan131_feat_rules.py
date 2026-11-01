"""Plan 131 — feat_rules reads the 2014 tables when asked (ruleset="2014").

Feats (ASI or Grappler), fighting styles, the Life Domain's heavy armor, no Weapon
Mastery, and the 2014 Warlock's invocations, which need a Pact Boon (its own choice) or
the Eldritch Blast cantrip.
"""

from types import SimpleNamespace

import pytest

from domain.level_up import FeatChoice
from services import feat_rules


def _cantrip(name: str, damage: bool = True, attack: bool = True) -> SimpleNamespace:
    """A stand-in Spell row: only the fields the prerequisite checks read."""
    return SimpleNamespace(
        name=name, damage_dice="1d10" if damage else None, attack_type="ranged" if attack else None
    )


def _choose(level: int, picks: dict, cantrips=(), feats=None, subclass="The Fiend"):
    feats = list(feats or [])
    summary: list[str] = []
    warnings: list[str] = []
    feat_rules.apply_class_choices(
        "Warlock",
        level,
        subclass,
        picks,
        feats,
        {},
        list(cantrips),
        summary,
        warnings,
        ruleset="2014",
    )
    return feats


def test_2014_feat_options_offer_asi_and_grappler_only():
    """A 2014 ASI level offers the improvement or Grappler; fighting styles are locked there."""
    opts = feat_rules.feat_options(
        "Fighter",
        4,
        {"STR": 15, "DEX": 12, "CON": 14, "INT": 10, "WIS": 10, "CHA": 8},
        [],
        None,
        ruleset="2014",
    )
    ok = {o.name for o in opts if o.ok}
    assert ok == {"Ability Score Improvement", "Grappler"}
    weak = feat_rules.feat_options(
        "Wizard",
        4,
        {"STR": 8, "DEX": 14, "CON": 14, "INT": 16, "WIS": 10, "CHA": 10},
        [],
        None,
        ruleset="2014",
    )
    assert not next(o for o in weak if o.name == "Grappler").ok  # STR 13 needed


def test_2014_asi_pick_applies():
    """The +2 improvement works the same in 2014."""
    opts = feat_rules.feat_options(
        "Fighter", 4, {a: 14 for a in ("STR", "DEX", "CON", "INT", "WIS", "CHA")}, [], None, "2014"
    )
    feats: list[str] = []
    inc, spells, _ = feat_rules.apply_feat(
        FeatChoice(name="Ability Score Improvement", asi={"STR": 2}),
        opts,
        feats,
        [],
        {},
        {},
        [],
        [],
        ruleset="2014",
    )
    assert inc == {"STR": 2} and spells == [] and feats == []


def test_2014_armor_mastery_and_casters():
    """Life Domain adds heavy armor; 2014 has no Weapon Mastery; casters by class table."""
    assert "heavy" in feat_rules.armor_training("Cleric", [], "2014", "Life Domain")
    assert "heavy" not in feat_rules.armor_training("Cleric", [], "2014")
    assert "heavy" not in feat_rules.armor_training("Cleric", [], "2024", "Life Domain")
    assert feat_rules.mastery_weapons("2014") == []
    assert feat_rules.mastery_weapons()  # 2024 unchanged
    assert feat_rules.is_caster("Paladin", None, "2014")
    assert not feat_rules.is_caster("Barbarian", None, "2014")
    assert feat_rules.hp_bonus_per_level("Hill Dwarf", None, [], "2014") == 1
    assert feat_rules.hp_bonus_per_level("Mountain Dwarf", "Draconic Bloodline", [], "2014") == 1


def test_2014_fighting_style_choice():
    """A 2014 Fighter 1 picks one of the six styles; it lands in feats by name."""
    feats: list[str] = []
    feat_rules.apply_class_choices(
        "Fighter", 1, None, {"fighting_style": (["Defense"], [])}, feats, {}, [], [], [], "2014"
    )
    assert "Defense" in feats
    with pytest.raises(ValueError, match="choose one"):
        feat_rules.apply_class_choices("Fighter", 1, None, {}, [], {}, [], [], [], "2014")


def test_2014_invocations_need_their_pact_boon():
    """Thirsting Blade needs Pact of the Blade: picked now, or recorded from an earlier level."""
    feats = _choose(
        5,
        {
            "pact_boon": (["Pact of the Blade"], []),
            "invocations": (["Thirsting Blade", "Devil's Sight", "Mask of Many Faces"], []),
        },
    )
    assert "Pact Boon: Pact of the Blade" in feats
    with pytest.raises(ValueError, match="needs Pact of the Blade"):
        _choose(
            5,
            {
                "pact_boon": (["Pact of the Tome"], []),
                "invocations": (["Thirsting Blade", "Devil's Sight", "Mask of Many Faces"], []),
            },
        )


def test_2014_invocations_need_eldritch_blast():
    """Agonizing Blast needs the Eldritch Blast cantrip itself, not just any damage cantrip."""
    picks = {
        "pact_boon": (["Pact of the Chain"], []),
        "invocations": (["Agonizing Blast", "Devil's Sight"], []),
    }
    with pytest.raises(ValueError, match="Eldritch Blast"):
        _choose(3, picks, cantrips=[_cantrip("Chill Touch")])
    feats = _choose(3, picks, cantrips=[_cantrip("Eldritch Blast")])
    assert "Eldritch Invocation: Agonizing Blast" in feats or any(
        "Agonizing Blast" in f for f in feats
    )
