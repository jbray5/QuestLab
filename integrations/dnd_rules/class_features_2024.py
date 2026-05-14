"""Curated 2024 PHB / SRD 5.5e class features with limited uses (Plan 00021).

Only catalogues features the DM needs to track at the table — limited-use
abilities with short or long rest recovery. Passive features (Sneak Attack
damage, Fighting Style, ASIs, Expertise) are deliberately omitted.

Sources:
- D&D 5.5e SRD 5.2.1 (Wizards of the Coast, CC-BY-4.0)
- Hand-curated against the 2024 PHB for features the SRD covers
"""

from domain.character import ClassFeatureCreate
from domain.enums import CharacterClass, RecoveryType, UsesFormula

CLASS_FEATURES_2024: list[ClassFeatureCreate] = [
    # ── Barbarian ────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Rage",
        character_class=CharacterClass.BARBARIAN,
        level_acquired=1,
        recovery=RecoveryType.LONG,
        uses_formula=UsesFormula.FIXED_2,  # 2 at L1, scales with level — see PHB table
        description=(
            "Bonus action: enter a rage. Advantage on STR checks/saves, +rage damage on melee, "
            "resistance to B/P/S damage. Lasts 1 minute; ends if Incapacitated or you put on "
            "Heavy armor."
        ),
    ),
    # ── Bard ─────────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Bardic Inspiration",
        character_class=CharacterClass.BARD,
        level_acquired=1,
        recovery=RecoveryType.LONG,  # switches to SHORT at L5; service treats it as LONG until upgraded
        uses_formula=UsesFormula.CHA_MOD,
        description=(
            "Bonus action: give a creature within 60 ft a Bardic Inspiration die (d6 at L1). "
            "They can add it to one ability check, attack roll, or saving throw within 10 minutes."
        ),
    ),
    ClassFeatureCreate(
        name="Song of Rest",
        character_class=CharacterClass.BARD,
        level_acquired=2,
        recovery=RecoveryType.NONE,  # passive
        uses_formula=UsesFormula.NONE,
        description=(
            "At the end of a short rest, allies who spend Hit Dice regain extra HP equal to "
            "Bardic Inspiration die. Passive — no counter needed."
        ),
    ),
    # ── Cleric ───────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Channel Divinity",
        character_class=CharacterClass.CLERIC,
        level_acquired=2,
        recovery=RecoveryType.SHORT,
        uses_formula=UsesFormula.PROF_BONUS,
        description=(
            "Use a Channel Divinity option (Turn Undead at L2; others granted by subclass). "
            "Uses recharge on short or long rest."
        ),
    ),
    # ── Druid ────────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Wild Shape",
        character_class=CharacterClass.DRUID,
        level_acquired=2,
        recovery=RecoveryType.SHORT,
        uses_formula=UsesFormula.FIXED_2,
        description=(
            "Bonus action: assume the shape of a Beast you've seen. Lasts hours equal to half "
            "your Druid level. Two uses, recharging on short or long rest."
        ),
    ),
    # ── Fighter ──────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Second Wind",
        character_class=CharacterClass.FIGHTER,
        level_acquired=1,
        recovery=RecoveryType.SHORT,
        uses_formula=UsesFormula.FIXED_2,  # 2 at L1, 3 at L10, 4 at L17
        description=(
            "Bonus action: regain Hit Points equal to 1d10 + Fighter level. Two uses, recharging "
            "on short or long rest."
        ),
    ),
    ClassFeatureCreate(
        name="Action Surge",
        character_class=CharacterClass.FIGHTER,
        level_acquired=2,
        recovery=RecoveryType.SHORT,
        uses_formula=UsesFormula.FIXED_1,  # 2 at L17
        description=("On your turn, take one additional action. Once per short or long rest."),
    ),
    ClassFeatureCreate(
        name="Indomitable",
        character_class=CharacterClass.FIGHTER,
        level_acquired=9,
        recovery=RecoveryType.LONG,
        uses_formula=UsesFormula.FIXED_1,  # 2 at L13, 3 at L17
        description=(
            "Reroll a saving throw you fail. You must use the new roll. Recharges on long rest."
        ),
    ),
    # ── Monk ─────────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Focus Points (Ki)",
        character_class=CharacterClass.MONK,
        level_acquired=2,
        recovery=RecoveryType.SHORT,
        uses_formula=UsesFormula.LEVEL,
        description=(
            "Spend Focus Points to fuel Monk features (Flurry of Blows, Patient Defense, "
            "Step of the Wind). All Focus Points return on a short or long rest."
        ),
    ),
    # ── Paladin ──────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Lay on Hands",
        character_class=CharacterClass.PALADIN,
        level_acquired=1,
        recovery=RecoveryType.LONG,
        uses_formula=UsesFormula.LEVEL,  # pool = 5 × paladin level; we approximate with LEVEL for the counter
        description=(
            "Pool of healing HP equal to 5 × Paladin level. Touch a creature to restore HP from "
            "the pool, or spend 5 HP to cure a disease/poison. Refills on long rest."
        ),
    ),
    ClassFeatureCreate(
        name="Channel Divinity (Paladin)",
        character_class=CharacterClass.PALADIN,
        level_acquired=3,
        recovery=RecoveryType.SHORT,
        uses_formula=UsesFormula.FIXED_1,  # 2 at L11, 3 at L17
        description=(
            "Use one of your subclass's Channel Divinity options. Recharges on short or long rest."
        ),
    ),
    # ── Ranger ───────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Favored Enemy",
        character_class=CharacterClass.RANGER,
        level_acquired=1,
        recovery=RecoveryType.LONG,
        uses_formula=UsesFormula.PROF_BONUS,
        description=(
            "Cast Hunter's Mark without expending a spell slot a number of times equal to your "
            "proficiency bonus per long rest."
        ),
    ),
    # ── Rogue ────────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Cunning Strike (Withdraw / Trip / Poison)",
        character_class=CharacterClass.ROGUE,
        level_acquired=5,
        recovery=RecoveryType.NONE,  # tied to Sneak Attack dice, not a separate counter
        uses_formula=UsesFormula.NONE,
        description=(
            "When you deal Sneak Attack damage, trade dice for effects: forgo 1d6 for "
            "Withdraw or Trip; 2d6 for Poison. No use-counter — limited by Sneak Attack damage."
        ),
    ),
    ClassFeatureCreate(
        name="Stroke of Luck",
        character_class=CharacterClass.ROGUE,
        level_acquired=20,
        recovery=RecoveryType.SHORT,
        uses_formula=UsesFormula.FIXED_1,
        description=(
            "Turn a failed attack into a hit, or a failed ability check into a 20. Once per "
            "short or long rest."
        ),
    ),
    # ── Sorcerer ─────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Sorcery Points",
        character_class=CharacterClass.SORCERER,
        level_acquired=2,
        recovery=RecoveryType.LONG,
        uses_formula=UsesFormula.LEVEL,
        description=(
            "Pool of Sorcery Points equal to Sorcerer level. Spent to fuel Metamagic and to "
            "create or convert spell slots. Refills on long rest."
        ),
    ),
    ClassFeatureCreate(
        name="Font of Magic — Slot Conversion",
        character_class=CharacterClass.SORCERER,
        level_acquired=2,
        recovery=RecoveryType.NONE,
        uses_formula=UsesFormula.NONE,
        description=(
            "As a bonus action, convert spell slots ↔ sorcery points using the published table. "
            "No separate counter — uses sorcery point + slot pools."
        ),
    ),
    # ── Warlock ──────────────────────────────────────────────────────────
    # NOTE: pact magic slots themselves recharge on short rest, but they're
    # tracked in spell_slots_used, not as a feature row. rest_service handles
    # that path via spellcasting_service for Warlocks.
    ClassFeatureCreate(
        name="Eldritch Invocations",
        character_class=CharacterClass.WARLOCK,
        level_acquired=1,
        recovery=RecoveryType.NONE,
        uses_formula=UsesFormula.NONE,
        description=(
            "Permanent magical enhancements chosen from a list at L1, L2, L5, L7, L9, L12, L15, "
            "L18. Most are passive — no use-counter."
        ),
    ),
    # ── Wizard ───────────────────────────────────────────────────────────
    ClassFeatureCreate(
        name="Arcane Recovery",
        character_class=CharacterClass.WIZARD,
        level_acquired=1,
        recovery=RecoveryType.LONG,
        uses_formula=UsesFormula.FIXED_1,
        description=(
            "Once per long rest, after finishing a short rest, recover spell slots whose levels "
            "sum to half your Wizard level (rounded up). No slot above L5."
        ),
    ),
    ClassFeatureCreate(
        name="Memorize Spell",
        character_class=CharacterClass.WIZARD,
        level_acquired=5,
        recovery=RecoveryType.NONE,
        uses_formula=UsesFormula.NONE,
        description=(
            "During a short rest, you can change one prepared spell. Once per short rest — "
            "tracked by the rest, not a separate counter."
        ),
    ),
]
"""Validated ClassFeatureCreate payloads — ~20 curated entries."""
