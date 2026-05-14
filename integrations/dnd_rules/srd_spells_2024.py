"""SRD 5.5e (2024) spell catalog — seed data for the spells table.

Plan 00017. Each entry matches the ``SpellCreate`` shape. The seeder reads
this list at startup and inserts rows when the table is empty (idempotent).

Sources:
- D&D 5.5e SRD 5.2.1 (Wizards of the Coast, CC-BY-4.0, January 2025)
- Hand-curated against the 2024 PHB where the SRD overlaps

Conventions:
- Entries are sorted by (level, name).
- Cantrips are level 0.
- ``description`` is plain prose; mechanical fields (``damage_dice``, etc.)
  are populated only when they unambiguously apply.
- ``classes`` lists the classes that can natively learn the spell.

Notable 2024 changes vs 2014 baked in here:
- Cure Wounds: 2d8 + spellcasting mod (was 1d8).
- True Strike: a weapon-attack cantrip with radiant rider (replaces the
  much-derided guidance-on-an-attack 2014 version).
- Hunter's Mark: bonus action, +1d6 weapon damage on hits against the
  marked target; concentration.
"""

from domain.spell import SpellCreate

SRD_SPELLS_2024: list[SpellCreate] = [
    # ── Cantrips (Level 0) ────────────────────────────────────────────────
    SpellCreate(
        name="Acid Splash",
        level=0,
        school="Evocation",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "You create an acidic bubble at a point within range, where it explodes "
            "in a 5-foot-radius Sphere. Each creature in the Sphere must succeed on a "
            "Dexterity saving throw or take 1d6 Acid damage."
        ),
        higher_levels=("Damage increases by 1d6 at 5th level (2d6), 11th (3d6), and 17th (4d6)."),
        damage_dice="1d6",
        damage_type="acid",
        save_ability="DEX",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Dancing Lights",
        level=0,
        school="Illusion",
        casting_time="1 action",
        range="120 feet",
        components_v=True,
        components_s=True,
        components_m="A bit of phosphorus or wychwood, or a glowworm",
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "You create up to four torch-sized lights within range, making each light "
            "appear as a torch, lantern, or glowing orb that hovers in the air for the duration. "
            "As a bonus action on your turn you can move the lights up to 60 feet to a new spot "
            "within range. Each light must be within 20 feet of another light, and a light winks "
            "out if it exceeds the spell's range."
        ),
        classes=["Bard", "Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Eldritch Blast",
        level=0,
        school="Evocation",
        casting_time="1 action",
        range="120 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "A beam of crackling energy streaks toward a creature within range. Make a ranged "
            "spell attack against the target. On a hit, the target takes 1d10 Force damage."
        ),
        higher_levels=(
            "The spell creates more than one beam when you reach higher levels: two beams at "
            "5th level, three at 11th, and four at 17th. You can direct the beams at the same "
            "target or at different ones. Make a separate attack roll for each beam."
        ),
        damage_dice="1d10",
        damage_type="force",
        attack_type="ranged",
        classes=["Warlock"],
    ),
    SpellCreate(
        name="Fire Bolt",
        level=0,
        school="Evocation",
        casting_time="1 action",
        range="120 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "You hurl a mote of fire at a creature or object within range. Make a ranged spell "
            "attack against the target. On a hit, the target takes 1d10 Fire damage. A flammable "
            "object hit by this spell starts burning if it isn't being worn or carried."
        ),
        higher_levels="Damage increases by 1d10 at 5th level (2d10), 11th (3d10), and 17th (4d10).",
        damage_dice="1d10",
        damage_type="fire",
        attack_type="ranged",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Guidance",
        level=0,
        school="Divination",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "You touch a willing creature and choose a skill. Until the spell ends, the creature "
            "adds 1d4 to one ability check of its choice that uses the chosen skill. It can roll "
            "the die before or after making the ability check. The spell then ends."
        ),
        classes=["Cleric", "Druid"],
    ),
    SpellCreate(
        name="Light",
        level=0,
        school="Evocation",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_m="A firefly or phosphorescent moss",
        duration="1 hour",
        description=(
            "You touch one object that is no larger than 10 feet in any dimension. Until "
            "the spell ends, the object sheds Bright Light in a 20-foot radius and Dim "
            "Light for an additional 20 feet. The light can be colored as you like. "
            "Completely covering the object with "
            "something opaque blocks the light. The spell ends if you cast it again or dismiss it "
            "as an action."
        ),
        classes=["Bard", "Cleric", "Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Mage Hand",
        level=0,
        school="Conjuration",
        casting_time="1 action",
        range="30 feet",
        components_v=True,
        components_s=True,
        duration="1 minute",
        description=(
            "A spectral, floating hand appears at a point you choose within range. The hand lasts "
            "for the duration or until you dismiss it as an action. The hand vanishes if it is "
            "ever more than 30 feet away from you or if you cast this spell again. You can use "
            "your action to control the hand. You can use the hand to manipulate an object, open "
            "an unlocked door or container, stow or retrieve an item from an open container, or "
            "pour the contents out of a vial. The hand can't attack, activate magic items, or "
            "carry more than 10 pounds."
        ),
        classes=["Bard", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Mending",
        level=0,
        school="Transmutation",
        casting_time="1 minute",
        range="Touch",
        components_v=True,
        components_s=True,
        components_m="Two lodestones",
        duration="Instantaneous",
        description=(
            "This spell repairs a single break or tear in an object you touch, such as a broken "
            "chain link, two halves of a broken key, a torn cloak, or a leaking wineskin. As long "
            "as the break or tear is no larger than 1 foot in any dimension, you mend it, leaving "
            "no trace of the former damage. This spell can physically repair a magic item or "
            "construct, but it can't restore magic to such an object."
        ),
        classes=["Bard", "Cleric", "Druid", "Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Minor Illusion",
        level=0,
        school="Illusion",
        casting_time="1 action",
        range="30 feet",
        components_s=True,
        components_m="A bit of fleece",
        duration="1 minute",
        description=(
            "You create a sound or an image of an object within range that lasts for the duration. "
            "The illusion ends if you dismiss it as an action or cast this spell again. "
            "If you create a sound, its volume can range from a whisper to a scream. "
            "If you create an image of an object, it must be no larger than a 5-foot cube. "
            "A creature that uses its action to examine the illusion can determine that it is an "
            "illusion with a successful Investigation check against your spell save DC."
        ),
        classes=["Bard", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Poison Spray",
        level=0,
        school="Necromancy",
        casting_time="1 action",
        range="30 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "You extend your hand toward a creature you can see within range and project a puff "
            "of noxious gas from your palm. The target must succeed on a Constitution saving throw "
            "or take 1d12 Poison damage."
        ),
        higher_levels=("Damage increases to 2d12 at 5th level, 3d12 at 11th, and 4d12 at 17th."),
        damage_dice="1d12",
        damage_type="poison",
        save_ability="CON",
        classes=["Druid", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Prestidigitation",
        level=0,
        school="Transmutation",
        casting_time="1 action",
        range="10 feet",
        components_v=True,
        components_s=True,
        duration="Up to 1 hour",
        description=(
            "This spell is a minor magical trick that novice spellcasters use for practice. You "
            "create one of the following magical effects within range: a harmless sensory effect; "
            "instantly light or snuff out a candle, a torch, or a small campfire; clean or soil "
            "an object no larger than 1 cubic foot; chill, warm, or flavor up to 1 cubic foot of "
            "nonliving material for 1 hour; make a color, a small mark, or a symbol appear on an "
            "object or surface for 1 hour; create a nonmagical trinket or illusory image that fits "
            "in your hand and lasts until the end of your next turn."
        ),
        classes=["Bard", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Ray of Frost",
        level=0,
        school="Evocation",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "A frigid beam of blue-white light streaks toward a creature within range. Make a "
            "ranged spell attack against the target. On a hit, it takes 1d8 Cold damage, and its "
            "Speed is reduced by 10 feet until the start of your next turn."
        ),
        higher_levels="Damage increases by 1d8 at 5th level, 11th, and 17th.",
        damage_dice="1d8",
        damage_type="cold",
        attack_type="ranged",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Sacred Flame",
        level=0,
        school="Evocation",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "Flame-like radiance descends on a creature you can see within range. The target must "
            "succeed on a Dexterity saving throw or take 1d8 Radiant damage. The target gains no "
            "benefit from cover for this saving throw."
        ),
        higher_levels="Damage increases by 1d8 at 5th level, 11th, and 17th.",
        damage_dice="1d8",
        damage_type="radiant",
        save_ability="DEX",
        classes=["Cleric"],
    ),
    SpellCreate(
        name="Shocking Grasp",
        level=0,
        school="Evocation",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "Lightning springs from your hand to deliver a shock to a creature you try to touch. "
            "Make a melee spell attack against the target. You have advantage on the attack roll "
            "if the target is wearing armor made of metal. On a hit, the target takes 1d8 "
            "Lightning damage and can't take Reactions until the start of its next turn."
        ),
        higher_levels="Damage increases by 1d8 at 5th level, 11th, and 17th.",
        damage_dice="1d8",
        damage_type="lightning",
        attack_type="melee",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Spare the Dying",
        level=0,
        school="Necromancy",
        casting_time="1 action",
        range="15 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "Choose a creature within range that has 0 Hit Points and is alive. The creature "
            "becomes stable. This spell has no effect on Undead or Constructs."
        ),
        classes=["Cleric", "Druid"],
    ),
    SpellCreate(
        name="True Strike",
        level=0,
        school="Divination",
        casting_time="1 action",
        range="Self",
        components_v=True,
        components_s=True,
        components_m="A weapon worth 1+ GP with which you have proficiency",
        duration="Instantaneous",
        description=(
            "Guided by a flash of magical insight, you make one attack with the weapon used in "
            "the spell's casting. The attack uses your spellcasting ability for the attack and "
            "damage rolls instead of using Strength or Dexterity. If the attack deals damage, it "
            "can be Radiant damage or the weapon's normal damage type (your choice)."
        ),
        higher_levels=(
            "The attack deals an additional 1d6 Radiant damage at 5th level (1d6), 11th (2d6), "
            "and 17th (3d6)."
        ),
        damage_dice="weapon",
        damage_type="radiant or weapon",
        attack_type="melee or ranged",
        classes=["Bard", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Vicious Mockery",
        level=0,
        school="Enchantment",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        duration="Instantaneous",
        description=(
            "You unleash a string of insults laced with subtle enchantments at a creature you can "
            "see within range. The target must succeed on a Wisdom saving throw or take 1d6 "
            "Psychic damage and have Disadvantage on the next attack roll it makes before the end "
            "of its next turn."
        ),
        higher_levels="Damage increases by 1d6 at 5th level, 11th, and 17th.",
        damage_dice="1d6",
        damage_type="psychic",
        save_ability="WIS",
        classes=["Bard"],
    ),
    # ── Level 1 ──────────────────────────────────────────────────────────
    SpellCreate(
        name="Bless",
        level=1,
        school="Enchantment",
        casting_time="1 action",
        range="30 feet",
        components_v=True,
        components_s=True,
        components_m="A sprinkling of holy water",
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "You bless up to three creatures of your choice within range. Whenever a target "
            "makes an attack roll or a saving throw before the spell ends, it can roll a d4 and "
            "add the number rolled to the result."
        ),
        higher_levels=(
            "Using a 2nd-level or higher spell slot, you can target one additional creature for "
            "each slot level above 1."
        ),
        classes=["Cleric", "Paladin"],
    ),
    SpellCreate(
        name="Burning Hands",
        level=1,
        school="Evocation",
        casting_time="1 action",
        range="Self (15-foot cone)",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "As you hold your hands with thumbs touching and fingers spread, a thin sheet of "
            "flames shoots forth from your outstretched fingertips. Each creature in a 15-foot "
            "cone must make a Dexterity saving throw. A creature takes 3d6 Fire damage on a "
            "failed save, or half as much on a success. The fire ignites flammable objects in "
            "the area that aren't being worn or carried."
        ),
        higher_levels="Damage increases by 1d6 for each slot level above 1st.",
        damage_dice="3d6",
        damage_type="fire",
        save_ability="DEX",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Charm Person",
        level=1,
        school="Enchantment",
        casting_time="1 action",
        range="30 feet",
        components_v=True,
        components_s=True,
        duration="1 hour",
        description=(
            "You attempt to charm a Humanoid you can see within range. It must succeed on a "
            "Wisdom saving throw or be charmed by you for the duration. The charmed creature "
            "regards you as a friendly acquaintance. The creature has advantage on the saving "
            "throw if you or your companions are fighting it. The spell ends if you or any of "
            "your companions hurt the target. When the spell ends, the creature knows it was "
            "charmed by you."
        ),
        higher_levels="Targets one additional creature for each slot level above 1st.",
        save_ability="WIS",
        classes=["Bard", "Druid", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Cure Wounds",
        level=1,
        school="Abjuration",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "A creature you touch regains a number of Hit Points equal to 2d8 + your spellcasting "
            "ability modifier. This spell has no effect on Undead or Constructs."
        ),
        higher_levels="Healing increases by 2d8 for each slot level above 1st.",
        damage_dice="2d8",
        damage_type="healing",
        classes=["Bard", "Cleric", "Druid", "Paladin", "Ranger"],
    ),
    SpellCreate(
        name="Detect Magic",
        level=1,
        school="Divination",
        casting_time="1 action (Ritual)",
        range="Self",
        components_v=True,
        components_s=True,
        duration="Concentration, up to 10 minutes",
        is_ritual=True,
        is_concentration=True,
        description=(
            "For the duration, you sense the presence of magic within 30 feet of you. If you "
            "sense magic in this way, you can use your action to see a faint aura around any "
            "visible creature or object in the area that bears magic, and you learn its school "
            "of magic, if any. The spell can penetrate most barriers, but is blocked by 1 foot of "
            "stone, 1 inch of common metal, a thin sheet of lead, or 3 feet of wood or dirt."
        ),
        classes=["Bard", "Cleric", "Druid", "Paladin", "Ranger", "Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Faerie Fire",
        level=1,
        school="Evocation",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "Each object in a 20-foot cube within range is outlined in blue, green, or violet "
            "light (your choice). Any creature in the area when the spell is cast is also "
            "outlined in light if it fails a Dexterity saving throw. For the duration, objects "
            "and affected creatures shed Dim Light in a 10-foot radius. Any attack roll against "
            "an affected creature or object has advantage if the attacker can see it, and the "
            "affected creature or object can't benefit from being Invisible."
        ),
        save_ability="DEX",
        classes=["Bard", "Druid"],
    ),
    SpellCreate(
        name="Feather Fall",
        level=1,
        school="Transmutation",
        casting_time="1 reaction",
        range="60 feet",
        components_v=True,
        components_m="A small feather or piece of down",
        duration="1 minute",
        description=(
            "Choose up to five falling creatures within range. A falling creature's rate of "
            "descent slows to 60 feet per round until the spell ends. If the creature lands "
            "before the spell ends, it takes no falling damage and can land on its feet, and the "
            "spell ends for that creature."
        ),
        classes=["Bard", "Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Healing Word",
        level=1,
        school="Abjuration",
        casting_time="1 bonus action",
        range="60 feet",
        components_v=True,
        duration="Instantaneous",
        description=(
            "A creature of your choice that you can see within range regains Hit Points equal to "
            "1d4 + your spellcasting ability modifier. This spell has no effect on Undead or "
            "Constructs."
        ),
        higher_levels="Healing increases by 1d4 for each slot level above 1st.",
        damage_dice="1d4",
        damage_type="healing",
        classes=["Bard", "Cleric", "Druid"],
    ),
    SpellCreate(
        name="Hunter's Mark",
        level=1,
        school="Divination",
        casting_time="1 bonus action",
        range="90 feet",
        components_v=True,
        duration="Concentration, up to 1 hour",
        is_concentration=True,
        description=(
            "You choose a creature you can see within range and mystically mark it as your "
            "quarry. Until the spell ends, you deal an extra 1d6 damage to the target whenever "
            "you hit it with a weapon attack. Also, you have Advantage on any Wisdom (Perception) "
            "or Wisdom (Survival) check you make to find it. If the target drops to 0 Hit Points "
            "before this spell ends, you can use a bonus action to mark a new creature."
        ),
        higher_levels=(
            "Using a 3rd or 4th-level slot, you can maintain concentration on the spell for up "
            "to 8 hours. Using a 5th-level slot or higher, you can maintain it for up to 24 hours."
        ),
        damage_dice="1d6",
        damage_type="weapon",
        classes=["Ranger"],
    ),
    SpellCreate(
        name="Mage Armor",
        level=1,
        school="Abjuration",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        components_m="A piece of cured leather",
        duration="8 hours",
        description=(
            "You touch a willing creature who isn't wearing armor, and a protective magical force "
            "surrounds it until the spell ends. The target's base Armor Class becomes 13 + its "
            "Dexterity modifier. The spell ends if the target dons armor or if you dismiss it as "
            "an action."
        ),
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Magic Missile",
        level=1,
        school="Evocation",
        casting_time="1 action",
        range="120 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "You create three glowing darts of magical force. Each dart hits a creature of your "
            "choice that you can see within range. A dart deals 1d4 + 1 Force damage to its "
            "target. The darts all strike simultaneously, and you can direct them to hit one "
            "creature or several."
        ),
        higher_levels="The spell creates one additional dart for each slot level above 1st.",
        damage_dice="1d4+1",
        damage_type="force",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Shield",
        level=1,
        school="Abjuration",
        casting_time="1 reaction",
        range="Self",
        components_v=True,
        components_s=True,
        duration="1 round",
        description=(
            "An invisible barrier of magical force appears and protects you. Until the start of "
            "your next turn, you have a +5 bonus to AC, including against the triggering attack, "
            "and you take no damage from Magic Missile."
        ),
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Sleep",
        level=1,
        school="Enchantment",
        casting_time="1 action",
        range="90 feet",
        components_v=True,
        components_s=True,
        components_m="A pinch of fine sand, rose petals, or a cricket",
        duration="1 minute",
        description=(
            "This spell sends creatures into a magical slumber. Roll 5d8; the total is how many "
            "Hit Points of creatures this spell can affect. Creatures within 20 feet of a point "
            "you choose within range are affected in ascending order of their current Hit Points. "
            "Starting with the creature that has the lowest current Hit Points, each creature "
            "affected by this spell falls Unconscious until the spell ends, the sleeper takes "
            "damage, or someone uses an action to shake or slap the sleeper awake. Subtract each "
            "creature's Hit Points from the total before moving on to the next. Undead and "
            "creatures immune to the Charmed condition aren't affected."
        ),
        higher_levels="Roll an additional 2d8 for each slot level above 1st.",
        classes=["Bard", "Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Thunderwave",
        level=1,
        school="Evocation",
        casting_time="1 action",
        range="Self (15-foot cube)",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "A wave of thunderous force sweeps out from you. Each creature in a 15-foot cube "
            "originating from you must make a Constitution saving throw. On a failed save, a "
            "creature takes 2d8 Thunder damage and is pushed 10 feet away from you. On a "
            "successful save, the creature takes half as much damage and isn't pushed. Unsecured "
            "objects in the area are also pushed 10 feet away from you, and the spell emits a "
            "thunderous boom audible out to 300 feet."
        ),
        higher_levels="Damage increases by 1d8 for each slot level above 1st.",
        damage_dice="2d8",
        damage_type="thunder",
        save_ability="CON",
        classes=["Bard", "Druid", "Sorcerer", "Wizard"],
    ),
    # ── Level 2 ──────────────────────────────────────────────────────────
    SpellCreate(
        name="Aid",
        level=2,
        school="Abjuration",
        casting_time="1 action",
        range="30 feet",
        components_v=True,
        components_s=True,
        components_m="A tiny strip of white cloth",
        duration="8 hours",
        description=(
            "Your spell bolsters your allies with toughness and resolve. Choose up to three "
            "creatures within range. Each target's Hit Point maximum and current Hit Points "
            "increase by 5 for the duration."
        ),
        higher_levels="Targets' HP increases by an additional 5 for each slot level above 2nd.",
        damage_dice="5",
        damage_type="healing",
        classes=["Cleric", "Paladin"],
    ),
    SpellCreate(
        name="Hold Person",
        level=2,
        school="Enchantment",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        components_m="A small, straight piece of iron",
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "Choose a Humanoid you can see within range. The target must succeed on a Wisdom "
            "saving throw or be paralyzed for the duration. At the end of each of its turns, the "
            "target can make another Wisdom save. On a success, the spell ends on the target."
        ),
        higher_levels="Targets one additional Humanoid for each slot level above 2nd.",
        save_ability="WIS",
        classes=["Bard", "Cleric", "Druid", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Invisibility",
        level=2,
        school="Illusion",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        components_m="An eyelash encased in gum arabic",
        duration="Concentration, up to 1 hour",
        is_concentration=True,
        description=(
            "A creature you touch becomes Invisible until the spell ends. Anything the target is "
            "wearing or carrying is invisible as long as it is on the target's person. The spell "
            "ends for a target that attacks or casts a spell."
        ),
        higher_levels="Targets one additional creature for each slot level above 2nd.",
        classes=["Bard", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Lesser Restoration",
        level=2,
        school="Abjuration",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "You touch a creature and can end one of the following conditions or effects on it: "
            "Blinded, Deafened, Paralyzed, or Poisoned. You can also remove one disease."
        ),
        classes=["Bard", "Cleric", "Druid", "Paladin", "Ranger"],
    ),
    SpellCreate(
        name="Mirror Image",
        level=2,
        school="Illusion",
        casting_time="1 action",
        range="Self",
        components_v=True,
        components_s=True,
        duration="1 minute",
        description=(
            "Three illusory duplicates of yourself appear in your space. Until the spell ends, "
            "the duplicates move with you and mimic your actions, shifting position so it's "
            "impossible to track which image is real. When a creature targets you with an attack "
            "during the spell's duration, roll a d20 to determine whether the attack instead "
            "targets one of your duplicates. With three duplicates, attacks target a duplicate on "
            "a roll of 6 or higher. Each duplicate has an AC equal to 10 + your Dexterity "
            "modifier; an attack that hits the duplicate destroys it."
        ),
        classes=["Bard", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Misty Step",
        level=2,
        school="Conjuration",
        casting_time="1 bonus action",
        range="Self",
        components_v=True,
        duration="Instantaneous",
        description=(
            "Briefly surrounded by silvery mist, you teleport up to 30 feet to an unoccupied "
            "space that you can see."
        ),
        classes=["Bard", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Scorching Ray",
        level=2,
        school="Evocation",
        casting_time="1 action",
        range="120 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "You create three rays of fire and hurl them at targets within range. You can hurl "
            "them at one target or several. Make a ranged spell attack for each ray. On a hit, "
            "the target takes 2d6 Fire damage."
        ),
        higher_levels="The spell creates one additional ray for each slot level above 2nd.",
        damage_dice="2d6",
        damage_type="fire",
        attack_type="ranged",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Spiritual Weapon",
        level=2,
        school="Evocation",
        casting_time="1 bonus action",
        range="60 feet",
        components_v=True,
        components_s=True,
        duration="1 minute",
        description=(
            "You create a floating, spectral weapon within range that lasts for the duration or "
            "until you cast this spell again. When you cast the spell, you can make a melee spell "
            "attack against a creature within 5 feet of the weapon. On a hit, the target takes "
            "Force damage equal to 1d8 + your spellcasting ability modifier. As a bonus action on "
            "your turn, you can move the weapon up to 20 feet and repeat the attack against a "
            "creature within 5 feet of it."
        ),
        higher_levels="Damage increases by 1d8 for every two slot levels above 2nd.",
        damage_dice="1d8",
        damage_type="force",
        attack_type="melee",
        classes=["Cleric"],
    ),
    SpellCreate(
        name="Web",
        level=2,
        school="Conjuration",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        components_m="A bit of spiderweb",
        duration="Concentration, up to 1 hour",
        is_concentration=True,
        description=(
            "You conjure a mass of thick, sticky webbing at a point of your choice within range. "
            "The webs fill a 20-foot cube. Each creature that starts its turn in the webs or "
            "enters them during its turn must make a Dexterity saving throw. On a failed save, "
            "the creature is Restrained as long as it remains in the webs. A creature restrained "
            "by the webs can use its action to make a Strength check against your spell save DC "
            "to escape. The webs are flammable; any 5-foot cube of webs exposed to fire burns "
            "away in 1 round, dealing 2d4 Fire damage to any creature that starts its turn in "
            "the fire."
        ),
        save_ability="DEX",
        classes=["Sorcerer", "Wizard"],
    ),
    # ── Level 3 ──────────────────────────────────────────────────────────
    SpellCreate(
        name="Counterspell",
        level=3,
        school="Abjuration",
        casting_time="1 reaction",
        range="60 feet",
        components_s=True,
        duration="Instantaneous",
        description=(
            "You attempt to interrupt a creature in the process of casting a spell. The creature "
            "must succeed on a Constitution saving throw or its spell fails and has no effect. "
            "The save DC equals 10 + the spell's level."
        ),
        higher_levels=(
            "Using a 4th or higher slot grants a bonus to the save DC: instead of 10, the DC is "
            "8 + your spellcasting ability modifier + your proficiency bonus."
        ),
        save_ability="CON",
        classes=["Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Dispel Magic",
        level=3,
        school="Abjuration",
        casting_time="1 action",
        range="120 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "Choose one creature, object, or magical effect within range. Any spell of 3rd level "
            "or lower on the target ends. For each spell of 4th level or higher on the target, "
            "make an ability check using your spellcasting ability. The DC equals 10 + the "
            "spell's level. On a successful check, the spell ends."
        ),
        higher_levels=(
            "A spell of equal or lower level than the slot used is automatically dispelled."
        ),
        classes=["Bard", "Cleric", "Druid", "Paladin", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Fireball",
        level=3,
        school="Evocation",
        casting_time="1 action",
        range="150 feet",
        components_v=True,
        components_s=True,
        components_m="A tiny ball of bat guano and sulfur",
        duration="Instantaneous",
        description=(
            "A bright streak flashes from you to a point you choose within range and then "
            "blossoms with a low roar into an explosion of flame. Each creature in a 20-foot-"
            "radius sphere centered on that point must make a Dexterity saving throw. A target "
            "takes 8d6 Fire damage on a failed save, or half as much on a success. The fire "
            "spreads around corners. It ignites flammable objects in the area that aren't being "
            "worn or carried."
        ),
        higher_levels="Damage increases by 1d6 for each slot level above 3rd.",
        damage_dice="8d6",
        damage_type="fire",
        save_ability="DEX",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Fly",
        level=3,
        school="Transmutation",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        components_m="A wing feather from any bird",
        duration="Concentration, up to 10 minutes",
        is_concentration=True,
        description=(
            "You touch a willing creature. The target gains a Fly Speed of 60 feet for the "
            "duration. When the spell ends, the target falls if it is still aloft, unless it "
            "can stop the fall."
        ),
        higher_levels="Targets one additional creature for each slot level above 3rd.",
        classes=["Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Haste",
        level=3,
        school="Transmutation",
        casting_time="1 action",
        range="30 feet",
        components_v=True,
        components_s=True,
        components_m="A shaving of licorice root",
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "Choose a willing creature you can see within range. Until the spell ends, the "
            "target's Speed is doubled, it gains a +2 bonus to AC, it has Advantage on Dexterity "
            "saving throws, and it gains an additional action on each of its turns. That action "
            "can be used only to take the Attack (one weapon attack only), Dash, Disengage, "
            "Hide, or Use an Object action. When the spell ends, the target can't move or take "
            "actions until after its next turn, as a wave of lethargy sweeps over it."
        ),
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Hypnotic Pattern",
        level=3,
        school="Illusion",
        casting_time="1 action",
        range="120 feet",
        components_s=True,
        components_m=(
            "A glowing stick of incense or a crystal vial filled with phosphorescent material"
        ),
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "You create a twisting pattern of colors that weaves through the air inside a "
            "30-foot cube within range. Each creature in the area that sees the pattern must "
            "make a Wisdom saving throw. On a failed save, the creature is Charmed for the "
            "duration, becoming incapacitated and having a Speed of 0. The spell ends for an "
            "affected creature if it takes any damage or someone uses an action to shake it out "
            "of its stupor."
        ),
        save_ability="WIS",
        classes=["Bard", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Lightning Bolt",
        level=3,
        school="Evocation",
        casting_time="1 action",
        range="Self (100-foot line)",
        components_v=True,
        components_s=True,
        components_m="A bit of fur and a rod of amber, crystal, or glass",
        duration="Instantaneous",
        description=(
            "A stroke of lightning forming a line 100 feet long and 5 feet wide blasts out from "
            "you in a direction you choose. Each creature in the line must make a Dexterity "
            "saving throw. A creature takes 8d6 Lightning damage on a failed save, or half as "
            "much on a success. The lightning ignites flammable objects in the area that aren't "
            "being worn or carried."
        ),
        higher_levels="Damage increases by 1d6 for each slot level above 3rd.",
        damage_dice="8d6",
        damage_type="lightning",
        save_ability="DEX",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Mass Healing Word",
        level=3,
        school="Abjuration",
        casting_time="1 bonus action",
        range="60 feet",
        components_v=True,
        duration="Instantaneous",
        description=(
            "Up to six creatures of your choice that you can see within range regain Hit Points "
            "equal to 1d4 + your spellcasting ability modifier. This spell has no effect on "
            "Undead or Constructs."
        ),
        higher_levels="Healing increases by 1d4 for each slot level above 3rd.",
        damage_dice="1d4",
        damage_type="healing",
        classes=["Bard", "Cleric"],
    ),
    SpellCreate(
        name="Revivify",
        level=3,
        school="Necromancy",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        components_m="Diamonds worth 300+ GP, which the spell consumes",
        duration="Instantaneous",
        description=(
            "You touch a creature that has died within the last minute. That creature returns to "
            "life with 1 Hit Point. This spell can't return to life a creature that has died of "
            "old age, nor can it restore any missing body parts."
        ),
        classes=["Artificer", "Cleric", "Paladin"],
    ),
    SpellCreate(
        name="Spirit Guardians",
        level=3,
        school="Conjuration",
        casting_time="1 action",
        range="Self (15-foot radius)",
        components_v=True,
        components_s=True,
        components_m="A holy symbol",
        duration="Concentration, up to 10 minutes",
        is_concentration=True,
        description=(
            "You call forth spirits to protect you. They flit around you in a 15-foot radius for "
            "the duration. If you are good or neutral, their spectral form appears angelic; if "
            "evil, fiendish. When you cast this spell, you can designate any number of creatures "
            "you can see to be unaffected. Affected creatures' Speed is halved in the area, and "
            "when a creature enters the area for the first time on a turn or starts its turn "
            "there, it must make a Wisdom saving throw. On a failed save, it takes 3d8 Radiant "
            "damage (or Necrotic, your choice when you cast this spell), or half as much on a "
            "success."
        ),
        higher_levels="Damage increases by 1d8 for each slot level above 3rd.",
        damage_dice="3d8",
        damage_type="radiant",
        save_ability="WIS",
        classes=["Cleric"],
    ),
    # ── Level 4 ──────────────────────────────────────────────────────────
    SpellCreate(
        name="Banishment",
        level=4,
        school="Abjuration",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        components_m="An item distasteful to the target",
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "You attempt to send one creature that you can see within range to another plane of "
            "existence. The target must succeed on a Charisma saving throw or be banished. If "
            "the target is native to the plane you're on, you banish it to a harmless demiplane "
            "where it is incapacitated. If the target is native to a different plane, it is "
            "banished there with a tug. If the spell ends before 1 minute has passed, the target "
            "reappears in the space it left."
        ),
        higher_levels="Targets one additional creature for each slot level above 4th.",
        save_ability="CHA",
        classes=["Cleric", "Paladin", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Greater Invisibility",
        level=4,
        school="Illusion",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "You or a creature you touch becomes Invisible until the spell ends. Anything the "
            "target is wearing or carrying is invisible as long as it is on the target's person."
        ),
        classes=["Bard", "Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Polymorph",
        level=4,
        school="Transmutation",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        components_m="A caterpillar cocoon",
        duration="Concentration, up to 1 hour",
        is_concentration=True,
        description=(
            "This spell transforms a creature you can see within range into a new form. An "
            "unwilling creature must succeed on a Wisdom saving throw to avoid the effect. The "
            "new form must be a Beast with a Challenge Rating equal to or less than the target's "
            "(or the target's level, if it has no CR). The transformed creature's stats are "
            "replaced by those of the new form, but it retains its alignment and personality. "
            "It assumes the new form's Hit Points; when it reverts, the creature returns to its "
            "original Hit Points (or 0 if reduced to that). The spell ends early if the target "
            "drops to 0 HP, dies, or you use your action to dismiss it."
        ),
        save_ability="WIS",
        classes=["Bard", "Druid", "Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Stoneskin",
        level=4,
        school="Transmutation",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        components_m="Diamond dust worth 100+ GP, which the spell consumes",
        duration="Concentration, up to 1 hour",
        is_concentration=True,
        description=(
            "Until the spell ends, one willing creature you touch has Resistance to Bludgeoning, "
            "Piercing, and Slashing damage from nonmagical attacks."
        ),
        classes=["Druid", "Ranger", "Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Wall of Fire",
        level=4,
        school="Evocation",
        casting_time="1 action",
        range="120 feet",
        components_v=True,
        components_s=True,
        components_m="A small piece of phosphorus",
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "You create a wall of fire on a solid surface within range. You can make the wall "
            "up to 60 feet long, 20 feet high, and 1 foot thick, or a ringed wall up to 20 feet "
            "in diameter, 20 feet high, and 1 foot thick. The wall is opaque and lasts for the "
            "duration. When the wall appears, each creature within its area must make a "
            "Dexterity saving throw, taking 5d8 Fire damage on a failed save, or half as much on "
            "a success. The hot side deals 5d8 Fire damage to each creature that ends its turn "
            "within 10 feet of it or inside it."
        ),
        higher_levels="Damage increases by 1d8 for each slot level above 4th.",
        damage_dice="5d8",
        damage_type="fire",
        save_ability="DEX",
        classes=["Druid", "Sorcerer", "Wizard"],
    ),
    # ── Level 5 ──────────────────────────────────────────────────────────
    SpellCreate(
        name="Cone of Cold",
        level=5,
        school="Evocation",
        casting_time="1 action",
        range="Self (60-foot cone)",
        components_v=True,
        components_s=True,
        components_m="A small crystal or glass cone",
        duration="Instantaneous",
        description=(
            "A blast of cold air erupts from your hands. Each creature in a 60-foot cone must "
            "make a Constitution saving throw, taking 8d8 Cold damage on a failed save, or half "
            "as much on a success."
        ),
        higher_levels="Damage increases by 1d8 for each slot level above 5th.",
        damage_dice="8d8",
        damage_type="cold",
        save_ability="CON",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Hold Monster",
        level=5,
        school="Enchantment",
        casting_time="1 action",
        range="90 feet",
        components_v=True,
        components_s=True,
        components_m="A small, straight piece of iron",
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "Choose a creature that isn't a Construct or Undead within range. The target must "
            "succeed on a Wisdom saving throw or be paralyzed for the duration. The target "
            "repeats the save at the end of each of its turns; on a success, the spell ends on "
            "the target."
        ),
        higher_levels="Targets one additional creature for each slot level above 5th.",
        save_ability="WIS",
        classes=["Bard", "Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Mass Cure Wounds",
        level=5,
        school="Abjuration",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "A wave of healing energy washes out from a point of your choice within range. "
            "Choose up to six creatures in a 30-foot-radius sphere centered on that point. Each "
            "target regains 3d8 + your spellcasting ability modifier Hit Points. This spell has "
            "no effect on Undead or Constructs."
        ),
        higher_levels="Healing increases by 1d8 for each slot level above 5th.",
        damage_dice="3d8",
        damage_type="healing",
        classes=["Bard", "Cleric", "Druid"],
    ),
    # ── Level 6 ──────────────────────────────────────────────────────────
    SpellCreate(
        name="Chain Lightning",
        level=6,
        school="Evocation",
        casting_time="1 action",
        range="150 feet",
        components_v=True,
        components_s=True,
        components_m="A bit of fur; a piece of amber, glass, or crystal rod; and three silver pins",
        duration="Instantaneous",
        description=(
            "You create a bolt of lightning that arcs toward a target of your choice within "
            "range. Three bolts then leap from that target to as many as three other targets, "
            "each of which must be within 30 feet of the first. A target can be a creature or "
            "an object and can be targeted by only one of the bolts. A target must make a "
            "Dexterity saving throw. On a failed save, it takes 10d8 Lightning damage; half as "
            "much on a success."
        ),
        higher_levels=(
            "One additional bolt leaps from the first target for each slot level above 6th."
        ),
        damage_dice="10d8",
        damage_type="lightning",
        save_ability="DEX",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Disintegrate",
        level=6,
        school="Transmutation",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        components_m="A lodestone and a pinch of dust",
        duration="Instantaneous",
        description=(
            "A thin green ray springs from your pointing finger to a target you can see within "
            "range. The target can be a creature, an object, or a creation of magical force. A "
            "creature targeted by this spell must make a Dexterity saving throw. On a failed "
            "save, the target takes 10d6 + 40 Force damage. If this damage reduces the target "
            "to 0 Hit Points, it is disintegrated. A disintegrated creature and everything it "
            "is wearing and carrying are reduced to a pile of fine gray dust."
        ),
        higher_levels="Damage increases by 3d6 for each slot level above 6th.",
        damage_dice="10d6+40",
        damage_type="force",
        save_ability="DEX",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Heal",
        level=6,
        school="Abjuration",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "Choose a creature you can see within range. A surge of positive energy washes "
            "through the creature, causing it to regain 70 Hit Points. This spell also ends "
            "Blindness, Deafness, and any diseases affecting the target. This spell has no "
            "effect on Undead or Constructs."
        ),
        higher_levels="Healing increases by 10 for each slot level above 6th.",
        damage_dice="70",
        damage_type="healing",
        classes=["Cleric", "Druid"],
    ),
    # ── Level 7 ──────────────────────────────────────────────────────────
    SpellCreate(
        name="Finger of Death",
        level=7,
        school="Necromancy",
        casting_time="1 action",
        range="60 feet",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "You send negative energy coursing through a creature that you can see within range, "
            "causing it searing pain. The target must make a Constitution saving throw. It takes "
            "7d8 + 30 Necrotic damage on a failed save, or half as much on a success. A Humanoid "
            "killed by this spell rises at the start of your next turn as a Zombie that is "
            "permanently under your command, following your verbal orders to the best of its "
            "ability."
        ),
        damage_dice="7d8+30",
        damage_type="necrotic",
        save_ability="CON",
        classes=["Sorcerer", "Warlock", "Wizard"],
    ),
    SpellCreate(
        name="Plane Shift",
        level=7,
        school="Conjuration",
        casting_time="1 action",
        range="Touch",
        components_v=True,
        components_s=True,
        components_m="A forked metal rod worth at least 250 GP, attuned to a particular plane",
        duration="Instantaneous",
        description=(
            "You and up to eight willing creatures who link hands in a circle are transported "
            "to a different plane of existence. You can specify a target destination in general "
            "terms; you appear in or near that destination. Alternatively, you can use this spell "
            "to banish an unwilling creature to another plane (Charisma save to resist)."
        ),
        save_ability="CHA",
        classes=["Cleric", "Druid", "Sorcerer", "Warlock", "Wizard"],
    ),
    # ── Level 8 ──────────────────────────────────────────────────────────
    SpellCreate(
        name="Holy Aura",
        level=8,
        school="Abjuration",
        casting_time="1 action",
        range="Self",
        components_v=True,
        components_s=True,
        components_m="A tiny reliquary worth at least 1,000 GP",
        duration="Concentration, up to 1 minute",
        is_concentration=True,
        description=(
            "Divine light washes out from you and coalesces in a soft radiance in a 30-foot "
            "radius around you. Creatures of your choice in that radius gain the following "
            "benefits: their attack rolls have advantage, attack rolls against them have "
            "disadvantage, and they have advantage on saving throws. Additionally, when a Fiend "
            "or Undead hits an affected creature with a melee attack, the aura flashes with "
            "brilliant light. The attacker must succeed on a Constitution saving throw or be "
            "Blinded until the spell ends."
        ),
        save_ability="CON",
        classes=["Cleric"],
    ),
    SpellCreate(
        name="Sunburst",
        level=8,
        school="Evocation",
        casting_time="1 action",
        range="150 feet",
        components_v=True,
        components_s=True,
        components_m="Fire and a piece of sunstone",
        duration="Instantaneous",
        description=(
            "Brilliant sunlight flashes in a 60-foot radius centered on a point you choose "
            "within range. Each creature in that light must make a Constitution saving throw. "
            "On a failed save, a creature takes 12d6 Radiant damage and is Blinded for 1 minute. "
            "On a successful save, it takes half as much damage and isn't Blinded. A creature "
            "Blinded by this spell makes another Constitution save at the end of each of its "
            "turns. On a success, it is no longer Blinded. Undead and Oozes have disadvantage on "
            "the initial save."
        ),
        damage_dice="12d6",
        damage_type="radiant",
        save_ability="CON",
        classes=["Druid", "Sorcerer", "Wizard"],
    ),
    # ── Level 9 ──────────────────────────────────────────────────────────
    SpellCreate(
        name="Meteor Swarm",
        level=9,
        school="Evocation",
        casting_time="1 action",
        range="1 mile",
        components_v=True,
        components_s=True,
        duration="Instantaneous",
        description=(
            "Blazing orbs of fire plummet to the ground at four different points you can see "
            "within range. Each creature in a 40-foot-radius sphere centered on each point you "
            "choose must make a Dexterity saving throw. The sphere spreads around corners. A "
            "creature takes 20d6 Fire damage and 20d6 Bludgeoning damage on a failed save, or "
            "half as much on a success. A creature in the area of more than one fiery burst is "
            "affected only once."
        ),
        damage_dice="20d6+20d6",
        damage_type="fire and bludgeoning",
        save_ability="DEX",
        classes=["Sorcerer", "Wizard"],
    ),
    SpellCreate(
        name="Wish",
        level=9,
        school="Conjuration",
        casting_time="1 action",
        range="Self",
        components_v=True,
        duration="Instantaneous",
        description=(
            "Wish is the mightiest spell a mortal creature can cast. By simply speaking aloud, "
            "you can alter the very foundations of reality in accord with your desires. "
            "The basic use of this spell is to duplicate any other spell of 8th level or lower. "
            "Alternatively, you can create one of the effects listed in the spell description "
            "(create an object, restore HP, undo a recent event, grant resistance, etc.). "
            "Stress: invoking a wish to produce any effect other than duplicating another spell "
            "carries a risk: 1d3 days of weakness and a 33% chance of never being able to cast "
            "Wish again."
        ),
        classes=["Sorcerer", "Wizard"],
    ),
]
"""Validated SpellCreate payloads. ~70 entries covering the most-used 5.5e spells."""
