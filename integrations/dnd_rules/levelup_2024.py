"""2024 level-up rules data (Plan 115) — what a new level brings and which feats a PC may take.

Pure data and pure functions, no I/O. ``services/levelup_service.py`` turns these into a
per-PC plan and validates the player's choices against them.

Licensing line (same as Plan 74): class feature *names* by level come from the SRD 5.2.1 class
tables. Feats outside the SRD are listed by name with a one-line summary in our own words and a
"read it in your book" prompt: the player's book is canon, the app only records the pick and
applies the numbers it can (ability increases, save proficiency, spells, skills, Tough's HP).
"""

from __future__ import annotations

from typing import Any

ABILITIES = ["STR", "DEX", "CON", "INT", "WIS", "CHA"]
_MENTAL = ["INT", "WIS", "CHA"]
_PHYSICAL = ["STR", "DEX"]

_ASI = "Ability Score Improvement"
_SUB = "Subclass feature"
_BOON = "Epic Boon"

# Feature names gained at each level, per the SRD 5.2.1 class tables. Levels with nothing new
# are omitted. "Ability Score Improvement" marks the levels where the feat step appears.
CLASS_LEVEL_FEATURES: dict[str, dict[int, list[str]]] = {
    "Barbarian": {
        1: ["Rage", "Unarmored Defense", "Weapon Mastery"],
        2: ["Danger Sense", "Reckless Attack"],
        3: ["Barbarian Subclass", "Primal Knowledge"],
        4: [_ASI],
        5: ["Extra Attack", "Fast Movement"],
        6: [_SUB],
        7: ["Feral Instinct", "Instinctive Pounce"],
        8: [_ASI],
        9: ["Brutal Strike"],
        10: [_SUB],
        11: ["Relentless Rage"],
        12: [_ASI],
        13: ["Improved Brutal Strike"],
        14: [_SUB],
        15: ["Persistent Rage"],
        16: [_ASI],
        17: ["Improved Brutal Strike"],
        18: ["Indomitable Might"],
        19: [_BOON],
        20: ["Primal Champion"],
    },
    "Bard": {
        1: ["Bardic Inspiration", "Spellcasting"],
        2: ["Expertise", "Jack of All Trades"],
        3: ["Bard Subclass"],
        4: [_ASI],
        5: ["Font of Inspiration"],
        6: [_SUB],
        7: ["Countercharm"],
        8: [_ASI],
        9: ["Expertise"],
        10: ["Magical Secrets"],
        12: [_ASI],
        14: [_SUB],
        16: [_ASI],
        18: ["Superior Inspiration"],
        19: [_BOON],
        20: ["Words of Creation"],
    },
    "Cleric": {
        1: ["Spellcasting", "Divine Order"],
        2: ["Channel Divinity"],
        3: ["Cleric Subclass"],
        4: [_ASI],
        5: ["Sear Undead"],
        6: [_SUB],
        7: ["Blessed Strikes"],
        8: [_ASI],
        10: ["Divine Intervention"],
        12: [_ASI],
        14: ["Improved Blessed Strikes"],
        16: [_ASI],
        17: [_SUB],
        19: [_BOON],
        20: ["Greater Divine Intervention"],
    },
    "Druid": {
        1: ["Spellcasting", "Druidic", "Primal Order"],
        2: ["Wild Shape", "Wild Companion"],
        3: ["Druid Subclass"],
        4: [_ASI],
        5: ["Wild Resurgence"],
        6: [_SUB],
        7: ["Elemental Fury"],
        8: [_ASI],
        10: [_SUB],
        12: [_ASI],
        14: [_SUB],
        15: ["Improved Elemental Fury"],
        16: [_ASI],
        18: ["Beast Spells"],
        19: [_BOON],
        20: ["Archdruid"],
    },
    "Fighter": {
        1: ["Fighting Style", "Second Wind", "Weapon Mastery"],
        2: ["Action Surge", "Tactical Mind"],
        3: ["Fighter Subclass"],
        4: [_ASI],
        5: ["Extra Attack", "Tactical Shift"],
        6: [_ASI],
        7: [_SUB],
        8: [_ASI],
        9: ["Indomitable", "Master of Armaments"],
        10: [_SUB],
        11: ["Two Extra Attacks"],
        12: [_ASI],
        13: ["Indomitable (two uses)", "Studied Attacks"],
        14: [_ASI],
        15: [_SUB],
        16: [_ASI],
        17: ["Action Surge (two uses)", "Indomitable (three uses)"],
        18: [_SUB],
        19: [_BOON],
        20: ["Three Extra Attacks"],
    },
    "Monk": {
        1: ["Martial Arts", "Unarmored Defense"],
        2: ["Monk's Focus", "Unarmored Movement", "Uncanny Metabolism"],
        3: ["Deflect Attacks", "Monk Subclass"],
        4: [_ASI, "Slow Fall"],
        5: ["Extra Attack", "Stunning Strike"],
        6: ["Empowered Strikes", _SUB],
        7: ["Evasion"],
        8: [_ASI],
        9: ["Acrobatic Movement"],
        10: ["Heightened Focus", "Self-Restoration"],
        11: [_SUB],
        12: [_ASI],
        13: ["Deflect Energy"],
        14: ["Disciplined Survivor"],
        15: ["Perfect Focus"],
        16: [_ASI],
        17: [_SUB],
        18: ["Superior Defense"],
        19: [_BOON],
        20: ["Body and Mind"],
    },
    "Paladin": {
        1: ["Lay On Hands", "Spellcasting", "Weapon Mastery"],
        2: ["Fighting Style", "Paladin's Smite"],
        3: ["Channel Divinity", "Paladin Subclass"],
        4: [_ASI],
        5: ["Extra Attack", "Faithful Steed"],
        6: ["Aura of Protection"],
        7: [_SUB],
        8: [_ASI],
        9: ["Abjure Foes"],
        10: ["Aura of Courage"],
        11: ["Radiant Strikes"],
        12: [_ASI],
        14: ["Restoring Touch"],
        15: [_SUB],
        16: [_ASI],
        18: ["Aura Expansion"],
        19: [_BOON],
        20: [_SUB],
    },
    "Ranger": {
        1: ["Spellcasting", "Favored Enemy", "Weapon Mastery"],
        2: ["Deft Explorer", "Fighting Style"],
        3: ["Ranger Subclass"],
        4: [_ASI],
        5: ["Extra Attack"],
        6: ["Roving"],
        7: [_SUB],
        8: [_ASI],
        9: ["Expertise"],
        10: ["Tireless"],
        11: [_SUB],
        12: [_ASI],
        13: ["Relentless Hunter"],
        14: ["Nature's Veil"],
        15: [_SUB],
        16: [_ASI],
        17: ["Precise Hunter"],
        18: ["Feral Senses"],
        19: [_BOON],
        20: ["Foe Slayer"],
    },
    "Rogue": {
        1: ["Expertise", "Sneak Attack", "Thieves' Cant", "Weapon Mastery"],
        2: ["Cunning Action"],
        3: ["Rogue Subclass", "Steady Aim"],
        4: [_ASI],
        5: ["Cunning Strike", "Uncanny Dodge"],
        6: ["Expertise"],
        7: ["Evasion", "Reliable Talent"],
        8: [_ASI],
        9: [_SUB],
        10: [_ASI],
        11: ["Improved Cunning Strike"],
        12: [_ASI],
        13: [_SUB],
        14: ["Devious Strikes"],
        15: ["Slippery Mind"],
        16: [_ASI],
        17: [_SUB],
        18: ["Elusive"],
        19: [_BOON],
        20: ["Stroke of Luck"],
    },
    "Sorcerer": {
        1: ["Spellcasting", "Innate Sorcery"],
        2: ["Font of Magic", "Metamagic"],
        3: ["Sorcerer Subclass"],
        4: [_ASI],
        5: ["Sorcerous Restoration"],
        6: [_SUB],
        7: ["Sorcery Incarnate"],
        8: [_ASI],
        10: ["Metamagic"],
        12: [_ASI],
        14: [_SUB],
        16: [_ASI],
        17: ["Metamagic"],
        18: [_SUB],
        19: [_BOON],
        20: ["Arcane Apotheosis"],
    },
    "Warlock": {
        1: ["Eldritch Invocations", "Pact Magic"],
        2: ["Magical Cunning"],
        3: ["Warlock Subclass"],
        4: [_ASI],
        6: [_SUB],
        8: [_ASI],
        9: ["Contact Patron"],
        10: [_SUB],
        11: ["Mystic Arcanum (6th level)"],
        12: [_ASI],
        13: ["Mystic Arcanum (7th level)"],
        14: [_SUB],
        15: ["Mystic Arcanum (8th level)"],
        16: [_ASI],
        17: ["Mystic Arcanum (9th level)"],
        19: [_BOON],
        20: ["Eldritch Master"],
    },
    "Wizard": {
        1: ["Spellcasting", "Ritual Adept", "Arcane Recovery"],
        2: ["Scholar"],
        3: ["Wizard Subclass"],
        4: [_ASI],
        5: ["Memorize Spell"],
        6: [_SUB],
        8: [_ASI],
        10: [_SUB],
        12: [_ASI],
        14: [_SUB],
        16: [_ASI],
        18: ["Spell Mastery"],
        19: [_BOON],
        20: ["Signature Spells"],
    },
}

