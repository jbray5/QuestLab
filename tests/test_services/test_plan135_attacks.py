"""Plan 135 (RA) — natural weapons as attacks, and the power-attack toggle.

James (beta, 11/4) wanted a homebrew race's claws and bites to show as attacks without making
a homebrew weapon, and Sharpshooter's −5/+10 baked in. A homebrew race's natural weapons are
worked out like a weapon (always proficient); a homebrew feat's ``power_attack`` trade rides
on the attacks it fits, as a toggle the sheet and the phone show.
"""

import uuid

import pytest

import services.attack_service as atk
import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.homebrew_service as hb_svc
import services.inventory_service as inv_svc
import services.item_service as item_svc
import services.player_service as play_svc
from db.repos.character_repo import CharacterRepo
from domain.character import CharacterItemCreate
from domain.enums import CharacterClass, ItemRarity
from domain.homebrew import HomebrewFeatCreate, HomebrewRaceCreate, NaturalWeapon, PowerAttack
from domain.item import ItemCreate

CLAWS = {"name": "Claws", "damage": "1d6", "damage_type": "slashing", "ability": "STR"}


def _dm() -> str:
    """A fresh DM email."""
    return f"dm135ra_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm: str, ruleset: str = "2014"):
    """A campaign run by ``dm`` on ``ruleset``."""
    return camp_svc.create_campaign(db, name="Hyrule", dm_email=dm, ruleset=ruleset)


def _race(db, dm: str, name: str = "Lizardfolk", weapons=None, ruleset: str | None = None):
    """A homebrew race with Claws 1d6 slashing (STR) unless told otherwise."""
    return hb_svc.create_race(
        db,
        HomebrewRaceCreate(
            name=name,
            ruleset=ruleset,
            natural_weapons=[CLAWS] if weapons is None else weapons,
        ),
        dm,
    )


def _feat(db, dm: str, name: str = "Deadeye", weapons: str = "ranged", ruleset="2014"):
    """A homebrew feat with a −5/+10 trade on ``weapons``."""
    return hb_svc.create_feat(
        db,
        HomebrewFeatCreate(
            name=name,
            ruleset=ruleset,
            power_attack={"to_hit": -5, "damage": 10, "weapons": weapons},
        ),
        dm,
    )


def _pc(db, campaign, dm: str, race: str = "Lizardfolk", feats=None, **scores):
    """A level 1 fighter (STR 16, DEX 12 unless told otherwise), as the ORM row."""
    stats = {"score_str": 16, "score_dex": 12} | scores
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="James",
        character_name=f"Hero {uuid.uuid4().hex[:4]}",
        race=race,
        character_class=CharacterClass.FIGHTER,
        level=stats.pop("level", 1),
        score_con=14,
        score_int=10,
        score_wis=10,
        score_cha=8,
        hp_max=12,
        hp_current=12,
        ac=16,
        feats=feats,
        **stats,
    )
    return CharacterRepo.get_by_id(db, pc.id)


def _weapon(db, name: str, category: str, die: str, props: list[str]):
    """A mundane weapon item (a unique name per test run)."""
    return item_svc.create_item(
        db,
        ItemCreate(
            name=f"{name} {uuid.uuid4().hex[:6]}",
            rarity=ItemRarity.COMMON,
            item_type="Weapon",
            value_gp=10,
            weapon_category=category,
            damage_die=die,
            damage_type="slashing" if "Melee" in category else "piercing",
            weapon_properties=props,
        ),
    )


def _longbow(db):
    """Martial Ranged, 1d8, Heavy and Two-Handed."""
    return _weapon(db, "Longbow", "Martial Ranged", "1d8", ["Ammunition", "Heavy", "Two-Handed"])


def _longsword(db):
    """Martial Melee, 1d8, Versatile."""
    return _weapon(db, "Longsword", "Martial Melee", "1d8", ["Versatile"])


def _greatsword(db):
    """Martial Melee, 2d6, Heavy and Two-Handed."""
    return _weapon(db, "Greatsword", "Martial Melee", "2d6", ["Heavy", "Two-Handed"])


# ── Natural weapons ─────────────────────────────────────────────────────────


