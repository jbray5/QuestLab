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
    # Plan 126 — the character creator explains every feature it lists. Own words, not book
    # text. "Class: Feature" keys win over plain names where two classes' versions differ.
    "Spellcasting": "Cast spells from your class list with spell slots; cantrips cost nothing.",
    "Weapon Mastery": "Use the mastery property (Cleave, Topple, Vex...) of a few weapon kinds "
    "you choose; swap one after a Long Rest.",
    "Fighting Style": "Choose a Fighting Style feat, such as Defense (+1 AC in armor) or "
    "Archery (+2 to ranged attacks). Note it on your sheet.",
    "Expertise": "Double your proficiency bonus on two skills you're already proficient in. "
    "Mark them on your sheet.",
    "Channel Divinity": "A few uses of divine power that come back on a Short or Long Rest.",
    "Rage": "Bonus action: rage, kept up turn by turn for up to 10 minutes. Extra damage on "
    "Strength attacks, resistance to weapon damage, advantage on Strength checks and saves.",
    "Barbarian: Unarmored Defense": "With no armor, your Armor Class is 10 + your Dexterity "
    "and Constitution modifiers (a shield still adds 2).",
    "Danger Sense": "Advantage on Dexterity saves unless you're Incapacitated.",
    "Reckless Attack": "Strength attacks with advantage this turn; attacks against you have "
    "advantage until your next turn.",
    "Primal Knowledge": "One more Barbarian skill; while raging, some checks can use Strength.",
    "Bardic Inspiration": "Bonus action: give an ally a die to add to a d20 test they fail. "
    "Uses equal your Charisma modifier per Long Rest.",
    "Jack of All Trades": "Add half your proficiency bonus to skill checks you aren't "
    "proficient in.",
    "Divine Order": "Choose Protector (heavy armor, martial weapons) or Thaumaturge (one more "
    "cantrip, Wisdom added to Arcana and Religion). Note it on your sheet.",
    "Druidic": "You know Druidic, the secret language, and always have Speak with Animals "
    "prepared.",
    "Primal Order": "Choose Magician (one more cantrip, Wisdom added to Arcana and Nature) or "
    "Warden (martial weapons, medium armor). Note it on your sheet.",
    "Wild Shape": "Bonus action: become a beast form you know for a while; a few uses that "
    "come back on rests.",
    "Wild Companion": "Spend a slot or a Wild Shape use to summon a familiar.",
    "Second Wind": "Bonus action: regain 1d10 + your Fighter level hit points; a few uses that "
    "come back on rests.",
    "Action Surge": "Once per Short or Long Rest, take one extra action on your turn.",
    "Tactical Mind": "Spend a Second Wind use to add 1d10 to an ability check you fail.",
    "Martial Arts": "Use Dexterity for unarmed strikes and Monk weapons, roll your Martial Arts "
    "die for their damage, and strike unarmed as a bonus action.",
    "Monk: Unarmored Defense": "With no armor or shield, your Armor Class is 10 + your "
    "Dexterity and Wisdom modifiers.",
    "Monk's Focus": "Focus Points fuel Flurry of Blows, Patient Defense and Step of the Wind; "
    "they come back on a Short or Long Rest.",
    "Unarmored Movement": "Your speed rises while you wear no armor and carry no shield.",
    "Uncanny Metabolism": "Once per Long Rest, rolling initiative restores your Focus Points "
    "and some hit points.",
    "Deflect Attacks": "Reaction: shrink the damage of an attack that hits you, and throw it "
    "back if it drops to 0.",
    "Lay On Hands": "A healing pool of 5 hit points per Paladin level, spent by touch; it "
    "refills on a Long Rest.",
    "Paladin's Smite": "Divine Smite is always prepared: extra radiant damage when you hit.",
    "Favored Enemy": "Hunter's Mark is always prepared, and a few casts a day cost no slot.",
    "Deft Explorer": "Expertise in one skill and two more languages. Note them on your sheet.",
    "Sneak Attack": "Once a turn, extra damage when you hit with advantage or an ally is next "
    "to your target.",
    "Thieves' Cant": "The rogues' secret language, and one more language.",
    "Cunning Action": "Bonus action: Dash, Disengage or Hide.",
    "Steady Aim": "Bonus action: advantage on your next attack, if you haven't moved this turn.",
    "Innate Sorcery": "Bonus action: for a minute your spells are harder to resist and your "
    "spell attacks have advantage; twice per Long Rest.",
    "Font of Magic": "Sorcery Points: turn them into spell slots, or slots into points.",
    "Metamagic": "Spend Sorcery Points to bend your spells: farther, quieter, doubled and more.",
    "Eldritch Invocations": "Gifts from your patron, such as Agonizing Blast or Armor of "
    "Shadows. Note your picks on your sheet.",
    "Pact Magic": "A few spell slots, all at your highest slot level, back on a Short Rest.",
    "Magical Cunning": "Once per Long Rest, a short rite brings back half your Pact Magic slots.",
    "Ritual Adept": "Cast any ritual in your spellbook without preparing it.",
    "Arcane Recovery": "Once a day on a Short Rest, regain some spent spell slots.",
    "Scholar": "Expertise in one knowledge skill, such as Arcana or History.",
    "Fast Movement": "+10 ft. speed while you aren't in heavy armor.",
    "Evasion": "A Dexterity save against an area effect: no damage on a success, half on a "
    "failure.",
    "Reliable Talent": "Ability checks you're proficient in never roll below 10.",
    # SRD subclass features at the level they arrive (see SUBCLASS_LEVEL_FEATURES).
    "Frenzy": "Raging with Reckless Attack, your first Strength hit each turn deals extra "
    "damage.",
    "Bonus Proficiencies": "Three more skills of your choice. Note them on your sheet.",
    "Cutting Words": "Reaction: spend Bardic Inspiration to take the die off a foe's attack, "
    "check or damage roll.",
    "Disciple of Life": "Your healing spells restore 2 + the spell's level more.",
    "Life Domain Spells": "Extra healing spells, always prepared.",
    "Preserve Life": "Channel Divinity: share out healing among nearby wounded allies.",
    "Circle of the Land Spells": "Choose a land; its spells are always prepared.",
    "Land's Aid": "Spend a Wild Shape use to blast foes and heal an ally in a burst of thorns "
    "and flowers.",
    "Improved Critical": "Your weapon and unarmed attacks score a critical hit on 19 or 20.",
    "Remarkable Athlete": "Advantage on initiative and Athletics checks; slip away after a "
    "critical hit.",
    "Open Hand Technique": "Flurry of Blows hits can knock a foe prone, push it, or stop its "
    "reactions.",
    "Oath of Devotion Spells": "Extra spells of your oath, always prepared.",
    "Sacred Weapon": "Channel Divinity: add your Charisma modifier to attacks with a glowing "
    "weapon for 10 minutes.",
    "Hunter's Lore": "You know your Hunter's Mark target's resistances and weaknesses.",
    "Hunter's Prey": "Choose Colossus Slayer (extra damage to the wounded) or Horde Breaker "
    "(an extra attack on a second foe).",
    "Fast Hands": "Cunning Action can also pick a lock, disarm a trap or use an object.",
    "Second-Story Work": "Climb at full speed and jump farther, using Dexterity.",
    "Draconic Resilience": "+1 hit point per Sorcerer level, and with no armor your Armor "
    "Class is 10 + your Dexterity and Charisma modifiers.",
    "Draconic Spells": "Extra dragon-themed spells, always prepared.",
    "Dark One's Blessing": "Temporary hit points whenever you drop a foe to 0.",
    "Fiend Spells": "Extra fiendish spells, always prepared.",
    "Evocation Savant": "Two Evocation spells go into your spellbook free, and one more each "
    "new spell level.",
    "Potent Cantrip": "A damaging cantrip that misses (or is saved against) still deals half "
    "damage.",
}