# Plain-words notes for features the guide calls out by name (own words, not book text).
FEATURE_NOTES: dict[str, str] = {
    _ASI: "Take +2 to one ability (or +1 to two), or trade it for a feat you qualify for.",
    _BOON: "Take an Epic Boon from your book, or any other feat you qualify for.",
    _SUB: "Your subclass grants something new at this level: read it in your book.",
    "Extra Attack": "Attack twice whenever you take the Attack action.",
    "Two Extra Attacks": "Attack three times whenever you take the Attack action.",
    "Three Extra Attacks": "Attack four times whenever you take the Attack action.",
    "Slow Fall": "Use your reaction to cut falling damage by five times your Monk level.",
    "Wild Resurgence": "Trade a spell slot for a Wild Shape use, or a Wild Shape use for a slot.",
    "Font of Inspiration": "Bardic Inspiration now comes back on a Short Rest too.",
    "Sear Undead": "Turn Undead also burns them with radiant damage.",
    "Faithful Steed": "Find Steed is always prepared, and once per Long Rest it costs no slot.",
    "Cunning Strike": "Trade Sneak Attack dice for effects: poison, trip, or withdraw.",
    "Uncanny Dodge": "Use your reaction to halve the damage of an attack that hits you.",
    "Sorcerous Restoration": "On a Short Rest, regain some Sorcery Points.",
    "Memorize Spell": "On a Short Rest, swap one prepared spell for another in your spellbook.",
    "Stunning Strike": "Spend Focus to try to stun a creature you hit.",
    "Aura of Protection": "You and allies within 10 ft. add your CHA modifier to saves.",
}