def test_claws_for_a_str_16_level_1_pc(duckdb_session):
    """Claws 1d6 slashing (STR) on a STR 16, level 1 PC: +5 to hit, 1d6+3 slashing."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _race(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm)
    [claws] = atk.natural_attacks(duckdb_session, pc)
    assert (claws.name, claws.ability, claws.hit_bonus) == ("Claws", "STR", 5)
    assert (claws.damage_roll, claws.damage_type) == ("1d6+3", "slashing")
    assert claws.power_attack is None


def test_best_picks_the_higher_and_flat_damage_adds_the_modifier():
    """ "best" takes DEX when it is higher; a flat "1" deals 1 + the modifier."""
    pc = type("Pc", (), {"score_str": 10, "score_dex": 18, "level": 5})()
    bite = NaturalWeapon(name="Beak", damage="1d8", damage_type="piercing", ability="best")
    attack = atk.natural_attack(bite, pc)
    assert (attack.ability, attack.hit_bonus, attack.damage_roll) == ("DEX", 7, "1d8+4")
    strong = type("Pc", (), {"score_str": 16, "score_dex": 12, "level": 1})()
    assert atk.natural_attack(bite, strong).ability == "STR"
    talons = NaturalWeapon(name="Talons", damage="1", damage_type="slashing")
    assert atk.natural_attack(talons, strong).damage_roll == "4"
    weak = type("Pc", (), {"score_str": 6, "score_dex": 12, "level": 1})()
    assert atk.natural_attack(talons, weak).damage_roll == "1"  # never below 1


def test_srd_race_and_no_race_have_no_natural_attacks(duckdb_session):
    """A Human (SRD) gets none, even when the DM has homebrew races."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _race(duckdb_session, dm)
    assert atk.natural_attacks(duckdb_session, _pc(duckdb_session, c, dm, race="Human")) == []


def test_another_dms_race_never_applies(duckdb_session):
    """A race of the same name made by another DM gives this PC nothing."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _race(duckdb_session, _dm())
    assert atk.natural_attacks(duckdb_session, _pc(duckdb_session, c, dm)) == []


def test_a_race_for_the_other_edition_never_applies(duckdb_session):
    """A 2024-only race doesn't arm a PC in a 2014 campaign."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _race(duckdb_session, dm, ruleset="2024")
    assert atk.natural_attacks(duckdb_session, _pc(duckdb_session, c, dm)) == []


def test_editing_the_race_updates_every_pc(duckdb_session):
    """Natural attacks are computed from the race, so a changed die shows at once."""
    from domain.homebrew import HomebrewRaceUpdate

    dm = _dm()
    c = _campaign(duckdb_session, dm)
    race = _race(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm)
    bigger = dict(CLAWS, damage="1d8")
    hb_svc.update_race(duckdb_session, race.id, HomebrewRaceUpdate(natural_weapons=[bigger]), dm)
    assert atk.natural_attacks(duckdb_session, pc)[0].damage_roll == "1d8+3"


def test_natural_attacks_for_dm_authorizes(duckdb_session):
    """The sheet's route: the campaign's DM sees them; another DM gets a PermissionError."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _race(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm)
    assert [a.name for a in atk.natural_attacks_for_dm(duckdb_session, pc.id, dm)] == ["Claws"]
    with pytest.raises(PermissionError):
        atk.natural_attacks_for_dm(duckdb_session, pc.id, _dm())
    with pytest.raises(ValueError):
        atk.natural_attacks_for_dm(duckdb_session, uuid.uuid4(), dm)


# ── The power-attack toggle ─────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("weapons", "ranged", "heavy", "fits"),
    [
        ("ranged", True, False, True),
        ("ranged", False, False, False),
        ("heavy", False, True, True),
        ("heavy", False, False, False),
        ("heavy", True, False, False),
        ("melee", False, False, True),
        ("melee", True, False, False),
        ("any", True, False, True),
        ("any", False, False, True),
    ],
)
def test_trade_fits(weapons, ranged, heavy, fits):
    """Which attacks each trade covers."""
    assert atk.trade_fits(weapons, ranged, heavy) is fits


def test_ranged_trade_fits_a_longbow_not_a_longsword(duckdb_session):
    """Deadeye (ranged): the longbow offers −5/+10; the longsword doesn't."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm, race="Human", feats=["Deadeye (Longbow)"])
    bow = atk.attack_preview(duckdb_session, _longbow(duckdb_session), pc, dm)
    assert bow.power_attack is not None
    assert (bow.power_attack.to_hit, bow.power_attack.damage) == (-5, 10)
    assert bow.power_attack.feat == "Deadeye"
    assert bow.hit_bonus == 3 and bow.damage_roll == "1d8+1"  # the toggle isn't folded in
    sword = atk.attack_preview(duckdb_session, _longsword(duckdb_session), pc, dm)
    assert sword.power_attack is None


def test_heavy_trade_fits_a_greatsword_not_a_longsword(duckdb_session):
    """Cleaver (heavy): the greatsword offers it; the longsword and the longbow don't."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm, name="Cleaver", weapons="heavy")
    pc = _pc(duckdb_session, c, dm, race="Human", feats=["Cleaver"])
    great = atk.attack_preview(duckdb_session, _greatsword(duckdb_session), pc, dm)
    assert great.power_attack is not None and great.power_attack.feat == "Cleaver"
    for weapon in (_longsword(duckdb_session), _longbow(duckdb_session)):
        assert atk.attack_preview(duckdb_session, weapon, pc, dm).power_attack is None


def test_never_without_the_feat(duckdb_session):
    """The DM has Deadeye, but this PC didn't take it: no toggle anywhere."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm, weapons="any")
    _race(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm, feats=["Alert"])
    assert atk.attack_preview(duckdb_session, _longbow(duckdb_session), pc, dm).power_attack is None
    assert atk.natural_attacks(duckdb_session, pc)[0].power_attack is None
    assert atk.power_attack_trades(duckdb_session, pc) == []


