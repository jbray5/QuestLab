"""Practice Arena (Plans 84/85/87) — a sparring match run by the rules, not a model.

A player fights one SRD foe with their real sheet: equipped weapons (the same
math as the sheet's attack list), cantrips and prepared spells (damage dice,
attack roll or save, healing, buffs, marks), spell slots, and every class's
level 1–5 kit modeled as an action economy: action, bonus action, reactions,
once-per-turn riders (Sneak Attack, Divine Smite, Stunning Strike), advantage
and disadvantage, and the conditions a one-on-one fight actually produces
(asleep, stunned, restrained, prone).

The server is the referee and the dice (``SystemRandom``); the state is a JSON
document the phone holds between turns, HMAC-sealed so it can't be edited. A
practice round never writes to the real character. No AI anywhere.
"""

import random
import re
import uuid
from typing import Any, Optional

from sqlmodel import Session

from db.repos.character_item_repo import CharacterItemRepo
from db.repos.character_repo import CharacterRepo
from db.repos.item_repo import ItemRepo
from db.repos.monster_repo import MonsterRepo
from db.repos.spell_repo import SpellRepo
from domain.arena import (
    ArenaAction,
    ArenaAttack,
    ArenaBeast,
    ArenaFeature,
    ArenaFoe,
    ArenaFoeAttack,
    ArenaFoeOption,
    ArenaLogLine,
    ArenaPc,
    ArenaState,
    ArenaStats,
)
from domain.character import PlayerCharacter
from integrations import arena_signing
from integrations.dnd_rules.wild_magic_2024 import RANDOM_SPELLS, surge_entry
from services import (
    attack_service,
    character_service,
    entitlement_service,
    feature_service,
    spellcasting_service,
)
from services.item_service import is_weapon

_RNG = random.SystemRandom()
_DICE_RE = re.compile(r"(\d+)d(\d+)\s*([+-]\s*\d+)?")
_HIT_RE = re.compile(r"([+-]\s*\d+)\s*to hit|attack roll:\s*([+-]\s*\d+)", re.I)
_COUNT_WORDS = {"two": 2, "three": 3, "four": 4, "five": 5, "twice": 2, "three times": 3}
_ABILITIES = ("str", "dex", "con", "int", "wis", "cha")
_MARTIAL = {"fighter", "barbarian", "paladin", "ranger", "monk"}
_WEAPON_DAMAGE = {"", "bludgeoning", "piercing", "slashing"}
_HEAVY_HITTERS = {"undead", "fiend"}  # Divine Smite's extra die

# Modeled sheet features → arena keys (cost, blurb). Uses come from the sheet.
_FEATURE_KEYS: dict[str, tuple[str, str, str]] = {
    "second wind": ("second_wind", "bonus", "Bonus action: heal 1d10 + your level."),
    "action surge": ("action_surge", "free", "Take a second action this turn."),
    "rage": ("rage", "bonus", "Bonus action: +2 melee damage; weapon hits on you are halved."),
    "lay on hands": ("lay_on_hands", "bonus", "Bonus action: heal 5 HP from your pool."),
    "wild shape": ("wild_shape", "bonus", "Bonus action: take a beast's form (pick one below)."),
    "channel divinity": (
        "divine_spark",
        "action",
        "Divine Spark: heal 1d8 + mod, or 1d8 + mod radiant (CON save) when you're at full HP.",
    ),
    "channel divinity (paladin)": (
        "natures_wrath",
        "action",
        "Nature's Wrath: STR save or the foe is Restrained for a round.",
    ),
    "favored enemy": (
        "hunters_mark_free",
        "bonus",
        "Hunter's Mark without a slot: +1d6 on every hit while you concentrate.",
    ),
    "star map — free guiding bolt": (
        "star_map",
        "free",
        "Guiding Bolt without a slot, from the Star Map (automatic when you use the bolt).",
    ),
    "bardic inspiration": (
        "cutting_words",
        "reaction",
        "Cutting Words: a d6 off the foe's attack roll when it would just hit (automatic).",
    ),
}

# Spells the referee gives a rule to, beyond "roll to hit / save, deal dice".
_SPELL_EFFECTS: dict[str, dict[str, Any]] = {
    "cure wounds": {"kind": "heal", "cost": "action", "dice": "2d8", "effect": "heal"},
    "healing word": {"kind": "heal", "cost": "bonus", "dice": "2d4", "effect": "heal"},
    "bless": {"kind": "buff", "cost": "action", "effect": "bless"},
    "shield of faith": {"kind": "buff", "cost": "bonus", "effect": "faith"},
    "guiding bolt": {"effect": "guiding_bolt"},
    "hex": {"kind": "buff", "cost": "bonus", "effect": "mark"},
    "hunter's mark": {"kind": "buff", "cost": "bonus", "effect": "mark"},
    "sleep": {"kind": "buff", "cost": "action", "effect": "sleep"},
    "vicious mockery": {"effect": "mockery"},
    "spiritual weapon": {"kind": "buff", "cost": "bonus", "effect": "spiritual_weapon"},
    "divine smite": {"skip": True},  # the class kit adds the smite with the slot picker
    "searing smite": {"kind": "feature", "cost": "bonus", "effect": "searing_smite", "rider": True},
    "eldritch blast": {"effect": "eldritch_blast"},
    "scorching ray": {"effect": "scorching_ray"},
    "magic missile": {"effect": "magic_missile"},
    "shield": {"skip": True, "reaction": "shield"},
    # Plan 88 — the owner's table.
    "ensnaring strike": {"kind": "feature", "cost": "bonus", "effect": "ensnaring", "rider": True},
    "command": {"effect": "command"},
    "faerie fire": {"kind": "buff", "cost": "action", "effect": "faerie_fire"},
    "charm person": {"kind": "buff", "cost": "action", "effect": "charm"},
    "sorcerous burst": {"effect": "sorcerous_burst"},
    "hellish rebuke": {"skip": True, "reaction": "hellish_rebuke"},
}


def _seal(state: ArenaState) -> ArenaState:
    """Sign the state so the next ``act`` can trust it (Plan 85)."""
    state.sig = ""
    state.sig = arena_signing.sign(state.model_dump_json(exclude={"sig"}))
    return state


def _check_seal(state: ArenaState) -> None:
    """Refuse a state the server didn't hand out."""
    if not arena_signing.verify(state.model_dump_json(exclude={"sig"}), state.sig):
        raise ValueError("This fight's record was altered or expired — start another.")


# ── Dice ─────────────────────────────────────────────────────────────────────


def roll_expr(expr: str, crit: bool = False, gwf: bool = False) -> tuple[int, str]:
    """Roll a dice expression like ``1d8+3`` (dice doubled on a crit).

    Args:
        expr: The expression. A bare integer is a flat amount.
        crit: Roll the dice twice (the modifier once), as a critical hit does.
        gwf: Great Weapon Fighting — a 1 or 2 on a damage die counts as 3.

    Returns:
        ``(total, breakdown)`` where breakdown reads like ``1d8+3 → [6]+3 = 9``.
    """
    m = _DICE_RE.search(expr or "")
    if not m:
        try:
            flat = int((expr or "0").strip())
        except ValueError:
            flat = 0
        return max(0, flat), f"{flat}"
    count = int(m.group(1)) * (2 if crit else 1)
    sides = int(m.group(2))
    mod = int((m.group(3) or "0").replace(" ", ""))
    dice = [_RNG.randint(1, sides) for _ in range(count)]
    if gwf:
        dice = [max(3, d) if d < 3 else d for d in dice]
    total = max(0, sum(dice) + mod)
    shown = f"{count}d{sides}" + (f"{mod:+d}" if mod else "")
    mod_txt = f"{mod:+d}" if mod else ""
    return total, f"{shown} → [{', '.join(map(str, dice))}]{mod_txt} = {total}"


def _avg(expr: str) -> float:
    """Expected value of a dice expression (for the foe's choice of action)."""
    m = _DICE_RE.search(expr or "")
    if not m:
        try:
            return float(expr)
        except (TypeError, ValueError):
            return 0.0
    mod = int((m.group(3) or "0").replace(" ", ""))
    return int(m.group(1)) * (int(m.group(2)) + 1) / 2 + mod


def d20(mode: Optional[str] = None) -> tuple[int, str]:
    """Roll a d20, with ``"adv"`` or ``"dis"`` taking the better/worse of two.

    Args:
        mode: ``None``, ``"adv"`` or ``"dis"``.

    Returns:
        ``(natural, text)`` where text shows both dice when two were rolled.
    """
    a = _RNG.randint(1, 20)
    if mode not in ("adv", "dis"):
        return a, f"d20 [{a}]"
    b = _RNG.randint(1, 20)
    keep = max(a, b) if mode == "adv" else min(a, b)
    word = "advantage" if mode == "adv" else "disadvantage"
    return keep, f"d20 {word} [{a}, {b}] → {keep}"


def _mode(adv: bool, dis: bool) -> Optional[str]:
    """Advantage and disadvantage cancel; otherwise whichever applies."""
    if adv and not dis:
        return "adv"
    if dis and not adv:
        return "dis"
    return None


# ── Stat-block parsing ───────────────────────────────────────────────────────


def cr_value(cr: str) -> float:
    """Numeric value of a challenge rating string (``"1/4"`` → 0.25)."""
    cr = (cr or "0").strip()
    if "/" in cr:
        a, b = cr.split("/", 1)
        try:
            return int(a) / int(b)
        except (ValueError, ZeroDivisionError):
            return 0.0
    try:
        return float(cr)
    except ValueError:
        return 0.0


def parse_foe_attacks(actions: Optional[list[dict[str, Any]]]) -> list[ArenaFoeAttack]:
    """Turn a stat block's action list into rollable attacks.

    Reads ``+N to hit`` and the first dice expression from each action's text;
    a Multiattack line ("makes two attacks") multiplies the first attack. A
    block with nothing parseable gets a Slam so the fight still works.

    Args:
        actions: ``[{"name", "desc"}, ...]`` as stored on the stat block.

    Returns:
        The foe's attacks, one per action that has a to-hit line.
    """
    out: list[ArenaFoeAttack] = []
    multi = 1
    for action in actions or []:
        name = str(action.get("name") or "").strip()
        desc = str(action.get("desc") or "")
        if name.lower().startswith("multiattack"):
            low = desc.lower()
            for word, n in _COUNT_WORDS.items():
                if word in low:
                    multi = max(multi, n)
            digits = re.search(r"\b(\d)\b", low)
            if digits:
                multi = max(multi, int(digits.group(1)))
            continue
        hit = _HIT_RE.search(desc)
        dice = _DICE_RE.search(desc)
        if not hit or not dice:
            continue
        dtype = ""
        # 2024 blocks wrap the dice: "Hit: 8 (1d8 + 4) Slashing damage" — step past the paren.
        tail = desc[dice.end() :].lstrip(" )").strip().split(" ")
        if tail and tail[0].isalpha():
            dtype = tail[0].strip(".,").lower()
        out.append(
            ArenaFoeAttack(
                name=name or "Attack",
                hit_bonus=int((hit.group(1) or hit.group(2)).replace(" ", "")),
                damage=dice.group(0).replace(" ", ""),
                damage_type=dtype,
            )
        )
    if not out:
        out.append(
            ArenaFoeAttack(name="Slam", hit_bonus=2, damage="1d4", damage_type="bludgeoning")
        )
    if multi > 1:
        out[0].count = min(6, multi)
    return out