# Classes whose 2024 rules let you replace one cantrip whenever you gain a level in them.
CANTRIP_SWAP_CLASSES = frozenset({"Bard", "Cleric", "Druid", "Sorcerer", "Warlock", "Wizard"})
# Classes that may replace one leveled spell on gaining a level (the rest swap on rests).
SPELL_SWAP_CLASSES = frozenset({"Bard", "Sorcerer", "Warlock"})
# Classes with a Fighting Style feature (and the level it arrives).
FIGHTING_STYLE_LEVEL: dict[str, int] = {"Fighter": 1, "Paladin": 2, "Ranger": 2}
# Subclasses that make a non-caster a caster (third-casters).
CASTER_SUBCLASSES = frozenset({"Eldritch Knight", "Arcane Trickster"})

# Extra max HP per level from a species trait or subclass feature.
HP_PER_LEVEL_SPECIES: dict[str, int] = {"Dwarf": 1}
HP_PER_LEVEL_SUBCLASS: dict[str, int] = {"Draconic Sorcery": 1, "Draconic Bloodline": 1}


def asi_levels(class_name: str) -> set[int]:
    """Levels at which the class gains Ability Score Improvement (or Epic Boon at 19)."""
    table = CLASS_LEVEL_FEATURES.get(class_name, {})
    found = {lvl for lvl, names in table.items() if _ASI in names or _BOON in names}
    return found or {4, 8, 12, 16, 19}


def features_at(class_name: str, level: int) -> list[str]:
    """Feature names the class gains at exactly ``level`` (empty if unknown class)."""
    return list(CLASS_LEVEL_FEATURES.get(class_name, {}).get(level, []))


# ── Feats ─────────────────────────────────────────────────────────────────────


