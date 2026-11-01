"""2014 level-up rules data (Plan 131): what a new level brings and which feats a PC may take.

The 2014 twin of ``levelup_2024``: the same public names, shapes and function signatures,
filled with SRD 5.1 content, so a service asks ``rulesets.levelup(pc.ruleset)`` for the
module and reads it the same way. Pure data and pure functions, no I/O.

Where a 2024 name has no 2014 meaning it keeps its type with an empty value
(``WEAPON_MASTERY_FILTER = {}``, ``POPULAR_FEATS = {}``, ``CANTRIP_SWAP_CLASSES``...), and its
function gives the neutral answer (``mastery_weapon_ok`` is always False: 2014 has no Weapon
Mastery). A few 2014-only names are added at the end of their sections:
``UNARMORED_AC_BASE_SUBCLASS``, ``SUBCLASS_ARMOR``, ``EXPANDED_SPELLS`` and
``expanded_spells``.

Source: D&D 5e SRD 5.1 (Wizards of the Coast, CC-BY-4.0). Feature names and level tables come
from the SRD 5.1 class chapters; the notes and blurbs are condensed into plain words, not book
text. Subclass names are the SRD 5.1 ones the 2014 options module uses ("Life Domain",
"School of Evocation", "The Fiend"...). Feats: the SRD 5.1 has only Grappler, so other feats
come in through the builder's "From my book" entry, recorded by name.
"""

from __future__ import annotations

from typing import Any

# Edition-neutral pieces shared with 2024: the ability list, the feat-name parser, the
# proficiency table, and the row builders (so a 2014 feat or option row has exactly the keys a
# 2024 one has).
from integrations.dnd_rules.levelup_2024 import ABILITIES  # noqa: F401  (re-exported)
from integrations.dnd_rules.levelup_2024 import base_feat_name  # noqa: F401  (re-exported)
from integrations.dnd_rules.levelup_2024 import _feat, _opt, _step
from integrations.dnd_rules.levelup_2024 import feat_qualifies as _feat_qualifies_2024
from integrations.dnd_rules.levelup_2024 import proficiency_bonus
from integrations.dnd_rules.srd_character_options_2014 import (
    DRACONIC_ANCESTRY as _DRACONIC_ANCESTRY,
)

_ASI = "Ability Score Improvement"
_SUB = "Subclass feature"

# Feature names gained at each level, per the SRD 5.1 class tables. Levels with nothing new
# are omitted. "Ability Score Improvement" marks the levels where the improvement step appears
# (level 19 is an ordinary one in 2014; there are no Epic Boons). "<Class> Subclass" marks the
# level the subclass is chosen, "Subclass feature" a later level it adds to. A die or count that
# only grows (Bardic Inspiration d8, Channel Divinity 2/rest) is in ``class_scales``, not here.
CLASS_LEVEL_FEATURES: dict[str, dict[int, list[str]]] = {
    "Barbarian": {
        1: ["Rage", "Unarmored Defense"],
        2: ["Reckless Attack", "Danger Sense"],
        3: ["Barbarian Subclass"],
        4: [_ASI],
        5: ["Extra Attack", "Fast Movement"],
        6: [_SUB],
        7: ["Feral Instinct"],
        8: [_ASI],
        9: ["Brutal Critical"],
        10: [_SUB],
        11: ["Relentless Rage"],
        12: [_ASI],
        13: ["Brutal Critical (two dice)"],
        14: [_SUB],
        15: ["Persistent Rage"],
        16: [_ASI],
        17: ["Brutal Critical (three dice)"],
        18: ["Indomitable Might"],
        19: [_ASI],
        20: ["Primal Champion"],
    },
    "Bard": {
        1: ["Spellcasting", "Bardic Inspiration"],
        2: ["Jack of All Trades", "Song of Rest"],
        3: ["Bard Subclass", "Expertise"],
        4: [_ASI],
        5: ["Font of Inspiration"],
        6: ["Countercharm", _SUB],
        8: [_ASI],
        10: ["Expertise", "Magical Secrets"],
        12: [_ASI],
        14: ["Magical Secrets", _SUB],
        16: [_ASI],
        18: ["Magical Secrets"],
        19: [_ASI],
        20: ["Superior Inspiration"],
    },
    "Cleric": {
        1: ["Spellcasting", "Cleric Subclass", "Domain Spells"],
        2: ["Channel Divinity", "Turn Undead", _SUB],
        4: [_ASI],
        5: ["Destroy Undead"],
        6: [_SUB],
        8: [_ASI, _SUB],
        10: ["Divine Intervention"],
        12: [_ASI],
        16: [_ASI],
        17: [_SUB],
        19: [_ASI],
        20: ["Divine Intervention Improvement"],
    },
    "Druid": {
        1: ["Spellcasting", "Druidic"],
        2: ["Wild Shape", "Druid Subclass"],
        4: [_ASI],
        6: [_SUB],
        8: [_ASI],
        10: [_SUB],
        12: [_ASI],
        14: [_SUB],
        16: [_ASI],
        18: ["Timeless Body", "Beast Spells"],
        19: [_ASI],
        20: ["Archdruid"],
    },
    "Fighter": {
        1: ["Fighting Style", "Second Wind"],
        2: ["Action Surge"],
        3: ["Fighter Subclass"],
        4: [_ASI],
        5: ["Extra Attack"],
        6: [_ASI],
        7: [_SUB],
        8: [_ASI],
        9: ["Indomitable"],
        10: [_SUB],
        11: ["Two Extra Attacks"],
        12: [_ASI],
        13: ["Indomitable (two uses)"],
        14: [_ASI],
        15: [_SUB],
        16: [_ASI],
        17: ["Action Surge (two uses)", "Indomitable (three uses)"],
        18: [_SUB],
        19: [_ASI],
        20: ["Three Extra Attacks"],
    },
    "Monk": {
        1: ["Unarmored Defense", "Martial Arts"],
        2: ["Ki", "Unarmored Movement"],
        3: ["Monk Subclass", "Deflect Missiles"],
        4: [_ASI, "Slow Fall"],
        5: ["Extra Attack", "Stunning Strike"],
        6: ["Ki-Empowered Strikes", _SUB],
        7: ["Evasion", "Stillness of Mind"],
        8: [_ASI],
        9: ["Unarmored Movement improvement"],
        10: ["Purity of Body"],
        11: [_SUB],
        12: [_ASI],
        13: ["Tongue of the Sun and Moon"],
        14: ["Diamond Soul"],
        15: ["Timeless Body"],
        16: [_ASI],
        17: [_SUB],
        18: ["Empty Body"],
        19: [_ASI],
        20: ["Perfect Self"],
    },
    "Paladin": {
        1: ["Divine Sense", "Lay on Hands"],
        2: ["Fighting Style", "Spellcasting", "Divine Smite"],
        3: ["Divine Health", "Paladin Subclass", "Oath Spells", "Channel Divinity"],
        4: [_ASI],
        5: ["Extra Attack"],
        6: ["Aura of Protection"],
        7: [_SUB],
        8: [_ASI],
        10: ["Aura of Courage"],
        11: ["Improved Divine Smite"],
        12: [_ASI],
        14: ["Cleansing Touch"],
        15: [_SUB],
        16: [_ASI],
        18: ["Aura improvements"],
        19: [_ASI],
        20: [_SUB],
    },
    "Ranger": {
        1: ["Favored Enemy", "Natural Explorer"],
        2: ["Fighting Style", "Spellcasting"],
        3: ["Ranger Subclass", "Primeval Awareness"],
        4: [_ASI],
        5: ["Extra Attack"],
        6: ["Favored Enemy", "Natural Explorer"],
        7: [_SUB],
        8: [_ASI, "Land's Stride"],
        10: ["Natural Explorer", "Hide in Plain Sight"],
        11: [_SUB],
        12: [_ASI],
        14: ["Favored Enemy", "Vanish"],
        15: [_SUB],
        16: [_ASI],
        18: ["Feral Senses"],
        19: [_ASI],
        20: ["Foe Slayer"],
    },
    "Rogue": {
        1: ["Expertise", "Sneak Attack", "Thieves' Cant"],
        2: ["Cunning Action"],
        3: ["Rogue Subclass"],
        4: [_ASI],
        5: ["Uncanny Dodge"],
        6: ["Expertise"],
        7: ["Evasion"],
        8: [_ASI],
        9: [_SUB],
        10: [_ASI],
        11: ["Reliable Talent"],
        12: [_ASI],
        13: [_SUB],
        14: ["Blindsense"],
        15: ["Slippery Mind"],
        16: [_ASI],
        17: [_SUB],
        18: ["Elusive"],
        19: [_ASI],
        20: ["Stroke of Luck"],
    },
    "Sorcerer": {
        1: ["Spellcasting", "Sorcerer Subclass"],
        2: ["Font of Magic"],
        3: ["Metamagic"],
        4: [_ASI],
        6: [_SUB],
        8: [_ASI],
        10: ["Metamagic"],
        12: [_ASI],
        14: [_SUB],
        16: [_ASI],
        17: ["Metamagic"],
        18: [_SUB],
        19: [_ASI],
        20: ["Sorcerous Restoration"],
    },
    "Warlock": {
        1: ["Warlock Subclass", "Pact Magic"],
        2: ["Eldritch Invocations"],
        3: ["Pact Boon"],
        4: [_ASI],
        6: [_SUB],
        8: [_ASI],
        10: [_SUB],
        11: ["Mystic Arcanum (6th level)"],
        12: [_ASI],
        13: ["Mystic Arcanum (7th level)"],
        14: [_SUB],
        15: ["Mystic Arcanum (8th level)"],
        16: [_ASI],
        17: ["Mystic Arcanum (9th level)"],
        19: [_ASI],
        20: ["Eldritch Master"],
    },
    "Wizard": {
        1: ["Spellcasting", "Arcane Recovery"],
        2: ["Wizard Subclass"],
        4: [_ASI],
        6: [_SUB],
        8: [_ASI],
        10: [_SUB],
        12: [_ASI],
        14: [_SUB],
        16: [_ASI],
        18: ["Spell Mastery"],
        19: [_ASI],
        20: ["Signature Spells"],
    },
}

