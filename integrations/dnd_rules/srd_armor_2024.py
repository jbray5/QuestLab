"""SRD 5.2 (2024) mundane armor and the shield, as catalog items (Plan 83).

Starting kits name these; without catalog rows the builder had to shrug
("Not in the catalog yet") at every Fighter and Cleric. AC math still lives
in ``srd_character_options_2024.ARMOR`` — these rows carry the same numbers
in ``properties`` so a sheet can show them.
"""

from domain.enums import ItemRarity
from domain.item import ItemCreate

_ARMOR: list[tuple[str, int, int | None, str, int | None, int]] = [
    # name, base AC, dex cap (None = full), category, STR minimum, price in gp
    ("Padded Armor", 11, None, "light", None, 5),
    ("Leather Armor", 11, None, "light", None, 10),
    ("Studded Leather Armor", 12, None, "light", None, 45),
    ("Hide Armor", 12, 2, "medium", None, 10),
    ("Chain Shirt", 13, 2, "medium", None, 50),
    ("Scale Mail", 14, 2, "medium", None, 50),
    ("Breastplate", 14, 2, "medium", None, 400),
    ("Half Plate Armor", 15, 2, "medium", None, 750),
    ("Ring Mail", 14, 0, "heavy", None, 30),
    ("Chain Mail", 16, 0, "heavy", 13, 75),
    ("Splint Armor", 17, 0, "heavy", 15, 200),
    ("Plate Armor", 18, 0, "heavy", 15, 1500),
]


def _describe(base: int, dex_cap: int | None, category: str, str_min: int | None) -> str:
    """One line a player can read: AC formula, weight class, and the STR rule."""
    if dex_cap is None:
        ac = f"AC {base} + Dex modifier"
    elif dex_cap == 0:
        ac = f"AC {base}"
    else:
        ac = f"AC {base} + Dex modifier (max {dex_cap})"
    line = f"{ac}. {category.title()} armor."
    if category == "heavy":
        line += " Disadvantage on Stealth."
    if str_min:
        line += f" Strength {str_min} or your speed drops by 10 ft."
    return line


SRD_ARMOR_2024: list[ItemCreate] = [
    ItemCreate(
        name=name,
        rarity=ItemRarity.COMMON,
        item_type="Armor",
        description=_describe(base, dex_cap, category, str_min),
        value_gp=price,
        properties={"ac_base": base, "dex_cap": dex_cap, "category": category, "str_min": str_min},
    )
    for name, base, dex_cap, category, str_min, price in _ARMOR
] + [
    ItemCreate(
        name="Shield",
        rarity=ItemRarity.COMMON,
        item_type="Shield",
        description="+2 AC while wielded. Takes a hand.",
        value_gp=10,
        properties={"ac_bonus": 2},
    )
]