def _feat(name: str, category: str, blurb: str, **rules: Any) -> dict[str, Any]:
    """One feat row with every optional rule key present (defaults when unset)."""
    row: dict[str, Any] = {
        "name": name,
        "category": category,
        "blurb": blurb,
        "prereq": {},
        "asi_options": None,
        "save_prof": False,
        "fixed_spells": [],
        "spell_picks": [],
        "skill_pick": None,
        "expertise_pick": 0,
        "choice": None,
        "hp_per_level": 0,
        "ac_bonus_in_armor": 0,
        "repeatable": False,
        "srd": False,
    }
    row.update(rules)
    return row


_STR_OR_DEX = {"any_ability": {"STR": 13, "DEX": 13}}

FEATS: list[dict[str, Any]] = [
    # ── General feats (level 4+) ─────────────────────────────────────────
    _feat(
        _ASI,
        "general",
        "+2 to one ability score, or +1 to two. No score goes above 20.",
        repeatable=True,
        srd=True,
    ),
    _feat(
        "Actor",
        "general",
        "Advantage on Deception and Performance to pass as someone else; mimic voices.",
        prereq={"any_ability": {"CHA": 13}},
        asi_options=["CHA"],
    ),
    _feat(
        "Athlete",
        "general",
        "Climb at full speed, stand from prone with 5 ft. of movement, short run-up jumps.",
        prereq=_STR_OR_DEX,
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Charger",
        "general",
        "Dash adds 10 ft.; a straight 10-ft. rush into a hit adds 1d8 or a 10-ft. shove.",
        prereq=_STR_OR_DEX,
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Chef",
        "general",
        "Cook's utensils; a Short Rest meal heals extra, and treats that grant temp HP.",
        asi_options=["CON", "WIS"],
    ),
    _feat(
        "Crossbow Expert",
        "general",
        "Ignore Loading, no disadvantage shooting in melee, stronger off-hand crossbow shot.",
        prereq={"any_ability": {"DEX": 13}},
        asi_options=["DEX"],
    ),
    _feat(
        "Crusher",
        "general",
        "Bludgeoning hits shove 5 ft. once a turn; your crits give allies advantage.",
        prereq={"any_ability": {"STR": 13, "CON": 13}},
        asi_options=["STR", "CON"],
    ),
    _feat(
        "Defensive Duelist",
        "general",
        "Holding a Finesse weapon, your reaction adds your proficiency bonus to AC vs a hit.",
        prereq={"any_ability": {"DEX": 13}},
        asi_options=["DEX"],
    ),
    _feat(
        "Dual Wielder",
        "general",
        "Off-hand bonus attack with a non-Light weapon; draw or stow two weapons at once.",
        prereq=_STR_OR_DEX,
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Durable",
        "general",
        "Advantage on death saves; spend a Hit Die as a bonus action to heal.",
        asi_options=["CON"],
    ),
    _feat(
        "Elemental Adept",
        "general",
        "Your spells of one damage type ignore resistance and treat 1s as 2s.",
        prereq={"spellcasting": True},
        asi_options=_MENTAL,
        choice={
            "label": "Damage type",
            "options": ["Acid", "Cold", "Fire", "Lightning", "Thunder"],
        },
        repeatable=True,
    ),
    _feat(
        "Fey Touched",
        "general",
        "Learn Misty Step and one 1st-level Divination or Enchantment spell; each free once a Long Rest.",  # noqa: E501
        asi_options=_MENTAL,
        fixed_spells=["Misty Step"],
        spell_picks=[{"count": 1, "level": 1, "schools": ["Divination", "Enchantment"]}],
    ),
    _feat(
        "Grappler",
        "general",
        "Hit and grapple with one Unarmed Strike; advantage on attacks against your grapple.",
        prereq=_STR_OR_DEX,
        asi_options=_PHYSICAL,
        srd=True,
    ),
    _feat(
        "Great Weapon Master",
        "general",
        "Heavy-weapon hits add your proficiency bonus; a crit or kill earns a bonus attack.",
        prereq={"any_ability": {"STR": 13}},
        asi_options=["STR"],
    ),
    _feat(
        "Heavily Armored",
        "general",
        "Training with heavy armor.",
        prereq={"armor": "medium"},
        asi_options=["STR", "CON"],
    ),
    _feat(
        "Heavy Armor Master",
        "general",
        "In heavy armor, shave your proficiency bonus off bludgeoning, piercing and slashing hits.",
        prereq={"armor": "heavy"},
        asi_options=["STR", "CON"],
    ),
    _feat(
        "Inspiring Leader",
        "general",
        "After a rest, up to six allies gain temp HP equal to your level + WIS or CHA modifier.",
        prereq={"any_ability": {"WIS": 13, "CHA": 13}},
        asi_options=["WIS", "CHA"],
    ),
    _feat(
        "Keen Mind",
        "general",
        "Proficiency (or expertise) in one knowledge skill; Study as a bonus action.",
        prereq={"any_ability": {"INT": 13}},
        asi_options=["INT"],
        skill_pick={
            "count": 1,
            "from": ["Arcana", "History", "Investigation", "Nature", "Religion"],
            "upgrade": True,
        },
    ),
    _feat(
        "Lightly Armored",
        "general",
        "Training with light armor and shields.",
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Mage Slayer",
        "general",
        "Your hits rattle concentration; once a rest, turn a failed INT/WIS/CHA save into a success.",  # noqa: E501
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Martial Weapon Training",
        "general",
        "Proficiency with martial weapons.",
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Medium Armor Master",
        "general",
        "Add up to +3 from DEX to AC in medium armor instead of +2.",
        prereq={"armor": "medium"},
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Moderately Armored",
        "general",
        "Training with medium armor and shields.",
        prereq={"armor": "light"},
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Mounted Combatant",
        "general",
        "Advantage against smaller foes while mounted; shield your mount from attacks and blasts.",
        asi_options=["STR", "DEX", "WIS"],
    ),
    _feat(
        "Observant",
        "general",
        "Proficiency (or expertise) in Insight, Investigation or Perception; Search as a bonus action.",  # noqa: E501
        prereq={"any_ability": {"INT": 13, "WIS": 13}},
        asi_options=["INT", "WIS"],
        skill_pick={
            "count": 1,
            "from": ["Insight", "Investigation", "Perception"],
            "upgrade": True,
        },
    ),
    _feat(
        "Piercer",
        "general",
        "Reroll one piercing damage die a turn; piercing crits roll an extra die.",
        prereq=_STR_OR_DEX,
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Poisoner",
        "general",
        "Your poison damage ignores resistance; brew poison doses with a poisoner's kit.",
        asi_options=["DEX", "INT"],
    ),
    _feat(
        "Polearm Master",
        "general",
        "Bonus-action butt-end strike with a polearm; strike foes that step into your reach.",
        prereq=_STR_OR_DEX,
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Resilient",
        "general",
        "+1 to an ability and proficiency in that ability's saving throws.",
        asi_options="any",
        save_prof=True,
    ),
    _feat(
        "Ritual Caster",
        "general",
        "Learn a few 1st-level rituals and cast one quickly once a Long Rest.",
        prereq={"any_ability": {"INT": 13, "WIS": 13, "CHA": 13}},
        asi_options=_MENTAL,
    ),
    _feat(
        "Sentinel",
        "general",
        "Strike foes that Disengage or hit your allies; your opportunity hits stop them cold.",
        prereq=_STR_OR_DEX,
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Shadow Touched",
        "general",
        "Learn Invisibility and one 1st-level Illusion or Necromancy spell; each free once a Long Rest.",  # noqa: E501
        asi_options=_MENTAL,
        fixed_spells=["Invisibility"],
        spell_picks=[{"count": 1, "level": 1, "schools": ["Illusion", "Necromancy"]}],
    ),
    _feat(
        "Sharpshooter",
        "general",
        "Ranged attacks ignore most cover, no penalty in melee or at long range.",
        prereq={"any_ability": {"DEX": 13}},
        asi_options=["DEX"],
    ),
    _feat(
        "Shield Master",
        "general",
        "Shield-bash to push or knock prone; take no damage on a DEX save you make.",
        prereq={"armor": "shields"},
        asi_options=["STR"],
    ),
    _feat(
        "Skill Expert",
        "general",
        "Proficiency in one skill and expertise in one skill you're proficient in.",
        asi_options="any",
        skill_pick={"count": 1, "from": None, "upgrade": False},
        expertise_pick=1,
    ),
    _feat(
        "Skulker",
        "general",
        "Blindsight 10 ft., advantage hiding in combat, a missed shot doesn't give you away.",
        prereq={"any_ability": {"DEX": 13}},
        asi_options=["DEX"],
    ),
    _feat(
        "Slasher",
        "general",
        "Slashing hits cut speed by 10 ft.; slashing crits give the foe disadvantage.",
        prereq=_STR_OR_DEX,
        asi_options=_PHYSICAL,
    ),
    _feat(
        "Speedy",
        "general",
        "+10 ft. speed, Dash ignores difficult terrain, opportunity attacks against you falter.",
        prereq={"any_ability": {"DEX": 13, "CON": 13}},
        asi_options=["DEX", "CON"],
    ),
    _feat(
        "Spell Sniper",
        "general",
        "Spell attacks ignore most cover, no penalty in melee, and reach 60 ft. farther.",
        prereq={"spellcasting": True},
        asi_options=_MENTAL,
    ),
    _feat(
        "Telekinetic",
        "general",
        "An invisible, longer-reaching Mage Hand and a bonus-action telekinetic shove.",
        asi_options=_MENTAL,
        fixed_spells=["Mage Hand"],
    ),
    _feat(
        "Telepathic",
        "general",
        "Speak mind to mind within 60 ft.; Detect Thoughts free once a Long Rest.",
        asi_options=_MENTAL,
        fixed_spells=["Detect Thoughts"],
    ),
    _feat(
        "War Caster",
        "general",
        "Advantage on concentration saves, cast as an opportunity attack, cast with hands full.",
        prereq={"spellcasting": True},
        asi_options=_MENTAL,
    ),
    _feat(
        "Weapon Master",
        "general",
        "Use the mastery property of one more kind of weapon (swap it on a Long Rest).",
        asi_options=_PHYSICAL,
    ),
    # ── Fighting Style feats (need the Fighting Style feature) ───────────
    _feat(
        "Archery",
        "fighting_style",
        "+2 to attack rolls with ranged weapons.",
        prereq={"fighting_style": True},
        srd=True,
    ),
    _feat(
        "Blind Fighting",
        "fighting_style",
        "Blindsight 10 ft.",
        prereq={"fighting_style": True},
    ),
    _feat(
        "Defense",
        "fighting_style",
        "+1 AC while you wear armor.",
        prereq={"fighting_style": True},
        ac_bonus_in_armor=1,
        srd=True,
    ),
    _feat(
        "Dueling",
        "fighting_style",
        "+2 damage with a one-handed melee weapon and no other weapon.",
        prereq={"fighting_style": True},
    ),
    _feat(
        "Great Weapon Fighting",
        "fighting_style",
        "Treat 1s and 2s as 3s on two-handed melee damage dice.",
        prereq={"fighting_style": True},
        srd=True,
    ),
    _feat(
        "Interception",
        "fighting_style",
        "Reaction: cut the damage an adjacent ally takes by 1d10 + proficiency bonus.",
        prereq={"fighting_style": True},
    ),
    _feat(
        "Protection",
        "fighting_style",
        "Reaction with a shield: give an attack on an adjacent ally disadvantage.",
        prereq={"fighting_style": True},
    ),
    _feat(
        "Thrown Weapon Fighting",
        "fighting_style",
        "+2 damage with thrown weapons, drawn as part of the attack.",
        prereq={"fighting_style": True},
    ),
    _feat(
        "Two-Weapon Fighting",
        "fighting_style",
        "Add your ability modifier to the off-hand attack's damage.",
        prereq={"fighting_style": True},
        srd=True,
    ),
    _feat(
        "Unarmed Fighting",
        "fighting_style",
        "Unarmed Strikes deal d6 (d8 with both hands free) and bruise a creature you grapple.",
        prereq={"fighting_style": True},
    ),
    # ── Origin feats (no prerequisite, so a level-4 pick may be one) ─────
    _feat(
        "Alert", "origin", "Add proficiency to initiative; swap initiative with an ally.", srd=True
    ),
    _feat("Crafter", "origin", "Three artisan's tools, shop discounts, fast crafting."),
    _feat("Healer", "origin", "Heal with a Healer's Kit; reroll 1s on healing dice."),
    _feat("Lucky", "origin", "Luck Points (= proficiency bonus) for advantage or to spoil a hit."),
    _feat(
        "Magic Initiate",
        "origin",
        "Two cantrips and one 1st-level spell from the Cleric, Druid or Wizard list.",
        choice={"label": "Spell list", "options": ["Cleric", "Druid", "Wizard"]},
        spell_picks=[
            {"count": 2, "level": 0, "list_from_choice": True},
            {"count": 1, "level": 1, "list_from_choice": True},
        ],
        repeatable=True,
        srd=True,
    ),
    _feat("Musician", "origin", "Three instruments; inspire allies after a rest."),
    _feat(
        "Savage Attacker",
        "origin",
        "Once a turn, roll weapon damage twice and keep the higher.",
        srd=True,
    ),
    _feat(
        "Skilled",
        "origin",
        "Proficiency in any three skills (or tools: tell your DM).",
        skill_pick={"count": 3, "from": None, "upgrade": False},
        repeatable=True,
        srd=True,
    ),
    _feat("Tavern Brawler", "origin", "Harder punches, reroll 1s, shove with a hit, improvise."),
    _feat(
        "Tough", "origin", "+2 hit points per level, now and for every level after.", hp_per_level=2
    ),
]