# Feature names each SRD 5.1 subclass gains, by class level (names from the SRD 5.1 class
# chapters). The first level is the class's subclass level: 1 for Cleric, Sorcerer and Warlock,
# 2 for Druid and Wizard, 3 for the rest.
SUBCLASS_LEVEL_FEATURES: dict[str, dict[int, list[str]]] = {
    "Path of the Berserker": {
        3: ["Frenzy"],
        6: ["Mindless Rage"],
        10: ["Intimidating Presence"],
        14: ["Retaliation"],
    },
    "College of Lore": {
        3: ["Bonus Proficiencies", "Cutting Words"],
        6: ["Additional Magical Secrets"],
        14: ["Peerless Skill"],
    },
    "Life Domain": {
        1: ["Bonus Proficiency", "Disciple of Life"],
        2: ["Preserve Life"],
        6: ["Blessed Healer"],
        8: ["Divine Strike"],
        17: ["Supreme Healing"],
    },
    "Circle of the Land": {
        2: ["Bonus Cantrip", "Natural Recovery"],
        3: ["Circle Spells"],
        6: ["Land's Stride"],
        10: ["Nature's Ward"],
        14: ["Nature's Sanctuary"],
    },
    "Champion": {
        3: ["Improved Critical"],
        7: ["Remarkable Athlete"],
        10: ["Additional Fighting Style"],
        15: ["Superior Critical"],
        18: ["Survivor"],
    },
    "Way of the Open Hand": {
        3: ["Open Hand Technique"],
        6: ["Wholeness of Body"],
        11: ["Tranquility"],
        17: ["Quivering Palm"],
    },
    "Oath of Devotion": {
        3: ["Sacred Weapon", "Turn the Unholy"],
        7: ["Aura of Devotion"],
        15: ["Purity of Spirit"],
        20: ["Holy Nimbus"],
    },
    "Hunter": {
        3: ["Hunter's Prey"],
        7: ["Defensive Tactics"],
        11: ["Multiattack"],
        15: ["Superior Hunter's Defense"],
    },
    "Thief": {
        3: ["Fast Hands", "Second-Story Work"],
        9: ["Supreme Sneak"],
        13: ["Use Magic Device"],
        17: ["Thief's Reflexes"],
    },
    "Draconic Bloodline": {
        1: ["Dragon Ancestor", "Draconic Resilience"],
        6: ["Elemental Affinity"],
        14: ["Dragon Wings"],
        18: ["Draconic Presence"],
    },
    "The Fiend": {
        1: ["Expanded Spell List", "Dark One's Blessing"],
        6: ["Dark One's Own Luck"],
        10: ["Fiendish Resilience"],
        14: ["Hurl Through Hell"],
    },
    "School of Evocation": {
        2: ["Evocation Savant", "Sculpt Spells"],
        6: ["Potent Cantrip"],
        10: ["Empowered Evocation"],
        14: ["Overchannel"],
    },
}

