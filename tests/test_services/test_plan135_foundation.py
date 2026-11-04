"""Plan 135 foundation — race speeds and natural weapons, subclass counters, homebrew feats.

James (beta, 11/4) wanted races with fly/swim/climb speeds and claws, subclass counters like
Superiority Dice whose die grows, and feats of his own (Sharpshooter's −5/+10 baked in). These
tests cover the stored shapes, the builder copying a race's speeds onto the sheet, and the feat
catalog's ownership, name and in-use rules.
"""

import uuid

import pytest
from pydantic import ValidationError

import services.campaign_service as camp_svc
import services.homebrew_service as hb_svc
from domain.character import PlayerCharacterUpdate
from domain.character_builder import CharacterBuild
from domain.homebrew import (
    HomebrewConflictError,
    HomebrewFeatCreate,
    HomebrewFeatUpdate,
    HomebrewRaceCreate,
    HomebrewSubclassCreate,
    SubclassResource,
)
from services import character_builder_service as builder
from services import character_service

STANDARD = {"STR": 15, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10}
KIT_2014 = "Chain mail, longsword & shield, light crossbow"
SUPERIORITY = {
    "name": "Superiority Dice",
    "level": 3,
    "recovery": "short",
    "uses": {"3": 4, "7": 5, "15": 6},
    "die": {"3": "d8", "10": "d10", "18": "d12"},
}


def _dm() -> str:
    """A fresh DM email."""
    return f"dm135_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, ruleset: str = "2014", dm: str | None = None):
    """A campaign for ``dm`` (a fresh one if None) in ``ruleset``."""
    return camp_svc.create_campaign(
        db, name="Hyrule", setting="R", tone="T", dm_email=dm or _dm(), ruleset=ruleset
    )


def _zora(db, dm: str):
    """A 2014 race with swim 40, climb 0 (dropped) and a natural weapon."""
    return hb_svc.create_race(
        db,
        HomebrewRaceCreate(
            name="Zora",
            ruleset="2014",
            ability_bonuses={"DEX": 2, "CHA": 1},
            speeds={"swim": 40, "climb": 0},
            natural_weapons=[
                {
                    "name": "Fin Blades",
                    "damage": "1D6",
                    "damage_type": "Slashing",
                    "ability": "best",
                }
            ],
        ),
        dm,
    )


# ── Races ───────────────────────────────────────────────────────────────────


def test_race_keeps_speeds_and_natural_weapons(duckdb_session):
    """Speeds are cleaned (0 dropped, keys in order) and weapons normalised."""
    race = _zora(duckdb_session, _dm())
    assert race.speeds == {"swim": 40}
    weapon = race.natural_weapons[0]
    assert (weapon.damage, weapon.damage_type, weapon.ability) == ("1d6", "slashing", "best")


@pytest.mark.parametrize(
    "speeds",
    [{"teleport": 30}, {"fly": 33}, {"fly": 125}, {"swim": "fast"}],
)
def test_bad_speeds_are_refused(speeds):
    """Unknown kinds, odd feet and out-of-range values are 422s."""
    with pytest.raises(ValidationError):
        HomebrewRaceCreate(name="Bird", speeds=speeds)


@pytest.mark.parametrize(
    "weapon",
    [
        {"name": "Bite", "damage": "1d7", "damage_type": "piercing"},
        {"name": "Bite", "damage": "1d6", "damage_type": "sharp"},
        {"name": "Bite", "damage": "1d6", "damage_type": "piercing", "ability": "CON"},
    ],
)
def test_bad_natural_weapons_are_refused(weapon):
    """Odd dice, unknown damage types and other abilities are 422s."""
    with pytest.raises(ValidationError):
        HomebrewRaceCreate(name="Lizard", natural_weapons=[weapon])


def test_builder_copies_race_speeds_to_the_sheet(duckdb_session):
    """A PC built as a Zora has swim 40 on its sheet; an SRD race has none."""
    dm = _dm()
    c = _campaign(duckdb_session, dm=dm)
    _zora(duckdb_session, dm)
    build = dict(
        character_name="Mipha",
        player_name="James",
        character_class="Fighter",
        background="Acolyte",
        level=1,
        scores=dict(STANDARD),
        score_method="standard",
        skills=["Athletics", "Survival"],
        kit=KIT_2014,
    )
    res = builder.create(duckdb_session, c.id, CharacterBuild(species="Zora", **build))
    pc = character_service.get_character(duckdb_session, uuid.UUID(res.pc_id), dm)
    assert pc.speeds == {"swim": 40}
    res = builder.create(
        duckdb_session, c.id, CharacterBuild(species="Human", **{**build, "character_name": "B"})
    )
    pc = character_service.get_character(duckdb_session, uuid.UUID(res.pc_id), dm)
    assert pc.speeds is None