def _foe_from_monster(monster: Any) -> ArenaFoe:
    """Snapshot a stat block into an ArenaFoe."""
    saves = {}
    for ab in _ABILITIES:
        saves[ab] = attack_service.ability_modifier(getattr(monster, f"score_{ab}", 10))
    for k, v in (getattr(monster, "saving_throws", None) or {}).items():
        kk = str(k).lower()[:3]
        if kk in saves:
            try:
                saves[kk] = int(v)
            except (TypeError, ValueError):
                pass
    return ArenaFoe(
        name=monster.name,
        ac=monster.ac,
        hp=monster.hp_average,
        hp_max=monster.hp_average,
        dex_mod=attack_service.ability_modifier(monster.score_dex),
        monster_id=str(monster.id),
        cr=monster.challenge_rating,
        creature_type=getattr(monster.creature_type, "value", str(monster.creature_type)),
        attacks=parse_foe_attacks(monster.actions),
        saves=saves,
        image_url=monster.image_url,
    )


# ── The player's side ────────────────────────────────────────────────────────


def _cantrip_scale(dice: str, level: int) -> str:
    """2024 cantrips add a die at levels 5, 11 and 17."""
    m = _DICE_RE.search(dice or "")
    if not m:
        return dice
    tier = 1 + (level >= 5) + (level >= 11) + (level >= 17)
    count = int(m.group(1)) * tier
    return f"{count}d{m.group(2)}{(m.group(3) or '').replace(' ', '')}"


def _class_of(pc: PlayerCharacter) -> str:
    return getattr(pc.character_class, "value", str(pc.character_class)).lower()


def _feats(pc: PlayerCharacter) -> list[str]:
    return [str(f) for f in (pc.feats or [])]


def _has_style(pc: PlayerCharacter, style: str) -> bool:
    return any(style in f.lower() for f in _feats(pc))


def _weapon_attacks(db: Session, pc: PlayerCharacter) -> list[ArenaAttack]:
    """Equipped weapons via the sheet's attack math, with the fighting styles applied."""
    out: list[ArenaAttack] = []
    for row in CharacterItemRepo.list_for_character(db, pc.id):
        if not row.equipped:
            continue
        item = ItemRepo.get_by_id(db, row.item_id)
        if item is None or not is_weapon(item):
            continue
        try:
            prev = attack_service.compute_attack(item, pc)
        except ValueError:
            continue
        props = [str(p).lower() for p in (item.weapon_properties or [])]
        # A thrown weapon has a range but is a melee weapon (a javelin smites fine).
        ranged = "ranged" in (item.weapon_category or "").lower() or (
            bool(item.weapon_range) and "thrown" not in props
        )
        two_handed = "two-handed" in props
        hit = prev.hit_bonus + (2 if ranged and _has_style(pc, "archery") else 0)
        damage = prev.damage_roll
        note = f"{prev.ability.upper()} · {prev.damage_type}"
        if not ranged and not two_handed and _has_style(pc, "dueling"):
            m = _DICE_RE.search(damage)
            if m:
                mod = int((m.group(3) or "0").replace(" ", "")) + 2
                damage = f"{m.group(1)}d{m.group(2)}{mod:+d}"
                note += " · Dueling +2"
        out.append(
            ArenaAttack(
                key=f"w-{item.id}",
                name=item.name,
                kind="weapon",
                hit_bonus=hit,
                damage=damage,
                damage_type=prev.damage_type,
                melee=not ranged,
                finesse="finesse" in props or ranged,
                two_handed=two_handed,
                note=note,
            )
        )
    return out


def _unarmed(pc: PlayerCharacter, mods: dict[str, int], martial_die: int) -> ArenaAttack:
    """Fists — or a monk's Martial Arts die with DEX."""
    if martial_die:
        mod = max(mods["str"], mods["dex"])
        return ArenaAttack(
            key="unarmed",
            name="Unarmed Strike",
            kind="unarmed",
            hit_bonus=mod + attack_service.proficiency_bonus(pc.level),
            damage=f"1d{martial_die}{mod:+d}",
            damage_type="bludgeoning",
            finesse=True,
            note=f"Martial Arts d{martial_die}",
        )
    return ArenaAttack(
        key="unarmed",
        name="Unarmed Strike",
        kind="unarmed",
        hit_bonus=mods["str"] + attack_service.proficiency_bonus(pc.level),
        damage=str(max(1, 1 + mods["str"])),
        damage_type="bludgeoning",
        note="no weapon equipped",
    )


def pc_spell_mod(stats: dict[str, Any], mods: dict[str, int]) -> int:
    """The casting ability modifier, from the sheet's spellcasting stats."""
    ability = (stats.get("ability") or "").lower()[:3]
    return mods.get(ability, 0)


def _spell_attacks(
    db: Session,
    pc: PlayerCharacter,
    dm_email: str,
    stats: dict[str, Any],
    mods: dict[str, int],
) -> tuple[list[ArenaAttack], list[str]]:
    """Known cantrips and prepared spells with the referee's rules; plus known reactions."""
    out: list[ArenaAttack] = []
    reactions: list[str] = []
    if stats.get("attack_bonus") is None:
        return out, reactions
    cls = _class_of(pc)
    for row in spellcasting_service.list_known_for_character(db, pc.id, dm_email):
        spell = SpellRepo.get_by_id(db, row.spell_id)
        if spell is None:
            continue
        if spell.level > 0 and not row.prepared:
            continue
        name = spell.name.lower()
        rule = _SPELL_EFFECTS.get(name, {})
        if rule.get("reaction"):
            reactions.append(rule["reaction"])
            continue
        if rule.get("skip"):
            continue
        effect = rule.get("effect")
        attack_type = (spell.attack_type or "").lower()
        save = (spell.save_ability or "").lower()[:3] or None
        damage = spell.damage_dice or ""
        kind = rule.get("kind") or ("cantrip" if spell.level == 0 else "spell")
        casting = (spell.casting_time or "").lower()
        cost = rule.get("cost") or ("bonus" if casting.startswith("bonus") else "action")
        if not damage and not rule:
            continue  # nothing the referee can do with it in a one-on-one
        if spell.level == 0 and damage:
            damage = _cantrip_scale(damage, pc.level)
        if effect == "magic_missile":
            darts = 2 + max(1, spell.level)
            damage = f"{darts}d4+{darts}"
        if effect == "eldritch_blast":
            beams = 1 + (pc.level >= 5) + (pc.level >= 11) + (pc.level >= 17)
            agonizing = cls == "warlock" and pc.level >= 2
            per = "1d10" + (f"+{mods['cha']}" if agonizing and mods["cha"] > 0 else "")
            damage = f"{beams}×{per}"
        if effect == "heal":
            damage = f"{rule['dice']}+{pc_spell_mod(stats, mods)}"
        is_attack = attack_type in ("melee", "ranged") and kind in ("cantrip", "spell")
        if effect == "sorcerous_burst":
            is_attack = True
            damage = _cantrip_scale("1d8", pc.level)
        upcast = (
            ""
            if spell.level == 0
            else (_UPCAST_BY_NAME.get(name) or _parse_upcast(spell.higher_levels or ""))
        )
        hint = (
            " · one more per slot level up"
            if upcast == "count"
            else (f" · +{upcast} per slot level up" if upcast else "")
        )
        out.append(
            ArenaAttack(
                key=f"s-{spell.id}",
                name=spell.name,
                kind=kind,
                cost=cost,
                hit_bonus=stats["attack_bonus"] if is_attack else None,
                save_ability=save if (save and not is_attack and kind != "buff") else None,
                save_dc=stats["save_dc"] if (save and not is_attack and kind != "buff") else None,
                half_on_save=spell.level > 0 and kind == "spell",
                damage=damage or "0",
                damage_type=spell.damage_type or "force",
                spell_level=spell.level,
                melee=attack_type == "melee",
                effect=effect,
                after_melee_hit=bool(rule.get("rider")),
                upcast=upcast,
                note=(f"level {spell.level}" if spell.level else "cantrip")
                + (f" · {spell.save_ability} save" if save and not is_attack else "")
                + (" · concentration" if spell.is_concentration else "")
                + hint,
            )
        )
    return out, reactions


_BREATH_TYPES = ("acid", "cold", "fire", "lightning", "poison")
_BREATH_RE = re.compile(
    r"(acid|cold|fire|lightning|poison)[^.]{0,24}breath"
    r"|breath[^.]{0,24}(acid|cold|fire|lightning|poison)",
    re.I,
)


def _breath_type(pc: PlayerCharacter) -> str:
    """The dragonborn's draconic ancestry, read off the sheet.

    There is no ancestry column, so the damage type lives in whatever the DM
    wrote ("Species: Fire breath weapon, Fire resistance"). Fire is the
    fallback — the most common pick, and visibly wrong rather than silently
    absent if the sheet says nothing.

    Args:
        pc: The player character.

    Returns:
        One of the five draconic damage types.
    """
    blob = f"{pc.notes or ''} {pc.appearance or ''}"
    m = _BREATH_RE.search(blob)
    if m:
        return (m.group(1) or m.group(2)).lower()
    return "fire"


def _species_extras(
    pc: PlayerCharacter, mods: dict[str, int], prof: int
) -> tuple[list[ArenaAttack], list[ArenaFeature]]:
    """Species traits with dice. Dragonborn Breath Weapon (2024) for now.

    Args:
        pc: The player character.
        mods: Ability modifiers.
        prof: Proficiency bonus.

    Returns:
        ``(attacks, features)`` to fold into the fight.
    """
    attacks: list[ArenaAttack] = []
    feats: list[ArenaFeature] = []
    race = (pc.race or "").lower()
    if "dragonborn" in race:
        dice = 1 + (pc.level >= 5) + (pc.level >= 11) + (pc.level >= 17)
        dtype = _breath_type(pc)
        attacks.append(
            ArenaAttack(
                key="breath_weapon",
                name=f"Breath Weapon ({dtype})",
                kind="feature",
                cost="action",
                save_ability="dex",
                save_dc=8 + mods.get("con", 0) + prof,
                half_on_save=True,
                damage=f"{dice}d10",
                damage_type=dtype,
                melee=False,
                note=(
                    f"15-ft cone, DEX save DC {8 + mods.get('con', 0) + prof} for half. "
                    f"{prof} uses per long rest."
                ),
            )
        )
        feats.append(
            ArenaFeature(
                key="breath_weapon",
                name="Breath Weapon uses",
                uses_left=prof,
                cost="free",
                blurb=f"{prof} per long rest — spent by the Breath Weapon attack above.",
            )
        )
    return attacks, feats


