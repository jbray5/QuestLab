# Plan 00087 — Practice Arena: the rules, class by class, through level 5

## Status
[ ] Not started  [x] In progress  [ ] Blocked  [ ] Complete

**Started:** 2026-09-05 · **Implemented by:** Claude Code

## Purpose
Justin, running Creed in the arena: "He is just doing divine smites and it's
not factoring in that it's a bonus action after a successful sword strike. We
need a DEEP THOROUGH review of all classes and features through like level 5
at least." And on Thane (a Soulknife): "basically nothing, just an unarmed
strike — no psionic blades for melee or throw, no sneak attack."

The arena's first engine knew attacks and a handful of features. This one
knows the turn.

## The engine (services/arena_service.py, v2)
- **Action economy**: action, bonus action, reaction (automatic), free.
  Riders that need a melee hit this turn (Divine Smite, Searing Smite,
  Stunning Strike). Extra Attack's swings inside one action. A refused action
  leaves the sealed state untouched (the engine works on a copy).
- **Advantage / disadvantage** with cancellation; sources: Steady Aim,
  Reckless Attack, Guiding Bolt, Innate Sorcery (spell attacks), and the
  foe's conditions (asleep, stunned, restrained, prone vs melee); Dodge,
  Vicious Mockery and Restrained put the foe at disadvantage.
- **Conditions on the foe**: asleep (skips its turn; melee hits are critical;
  damage wakes it), stunned (loses its next turn), restrained (a round),
  prone (stands at its turn). **Concentration**: one effect at a time; a hit
  forces the CON check (DC 10 or half the damage).
- **Per class, level 1–5** (from the sheet's rows, spells and feats):
  - Fighter — Second Wind (2/3/4), Action Surge, Extra Attack; fighting styles
    from feats: Dueling +2, Defense +1 AC, Archery +2 ranged, Great Weapon
    Fighting (1s and 2s become 3s).
  - Barbarian — Rage (scales; +2 melee; halves weapon damage only), Reckless
    Attack (advantage both ways), Extra Attack.
  - Monk — Martial Arts die (d6, d8 at 5) with DEX; bonus-action strike at 1;
    Focus Points at 2: Flurry of Blows, Patient Defense; Deflect Attacks at 3
    (reaction, weapon damage); Stunning Strike at 5 (CON save or stunned).
  - Rogue — Sneak Attack ((level+1)/2 d6, finesse or ranged, needs advantage,
    once a turn), Cunning Action: Dodge, Steady Aim at 3, Uncanny Dodge at 5
    (reaction halves); **Soulknife**: Psychic Blades (1d6 finesse, thrown)
    with a bonus-action second blade (1d4), Sneak Attack applies.
  - Paladin — Lay on Hands (bonus), **Divine Smite as a bonus action after a
    melee hit with a slot picker** (2d8 +1d8 per level, +1d8 vs undead and
    fiends), Searing Smite, spells from level 1 (Bless, Cure Wounds, Shield of
    Faith), Channel Divinity at 3 (Oath of the Ancients: Nature's Wrath →
    restrained), fighting style, Extra Attack.
  - Cleric — Sacred Flame (DEX save), Guiding Bolt (advantage on your next
    attack), Cure Wounds, Healing Word (bonus), Bless, Shield of Faith,
    Inflict Wounds, Spiritual Weapon at 3 (bonus-action strike each turn),
    Channel Divinity: Divine Spark (heal, or radiant on a CON save).
  - Druid — Wild Shape at 2 (a catalog beast's AC and attacks, temp HP =
    level, CR cap by level), Produce Flame / Starry Wisp, Cure Wounds,
    Healing Word, Thunderwave.
  - Ranger — Hunter's Mark (from Favored Enemy uses, no slot), Archery,
    Cure Wounds, Extra Attack.
  - Sorcerer — cantrips and spells, Innate Sorcery (bonus: +1 DC, advantage
    on spell attacks, 3 rounds), Font of Magic at 2: Quickened Spell (2 points
    → next spell is a bonus action); Shield as an automatic reaction.
  - Warlock — Eldritch Blast (beams 1/2 at 5), Agonizing Blast at 2 (+CHA per
    beam), Hex (bonus, concentration, +1d6 per hit), Hellish Rebuke as an
    automatic reaction, pact slots upcast lower spells.
  - Bard — Vicious Mockery (fail → the foe's next attack at disadvantage),
    Healing Word, Dissonant Whispers, Thunderwave; College of Lore: Cutting
    Words as an automatic reaction from Bardic Inspiration uses.
  - Wizard — cantrips with scaling, Magic Missile (three darts), Burning
    Hands, Sleep (5d8 vs the foe's HP), Scorching Ray (three rays), Shield as
    an automatic reaction (never beats a natural 20).
- **Automatic reactions** (toggle on the phone): Shield, Cutting Words,
  Uncanny Dodge, Deflect Attacks, Hellish Rebuke.
- **Coaching tips** updated: Divine Smite after a melee hit, Steady Aim for
  Sneak Attack, Healing Word as a bonus action, Flurry, mark-then-hit.

## The phone (frontend/src/pages/Arena.tsx)
Grouped by cost — Action / Bonus action & riders / Reactions — with the reason
under every greyed button, a slot picker on the smites, a beast picker for Wild
Shape, chips for slots, Focus, sorcery points, Sneak Attack dice, form, rage,
dodge, reckless, advantage, Bless, Shield of Faith, marks and concentration,
and the foe's conditions.

## Verification
- `tests/test_services/test_arena_rules.py` (11 scripted fights with fixed or
  queued dice): smite needs a melee hit, spends the slot, is a bonus action,
  adds a die vs fiends; Lay on Hands is a bonus action; Soulknife blades +
  Steady Aim + Sneak Attack once a turn, second blade after the first,
  Cunning Action; Flurry and Focus; Stunning Strike costs the foe its turn;
  Reckless gives and takes advantage; Hex rides every Eldritch Blast beam;
  Guiding Bolt then Healing Word; Sleep, a critical on the sleeper, Shield
  turning a 16 into a miss; Wild Shape from the catalog with temp HP.
  Plus the Plan 84/85 arena tests. Full suite 859 passed.
- Prod: see the commit that flips this plan to Complete.

## Not modeled (yet)
Two-Weapon Fighting, Weapon Mastery, Cunning Strike, Assassinate, Bardic
Inspiration on an ally, Moonbeam-style zones, Hold Person, Web/Entangle,
Misty Step, temp-HP spells, Warlock invocations beyond Agonizing Blast, foe
spellcasting and recharge abilities, death saves (a drop ends the practice).