def test_sheet_speeds_validate_on_update():
    """The sheet's edit form uses the same speed rules; {} clears them."""
    assert PlayerCharacterUpdate(speeds={"fly": 30}).speeds == {"fly": 30}
    assert PlayerCharacterUpdate(speeds={}).speeds is None
    with pytest.raises(ValidationError):
        PlayerCharacterUpdate(speeds={"fly": 7})


# ── Subclass counters ───────────────────────────────────────────────────────


def test_counter_uses_and_die_follow_level():
    """Superiority Dice: none at 2; 4×d8 at 3; 5×d10 at 10; 6×d12 at 18."""
    res = SubclassResource(**SUPERIORITY)
    assert res.state_at(2, {}, 2) is None
    assert res.state_at(3, {}, 2) == (4, "d8")
    assert res.state_at(10, {}, 4) == (5, "d10")
    assert res.state_at(18, {}, 6) == (6, "d12")


@pytest.mark.parametrize(
    ("formula", "expected"),
    [("prof_bonus", 3), ("prof_x2", 6), ("level", 6), ("half_level", 3), ("WIS", 3), ("CHA", 1)],
)
def test_counter_formulas(formula, expected):
    """A formula follows the PC: level 6, proficiency +3, WIS 16, CHA 8 (at least 1)."""
    res = SubclassResource(name="Pool", level=1, uses_formula=formula)
    assert res.state_at(6, {"WIS": 16, "CHA": 8}, 3) == (expected, None)


@pytest.mark.parametrize(
    "bad",
    [
        {"name": "X", "level": 3, "uses": {"4": 2}},
        {"name": "X", "uses": {"3": 2}, "uses_formula": "level"},
        {"name": "X"},
        {"name": "X", "uses": {"3": 0}},
        {"name": "X", "uses": {"3": 2}, "die": {"3": "d7"}},
    ],
)
def test_bad_counters_are_refused(bad):
    """A table must start at the counter's level; one source of uses; sane numbers."""
    with pytest.raises(ValidationError):
        SubclassResource(**bad)


def test_subclass_keeps_its_counters(duckdb_session):
    """A subclass saves counters; two with one name are refused."""
    sub = hb_svc.create_subclass(
        duckdb_session,
        HomebrewSubclassCreate(
            name="Sheikah Blade", character_class="Fighter", resources=[SUPERIORITY]
        ),
        _dm(),
    )
    assert sub.resources[0].die == {"3": "d8", "10": "d10", "18": "d12"}
    with pytest.raises(ValidationError):
        HomebrewSubclassCreate(
            name="Twice", character_class="Fighter", resources=[SUPERIORITY, SUPERIORITY]
        )


# ── Feats ───────────────────────────────────────────────────────────────────


def _deadeye(db, dm: str, **extras):
    """A 2014 feat: +1 DEX, −5/+10 with ranged weapons."""
    payload = {
        "name": "Deadeye",
        "ruleset": "2014",
        "blurb": "Long shots and hard hits.",
        "description": "Your ranged attacks can take −5 to hit for +10 damage.",
        "asi_options": ["dex"],
        "power_attack": {"to_hit": -5, "damage": 10, "weapons": "ranged"},
    }
    payload.update(extras)
    return hb_svc.create_feat(db, HomebrewFeatCreate(**payload), dm)


def test_feat_round_trip(duckdb_session):
    """Create, list (own only), update and delete a feat."""
    dm = _dm()
    feat = _deadeye(duckdb_session, dm)
    assert feat.asi_options == ["DEX"]
    assert feat.power_attack.weapons == "ranged"
    assert [f.name for f in hb_svc.list_feats(duckdb_session, dm)] == ["Deadeye"]
    assert hb_svc.list_feats(duckdb_session, _dm()) == []
    changed = hb_svc.update_feat(
        duckdb_session, feat.id, HomebrewFeatUpdate(power_attack=None, asi_options="any"), dm
    )
    assert changed.power_attack is None and changed.asi_options == "any"
    hb_svc.delete_feat(duckdb_session, feat.id, dm)
    assert hb_svc.list_feats(duckdb_session, dm) == []


