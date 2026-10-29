"""Level-up rules data (Plan 115): class tables, feats, and scaling notes stay coherent."""

from integrations.dnd_rules import levelup_2024 as rules
from integrations.dnd_rules import srd_character_options_2024 as srd


def test_every_class_has_a_table_with_asi_at_4():
    for name in srd.CLASSES:
        assert name in rules.CLASS_LEVEL_FEATURES
        assert 4 in rules.asi_levels(name)
        assert all(1 <= lvl <= 20 for lvl in rules.CLASS_LEVEL_FEATURES[name])


def test_extra_asi_levels():
    assert {6, 14} <= rules.asi_levels("Fighter")
    assert 10 in rules.asi_levels("Rogue")
    assert rules.asi_levels("Druid") == {4, 8, 12, 16, 19}


def test_feats_are_well_formed():
    names = [f["name"] for f in rules.FEATS]
    assert len(names) == len(set(names))
    for f in rules.FEATS:
        assert f["category"] in {"general", "fighting_style", "origin"}
        opts = f["asi_options"]
        assert opts is None or opts == "any" or set(opts) <= set(rules.ABILITIES)
        assert len(f["blurb"]) <= 120
    for cls, picks in rules.POPULAR_FEATS.items():
        assert cls in srd.CLASSES
        assert all(p.casefold() in rules.FEATS_BY_NAME for p in picks), cls


def test_origin_feats_match_the_creator():
    creator = {f["name"] for f in srd.ORIGIN_FEATS}
    ours = {f["name"] for f in rules.FEATS if f["category"] == "origin"}
    assert creator == ours


def test_qualifies():
    actor = rules.FEATS_BY_NAME["actor"]
    common = dict(is_caster=False, armor_training=set(), has_fighting_style=False)
    low = dict.fromkeys(rules.ABILITIES, 10)
    ok, why = rules.feat_qualifies(actor, scores=low, current_feats=[], **common)
    assert not ok and why == "Needs CHA 13+."
    ok, _ = rules.feat_qualifies(actor, scores={**low, "CHA": 13}, current_feats=[], **common)
    assert ok
    adept = rules.FEATS_BY_NAME["elemental adept"]
    ok, _ = rules.feat_qualifies(
        adept, scores=low, current_feats=["Elemental Adept (Fire)"], **{**common, "is_caster": True}
    )
    assert ok  # repeatable


def test_scaling_notes():
    rogue = rules.scaling_notes("Rogue", 4, 5, is_caster=False)
    assert "Sneak Attack: 2d6 → 3d6" in rogue
    assert any(n.startswith("Proficiency bonus: +2 → +3") for n in rogue)
    druid = rules.scaling_notes("Druid", 3, 4, is_caster=True)
    assert "Wild Shape forms known: 4 → 6" in druid
    assert not any("cantrip" in n for n in druid)
    assert any("cantrip" in n for n in rules.scaling_notes("Sorcerer", 4, 5, is_caster=True))