# Plain-words notes for every feature above (own words, not book text). "Class: Feature" keys
# win over plain names where two classes' versions differ. Subclass features use plain names.
FEATURE_NOTES: dict[str, str] = {
    _ASI: "Take +2 to one ability (or +1 to two), or a feat instead if your DM uses feats. No "
    "score goes above 20.",
    _SUB: "Your subclass grants something new at this level: read it in your book.",
    "Extra Attack": "Attack twice whenever you take the Attack action.",
    "Two Extra Attacks": "Attack three times whenever you take the Attack action.",
    "Three Extra Attacks": "Attack four times whenever you take the Attack action.",
    "Spellcasting": "Cast spells from your class list with spell slots; cantrips cost nothing.",
    "Bard: Spellcasting": "You know a few Bard spells and cast them with spell slots; swap one "
    "when you gain a level. Cantrips cost nothing.",
    "Cleric: Spellcasting": "Each day, prepare Cleric spells (Wisdom modifier + Cleric level) "
    "and cast them with spell slots. Cantrips cost nothing.",
    "Druid: Spellcasting": "Each day, prepare Druid spells (Wisdom modifier + Druid level) and "
    "cast them with spell slots. Cantrips cost nothing.",
    "Paladin: Spellcasting": "Each day, prepare Paladin spells (Charisma modifier + half your "
    "Paladin level) and cast them with spell slots.",
    "Ranger: Spellcasting": "You know a few Ranger spells and cast them with spell slots; swap "
    "one when you gain a level.",
    "Sorcerer: Spellcasting": "You know a few Sorcerer spells and cast them with spell slots; "
    "swap one when you gain a level. Cantrips cost nothing.",
    "Wizard: Spellcasting": "Your spellbook holds your spells. Each day, prepare some of them "
    "(Intelligence modifier + Wizard level). Cantrips cost nothing.",
    "Fighting Style": "Choose a fighting style, such as Defense (+1 AC in armor) or Archery (+2 "
    "to ranged attacks). Note it on your sheet.",
    "Expertise": "Double your proficiency bonus on two skills you're already proficient in. "
    "Mark them on your sheet.",
    "Rogue: Expertise": "Double your proficiency bonus on two skills you're proficient in (or "
    "one skill and thieves' tools). Mark them on your sheet.",
    "Evasion": "A Dexterity save against an area effect: no damage on a success, half on a "
    "failure.",
    "Uncanny Dodge": "Use your reaction to halve the damage of an attack that hits you.",
    "Land's Stride": "Nonmagical difficult terrain costs no extra movement, plants don't slow or "
    "hurt you, and you have advantage on saves against magical plants.",
    "Timeless Body": "You age only one year for every ten that pass.",
    "Monk: Timeless Body": "You don't suffer the frailty of old age, magic can't age you, and "
    "you need no food or water.",
    "Channel Divinity": "Divine power you call on, once per Short or Long Rest.",
    "Cleric: Channel Divinity": "Call on divine power for Turn Undead or your domain's effect; "
    "uses come back on a Short or Long Rest.",
    "Paladin: Channel Divinity": "Call on divine power for one of your oath's effects, once per "
    "Short or Long Rest.",
    # Barbarian
    "Rage": "Bonus action: rage for 1 minute. Extra damage on Strength melee attacks, "
    "resistance to bludgeoning, piercing and slashing damage, advantage on Strength checks and "
    "saves. Not in heavy armor.",
    "Barbarian: Unarmored Defense": "With no armor, your Armor Class is 10 + your Dexterity "
    "and Constitution modifiers (a shield still adds 2).",
    "Reckless Attack": "Strength melee attacks with advantage this turn; attacks against you "
    "have advantage until your next turn.",
    "Danger Sense": "Advantage on Dexterity saves against effects you can see, such as traps and "
    "spells.",
    "Fast Movement": "+10 ft. speed while you aren't in heavy armor.",
    "Feral Instinct": "Advantage on initiative; if surprised, you can still act on your first "
    "turn by raging first.",
    "Brutal Critical": "Roll one extra weapon damage die on a melee critical hit.",
    "Brutal Critical (two dice)": "Brutal Critical now rolls two extra dice.",
    "Brutal Critical (three dice)": "Brutal Critical now rolls three extra dice.",
    "Relentless Rage": "Dropping to 0 HP while raging, pass a Constitution save (DC 10, +5 each "
    "time until you rest) to stay at 1 HP.",
    "Persistent Rage": "Your rage ends early only if you fall unconscious or choose to end it.",
    "Indomitable Might": "If a Strength check totals less than your Strength score, use the "
    "score instead.",
    "Primal Champion": "Your Strength and Constitution each rise by 4, to a maximum of 24.",
    # Bard
    "Bardic Inspiration": "Bonus action: give an ally a die to add to one ability check, attack "
    "or save. Uses equal your Charisma modifier per Long Rest.",
    "Jack of All Trades": "Add half your proficiency bonus to ability checks you aren't "
    "proficient in.",
    "Song of Rest": "During a Short Rest, allies who spend Hit Dice regain extra hit points from "
    "your music.",
    "Font of Inspiration": "Bardic Inspiration now comes back on a Short Rest too.",
    "Countercharm": "Action: you and allies within 30 ft. have advantage on saves against being "
    "frightened or charmed until your next turn ends.",
    "Magical Secrets": "Learn two spells from any class's list. They count as Bard spells and as "
    "spells you know.",
    "Superior Inspiration": "When you roll initiative with no Bardic Inspiration left, you get "
    "one back.",
    # Cleric
    "Domain Spells": "Your domain's spells are always prepared and don't count against the "
    "number you prepare.",
    "Turn Undead": "Channel Divinity: undead within 30 ft. that fail a Wisdom save flee from you "
    "for a minute.",
    "Destroy Undead": "Undead weak enough (by challenge rating) are destroyed outright when they "
    "fail against your Turn Undead.",
    "Divine Intervention": "Call on your deity: roll d100, and on your Cleric level or lower it "
    "steps in (then not again for 7 days).",
    "Divine Intervention Improvement": "Your call for divine help succeeds automatically.",
    # Druid
    "Druidic": "You know Druidic, the secret language of druids.",
    "Wild Shape": "Action: turn into a beast you have seen, twice per Short or Long Rest. Your "
    "level limits the beast.",
    "Beast Spells": "Cast many of your Druid spells while in Wild Shape.",
    "Archdruid": "Use Wild Shape as often as you like, and ignore most spell components.",
    # Fighter
    "Second Wind": "Bonus action: regain 1d10 + your Fighter level hit points, once per Short or "
    "Long Rest.",
    "Action Surge": "Once per Short or Long Rest, take one extra action on your turn.",
    "Action Surge (two uses)": "Action Surge works twice per rest (still once a turn).",
    "Indomitable": "Reroll a saving throw you fail, once per Long Rest.",
    "Indomitable (two uses)": "Indomitable works twice per Long Rest.",
    "Indomitable (three uses)": "Indomitable works three times per Long Rest.",
    # Monk
    "Martial Arts": "Use Dexterity for unarmed strikes and monk weapons, roll your Martial Arts "
    "die for their damage, and strike unarmed as a bonus action.",
    "Monk: Unarmored Defense": "With no armor or shield, your Armor Class is 10 + your "
    "Dexterity and Wisdom modifiers.",
    "Ki": "Ki points fuel Flurry of Blows, Patient Defense and Step of the Wind; they come back "
    "on a Short or Long Rest.",
    "Unarmored Movement": "Your speed rises while you wear no armor and carry no shield.",
    "Deflect Missiles": "Reaction: cut the damage of a ranged weapon hit; catch the missile and "
    "throw it back if the damage drops to 0.",
    "Slow Fall": "Use your reaction to cut falling damage by five times your Monk level.",
    "Stunning Strike": "Spend 1 ki point when you hit to try to stun the target until the end of "
    "your next turn.",
    "Ki-Empowered Strikes": "Your unarmed strikes count as magical.",
    "Stillness of Mind": "Action: end one effect that charms or frightens you.",
    "Unarmored Movement improvement": "Run along walls and across water without falling while "
    "you move.",
    "Purity of Body": "You're immune to disease and poison.",
    "Tongue of the Sun and Moon": "You understand every spoken language, and anyone with a "
    "language understands you.",
    "Diamond Soul": "Proficiency in every saving throw; spend 1 ki point to reroll a failed "
    "save.",
    "Empty Body": "Spend 4 ki points to turn invisible and resist most damage for a minute, or "
    "8 to cast Astral Projection.",
    "Perfect Self": "When you roll initiative with no ki points left, you get 4 back.",
    # Paladin
    "Divine Sense": "Action: sense celestials, fiends and undead within 60 ft. Uses equal 1 + "
    "your Charisma modifier per Long Rest.",
    "Lay on Hands": "A healing pool of 5 hit points per Paladin level, spent by touch (5 points "
    "cure a disease or poison). It refills on a Long Rest.",
    "Divine Smite": "When you hit with a melee weapon, spend a spell slot for extra radiant "
    "damage: 2d8, plus 1d8 per slot level above 1st.",
    "Divine Health": "You're immune to disease.",
    "Oath Spells": "Your oath's spells are always prepared and don't count against the number "
    "you prepare.",
    "Aura of Protection": "You and allies within 10 ft. add your Charisma modifier to saves (at "
    "least +1).",
    "Aura of Courage": "You and allies within 10 ft. can't be frightened while you're conscious.",
    "Improved Divine Smite": "Every melee weapon hit deals 1d8 extra radiant damage.",
    "Cleansing Touch": "Action: end a spell on yourself or a willing creature you touch. Uses "
    "equal your Charisma modifier per Long Rest.",
    "Aura improvements": "Your auras now reach 30 ft.",
    # Ranger
    "Favored Enemy": "Choose a type of enemy: advantage on Survival checks to track it and on "
    "checks to recall facts about it, and one language it speaks.",
    "Natural Explorer": "Choose a type of terrain: double proficiency on Intelligence and Wisdom "
    "checks about it, and easier travel there.",
    "Primeval Awareness": "Spend a spell slot to sense nearby aberrations, celestials, dragons, "
    "elementals, fey, fiends and undead.",
    "Hide in Plain Sight": "Spend a minute on camouflage for +10 to Stealth while you stay still "
    "against a surface.",
    "Vanish": "Hide as a bonus action, and nonmagical means can't track you.",
    "Feral Senses": "No disadvantage attacking creatures you can't see; you sense invisible "
    "creatures within 30 ft.",
    "Foe Slayer": "Once a turn, add your Wisdom modifier to an attack or damage roll against a "
    "favored enemy.",
    # Rogue
    "Sneak Attack": "Once a turn, extra damage when you hit with a finesse or ranged weapon and "
    "have advantage, or an ally is next to your target.",
    "Thieves' Cant": "The rogues' secret language of words and signs.",
    "Cunning Action": "Bonus action: Dash, Disengage or Hide.",
    "Reliable Talent": "Ability checks you're proficient in never roll below 10.",
    "Blindsense": "You know where hidden and invisible creatures within 10 ft. are, if you can "
    "hear.",
    "Slippery Mind": "Proficiency in Wisdom saving throws.",
    "Elusive": "No attack roll has advantage against you while you aren't incapacitated.",
    "Stroke of Luck": "Turn a miss into a hit, or a failed check into a 20, once per Short or "
    "Long Rest.",
    # Sorcerer
    "Font of Magic": "Sorcery points: turn them into spell slots, or slots into points.",
    "Metamagic": "Spend sorcery points to bend your spells: farther, quieter, doubled and more.",
    "Sorcerous Restoration": "Regain 4 sorcery points on a Short Rest.",
    # Warlock
    "Pact Magic": "A few spell slots, all at your highest slot level, back on a Short Rest.",
    "Eldritch Invocations": "Gifts from your patron, such as Agonizing Blast or Armor of "
    "Shadows. Note your picks on your sheet.",
    "Pact Boon": "Your patron's gift: Pact of the Chain, the Blade or the Tome.",
    "Mystic Arcanum (6th level)": "Pick a 6th-level Warlock spell to cast once per Long Rest "
    "with no slot.",
    "Mystic Arcanum (7th level)": "Pick a 7th-level Warlock spell to cast once per Long Rest "
    "with no slot.",
    "Mystic Arcanum (8th level)": "Pick an 8th-level Warlock spell to cast once per Long Rest "
    "with no slot.",
    "Mystic Arcanum (9th level)": "Pick a 9th-level Warlock spell to cast once per Long Rest "
    "with no slot.",
    "Eldritch Master": "Once per Long Rest, spend a minute to regain all your Pact Magic slots.",
    # Wizard
    "Arcane Recovery": "Once a day on a Short Rest, regain spent spell slots worth up to half "
    "your Wizard level (rounded up).",
    "Spell Mastery": "Cast one 1st-level and one 2nd-level spell of your choice at will.",
    "Signature Spells": "Two 3rd-level spells always prepared, each cast once per rest with no "
    "slot.",
    # SRD 5.1 subclass features at the level they arrive (see SUBCLASS_LEVEL_FEATURES).
    "Frenzy": "Rage in a frenzy: a melee weapon attack as a bonus action each turn, then one "
    "level of exhaustion when the rage ends.",
    "Mindless Rage": "You can't be charmed or frightened while raging.",
    "Intimidating Presence": "Action: frighten a creature within 30 ft. that fails a Wisdom "
    "save.",
    "Retaliation": "Reaction: make a melee attack against a creature within 5 ft. that damages "
    "you.",
    "Bonus Proficiencies": "Three more skills of your choice. Note them on your sheet.",
    "Cutting Words": "Reaction: spend Bardic Inspiration to take the die off a foe's attack, "
    "check or damage roll.",
    "Additional Magical Secrets": "Learn two spells from any class's list. They don't count "
    "against the spells you know.",
    "Peerless Skill": "Spend Bardic Inspiration to add the die to your own ability check.",
    "Bonus Proficiency": "Training with heavy armor.",
    "Disciple of Life": "Your healing spells of 1st level or higher restore 2 + the spell's "
    "level more.",
    "Preserve Life": "Channel Divinity: share out five times your Cleric level in healing among "
    "creatures within 30 ft. (up to half their maximum).",
    "Blessed Healer": "When your healing spell heals someone else, you heal 2 + the spell's "
    "level too.",
    "Divine Strike": "Once a turn, a weapon hit deals 1d8 extra radiant damage (2d8 from 14th "
    "level).",
    "Supreme Healing": "Healing dice from your spells always roll their highest number.",
    "Bonus Cantrip": "One more Druid cantrip.",
    "Natural Recovery": "Once a day on a Short Rest, regain spent spell slots worth up to half "
    "your Druid level (rounded up).",
    "Circle Spells": "Your land's spells are always prepared and don't count against the number "
    "you prepare.",
    "Nature's Ward": "Elementals and fey can't charm or frighten you, and you're immune to "
    "poison and disease.",
    "Nature's Sanctuary": "Beasts and plants must pass a Wisdom save to attack you.",
    "Improved Critical": "Your weapon attacks score a critical hit on 19 or 20.",
    "Remarkable Athlete": "Add half your proficiency bonus (rounded up) to Strength, Dexterity "
    "and Constitution checks you aren't proficient in; long jumps go farther.",
    "Additional Fighting Style": "Choose a second fighting style.",
    "Superior Critical": "Your weapon attacks score a critical hit on 18 to 20.",
    "Survivor": "At the start of your turn, regain 5 + your Constitution modifier hit points if "
    "you're at half or less (but above 0).",
    "Open Hand Technique": "Flurry of Blows hits can knock a foe prone, push it 15 ft., or stop "
    "its reactions.",
    "Wholeness of Body": "Action: regain three times your Monk level in hit points, once per "
    "Long Rest.",
    "Tranquility": "After a Long Rest, you're protected as by the Sanctuary spell until your "
    "next one.",
    "Quivering Palm": "Spend 3 ki points on an unarmed hit to set deadly vibrations you can "
    "trigger later.",
    "Sacred Weapon": "Channel Divinity: for a minute, add your Charisma modifier to attacks with "
    "a glowing weapon.",
    "Turn the Unholy": "Channel Divinity: fiends and undead within 30 ft. that fail a Wisdom "
    "save flee from you.",
    "Aura of Devotion": "You and allies within 10 ft. can't be charmed while you're conscious.",
    "Purity of Spirit": "You're always under the Protection from Evil and Good spell.",
    "Holy Nimbus": "Action: shine sunlight for a minute that burns enemies for 10 radiant "
    "damage; once per Long Rest.",
    "Hunter's Prey": "Choose Colossus Slayer, Giant Killer or Horde Breaker.",
    "Defensive Tactics": "Choose Escape the Horde, Multiattack Defense or Steel Will.",
    "Multiattack": "Choose Volley or Whirlwind Attack.",
    "Superior Hunter's Defense": "Choose Evasion, Stand Against the Tide or Uncanny Dodge.",
    "Fast Hands": "Cunning Action can also make a Sleight of Hand check, use thieves' tools, or "
    "use an object.",
    "Second-Story Work": "Climbing costs no extra movement, and running jumps go farther.",
    "Supreme Sneak": "Advantage on Stealth checks if you move no more than half your speed.",
    "Use Magic Device": "Ignore class, race and level requirements on magic items.",
    "Thief's Reflexes": "Take two turns in the first round of combat (not when surprised).",
    "Dragon Ancestor": "Choose a dragon color; its damage type powers later features. You speak "
    "Draconic, with double proficiency on Charisma checks with dragons.",
    "Draconic Resilience": "+1 hit point per Sorcerer level, and with no armor your Armor Class "
    "is 13 + your Dexterity modifier.",
    "Elemental Affinity": "Add your Charisma modifier to damage of your dragon's type; spend 1 "
    "sorcery point to resist that type for an hour.",
    "Dragon Wings": "Bonus action: sprout wings and fly at your speed.",
    "Draconic Presence": "Spend 5 sorcery points for an aura of awe or fear: foes within 60 ft. "
    "that fail a Wisdom save are charmed or frightened.",
    "Expanded Spell List": "More spells to choose from when you learn Warlock spells, such as "
    "Burning Hands and Fireball.",
    "Dark One's Blessing": "Temporary hit points (Charisma modifier + Warlock level) whenever "
    "you drop a hostile creature to 0.",
    "Dark One's Own Luck": "Add a d10 to an ability check or save, once per Short or Long Rest.",
    "Fiendish Resilience": "After a rest, choose a damage type to resist (magic and silver "
    "weapons get through).",
    "Hurl Through Hell": "Once per Long Rest, send a creature you hit through the lower planes: "
    "10d10 psychic damage unless it's a fiend.",
    "Evocation Savant": "Copying Evocation spells into your spellbook takes half the gold and "
    "time.",
    "Sculpt Spells": "Shield chosen allies (1 + the spell's level) from your Evocation spells: "
    "they pass the save and take no damage.",
    "Potent Cantrip": "A creature that passes its save against your cantrip still takes half "
    "damage.",
    "Empowered Evocation": "Add your Intelligence modifier to one damage roll of your Wizard "
    "Evocation spells.",
    "Overchannel": "Deal maximum damage with a 1st- to 5th-level spell; doing it again before a "
    "Long Rest hurts you.",
}