FEATS_BY_NAME: dict[str, dict[str, Any]] = {f["name"].casefold(): f for f in FEATS}

# Common picks per class: the guide floats these to the top as "popular for a <class>".
POPULAR_FEATS: dict[str, list[str]] = {
    "Barbarian": [_ASI, "Great Weapon Master", "Sentinel", "Polearm Master", "Durable", "Tough"],
    "Bard": [_ASI, "War Caster", "Fey Touched", "Inspiring Leader", "Resilient", "Skill Expert"],
    "Cleric": [_ASI, "War Caster", "Resilient", "Fey Touched", "Heavily Armored", "Alert"],
    "Druid": [_ASI, "War Caster", "Resilient", "Fey Touched", "Telekinetic", "Elemental Adept"],
    "Fighter": [_ASI, "Great Weapon Master", "Sentinel", "Sharpshooter", "Polearm Master", "Tough"],
    "Monk": [_ASI, "Mage Slayer", "Resilient", "Speedy", "Alert", "Tough"],
    "Paladin": [
        _ASI,
        "Sentinel",
        "Great Weapon Master",
        "Shield Master",
        "War Caster",
        "Inspiring Leader",
    ],  # noqa: E501
    "Ranger": [_ASI, "Sharpshooter", "Crossbow Expert", "Skulker", "Fey Touched", "Alert"],
    "Rogue": [_ASI, "Skulker", "Sharpshooter", "Crossbow Expert", "Mage Slayer", "Speedy"],
    "Sorcerer": [_ASI, "War Caster", "Elemental Adept", "Fey Touched", "Spell Sniper", "Resilient"],
    "Warlock": [_ASI, "War Caster", "Fey Touched", "Spell Sniper", "Resilient", "Telekinetic"],
    "Wizard": [_ASI, "War Caster", "Resilient", "Fey Touched", "Alert", "Telekinetic"],
}