# Plan 126 — feature names each SRD 5.2.1 subclass gains, by level (names from the SRD class
# chapters). The creator lists them so "what does this subclass give me?" has an answer.
SUBCLASS_LEVEL_FEATURES: dict[str, dict[int, list[str]]] = {
    "Berserker": {
        3: ["Frenzy"],
        6: ["Mindless Rage"],
        10: ["Retaliation"],
        14: ["Intimidating Presence"],
    },
    "College of Lore": {
        3: ["Bonus Proficiencies", "Cutting Words"],
        6: ["Magical Discoveries"],
        14: ["Peerless Skill"],
    },
    "Life Domain": {
        3: ["Disciple of Life", "Life Domain Spells", "Preserve Life"],
        6: ["Blessed Healer"],
        17: ["Supreme Healing"],
    },
    "Circle of the Land": {
        3: ["Circle of the Land Spells", "Land's Aid"],
        6: ["Natural Recovery"],
        10: ["Nature's Ward"],
        14: ["Nature's Sanctuary"],
    },
    "Champion": {
        3: ["Improved Critical", "Remarkable Athlete"],
        7: ["Additional Fighting Style"],
        10: ["Heroic Warrior"],
        15: ["Superior Critical"],
        18: ["Survivor"],
    },
    "Warrior of the Open Hand": {
        3: ["Open Hand Technique"],
        6: ["Wholeness of Body"],
        11: ["Fleet Step"],
        17: ["Quivering Palm"],
    },
    "Oath of Devotion": {
        3: ["Oath of Devotion Spells", "Sacred Weapon"],
        7: ["Aura of Devotion"],
        15: ["Smite of Protection"],
        20: ["Holy Nimbus"],
    },
    "Hunter": {
        3: ["Hunter's Lore", "Hunter's Prey"],
        7: ["Defensive Tactics"],
        11: ["Superior Hunter's Prey"],
        15: ["Superior Hunter's Defense"],
    },
    "Thief": {
        3: ["Fast Hands", "Second-Story Work"],
        9: ["Supreme Sneak"],
        13: ["Use Magic Device"],
        17: ["Thief's Reflexes"],
    },
    "Draconic Sorcery": {
        3: ["Draconic Resilience", "Draconic Spells"],
        6: ["Elemental Affinity"],
        14: ["Dragon Wings"],
        18: ["Dragon Companion"],
    },
    "Fiend Patron": {
        3: ["Dark One's Blessing", "Fiend Spells"],
        6: ["Dark One's Own Luck"],
        10: ["Fiendish Resilience"],
        14: ["Hurl Through Hell"],
    },
    "Evoker": {
        3: ["Evocation Savant", "Potent Cantrip"],
        6: ["Sculpt Spells"],
        10: ["Empowered Evocation"],
        14: ["Overchannel"],
    },
}