def _class_extras(
    pc: PlayerCharacter,
    mods: dict[str, int],
    prof: int,
    personal: bool = False,
    stats: Optional[dict[str, Any]] = None,
) -> tuple[list[ArenaAttack], list[ArenaFeature]]:
    """Level 1–5 class mechanics that aren't spells or sheet rows."""
    cls = _class_of(pc)
    sub = (pc.subclass or "").lower()
    lvl = pc.level
    attacks: list[ArenaAttack] = []
    feats: list[ArenaFeature] = []
    if cls == "barbarian" and lvl >= 2:
        feats.append(
            ArenaFeature(
                key="reckless",
                name="Reckless Attack",
                uses_left=99,
                cost="free",
                blurb="Advantage on your melee attacks this turn; the foe gets it back on you.",
            )
        )
    if cls == "monk":
        if lvl >= 2:
            feats.append(
                ArenaFeature(
                    key="flurry",
                    name="Flurry of Blows",
                    uses_left=99,
                    cost="bonus",
                    blurb="1 Focus: two Unarmed Strikes as a bonus action.",
                )
            )
            feats.append(
                ArenaFeature(
                    key="patient_defense",
                    name="Patient Defense",
                    uses_left=99,
                    cost="bonus",
                    blurb="1 Focus: Dodge as a bonus action.",
                )
            )
        else:
            feats.append(
                ArenaFeature(
                    key="martial_bonus",
                    name="Martial Arts strike",
                    uses_left=99,
                    cost="bonus",
                    blurb="After you attack: one Unarmed Strike as a bonus action.",
                )
            )
        if lvl >= 5:
            attacks.append(
                ArenaAttack(
                    key="stunning_strike",
                    name="Stunning Strike",
                    kind="feature",
                    cost="free",
                    damage="0",
                    effect="stunning_strike",
                    after_melee_hit=True,
                    save_ability="con",
                    save_dc=8 + prof + mods["wis"],
                    note="1 Focus, once a turn, after a melee hit: CON save or Stunned",
                )
            )
    if cls == "rogue":
        if lvl >= 2:
            feats.append(
                ArenaFeature(
                    key="cunning_dodge",
                    name="Cunning Action: Dodge",
                    uses_left=99,
                    cost="bonus",
                    blurb="Bonus action: the foe attacks you at disadvantage until your next turn.",
                )
            )
        if lvl >= 3:
            feats.append(
                ArenaFeature(
                    key="steady_aim",
                    name="Steady Aim",
                    uses_left=99,
                    cost="bonus",
                    blurb="Bonus action: advantage on your next attack this turn (you don't move).",
                )
            )
        if personal and "soulknife" in sub and lvl >= 3:
            dex = mods["dex"]
            attacks.append(
                ArenaAttack(
                    key="psychic_blade",
                    name="Psychic Blade",
                    kind="weapon",
                    hit_bonus=dex + prof,
                    damage=f"1d6{dex:+d}",
                    damage_type="psychic",
                    melee=True,
                    finesse=True,
                    note="finesse, thrown 60 ft · Sneak Attack applies",
                )
            )
            attacks.append(
                ArenaAttack(
                    key="psychic_blade_off",
                    name="Psychic Blade (second)",
                    kind="weapon",
                    cost="bonus",
                    hit_bonus=dex + prof,
                    damage=f"1d4{dex:+d}",
                    damage_type="psychic",
                    melee=True,
                    finesse=True,
                    effect="offhand_blade",
                    note="bonus action after the first blade",
                )
            )
    if cls == "paladin":
        attacks.append(
            ArenaAttack(
                key="divine_smite",
                name="Divine Smite",
                kind="feature",
                cost="bonus",
                damage="2d8",
                damage_type="radiant",
                effect="divine_smite",
                after_melee_hit=True,
                spell_level=1,
                note="bonus action after a melee hit; a slot: 2d8, +1d8 per level above 1, "
                "+1d8 vs undead and fiends",
            )
        )
    if cls == "sorcerer":
        feats.append(
            ArenaFeature(
                key="innate_sorcery",
                name="Innate Sorcery",
                uses_left=2,
                cost="bonus",
                blurb="Bonus action: +1 spell DC and advantage on spell attacks for 3 rounds.",
            )
        )
        if lvl >= 2:
            feats.append(
                ArenaFeature(
                    key="create_slot",
                    name="Font of Magic: make a slot",
                    uses_left=99,
                    cost="bonus",
                    blurb="Sorcery points into a spell slot: L1 for 2, L2 for 3 (level 3+), "
                    "L3 for 5 (level 5+), L4 for 6 (level 7+), L5 for 7 (level 9+).",
                )
            )
            feats.append(
                ArenaFeature(
                    key="convert_slot",
                    name="Font of Magic: slot to points",
                    uses_left=99,
                    cost="bonus",
                    blurb="A spell slot into sorcery points equal to its level.",
                )
            )
        metamagic = _metamagic(pc)
        if lvl >= 2 and (not metamagic or "quickened spell" in metamagic):
            feats.append(
                ArenaFeature(
                    key="quicken",
                    name="Quickened Spell",
                    uses_left=99,
                    cost="free",
                    blurb="2 sorcery points: your next spell is cast as a bonus action.",
                )
            )
        if personal and "wild" in sub:
            feats.append(
                ArenaFeature(
                    key="tides_of_chaos",
                    name="Tides of Chaos",
                    uses_left=1,
                    cost="free",
                    blurb="Advantage on your next attack. "
                    "Your next leveled spell then surges for sure "
                    "— and that gives Tides back.",
                )
            )
    if cls == "druid" and personal and "stars" in sub and lvl >= 3 and stats:
        wis = mods["wis"]
        attacks.append(
            ArenaAttack(
                key="star_bolt",
                name="Guiding Bolt (Star Map)",
                kind="spell",
                hit_bonus=stats.get("attack_bonus"),
                damage="4d6",
                damage_type="radiant",
                spell_level=0,
                melee=False,
                effect="guiding_bolt",
                note="no slot — a Star Map use; advantage on your next attack after a hit",
            )
        )
        for key, name, blurb in (
            (
                "starry_archer",
                "Starry Form: Archer",
                "Bonus action, a Wild Shape use: a luminous arrow each turn "
                "as a bonus action (1d8 + WIS radiant).",
            ),
            (
                "starry_chalice",
                "Starry Form: Chalice",
                "Bonus action, a Wild Shape use: healing spells cast with a slot "
                "heal you 1d8 + WIS more.",
            ),
            (
                "starry_dragon",
                "Starry Form: Dragon",
                "Bonus action, a Wild Shape use: concentration checks can't roll below 10.",
            ),
        ):
            feats.append(ArenaFeature(key=key, name=name, uses_left=99, cost="bonus", blurb=blurb))
        _ = wis
    return attacks, feats


def _metamagic(pc: PlayerCharacter) -> list[str]:
    """Metamagic options the sheet lists as feats ("Metamagic: Seeking Spell")."""
    out = []
    for f in _feats(pc):
        if f.lower().startswith("metamagic"):
            out.append(f.split(":", 1)[-1].strip().lower())
    return out


def _pc_features(
    db: Session, pc: PlayerCharacter, dm_email: str, personal: bool = False
) -> list[ArenaFeature]:
    """The modeled sheet features, with uses left."""
    out: list[ArenaFeature] = []
    sub = (pc.subclass or "").lower()
    for row in feature_service.list_for_character(db, pc.id, dm_email):
        spec = _FEATURE_KEYS.get((row.feature_name or "").strip().lower())
        if not spec:
            continue
        key, cost, blurb = spec
        uses = max(0, (row.max_uses or 0) - (row.uses_spent or 0))
        if key == "lay_on_hands":
            uses = max(uses, pc.level)  # a pool of 5 × level, spent 5 at a time
        if key == "cutting_words" and "lore" not in sub:
            continue
        if key == "natures_wrath" and ("ancients" not in sub or not personal):
            continue
        if key == "star_map" and ("stars" not in sub or not personal):
            continue
        out.append(
            ArenaFeature(  # type: ignore[arg-type]
                key=key, name=row.feature_name, uses_left=uses, cost=cost, blurb=blurb
            )
        )
    return out


def _build_pc(db: Session, pc: PlayerCharacter, dm_email: str) -> ArenaPc:
    """Snapshot the real sheet into the arena's copy."""
    mods = {ab: attack_service.ability_modifier(getattr(pc, f"score_{ab}")) for ab in _ABILITIES}
    prof = attack_service.proficiency_bonus(pc.level)
    cls = _class_of(pc)
    stats = character_service.spellcasting_stats(pc)
    slots: dict[str, int] = {}
    slots_max: dict[str, int] = {}
    try:
        state = spellcasting_service.slot_state(db, pc.id, dm_email)
        slots = {lvl: int(s.remaining) for lvl, s in state.levels.items() if s.max > 0}
        slots_max = {lvl: int(s.max) for lvl, s in state.levels.items() if s.max > 0}
    except Exception:  # noqa: BLE001 — non-casters and odd sheets simply have no slots
        slots = {}
    martial = (6 if pc.level < 5 else 8) if cls == "monk" else 0
    attacks = _weapon_attacks(db, pc)
    if not attacks or cls == "monk":
        attacks.insert(0, _unarmed(pc, mods, martial))
    spells, reactions = _spell_attacks(db, pc, dm_email, stats, mods)
    attacks += spells
    personal = entitlement_service.personal_content_allowed(dm_email)
    extra_attacks, extra_feats = _class_extras(pc, mods, prof, personal, stats)
    attacks += extra_attacks
    species_attacks, species_feats = _species_extras(pc, mods, prof)
    attacks += species_attacks
    extra_feats += species_feats
    features = _pc_features(db, pc, dm_email, personal) + extra_feats
    sorcery = pc.level if cls == "sorcerer" and pc.level >= 2 else 0
    sorcery_max = sorcery
    for row in feature_service.list_for_character(db, pc.id, dm_email):
        if (row.feature_name or "").strip().lower() == "sorcery points":
            sorcery = max(0, (row.max_uses or 0) - (row.uses_spent or 0))
            sorcery_max = max(sorcery_max, row.max_uses or 0)
    feats = _feats(pc) + [f"reaction:{r}" for r in reactions]
    return ArenaPc(
        name=pc.character_name,
        ac=pc.ac,
        hp=max(1, pc.hp_current),
        hp_max=pc.hp_max,
        dex_mod=mods["dex"],
        level=pc.level,
        character_class=getattr(pc.character_class, "value", str(pc.character_class)),
        subclass=pc.subclass or "",
        feats=feats,
        attacks=attacks,
        features=features,
        slots=slots,
        slots_max=slots_max,
        attacks_per_action=2 if cls in _MARTIAL and pc.level >= 5 else 1,
        prof=prof,
        mods=mods,
        spell_mod=pc_spell_mod(stats, mods) if stats.get("attack_bonus") is not None else 0,
        spell_dc=stats.get("save_dc"),
        spell_attack=stats.get("attack_bonus"),
        sneak_dice=(pc.level + 1) // 2 if cls == "rogue" else 0,
        martial_die=martial,
        focus=pc.level if cls == "monk" and pc.level >= 2 else 0,
        sorcery=sorcery,
        sorcery_max=sorcery_max,
        ac_bonus=1 if _has_style(pc, "defense") else 0,
        metamagic=_metamagic(pc),
        wild_magic=bool(personal and cls == "sorcerer" and "wild" in (pc.subclass or "").lower()),
    )


# ── Foe catalog ──────────────────────────────────────────────────────────────


def _cr_band(level: int) -> tuple[float, float]:
    """The CR range that makes a fair one-on-one at this level."""
    if level <= 1:
        return (0.0, 0.5)
    if level == 2:
        return (0.25, 1.0)
    if level <= 4:
        return (0.5, 2.0)
    if level <= 6:
        return (1.0, 3.0)
    if level <= 8:
        return (2.0, 5.0)
    if level <= 10:
        return (3.0, 7.0)
    return (level / 2.5, float(level))


def _dm_email_for(db: Session, pc: PlayerCharacter) -> str:
    """The owning DM's email, so the sheet services' ownership checks pass."""
    from db.repos.campaign_repo import CampaignRepo

    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        raise ValueError("This character's campaign is gone.")
    return campaign.dm_email


def _pc_or_raise(db: Session, pc_id: uuid.UUID) -> PlayerCharacter:
    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        raise ValueError(f"Character {pc_id} not found.")
    return pc


def _option(m: Any, suggested: bool, tier: str) -> ArenaFoeOption:
    return ArenaFoeOption(
        id=m.id,
        name=m.name,
        cr=m.challenge_rating,
        ac=m.ac,
        hp_average=m.hp_average,
        creature_type=getattr(m.creature_type, "value", str(m.creature_type)),
        suggested=suggested,
        tier=tier,
        image_url=m.image_url,
    )


def list_foes(db: Session, pc_id: uuid.UUID) -> list[ArenaFoeOption]:
    """The catalog foes a player may spar with, flagged when they fit the level.

    Args:
        db: Active database session.
        pc_id: UUID of the player character.

    Returns:
        Catalog (non-custom) monsters sorted by CR then name.
    """
    pc = _pc_or_raise(db, pc_id)
    lo, hi = _cr_band(pc.level)
    rows = []
    for m in MonsterRepo.list_all(db, is_custom=False):
        v = cr_value(m.challenge_rating)
        if v > max(hi * 3, 5.0):
            continue
        tier = (
            "fits" if lo <= v <= hi else "easy" if v < lo else "tough" if v <= hi * 2 else "deadly"
        )
        rows.append(_option(m, lo <= v <= hi, tier))
    rows.sort(key=lambda r: (cr_value(r.cr), r.name))
    return rows


