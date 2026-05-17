// DM Screen content (Plan 00027).
//
// Static data — sourced from 2024 PHB / SRD 5.2.1 (CC-BY-4.0). Each
// entry is a single rules nugget the DM might need at the table.
// Categorized into tabs and tagged with keywords so the search box can
// match common phrasings ("OA" → opportunity attack, "DC" → DC table).

export interface RulesEntry {
  /** Display title — bold heading on the card. */
  title: string;
  /** Markdown-free body. Newlines render as paragraph breaks. */
  body: string;
  /** Extra search terms beyond the title. */
  keywords?: string[];
}

export interface RulesTab {
  /** Tab label shown in the modal nav. */
  label: string;
  /** Short id (used as a key). */
  id: string;
  /** Entries shown under this tab. */
  entries: RulesEntry[];
}

export const DM_SCREEN_TABS: RulesTab[] = [
  {
    id: "action-economy",
    label: "Action Economy",
    entries: [
      {
        title: "Your Turn",
        body: "On your turn you can: move up to your speed, take ONE Action, and use any Free Object Interaction. You may also use ONE Bonus Action if you have a source for it (a class feature, spell, or item).",
        keywords: ["turn", "actions", "movement", "bonus"],
      },
      {
        title: "Action Options",
        body: "Attack · Cast a Spell · Dash · Disengage · Dodge · Help · Hide · Ready · Search · Use an Object · plus any class- or feat-granted action.",
        keywords: ["action list"],
      },
      {
        title: "Bonus Action",
        body: "You only have a bonus action if a feature, spell, or item explicitly grants one this turn. Common sources: Rogue's Cunning Action; Fighter's Second Wind; Healing Word; off-hand attack with Two-Weapon Fighting.",
        keywords: ["bonus", "ba"],
      },
      {
        title: "Reactions",
        body: "One per round. Used on someone else's turn in response to a trigger. Most common: Opportunity Attack. Resets at the start of your next turn.",
        keywords: ["reaction"],
      },
      {
        title: "Free Object Interaction",
        body: "One per turn at no action cost: draw or sheathe a weapon, open a door, pick up an item, push a button, kick something. Anything more elaborate uses the Use an Object action.",
        keywords: ["free", "interact"],
      },
      {
        title: "Communication",
        body: "Brief in-character speech (a sentence or two) is free on your turn. Long monologues — DM discretion, especially mid-combat.",
        keywords: ["talk", "speak"],
      },
    ],
  },
  {
    id: "actions",
    label: "Combat Actions",
    entries: [
      {
        title: "Attack",
        body: "Make one melee or ranged attack (or more if Extra Attack). Roll d20 + attack bonus vs target's AC. On hit, roll the weapon's damage dice and add your ability modifier (STR for melee, DEX for finesse/ranged). Nat 20 = critical: roll damage dice twice, modifier once.",
        keywords: ["attack", "to hit"],
      },
      {
        title: "Cast a Spell",
        body: "Cast a spell whose casting time is 1 action. If a spell's casting time is 1 bonus action, it's a bonus action instead. You can only cast ONE leveled spell per turn — either the action or the bonus, not both. (You can still pair a leveled spell with a cantrip.)",
        keywords: ["cast", "spell"],
      },
      {
        title: "Dash",
        body: "Gain extra movement equal to your speed for this turn. Effects that change your speed change your Dash too.",
        keywords: ["dash", "run"],
      },
      {
        title: "Disengage",
        body: "Your movement this turn doesn't provoke opportunity attacks. Doesn't affect anything else.",
        keywords: ["disengage", "retreat", "oa"],
      },
      {
        title: "Dodge",
        body: "Until the start of your next turn, attack rolls against you have Disadvantage and you make DEX saves with Advantage. Lost if you become Incapacitated or your speed drops to 0.",
        keywords: ["dodge", "defend"],
      },
      {
        title: "Help",
        body: "Grant a nearby ally Advantage on their next ability check OR their next attack roll against a creature within 5 ft of you, before the start of your next turn. You can also use Help to substitute for an ally on a check you're both reasonably qualified for.",
        keywords: ["help", "assist", "aid"],
      },
      {
        title: "Hide",
        body: "Make a DEX (Stealth) check. You need cover, heavy obscurement, or to be Invisible. Hidden until you attack, make noise, or step into clear view. Your check value is your passive Stealth — opposed by enemies' passive Perception (or active Search).",
        keywords: ["hide", "stealth", "sneak"],
      },
      {
        title: "Ready",
        body: 'Set a trigger and a reaction: "If X happens, I do Y." When the trigger fires before your next turn, you spend your Reaction to act. If you ready a spell, you spend the slot upfront and must hold Concentration until your reaction fires.',
        keywords: ["ready", "trigger"],
      },
      {
        title: "Search",
        body: "Make a WIS (Perception) check to spot something specific, or an INT (Investigation) check to deduce something from clues. DM tells you the DC privately.",
        keywords: ["search", "perception", "investigation"],
      },
      {
        title: "Use an Object",
        body: "Interact with something beyond a free object interaction: drink a potion, light a torch with flint, activate a wand or magic item, pull a stuck lever, etc.",
        keywords: ["use", "object", "potion"],
      },
    ],
  },
  {
    id: "reactions",
    label: "Reactions",
    entries: [
      {
        title: "Opportunity Attack",
        body: "Trigger: a hostile creature moves OUT of your melee reach using its move (NOT teleport, NOT being moved unwillingly). Effect: use your Reaction to make ONE melee attack with Advantage? — no, just a regular melee attack — against that creature, resolved immediately before the move continues.",
        keywords: ["opportunity", "oa", "aoo"],
      },
      {
        title: "Common Spell Reactions",
        body: "Shield (reaction, when hit, +5 AC vs that attack + all attacks until your next turn) · Counterspell (reaction, opposed roll vs another caster) · Absorb Elements (reaction, half damage from elemental attack, melee next turn deals extra of that type) · Hellish Rebuke (reaction, when damaged by a creature you can see, force a DEX save).",
        keywords: ["shield", "counterspell", "rebuke"],
      },
      {
        title: "Common Feature Reactions",
        body: "Paladin Divine Smite is NOT a reaction in 2024 (bonus action when you hit) · Sentinel feat lets you OA on a creature that attacks an ally · War Caster lets you cast a 1-action spell as your OA · Cavalier knight Unwavering Mark blocks targets.",
        keywords: ["sentinel", "war caster"],
      },
    ],
  },
  {
    id: "conditions",
    label: "Conditions",
    entries: [
      {
        title: "Blinded",
        body: "Can't see → automatically fails any check requiring sight. Attacks vs you have Advantage; your attacks have Disadvantage.",
        keywords: ["blind"],
      },
      {
        title: "Charmed",
        body: "Can't attack the charmer or target them with harmful abilities/spells. Charmer has Advantage on social checks vs you.",
        keywords: ["charm"],
      },
      {
        title: "Deafened",
        body: "Can't hear → automatically fails any check requiring hearing. Doesn't impose attack disadv/adv directly.",
        keywords: ["deaf"],
      },
      {
        title: "Frightened",
        body: "Disadvantage on ability checks and attack rolls while the source of fear is within line of sight. Can't willingly move closer to the source.",
        keywords: ["fear", "scared"],
      },
      {
        title: "Grappled",
        body: "Speed becomes 0; can't benefit from any bonus to speed. Ends if grappler is Incapacitated, or if you're moved out of grappler's reach by something other than the grappler.",
        keywords: ["grapple", "grab"],
      },
      {
        title: "Incapacitated",
        body: "Can't take Actions, Bonus Actions, or Reactions. Often a sub-effect of other conditions (Paralyzed, Stunned, Unconscious).",
        keywords: ["incap"],
      },
      {
        title: "Invisible",
        body: "Heavily obscured for the purposes of being seen — counts as hidden. Attacks vs you have Disadvantage; your attacks have Advantage. Doesn't make you silent — sound and tracks still reveal you.",
        keywords: ["invis"],
      },
      {
        title: "Paralyzed",
        body: "Incapacitated · can't move or speak · auto-fails STR and DEX saves · attacks vs you have Advantage · any hit within 5 ft is a critical hit.",
        keywords: ["paralyze"],
      },
      {
        title: "Petrified",
        body: "Transformed to stone. Incapacitated, can't move or speak, unaware. Auto-fails STR/DEX saves. Resistance to all damage. Immune to poison and disease (existing diseases/poisons paused).",
        keywords: ["petrified", "stone"],
      },
      {
        title: "Poisoned",
        body: "Disadvantage on attack rolls and ability checks.",
        keywords: ["poison"],
      },
      {
        title: "Prone",
        body: "Your only movement is crawling unless you stand. Standing costs half your speed. Melee attacks vs you have Advantage; ranged attacks vs you have Disadvantage. Your own attacks have Disadvantage.",
        keywords: ["prone", "knocked down"],
      },
      {
        title: "Restrained",
        body: "Speed 0. Attacks vs you have Advantage; your attacks have Disadvantage. DEX saves at Disadvantage.",
        keywords: ["restrain", "trap"],
      },
      {
        title: "Stunned",
        body: "Incapacitated, can't move, speaks falteringly. Auto-fails STR and DEX saves. Attacks vs you have Advantage.",
        keywords: ["stun"],
      },
      {
        title: "Unconscious",
        body: "Incapacitated · can't move or speak, unaware · drops what they're holding · falls Prone · auto-fails STR/DEX saves · attacks vs you have Advantage · hits within 5 ft are critical hits.",
        keywords: ["unconscious", "ko"],
      },
      {
        title: "Exhaustion (2024)",
        body: "0–6 scale. Each level applies a cumulative −2 to ALL D20 Tests (attacks, ability checks, saving throws). Level 6 = death. Long rest reduces by 1. NOTE: this differs from 2014 rules (which had distinct per-level effects).",
        keywords: ["exhaust", "tired"],
      },
    ],
  },
  {
    id: "damage",
    label: "Damage & Healing",
    entries: [
      {
        title: "Damage Types",
        body: "Physical: bludgeoning, piercing, slashing. Elemental: acid, cold, fire, lightning, thunder. Other: necrotic, radiant, poison, psychic, force.",
        keywords: ["damage", "types"],
      },
      {
        title: "Resistance / Vulnerability / Immunity",
        body: "Resistance: take HALF damage (round down) of that type. Vulnerability: take DOUBLE damage. Immunity: take 0. Apply ONCE per damage instance — multiple resistances of the same type don't compound.",
        keywords: ["resist", "vulnerable", "immune"],
      },
      {
        title: "Temp HP",
        body: "Separate pool. Damage hits temp HP first, then real HP. Doesn't stack — a new source REPLACES the old. Lost on long rest. Healing doesn't restore temp HP.",
        keywords: ["temp", "thp"],
      },
      {
        title: "Healing",
        body: "Restores HP up to hp_max (never above). Healing a PC at 0 HP brings them to that many HP and clears death-save tracks. Healing an unconscious PC ends Unconscious automatically.",
        keywords: ["heal"],
      },
      {
        title: "Death Saves",
        body: "Roll d20 at start of each turn at 0 HP (no modifier). 10+ success, <10 failure, nat 1 = 2 failures, nat 20 = revive at 1 HP. 3 successes = stable. 3 failures = dead. Taking damage while at 0 HP = 1 failure (2 on crit).",
        keywords: ["death", "saving throw"],
      },
      {
        title: "Massive Damage",
        body: "If damage to a PC from a single hit reduces them to 0 HP AND the leftover equals or exceeds their HP maximum, they're instantly killed outright. (Common: high-level fireball on a level-1 PC.)",
        keywords: ["massive", "instant death"],
      },
    ],
  },
  {
    id: "movement",
    label: "Movement",
    entries: [
      {
        title: "Speed",
        body: "Each turn you can move up to your speed (typically 30 ft). You can split it: move some, take your action, move the rest. Difficult terrain costs 1 extra foot per foot moved.",
        keywords: ["move", "speed"],
      },
      {
        title: "Difficult Terrain",
        body: "Costs +1 ft per ft moved. Examples: rubble, low furniture, dense undergrowth, shallow water, stairs, climbing without a feature.",
        keywords: ["terrain", "rough"],
      },
      {
        title: "Climbing & Swimming",
        body: "Climbing or swimming costs +1 ft per ft (treat as difficult terrain) UNLESS you have a climb speed or swim speed.",
        keywords: ["climb", "swim"],
      },
      {
        title: "Jumping",
        body: "Long jump = your STR score (max). Need 10 ft running start; halved without. High jump = 3 + STR mod (max). +half STR mod for running start.",
        keywords: ["jump", "leap"],
      },
      {
        title: "Falling",
        body: "1d6 bludgeoning per 10 ft fallen, capped at 20d6 (200 ft terminal). PC lands Prone unless they took 0 damage. (DEX save or feature may halve.)",
        keywords: ["fall", "drop"],
      },
      {
        title: "Standing Up from Prone",
        body: "Costs HALF your speed. So a PC with 30 ft speed spends 15 ft to stand, then can move 15 ft normally.",
        keywords: ["stand", "prone"],
      },
      {
        title: "Moving Through Other Creatures",
        body: "You can move through an ally's space freely. You can move through a hostile space only if they're at least two size categories larger or smaller, or are Prone. Ending your turn in another creature's space is not allowed.",
        keywords: ["through", "squeeze"],
      },
    ],
  },
  {
    id: "cover",
    label: "Cover & Visibility",
    entries: [
      {
        title: "Half Cover",
        body: "+2 to AC and DEX saves. Examples: half-wall, large furniture, sturdy tree, other creature in the line.",
        keywords: ["cover", "half"],
      },
      {
        title: "Three-Quarters Cover",
        body: "+5 to AC and DEX saves. Examples: arrow slit, pillar, tree trunk filling most of the line.",
        keywords: ["cover", "3/4"],
      },
      {
        title: "Total Cover",
        body: "Can't be targeted by attacks or spells that require sight/line of effect. Spells with area still affect if you're within the area despite being behind cover (depending on the spell wording).",
        keywords: ["cover", "total", "full"],
      },
      {
        title: "Lightly Obscured",
        body: "Dim light, patchy fog, moderate foliage. Creatures have Disadvantage on WIS (Perception) checks that rely on sight to perceive things in or through that area.",
        keywords: ["dim", "obscure"],
      },
      {
        title: "Heavily Obscured",
        body: "Darkness, opaque fog, dense foliage. Creatures effectively suffer from the Blinded condition when trying to see something in that area.",
        keywords: ["dark", "blind"],
      },
      {
        title: "Vision Types",
        body: "Darkvision: see in dim light as if bright; see in darkness as if dim (in shades of gray) out to the given range. Blindsight: perceive without sight out to range. Truesight: see invisible, through illusions, into Ethereal Plane.",
        keywords: ["dark", "blind", "true"],
      },
    ],
  },
  {
    id: "checks",
    label: "Skill Checks & DCs",
    entries: [
      {
        title: "DC Table",
        body: "5 — Trivial (a sober person could do it). 10 — Easy (a child could do it). 15 — Medium (most adventurers succeed). 20 — Hard (clearly impressive). 25 — Very Hard (heroic). 30 — Nearly Impossible (legendary).",
        keywords: ["dc", "difficulty"],
      },
      {
        title: "Passive Scores",
        body: "Passive check = 10 + the relevant skill modifier (+5 with Advantage, −5 with Disadvantage). Used when you don't want to roll: passive Perception for spotting hidden things, passive Investigation for noticing details, passive Insight for reading people.",
        keywords: ["passive", "perception"],
      },
      {
        title: "When to call for a roll",
        body: "Only when there's meaningful uncertainty AND failure has interesting consequences. If the outcome is obvious either way, don't call for a roll. If the player just narrates something cool that's plausible, let them have it.",
        keywords: ["roll", "dm guidance"],
      },
      {
        title: "Group Checks",
        body: "Half the group must succeed for the group to succeed. Good for everyone navigating dangerous terrain, hiding from a patrol, etc. Don't use for individual contests.",
        keywords: ["group"],
      },
      {
        title: "Contested Checks",
        body: "Both sides roll, higher wins. Ties usually go to defender / status quo. Common: Stealth vs Perception, shove (STR vs STR/DEX), grapple, persuasion vs Insight, etc.",
        keywords: ["contest", "opposed"],
      },
    ],
  },
  {
    id: "combat-tricks",
    label: "Combat Tricks",
    entries: [
      {
        title: "Shove",
        body: "Replace one of your melee attacks. Contested STR (Athletics) vs target's STR (Athletics) or DEX (Acrobatics) — target's choice. On success, push target 5 ft OR knock them Prone. Target must be within 5 ft and no more than one size larger.",
        keywords: ["shove", "push"],
      },
      {
        title: "Grapple",
        body: "Replace one of your melee attacks. Contested STR (Athletics) vs target's STR (Athletics) or DEX (Acrobatics). On success, target is Grappled. Escape: target uses their action to repeat the contested check.",
        keywords: ["grapple", "grab"],
      },
      {
        title: "Two-Weapon Fighting",
        body: "When you take the Attack action with a light melee weapon, you can use your bonus action to attack with a different light melee weapon in your other hand. You DON'T add your ability modifier to the damage (unless it's negative) — that's the cost. You can draw both weapons as part of the action.",
        keywords: ["twf", "dual"],
      },
      {
        title: "Mounted Combat",
        body: "Mount has its own initiative but acts on yours (controlled mount) or its own (independent). While Mounted: ranged attacks vs you have Disadvantage if you choose to redirect them to the mount? — no, simpler — attackers choose target. If mount is knocked Prone you can land on your feet with a DEX save.",
        keywords: ["mount", "horse"],
      },
      {
        title: "Sneak Attack (Rogue)",
        body: "Once per turn. Trigger: hit with a finesse or ranged weapon AND either (a) you have Advantage on the attack, or (b) an ally is within 5 ft of the target and not Incapacitated and you don't have Disadvantage. Damage scales with rogue level.",
        keywords: ["sneak", "rogue", "backstab"],
      },
      {
        title: "Flanking",
        body: "NOT a standard rule in 2024. If you want it, the optional DMG rule is: a creature with an ally on opposite sides of an enemy has Advantage on melee attacks against that enemy. Recommend skipping for new tables — it makes melee classes dramatically stronger and isn't RAW.",
        keywords: ["flank"],
      },
      {
        title: "Multiattack Timing",
        body: "Monsters with Multiattack make all their attacks on a single turn — they can split them between targets unless the statblock says otherwise. A monster CANNOT move between its multiattack swings unless its stat block grants that, but it CAN move before or after.",
        keywords: ["multiattack"],
      },
    ],
  },
  {
    id: "resting",
    label: "Resting",
    entries: [
      {
        title: "Short Rest (1 hour)",
        body: "Players can spend Hit Dice: each HD spent rolls the die + CON mod, healing that much. Class features tagged 'recovery=short' refresh. Warlock pact slots refresh.",
        keywords: ["short rest"],
      },
      {
        title: "Long Rest (8 hours)",
        body: "Once per 24 hours. At least 6 hours sleep + 2 hours light activity. HP back to max. Spell slots back. All class features refresh. Half max Hit Dice (min 1) back. Exhaustion reduces by 1.",
        keywords: ["long rest", "sleep"],
      },
      {
        title: "Interrupted Rest",
        body: "Long rest interrupted by 1+ hour of strenuous activity (combat, walking, spellcasting, taking damage) → must restart the rest to get any benefit.",
        keywords: ["interrupt"],
      },
    ],
  },
  {
    id: "hazards",
    label: "Hazards",
    entries: [
      {
        title: "Suffocation",
        body: "A creature can hold its breath for 1 + CON mod minutes (min 30 seconds). Once out, drops to 0 HP at the start of its next turn. Underwater + drowning works the same.",
        keywords: ["breath", "drown", "suffocate"],
      },
      {
        title: "Drowning",
        body: "Same as suffocation. Held breath = 1 + CON mod minutes (min 30s). After, fall to 0 HP. Note: a Stable creature underwater is still drowning unless rescued.",
        keywords: ["drown", "water"],
      },
      {
        title: "Extreme Cold / Heat",
        body: "Extreme cold (below 0°F): CON save DC 10 every hour or gain a level of Exhaustion. Cold resistance grants automatic success. Same for extreme heat (above 100°F).",
        keywords: ["cold", "heat", "weather"],
      },
      {
        title: "Starvation",
        body: "A character can go for days without food equal to 3 + CON mod (min 1). Past that, gain a level of Exhaustion per day. Can't be removed until you eat.",
        keywords: ["hunger", "food"],
      },
      {
        title: "Thirst",
        body: "Need 1 gallon water/day (2 in hot weather). Half gallon counts but ends day with Exhaustion. Zero water = Exhaustion that day AND another the next morning, until you drink.",
        keywords: ["water"],
      },
      {
        title: "Forced March",
        body: "Travel more than 8 hours: CON save DC 10 + 1 per extra hour at end of each additional hour. Fail = gain a level of Exhaustion. Mounted creatures use the mount's CON.",
        keywords: ["march", "travel"],
      },
    ],
  },
];
