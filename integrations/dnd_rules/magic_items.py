"""PHB / DMG magic items seed data for QuestLab.

Each entry is a dict matching ItemCreate fields:
  name, rarity, item_type, description, attunement_required, value_gp, is_magic, properties

Rarity values: Common, Uncommon, Rare, VeryRare, Legendary, Artifact
"""

PHB_MAGIC_ITEMS = [
    # ── Potions ────────────────────────────────────────────────────────────────
    {
        "name": "Potion of Healing",
        "rarity": "Common",
        "item_type": "Potion",
        "description": "You regain 2d4+2 hit points when you drink this potion.",
        "attunement_required": False,
        "value_gp": 50,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Greater Healing",
        "rarity": "Uncommon",
        "item_type": "Potion",
        "description": "You regain 4d4+4 hit points when you drink this potion.",
        "attunement_required": False,
        "value_gp": 150,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Superior Healing",
        "rarity": "Rare",
        "item_type": "Potion",
        "description": "You regain 8d4+8 hit points when you drink this potion.",
        "attunement_required": False,
        "value_gp": 500,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Supreme Healing",
        "rarity": "VeryRare",
        "item_type": "Potion",
        "description": "You regain 10d4+20 hit points when you drink this potion.",
        "attunement_required": False,
        "value_gp": 1350,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Animal Friendship",
        "rarity": "Uncommon",
        "item_type": "Potion",
        "description": (
            "When you drink this potion, you can cast the animal friendship spell "
            "(save DC 13) for 1 hour at will."
        ),
        "attunement_required": False,
        "value_gp": 200,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Climbing",
        "rarity": "Common",
        "item_type": "Potion",
        "description": (
            "When you drink this potion, you gain a climbing speed equal to your walking "
            "speed for 1 hour. During this time, you have advantage on Strength (Athletics) "
            "checks made to climb."
        ),
        "attunement_required": False,
        "value_gp": 75,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Flying",
        "rarity": "VeryRare",
        "item_type": "Potion",
        "description": (
            "When you drink this potion, you gain a flying speed equal to your walking "
            "speed for 1 hour and can hover."
        ),
        "attunement_required": False,
        "value_gp": 500,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Gaseous Form",
        "rarity": "Rare",
        "item_type": "Potion",
        "description": (
            "When you drink this potion, you gain the effect of the gaseous form spell "
            "for 1 hour (no concentration required) or until you end the effect as a "
            "bonus action."
        ),
        "attunement_required": False,
        "value_gp": 300,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Heroism",
        "rarity": "Rare",
        "item_type": "Potion",
        "description": (
            "For 1 hour after drinking it, you gain 10 temporary hit points that last "
            "for 1 hour. For the same duration, you are under the effect of the bless "
            "spell (no concentration required)."
        ),
        "attunement_required": False,
        "value_gp": 400,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Invisibility",
        "rarity": "VeryRare",
        "item_type": "Potion",
        "description": (
            "This potion's container looks empty but feels as though it holds liquid. "
            "When you drink it, you become invisible for 1 hour. Anything you wear or "
            "carry is invisible with you."
        ),
        "attunement_required": False,
        "value_gp": 180,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Mind Reading",
        "rarity": "Rare",
        "item_type": "Potion",
        "description": (
            "When you drink this potion, you gain the effect of the detect thoughts "
            "spell (save DC 13). The potion's blue liquid has an ovoid cloud of pink "
            "floating in it."
        ),
        "attunement_required": False,
        "value_gp": 250,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Poison",
        "rarity": "Uncommon",
        "item_type": "Potion",
        "description": (
            "This concoction looks, smells, and tastes like a potion of healing or other "
            "beneficial potion. However, it is actually poison masked by illusion magic. "
            "On a failed DC 13 Constitution saving throw, it deals 3d6 poison damage."
        ),
        "attunement_required": False,
        "value_gp": 100,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Speed",
        "rarity": "VeryRare",
        "item_type": "Potion",
        "description": (
            "When you drink this potion, you gain the effect of the haste spell for "
            "1 minute (no concentration required)."
        ),
        "attunement_required": False,
        "value_gp": 400,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Potion of Water Breathing",
        "rarity": "Uncommon",
        "item_type": "Potion",
        "description": (
            "You can breathe underwater for 1 hour after drinking this potion. "
            "Its cloudy green fluid smells of the sea."
        ),
        "attunement_required": False,
        "value_gp": 180,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    # ── Scrolls ────────────────────────────────────────────────────────────────
    {
        "name": "Spell Scroll (Cantrip)",
        "rarity": "Common",
        "item_type": "Scroll",
        "description": (
            "A spell scroll bears the words of a single cantrip. If the spell is on your "
            "class's spell list, you can read the scroll and cast its spell without "
            "providing material components."
        ),
        "attunement_required": False,
        "value_gp": 25,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True, "spell_level": 0},
    },
    {
        "name": "Spell Scroll (1st Level)",
        "rarity": "Common",
        "item_type": "Scroll",
        "description": "A spell scroll bearing a 1st-level spell. Save DC 13, attack bonus +5.",
        "attunement_required": False,
        "value_gp": 75,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True, "spell_level": 1},
    },
    {
        "name": "Spell Scroll (2nd Level)",
        "rarity": "Uncommon",
        "item_type": "Scroll",
        "description": "A spell scroll bearing a 2nd-level spell. Save DC 13, attack bonus +5.",
        "attunement_required": False,
        "value_gp": 150,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True, "spell_level": 2},
    },
    {
        "name": "Spell Scroll (3rd Level)",
        "rarity": "Uncommon",
        "item_type": "Scroll",
        "description": "A spell scroll bearing a 3rd-level spell. Save DC 15, attack bonus +7.",
        "attunement_required": False,
        "value_gp": 300,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True, "spell_level": 3},
    },
    {
        "name": "Spell Scroll (4th Level)",
        "rarity": "Rare",
        "item_type": "Scroll",
        "description": "A spell scroll bearing a 4th-level spell. Save DC 15, attack bonus +7.",
        "attunement_required": False,
        "value_gp": 500,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True, "spell_level": 4},
    },
    {
        "name": "Spell Scroll (5th Level)",
        "rarity": "Rare",
        "item_type": "Scroll",
        "description": "A spell scroll bearing a 5th-level spell. Save DC 17, attack bonus +9.",
        "attunement_required": False,
        "value_gp": 1000,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True, "spell_level": 5},
    },
    # ── Weapons ────────────────────────────────────────────────────────────────
    {
        "name": "Sword of Vengeance",
        "rarity": "Uncommon",
        "item_type": "Weapon (any sword)",
        "description": (
            "You gain a +1 bonus to attack and damage rolls made with this magic weapon. "
            "Curse: Once you attune to it, you are unwilling to part with the sword and "
            "have disadvantage on attack rolls with other weapons."
        ),
        "attunement_required": True,
        "value_gp": 1000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+1", "cursed": True},
    },
    {
        "name": "+1 Weapon",
        "rarity": "Uncommon",
        "item_type": "Weapon (any)",
        "description": "You gain a +1 bonus to attack and damage rolls made with this magic weapon.",  # noqa: E501
        "attunement_required": False,
        "value_gp": 1000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+1"},
    },
    {
        "name": "+2 Weapon",
        "rarity": "Rare",
        "item_type": "Weapon (any)",
        "description": "You gain a +2 bonus to attack and damage rolls made with this magic weapon.",  # noqa: E501
        "attunement_required": False,
        "value_gp": 4000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+2"},
    },
    {
        "name": "+3 Weapon",
        "rarity": "VeryRare",
        "item_type": "Weapon (any)",
        "description": "You gain a +3 bonus to attack and damage rolls made with this magic weapon.",  # noqa: E501
        "attunement_required": False,
        "value_gp": 16000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+3"},
    },
    {
        "name": "Flame Tongue",
        "rarity": "Rare",
        "item_type": "Weapon (any sword)",
        "description": (
            "You can use a bonus action to speak this magic sword's command word, causing "
            "flames to erupt from the blade. These flames shed bright light in a 40-foot "
            "radius and dim light for an additional 40 feet. While the sword is ablaze, "
            "it deals an extra 2d6 fire damage on a hit."
        ),
        "attunement_required": True,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB", "damage_bonus": "2d6 fire"},
    },
    {
        "name": "Frost Brand",
        "rarity": "VeryRare",
        "item_type": "Weapon (any sword)",
        "description": (
            "When you hit with an attack using this magic sword, the target takes an "
            "extra 1d6 cold damage. In addition, while you hold the sword, you have "
            "resistance to fire damage. In freezing temperatures, the blade sheds bright "
            "light in a 10-foot radius and dim light for an additional 10 feet."
        ),
        "attunement_required": True,
        "value_gp": 14000,
        "is_magic": True,
        "properties": {"source": "PHB", "damage_bonus": "1d6 cold"},
    },
    {
        "name": "Sun Blade",
        "rarity": "Rare",
        "item_type": "Weapon (longsword)",
        "description": (
            "This item appears to be a longsword hilt. While grasping the hilt, you can "
            "use a bonus action to cause a blade of pure radiance to spring into existence. "
            "You gain a +2 bonus to attack and damage rolls. On a hit, the sword deals an "
            "extra 1d8 radiant damage. Undead and oozes have disadvantage on their saving "
            "throws against the blade's special abilities."
        ),
        "attunement_required": True,
        "value_gp": 12000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+2", "damage_bonus": "1d8 radiant"},
    },
    {
        "name": "Sword of Life Stealing",
        "rarity": "Rare",
        "item_type": "Weapon (any sword)",
        "description": (
            "When you attack a creature with this magic weapon and roll a 20 on the attack "
            "roll, that target takes an extra 10 necrotic damage if it isn't a construct "
            "or an undead. You also gain 10 temporary hit points."
        ),
        "attunement_required": True,
        "value_gp": 4000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Sword of Wounding",
        "rarity": "Rare",
        "item_type": "Weapon (any sword)",
        "description": (
            "Hit points lost to this weapon's damage can be regained only through a short "
            "or long rest, rather than by regeneration, magic, or any other means. Once "
            "per turn, when you hit a creature with an attack using this magic weapon, you "
            "can wound the target. At the start of each of the wounded creature's turns, "
            "it takes 1d4 necrotic damage for each time you've wounded it."
        ),
        "attunement_required": True,
        "value_gp": 6000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Vorpal Sword",
        "rarity": "Legendary",
        "item_type": "Weapon (any sword that deals slashing damage)",
        "description": (
            "You gain a +3 bonus to attack and damage rolls. In addition, the weapon "
            "ignores resistance to slashing damage. When you attack a creature that has "
            "at least one head with this weapon and roll a 20 on the attack roll, you cut "
            "off one of the creature's heads."
        ),
        "attunement_required": True,
        "value_gp": 50000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+3"},
    },
    {
        "name": "Holy Avenger",
        "rarity": "Legendary",
        "item_type": "Weapon (any sword)",
        "description": (
            "You gain a +3 bonus to attack and damage rolls. When you hit a fiend or "
            "undead with it, that creature takes an extra 2d10 radiant damage. "
            "While you hold the drawn sword, it creates an aura in a 10-foot radius "
            "around you. You and all creatures friendly to you in the aura have "
            "advantage on saving throws against spells and other magical effects."
        ),
        "attunement_required": True,
        "value_gp": 50000,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "bonus": "+3",
            "attunement_by": "paladin",
            "damage_bonus": "2d10 radiant vs fiends/undead",
        },
    },
    {
        "name": "Dagger of Venom",
        "rarity": "Rare",
        "item_type": "Weapon (dagger)",
        "description": (
            "You gain a +1 bonus to attack and damage rolls. You can use an action to "
            "cause thick, black poison to coat the blade. The poison remains for 1 minute "
            "or until an attack using this weapon hits a creature. That creature must "
            "succeed on a DC 15 Constitution saving throw or take 2d10 poison damage and "
            "become poisoned for 1 minute."
        ),
        "attunement_required": False,
        "value_gp": 2500,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+1"},
    },
    {
        "name": "Trident of Fish Command",
        "rarity": "Uncommon",
        "item_type": "Weapon (trident)",
        "description": (
            "This trident is a magic weapon. It has 3 charges. While you carry it, you "
            "can use an action and expend 1 charge to cast dominate beast (save DC 15) "
            "from it on a beast that has an innate swimming speed. The trident regains "
            "1d3 expended charges daily at dawn."
        ),
        "attunement_required": True,
        "value_gp": 800,
        "is_magic": True,
        "properties": {"source": "PHB", "charges": 3},
    },
    {
        "name": "Arrow of Slaying",
        "rarity": "VeryRare",
        "item_type": "Weapon (arrow)",
        "description": (
            "An arrow of slaying is a magic weapon meant to kill a particular kind of "
            "creature. When you hit that type of creature with the arrow, it must make a "
            "DC 17 Constitution saving throw or take 6d10 piercing damage. The arrow "
            "loses its magic after hitting any creature."
        ),
        "attunement_required": False,
        "value_gp": 600,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Berserker Axe",
        "rarity": "Rare",
        "item_type": "Weapon (any axe)",
        "description": (
            "You gain a +1 bonus to attack and damage rolls. Curse: While attuned, you "
            "have a -1 penalty to AC. The first time you take damage each combat, you "
            "must succeed on a DC 15 Wisdom saving throw or go berserk until the end of "
            "combat, attacking the nearest creature."
        ),
        "attunement_required": True,
        "value_gp": 2000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+1", "cursed": True},
    },
    {
        "name": "Giant Slayer",
        "rarity": "Rare",
        "item_type": "Weapon (any axe or sword)",
        "description": (
            "You gain a +1 bonus to attack and damage rolls. When you hit a giant with "
            "it, the giant takes an extra 2d6 damage of the weapon's type and must "
            "succeed on a DC 15 Strength saving throw or fall prone."
        ),
        "attunement_required": False,
        "value_gp": 3000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+1"},
    },
    {
        "name": "Dragon Slayer",
        "rarity": "Rare",
        "item_type": "Weapon (any sword)",
        "description": (
            "You gain a +1 bonus to attack and damage rolls. When you hit a dragon with "
            "this weapon, the dragon takes an extra 3d6 damage of the weapon's type."
        ),
        "attunement_required": False,
        "value_gp": 4000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+1"},
    },
    {
        "name": "Mace of Disruption",
        "rarity": "Rare",
        "item_type": "Weapon (mace)",
        "description": (
            "When you hit a fiend or undead with this magic weapon, that creature takes "
            "an extra 2d6 radiant damage. If the target has 25 hit points or fewer after "
            "taking this damage, it must succeed on a DC 15 Wisdom saving throw or be "
            "destroyed."
        ),
        "attunement_required": True,
        "value_gp": 6000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Mace of Terror",
        "rarity": "Rare",
        "item_type": "Weapon (mace)",
        "description": (
            "This weapon has 3 charges. While holding it, you can use an action and "
            "expend 1 charge to release a wave of terror. Each creature of your choice "
            "in a 30-foot radius must succeed on a DC 15 Wisdom saving throw or become "
            "frightened of you for 1 minute."
        ),
        "attunement_required": True,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB", "charges": 3},
    },
    {
        "name": "Javelin of Lightning",
        "rarity": "Uncommon",
        "item_type": "Weapon (javelin)",
        "description": (
            "This javelin is a magic weapon. When you hurl it and speak its command word, "
            "it transforms into a bolt of lightning, forming a line 5 feet wide that "
            "extends out from you to a target within 120 feet. Each creature in the line "
            "excluding you and the target must make a DC 13 Dexterity saving throw, "
            "taking 4d6 lightning damage on a failed save."
        ),
        "attunement_required": False,
        "value_gp": 1500,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    # ── Armor ──────────────────────────────────────────────────────────────────
    {
        "name": "+1 Armor",
        "rarity": "Rare",
        "item_type": "Armor (light, medium, or heavy)",
        "description": ("You have a +1 bonus to AC while wearing this armor."),
        "attunement_required": False,
        "value_gp": 1500,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+1"},
    },
    {
        "name": "+2 Armor",
        "rarity": "VeryRare",
        "item_type": "Armor (light, medium, or heavy)",
        "description": "You have a +2 bonus to AC while wearing this armor.",
        "attunement_required": False,
        "value_gp": 6000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+2"},
    },
    {
        "name": "+3 Armor",
        "rarity": "Legendary",
        "item_type": "Armor (light, medium, or heavy)",
        "description": "You have a +3 bonus to AC while wearing this armor.",
        "attunement_required": False,
        "value_gp": 24000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+3"},
    },
    {
        "name": "Adamantine Armor",
        "rarity": "Uncommon",
        "item_type": "Armor (medium or heavy, but not hide)",
        "description": (
            "This suit of armor is reinforced with adamantine, one of the hardest "
            "substances in existence. While you're wearing it, any critical hit against "
            "you becomes a normal hit."
        ),
        "attunement_required": False,
        "value_gp": 500,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Mithral Armor",
        "rarity": "Uncommon",
        "item_type": "Armor (medium or heavy, but not hide)",
        "description": (
            "Mithral is a light, flexible metal. A mithral chain shirt or breastplate can "
            "be worn under normal clothes. If the armor normally imposes disadvantage on "
            "Dexterity (Stealth) checks, the mithral version of the armor doesn't."
        ),
        "attunement_required": False,
        "value_gp": 400,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Armor of Vulnerability",
        "rarity": "Rare",
        "item_type": "Armor (plate)",
        "description": (
            "While wearing this armor, you have resistance to one of these damage types: "
            "bludgeoning, piercing, or slashing. Curse: You are vulnerable to the other "
            "two types."
        ),
        "attunement_required": True,
        "value_gp": 2000,
        "is_magic": True,
        "properties": {"source": "PHB", "cursed": True},
    },
    {
        "name": "Demon Armor",
        "rarity": "VeryRare",
        "item_type": "Armor (plate)",
        "description": (
            "While wearing this armor, you gain a +1 bonus to AC, and you can understand "
            "and speak Abyssal. The armor's clawed gauntlets turn unarmed strikes with "
            "your hands into magic weapons that deal slashing damage, with a +1 bonus to "
            "attack rolls and damage rolls, and a damage die of 1d8."
        ),
        "attunement_required": True,
        "value_gp": 20000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+1", "cursed": True},
    },
    {
        "name": "Elven Chain",
        "rarity": "Rare",
        "item_type": "Armor (chain shirt)",
        "description": (
            "You gain a +1 bonus to AC while you wear this armor. You are considered "
            "proficient with this armor even if you lack proficiency with medium armor."
        ),
        "attunement_required": False,
        "value_gp": 4000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+1"},
    },
    {
        "name": "Dragon Scale Mail",
        "rarity": "VeryRare",
        "item_type": "Armor (scale mail)",
        "description": (
            "Dragon scale mail is made of the scales of one kind of dragon. You gain +1 "
            "bonus to AC, advantage on saving throws against the Frightful Presence and "
            "breath weapons of dragons, and resistance to the damage type associated with "
            "the dragon's breath weapon."
        ),
        "attunement_required": True,
        "value_gp": 4000,
        "is_magic": True,
        "properties": {"source": "PHB", "bonus": "+1"},
    },
    {
        "name": "Plate Armor of Etherealness",
        "rarity": "Legendary",
        "item_type": "Armor (plate)",
        "description": (
            "While you're wearing this armor, you can speak its command word as an action "
            "to gain the effect of the etherealness spell, which lasts until you end it "
            "with another action. The armor can be used a total of 10 minutes each day."
        ),
        "attunement_required": True,
        "value_gp": 48000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    # ── Rings ──────────────────────────────────────────────────────────────────
    {
        "name": "Ring of Protection",
        "rarity": "Rare",
        "item_type": "Ring",
        "description": ("You gain a +1 bonus to AC and saving throws while wearing this ring."),
        "attunement_required": True,
        "value_gp": 3500,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Ring of Spell Storing",
        "rarity": "Rare",
        "item_type": "Ring",
        "description": (
            "This ring stores spells cast into it, holding them until the attuned wearer "
            "uses them. The ring can store up to 5 levels worth of spells at a time. "
            "Any creature can cast a spell of 1st through 5th level into the ring by "
            "touching the ring as the spell is cast."
        ),
        "attunement_required": True,
        "value_gp": 24000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Ring of Invisibility",
        "rarity": "Legendary",
        "item_type": "Ring",
        "description": (
            "While wearing this ring, you can turn invisible as an action. Anything you "
            "are wearing or carrying is invisible with you. You remain invisible until the "
            "ring is removed, until you attack or cast a spell, or until you use a bonus "
            "action to become visible again."
        ),
        "attunement_required": True,
        "value_gp": 50000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Ring of Regeneration",
        "rarity": "VeryRare",
        "item_type": "Ring",
        "description": (
            "While wearing this ring, you regain 1d6 hit points every 10 minutes, "
            "provided that you have at least 1 hit point. If you lose a body part, the "
            "ring causes the missing part to regrow and return to full functionality after "
            "1d6 + 1 days."
        ),
        "attunement_required": True,
        "value_gp": 20000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Ring of Resistance",
        "rarity": "Rare",
        "item_type": "Ring",
        "description": (
            "You have resistance to one damage type while wearing this ring. The gem in "
            "the ring indicates the type: black pearl (necrotic), blue sapphire "
            "(lightning), fire opal (fire), garnet (force), pearl (radiant), and so on."
        ),
        "attunement_required": True,
        "value_gp": 12000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Ring of Mind Shielding",
        "rarity": "Uncommon",
        "item_type": "Ring",
        "description": (
            "While wearing this ring, you are immune to magic that allows other creatures "
            "to read your thoughts, determine whether you are lying, know your alignment, "
            "or know your creature type. Creatures can telepathically communicate with "
            "you only if you allow it."
        ),
        "attunement_required": True,
        "value_gp": 16000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Ring of the Ram",
        "rarity": "Rare",
        "item_type": "Ring",
        "description": (
            "This ring has 3 charges, and it regains 1d3 expended charges daily at dawn. "
            "While wearing the ring, you can use an action to expend 1 to 3 charges to "
            "attack one creature you can see within 60 feet of you. The ring produces a "
            "spectral ram's head and makes its attack roll with a +7 bonus."
        ),
        "attunement_required": True,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB", "charges": 3},
    },
    {
        "name": "Ring of Free Action",
        "rarity": "Rare",
        "item_type": "Ring",
        "description": (
            "While you wear this ring, difficult terrain doesn't cost you extra movement. "
            "In addition, magic can neither reduce your speed nor cause you to be "
            "paralyzed or restrained."
        ),
        "attunement_required": True,
        "value_gp": 16000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    # ── Wondrous Items ─────────────────────────────────────────────────────────
    {
        "name": "Bag of Holding",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "This bag has an interior space considerably larger than its outside "
            "dimensions, roughly 2 feet in diameter at the mouth and 4 feet deep. "
            "The bag can hold up to 500 pounds, not exceeding a volume of 64 cubic feet."
        ),
        "attunement_required": False,
        "value_gp": 4000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Bag of Tricks",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "This ordinary bag, made from gray, rust, or tan cloth, appears empty. "
            "Reaching inside the bag, however, reveals the presence of a small, fuzzy "
            "object. You can use an action to pull the fuzzy object from the bag and "
            "throw it up to 20 feet. When the object lands, it transforms into a creature."
        ),
        "attunement_required": False,
        "value_gp": 300,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Boots of Elvenkind",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While you wear these boots, your steps make no sound, regardless of the "
            "surface you are moving across. You also have advantage on Dexterity "
            "(Stealth) checks that rely on moving silently."
        ),
        "attunement_required": False,
        "value_gp": 2500,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Boots of Speed",
        "rarity": "Rare",
        "item_type": "Wondrous Item",
        "description": (
            "While you wear these boots, you can use a bonus action and click the boots' "
            "heels together to double your walking speed. When you use this feature, your "
            "speed stays doubled until you toggle it off as a bonus action."
        ),
        "attunement_required": True,
        "value_gp": 4000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Boots of Striding and Springing",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While you wear these boots, your walking speed becomes 30 feet, unless your "
            "walking speed is higher, and your speed isn't reduced if you are encumbered "
            "or wearing heavy armor. In addition, you can jump three times the normal "
            "distance, though you can't jump farther than your remaining movement allows."
        ),
        "attunement_required": True,
        "value_gp": 1000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Broom of Flying",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "This wooden broom, which weighs 3 pounds, functions like a mundane broom "
            "until you stand astride it and speak its command word. It then hovers "
            "beneath you and can be ridden in the air. It has a flying speed of "
            "50 feet. It can carry up to 400 pounds, but its flying speed becomes "
            "30 feet while carrying over 200 pounds."
        ),
        "attunement_required": False,
        "value_gp": 8000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Cloak of Elvenkind",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While you wear this cloak with its hood up, Wisdom (Perception) checks made "
            "to see you have disadvantage, and you have advantage on Dexterity (Stealth) "
            "checks made to hide, as the cloak's color shifts to camouflage you."
        ),
        "attunement_required": True,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Cloak of Protection",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": ("You gain a +1 bonus to AC and saving throws while you wear this cloak."),
        "attunement_required": True,
        "value_gp": 3500,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Cloak of Displacement",
        "rarity": "Rare",
        "item_type": "Wondrous Item",
        "description": (
            "While you wear this cloak, it projects an illusion that makes you appear to "
            "be standing in a place near your actual location, causing any creature to "
            "have disadvantage on attack rolls against you. If you take damage, the "
            "property ceases to function until the start of your next turn."
        ),
        "attunement_required": True,
        "value_gp": 60000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Cloak of the Manta Ray",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While wearing this cloak with its hood up, you can breathe underwater, and "
            "you have a swimming speed of 60 feet."
        ),
        "attunement_required": False,
        "value_gp": 6000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Crystal Ball",
        "rarity": "VeryRare",
        "item_type": "Wondrous Item",
        "description": (
            "The typical crystal ball, a very rare item, is about 6 inches in diameter. "
            "While touching it, you can cast the scrying spell (save DC 17) with it."
        ),
        "attunement_required": True,
        "value_gp": 50000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Decanter of Endless Water",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "This stoppered flask sloshes when shaken, as if it contains water. The "
            "decanter weighs 2 pounds. You can use an action to remove the stopper and "
            "speak one of three command words, whereupon an amount of fresh water or salt "
            "water (your choice) pours out of the flask."
        ),
        "attunement_required": False,
        "value_gp": 135,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Dust of Disappearance",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "Found in a small packet, this powder resembles very fine sand. There is "
            "enough of it for one use. When you use an action to throw the dust into the "
            "air, you and each creature and object within 10 feet of you become invisible "
            "for 2d4 minutes."
        ),
        "attunement_required": False,
        "value_gp": 300,
        "is_magic": True,
        "properties": {"source": "PHB", "consumable": True},
    },
    {
        "name": "Figurine of Wondrous Power (Silver Raven)",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "A silver raven figurine can be used only once. You can use an action to "
            "speak the figurine's command word and throw it to a point on the ground "
            "within 60 feet of you. The figurine becomes a living raven and acts on your "
            "initiative count. Once it has been used, it can't be used again for 48 hours."
        ),
        "attunement_required": False,
        "value_gp": 100,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Gauntlets of Ogre Power",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "Your Strength score is 19 while you wear these gauntlets. They have no "
            "effect on you if your Strength is already 19 or higher without them."
        ),
        "attunement_required": True,
        "value_gp": 8000,
        "is_magic": True,
        "properties": {"source": "PHB", "ability_score": "STR 19"},
    },
    {
        "name": "Gloves of Missile Snaring",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "These gloves seem to almost meld into your hands when you don them. When a "
            "ranged weapon attack hits you while you're wearing them, you can use your "
            "reaction to reduce the damage by 1d10 + your Dexterity modifier, as long "
            "as you have a free hand."
        ),
        "attunement_required": True,
        "value_gp": 15000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Gloves of Swimming and Climbing",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While wearing these gloves, climbing and swimming don't cost you extra "
            "movement, and you gain a +5 bonus to Strength (Athletics) checks made to "
            "climb or swim."
        ),
        "attunement_required": True,
        "value_gp": 2000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Goggles of Night",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While wearing these dark lenses, you have darkvision out to a range of "
            "60 feet. If you already have darkvision, wearing the goggles increases its "
            "range by 60 feet."
        ),
        "attunement_required": False,
        "value_gp": 1500,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Handy Haversack",
        "rarity": "Rare",
        "item_type": "Wondrous Item",
        "description": (
            "This backpack has a central pouch and two side pouches, each of which is an "
            "extradimensional space. Each side pouch can hold up to 20 pounds of material, "
            "not exceeding a volume of 2 cubic feet. The large central pouch can hold up "
            "to 8 cubic feet or 80 pounds of material."
        ),
        "attunement_required": False,
        "value_gp": 2000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Hat of Disguise",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While wearing this hat, you can use an action to cast the disguise self "
            "spell from it at will. The spell ends if the hat is removed."
        ),
        "attunement_required": True,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Helm of Telepathy",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While wearing this helm, you can use an action to cast the detect thoughts "
            "spell (save DC 13) from it. As long as you maintain concentration on the "
            "spell, you can use a bonus action to send a telepathic message to a creature "
            "you are focused on."
        ),
        "attunement_required": True,
        "value_gp": 3000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Helm of Brilliance",
        "rarity": "VeryRare",
        "item_type": "Wondrous Item",
        "description": (
            "This dazzling helm is set with 1d10 diamonds, 2d10 rubies, 3d10 fire opals, "
            "and 4d10 opals. Any creature within 60 feet of you that looks at you while "
            "wearing the helm while it has at least one diamond must make a DC 15 "
            "Constitution saving throw or become blinded until magic removes the blindness."
        ),
        "attunement_required": True,
        "value_gp": 50000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Horseshoes of Speed",
        "rarity": "Rare",
        "item_type": "Wondrous Item",
        "description": (
            "These iron horseshoes come in a set of four. While all four shoes are "
            "affixed to the hooves of a horse or similar creature, they increase the "
            "creature's walking speed by 30 feet."
        ),
        "attunement_required": False,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Ioun Stone (Absorption)",
        "rarity": "VeryRare",
        "item_type": "Wondrous Item",
        "description": (
            "When you are targeted by a spell that targets only you, you can use your "
            "reaction to absorb the spell. The stone absorbs the spell slot of the spell "
            "and expunges it, replenishing your own spell slots."
        ),
        "attunement_required": True,
        "value_gp": 24000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Lantern of Revealing",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While lit, this hooded lantern burns for 6 hours on 1 pint of oil, shedding "
            "bright light in a 30-foot radius and dim light for an additional 30 feet. "
            "Invisible creatures and objects are visible as long as they are in the "
            "lantern's bright light."
        ),
        "attunement_required": False,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Medallion of Thoughts",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "The medallion has 3 charges. While wearing it, you can use an action and "
            "expend 1 charge to cast the detect thoughts spell (save DC 13). The medallion "
            "regains 1d3 expended charges daily at dawn."
        ),
        "attunement_required": True,
        "value_gp": 3000,
        "is_magic": True,
        "properties": {"source": "PHB", "charges": 3},
    },
    {
        "name": "Necklace of Adaptation",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While wearing this necklace, you can breathe normally in any environment, "
            "and you have advantage on saving throws made against harmful gases and "
            "vapors (such as cloudkill and stinking cloud effects, and inhaled poisons)."
        ),
        "attunement_required": True,
        "value_gp": 1500,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Necklace of Fireballs",
        "rarity": "Rare",
        "item_type": "Wondrous Item",
        "description": (
            "This necklace has 1d6+3 beads hanging from it. You can use an action to "
            "detach a bead and throw it up to 60 feet away. When it reaches the end of "
            "its trajectory, the bead detonates as a 3rd-level fireball spell (save DC 15)."
        ),
        "attunement_required": False,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Pearl of Power",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While this pearl is on your person, you can use an action to speak its "
            "command word and regain one expended spell slot of up to 3rd level. Once "
            "you have used the pearl, it can't be used again until the next dawn."
        ),
        "attunement_required": True,
        "value_gp": 6000,
        "is_magic": True,
        "properties": {"source": "PHB", "attunement_by": "spellcaster"},
    },
    {
        "name": "Periapt of Health",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "You are immune to contracting any disease while you wear this pendant. If "
            "you are already infected with a disease, the effects of the disease are "
            "suppressed while you wear the pendant."
        ),
        "attunement_required": False,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Periapt of Wound Closure",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While you wear this pendant, you stabilize whenever you are dying at the "
            "start of your turn. In addition, whenever you roll a Hit Die to regain hit "
            "points, double the number of hit points it restores."
        ),
        "attunement_required": True,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Pipes of the Sewers",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "You must be proficient with wind instruments to use these pipes. While you "
            "are attuned to the pipes, ordinary rats and giant rats are indifferent to "
            "you and won't attack you unless you threaten or harm them. You can use an "
            "action to play the pipes and use a bonus action to speak the command word "
            "to summon rats."
        ),
        "attunement_required": True,
        "value_gp": 2000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Portable Hole",
        "rarity": "Rare",
        "item_type": "Wondrous Item",
        "description": (
            "This fine black cloth, soft as silk, is folded up to the dimensions of a "
            "handkerchief. It unfolds into a circular sheet 6 feet in diameter. When "
            "placed on a solid surface, it creates an extradimensional hole 10 feet deep."
        ),
        "attunement_required": False,
        "value_gp": 8000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Robe of Eyes",
        "rarity": "Rare",
        "item_type": "Wondrous Item",
        "description": (
            "This robe is adorned with eyelike patterns. While you wear the robe, you "
            "gain darkvision out to a range of 120 feet, you have advantage on Wisdom "
            "(Perception) checks that rely on sight, and you can see invisible creatures "
            "and objects, as well as see into the Ethereal Plane."
        ),
        "attunement_required": True,
        "value_gp": 40000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Robe of the Archmagi",
        "rarity": "Legendary",
        "item_type": "Wondrous Item",
        "description": (
            "This elegant garment is made from exquisite cloth of white, gray, or black "
            "and adorned with silvery runes. While wearing the robe, your Armor Class "
            "is 15+Dexterity modifier, you have advantage on saving throws against spells "
            "and magical effects, and your spell save DC and spell attack bonus each "
            "increase by 2."
        ),
        "attunement_required": True,
        "value_gp": 40000,
        "is_magic": True,
        "properties": {"source": "PHB", "attunement_by": "sorcerer, warlock, or wizard"},
    },
    {
        "name": "Rope of Climbing",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "This 60-foot length of silk rope weighs 3 pounds and can hold up to "
            "3,000 pounds. If you hold one end of the rope and use an action to speak "
            "the command word, the rope animates. As a bonus action, you can command the "
            "other end to move toward a destination you choose."
        ),
        "attunement_required": False,
        "value_gp": 2000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Sending Stones",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "Sending stones come in pairs, with each smooth stone carved to match its "
            "counterpart. While you touch one stone, you can use an action to cast the "
            "sending spell from it. The target is the bearer of the other stone."
        ),
        "attunement_required": False,
        "value_gp": 1800,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Slippers of Spider Climbing",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While you wear these light shoes, you can move up, down, and across vertical "
            "surfaces and upside down along ceilings, while leaving your hands free. You "
            "have a climbing speed equal to your walking speed. However, the slippers "
            "don't allow you to move this way on a slippery surface."
        ),
        "attunement_required": True,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Stone of Good Luck (Luckstone)",
        "rarity": "Uncommon",
        "item_type": "Wondrous Item",
        "description": (
            "While this polished agate is on your person, you gain a +1 bonus to ability "
            "checks and saving throws."
        ),
        "attunement_required": True,
        "value_gp": 4200,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    # ── Rods ───────────────────────────────────────────────────────────────────
    {
        "name": "Rod of Lordly Might",
        "rarity": "Legendary",
        "item_type": "Rod",
        "description": (
            "This rod has a flanged head and the following six buttons. Using the rod or "
            "its buttons requires you to use an action. Button 1: causes a +3 longsword "
            "to spring from the end. Button 2: causes a +3 short sword to emerge. "
            "Button 3: causes a +3 spear to emerge. Button 4: causes flames to erupt. "
            "Button 5: causes the rod to drain life force. Button 6: transforms the rod "
            "into a ladder."
        ),
        "attunement_required": True,
        "value_gp": 75000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Rod of the Pact Keeper",
        "rarity": "Uncommon",
        "item_type": "Rod",
        "description": (
            "While holding this rod, you gain a +1 bonus to spell attack rolls and to "
            "the saving throw DCs of your warlock spells. In addition, you can regain one "
            "warlock spell slot as an action while holding the rod. Once used, this "
            "property can't be used again until the next dawn."
        ),
        "attunement_required": True,
        "value_gp": 3000,
        "is_magic": True,
        "properties": {"source": "PHB", "attunement_by": "warlock", "bonus": "+1"},
    },
    {
        "name": "Immovable Rod",
        "rarity": "Uncommon",
        "item_type": "Rod",
        "description": (
            "This flat iron rod has a button on one end. You can use an action to press "
            "the button, which causes the rod to become magically fixed in place. Until "
            "you or another creature uses an action to push the button again, the rod "
            "doesn't move, even if it is defying gravity."
        ),
        "attunement_required": False,
        "value_gp": 5000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    # ── Staffs ─────────────────────────────────────────────────────────────────
    {
        "name": "Staff of Fire",
        "rarity": "VeryRare",
        "item_type": "Staff",
        "description": (
            "You have resistance to fire damage while you hold this staff. The staff has "
            "10 charges. While holding it, you can use an action to expend 1 or more of "
            "its charges to cast one of the following spells from it: burning hands "
            "(1 charge), fireball (3 charges), or wall of fire (4 charges)."
        ),
        "attunement_required": True,
        "value_gp": 17000,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 10,
            "attunement_by": "druid, sorcerer, warlock, or wizard",
        },
    },
    {
        "name": "Staff of Frost",
        "rarity": "VeryRare",
        "item_type": "Staff",
        "description": (
            "You have resistance to cold damage while you hold this staff. It has 10 "
            "charges and regains 1d6+4 charges daily at dawn. You can use an action to "
            "expend charges to cast cone of cold (5 charges), fog cloud (1 charge), ice "
            "storm (4 charges), or wall of ice (4 charges)."
        ),
        "attunement_required": True,
        "value_gp": 17000,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 10,
            "attunement_by": "druid, sorcerer, warlock, or wizard",
        },
    },
    {
        "name": "Staff of Healing",
        "rarity": "Rare",
        "item_type": "Staff",
        "description": (
            "This staff has 10 charges. While holding it, you can use an action to "
            "expend 1 or more of its charges to cast one of the following spells from it, "
            "using your spell save DC and spellcasting ability modifier: cure wounds "
            "(1 charge per spell level, up to 4th), lesser restoration (2 charges), or "
            "mass cure wounds (5 charges)."
        ),
        "attunement_required": True,
        "value_gp": 16000,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 10,
            "attunement_by": "bard, cleric, or druid",
        },
    },
    {
        "name": "Staff of Power",
        "rarity": "VeryRare",
        "item_type": "Staff",
        "description": (
            "This staff can be wielded as a magic quarterstaff that grants a +2 bonus to "
            "attack and damage rolls. While holding it, you gain a +2 bonus to Armor "
            "Class, saving throws, and spell attack rolls. The staff has 20 charges for "
            "the following properties."
        ),
        "attunement_required": True,
        "value_gp": 95000,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 20,
            "bonus": "+2",
            "attunement_by": "sorcerer, warlock, or wizard",
        },
    },
    {
        "name": "Staff of the Magi",
        "rarity": "Legendary",
        "item_type": "Staff",
        "description": (
            "This staff can be wielded as a magic quarterstaff that grants a +2 bonus "
            "to attack and damage rolls. While you hold it, you gain a +2 bonus to spell "
            "attack rolls. The staff has 50 charges for the following properties, and "
            "regains 4d6+2 expended charges daily at dawn."
        ),
        "attunement_required": True,
        "value_gp": 168000,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 50,
            "bonus": "+2",
            "attunement_by": "sorcerer, warlock, or wizard",
        },
    },
    {
        "name": "Staff of Striking",
        "rarity": "VeryRare",
        "item_type": "Staff",
        "description": (
            "This staff can be wielded as a magic quarterstaff that grants a +3 bonus to "
            "attack and damage rolls made with it. The staff has 10 charges. When you hit "
            "with a melee attack using it, you can expend up to 3 of its charges. For "
            "each charge expended, the target takes an extra 1d6 force damage."
        ),
        "attunement_required": True,
        "value_gp": 71960,
        "is_magic": True,
        "properties": {"source": "PHB", "charges": 10, "bonus": "+3"},
    },
    {
        "name": "Staff of Withering",
        "rarity": "Rare",
        "item_type": "Staff",
        "description": (
            "This staff has 3 charges and regains 1d3 expended charges daily at dawn. "
            "The staff can be wielded as a magic quarterstaff. On a hit, it deals damage "
            "as a normal quarterstaff, and you can expend 1 charge to deal an extra 2d10 "
            "necrotic damage to the target."
        ),
        "attunement_required": True,
        "value_gp": 9000,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 3,
            "attunement_by": "cleric, druid, or warlock",
        },
    },
    # ── Wands ──────────────────────────────────────────────────────────────────
    {
        "name": "Wand of Fireballs",
        "rarity": "Rare",
        "item_type": "Wand",
        "description": (
            "This wand has 7 charges. While holding it, you can use an action to expend "
            "1 or more of its charges to cast the fireball spell (save DC 15) from it. "
            "For 1 charge, you cast the 3rd-level version. You can increase the spell "
            "slot level by one for each additional charge you expend."
        ),
        "attunement_required": True,
        "value_gp": 11500,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 7,
            "attunement_by": "sorcerer, warlock, or wizard",
        },
    },
    {
        "name": "Wand of Lightning Bolts",
        "rarity": "Rare",
        "item_type": "Wand",
        "description": (
            "This wand has 7 charges. While holding it, you can use an action to expend "
            "1 or more charges to cast the lightning bolt spell (save DC 15) from it. "
            "For 1 charge, you cast the 3rd-level version."
        ),
        "attunement_required": True,
        "value_gp": 11500,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 7,
            "attunement_by": "sorcerer, warlock, or wizard",
        },
    },
    {
        "name": "Wand of Magic Detection",
        "rarity": "Uncommon",
        "item_type": "Wand",
        "description": (
            "This wand has 3 charges. While holding it, you can expend 1 charge as an "
            "action to cast the detect magic spell from it. The wand regains 1d3 expended "
            "charges daily at dawn."
        ),
        "attunement_required": False,
        "value_gp": 1500,
        "is_magic": True,
        "properties": {"source": "PHB", "charges": 3},
    },
    {
        "name": "Wand of Magic Missiles",
        "rarity": "Uncommon",
        "item_type": "Wand",
        "description": (
            "This wand has 7 charges. While holding it, you can use an action to expend "
            "1 or more of its charges to cast the magic missile spell from it. For 1 "
            "charge, you cast the 1st-level version of the spell."
        ),
        "attunement_required": False,
        "value_gp": 2500,
        "is_magic": True,
        "properties": {"source": "PHB", "charges": 7},
    },
    {
        "name": "Wand of Paralysis",
        "rarity": "Rare",
        "item_type": "Wand",
        "description": (
            "This wand has 7 charges. While holding it, you can use an action to expend "
            "1 of its charges to cause a thin blue ray to streak from the tip toward a "
            "creature you can see within 60 feet of you. The target must succeed on a "
            "DC 15 Constitution saving throw or be paralyzed for 1 minute."
        ),
        "attunement_required": True,
        "value_gp": 5500,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 7,
            "attunement_by": "sorcerer, warlock, or wizard",
        },
    },
    {
        "name": "Wand of Polymorph",
        "rarity": "VeryRare",
        "item_type": "Wand",
        "description": (
            "This wand has 7 charges. While holding it, you can use an action to expend "
            "1 of its charges to cast the polymorph spell (save DC 15) from it. The wand "
            "regains 1d6+1 expended charges daily at dawn."
        ),
        "attunement_required": True,
        "value_gp": 10000,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 7,
            "attunement_by": "sorcerer, warlock, or wizard",
        },
    },
    {
        "name": "Wand of Web",
        "rarity": "Uncommon",
        "item_type": "Wand",
        "description": (
            "This wand has 7 charges. While holding it, you can use an action to expend "
            "1 of its charges to cast the web spell (save DC 15) from it. The wand "
            "regains 1d6+1 expended charges daily at dawn."
        ),
        "attunement_required": True,
        "value_gp": 2500,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 7,
            "attunement_by": "sorcerer, warlock, or wizard",
        },
    },
    # ── Legendary / Artifacts ──────────────────────────────────────────────────
    {
        "name": "Deck of Many Things",
        "rarity": "Legendary",
        "item_type": "Wondrous Item",
        "description": (
            "Usually found in a box or pouch, this deck contains 22 cards made of ivory "
            "or vellum. Before you draw a card, you must declare how many cards you "
            "intend to draw and then draw them randomly. Any magic the card carries goes "
            "into effect immediately upon drawing. The cards bear symbols of cosmic forces."
        ),
        "attunement_required": False,
        "value_gp": 100000,
        "is_magic": True,
        "properties": {"source": "PHB"},
    },
    {
        "name": "Eye of Vecna",
        "rarity": "Artifact",
        "item_type": "Wondrous Item",
        "description": (
            "This unique artifact was once part of the legendary archlich Vecna. To "
            "attune to it, you must gouge out your own eye and press the artifact into "
            "the empty socket. The eye replaces the missing one and remains. You gain "
            "darkvision, truesight out to 120 feet, and the ability to use the eye as "
            "a scrying sensor."
        ),
        "attunement_required": True,
        "value_gp": 250000,
        "is_magic": True,
        "properties": {"source": "PHB", "cursed": True},
    },
    {
        "name": "Hand of Vecna",
        "rarity": "Artifact",
        "item_type": "Wondrous Item",
        "description": (
            "This unique artifact requires you to cut off your own hand at the wrist "
            "and press the artifact against the stump. The hand becomes a functioning "
            "replacement. You gain a +2 bonus to AC, immunity to cold damage, and "
            "various other sinister powers."
        ),
        "attunement_required": True,
        "value_gp": 250000,
        "is_magic": True,
        "properties": {"source": "PHB", "cursed": True},
    },
    {
        "name": "Staff of the Woodlands",
        "rarity": "Rare",
        "item_type": "Staff",
        "description": (
            "This staff can be wielded as a magic quarterstaff that grants a +2 bonus "
            "to attack and damage rolls. While holding it, you have a +2 bonus to spell "
            "attack rolls. The staff has 10 charges for the following spells."
        ),
        "attunement_required": True,
        "value_gp": 45000,
        "is_magic": True,
        "properties": {
            "source": "PHB",
            "charges": 10,
            "bonus": "+2",
            "attunement_by": "druid",
        },
    },
]