def base_feat_name(entry: str) -> str:
    """'Elemental Adept (Fire)' → 'Elemental Adept'; 'Metamagic: X' stays as written."""
    return entry.split(" (")[0].strip()


def feat_qualifies(
    feat: dict[str, Any],
    *,
    scores: dict[str, int],
    is_caster: bool,
    armor_training: set[str],
    has_fighting_style: bool,
    current_feats: list[str],
) -> tuple[bool, str | None]:
    """Whether a PC may take ``feat`` right now, and why not when they can't.

    Args:
        feat: A row from ``FEATS``.
        scores: Ability scores *before* this level's increase (the book checks prerequisites
            against the scores you have when you pick).
        is_caster: The PC has a Spellcasting or Pact Magic feature.
        armor_training: Armor categories the PC is trained in ("light", "medium", ...).
        has_fighting_style: The PC has the Fighting Style feature.
        current_feats: Feat names already on the sheet.

    Returns:
        ``(ok, reason)`` — reason is a short human sentence when ``ok`` is False.
    """
    taken = {base_feat_name(f).casefold() for f in current_feats}
    if not feat["repeatable"] and feat["name"].casefold() in taken:
        return False, "Already taken."
    pre = feat["prereq"]
    need = pre.get("any_ability")
    if need and not any(scores.get(a, 0) >= v for a, v in need.items()):
        return False, "Needs " + " or ".join(f"{a} {v}+" for a, v in need.items()) + "."
    if pre.get("spellcasting") and not is_caster:
        return False, "Needs the Spellcasting or Pact Magic feature."
    if pre.get("armor") and pre["armor"] not in armor_training:
        label = "shield" if pre["armor"] == "shields" else f"{pre['armor']} armor"
        return False, f"Needs {label} training."
    if pre.get("fighting_style") and not has_fighting_style:
        return False, "Needs the Fighting Style feature."
    return True, None