# Subclasses whose unarmored Armor Class adds a third ability (2024's Draconic Sorcery: CHA).
# No 2014 subclass works that way: see UNARMORED_AC_BASE_SUBCLASS.
UNARMORED_AC_SUBCLASS: dict[str, str] = {}
# 2014-only: subclasses whose unarmored Armor Class is a fixed base + DEX (Draconic Resilience:
# 13 + DEX), used when it beats 10 + DEX.
UNARMORED_AC_BASE_SUBCLASS: dict[str, int] = {"Draconic Bloodline": 13}
# 2014-only: armor training a subclass adds (the Life Domain's Bonus Proficiency).
SUBCLASS_ARMOR: dict[str, list[str]] = {"Life Domain": ["heavy"]}


def feature_note(class_name: str, name: str) -> str | None:
    """The plain-words note for a feature, preferring a class-specific one."""
    return FEATURE_NOTES.get(f"{class_name}: {name}") or FEATURE_NOTES.get(name)


# 2014 has no cantrip swapping on level-up.
CANTRIP_SWAP_CLASSES: frozenset[str] = frozenset()
# Known casters may replace one spell they know on gaining a level (the rest prepare daily).
SPELL_SWAP_CLASSES = frozenset({"Bard", "Ranger", "Sorcerer", "Warlock"})
# Classes with a Fighting Style feature (and the level it arrives).
FIGHTING_STYLE_LEVEL: dict[str, int] = {"Fighter": 1, "Paladin": 2, "Ranger": 2}
# Subclasses that make a non-caster a caster (third-casters). Not in the SRD 5.1, but the same
# two exist in the 2014 books, so a "From my book" Eldritch Knight still counts as a caster.
CASTER_SUBCLASSES = frozenset({"Eldritch Knight", "Arcane Trickster"})