# Subclasses whose unarmored Armor Class adds a third ability (Draconic Resilience: CHA).
UNARMORED_AC_SUBCLASS: dict[str, str] = {"Draconic Sorcery": "CHA"}


def feature_note(class_name: str, name: str) -> str | None:
    """The plain-words note for a feature, preferring a class-specific one."""
    return FEATURE_NOTES.get(f"{class_name}: {name}") or FEATURE_NOTES.get(name)


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


# ── Plan 128: always-prepared spells ─────────────────────────────────────────
# 2024 rules: these are always prepared, cost no pick and don't count against the prepared
# number. Keyed by class level. Names from the SRD 5.2.1 class and subclass chapters.

ALWAYS_PREPARED_CLASS: dict[str, dict[int, list[str]]] = {
    "Druid": {1: ["Speak with Animals"]},  # Druidic
    "Paladin": {2: ["Divine Smite"], 5: ["Find Steed"]},  # Paladin's Smite, Faithful Steed
    "Ranger": {1: ["Hunter's Mark"]},  # Favored Enemy
}

ALWAYS_PREPARED_SUBCLASS: dict[str, dict[int, list[str]]] = {
    "Life Domain": {
        3: ["Aid", "Bless", "Cure Wounds", "Lesser Restoration"],
        5: ["Mass Healing Word", "Revivify"],
        7: ["Aura of Life", "Death Ward"],
        9: ["Greater Restoration", "Mass Cure Wounds"],
    },
    "Oath of Devotion": {
        3: ["Protection from Evil and Good", "Shield of Faith"],
        5: ["Aid", "Zone of Truth"],
        9: ["Beacon of Hope", "Dispel Magic"],
        13: ["Freedom of Movement", "Guardian of Faith"],
        17: ["Commune", "Flame Strike"],
    },
    "Draconic Sorcery": {
        3: ["Alter Self", "Chromatic Orb", "Command", "Dragon's Breath"],
        5: ["Fear", "Fly"],
        7: ["Arcane Eye", "Charm Monster"],
        9: ["Legend Lore", "Summon Dragon"],
    },
    "Fiend Patron": {
        3: ["Burning Hands", "Command", "Scorching Ray", "Suggestion"],
        5: ["Fireball", "Stinking Cloud"],
        7: ["Fire Shield", "Wall of Fire"],
        9: ["Geas", "Insect Plague"],
    },
}

