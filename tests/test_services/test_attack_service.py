"""Tests for services/attack_service.py — 5.5e attack-roll math edge cases."""

import uuid

import pytest

import services.attack_service as atk
from domain.character import PlayerCharacter
from domain.enums import CharacterClass, ItemRarity
from domain.item import Item


def _pc(
    *,
    level: int = 1,
    score_str: int = 16,
    score_dex: int = 14,
    score_con: int = 12,
    score_int: int = 10,
    score_wis: int = 10,
    score_cha: int = 10,
) -> PlayerCharacter:
    """Build an in-memory PlayerCharacter for attack-math tests (no DB)."""
    return PlayerCharacter(
        id=uuid.uuid4(),
        campaign_id=uuid.uuid4(),
        player_name="Player",
        character_name="Hero",
        race="Human",
        character_class=CharacterClass.FIGHTER,
        level=level,
        score_str=score_str,
        score_dex=score_dex,
        score_con=score_con,
        score_int=score_int,
        score_wis=score_wis,
        score_cha=score_cha,
        hp_max=20,
        hp_current=20,
        ac=16,
        speed=30,
    )


def _weapon(
    name: str,
    *,
    category: str = "Martial Melee",
    damage_die: str = "1d8",
    damage_type: str = "slashing",
    properties: list[str] | None = None,
    versatile_damage: str | None = None,
    weapon_range: str | None = None,
    mastery: str | None = None,
) -> Item:
    """Build an in-memory weapon Item for attack-math tests (no DB)."""
    return Item(
        id=uuid.uuid4(),
        name=name,
        rarity=ItemRarity.COMMON,
        item_type="Weapon",
        weapon_category=category,
        damage_die=damage_die,
        damage_type=damage_type,
        weapon_properties=properties,
        versatile_damage=versatile_damage,
        weapon_range=weapon_range,
        mastery=mastery,
    )


# ── ability_modifier + proficiency_bonus helpers ──────────────────────────────


class TestAbilityModifier:
    """5e standard modifier formula."""

    @pytest.mark.parametrize(
        "score,expected",
        [(1, -5), (3, -4), (10, 0), (11, 0), (16, 3), (18, 4), (20, 5), (24, 7)],
    )
    def test_values(self, score: int, expected: int):
        """Floor((score-10)/2) — works for odd and even scores, including negatives."""
        assert atk.ability_modifier(score) == expected


class TestProficiencyBonus:
    """5e proficiency-bonus-by-level table."""

    @pytest.mark.parametrize(
        "level,expected",
        [(1, 2), (4, 2), (5, 3), (8, 3), (9, 4), (12, 4), (13, 5), (16, 5), (17, 6), (20, 6)],
    )
    def test_values(self, level: int, expected: int):
        """Proficiency: +2 at 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17–20."""
        assert atk.proficiency_bonus(level) == expected


# ── is_weapon ─────────────────────────────────────────────────────────────────


class TestIsWeapon:
    """Detection of weapon items."""

    def test_weapon(self):
        """A normal weapon has category and die set."""
        assert atk.is_weapon(_weapon("Longsword"))

    def test_non_weapon(self):
        """A potion is not a weapon."""
        potion = Item(
            id=uuid.uuid4(),
            name="Potion of Healing",
            rarity=ItemRarity.COMMON,
            item_type="Potion",
        )
        assert atk.is_weapon(potion) is False


# ── compute_attack edge cases ────────────────────────────────────────────────


class TestComputeAttackMelee:
    """Strength-based melee attacks."""

    def test_longsword_level_1_str_16(self):
        """Fighter L1 (STR 16, +2 prof) with Longsword: +5 hit, 1d8+3 slashing."""
        pc = _pc()
        weapon = _weapon("Longsword", damage_die="1d8", damage_type="slashing")
        result = atk.compute_attack(weapon, pc)
        assert result.ability == "STR"
        assert result.hit_bonus == 5  # +3 STR + +2 prof
        assert result.damage_roll == "1d8+3"
        assert result.damage_type == "slashing"

    def test_negative_modifier_renders_with_minus(self):
        """A weak fighter (STR 8 = -1 mod): 1d8-1 damage, +1 hit (+2 prof - 1 STR)."""
        pc = _pc(score_str=8)
        weapon = _weapon("Longsword")
        result = atk.compute_attack(weapon, pc)
        assert result.ability == "STR"
        assert result.hit_bonus == 1
        assert result.damage_roll == "1d8-1"

    def test_zero_modifier_omits_sign(self):
        """STR 10 (mod 0): damage_roll is just the die."""
        pc = _pc(score_str=10)
        weapon = _weapon("Longsword")
        result = atk.compute_attack(weapon, pc)
        assert result.damage_roll == "1d8"
        assert result.hit_bonus == 2  # just prof