# Extra max HP per level from a subrace trait or subclass feature.
HP_PER_LEVEL_SPECIES: dict[str, int] = {"Hill Dwarf": 1}  # Dwarven Toughness
HP_PER_LEVEL_SUBCLASS: dict[str, int] = {"Draconic Bloodline": 1}  # Draconic Resilience


def asi_levels(class_name: str) -> set[int]:
    """Levels at which the class gains an Ability Score Improvement (19 is one in 2014)."""
    table = CLASS_LEVEL_FEATURES.get(class_name, {})
    found = {lvl for lvl, names in table.items() if _ASI in names}
    return found or {4, 8, 12, 16, 19}


def features_at(class_name: str, level: int) -> list[str]:
    """Feature names the class gains at exactly ``level`` (empty if unknown class)."""
    return list(CLASS_LEVEL_FEATURES.get(class_name, {}).get(level, []))


# ── Feats ─────────────────────────────────────────────────────────────────────
# The SRD 5.1 has one feat, Grappler. Fighting styles are listed here too (category
# "fighting_style") because the Fighting Style choice reads them from this catalog, as in 2024;
# each row's ``classes`` says which classes' Fighting Style feature offers it. In 2014 they are
# never taken at an Ability Score Improvement (``feat_qualifies`` says so).


def _style(name: str, blurb: str, classes: list[str], **rules: Any) -> dict[str, Any]:
    """One 2014 fighting style as a catalog row, with the classes that may choose it."""
    return _feat(
        name,
        "fighting_style",
        blurb,
        prereq={"fighting_style": True},
        srd=True,
        classes=classes,
        **rules,
    )


FEATS: list[dict[str, Any]] = [
    _feat(
        _ASI,
        "general",
        "+2 to one ability score, or +1 to two. No score goes above 20.",
        repeatable=True,
        srd=True,
    ),
    _feat(
        "Grappler",
        "general",
        "Advantage on attacks against a creature you grapple; an action to try to pin it.",
        prereq={"any_ability": {"STR": 13}},
        srd=True,
    ),
    _style(
        "Archery",
        "+2 to attack rolls with ranged weapons.",
        ["Fighter", "Ranger"],
    ),
    _style(
        "Defense",
        "+1 AC while you wear armor.",
        ["Fighter", "Paladin", "Ranger"],
        ac_bonus_in_armor=1,
    ),
    _style(
        "Dueling",
        "+2 damage with a one-handed melee weapon and no other weapon.",
        ["Fighter", "Paladin", "Ranger"],
    ),
    _style(
        "Great Weapon Fighting",
        "Reroll 1s and 2s on two-handed melee damage dice (keep the new roll).",
        ["Fighter", "Paladin"],
    ),
    _style(
        "Protection",
        "Reaction with a shield: give an attack on a creature next to you disadvantage.",
        ["Fighter", "Paladin"],
    ),
    _style(
        "Two-Weapon Fighting",
        "Add your ability modifier to the off-hand attack's damage.",
        ["Fighter", "Ranger"],
    ),
]

FEATS_BY_NAME: dict[str, dict[str, Any]] = {f["name"].casefold(): f for f in FEATS}

# No "popular for a <class>" list: the only SRD 5.1 feat is Grappler.
POPULAR_FEATS: dict[str, list[str]] = {}


def feat_qualifies(
    feat: dict[str, Any],
    *,
    scores: dict[str, int],
    is_caster: bool,
    armor_training: set[str],
    has_fighting_style: bool,
    current_feats: list[str],
) -> tuple[bool, str | None]:
    """Whether a PC may take ``feat`` at an Ability Score Improvement, and why not.

    Same checks as 2024 (already taken, ability minimum, spellcasting, armor), plus one 2014
    rule: a fighting style comes only from the Fighting Style feature, never from an
    improvement.

    Args:
        feat: A row from ``FEATS``.
        scores: Ability scores *before* this level's increase.
        is_caster: The PC has a Spellcasting or Pact Magic feature.
        armor_training: Armor categories the PC is trained in ("light", "medium", ...).
        has_fighting_style: The PC has the Fighting Style feature.
        current_feats: Feat names already on the sheet.

    Returns:
        ``(ok, reason)`` — reason is a short human sentence when ``ok`` is False.
    """
    if feat["category"] == "fighting_style":
        return False, "Fighting styles come from the Fighting Style feature, not an improvement."
    return _feat_qualifies_2024(
        feat,
        scores=scores,
        is_caster=is_caster,
        armor_training=armor_training,
        has_fighting_style=has_fighting_style,
        current_feats=current_feats,
    )


# ── What changes in the numbers ───────────────────────────────────────────────
# The per-level columns of the SRD 5.1 class tables. Where the 5e-database JSON disagrees with
# the SRD 5.1 text (Warlock invocations, Sorcerer metamagic at 17, Wild Shape CR 1 at 8), the
# SRD text wins.

_UNLIMITED = "Unlimited"