def _beast_cap(level: int) -> float:
    return 0.25 if level < 4 else 0.5 if level < 8 else 1.0


def list_beasts(db: Session, pc_id: uuid.UUID) -> list[ArenaFoeOption]:
    """Wild Shape forms: catalog beasts within the druid's CR cap (Plan 87).

    Args:
        db: Active database session.
        pc_id: UUID of the player character.

    Returns:
        Beasts the druid may become, strongest first.
    """
    pc = _pc_or_raise(db, pc_id)
    cap = _beast_cap(pc.level)
    rows = []
    for m in MonsterRepo.list_all(db, is_custom=False):
        ctype = getattr(m.creature_type, "value", str(m.creature_type)).lower()
        if ctype != "beast" or cr_value(m.challenge_rating) > cap:
            continue
        rows.append(_option(m, True, "fits"))
    rows.sort(key=lambda r: (-cr_value(r.cr), r.name))
    return rows


# ── The fight ────────────────────────────────────────────────────────────────


def _log(state: ArenaState, who: str, text: str, dice: Optional[str] = None, **kw: Any) -> None:
    """Append one line to the fight log."""
    line = ArenaLogLine(round=state.round, who=who, text=text, dice=dice, **kw)  # type: ignore
    state.log.append(line)


def _pc_ac(state: ArenaState) -> int:
    pc = state.pc
    base = pc.beast.ac if pc.beast else pc.ac + pc.ac_bonus
    return base + (2 if state.faith else 0) + (2 if "shield2" in state.effects else 0)


def start(db: Session, pc_id: uuid.UUID, monster_id: Optional[uuid.UUID] = None) -> ArenaState:
    """Begin a fight: snapshot the sheet, pick the foe, roll initiative.

    Args:
        db: Active database session.
        pc_id: UUID of the player character.
        monster_id: A specific catalog foe, or None for a random one that fits.

    Returns:
        The opening ArenaState (the foe may already have acted if it won initiative).

    Raises:
        ValueError: Unknown character, unknown foe, or an empty catalog.
    """
    pc = _pc_or_raise(db, pc_id)
    dm_email = _dm_email_for(db, pc)
    if monster_id is not None:
        monster = MonsterRepo.get_by_id(db, monster_id)
        if monster is None:
            raise ValueError("That foe isn't in the catalog.")
    else:
        lo, hi = _cr_band(pc.level)
        pool = [
            m
            for m in MonsterRepo.list_all(db, is_custom=False)
            if lo <= cr_value(m.challenge_rating) <= hi
        ]
        if not pool:
            pool = MonsterRepo.list_all(db, is_custom=False)
        if not pool:
            raise ValueError("The monster catalog is empty — ask your DM.")
        monster = _RNG.choice(pool)
    state = ArenaState(
        pc_id=pc.id,
        pc=_build_pc(db, pc, dm_email),
        foe=_foe_from_monster(monster),
        stats=ArenaStats(),
    )
    _log(
        state,
        "ref",
        f"{state.foe.name} (AC {state.foe.ac}, {state.foe.hp} HP) squares up. "
        "Practice only: nothing here touches your sheet.",
    )
    you, yt = d20()
    them, tt = d20()
    you_total = you + state.pc.dex_mod
    them_total = them + state.foe.dex_mod
    first = you_total > them_total or (
        you_total == them_total and state.pc.dex_mod >= state.foe.dex_mod
    )
    _log(
        state,
        "ref",
        f"Initiative: you {you_total}, {state.foe.name} {them_total}. "
        + ("You go first." if first else f"{state.foe.name} goes first."),
        dice=f"you {yt}{state.pc.dex_mod:+d} · foe {tt}{state.foe.dex_mod:+d}",
    )
    if not first:
        _foe_turn(state)
    state.tips = _tips(state)
    return _seal(state)


def _action_free(state: ArenaState) -> Optional[str]:
    """Why the player can't take an action right now, or None."""
    if state.phase != "your_turn":
        return "The fight is over."
    if state.action_used and not state.extra_action:
        return "You've used your action this turn. End the turn, or use a bonus action."
    return None


def _spend_action(state: ArenaState) -> None:
    if state.action_used and state.extra_action:
        state.extra_action = False
    else:
        state.action_used = True


def _spend_bonus(state: ArenaState) -> None:
    if state.bonus_used:
        raise ValueError("You've used your bonus action this turn.")
    state.bonus_used = True


# Plan 89 — Font of Magic (2024): sorcery points → a slot, and the sorcerer level it needs.
_FONT_COST = {1: 2, 2: 3, 3: 5, 4: 6, 5: 7}
_FONT_MIN_LEVEL = {1: 2, 2: 3, 3: 5, 4: 7, 5: 9}
# Upcast rules the catalog text doesn't state cleanly enough to parse.
_UPCAST_BY_NAME = {
    "cure wounds": "2d8",
    "healing word": "2d4",
    "guiding bolt": "1d6",
    "magic missile": "count",
    "scorching ray": "count",
    "searing smite": "1d6",
    "ensnaring strike": "1d6",
}
_UPCAST_DIE_RE = re.compile(r"increases by (\d+d\d+) for each spell slot level above", re.I)
_UPCAST_COUNT_RE = re.compile(r"one (?:more|additional) (?:dart|ray|beam)", re.I)


def _parse_upcast(text: str) -> str:
    """The per-level scaling a spell's "higher levels" text describes, or ""."""
    m = _UPCAST_DIE_RE.search(text or "")
    if m:
        return m.group(1)
    if _UPCAST_COUNT_RE.search(text or ""):
        return "count"
    return ""


def _upcast_expr(expr: str, upcast: str, extra: int) -> str:
    """``2d8+3`` with ``2d8`` per level, two levels up → ``6d8+3`` (same die size only)."""
    if extra <= 0 or not upcast or upcast == "count":
        return expr
    base = _DICE_RE.search(expr or "")
    up = _DICE_RE.search(upcast)
    if not base or not up or base.group(2) != up.group(2):
        return expr
    count = int(base.group(1)) + int(up.group(1)) * extra
    return f"{count}d{base.group(2)}" + (base.group(3) or "").replace(" ", "")


def _has_slot(pc: ArenaPc, level: int = 1) -> bool:
    """Any slot of ``level`` or higher left (pact slots count)."""
    return any(int(lvl) >= level and n > 0 for lvl, n in pc.slots.items())


def _spend_slot(state: ArenaState, level: int) -> int:
    """Spend a slot of ``level`` or the lowest higher one (pact slots); returns the level spent."""
    for lvl in sorted(state.pc.slots, key=int):
        if int(lvl) >= level and state.pc.slots[lvl] > 0:
            state.pc.slots[lvl] -= 1
            state.stats.slots_spent += 1
            return int(lvl)
    raise ValueError(f"No level-{level} slots left.")


def _foe_has(state: ArenaState, cond: str) -> bool:
    return cond in state.foe.conditions


def _foe_add(state: ArenaState, cond: str) -> None:
    if cond not in state.foe.conditions:
        state.foe.conditions.append(cond)


def _foe_clear(state: ArenaState, cond: str) -> None:
    state.foe.conditions = [c for c in state.foe.conditions if c != cond]


def _melee_bonus(state: ArenaState, attack: ArenaAttack) -> int:
    return 2 if state.pc.raging and attack.kind in ("weapon", "unarmed") and attack.melee else 0


def _player_mode(state: ArenaState, attack: ArenaAttack) -> Optional[str]:
    """Advantage for your attack right now."""
    weaponish = attack.kind in ("weapon", "unarmed")
    adv = state.adv_next or (state.reckless and attack.melee and weaponish)
    adv = adv or _foe_has(state, "asleep") or _foe_has(state, "stunned")
    adv = adv or _foe_has(state, "restrained") or (_foe_has(state, "prone") and attack.melee)
    adv = adv or (state.innate_sorcery > 0 and attack.kind in ("cantrip", "spell"))
    adv = adv or _foe_has(state, "faerie fire") or "invisible" in state.effects
    adv = adv or "radiance" in state.effects
    dis = _foe_has(state, "prone") and not attack.melee
    dis = dis or "frightened" in state.effects or "fog" in state.effects
    dis = dis or "poisoned" in state.effects
    return _mode(adv, dis)


def _damage_dealt(state: ArenaState, dmg: int) -> None:
    foe = state.foe
    foe.hp = max(0, foe.hp - dmg)
    state.stats.dealt += dmg
    if dmg > 0 and _foe_has(state, "asleep"):
        _foe_clear(state, "asleep")
        _log(state, "ref", f"{foe.name} jolts awake.")
    if dmg > 0 and _foe_has(state, "charmed"):
        _foe_clear(state, "charmed")
        _log(state, "ref", f"{foe.name} snaps out of the charm.")


def _attack_roll(
    state: ArenaState, attack: ArenaAttack, hit_bonus: int, mode: Optional[str]
) -> tuple[bool, bool, int, str]:
    """One d20 vs the foe's AC, with Bless. Returns (hit, crit, total, dice text)."""
    nat, dtxt = d20(mode)
    bless = 0
    btxt = ""
    if state.blessed:
        bless, raw = roll_expr("1d4")
        btxt = f" + Bless {raw}"
    total = nat + hit_bonus + bless
    crit = nat == 20 or (_foe_has(state, "asleep") and attack.melee and nat != 1)
    hit = crit or (nat != 1 and total >= state.foe.ac)
    pc = state.pc
    if (
        not hit
        and attack.kind in ("cantrip", "spell")
        and "seeking spell" in pc.metamagic
        and pc.sorcery >= 1
    ):
        # Plan 88 — Seeking Spell: one sorcery point to reroll a missed spell attack.
        pc.sorcery -= 1
        nat2, dtxt2 = d20(mode)
        total = nat2 + hit_bonus + bless
        crit = nat2 == 20
        hit = crit or (nat2 != 1 and total >= state.foe.ac)
        return (
            hit,
            crit,
            total,
            f"{dtxt} → Seeking Spell reroll {dtxt2}{hit_bonus:+d}{btxt} = {total}",
        )
    return hit, crit, total, f"{dtxt}{hit_bonus:+d}{btxt} = {total}"


def _rider_dice(
    state: ArenaState, attack: ArenaAttack, crit: bool, mode: Optional[str]
) -> tuple[int, list[str]]:
    """Once-per-turn and per-hit extras: Sneak Attack, marks, rage."""
    pc = state.pc
    extra = 0
    notes: list[str] = []
    weaponish = attack.kind in ("weapon", "unarmed")
    if pc.sneak_dice and weaponish and attack.finesse and not state.sneak_used and mode == "adv":
        n, t = roll_expr(f"{pc.sneak_dice}d6", crit=crit)
        extra += n
        state.sneak_used = True
        notes.append(f"Sneak Attack {t}")
    if state.marks and (weaponish or attack.hit_bonus is not None):
        n, t = roll_expr("1d6", crit=crit)
        extra += n
        notes.append(f"{state.marks[0]} {t}")
    rb = _melee_bonus(state, attack)
    if rb:
        extra += rb
        notes.append("+2 rage")
    return extra, notes