class TestComputeAttackFinesse:
    """Finesse weapons may use DEX if higher than STR."""

    def test_rapier_dex_higher(self):
        """Rogue with DEX 18 > STR 10 picks DEX (+4) + prof (+2) = +6 hit, 1d8+4."""
        pc = _pc(score_str=10, score_dex=18)
        weapon = _weapon("Rapier", damage_die="1d8", properties=["Finesse"], mastery="Vex")
        result = atk.compute_attack(weapon, pc)
        assert result.ability == "DEX"
        assert result.hit_bonus == 6
        assert result.damage_roll == "1d8+4"
        assert result.mastery == "Vex"

    def test_finesse_uses_str_when_str_higher(self):
        """If STR > DEX, finesse falls back to STR."""
        pc = _pc(score_str=18, score_dex=10)
        weapon = _weapon("Rapier", properties=["Finesse"])
        result = atk.compute_attack(weapon, pc)
        assert result.ability == "STR"
        assert result.hit_bonus == 6

    def test_finesse_prefers_dex_on_tie(self):
        """Equal mods: DEX wins (matches the spell-attack convention in 5e helpers)."""
        pc = _pc(score_str=14, score_dex=14)
        weapon = _weapon("Rapier", properties=["Finesse"])
        result = atk.compute_attack(weapon, pc)
        assert result.ability == "DEX"


class TestComputeAttackRanged:
    """Ranged weapons (not Thrown) always use DEX."""

    def test_longbow(self):
        """Longbow (Martial Ranged) uses DEX regardless of STR."""
        pc = _pc(score_str=18, score_dex=16)
        weapon = _weapon(
            "Longbow",
            category="Martial Ranged",
            damage_die="1d8",
            damage_type="piercing",
            properties=["Heavy", "Two-Handed", "Ammunition", "Range"],
            weapon_range="150/600",
        )
        result = atk.compute_attack(weapon, pc)
        assert result.ability == "DEX"
        assert result.hit_bonus == 5  # +3 DEX + +2 prof
        assert result.damage_roll == "1d8+3"


class TestComputeAttackThrown:
    """Thrown weapons use STR unless they also have Finesse."""

    def test_javelin_uses_str(self):
        """Javelin has Thrown but not Finesse → STR."""
        pc = _pc(score_str=16, score_dex=18)
        weapon = _weapon(
            "Javelin",
            category="Simple Melee",
            damage_die="1d6",
            damage_type="piercing",
            properties=["Thrown"],
            weapon_range="30/120",
        )
        result = atk.compute_attack(weapon, pc)
        assert result.ability == "STR"
        assert result.hit_bonus == 5  # +3 STR + +2 prof

    def test_dagger_thrown_with_finesse_uses_dex(self):
        """Dagger has both Thrown and Finesse → may use DEX."""
        pc = _pc(score_str=10, score_dex=18)
        weapon = _weapon(
            "Dagger",
            category="Simple Melee",
            damage_die="1d4",
            damage_type="piercing",
            properties=["Finesse", "Light", "Thrown"],
            weapon_range="20/60",
            mastery="Nick",
        )
        result = atk.compute_attack(weapon, pc)
        assert result.ability == "DEX"
        assert result.hit_bonus == 6  # +4 DEX + +2 prof


class TestComputeAttackVersatile:
    """Versatile weapons use the larger die when two-handed."""

    def test_one_handed_uses_base_die(self):
        """Longsword 1H: 1d8."""
        pc = _pc()
        weapon = _weapon("Longsword", versatile_damage="1d10")
        result = atk.compute_attack(weapon, pc, two_handed=False)
        assert result.damage_roll == "1d8+3"
        assert result.two_handed is False

    def test_two_handed_uses_versatile_die(self):
        """Longsword 2H: 1d10."""
        pc = _pc()
        weapon = _weapon("Longsword", versatile_damage="1d10")
        result = atk.compute_attack(weapon, pc, two_handed=True)
        assert result.damage_roll == "1d10+3"
        assert result.two_handed is True

    def test_two_handed_ignored_when_no_versatile_damage(self):
        """Non-versatile weapons ignore the two_handed flag."""
        pc = _pc()
        weapon = _weapon("Greataxe", damage_die="1d12", versatile_damage=None)
        result = atk.compute_attack(weapon, pc, two_handed=True)
        assert result.damage_roll == "1d12+3"


class TestComputeAttackProficiency:
    """proficient=False zeroes out the proficiency bonus."""

    def test_non_proficient(self):
        """Without proficiency, hit is just the ability mod."""
        pc = _pc()  # STR 16, level 1 = +2 prof
        weapon = _weapon("Longsword")
        result = atk.compute_attack(weapon, pc, proficient=False)
        assert result.hit_bonus == 3  # just STR, no prof
        assert result.damage_roll == "1d8+3"  # damage unchanged
        assert result.proficient is False

    def test_proficiency_scales_with_level(self):
        """Level 9 fighter has +4 prof: +3 STR + +4 prof = +7 hit."""
        pc = _pc(level=9)
        weapon = _weapon("Longsword")
        result = atk.compute_attack(weapon, pc)
        assert result.hit_bonus == 7


class TestComputeAttackErrors:
    """Error paths."""

    def test_non_weapon_raises(self):
        """A non-weapon item raises ValueError."""
        pc = _pc()
        potion = Item(
            id=uuid.uuid4(),
            name="Potion",
            rarity=ItemRarity.COMMON,
            item_type="Potion",
        )
        with pytest.raises(ValueError):
            atk.compute_attack(potion, pc)