_SCALES: dict[str, list[tuple[str, list[tuple[int, Any]]]]] = {
    "Barbarian": [
        ("Rages", [(1, 2), (3, 3), (6, 4), (12, 5), (17, 6), (20, _UNLIMITED)]),
        ("Rage damage", [(1, "+2"), (9, "+3"), (16, "+4")]),
        ("Brutal Critical dice", [(9, 1), (13, 2), (17, 3)]),
    ],
    "Bard": [
        ("Bardic Inspiration die", [(1, "d6"), (5, "d8"), (10, "d10"), (15, "d12")]),
        ("Song of Rest die", [(2, "d6"), (9, "d8"), (13, "d10"), (17, "d12")]),
    ],
    "Cleric": [
        ("Channel Divinity uses", [(2, 1), (6, 2), (18, 3)]),
        (
            "Destroy Undead",
            [
                (5, "CR 1/2 or lower"),
                (8, "CR 1 or lower"),
                (11, "CR 2 or lower"),
                (14, "CR 3 or lower"),
                (17, "CR 4 or lower"),
            ],
        ),
    ],
    "Druid": [
        ("Wild Shape uses", [(2, 2), (20, _UNLIMITED)]),
        (
            "Wild Shape max CR",
            [(2, "1/4, no flying or swimming speed"), (4, "1/2, no flying speed"), (8, "1")],
        ),
    ],
    "Fighter": [
        ("Action Surge uses", [(2, 1), (17, 2)]),
        ("Indomitable uses", [(9, 1), (13, 2), (17, 3)]),
    ],
    "Monk": [
        ("Martial Arts die", [(1, "d4"), (5, "d6"), (11, "d8"), (17, "d10")]),
        ("Ki points", [(lvl, lvl) for lvl in range(2, 21)]),
        (
            "Unarmored Movement",
            [(2, "+10 ft."), (6, "+15 ft."), (10, "+20 ft."), (14, "+25 ft."), (18, "+30 ft.")],
        ),
    ],
    "Paladin": [
        ("Lay on Hands pool", [(lvl, f"{5 * lvl} HP") for lvl in range(1, 21)]),
        ("Aura range", [(6, "10 ft."), (18, "30 ft.")]),
    ],
    "Ranger": [
        ("Favored enemies", [(1, 1), (6, 2), (14, 3)]),
        ("Favored terrains", [(1, 1), (6, 2), (10, 3)]),
    ],
    "Rogue": [("Sneak Attack", [(lvl, f"{(lvl + 1) // 2}d6") for lvl in range(1, 21)])],
    "Sorcerer": [
        ("Sorcery points", [(lvl, lvl) for lvl in range(2, 21)]),
        ("Metamagic options", [(3, 2), (10, 3), (17, 4)]),
    ],
    "Warlock": [
        (
            "Eldritch Invocations",
            [(2, 2), (5, 3), (7, 4), (9, 5), (12, 6), (15, 7), (18, 8)],
        ),
    ],
    "Wizard": [
        ("Arcane Recovery slot levels", [(lvl, (lvl + 1) // 2) for lvl in range(1, 21)]),
    ],
}


def scaling_notes(class_name: str, old_level: int, new_level: int, *, is_caster: bool) -> list[str]:
    """Numbers that change between two levels, as short "X: a → b" lines.

    Spell slots and spells known are left to the service (it owns those tables).
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


# ── Always-prepared spells ────────────────────────────────────────────────────
# 2014 rules: domain, oath and circle spells are always prepared, cost no pick and don't count
# against the prepared number. Keyed by class level. Names as in the SRD 5.1 spell list.

# No 2014 class has always-prepared spells of its own (2024's Druidic, Paladin's Smite...).
ALWAYS_PREPARED_CLASS: dict[str, dict[int, list[str]]] = {}

ALWAYS_PREPARED_SUBCLASS: dict[str, dict[int, list[str]]] = {
    "Life Domain": {
        1: ["Bless", "Cure Wounds"],
        3: ["Lesser Restoration", "Spiritual Weapon"],
        5: ["Beacon of Hope", "Revivify"],
        7: ["Death Ward", "Guardian of Faith"],
        9: ["Mass Cure Wounds", "Raise Dead"],
    },
    "Oath of Devotion": {
        3: ["Protection from Evil and Good", "Sanctuary"],
        5: ["Lesser Restoration", "Zone of Truth"],
        9: ["Beacon of Hope", "Dispel Magic"],
        13: ["Freedom of Movement", "Guardian of Faith"],
        17: ["Commune", "Flame Strike"],
    },
}

# Circle of the Land: the land picked at Druid 2 sets its Circle Spells (from Druid 3).
LAND_SPELLS: dict[str, dict[int, list[str]]] = {
    "Arctic": {
        3: ["Hold Person", "Spike Growth"],
        5: ["Sleet Storm", "Slow"],
        7: ["Freedom of Movement", "Ice Storm"],
        9: ["Commune With Nature", "Cone of Cold"],
    },
    "Coast": {
        3: ["Mirror Image", "Misty Step"],
        5: ["Water Breathing", "Water Walk"],
        7: ["Control Water", "Freedom of Movement"],
        9: ["Conjure Elemental", "Scrying"],
    },
    "Desert": {
        3: ["Blur", "Silence"],
        5: ["Create Food and Water", "Protection From Energy"],
        7: ["Blight", "Hallucinatory Terrain"],
        9: ["Insect Plague", "Wall of Stone"],
    },
    "Forest": {
        3: ["Barkskin", "Spider Climb"],
        5: ["Call Lightning", "Plant Growth"],
        7: ["Divination", "Freedom of Movement"],
        9: ["Commune With Nature", "Tree Stride"],
    },
    "Grassland": {
        3: ["Invisibility", "Pass Without Trace"],
        5: ["Daylight", "Haste"],
        7: ["Divination", "Freedom of Movement"],
        9: ["Dream", "Insect Plague"],
    },
    "Mountain": {
        3: ["Spider Climb", "Spike Growth"],
        5: ["Lightning Bolt", "Meld Into Stone"],
        7: ["Stone Shape", "Stoneskin"],
        9: ["Passwall", "Wall of Stone"],
    },
    "Swamp": {
        3: ["Acid Arrow", "Darkness"],
        5: ["Water Walk", "Stinking Cloud"],
        7: ["Freedom of Movement", "Locate Creature"],
        9: ["Insect Plague", "Scrying"],
    },
}

# Which class feature gives each class's always-prepared spells: none in 2014 (subclass spells
# are labelled with the subclass's name).
ALWAYS_PREPARED_SOURCE: dict[str, str] = {}

# Whole class lists a class may also choose from, by class level (2024's Bard 10). In 2014,
# Magical Secrets is a count of spells from any list, so it is a class choice instead.
EXTRA_SPELL_LISTS: dict[str, dict[int, list[str]]] = {}

# 2014-only: a subclass's expanded spell list, by class level. These join the class's list to
# choose from when learning spells; they are NOT known or prepared automatically.
EXPANDED_SPELLS: dict[str, dict[int, list[str]]] = {
    "The Fiend": {
        1: ["Burning Hands", "Command"],
        3: ["Blindness/Deafness", "Scorching Ray"],
        5: ["Fireball", "Stinking Cloud"],
        7: ["Fire Shield", "Wall of Fire"],
        9: ["Flame Strike", "Hallow"],
    },
}


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
        Pairs in level order, no repeats.
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
    """Other class lists this class may prepare from at ``level`` (none in 2014)."""
    out: list[str] = []
    for at, lists in sorted(EXTRA_SPELL_LISTS.get(class_name, {}).items()):
        if level >= at:
            out += [x for x in lists if x not in out]
    return out


def expanded_spells(subclass: str | None, level: int) -> list[str]:
    """Spells a subclass adds to its class's list to choose from at ``level`` (2014 only).

    Args:
        subclass: The subclass ("The Fiend").
        level: The class level.

    Returns:
        Spell names in level order; empty for a subclass with no expanded list.
    """
    out: list[str] = []
    for at, names in sorted(EXPANDED_SPELLS.get(subclass or "", {}).items()):
        if level >= at:
            out += [n for n in names if n not in out]
    return out


# ── The class choices the creator asks for ───────────────────────────────────
# Same representation as 2024: ``CLASS_CHOICES`` gives a (from_level, how_many) table per
# choice, read with ``_step`` (the counts are totals, not new picks); a subclass's table adds to
# its class's for the same key (the Champion's Additional Fighting Style).
#
# Kinds are 2024's ("feat", "option", "expertise", "skill") plus one new kind, "spell", for
# Magical Secrets and Mystic Arcanum: its ``spell`` spec says which lists (None = any class),
# which spell levels, and whether the picks count as spells known. Until the builder has a spell
# picker for it, those choices take "From my book" entries (``"book": True``).

# 2024's Scholar (Wizard 2) has no 2014 meaning.
SCHOLAR_SKILLS: list[str] = []

# Eldritch Invocations in SRD 5.1 with their prerequisites: a Warlock ``level``, a Pact Boon
# (``requires``: the boon's name, picked under "pact_boon"), or the ``cantrip`` Eldritch Blast.
# The summaries are ours; play them from the book.
INVOCATIONS: list[dict[str, Any]] = [
    _opt(
        "Agonizing Blast",
        "Add your Charisma modifier to Eldritch Blast's damage on a hit.",
        cantrip="Eldritch Blast",
    ),
    _opt("Armor of Shadows", "Cast Mage Armor on yourself at will, with no slot."),
    _opt("Ascendant Step", "Cast Levitate on yourself at will, with no slot.", level=9),
    _opt("Beast Speech", "Cast Speak with Animals at will, with no slot."),
    _opt(
        "Beguiling Influence",
        "Proficiency in Deception and Persuasion. Note them on your sheet.",
    ),
    _opt(
        "Bewitching Whispers",
        "Cast Compulsion once with a Warlock slot; again after a Long Rest.",
        level=7,
    ),
    _opt(
        "Book of Ancient Secrets",
        "Write rituals in your Book of Shadows, starting with two 1st-level rituals.",
        requires="Pact of the Tome",
    ),
    _opt(
        "Chains of Carceri",
        "Cast Hold Monster at will on a celestial, fiend or elemental.",
        level=15,
        requires="Pact of the Chain",
    ),
    _opt("Devil's Sight", "See normally in darkness, magical or not, out to 120 ft."),
    _opt(
        "Dreadful Word",
        "Cast Confusion once with a Warlock slot; again after a Long Rest.",
        level=7,
    ),
    _opt("Eldritch Sight", "Cast Detect Magic at will, with no slot."),
    _opt(
        "Eldritch Spear",
        "Eldritch Blast reaches 300 ft.",
        cantrip="Eldritch Blast",
    ),
    _opt("Eyes of the Rune Keeper", "Read all writing."),
    _opt("Fiendish Vigor", "Cast False Life on yourself at will as a 1st-level spell, no slot."),
    _opt(
        "Gaze of Two Minds",
        "Touch a willing humanoid to see and hear through its senses.",
    ),
    _opt(
        "Lifedrinker",
        "Pact weapon hits deal extra necrotic damage equal to your Charisma modifier.",
        level=12,
        requires="Pact of the Blade",
    ),
    _opt("Mask of Many Faces", "Cast Disguise Self at will, with no slot."),
    _opt("Master of Myriad Forms", "Cast Alter Self at will, with no slot.", level=15),
    _opt(
        "Minions of Chaos",
        "Cast Conjure Elemental once with a Warlock slot; again after a Long Rest.",
        level=9,
    ),
    _opt(
        "Mire the Mind",
        "Cast Slow once with a Warlock slot; again after a Long Rest.",
        level=5,
    ),
    _opt("Misty Visions", "Cast Silent Image at will, with no slot."),
    _opt(
        "One with Shadows",
        "In dim light or darkness, turn invisible until you move or act.",
        level=5,
    ),
    _opt("Otherworldly Leap", "Cast Jump on yourself at will, with no slot.", level=9),
    _opt(
        "Repelling Blast",
        "Eldritch Blast hits push the creature up to 10 ft. away from you.",
        cantrip="Eldritch Blast",
    ),
    _opt(
        "Sculptor of Flesh",
        "Cast Polymorph once with a Warlock slot; again after a Long Rest.",
        level=7,
    ),
    _opt(
        "Sign of Ill Omen",
        "Cast Bestow Curse once with a Warlock slot; again after a Long Rest.",
        level=5,
    ),
    _opt("Thief of Five Fates", "Cast Bane once with a Warlock slot; again after a Long Rest."),
    _opt(
        "Thirsting Blade",
        "Attack twice with your pact weapon when you take the Attack action.",
        level=5,
        requires="Pact of the Blade",
    ),
    _opt("Visions of Distant Realms", "Cast Arcane Eye at will, with no slot.", level=15),
    _opt(
        "Voice of the Chain Master",
        "Talk to your familiar mind to mind, and see, hear and speak through it.",
        requires="Pact of the Chain",
    ),
    _opt("Whispers of the Grave", "Cast Speak with Dead at will, with no slot.", level=9),
    _opt(
        "Witch Sight",
        "See the true form of shapechangers and creatures hidden by illusion within 30 ft.",
        level=15,
    ),
]

METAMAGIC: list[dict[str, Any]] = [
    _opt(
        "Careful Spell",
        "1 point: up to your Charisma modifier in creatures pass your spell's save.",
    ),
    _opt("Distant Spell", "1 point: double a spell's range, or make a Touch spell reach 30 ft."),
    _opt("Empowered Spell", "1 point: reroll up to your Charisma modifier in damage dice."),
    _opt("Extended Spell", "1 point: double a spell's duration, up to 24 hours."),
    _opt("Heightened Spell", "3 points: one target has disadvantage on its first save."),
    _opt("Quickened Spell", "2 points: cast a one-action spell as a bonus action."),
    _opt("Subtle Spell", "1 point: cast with no words or gestures, so nobody sees you do it."),
    _opt(
        "Twinned Spell",
        "Points equal to the spell's level (1 for a cantrip): a single-target spell takes two.",
    ),
]

# 2024's Paladin and Ranger cantrip alternatives to a style have no 2014 meaning.
FIGHTING_STYLE_EXTRAS: dict[str, list[dict[str, Any]]] = {}

_LAND_BLURBS = {
    "Arctic": "Hold Person and Spike Growth; later Sleet Storm, Slow, Freedom of Movement, Ice "
    "Storm, Commune With Nature and Cone of Cold.",
    "Coast": "Mirror Image and Misty Step; later Water Breathing, Water Walk, Control Water, "
    "Freedom of Movement, Conjure Elemental and Scrying.",
    "Desert": "Blur and Silence; later Create Food and Water, Protection From Energy, Blight, "
    "Hallucinatory Terrain, Insect Plague and Wall of Stone.",
    "Forest": "Barkskin and Spider Climb; later Call Lightning, Plant Growth, Divination, "
    "Freedom of Movement, Commune With Nature and Tree Stride.",
    "Grassland": "Invisibility and Pass Without Trace; later Daylight, Haste, Divination, "
    "Freedom of Movement, Dream and Insect Plague.",
    "Mountain": "Spider Climb and Spike Growth; later Lightning Bolt, Meld Into Stone, Stone "
    "Shape, Stoneskin, Passwall and Wall of Stone.",
    "Swamp": "Acid Arrow and Darkness; later Water Walk, Stinking Cloud, Freedom of Movement, "
    "Locate Creature, Insect Plague and Scrying.",
}

_TERRAINS = [
    ("Arctic", "Frozen lands, snowfields and polar ice."),
    ("Coast", "Shores, cliffs and the waters near land."),
    ("Desert", "Sand, rock and dry wastes."),
    ("Forest", "Woods and jungles."),
    ("Grassland", "Plains, prairies and open steppe."),
    ("Mountain", "Peaks, passes and high slopes."),
    ("Swamp", "Marshes, bogs and wetlands."),
]

_ENEMIES = [
    ("Aberrations", "Utterly alien beings from beyond the world."),
    ("Beasts", "Ordinary and giant animals."),
    ("Celestials", "Beings of the upper planes, such as angels."),
    ("Constructs", "Made things brought to life, such as golems and animated armor."),
    ("Dragons", "Dragons and their kin."),
    ("Elementals", "Living fire, air, earth and water."),
    ("Fey", "Magical beings tied to nature, such as dryads and sprites."),
    ("Fiends", "Demons, devils and other evil beings of the lower planes."),
    ("Giants", "Giants, ogres and trolls."),
    ("Monstrosities", "Unnatural monsters, such as owlbears and chimeras."),
    ("Oozes", "Shapeless creatures, such as gelatinous cubes."),
    ("Plants", "Living plants and fungi, such as shambling mounds."),
    ("Undead", "Once-living things raised again, such as zombies and vampires."),
    ("Two humanoid races", "Two kinds of humanoid, such as gnolls and orcs: note which."),
]

# The Sorcerer's Dragon Ancestor uses the same dragon → damage type table as the Dragonborn's
# Draconic Ancestry; only the damage type matters here (a sorcerer has no breath weapon).
_DRAGON_OPTIONS = [
    _opt(row["name"], f"{row['damage_type'].title()} damage.", damage_type=row["damage_type"])
    for row in _DRACONIC_ANCESTRY
]

# Every kind of choice: its label, how it is picked ("feat", "option", "expertise", "skill" or
# "spell"), a plain-words note, whether a book entry is allowed, and the "Label" it is recorded
# under in ``feats`` ("Pact Boon: Pact of the Blade").
CHOICE_KINDS: dict[str, dict[str, Any]] = {
    "fighting_style": {
        "label": "Fighting Style",
        "kind": "feat",
        "note": "A way of fighting you have trained in. You can't take the same style twice.",
        "book": True,
        "record": "Fighting Style",
    },
    "expertise": {
        "label": "Expertise",
        "kind": "expertise",
        "note": "Skills you're already trained in: your proficiency bonus counts twice for them. "
        "(A Rogue may take thieves' tools instead of one skill: note it on your sheet.)",
    },
    "bonus_proficiencies": {
        "label": "Bonus Proficiencies",
        "kind": "skill",
        "note": "Three more skills of your choice.",
    },
    "favored_enemy": {
        "label": "Favored Enemy",
        "kind": "option",
        "note": "A kind of creature you have hunted: advantage on Survival checks to track it and "
        "on checks to recall facts about it, and one language it speaks.",
        "record": "Favored Enemy",
        "options": [_opt(name, blurb) for name, blurb in _ENEMIES],
    },
    "natural_explorer": {
        "label": "Natural Explorer",
        "kind": "option",
        "note": "A kind of land you know well: double proficiency on Intelligence and Wisdom "
        "checks about it, and you travel and forage there with ease.",
        "record": "Favored Terrain",
        "options": [_opt(name, blurb) for name, blurb in _TERRAINS],
    },
    "dragon_ancestor": {
        "label": "Dragon Ancestor",
        "kind": "option",
        "note": "The kind of dragon in your blood. Its damage type powers your later features.",
        "record": "Dragon Ancestor",
        "options": _DRAGON_OPTIONS,
    },
    "land": {
        "label": "Land",
        "kind": "option",
        "note": "The land where you became a druid. It sets your Circle Spells, always prepared "
        "from Druid 3. Your circle also teaches you one more Druid cantrip.",
        "record": "Circle of the Land",
        # The cantrip on every option is the circle's Bonus Cantrip, granted with the land.
        "options": [
            _opt(name, blurb, cantrips={"count": 1, "list": "Druid"})
            for name, blurb in _LAND_BLURBS.items()
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
                "Giant Killer",
                "Reaction: attack a Large or bigger creature next to you that attacks you.",
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
                "After a creature hits you, you get +4 AC against its other attacks this turn.",
            ),
            _opt("Steel Will", "Advantage on saves against being frightened."),
        ],
    },
    "multiattack": {
        "label": "Multiattack",
        "kind": "option",
        "note": "How you fight a crowd.",
        "record": "Multiattack",
        "options": [
            _opt(
                "Volley",
                "Action: a ranged attack against every creature within 10 ft. of a point.",
            ),
            _opt(
                "Whirlwind Attack",
                "Action: a melee attack against every creature within 5 ft. of you.",
            ),
        ],
    },
    "superior_hunters_defense": {
        "label": "Superior Hunter's Defense",
        "kind": "option",
        "note": "Your last line of defense.",
        "record": "Superior Hunter's Defense",
        "options": [
            _opt(
                "Evasion",
                "A Dexterity save against an area effect: no damage on a success, half on a fail.",
            ),
            _opt(
                "Stand Against the Tide",
                "Reaction: a creature that misses you in melee attacks another one you choose.",
            ),
            _opt("Uncanny Dodge", "Reaction: halve the damage of an attack that hits you."),
        ],
    },
    "pact_boon": {
        "label": "Pact Boon",
        "kind": "option",
        "note": "Your patron's gift. Some invocations need a particular pact.",
        "record": "Pact Boon",
        "options": [
            _opt(
                "Pact of the Chain",
                "Learn Find Familiar; your familiar can be an imp, pseudodragon, quasit or sprite.",
            ),
            _opt(
                "Pact of the Blade",
                "Conjure a pact weapon in your hand, in any melee form; you're proficient with it.",
            ),
            _opt(
                "Pact of the Tome",
                "A Book of Shadows with three cantrips from any class's list.",
            ),
        ],
    },
    "invocations": {
        "label": "Eldritch Invocations",
        "kind": "option",
        "note": "Gifts from your patron. Some need a higher Warlock level, a Pact Boon, or the "
        "Eldritch Blast cantrip.",
        "record": "Eldritch Invocation",
        "options": INVOCATIONS,
        "book": True,
    },
    "metamagic": {
        "label": "Metamagic",
        "kind": "option",
        "note": "Ways to bend your spells with sorcery points. One per spell, unless it says "
        "otherwise.",
        "record": "Metamagic",
        "options": METAMAGIC,
        "book": True,
    },
    "mystic_arcanum": {
        "label": "Mystic Arcanum",
        "kind": "spell",
        "note": "One Warlock spell of each level from 6th up, each cast once per Long Rest with "
        "no slot.",
        "record": "Mystic Arcanum",
        # The first pick is a 6th-level spell, the second 7th, and so on.
        "spell": {"lists": ["Warlock"], "levels": [6, 7, 8, 9], "known": False},
        "book": True,
    },
    "magical_secrets": {
        "label": "Magical Secrets",
        "kind": "spell",
        "note": "Spells from any class's list, of a level you can cast (or cantrips). They "
        "count as Bard spells and as spells you know.",
        "record": "Magical Secrets",
        "spell": {"lists": None, "levels": None, "cantrips": True, "known": True},
        "book": True,
    },
    "additional_magical_secrets": {
        "label": "Additional Magical Secrets",
        "kind": "spell",
        "note": "Two spells from any class's list, of a level you can cast (or cantrips). They "
        "don't count against the spells you know.",
        "record": "Additional Magical Secrets",
        "spell": {"lists": None, "levels": None, "cantrips": True, "known": False},
        "book": True,
    },
}

CLASS_CHOICES: dict[str, dict[str, list[tuple[int, int]]]] = {
    "Barbarian": {},
    "Bard": {"expertise": [(3, 2), (10, 4)], "magical_secrets": [(10, 2), (14, 4), (18, 6)]},
    "Cleric": {},
    "Druid": {},
    "Fighter": {"fighting_style": [(1, 1)]},
    "Monk": {},
    "Paladin": {"fighting_style": [(2, 1)]},
    "Ranger": {
        "favored_enemy": [(1, 1), (6, 2), (14, 3)],
        "natural_explorer": [(1, 1), (6, 2), (10, 3)],
        "fighting_style": [(2, 1)],
    },
    "Rogue": {"expertise": [(1, 2), (6, 4)]},
    "Sorcerer": {"metamagic": [(3, 2), (10, 3), (17, 4)]},
    "Warlock": {
        "invocations": [(2, 2), (5, 3), (7, 4), (9, 5), (12, 6), (15, 7), (18, 8)],
        "pact_boon": [(3, 1)],
        "mystic_arcanum": [(11, 1), (13, 2), (15, 3), (17, 4)],
    },
    "Wizard": {},
}

SUBCLASS_CHOICES: dict[str, dict[str, list[tuple[int, int]]]] = {
    "College of Lore": {"bonus_proficiencies": [(3, 3)], "additional_magical_secrets": [(6, 2)]},
    "Champion": {"fighting_style": [(10, 1)]},  # Additional Fighting Style
    "Circle of the Land": {"land": [(2, 1)]},
    "Hunter": {
        "hunters_prey": [(3, 1)],
        "defensive_tactics": [(7, 1)],
        "multiattack": [(11, 1)],
        "superior_hunters_defense": [(15, 1)],
    },
    "Draconic Bloodline": {"dragon_ancestor": [(1, 1)]},
}

# 2014 has no Weapon Mastery.
WEAPON_MASTERY_FILTER: dict[str, str] = {}


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
    """Whether ``class_name`` may master this weapon: never, since 2014 has no Weapon Mastery."""
    return False


def choice_options(class_name: str, key: str) -> list[dict[str, Any]]:
    """The listed options for a choice (Fighting Style: the styles this class's feature offers)."""
    spec = CHOICE_KINDS.get(key, {})
    if spec.get("kind") == "feat":
        styles = [
            _opt(f["name"], f["blurb"], srd=f["srd"])
            for f in FEATS
            if f["category"] == "fighting_style" and class_name in f.get("classes", [])
        ]
        return styles + list(FIGHTING_STYLE_EXTRAS.get(class_name, []))
    return list(spec.get("options") or [])


def class_scales() -> dict[str, list[dict[str, Any]]]:
    """The per-level numbers each class tracks (Rages, Ki points...), for explanations."""
    return {
        cls: [{"label": label, "table": [list(row) for row in table]} for label, table in rows]
        for cls, rows in _SCALES.items()
    }