# Circle of the Land: the land picked at Druid 3 (changeable after a Long Rest) sets the list.
LAND_SPELLS: dict[str, dict[int, list[str]]] = {
    "Arid": {
        3: ["Blur", "Burning Hands", "Fire Bolt"],
        5: ["Fireball"],
        7: ["Blight"],
        9: ["Wall of Stone"],
    },
    "Polar": {
        3: ["Fog Cloud", "Hold Person", "Ray of Frost"],
        5: ["Sleet Storm"],
        7: ["Ice Storm"],
        9: ["Cone of Cold"],
    },
    "Temperate": {
        3: ["Misty Step", "Shocking Grasp", "Sleep"],
        5: ["Lightning Bolt"],
        7: ["Freedom of Movement"],
        9: ["Tree Stride"],
    },
    "Tropical": {
        3: ["Acid Splash", "Ray of Sickness", "Web"],
        5: ["Stinking Cloud"],
        7: ["Polymorph"],
        9: ["Insect Plague"],
    },
}

# Which class feature gives each class's always-prepared spells ("Class:level" or "Class").
ALWAYS_PREPARED_SOURCE: dict[str, str] = {
    "Druid": "Druidic",
    "Paladin:2": "Paladin's Smite",
    "Paladin:5": "Faithful Steed",
    "Ranger": "Favored Enemy",
}

# Extra spell lists a class may prepare from, by class level (Bard 10: Magical Secrets).
EXTRA_SPELL_LISTS: dict[str, dict[int, list[str]]] = {"Bard": {10: ["Cleric", "Druid", "Wizard"]}}


def always_prepared(
    class_name: str, level: int, subclass: str | None = None, land: str | None = None
) -> list[tuple[str, str]]:
    """Spells always prepared at ``level``, as ``(spell, where it comes from)`` pairs.

    Args:
        class_name: The class.
        level: The class level.
        subclass: The subclass, once it has arrived (the SRD ones carry spell lists).
        land: Circle of the Land's chosen land, if any.

    Returns:
        Pairs in level order, no repeats (Aid from a domain and an oath counts once).
    """
    out: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(names: list[str], source: str) -> None:
        for name in names:
            if name.casefold() not in seen:
                seen.add(name.casefold())
                out.append((name, source))

    for at, names in sorted(ALWAYS_PREPARED_CLASS.get(class_name, {}).items()):
        if level >= at:
            source = ALWAYS_PREPARED_SOURCE.get(f"{class_name}:{at}")
            add(names, source or ALWAYS_PREPARED_SOURCE.get(class_name, class_name))
    for at, names in sorted(ALWAYS_PREPARED_SUBCLASS.get(subclass or "", {}).items()):
        if level >= at:
            add(names, str(subclass))
    if subclass == "Circle of the Land" and land in LAND_SPELLS:
        for at, names in sorted(LAND_SPELLS[land].items()):
            if level >= at:
                add(names, f"Circle of the Land ({land})")
    return out


def extra_spell_lists(class_name: str, level: int) -> list[str]:
    """Other class lists this class may prepare from at ``level`` (Bard 10+: Magical Secrets)."""
    out: list[str] = []
    for at, lists in sorted(EXTRA_SPELL_LISTS.get(class_name, {}).items()):
        if level >= at:
            out += [x for x in lists if x not in out]
    return out


