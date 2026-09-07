"""Wild Magic Surge table, 2024 style, adapted for the Practice Arena (Plan 88).

Fifty entries on a d100, each with the arena effect the referee applies.
Effects that only matter with a party, a room or an hour are kept as flavor
("nothing here to stand on"). PHB subclass text: served only to the owner's
own table (personal-content gate); the SRD build never shows it.
"""

from typing import Any

# (low, high, text, effect key, params)
SURGE_TABLE: list[tuple[int, int, str, str | None, dict[str, Any]]] = [
    (
        1,
        4,
        "Roll on this table at the start of each of your turns for the next minute.",
        "surge_each_turn",
        {"rounds": 10},
    ),
    (5, 8, "A creature that is Friendly to you appears nearby — a bystander, here.", None, {}),
    (
        9,
        12,
        "For the next minute, you regain 5 Hit Points at the start of each of your turns.",
        "regen5",
        {"rounds": 10},
    ),
    (
        13,
        16,
        "Creatures have Disadvantage on saving throws against the next spell you cast within a minute that involves a saving throw.",
        "foe_disadv_save",
        {"rounds": 10},
    ),
    (
        17,
        20,
        "A harmless effect follows you for a minute: faint ethereal music, feathers for a beard, a shouting voice, blue skin — the table decides.",
        None,
        {},
    ),
    (
        21,
        24,
        "For the next minute, all your spells with a casting time of an action have a casting time of a Bonus Action.",
        "bonus_casting",
        {"rounds": 10},
    ),
    (
        25,
        28,
        "You are transported to the Astral Plane until the end of your next turn, then return to where you were.",
        "astral",
        {"rounds": 1},
    ),
    (
        29,
        32,
        "The next time you cast a spell that deals damage within the next minute, maximize the damage.",
        "maximize_next",
        {"rounds": 10},
    ),
    (
        33,
        36,
        "You have Resistance to all damage for the next minute.",
        "resist_all",
        {"rounds": 10},
    ),
    (
        37,
        40,
        "You turn into a potted plant until the start of your next turn: Incapacitated, and Vulnerable to all damage.",
        "plant",
        {"rounds": 1},
    ),
    (
        41,
        44,
        "For the next minute, you can teleport up to 20 feet as a Bonus Action on each of your turns.",
        None,
        {},
    ),
    (
        45,
        48,
        "You have the Invisible condition for 1 minute; it ends immediately after you make an attack roll, deal damage, or cast a spell.",
        "invisible",
        {"rounds": 10},
    ),
    (
        49,
        52,
        "A spectral shield hovers near you for the next minute: +2 AC and immunity to Magic Missile.",
        "shield2",
        {"rounds": 10},
    ),
    (53, 56, "You can take one additional action immediately.", "extra_action", {}),
    (57, 60, "You cast a random spell (d10).", "random_spell", {}),
    (61, 64, "For the next minute, flammable objects you touch burst into flame.", None, {}),
    (
        65,
        68,
        "If you die within the next hour, you immediately revive as if by the Reincarnate spell.",
        None,
        {},
    ),
    (
        69,
        72,
        "You have the Frightened condition until the end of your next turn.",
        "frightened",
        {"rounds": 1},
    ),
    (73, 76, "You teleport up to 60 feet to an unoccupied space you can see.", None, {}),
    (
        77,
        80,
        "A random creature within 60 feet of you has the Poisoned condition for 1d4 hours.",
        "poison_random",
        {},
    ),
    (
        81,
        84,
        "You radiate Bright Light for a minute; a creature that ends its turn within 5 feet of you is Blinded until the end of its next turn.",
        "radiance",
        {"rounds": 10},
    ),
    (
        85,
        88,
        "Up to three creatures you choose within 30 feet take 1d10 Necrotic damage, and you regain Hit Points equal to the damage dealt.",
        "necrotic_drain",
        {},
    ),
    (
        89,
        92,
        "Up to three creatures you choose within 30 feet take 4d10 Lightning damage.",
        "lightning",
        {},
    ),
    (
        93,
        96,
        "You and all creatures within 30 feet of you have Vulnerability to Piercing damage for the next minute.",
        "vuln_piercing",
        {"rounds": 10},
    ),
    (97, 100, "You regain your lowest-level expended spell slot.", "regain_slot", {}),
]

RANDOM_SPELLS: list[tuple[str, str | None]] = [
    ("Confusion — you stagger about for a round.", "plant"),
    (
        "Fireball, centered on you: 8d6 fire to everything within 20 feet, you included (DEX save for half).",
        "fireball_self",
    ),
    ("Fog Cloud: everyone fights blind — attacks at disadvantage both ways for a minute.", "fog"),
    ("Fly, on a random creature. Nothing to stand on here.", None),
    ("Grease under the foe: DEX save or Prone.", "grease"),
    ("Levitate, on yourself: you drift up out of reach for a round.", "astral"),
    ("Magic Missile, cast as a level-5 spell: seven darts at the foe.", "missiles7"),
    ("Mirror Image: three duplicates; the foe's next three attacks are at disadvantage.", "mirror"),
    ("Polymorph, on yourself: a Sheep until you take damage — Incapacitated.", "plant"),
    ("See Invisibility. Nothing to see.", None),
]


def surge_entry(roll: int) -> tuple[str, str | None, dict[str, Any]]:
    """The table row for a d100 result.

    Args:
        roll: 1–100.

    Returns:
        ``(text, effect key or None, params)``.
    """
    r = max(1, min(100, roll))
    for lo, hi, text, effect, params in SURGE_TABLE:
        if lo <= r <= hi:
            return text, effect, dict(params)
    return SURGE_TABLE[-1][2], SURGE_TABLE[-1][3], dict(SURGE_TABLE[-1][4])
