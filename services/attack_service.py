"""Attack-roll math for D&D 5.5e weapons (Plan 00018).

Given a PC and a weapon Item, return a ``WeaponAttackPreview`` with hit bonus, damage roll
string, mastery, etc. ``compute_attack`` and its helpers are pure functions (no DB, no I/O).

Plan 135 (James, round 2) adds the homebrew side, which reads the campaign DM's homebrew
through ``homebrew_service`` (the caller has already authorized the viewer):

- ``natural_attacks``: a homebrew race's natural weapons (claws, a bite) as attacks.
- ``power_attack_trades`` / ``offer_for``: a homebrew feat's "−5 to hit, +10 damage" trade,
  offered as a toggle on the attacks it fits (``attack_preview``, ``natural_attacks``, and
  the phone's turn kit via ``add_to_turn_kit``).

Future work (Plan 00021): replace the ``proficient=True`` default with a
class-feature lookup so weapon proficiencies are accurate per character.
"""

from __future__ import annotations

import uuid
from types import SimpleNamespace
from typing import Optional, Union

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.item_repo import ItemRepo
from domain.arena import TurnKit, TurnOption
from domain.character import PlayerCharacter, PlayerCharacterRead
from domain.homebrew import NaturalWeapon, PowerAttack
from domain.item import Item, NaturalAttack, PowerAttackOffer, WeaponAttackPreview
from integrations.dnd_rules import rulesets
from services import character_service, homebrew_service

# A sheet as the ORM row or the API's read model (both carry every field used below).
PcLike = Union[PlayerCharacter, PlayerCharacterRead]


def mastery_for(weapon: Item, character: PlayerCharacter) -> str | None:
    """The weapon's mastery property, if this character's rules have weapon mastery.

    Weapon mastery is a 2024 rule; a PC in a 2014 campaign (Plan 131) never
    gets one, so the sheet and the phone show none.

    Args:
        weapon: Weapon Item.
        character: The wielding PC (its ``ruleset`` decides).

    Returns:
        The mastery name ("Vex", "Topple"...), or None.
    """
    if rulesets.is_2014(getattr(character, "ruleset", None)):
        return None
    return weapon.mastery


def is_weapon(item: Item) -> bool:
    """Return True if the item has weapon stats populated.

    Args:
        item: An Item ORM object (mundane or magical).

    Returns:
        True iff ``weapon_category`` and ``damage_die`` are both set.
    """
    return bool(item.weapon_category and item.damage_die)


def ability_modifier(score: int) -> int:
    """Standard 5e ability-score-to-modifier helper.

    Args:
        score: Raw ability score (3–30).

    Returns:
        Integer modifier (``(score - 10) // 2``).
    """
    return (int(score) - 10) // 2