# ── Plan 128: the class choices the creator asks for ─────────────────────────
# What a class (or SRD subclass) has you choose as it levels. ``CLASS_CHOICES`` gives a
# (from_level, how_many) table per choice, read with ``_step``; a subclass's table adds to its
# class's for the same key (the Champion's Additional Fighting Style).
#
# Recorded on the sheet the way the level-up guide records picks: a Fighting Style feat by name in
# ``feats``; Expertise as a 2 and a new skill as a 1 in ``skill_proficiencies``; anything else as
# a "Label: Choice" entry in ``feats`` (the Arena already reads "Metamagic: Twinned Spell").


def _opt(name: str, blurb: str, **effects: Any) -> dict[str, Any]:
    """One option of a class choice: a name, a one-line blurb in our words, and its effects."""
    return {"name": name, "blurb": blurb, **effects}


SCHOLAR_SKILLS = ["Arcana", "History", "Investigation", "Medicine", "Nature", "Religion"]

# Eldritch Invocations in SRD 5.2.1 with their prerequisites: a Warlock level, another
# invocation, or a damaging Warlock cantrip. The summaries are ours; play them from the book.
INVOCATIONS: list[dict[str, Any]] = [
    _opt(
        "Agonizing Blast",
        "Add your Charisma modifier to a damaging Warlock cantrip's damage.",
        level=2,
        cantrip="damage",
    ),
    _opt("Armor of Shadows", "Cast Mage Armor on yourself at will, with no slot."),
    _opt("Ascendant Step", "Cast Levitate on yourself at will, with no slot.", level=5),
    _opt("Devil's Sight", "See normally in darkness, magical or not, out to 120 ft.", level=2),
    _opt(
        "Devouring Blade",
        "Thirsting Blade gives one more extra attack.",
        level=12,
        requires="Thirsting Blade",
    ),
    _opt("Eldritch Mind", "Advantage on Constitution saves to keep Concentration."),
    _opt(
        "Eldritch Smite",
        "Spend a Pact slot when your pact weapon hits: extra force damage, and it falls prone.",
        level=5,
        requires="Pact of the Blade",
    ),
    _opt(
        "Eldritch Spear",
        "Your damaging Warlock cantrip reaches much farther.",
        level=2,
        cantrip="damage",
    ),
    _opt(
        "Fiendish Vigor",
        "Cast False Life on yourself with no slot, taking its highest roll.",
        level=2,
    ),
    _opt(
        "Gaze of Two Minds",
        "Touch a willing creature to see and hear through its senses.",
        level=5,
    ),
    _opt(
        "Gift of the Depths",
        "Breathe underwater, swim at your speed, and cast Water Breathing once a day.",
        level=5,
    ),
    _opt(
        "Gift of the Protectors",
        "A name written in your Book of Shadows drops to 1 HP instead of 0, once.",
        level=9,
        requires="Pact of the Tome",
    ),
    _opt(
        "Investment of the Chain Master",
        "Your familiar flies or swims, attacks with your spell DC, and is tougher.",
        level=5,
        requires="Pact of the Chain",
    ),
    _opt(
        "Lessons of the First Ones",
        "Gain an Origin feat of your choice (note it on your sheet).",
        level=2,
        repeatable=True,
    ),
    _opt(
        "Lifedrinker",
        "Pact weapon hits deal extra damage, and you can spend a Hit Die to heal.",
        level=9,
        requires="Pact of the Blade",
    ),
    _opt("Mask of Many Faces", "Cast Disguise Self at will, with no slot.", level=2),
    _opt("Master of Myriad Forms", "Cast Alter Self at will, with no slot.", level=5),
    _opt("Misty Visions", "Cast Silent Image at will, with no slot.", level=2),
    _opt(
        "One with Shadows",
        "In dim light or darkness, turn invisible until you move or act.",
        level=5,
    ),
    _opt("Otherworldly Leap", "Cast Jump on yourself at will, with no slot.", level=2),
    _opt(
        "Pact of the Blade",
        "Conjure a pact weapon and attack with it using Charisma.",
    ),
    _opt("Pact of the Chain", "Learn Find Familiar; your familiar can take special forms."),
    _opt(
        "Pact of the Tome",
        "A Book of Shadows with three cantrips and two rituals of your choice.",
    ),
    _opt(
        "Repelling Blast",
        "Your damaging Warlock cantrip that hits with an attack pushes the target 10 ft.",
        level=2,
        cantrip="attack",
    ),
    _opt(
        "Thirsting Blade",
        "Attack twice with your pact weapon when you take the Attack action.",
        level=5,
        requires="Pact of the Blade",
    ),
    _opt("Visions of Distant Realms", "Cast Arcane Eye at will, with no slot.", level=9),
    _opt("Whispers of the Grave", "Cast Speak with Dead at will, with no slot.", level=7),
    _opt(
        "Witch Sight",
        "See the true form of shapechangers and anything hidden by magic within 30 ft.",
        level=15,
    ),
]