# ── What changes in the numbers ───────────────────────────────────────────────


def _step(level: int, table: list[tuple[int, Any]]) -> Any:
    """Value from a (from_level, value) table, ascending: last row whose level <= ``level``."""
    out = None
    for at, value in table:
        if level >= at:
            out = value
    return out


def proficiency_bonus(level: int) -> int:
    """2024 proficiency bonus by level."""
    return 2 + (max(1, min(20, level)) - 1) // 4


_SCALES: dict[str, list[tuple[str, list[tuple[int, Any]]]]] = {
    "Barbarian": [
        ("Rages", [(1, 2), (3, 3), (6, 4), (12, 5), (17, 6)]),
        ("Rage damage", [(1, "+2"), (9, "+3"), (16, "+4")]),
        ("Weapon Mastery kinds", [(1, 2), (4, 3), (10, 4)]),
    ],
    "Bard": [("Bardic Inspiration die", [(1, "d6"), (5, "d8"), (10, "d10"), (15, "d12")])],
    "Cleric": [("Channel Divinity uses", [(2, 2), (6, 3), (18, 4)])],
    "Druid": [
        ("Wild Shape uses", [(2, 2), (6, 3), (17, 4)]),
        ("Wild Shape forms known", [(2, 4), (4, 6), (8, 8)]),
        ("Wild Shape max CR", [(2, "1/4, no fly speed"), (4, "1/2, no fly speed"), (8, "1")]),
    ],
    "Fighter": [
        ("Second Wind uses", [(1, 2), (4, 3), (10, 4)]),
        ("Weapon Mastery kinds", [(1, 3), (4, 4), (10, 5), (16, 6)]),
    ],
    "Monk": [
        ("Martial Arts die", [(1, "d6"), (5, "d8"), (11, "d10"), (17, "d12")]),
        ("Focus Points", [(lvl, lvl) for lvl in range(2, 21)]),
        (
            "Unarmored Movement",
            [(2, "+10 ft."), (6, "+15 ft."), (10, "+20 ft."), (14, "+25 ft."), (18, "+30 ft.")],
        ),  # noqa: E501
    ],
    "Paladin": [
        ("Lay on Hands pool", [(lvl, f"{5 * lvl} HP") for lvl in range(1, 21)]),
        ("Channel Divinity uses", [(3, 2), (11, 3)]),
    ],
    "Ranger": [("Favored Enemy (free Hunter's Mark)", [(1, 2), (5, 3), (9, 4), (13, 5), (17, 6)])],
    "Rogue": [("Sneak Attack", [(lvl, f"{(lvl + 1) // 2}d6") for lvl in range(1, 21)])],
    "Sorcerer": [
        ("Sorcery Points", [(lvl, lvl) for lvl in range(2, 21)]),
        ("Metamagic options", [(2, 2), (10, 4), (17, 6)]),
    ],
    "Warlock": [
        (
            "Eldritch Invocations",
            [(1, 1), (2, 3), (5, 5), (7, 6), (9, 7), (12, 8), (15, 9), (18, 10)],
        ),  # noqa: E501
    ],
}


def scaling_notes(class_name: str, old_level: int, new_level: int, *, is_caster: bool) -> list[str]:
    """Numbers that change between two levels, as short "X: a → b" lines.

    Spell slots are left to the service (it owns the slot tables).
    """
    notes: list[str] = []
    old_pb, new_pb = proficiency_bonus(old_level), proficiency_bonus(new_level)
    if new_pb != old_pb:
        notes.append(
            f"Proficiency bonus: +{old_pb} → +{new_pb} (attacks, proficient saves and skills, "
            "spell DC all rise)."
        )
    if is_caster and any(old_level < t <= new_level for t in (5, 11, 17)):
        notes.append("Damaging cantrips roll one more die.")
    for label, table in _SCALES.get(class_name, []):
        before, after = _step(old_level, table), _step(new_level, table)
        if after is not None and before != after:
            notes.append(f"{label}: {before if before is not None else '—'} → {after}")
    if class_name == "Wizard" and new_level > 1:
        notes.append("Add two Wizard spells to your spellbook (pick them below).")
    return notes
