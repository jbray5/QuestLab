"""How the SRD 5.1 (2014) weapon table differs from the 2024 one we seed (Plan 135).

The items table holds one mundane weapon list, the SRD 5.2.1 (2024) table in
``srd_weapons_2024.py``. The Weapons page's 2014 view reads that list through these
differences instead of keeping a second copy of every row:

- ``NOT_IN_2014``: weapons the 2014 table doesn't have (the 2024 firearms).
- ``CHANGES_2014``: the rows whose 2014 stats differ, keyed by lowercased weapon name;
  each value is the ItemRead fields to replace. ``special`` is the 2014 "Special"
  property's rule, added to the row's text.

Checked field by field against ``src/2014/en/5e-SRD-Equipment.json`` of
https://github.com/5e-bits/5e-database on 2026-11-04: every other weapon has the same
damage, properties and range in both editions (mastery aside, which 2014 doesn't have).
The 2014 Net is not in the catalog (2024 made it gear), so it isn't listed here.

The SRD 5.1 is (c) Wizards of the Coast LLC, distributed under CC-BY-4.0:
https://creativecommons.org/licenses/by/4.0/legalcode
"""

NOT_IN_2014: frozenset[str] = frozenset({"musket", "pistol"})
"""Lowercased names of 2024 weapons the SRD 5.1 weapon table doesn't have."""

CHANGES_2014: dict[str, dict] = {
    "lance": {
        "damage_die": "1d12",
        "weapon_properties": ["Reach", "Special"],
        "special": (
            "Special: You have disadvantage when you use a lance to attack a target within "
            "5 feet of you. Also, a lance requires two hands to wield when you aren't mounted."
        ),
    },
    "trident": {"damage_die": "1d6", "versatile_damage": "1d8"},
    "war pick": {"weapon_properties": None, "versatile_damage": None},
}
"""The SRD 5.1 stats of the weapons whose 2014 row differs from the 2024 one."""