METAMAGIC: list[dict[str, Any]] = [
    _opt(
        "Careful Spell",
        "Chosen creatures pass your spell's save automatically and take no half damage.",
    ),
    _opt("Distant Spell", "Double a spell's range, or make a Touch spell reach 30 ft."),
    _opt("Empowered Spell", "Reroll some of a spell's damage dice."),
    _opt(
        "Extended Spell",
        "Double a spell's duration, with advantage to keep Concentration.",
    ),
    _opt("Heightened Spell", "One target has disadvantage on its save against your spell."),
    _opt("Quickened Spell", "Cast a one-action spell as a bonus action."),
    _opt("Seeking Spell", "Reroll a spell attack that misses."),
    _opt("Subtle Spell", "Cast with no words or gestures, so nobody sees you do it."),
    _opt("Transmuted Spell", "Change a spell's damage type to another element."),
    _opt("Twinned Spell", "A single-target spell takes one more target."),
]

# A Paladin or Ranger may take two cantrips instead of a Fighting Style feat (2024).
FIGHTING_STYLE_EXTRAS: dict[str, list[dict[str, Any]]] = {
    "Paladin": [
        _opt(
            "Blessed Warrior",
            "Two Cleric cantrips instead of a feat. They count as Paladin spells, cast with "
            "Charisma.",
            cantrips={"count": 2, "list": "Cleric"},
        )
    ],
    "Ranger": [
        _opt(
            "Druidic Warrior",
            "Two Druid cantrips instead of a feat. They count as Ranger spells, cast with Wisdom.",
            cantrips={"count": 2, "list": "Druid"},
        )
    ],
}