def _resolve_rider(state: ArenaState, attack: ArenaAttack, slot_level: Optional[int]) -> None:
    """Riders that need a melee hit this turn: smites, Stunning Strike."""
    foe, pc = state.foe, state.pc
    if not state.melee_hit_this_turn:
        raise ValueError(f"{attack.name} needs a melee hit first this turn.")
    if attack.effect == "divine_smite":
        lvl = slot_level or 1
        _spend_slot(state, lvl)
        dmg, btxt = roll_expr(f"{2 + (lvl - 1)}d8")
        if foe.creature_type.lower() in _HEAVY_HITTERS:
            more, mtxt = roll_expr("1d8")
            dmg += more
            btxt += f" + {mtxt} (vs {foe.creature_type.lower()})"
        _damage_dealt(state, dmg)
        _log(
            state,
            "you",
            f"Divine Smite (level {lvl} slot): {dmg} radiant. "
            f"{foe.name} is at {foe.hp}/{foe.hp_max}.",
            dice=btxt,
            hit=True,
        )
        return
    if attack.effect == "ensnaring":
        lvl = _spend_slot(state, slot_level or 1)
        nat, dtxt = d20()
        mod = foe.saves.get("str", 0)
        dc = pc.spell_dc or 10
        if nat + mod >= dc:
            _log(
                state,
                "you",
                f"Ensnaring Strike: {foe.name} tears free ({nat + mod} vs DC {dc}).",
                dice=f"foe {dtxt}{mod:+d}",
                hit=False,
            )
        else:
            dmg, btxt = roll_expr(f"{lvl}d6")
            _damage_dealt(state, dmg)
            _foe_add(state, "restrained")
            _log(
                state,
                "you",
                f"Ensnaring Strike: thorny vines bind {foe.name} — Restrained, {dmg} piercing. "
                f"{foe.name} is at {foe.hp}/{foe.hp_max}.",
                dice=f"foe {dtxt}{mod:+d} · {btxt}",
                hit=True,
            )
        return
    if attack.effect == "searing_smite":
        lvl = _spend_slot(state, slot_level or 1)
        dmg, btxt = roll_expr(f"{lvl}d6")
        _damage_dealt(state, dmg)
        _log(
            state,
            "you",
            f"Searing Smite (level {lvl} slot): {dmg} fire. "
            f"{foe.name} is at {foe.hp}/{foe.hp_max}.",
            dice=btxt,
            hit=True,
        )
        return
    if attack.effect == "stunning_strike":
        if state.stun_used:
            raise ValueError("Stunning Strike is once per turn.")
        if pc.focus <= 0:
            raise ValueError("No Focus Points left.")
        pc.focus -= 1
        state.stun_used = True
        nat, dtxt = d20()
        mod = foe.saves.get("con", 0)
        total = nat + mod
        if total >= (attack.save_dc or 10):
            _log(
                state,
                "you",
                f"Stunning Strike: {foe.name} shrugs it off ({total} vs DC {attack.save_dc}).",
                dice=f"foe {dtxt}{mod:+d}",
                hit=False,
            )
        else:
            _foe_add(state, "stunned")
            _log(
                state,
                "you",
                f"Stunning Strike: {foe.name} is Stunned ({total} vs DC {attack.save_dc}) — "
                "it loses its next turn and your attacks have advantage.",
                dice=f"foe {dtxt}{mod:+d}",
                hit=True,
            )
        return
    raise ValueError("That rider isn't modeled.")


def _resolve_buff(
    state: ArenaState, attack: ArenaAttack, extra: int = 0, up_note: str = ""
) -> None:
    """Heals, concentration buffs, summons, Sleep. ``extra`` = slot levels above the spell's."""
    foe, pc = state.foe, state.pc
    if attack.effect == "heal":
        dmg, btxt = roll_expr(_upcast_expr(attack.damage, attack.upcast, extra))
        if pc.starry_form == "chalice" and attack.spell_level > 0:
            more, mtxt = roll_expr(f"1d8+{pc.mods.get('wis', 0)}")
            dmg += more
            btxt += f" + Chalice {mtxt}"
        gained = min(dmg, pc.hp_max - pc.hp)
        pc.hp += gained
        state.stats.healed += gained
        _log(
            state,
            "you",
            f"{attack.name}{up_note}: +{gained} HP. You're at {pc.hp}/{pc.hp_max}.",
            dice=btxt,
        )
    elif attack.effect == "bless":
        _concentrate(state, "Bless")
        state.blessed = True
        _log(state, "you", "Bless: +1d4 on your attack rolls while you concentrate.")
    elif attack.effect == "faith":
        _concentrate(state, "Shield of Faith")
        state.faith = True
        _log(state, "you", "Shield of Faith: +2 AC while you concentrate.")
    elif attack.effect == "mark":
        _concentrate(state, attack.name)
        state.marks = [attack.name]
        _log(state, "you", f"{attack.name}: +1d6 on every hit while you concentrate.")
    elif attack.effect == "spiritual_weapon":
        _concentrate(state, "Spiritual Weapon")
        state.spiritual_weapon = True
        _log(
            state, "you", "Spiritual Weapon floats up beside you: a bonus-action strike each turn."
        )
    elif attack.effect == "sleep":
        pool, btxt = roll_expr("5d8")
        if foe.hp <= pool and foe.creature_type.lower() not in ("undead", "construct"):
            _foe_add(state, "asleep")
            _log(
                state,
                "you",
                f"Sleep: {pool} HP of creatures — {foe.name} ({foe.hp} HP) drops. "
                "Melee hits on it are critical until it wakes.",
                dice=btxt,
                hit=True,
            )
        else:
            _log(
                state,
                "you",
                f"Sleep: {pool} HP isn't enough for {foe.name} ({foe.hp} HP).",
                dice=btxt,
                hit=False,
            )
    elif attack.effect == "faerie_fire":
        nat, dtxt = d20()
        mod = foe.saves.get("dex", 0)
        if nat + mod >= (attack.save_dc or pc.spell_dc or 10):
            _log(
                state,
                "you",
                f"Faerie Fire: {foe.name} slips the light "
                f"({nat + mod} vs DC {attack.save_dc or pc.spell_dc}).",
                dice=f"foe {dtxt}{mod:+d}",
                hit=False,
            )
        else:
            _concentrate(state, "Faerie Fire")
            _foe_add(state, "faerie fire")
            _log(
                state,
                "you",
                f"Faerie Fire: {foe.name} is outlined in light — "
                "your attacks on it have advantage while you concentrate.",
                dice=f"foe {dtxt}{mod:+d}",
                hit=True,
            )
    elif attack.effect == "charm":
        nat, dtxt = d20("adv")  # it's being fought: advantage on the save
        mod = foe.saves.get("wis", 0)
        if nat + mod >= (attack.save_dc or pc.spell_dc or 10):
            _log(
                state,
                "you",
                f"Charm Person: {foe.name} shakes it off "
                f"({nat + mod} vs DC {attack.save_dc or pc.spell_dc}).",
                dice=f"foe {dtxt}{mod:+d}",
                hit=False,
            )
        else:
            _foe_add(state, "charmed")
            _log(
                state,
                "you",
                f"Charm Person: {foe.name} is Charmed — it won't attack you until you hurt it.",
                dice=f"foe {dtxt}{mod:+d}",
                hit=True,
            )
    else:
        raise ValueError("That spell isn't modeled in a one-on-one.")


def _resolve_player_attack(
    state: ArenaState, attack: ArenaAttack, slot_level: Optional[int] = None
) -> None:
    """Attack roll or saving throw, riders, then damage — scaled to the slot spent."""
    foe, pc = state.foe, state.pc
    lvl = slot_level or attack.spell_level
    extra = max(0, lvl - attack.spell_level) if attack.spell_level > 0 else 0
    up_note = f" (level {lvl} slot)" if extra else ""
    if attack.after_melee_hit:
        _resolve_rider(state, attack, slot_level)
        return
    if attack.kind in ("heal", "buff"):
        _resolve_buff(state, attack, extra, up_note)
        return
    gwf = (
        attack.two_handed
        and attack.kind == "weapon"
        and any("great weapon" in f.lower() for f in pc.feats)
    )
    if attack.hit_bonus is not None:
        shots = 3 + extra if attack.effect == "scorching_ray" else 1
        per = _upcast_expr(attack.damage, attack.upcast, extra)
        if attack.effect == "eldritch_blast" and "×" in attack.damage:
            n, per = attack.damage.split("×", 1)
            shots = int(n)
        for _ in range(shots):
            mode = _player_mode(state, attack)
            hit, crit, total, dtxt = _attack_roll(state, attack, attack.hit_bonus, mode)
            if not hit:
                state.stats.misses += 1
                _log(
                    state,
                    "you",
                    f"{attack.name}{up_note}: {total} vs AC {foe.ac} — miss.",
                    dice=dtxt,
                    hit=False,
                )
                continue
            dmg, btxt = roll_expr(per, crit=crit, gwf=gwf)
            if "maximize_next" in state.effects and attack.kind in ("cantrip", "spell"):
                dmg = _max_of(per, crit)
                btxt += f" → maximized {dmg}"
                state.effects.pop("maximize_next", None)
            if attack.effect == "sorcerous_burst":
                boom, ttxt = _burst_extra(per, crit, pc.mods.get("cha", 0))
                dmg += boom
                if boom:
                    btxt += f" · burst {ttxt}"
            if "vuln_piercing" in state.effects and attack.damage_type == "piercing":
                dmg *= 2
            extra, notes = _rider_dice(state, attack, crit, mode)
            dmg += extra
            state.stats.hits += 1
            state.stats.crits += int(crit)
            state.hit_this_turn = True
            if attack.melee and attack.kind in ("weapon", "unarmed"):
                state.melee_hit_this_turn = True
            _damage_dealt(state, dmg)
            if attack.effect == "guiding_bolt":
                state.adv_next = True
                notes.append("advantage on your next attack")
            elif state.adv_next:
                state.adv_next = False
            _log(
                state,
                "you",
                f"{attack.name}{up_note}: {'CRITICAL HIT' if crit else 'hit'} for {dmg} "
                f"{attack.damage_type}. "
                f"{foe.name} is at {foe.hp}/{foe.hp_max}.",
                dice=f"{dtxt} vs AC {foe.ac} · {btxt}"
                + (" · " + ", ".join(notes) if notes else ""),
                hit=True,
                crit=crit,
            )
        return
    per = _upcast_expr(attack.damage, attack.upcast, extra)
    if attack.effect == "magic_missile" and extra:
        darts = 3 + extra
        per = f"{darts}d4+{darts}"
    dmg, btxt = roll_expr(per)
    if attack.save_ability and attack.save_dc:
        nat, dtxt = d20("dis" if state.effects.pop("foe_disadv_save", None) else None)
        mod = foe.saves.get(attack.save_ability, 0)
        total = nat + mod
        dc = attack.save_dc + (1 if state.innate_sorcery > 0 else 0)
        saved = total >= dc
        if saved:
            dmg = dmg // 2 if attack.half_on_save else 0
        elif attack.effect == "mockery":
            state.foe_disadv_next = True
        elif attack.effect == "command":
            _foe_add(state, "prone")
            _log(state, "you", f"Command — Grovel: {foe.name} drops Prone until its turn.")
        _damage_dealt(state, dmg)
        state.stats.hits += int(not saved)
        state.stats.misses += int(saved and dmg == 0)
        _log(
            state,
            "you",
            f"{attack.name}{up_note}: {foe.name} {'saves' if saved else 'fails'} "
            f"({total} vs DC {dc}) — "
            f"{dmg} {attack.damage_type}. {foe.name} is at {foe.hp}/{foe.hp_max}."
            + (
                " Its next attack is at disadvantage."
                if not saved and attack.effect == "mockery"
                else ""
            ),
            dice=f"foe {dtxt}{mod:+d} = {total} vs DC {dc} · {btxt}",
            hit=not saved,
        )
        return
    _damage_dealt(state, dmg)
    state.stats.hits += 1
    _log(
        state,
        "you",
        f"{attack.name}{up_note} lands for {dmg} {attack.damage_type}. "
        f"{foe.name} is at {foe.hp}/{foe.hp_max}.",
        dice=btxt,
        hit=True,
    )