def test_only_the_campaign_dm_sees_the_toggle(duckdb_session):
    """The preview leaves the homebrew trade out for anyone but the PC's DM."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm, race="Human", feats=["Deadeye"])
    assert (
        atk.attack_preview(duckdb_session, _longbow(duckdb_session), pc, _dm()).power_attack is None
    )


def test_another_dms_feat_never_applies(duckdb_session):
    """A PC with "Deadeye" in a campaign whose DM has no such feat gets no toggle."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, _dm())
    pc = _pc(duckdb_session, c, dm, race="Human", feats=["Deadeye"])
    assert atk.attack_preview(duckdb_session, _longbow(duckdb_session), pc, dm).power_attack is None


def test_a_2024_campaign_doesnt_see_a_2014_feat(duckdb_session):
    """Deadeye is 2014-only: a 2024 PC who somehow lists it gets no toggle."""
    dm = _dm()
    c = _campaign(duckdb_session, dm, ruleset="2024")
    _feat(duckdb_session, dm, ruleset="2014")
    pc = _pc(duckdb_session, c, dm, race="Human", feats=["Deadeye"])
    assert atk.power_attack_trades(duckdb_session, pc) == []
    assert atk.attack_preview(duckdb_session, _longbow(duckdb_session), pc, dm).power_attack is None


def test_melee_trade_rides_on_natural_weapons(duckdb_session):
    """A melee trade fits claws; a heavy one doesn't (claws have no Heavy property)."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _race(duckdb_session, dm)
    _feat(duckdb_session, dm, name="Brute", weapons="melee", ruleset=None)
    _feat(duckdb_session, dm, name="Cleaver", weapons="heavy")
    brute = _pc(duckdb_session, c, dm, feats=["Brute"])
    assert atk.natural_attacks(duckdb_session, brute)[0].power_attack.feat == "Brute"
    cleaver = _pc(duckdb_session, c, dm, feats=["Cleaver"])
    assert atk.natural_attacks(duckdb_session, cleaver)[0].power_attack is None


def test_first_fitting_feat_wins():
    """Two trades that both fit: the first in the PC's feat order is offered."""
    trades = [
        ("Deadeye", PowerAttack(to_hit=-5, damage=10, weapons="ranged")),
        ("Wild Swing", PowerAttack(to_hit=-3, damage=6, weapons="any")),
    ]
    assert atk.offer_for(trades, ranged=True, heavy=False).feat == "Deadeye"
    assert atk.offer_for(trades, ranged=False, heavy=False).feat == "Wild Swing"


# ── The phone's turn kit ────────────────────────────────────────────────────


def test_turn_kit_has_natural_attacks_and_toggles(duckdb_session):
    """The kit lists Claws after the weapons, and the longbow carries the Deadeye toggle."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _race(duckdb_session, dm)
    _feat(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm, feats=["Deadeye"])
    bow, sword = _longbow(duckdb_session), _longsword(duckdb_session)
    for weapon in (bow, sword):
        inv_svc.add_item(
            duckdb_session, pc.id, CharacterItemCreate(item_id=weapon.id, equipped=True), dm
        )
    kit = play_svc.turn_kit(duckdb_session, pc.id)
    by_key = {o.key: o for o in kit.action}
    claws = by_key["n-0"]
    assert (claws.name, claws.kind, claws.to_hit, claws.damage) == ("Claws", "natural", 5, "1d6+3")
    assert claws.note.startswith("STR · slashing · natural")
    assert claws.power_attack is None  # Deadeye is ranged only
    assert by_key[f"w-{bow.id}"].power_attack.feat == "Deadeye"
    assert by_key[f"w-{sword.id}"].power_attack is None
    keys = [o.key for o in kit.action]
    assert keys.index("n-0") > max(keys.index(f"w-{bow.id}"), keys.index(f"w-{sword.id}"))


def test_turn_kit_without_homebrew_is_unchanged(duckdb_session):
    """A Human with no homebrew feats gets the same kit as before Plan 135."""
    from services import arena_service

    dm = _dm()
    c = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm, race="Human", feats=["Alert"])
    before = arena_service.turn_kit(duckdb_session, pc, dm)
    after = play_svc.turn_kit(duckdb_session, pc.id)
    assert after == before
    assert all(o.power_attack is None for o in after.action)