def proficiency_bonus(level: int) -> int:
    """5e proficiency bonus by level.

    Args:
        level: Character level (1–20).

    Returns:
        Proficiency bonus (+2 at 1–4, +3 at 5–8, +4 at 9–12, +5 at 13–16, +6 at 17–20).
    """
    return max(0, (max(1, int(level)) - 1) // 4) + 2


def _choose_ability(weapon: Item, str_mod: int, dex_mod: int) -> tuple[str, int]:
    """Pick the ability score that applies to this weapon attack.

    Rules:
      - Ranged weapons (not Thrown) always use DEX.
      - Thrown weapons use STR unless they also have Finesse.
      - Finesse melee weapons use whichever of STR/DEX is higher.
      - Otherwise STR.

    Args:
        weapon: Weapon Item.
        str_mod: Wielder's STR modifier.
        dex_mod: Wielder's DEX modifier.

    Returns:
        Tuple of (ability label, modifier value).
    """
    props = weapon.weapon_properties or []
    is_finesse = "Finesse" in props
    is_thrown = "Thrown" in props
    is_ranged_category = bool(weapon.weapon_category and "Ranged" in weapon.weapon_category)

    if is_ranged_category and not is_thrown:
        return "DEX", dex_mod
    if is_finesse:
        if dex_mod >= str_mod:
            return "DEX", dex_mod
        return "STR", str_mod
    return "STR", str_mod


MAX_MAGIC_BONUS = 3
"""The largest +N a magic weapon gives (a +3 weapon is the top of the table)."""


def magic_bonus(weapon: Item) -> int:
    """The weapon's +1/+2/+3 to attack and damage rolls, or 0 (Plan 132).

    Magic weapons carry it as ``properties["bonus"]`` ("+1", the PHB seed's
    representation; an int is read too). Anything unreadable counts as 0 and
    the value is capped at +3.

    Args:
        weapon: Weapon Item.

    Returns:
        The bonus, 0 to ``MAX_MAGIC_BONUS``.
    """
    props = weapon.properties if isinstance(weapon.properties, dict) else {}
    raw = props.get("bonus")
    if isinstance(raw, bool) or raw is None:
        return 0
    try:
        value = int(str(raw).strip().replace(" ", ""))
    except ValueError:
        return 0
    return max(0, min(MAX_MAGIC_BONUS, value))


def _format_damage_roll(die: str, ability_mod: int) -> str:
    """Render the damage roll string, e.g. ``1d8+3`` or ``2d6-1`` or just ``1d6``."""
    if ability_mod > 0:
        return f"{die}+{ability_mod}"
    if ability_mod < 0:
        return f"{die}{ability_mod}"
    return die


def compute_attack(
    weapon: Item,
    character: PlayerCharacter,
    proficient: bool = True,
    two_handed: bool = False,
) -> WeaponAttackPreview:
    """Compute hit bonus and damage roll for a PC wielding a weapon.

    Args:
        weapon: Weapon Item (must have ``weapon_category`` + ``damage_die``).
        character: PlayerCharacter wielding it.
        proficient: Whether the character is proficient with this weapon
            (defaults True; Plan 21 will compute from class features).
        two_handed: For Versatile weapons, ``True`` to use the larger die.
            Ignored if the weapon has no ``versatile_damage``.

    Returns:
        WeaponAttackPreview with hit bonus, damage roll, mastery (None for a
        2014 PC: no weapon mastery in those rules), etc. Exhaustion is not
        folded into the hit bonus in either edition (Plan 131). A magic
        weapon's +N (``magic_bonus``) is added to both the hit bonus and the
        damage roll (Plan 132).

    Raises:
        ValueError: If ``weapon`` is not a weapon.
    """
    if not is_weapon(weapon):
        raise ValueError(f"Item {weapon.id} ({weapon.name}) is not a weapon.")

    str_mod = ability_modifier(character.score_str)
    dex_mod = ability_modifier(character.score_dex)
    ability, ability_mod = _choose_ability(weapon, str_mod, dex_mod)
    prof_bonus = proficiency_bonus(character.level) if proficient else 0
    plus = magic_bonus(weapon)
    hit_bonus = ability_mod + prof_bonus + plus

    die = weapon.versatile_damage if (two_handed and weapon.versatile_damage) else weapon.damage_die
    damage_roll = _format_damage_roll(die or "1d4", ability_mod + plus)

    return WeaponAttackPreview(
        weapon_id=weapon.id,
        character_id=character.id,
        ability=ability,
        hit_bonus=hit_bonus,
        damage_roll=damage_roll,
        damage_type=weapon.damage_type or "bludgeoning",
        mastery=mastery_for(weapon, character),
        proficient=proficient,
        two_handed=two_handed,
        magic_bonus=plus,
    )


# ── Plan 135: natural weapons and the power-attack trade ────────────────────


def _homebrew_scope(db: Session, pc: PcLike) -> Optional[SimpleNamespace]:
    """The PC's campaign as ``homebrew_service`` reads it: its DM and the PC's edition.

    Only that campaign's DM's homebrew is ever read (SEC-003); None if the campaign is gone.
    """
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        return None
    return SimpleNamespace(
        dm_email=campaign.dm_email, ruleset=rulesets.normalize(getattr(pc, "ruleset", None))
    )


def power_attack_trades(db: Session, pc: PcLike) -> list[tuple[str, PowerAttack]]:
    """The "−5 to hit, +10 damage" trades the PC's homebrew feats carry, in ``pc.feats`` order.

    Each entry of ``pc.feats`` is looked up with ``homebrew_service.feat_for`` in the PC's
    campaign, so only its DM's feats that fit the PC's rules count; book feats never do.

    Args:
        db: Active database session.
        pc: The player character.

    Returns:
        ``(feat name, PowerAttack)`` pairs, one per feat.
    """
    if not pc.feats:
        return []
    scope = _homebrew_scope(db, pc)
    if scope is None:
        return []
    trades: list[tuple[str, PowerAttack]] = []
    seen: set[str] = set()
    for entry in pc.feats:
        feat = homebrew_service.feat_for(db, scope, str(entry))
        if feat is None or feat.power_attack is None or feat.name.casefold() in seen:
            continue
        seen.add(feat.name.casefold())
        trades.append((feat.name, feat.power_attack))
    return trades


def weapon_shape(weapon: Item) -> tuple[bool, bool]:
    """``(ranged, heavy)`` for a weapon, as the power-attack trades read it.

    Ranged means a ranged-category weapon ("Martial Ranged"); a thrown melee weapon is not.
    Heavy means a melee weapon with the Heavy property (a heavy crossbow is ranged).

    Args:
        weapon: Weapon Item.

    Returns:
        Whether the weapon is ranged, and whether it is a heavy melee weapon.
    """
    ranged = bool(weapon.weapon_category and "ranged" in weapon.weapon_category.lower())
    props = {str(p).strip().lower() for p in (weapon.weapon_properties or [])}
    return ranged, (not ranged and "heavy" in props)


def trade_fits(weapons: str, ranged: bool, heavy: bool) -> bool:
    """Whether a trade's ``weapons`` ("ranged", "heavy", "melee", "any") covers an attack.

    Args:
        weapons: The trade's ``PowerAttack.weapons``.
        ranged: The attack is made with a ranged weapon.
        heavy: The attack is made with a heavy melee weapon.

    Returns:
        True when the toggle should be offered on the attack.
    """
    if weapons == "any":
        return True
    if weapons == "ranged":
        return ranged
    if weapons == "heavy":
        return heavy and not ranged
    return not ranged  # "melee": any melee weapon, natural weapons included


def offer_for(
    trades: list[tuple[str, PowerAttack]], ranged: bool, heavy: bool
) -> Optional[PowerAttackOffer]:
    """The first trade that fits an attack, as the toggle the sheet and phone show, or None.

    Args:
        trades: From ``power_attack_trades``.
        ranged: The attack is made with a ranged weapon.
        heavy: The attack is made with a heavy melee weapon.

    Returns:
        The offer, or None when no trade fits.
    """
    for name, trade in trades:
        if trade_fits(trade.weapons, ranged, heavy):
            return PowerAttackOffer(to_hit=trade.to_hit, damage=trade.damage, feat=name)
    return None


def attack_preview(
    db: Session,
    weapon: Item,
    character: PlayerCharacter,
    viewer: str,
    proficient: bool = True,
    two_handed: bool = False,
) -> WeaponAttackPreview:
    """``compute_attack`` plus the power-attack toggle when one of the PC's feats fits.

    The toggle is only added for the campaign's DM (the sheet's viewer): a homebrew feat is
    the DM's own, so nobody else learns of it here.

    Args:
        db: Active database session.
        weapon: Weapon Item.
        character: The wielding PC.
        viewer: The signed-in user's email.
        proficient: Whether the character is proficient with this weapon.
        two_handed: For Versatile weapons, use the larger die.

    Returns:
        The preview, with ``power_attack`` set when a trade fits the weapon.

    Raises:
        ValueError: If ``weapon`` is not a weapon.
    """
    preview = compute_attack(weapon, character, proficient=proficient, two_handed=two_handed)
    campaign = CampaignRepo.get_by_id(db, character.campaign_id)
    if campaign is None or campaign.dm_email != (viewer or "").strip().lower():
        return preview
    ranged, heavy = weapon_shape(weapon)
    preview.power_attack = offer_for(power_attack_trades(db, character), ranged, heavy)
    return preview


def attack_preview_for_dm(
    db: Session,
    weapon: Item,
    character_id: uuid.UUID,
    viewer: str,
    proficient: bool = True,
    two_handed: bool = False,
) -> WeaponAttackPreview:
    """The sheet's attack preview: only the PC's campaign DM may ask (fail closed).

    Before Plan 135 any signed-in user could preview any PC by id.

    Args:
        db: Active database session.
        weapon: Weapon Item.
        character_id: UUID of the wielding PC.
        viewer: The signed-in user's email.
        proficient: Whether the character is proficient with this weapon.
        two_handed: For Versatile weapons, use the larger die.

    Returns:
        The preview (see ``attack_preview``).

    Raises:
        LookupError: If there is no such character.
        PermissionError: If ``viewer`` doesn't run the PC's campaign.
        ValueError: If ``weapon`` is not a weapon.
    """
    try:
        character_service.get_character(db, character_id, viewer or "")
    except ValueError as exc:
        raise LookupError("Character not found") from exc
    character = CharacterRepo.get_by_id(db, character_id)
    if character is None:
        raise LookupError("Character not found")
    return attack_preview(db, weapon, character, viewer, proficient, two_handed)


def _natural_ability(ability: str, str_mod: int, dex_mod: int) -> tuple[str, int]:
    """``(label, modifier)`` for a natural weapon: STR, DEX, or the higher ("best")."""
    if ability == "DEX":
        return "DEX", dex_mod
    if ability == "best" and dex_mod > str_mod:
        return "DEX", dex_mod
    return "STR", str_mod


def natural_damage(damage: str, ability_mod: int) -> str:
    """A natural weapon's damage roll: "1d6" → "1d6+3"; a flat "1" → "4" (at least 1).

    A flat number works like an unarmed strike: the number plus the modifier.

    Args:
        damage: The weapon's damage ("1d6", "2d4" or "1").
        ability_mod: The attack's ability modifier.

    Returns:
        The damage roll string.
    """
    if "d" in damage:
        return _format_damage_roll(damage, ability_mod)
    return str(max(1, int(damage) + ability_mod))


def natural_attack(
    weapon: NaturalWeapon,
    character: PcLike,
    index: int = 0,
    trades: Optional[list[tuple[str, PowerAttack]]] = None,
) -> NaturalAttack:
    """One natural weapon worked out for a PC: always proficient, no magic, no item.

    Args:
        weapon: The race's natural weapon.
        character: The PC.
        index: The weapon's place in the race's list (makes the key).
        trades: The PC's power-attack trades (a natural weapon is a melee weapon).

    Returns:
        The attack.
    """
    label, mod = _natural_ability(
        weapon.ability, ability_modifier(character.score_str), ability_modifier(character.score_dex)
    )
    return NaturalAttack(
        key=f"n-{index}",
        name=weapon.name,
        ability=label,
        hit_bonus=mod + proficiency_bonus(character.level),
        damage_roll=natural_damage(weapon.damage, mod),
        damage_type=weapon.damage_type,
        note=weapon.note,
        power_attack=offer_for(trades or [], ranged=False, heavy=False),
    )


def natural_attacks(db: Session, pc: PcLike) -> list[NaturalAttack]:
    """A PC's natural attacks from its homebrew race (``homebrew_service.race_for``).

    Only the PC's campaign DM's race, fitting the PC's rules, is read; an SRD race (or any
    race without natural weapons) gives none. Read-only; the caller authorizes.

    Args:
        db: Active database session.
        pc: The player character.

    Returns:
        The attacks, in the race's order.
    """
    if not (pc.race or "").strip():
        return []
    scope = _homebrew_scope(db, pc)
    if scope is None:
        return []
    race = homebrew_service.race_for(db, scope, pc.race)
    if race is None or not race.natural_weapons:
        return []
    trades = power_attack_trades(db, pc)
    return [natural_attack(w, pc, i, trades) for i, w in enumerate(race.natural_weapons)]


def natural_attacks_for_dm(
    db: Session, character_id: uuid.UUID, viewer: str
) -> list[NaturalAttack]:
    """The natural attacks on a PC's sheet, for the DM who runs its campaign.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        viewer: The signed-in DM's email.

    Returns:
        The attacks (empty unless the PC's race is its DM's homebrew race with natural
        weapons).

    Raises:
        ValueError: If the PC or its campaign doesn't exist.
        PermissionError: If the viewer doesn't run the PC's campaign.
    """
    pc = character_service.get_character(db, character_id, viewer)
    return natural_attacks(db, pc)


def _natural_option(attack: NaturalAttack) -> TurnOption:
    """A natural attack as the phone's turn kit shows it ("STR · slashing · natural")."""
    note = f"{attack.ability} · {attack.damage_type} · natural"
    return TurnOption(
        key=attack.key,
        name=attack.name,
        kind="natural",
        to_hit=attack.hit_bonus,
        damage=attack.damage_roll,
        damage_type=attack.damage_type,
        note=f"{note} · {attack.note}" if attack.note else note,
        power_attack=attack.power_attack,
    )


def _kit_weapon(db: Session, key: str) -> Optional[Item]:
    """The weapon behind a turn-kit option key ("w-<item id>" or "wt-<item id>"), or None."""
    try:
        item_id = uuid.UUID(key.split("-", 1)[1])
    except (IndexError, ValueError):
        return None
    return ItemRepo.get_by_id(db, item_id)


def add_to_turn_kit(db: Session, pc: PcLike, kit: TurnKit) -> TurnKit:
    """Add a PC's natural attacks and power-attack toggles to the phone's turn kit.

    Natural attacks go in the action list right after the equipped weapons. A weapon swing
    ("w-…") gets the toggle when a trade fits the weapon; a separate throw ("wt-…") is a
    ranged attack with a melee weapon, so only an "any" trade fits it. A PC with neither
    natural weapons nor a power-attack feat gets the kit back unchanged.

    Args:
        db: Active database session.
        pc: The player character (the caller has checked the capability link).
        kit: The kit from ``arena_service.turn_kit`` (changed in place).

    Returns:
        The same kit.
    """
    trades = power_attack_trades(db, pc)
    if trades:
        for option in kit.action:
            if option.kind != "weapon":
                continue
            if option.key.startswith("wt-"):
                option.power_attack = offer_for(
                    [t for t in trades if t[1].weapons == "any"], ranged=True, heavy=False
                )
                continue
            weapon = _kit_weapon(db, option.key)
            if weapon is not None:
                option.power_attack = offer_for(trades, *weapon_shape(weapon))
    natural = natural_attacks(db, pc)
    if natural:
        at = max((i + 1 for i, o in enumerate(kit.action) if o.kind == "weapon"), default=0)
        kit.action[at:at] = [_natural_option(a) for a in natural]
    return kit