def _concentrate(state: ArenaState, name: str) -> None:
    """Start concentrating; anything else you were holding drops."""
    if state.concentration and state.concentration != name:
        _log(state, "ref", f"You stop concentrating on {state.concentration}.")
        _drop_concentration(state, quiet=True)
    state.concentration = name


def _drop_concentration(state: ArenaState, quiet: bool = False) -> None:
    if not quiet and state.concentration:
        _log(state, "ref", f"Concentration on {state.concentration} is broken.")
    state.concentration = None
    state.blessed = False
    state.faith = False
    state.marks = [m for m in state.marks if m == "quicken"]
    state.spiritual_weapon = False


def _spiritual_strike(state: ArenaState) -> None:
    pc, foe = state.pc, state.foe
    probe = ArenaAttack(key="sw", name="Spiritual Weapon", kind="spell", melee=True)
    hit, crit, total, dtxt = _attack_roll(
        state, probe, pc.spell_attack or 0, _player_mode(state, probe)
    )
    if not hit:
        _log(
            state, "you", f"Spiritual Weapon: {total} vs AC {foe.ac} — miss.", dice=dtxt, hit=False
        )
        return
    dmg, btxt = roll_expr(f"1d8{pc.spell_mod:+d}", crit=crit)
    _damage_dealt(state, dmg)
    _log(
        state,
        "you",
        f"Spiritual Weapon: {'CRITICAL' if crit else 'hit'} for {dmg} force. "
        f"{foe.name} is at {foe.hp}/{foe.hp_max}.",
        dice=f"{dtxt} vs AC {foe.ac} · {btxt}",
        hit=True,
        crit=crit,
    )