def test_asi_options_all_six_is_any():
    """Listing all six abilities is the same as "any"; an empty list is none."""
    six = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
    assert HomebrewFeatCreate(name="X", asi_options=six).asi_options == "any"
    assert HomebrewFeatCreate(name="X", asi_options=[]).asi_options is None


@pytest.mark.parametrize("name", ["Grappler", "sharpshooter", "Ability Score Improvement"])
def test_feat_names_of_the_rules_are_refused(duckdb_session, name):
    """A rules feat of either edition can't be a homebrew name."""
    with pytest.raises(HomebrewConflictError):
        _deadeye(duckdb_session, _dm(), name=name)


def test_feat_name_unique_per_dm(duckdb_session):
    """One DM can't have two Deadeyes; another DM can have their own."""
    dm = _dm()
    _deadeye(duckdb_session, dm)
    with pytest.raises(HomebrewConflictError):
        _deadeye(duckdb_session, dm, name="deadeye")
    _deadeye(duckdb_session, _dm())


def test_feat_in_use_cant_be_deleted_or_renamed(duckdb_session):
    """A PC with "Deadeye (Longbow)" blocks delete and rename; others' PCs don't."""
    dm = _dm()
    c = _campaign(duckdb_session, dm=dm)
    feat = _deadeye(duckdb_session, dm)
    pc = character_service.create_character(
        duckdb_session,
        campaign_id=c.id,
        dm_email=dm,
        player_name="P",
        character_name="Sheik",
        race="Human",
        character_class="Ranger",
        level=4,
        score_str=10,
        score_dex=16,
        score_con=12,
        score_int=10,
        score_wis=14,
        score_cha=10,
        hp_max=30,
        hp_current=30,
        ac=14,
        feats=["Deadeye (Longbow)"],
    )
    assert pc.feats == ["Deadeye (Longbow)"]
    with pytest.raises(HomebrewConflictError, match="Sheik"):
        hb_svc.delete_feat(duckdb_session, feat.id, dm)
    with pytest.raises(HomebrewConflictError, match="renamed"):
        hb_svc.update_feat(duckdb_session, feat.id, HomebrewFeatUpdate(name="Hawkeye"), dm)
    with pytest.raises(HomebrewConflictError, match="2014"):
        hb_svc.update_feat(duckdb_session, feat.id, HomebrewFeatUpdate(ruleset="2024"), dm)
    hb_svc.update_feat(duckdb_session, feat.id, HomebrewFeatUpdate(blurb="Sharper."), dm)


def test_other_dms_cant_change_a_feat(duckdb_session):
    """Only the author (or an admin) edits or deletes."""
    feat = _deadeye(duckdb_session, _dm())
    with pytest.raises(PermissionError):
        hb_svc.update_feat(duckdb_session, feat.id, HomebrewFeatUpdate(blurb="Mine now."), _dm())
    with pytest.raises(PermissionError):
        hb_svc.delete_feat(duckdb_session, feat.id, _dm())


def test_feats_for_campaign_and_feat_for(duckdb_session):
    """A 2014 campaign sees its DM's 2014 and both-editions feats, not 2024-only or others'."""
    dm = _dm()
    _deadeye(duckdb_session, dm)
    _deadeye(duckdb_session, dm, name="Brawler", ruleset=None, power_attack=None)
    _deadeye(duckdb_session, dm, name="Gunner", ruleset="2024")
    _deadeye(duckdb_session, _dm(), name="Stranger")
    c = _campaign(duckdb_session, dm=dm)
    names = [f.name for f in hb_svc.feats_for_campaign(duckdb_session, c)]
    assert names == ["Brawler", "Deadeye"]
    assert hb_svc.feat_for(duckdb_session, c, "deadeye (Longbow)").name == "Deadeye"
    assert hb_svc.feat_for(duckdb_session, c, "Gunner") is None
    assert hb_svc.feat_for(duckdb_session, c, "Grappler") is None
