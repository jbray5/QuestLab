"""Attack-roll math for D&D 5.5e weapons (Plan 00018).

Pure functions — no DB, no I/O. Given a PC and a weapon Item, return a
``WeaponAttackPreview`` with hit bonus, damage roll string, mastery, etc.

Future work (Plan 00021): replace the ``proficient=True`` default with a
class-feature lookup so weapon proficiencies are accurate per character.
"""

from __future__ import annotations

from domain.character import PlayerCharacter
from domain.item import Item, WeaponAttackPreview


def is_weapon(item: Item) -> bool:
    """Return True if the item has weapon stats populated.

    Args:
        item: An Item ORM object (mundane or magical).

    Returns:
        True iff ``weapon_category`` and ``damage_die`` are both set.
    """
    return bool(item.weapon_category and item.damage_die)


def ability_modifier(score: int) -> int:
    """Standard 5e ability-score-to-modifier helper.

    Args:
        score: Raw ability score (3–30).

    Returns:
        Integer modifier (``(score - 10) // 2``).
    """
    return (int(score) - 10) // 2


def proficiency_bonus(level: int) -> int:
    """5e proficiency bonus by level.

    Args:
        level: Character level (1–20).

    Returns:
        Proficiency bonus (+2 at 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17–20).
    """
    return max(0, (max(1, int(level)) - 1) // 4) + 2


def _choose_ability(weapon: Item, str_mod: int, dex_mod: int) -> tuple[str, int]:
    """Pick the ability score that applies to this weapon attack.

    Rules:
      - Ranged weapons (not Thrown) always use DEX.
      - Thrown weapons use STR unless they also have Finesse.
      - Finesse melee weapons use whichever of STR/DEX is higher.
      - Otherwise STR.

    Args:
        weapon: Weapon Item.
        str_mod: Wielder's STR modifier.
        dex_mod: Wielder's DEX modifier.

    Returns:
        Tuple of (ability label, modifier value).
    """
    props = weapon.weapon_properties or []
    is_finesse = "Finesse" in props
    is_thrown = "Thrown" in props
    is_ranged_category = bool(weapon.weapon_category and "Ranged" in weapon.weapon_category)

    if is_ranged_category and not is_thrown:
        return "DEX", dex_mod
    if is_finesse:
        if dex_mod >= str_mod:
            return "DEX", dex_mod
        return "STR", str_mod
    return "STR", str_mod


def _format_damage_roll(die: str, ability_mod: int) -> str:
    """Render the damage roll string, e.g. ``1d8+3`` or ``2d6-1`` or just ``1d6``."""
    if ability_mod > 0:
        return f"{die}+{ability_mod}"
    if ability_mod < 0:
        return f"{die}{ability_mod}"
    return die


def compute_attack(
    weapon: Item,
    character: PlayerCharacter,
    proficient: bool = True,
    two_handed: bool = False,
) -> WeaponAttackPreview:
    """Compute hit bonus and damage roll for a PC wielding a weapon.

    Args:
        weapon: Weapon Item (must have ``weapon_category`` + ``damage_die``).
        character: PlayerCharacter wielding it.
        proficient: Whether the character is proficient with this weapon
            (defaults True; Plan 21 will compute from class features).
        two_handed: For Versatile weapons, ``True`` to use the larger die.
            Ignored if the weapon has no ``versatile_damage``.

    Returns:
        WeaponAttackPreview with hit bonus, damage roll, mastery, etc.

    Raises:
        ValueError: If ``weapon`` is not a weapon.
    """
    if not is_weapon(weapon):
        raise ValueError(f"Item {weapon.id} ({weapon.name}) is not a weapon.")

    str_mod = ability_modifier(character.score_str)
    dex_mod = ability_modifier(character.score_dex)
    ability, ability_mod = _choose_ability(weapon, str_mod, dex_mod)
    prof_bonus = proficiency_bonus(character.level) if proficient else 0
    hit_bonus = ability_mod + prof_bonus

    die = weapon.versatile_damage if (two_handed and weapon.versatile_damage) else weapon.damage_die
    damage_roll = _format_damage_roll(die or "1d4", ability_mod)

    return WeaponAttackPreview(
        weapon_id=weapon.id,
        character_id=character.id,
        ability=ability,
        hit_bonus=hit_bonus,
        damage_roll=damage_roll,
        damage_type=weapon.damage_type or "bludgeoning",
        mastery=weapon.mastery,
        proficient=proficient,
        two_handed=two_handed,
    )