def _take_damage(state: ArenaState, dmg: int) -> int:
    """Apply damage to the PC through a Wild Shape form and temp HP; returns what landed."""
    pc = state.pc
    if pc.beast:
        absorbed = min(pc.beast.temp_hp, dmg)
        pc.beast.temp_hp -= absorbed
        dmg -= absorbed
        if pc.beast.temp_hp <= 0:
            _log(state, "ref", f"Your {pc.beast.name} form gives out; you're yourself again.")
            pc.attacks = [a for a in pc.attacks if not a.key.startswith("beast-")]
            pc.beast = None
        if dmg <= 0:
            return 0
    if pc.temp_hp:
        absorbed = min(pc.temp_hp, dmg)
        pc.temp_hp -= absorbed
        dmg -= absorbed
    if "resist_all" in state.effects:
        dmg //= 2
    if "plant" in state.effects:
        dmg *= 2
    pc.hp = max(0, pc.hp - dmg)
    state.stats.taken += dmg
    if dmg > 0 and state.concentration:
        dc = max(10, dmg // 2)
        nat, dtxt = d20()
        if pc.starry_form == "dragon" and nat < 10:
            nat = 10
            dtxt += " → Dragon form 10"
        con_prof = pc.character_class.lower() in ("barbarian", "fighter", "sorcerer")
        total = nat + pc.mods.get("con", 0) + (pc.prof if con_prof else 0)
        if total < dc:
            _log(state, "ref", f"Concentration check {total} vs DC {dc}: failed.", dice=dtxt)
            _drop_concentration(state)
        else:
            _log(
                state,
                "ref",
                f"Concentration check {total} vs DC {dc}: you hold {state.concentration}.",
                dice=dtxt,
            )
    return dmg


def _reaction_reduces(
    state: ArenaState, total: int, dtype: str, dmg: int, crit: bool = False
) -> tuple[bool, int, Optional[str]]:
    """Automatic reactions when a foe's attack lands. Returns (negated, new damage, note)."""
    pc = state.pc
    if not state.auto_reactions or state.reaction_used:
        return False, dmg, None
    cls = pc.character_class.lower()
    ac = _pc_ac(state)
    # Shield: +5 AC, if that turns the hit into a miss.
    if "reaction:shield" in pc.feats and _has_slot(pc) and total < ac + 5 and not crit:
        lvl = _spend_slot(state, 1)
        state.reaction_used = True
        return True, 0, f"Shield (reaction, a level-{lvl} slot): +5 AC turns it into a miss"
    # Cutting Words: a d6 off the roll, if that turns it into a miss.
    cw = next((f for f in pc.features if f.key == "cutting_words" and f.uses_left > 0), None)
    if cw and total - 6 < ac and not crit:
        n, t = roll_expr("1d6")
        if total - n < ac:
            cw.uses_left -= 1
            state.reaction_used = True
            return True, 0, f"Cutting Words (reaction): {t} off its roll — a miss"
    # Uncanny Dodge: halve it.
    if cls == "rogue" and pc.level >= 5:
        state.reaction_used = True
        return False, dmg // 2, "Uncanny Dodge (reaction): halved"
    # Deflect Attacks (monk 3+): reduce by 1d10 + DEX + level, weapon damage only.
    if cls == "monk" and pc.level >= 3 and dtype in _WEAPON_DAMAGE:
        n, t = roll_expr(f"1d10+{pc.mods.get('dex', 0) + pc.level}")
        state.reaction_used = True
        return dmg - n <= 0, max(0, dmg - n), f"Deflect Attacks (reaction): {t} off"
    return False, dmg, None


def _hellish_rebuke(state: ArenaState) -> None:
    pc, foe = state.pc, state.foe
    if not state.auto_reactions or state.reaction_used:
        return
    if "reaction:hellish_rebuke" not in pc.feats or not _has_slot(pc):
        return
    lvl = _spend_slot(state, 1)
    state.reaction_used = True
    dmg, btxt = roll_expr(f"{1 + lvl}d10")
    nat, dtxt = d20()
    total = nat + foe.saves.get("dex", 0)
    if total >= (pc.spell_dc or 10):
        dmg //= 2
    _damage_dealt(state, dmg)
    _log(
        state,
        "you",
        f"Hellish Rebuke (reaction, level {lvl} slot): {dmg} fire. "
        f"{foe.name} is at {foe.hp}/{foe.hp_max}.",
        dice=f"foe {dtxt} vs DC {pc.spell_dc} · {btxt}",
        hit=True,
    )


def _foe_turn(state: ArenaState) -> None:
    """The foe acts (or can't), then a new round begins."""
    foe, pc = state.foe, state.pc
    if _foe_has(state, "asleep"):
        _log(state, "foe", f"{foe.name} is asleep and does nothing.")
    elif _foe_has(state, "charmed"):
        _log(state, "foe", f"{foe.name} is Charmed and won't raise a hand against you.")
    elif "astral" in state.effects:
        _log(state, "foe", f"{foe.name} swings at the place you were. You aren't there.")
    elif _foe_has(state, "stunned"):
        _log(state, "foe", f"{foe.name} is Stunned and loses its turn.")
        _foe_clear(state, "stunned")
    else:
        if _foe_has(state, "prone"):
            _foe_clear(state, "prone")
            _log(state, "foe", f"{foe.name} gets back up.")
        restrained = _foe_has(state, "restrained")
        chosen = max(foe.attacks, key=lambda a: _avg(a.damage) * a.count) if foe.attacks else None
        for atk in [chosen] if chosen else []:
            for _ in range(atk.count):
                if pc.hp <= 0:
                    break
                dis = state.dodging or state.foe_disadv_next or restrained
                dis = dis or _foe_has(state, "poisoned") or "radiance" in state.effects
                dis = dis or "fog" in state.effects or "invisible" in state.effects
                if state.effects.get("mirror", 0) > 0:
                    dis = True
                    state.effects["mirror"] -= 1
                state.foe_disadv_next = False
                nat, dtxt = d20(_mode(state.reckless, dis))
                total = nat + atk.hit_bonus
                crit = nat == 20
                ac = _pc_ac(state)
                hit = crit or (nat != 1 and total >= ac)
                if not hit:
                    _log(
                        state,
                        "foe",
                        f"{foe.name}'s {atk.name}: {total} vs your AC {ac} — miss.",
                        dice=f"{dtxt}{atk.hit_bonus:+d} = {total}",
                        hit=False,
                    )
                    continue
                dmg, btxt = roll_expr(atk.damage, crit=crit)
                dtype = (atk.damage_type or "").lower()
                note = ""
                if pc.raging and dtype in _WEAPON_DAMAGE:
                    dmg = dmg // 2
                    note = " (halved by Rage)"
                negated, dmg, rnote = _reaction_reduces(state, total, dtype, dmg, crit)
                if negated:
                    _log(
                        state,
                        "foe",
                        f"{foe.name}'s {atk.name}: {total} vs your AC {ac} — {rnote}.",
                        dice=f"{dtxt}{atk.hit_bonus:+d} = {total}",
                        hit=False,
                    )
                    continue
                if rnote:
                    note += f" · {rnote}"
                landed = _take_damage(state, dmg)
                form = f" (+{pc.beast.temp_hp} form)" if pc.beast else ""
                _log(
                    state,
                    "foe",
                    f"{foe.name}'s {atk.name}: {'CRITICAL' if crit else 'hit'} for {dmg}{note}. "
                    f"You're at {pc.hp}/{pc.hp_max}{form}.",
                    dice=f"{dtxt}{atk.hit_bonus:+d} = {total} vs AC {ac} · {btxt}",
                    hit=True,
                    crit=crit,
                )
                if landed > 0:
                    _hellish_rebuke(state)
        if restrained:
            _foe_clear(state, "restrained")
    if pc.hp <= 0:
        state.phase = "over"
        state.result = "lost"
        state.stats.rounds = state.round
        _log(
            state,
            "ref",
            "You drop to 0 HP. At a real table your friends have three failed death saves "
            "to reach you — and the foe has to choose to keep hitting. Try again with a plan.",
        )
        return
    state.round += 1
    state.action_used = False
    state.bonus_used = False
    state.extra_action = False
    state.reaction_used = False
    state.dodging = False
    state.attacks_left = 0
    state.hit_this_turn = False
    state.melee_hit_this_turn = False
    state.sneak_used = False
    state.stun_used = False
    state.reckless = False
    if state.innate_sorcery > 0:
        state.innate_sorcery -= 1
    for key in list(state.effects):
        state.effects[key] -= 1
        if state.effects[key] <= 0:
            del state.effects[key]
            if key == "starry_form":
                pc.starry_form = None
                pc.attacks = [a for a in pc.attacks if a.key != "luminous_arrow"]
    _log(state, "ref", f"Round {state.round}. Your turn.")
    if "regen5" in state.effects and pc.hp < pc.hp_max:
        gained = min(5, pc.hp_max - pc.hp)
        pc.hp += gained
        state.stats.healed += gained
        _log(state, "ref", f"The surge knits you back together: +{gained} HP.")
    if "surge_each_turn" in state.effects:
        _surge(state)


def _heal_feature(state: ArenaState, name: str, expr: str) -> None:
    pc = state.pc
    heal, btxt = roll_expr(expr)
    gained = min(heal, pc.hp_max - pc.hp)
    pc.hp += gained
    state.stats.healed += gained
    _log(state, "you", f"{name}: +{gained} HP. You're at {pc.hp}/{pc.hp_max}.", dice=btxt)


def _unarmed_of(pc: ArenaPc) -> ArenaAttack:
    strike = next((a for a in pc.attacks if a.key == "unarmed"), None)
    if strike is None:
        raise ValueError("No unarmed strike on the sheet.")
    return strike


def _feature(
    state: ArenaState,
    key: str,
    db: Session,
    beast_id: Optional[str] = None,
    slot_level: Optional[int] = None,
) -> None:
    feat = next((f for f in state.pc.features if f.key == key), None)
    if feat is None:
        raise ValueError("You don't have that feature.")
    if feat.uses_left <= 0:
        raise ValueError(f"No uses of {feat.name} left.")
    pc, foe = state.pc, state.foe
    if (
        key in ("second_wind", "lay_on_hands", "divine_spark")
        and pc.hp >= pc.hp_max
        and key != "divine_spark"
    ):
        raise ValueError("You're at full HP — save it for when it matters.")
    if key in ("flurry", "patient_defense") and pc.focus <= 0:
        raise ValueError("No Focus Points left.")
    if key == "quicken" and pc.sorcery < 2:
        raise ValueError("Quickened Spell needs 2 sorcery points.")
    if key == "martial_bonus" and not state.action_used:
        raise ValueError("Take the Attack action first.")
    if key == "wild_shape" and pc.beast:
        raise ValueError("You're already in a beast form.")
    if key == "cutting_words":
        raise ValueError("Cutting Words happens on its own when the foe would just hit you.")
    if key == "breath_weapon":
        raise ValueError("Use the Breath Weapon attack — this just counts what is left.")
    if key == "create_slot":
        lvl = slot_level or 1
        if lvl not in _FONT_COST:
            raise ValueError("Font of Magic makes slots of levels 1 to 5.")
        if pc.level < _FONT_MIN_LEVEL[lvl]:
            raise ValueError(f"A level-{lvl} slot needs sorcerer level {_FONT_MIN_LEVEL[lvl]}.")
        if pc.sorcery < _FONT_COST[lvl]:
            raise ValueError(f"A level-{lvl} slot costs {_FONT_COST[lvl]} sorcery points.")
    if key == "convert_slot":
        if pc.slots.get(str(slot_level or 0), 0) <= 0:
            raise ValueError("Pick a slot you still have.")
        if pc.sorcery >= pc.sorcery_max:
            raise ValueError("Your sorcery points are already full.")
    if feat.cost == "bonus":
        _spend_bonus(state)
    elif feat.cost == "action":
        why = _action_free(state)
        if why:
            raise ValueError(why)
        _spend_action(state)
    spend_use = key not in (
        "cunning_dodge",
        "patient_defense",
        "steady_aim",
        "flurry",
        "martial_bonus",
        "reckless",
        "quicken",
        "starry_archer",
        "starry_chalice",
        "starry_dragon",
    )
    if key == "second_wind":
        _heal_feature(state, "Second Wind", f"1d10+{pc.level}")
    elif key == "action_surge":
        state.extra_action = True
        _log(state, "you", "Action Surge: you have a second action this turn.")
    elif key == "rage":
        pc.raging = True
        _log(state, "you", "You rage: +2 melee damage, and weapon hits against you are halved.")
    elif key in ("cunning_dodge", "patient_defense"):
        if key == "patient_defense":
            pc.focus -= 1
        state.dodging = True
        _log(
            state, "you", f"{feat.name}: the foe attacks you at disadvantage until your next turn."
        )
    elif key == "steady_aim":
        state.adv_next = True
        _log(state, "you", "Steady Aim: advantage on your next attack this turn.")
    elif key == "lay_on_hands":
        _heal_feature(state, "Lay on Hands", "5")
    elif key == "flurry":
        pc.focus -= 1
        strike = _unarmed_of(pc)
        for _ in range(2):
            _resolve_player_attack(state, strike)
    elif key == "martial_bonus":
        _resolve_player_attack(state, _unarmed_of(pc))
    elif key == "reckless":
        state.reckless = True
        _log(
            state,
            "you",
            "Reckless Attack: advantage on your melee attacks this turn — "
            "and the foe gets it back on you.",
        )
    elif key == "tides_of_chaos":
        state.adv_next = True
        state.tides_primed = True
        _log(
            state,
            "you",
            "Tides of Chaos: advantage on your next attack. "
            "The weave frays — your next leveled spell will surge.",
        )
    elif key in ("starry_archer", "starry_chalice", "starry_dragon"):
        ws = next((f for f in pc.features if f.key == "wild_shape" and f.uses_left > 0), None)
        if ws is None:
            raise ValueError("Starry Form needs a Wild Shape use.")
        ws.uses_left -= 1
        spend_use = False
        form = key.split("_", 1)[1]
        pc.starry_form = form
        state.effects["starry_form"] = 10
        pc.attacks = [a for a in pc.attacks if a.key != "luminous_arrow"]
        if form == "archer":
            pc.attacks.append(
                ArenaAttack(
                    key="luminous_arrow",
                    name="Luminous Arrow",
                    kind="spell",
                    cost="bonus",
                    hit_bonus=pc.spell_attack or 0,
                    damage=f"1d8+{pc.mods.get('wis', 0)}",
                    damage_type="radiant",
                    melee=False,
                    note="Starry Form: Archer — a bonus action each turn",
                )
            )
        _log(
            state,
            "you",
            f"Starry Form — {form.title()}: "
            "constellations trace your skin for the rest of the fight.",
        )
    elif key == "create_slot":
        lvl = slot_level or 1
        pc.sorcery -= _FONT_COST[lvl]
        pc.slots[str(lvl)] = pc.slots.get(str(lvl), 0) + 1
        pc.slots_max[str(lvl)] = pc.slots_max.get(str(lvl), 0) + 1
        _log(
            state,
            "you",
            f"Font of Magic: {_FONT_COST[lvl]} sorcery points become a level-{lvl} slot "
            f"({pc.sorcery}/{pc.sorcery_max} points left).",
        )
    elif key == "convert_slot":
        lvl = slot_level or 1
        pc.slots[str(lvl)] -= 1
        gained = min(lvl, pc.sorcery_max - pc.sorcery)
        pc.sorcery += gained
        _log(
            state,
            "you",
            f"Font of Magic: a level-{lvl} slot becomes {gained} sorcery points "
            f"({pc.sorcery}/{pc.sorcery_max}).",
        )
    elif key == "innate_sorcery":
        state.innate_sorcery = 3
        _log(
            state,
            "you",
            "Innate Sorcery: +1 spell DC and advantage on spell attacks for three rounds.",
        )
    elif key == "quicken":
        pc.sorcery -= 2
        if "quicken" not in state.marks:
            state.marks.append("quicken")
        _log(state, "you", "Quickened Spell: your next spell is cast as a bonus action.")
    elif key == "divine_spark":
        if pc.hp < pc.hp_max:
            _heal_feature(state, "Divine Spark", f"1d8+{pc.spell_mod}")
        else:
            dmg, btxt = roll_expr(f"1d8+{pc.spell_mod}")
            nat, dtxt = d20()
            total = nat + foe.saves.get("con", 0)
            if total >= (pc.spell_dc or 10):
                dmg //= 2
            _damage_dealt(state, dmg)
            _log(
                state,
                "you",
                f"Divine Spark: {dmg} radiant. {foe.name} is at {foe.hp}/{foe.hp_max}.",
                dice=f"foe {dtxt} vs DC {pc.spell_dc} · {btxt}",
                hit=True,
            )
    elif key == "natures_wrath":
        dc = pc.spell_dc or (8 + pc.prof + pc.mods.get("cha", 0))
        nat, dtxt = d20()
        total = nat + foe.saves.get("str", 0)
        if total >= dc:
            _log(
                state,
                "you",
                f"Nature's Wrath: {foe.name} tears free ({total} vs DC {dc}).",
                dice=f"foe {dtxt}",
                hit=False,
            )
        else:
            _foe_add(state, "restrained")
            _log(
                state,
                "you",
                f"Nature's Wrath: vines pin {foe.name} — Restrained for a round "
                "(your attacks have advantage, its attacks disadvantage).",
                dice=f"foe {dtxt}",
                hit=True,
            )
    elif key == "hunters_mark_free":
        _concentrate(state, "Hunter's Mark")
        state.marks = ["Hunter's Mark"] + [m for m in state.marks if m == "quicken"]
        _log(state, "you", "Hunter's Mark: +1d6 on every hit while you concentrate.")
    elif key == "wild_shape":
        if not beast_id:
            raise ValueError("Pick a beast.")
        monster = MonsterRepo.get_by_id(db, uuid.UUID(beast_id))
        if monster is None:
            raise ValueError("That beast isn't in the catalog.")
        if cr_value(monster.challenge_rating) > _beast_cap(pc.level):
            raise ValueError("That beast is above your Wild Shape's CR.")
        pc.beast = ArenaBeast(
            name=monster.name,
            ac=monster.ac,
            temp_hp=pc.level,
            attacks=parse_foe_attacks(monster.actions),
        )
        for i, a in enumerate(pc.beast.attacks):
            pc.attacks.append(
                ArenaAttack(
                    key=f"beast-{i}",
                    name=f"{monster.name}: {a.name}",
                    kind="weapon",
                    hit_bonus=a.hit_bonus,
                    damage=a.damage,
                    damage_type=a.damage_type or "piercing",
                    melee=True,
                    note=f"{monster.name} form" + (f" ×{a.count}" if a.count > 1 else ""),
                )
            )
        _log(
            state,
            "you",
            f"Wild Shape: you become a {monster.name} "
            f"(AC {monster.ac}, {pc.level} temporary HP over your own).",
        )
    else:
        raise ValueError("That feature isn't modeled yet.")
    if spend_use:
        feat.uses_left -= 1


def _tips(state: ArenaState) -> list[str]:
    """Templated coaching: the things a new player forgets, at the moment they matter."""
    if state.phase == "over":
        s = state.stats
        out = [
            f"{s.rounds} round{'s' if s.rounds != 1 else ''}: {s.dealt} dealt, {s.taken} taken, "
            f"{s.hits} hit{'s' if s.hits != 1 else ''} / "
            f"{s.misses} miss{'es' if s.misses != 1 else ''}."
        ]
        if state.result == "lost" and any(
            f.key in ("second_wind", "lay_on_hands") and f.uses_left > 0 for f in state.pc.features
        ):
            out.append(
                "You went down with healing unused. "
                "A bonus-action heal at half HP is usually worth it."
            )
        if state.result == "lost" and any(v > 0 for v in state.pc.slots.values()):
            out.append("You still had spell slots. A slot you die holding is a slot wasted.")
        if state.result == "won" and s.crits:
            out.append("A critical hit doubles the dice, never the modifier. You saw that happen.")
        return out[:3]
    pc = state.pc
    keys = {f.key for f in pc.features if f.uses_left > 0}
    has_slots = any(v > 0 for v in pc.slots.values())
    out: list[str] = []
    low = pc.hp <= pc.hp_max // 2
    if (
        state.melee_hit_this_turn
        and not state.bonus_used
        and any(a.effect == "divine_smite" for a in pc.attacks)
        and has_slots
    ):
        out.append("You hit in melee: Divine Smite is a bonus action now — pick the slot.")
    if pc.sneak_dice and not state.adv_next and "steady_aim" in keys and not state.bonus_used:
        out.append("Sneak Attack needs advantage: Steady Aim (bonus action) gives it to you.")
    if low and not state.bonus_used and "second_wind" in keys:
        out.append("Under half HP with a bonus action free: Second Wind heals 1d10 + your level.")
    if low and not state.bonus_used and "lay_on_hands" in keys:
        out.append("Lay on Hands is a bonus action in 2024: 5 HP now, no slot.")
    if (
        low
        and not state.bonus_used
        and any(a.effect == "heal" and a.cost == "bonus" for a in pc.attacks)
    ):
        out.append("Healing Word is a bonus action: heal and still attack.")
    if not state.action_used and "action_surge" in keys and state.foe.hp <= state.foe.hp_max // 3:
        out.append("The foe is nearly down: Action Surge gives you a second action to finish it.")
    if not state.action_used and not pc.raging and "rage" in keys:
        out.append("Rage is a bonus action: do it before you attack, not after.")
    if "flurry" in keys and not state.bonus_used and state.action_used and pc.focus > 0:
        out.append("Flurry of Blows: two more strikes for one Focus Point.")
    if not state.marks and any(a.effect == "mark" for a in pc.attacks) and not state.bonus_used:
        out.append("Mark first (bonus action), then hit: every hit gets +1d6.")
    if any(a.kind == "cantrip" for a in pc.attacks) and has_slots:
        out.append(
            "Cantrips never run out. "
            "Spend a slot when it changes the fight, not on round one out of habit."
        )
    if pc.hp <= pc.hp_max // 4 and not state.action_used:
        out.append("Very low? Dodge: every attack on you has disadvantage until your next turn.")
    if "create_slot" in keys and not state.bonus_used and pc.sorcery >= 2 and not _has_slot(pc):
        out.append(
            "Out of slots with sorcery points left: Font of Magic makes a level-1 slot for 2."
        )
    if state.tides_primed:
        out.append("Tides of Chaos is primed: your next leveled spell surges — plan for it.")
    if pc.starry_form == "archer" and not state.bonus_used:
        out.append("Archer form: the Luminous Arrow is a free bonus action every turn.")
    if state.round == 1 and not out:
        out.append(
            "One action, one bonus action, one move per turn. "
            "The buttons grey out as you spend them."
        )
    return out[:3]


def act(db: Session, state: ArenaState, action: ArenaAction) -> ArenaState:
    """Apply one player action to the state and, on end of turn, run the foe's.

    Args:
        db: Active database session (the character must still exist).
        state: The fight as the phone holds it.
        action: What the player chose.

    Returns:
        The updated state.

    Raises:
        ValueError: Illegal action for the current state (the text is for the player).
    """
    _pc_or_raise(db, state.pc_id)
    _check_seal(state)
    if state.phase == "over":
        raise ValueError("The fight is over — start another.")
    # Work on a copy: a refused action must leave the sealed state untouched.
    state = state.model_copy(deep=True)
    kind = action.kind
    if kind in ("attack", "cast"):
        attack = next((a for a in state.pc.attacks if a.key == action.key), None)
        if attack is None:
            raise ValueError("That attack isn't on your sheet.")
        swing = attack.kind in ("weapon", "unarmed") and attack.cost == "action"
        quickened = "quicken" in state.marks and attack.kind in ("cantrip", "spell")
        surged_bonus = "bonus_casting" in state.effects and attack.kind in ("cantrip", "spell")
        cost = "bonus" if (quickened or surged_bonus) and attack.cost == "action" else attack.cost
        if attack.key == "breath_weapon":
            breath = next((f for f in state.pc.features if f.key == "breath_weapon"), None)
            if breath is None or breath.uses_left <= 0:
                raise ValueError("No Breath Weapon uses left today.")
            breath.uses_left -= 1
        if attack.key == "star_bolt":
            star = next((f for f in state.pc.features if f.key == "star_map"), None)
            if star is None or star.uses_left <= 0:
                raise ValueError("No Star Map uses left today.")
            star.uses_left -= 1
        leveled = attack.spell_level > 0 and attack.kind in ("spell", "heal", "buff")
        if attack.after_melee_hit:
            if attack.cost == "bonus":
                _spend_bonus(state)
            _resolve_player_attack(state, attack, action.slot_level)
        elif cost == "bonus":
            if attack.effect == "offhand_blade" and not state.action_used:
                raise ValueError(
                    "Swing or throw the first blade with your action, then the second."
                )
            _spend_bonus(state)
            if quickened:
                state.marks = [m for m in state.marks if m != "quicken"]
            spent = None
            if leveled:
                spent = _spend_slot(state, action.slot_level or attack.spell_level)
            _resolve_player_attack(state, attack, spent)
        elif swing and state.attacks_left > 0:
            state.attacks_left -= 1
            _resolve_player_attack(state, attack)
        else:
            why = _action_free(state)
            if why:
                raise ValueError(why)
            spent = None
            if leveled:
                spent = _spend_slot(state, action.slot_level or attack.spell_level)
            _spend_action(state)
            state.attacks_left = state.pc.attacks_per_action - 1 if swing else 0
            _resolve_player_attack(state, attack, spent)
        if "invisible" in state.effects:
            state.effects.pop("invisible", None)
        if leveled or (attack.after_melee_hit and attack.spell_level > 0):
            _wild_magic_check(state)
    elif kind == "dodge":
        why = _action_free(state)
        if why:
            raise ValueError(why)
        _spend_action(state)
        state.dodging = True
        _log(state, "you", "You Dodge: attacks against you have disadvantage until your next turn.")
    elif kind == "feature":
        _feature(state, action.key or "", db, slot_level=action.slot_level)
    elif kind == "reckless":
        _feature(state, "reckless", db)
    elif kind == "wild_shape":
        _feature(state, "wild_shape", db, beast_id=action.key)
    elif kind == "toggle_reactions":
        state.auto_reactions = not state.auto_reactions
        _log(state, "ref", "Automatic reactions " + ("on." if state.auto_reactions else "off."))
    elif kind == "flee":
        state.phase = "over"
        state.result = "fled"
        state.stats.rounds = state.round
        _log(
            state,
            "ref",
            "You back out of the ring. No shame in it — knowing when to run is a skill too.",
        )
    elif kind == "end_turn":
        if state.spiritual_weapon and not state.bonus_used:
            _spiritual_strike(state)
        _foe_turn(state)
    if state.phase != "over" and state.foe.hp <= 0:
        state.phase = "over"
        state.result = "won"
        state.stats.rounds = state.round
        _log(state, "ref", f"{state.foe.name} goes down. Well fought.")
    state.tips = _tips(state)
    return _seal(state)


# ── Plan 88 — surges and bursts ──────────────────────────────────────────────


def _max_of(expr: str, crit: bool) -> int:
    """The maximum a dice expression can roll (a maximized surge)."""
    m = _DICE_RE.search(expr or "")
    if not m:
        try:
            return int(expr)
        except (TypeError, ValueError):
            return 0
    count = int(m.group(1)) * (2 if crit else 1)
    mod = int((m.group(3) or "0").replace(" ", ""))
    return count * int(m.group(2)) + mod


def _burst_extra(expr: str, crit: bool, cha_mod: int) -> tuple[int, str]:
    """Sorcerous Burst: an 8 explodes into another d8, up to your CHA modifier times."""
    m = _DICE_RE.search(expr or "")
    if not m or int(m.group(2)) != 8:
        return 0, ""
    extra = 0
    rolled: list[int] = []
    # The base dice already rolled; approximate the explosions by rolling the
    # same count again only when the referee's die shows an 8.
    count = int(m.group(1)) * (2 if crit else 1)
    for _ in range(count):
        chain = 0
        probe = _RNG.randint(1, 8)
        while probe == 8 and chain < max(0, cha_mod):
            more = _RNG.randint(1, 8)
            rolled.append(more)
            extra += more
            chain += 1
            probe = more
    return extra, ("[" + ", ".join(map(str, rolled)) + "]") if rolled else ""


def _wild_magic_check(state: ArenaState) -> None:
    """After a leveled spell: Tides' guaranteed surge, or a 1 on the d20."""
    if not state.pc.wild_magic:
        return
    if state.tides_primed:
        state.tides_primed = False
        tides = next((f for f in state.pc.features if f.key == "tides_of_chaos"), None)
        if tides is not None:
            tides.uses_left = max(tides.uses_left, 1)
        _log(state, "ref", "The frayed weave gives way — Tides of Chaos returns to you.")
        _surge(state)
        return
    nat, dtxt = d20()
    if nat == 1:
        _surge(state)
    else:
        _log(state, "ref", f"Wild Magic check: {nat} — the weave holds.", dice=dtxt)


def _surge(state: ArenaState) -> None:
    """Roll on the Wild Magic Surge table and apply what matters in a duel."""
    pc, foe = state.pc, state.foe
    roll = _RNG.randint(1, 100)
    text, effect, params = surge_entry(roll)
    _log(state, "ref", f"WILD MAGIC SURGE ({roll}): {text}", dice=f"d100 [{roll}]")
    timed = {
        "surge_each_turn",
        "regen5",
        "foe_disadv_save",
        "bonus_casting",
        "astral",
        "maximize_next",
        "resist_all",
        "plant",
        "invisible",
        "shield2",
        "frightened",
        "radiance",
        "vuln_piercing",
    }
    if effect in timed:
        state.effects[effect] = int(params.get("rounds", 10))
        return
    if effect == "extra_action":
        state.extra_action = True
        if not state.action_used:
            state.action_used = False
        return
    if effect == "random_spell":
        idx = _RNG.randint(1, 10)
        line, sub = RANDOM_SPELLS[idx - 1]
        _log(state, "ref", f"  … a random spell: {line}")
        if sub == "plant":
            state.effects["plant"] = 1
        elif sub == "astral":
            state.effects["astral"] = 1
        elif sub == "fog":
            state.effects["fog"] = 10
        elif sub == "mirror":
            state.effects["mirror"] = 3
        elif sub == "grease":
            nat, dtxt = d20()
            if nat + foe.saves.get("dex", 0) < (pc.spell_dc or 10):
                _foe_add(state, "prone")
                _log(state, "ref", f"  {foe.name} slips and falls Prone.", dice=f"foe {dtxt}")
        elif sub == "missiles7":
            dmg, btxt = roll_expr("7d4+7")
            _damage_dealt(state, dmg)
            _log(
                state,
                "ref",
                f"  Seven darts: {dmg} force to {foe.name} ({foe.hp}/{foe.hp_max}).",
                dice=btxt,
            )
        elif sub == "fireball_self":
            fdmg, ftxt = roll_expr("8d6")
            nat, dtxt = d20()
            if nat + foe.saves.get("dex", 0) >= (pc.spell_dc or 10):
                fdmg //= 2
            _damage_dealt(state, fdmg)
            you, ytxt = roll_expr("8d6")
            nat2, dtxt2 = d20()
            if nat2 + pc.mods.get("dex", 0) >= (pc.spell_dc or 10):
                you //= 2
            _take_damage(state, you)
            _log(
                state,
                "ref",
                f"  Fireball on your own square: {fdmg} to {foe.name} ({foe.hp}/{foe.hp_max}), "
                f"{you} to you ({pc.hp}/{pc.hp_max}).",
                dice=f"{ftxt} · you {ytxt}",
            )
        return
    if effect == "poison_random":
        if _RNG.randint(1, 2) == 1:
            _foe_add(state, "poisoned")
            _log(state, "ref", f"  {foe.name} is Poisoned: disadvantage on its attacks.")
        else:
            state.effects["poisoned"] = 10
            _log(state, "ref", "  You are Poisoned: disadvantage on your attacks for a minute.")
        return
    if effect == "necrotic_drain":
        dmg, btxt = roll_expr("1d10")
        _damage_dealt(state, dmg)
        gained = min(dmg, pc.hp_max - pc.hp)
        pc.hp += gained
        state.stats.healed += gained
        _log(state, "ref", f"  {dmg} necrotic to {foe.name}; you regain {gained}.", dice=btxt)
        return
    if effect == "lightning":
        dmg, btxt = roll_expr("4d10")
        _damage_dealt(state, dmg)
        _log(state, "ref", f"  Lightning: {dmg} to {foe.name} ({foe.hp}/{foe.hp_max}).", dice=btxt)
        return
    if effect == "regain_slot":
        spent = [lvl for lvl, n in pc.slots.items() if n < pc.slots_max.get(lvl, n)]
        if spent:
            lowest = min(spent, key=int)
            pc.slots[lowest] += 1
            _log(state, "ref", f"  A level-{lowest} slot returns to you.")
        else:
            _log(state, "ref", "  No slot was spent — nothing to regain.")
        return