# Every kind of choice: its label, how it is picked ("feat", "option", "weapon", "expertise" or
# "skill"), a plain-words note, whether a book entry is allowed, and the "Label" it is recorded
# under in ``feats`` ("Divine Order: Protector").
CHOICE_KINDS: dict[str, dict[str, Any]] = {
    "fighting_style": {
        "label": "Fighting Style",
        "kind": "feat",
        "note": "A Fighting Style feat: a way of fighting you have trained in.",
        "book": True,
        "record": "Fighting Style",
    },
    "weapon_mastery": {
        "label": "Weapon Mastery",
        "kind": "weapon",
        "note": "Kinds of weapon whose mastery property you can use, such as a Longsword's Sap. "
        "You can swap one after a Long Rest.",
        "record": "Weapon Mastery",
    },
    "expertise": {
        "label": "Expertise",
        "kind": "expertise",
        "note": "Skills you're already trained in: your proficiency bonus counts twice for them.",
    },
    "scholar": {
        "label": "Scholar",
        "kind": "expertise",
        "note": "Expertise in one knowledge skill you're trained in.",
        "pool": SCHOLAR_SKILLS,
    },
    "primal_knowledge": {
        "label": "Primal Knowledge",
        "kind": "skill",
        "note": "One more skill from the Barbarian list.",
        "pool": "class",
    },
    "bonus_proficiencies": {
        "label": "Bonus Proficiencies",
        "kind": "skill",
        "note": "Three more skills of your choice.",
    },
    "divine_order": {
        "label": "Divine Order",
        "kind": "option",
        "note": "Your role in your faith.",
        "record": "Divine Order",
        "options": [
            _opt(
                "Protector",
                "Trained for battle: heavy armor and martial weapons.",
                armor=["heavy"],
            ),
            _opt(
                "Thaumaturge",
                "One more Cleric cantrip, and your Wisdom helps your Arcana and Religion checks.",
                cantrips={"count": 1, "list": "Cleric"},
            ),
        ],
    },
    "primal_order": {
        "label": "Primal Order",
        "kind": "option",
        "note": "Your role in your circle.",
        "record": "Primal Order",
        "options": [
            _opt(
                "Magician",
                "One more Druid cantrip, and your Wisdom helps your Arcana and Nature checks.",
                cantrips={"count": 1, "list": "Druid"},
            ),
            _opt(
                "Warden",
                "Trained for battle: medium armor and martial weapons.",
                armor=["medium"],
            ),
        ],
    },
    "blessed_strikes": {
        "label": "Blessed Strikes",
        "kind": "option",
        "note": "Divine power in your weapon or in your cantrips.",
        "record": "Blessed Strikes",
        "options": [
            _opt(
                "Divine Strike",
                "Once a turn, a weapon hit deals 1d8 extra necrotic or radiant damage.",
            ),
            _opt("Potent Spellcasting", "Add your Wisdom modifier to Cleric cantrip damage."),
        ],
    },
    "elemental_fury": {
        "label": "Elemental Fury",
        "kind": "option",
        "note": "Nature's power in your weapon or in your cantrips.",
        "record": "Elemental Fury",
        "options": [
            _opt("Potent Spellcasting", "Add your Wisdom modifier to Druid cantrip damage."),
            _opt(
                "Primal Strike",
                "Once a turn, a weapon or Wild Shape hit deals 1d8 extra cold, fire, lightning "
                "or thunder damage.",
            ),
        ],
    },
    "invocations": {
        "label": "Eldritch Invocations",
        "kind": "option",
        "note": "Gifts from your patron. Some need a higher Warlock level or another invocation.",
        "record": "Eldritch Invocation",
        "options": INVOCATIONS,
        "book": True,
    },
    "metamagic": {
        "label": "Metamagic",
        "kind": "option",
        "note": "Ways to bend your spells with Sorcery Points.",
        "record": "Metamagic",
        "options": METAMAGIC,
        "book": True,
    },
    "land": {
        "label": "Land",
        "kind": "option",
        "note": "The land your circle draws on. It sets your Circle Spells, which are always "
        "prepared. You can change it after a Long Rest.",
        "record": "Circle of the Land",
        "options": [
            _opt(
                "Arid",
                "Blur, Burning Hands and Fire Bolt; later Fireball, Blight and Wall of Stone.",
            ),
            _opt(
                "Polar",
                "Fog Cloud, Hold Person and Ray of Frost; later Sleet Storm, Ice Storm and Cone "
                "of Cold.",
            ),
            _opt(
                "Temperate",
                "Misty Step, Shocking Grasp and Sleep; later Lightning Bolt, Freedom of Movement "
                "and Tree Stride.",
            ),
            _opt(
                "Tropical",
                "Acid Splash, Ray of Sickness and Web; later Stinking Cloud, Polymorph and Insect "
                "Plague.",
            ),
        ],
    },
    "hunters_prey": {
        "label": "Hunter's Prey",
        "kind": "option",
        "note": "How you bring a quarry down.",
        "record": "Hunter's Prey",
        "options": [
            _opt(
                "Colossus Slayer",
                "Once a turn, 1d8 extra damage to a creature that's already hurt.",
            ),
            _opt(
                "Horde Breaker",
                "Once a turn, one more attack against a different creature next to your target.",
            ),
        ],
    },
    "defensive_tactics": {
        "label": "Defensive Tactics",
        "kind": "option",
        "note": "How you keep yourself alive.",
        "record": "Defensive Tactics",
        "options": [
            _opt("Escape the Horde", "Opportunity attacks against you have disadvantage."),
            _opt(
                "Multiattack Defense",
                "A creature that hits you has disadvantage on its other attacks this turn.",
            ),
        ],
    },
}

CLASS_CHOICES: dict[str, dict[str, list[tuple[int, int]]]] = {
    "Barbarian": {"weapon_mastery": [(1, 2), (4, 3), (10, 4)], "primal_knowledge": [(3, 1)]},
    "Bard": {"expertise": [(2, 2), (9, 4)]},
    "Cleric": {"divine_order": [(1, 1)], "blessed_strikes": [(7, 1)]},
    "Druid": {"primal_order": [(1, 1)], "elemental_fury": [(7, 1)]},
    "Fighter": {"fighting_style": [(1, 1)], "weapon_mastery": [(1, 3), (4, 4), (10, 5), (16, 6)]},
    "Monk": {},
    "Paladin": {"weapon_mastery": [(1, 2)], "fighting_style": [(2, 1)]},
    # Deft Explorer (2) gives one Expertise; the level-9 Expertise feature gives two more.
    "Ranger": {
        "weapon_mastery": [(1, 2)],
        "fighting_style": [(2, 1)],
        "expertise": [(2, 1), (9, 3)],
    },
    "Rogue": {"expertise": [(1, 2), (6, 4)], "weapon_mastery": [(1, 2)]},
    "Sorcerer": {"metamagic": [(2, 2), (10, 4), (17, 6)]},
    "Warlock": {
        "invocations": [(1, 1), (2, 3), (5, 5), (7, 6), (9, 7), (12, 8), (15, 9), (18, 10)]
    },
    "Wizard": {"scholar": [(2, 1)]},
}

SUBCLASS_CHOICES: dict[str, dict[str, list[tuple[int, int]]]] = {
    "College of Lore": {"bonus_proficiencies": [(3, 3)]},
    "Champion": {"fighting_style": [(7, 1)]},  # Additional Fighting Style
    "Circle of the Land": {"land": [(3, 1)]},
    "Hunter": {"hunters_prey": [(3, 1)], "defensive_tactics": [(7, 1)]},
}

# Weapon kinds a class may master: every Simple and Martial weapon, except as filtered here.
WEAPON_MASTERY_FILTER: dict[str, str] = {"Barbarian": "melee", "Rogue": "finesse_or_light"}


def class_choice_counts(class_name: str, level: int, subclass: str | None = None) -> dict[str, int]:
    """How many picks each class choice has at ``level`` (a subclass's table adds to its class's).

    Args:
        class_name: The class.
        level: The class level.
        subclass: The subclass, once it has arrived.

    Returns:
        ``{choice key: count}`` for every choice with at least one pick, in table order.
    """
    out: dict[str, int] = {}
    for table in (CLASS_CHOICES.get(class_name, {}), SUBCLASS_CHOICES.get(subclass or "", {})):
        for key, steps in table.items():
            n = _step(level, steps) or 0
            if n:
                out[key] = out.get(key, 0) + int(n)
    return out


def mastery_weapon_ok(class_name: str, category: str, properties: list[str]) -> bool:
    """Whether ``class_name`` may master a weapon of this category with these properties."""
    rule = WEAPON_MASTERY_FILTER.get(class_name)
    cat = (category or "").casefold()
    if rule == "melee":
        return cat.endswith("melee")
    if rule == "finesse_or_light":
        props = {p.casefold() for p in properties or []}
        return cat.startswith("simple") or bool(props & {"finesse", "light"})
    return True


def choice_options(class_name: str, key: str) -> list[dict[str, Any]]:
    """The listed options for a choice (Fighting Style: the catalog's feats plus class extras)."""
    spec = CHOICE_KINDS.get(key, {})
    if spec.get("kind") == "feat":
        feats = [
            _opt(f["name"], f["blurb"], srd=f["srd"])
            for f in FEATS
            if f["category"] == "fighting_style"
        ]
        return feats + list(FIGHTING_STYLE_EXTRAS.get(class_name, []))
    return list(spec.get("options") or [])


def class_scales() -> dict[str, list[dict[str, Any]]]:
    """The per-level numbers each class tracks (Rages, Lay on Hands pool...), for explanations."""
    return {
        cls: [{"label": label, "table": [list(row) for row in table]} for label, table in rows]
        for cls, rows in _SCALES.items()
    }
