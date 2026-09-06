"""Practice Arena (Plan 84) — a sparring match run by the rules, not a model.

A player fights one SRD foe with their real sheet: equipped weapons (the same
math as the sheet's attack list), known cantrips and prepared spells (damage
dice, attack roll or save), spell slots, and a handful of modeled class
features. The server is the referee and the dice (``SystemRandom``); the
state is a JSON document the phone holds between turns, so a practice round
never writes to the real character, and a refresh loses nothing but the fight.

Free for everyone: no AI is involved anywhere in this module.
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
from domain.arena import (
    ArenaAction,
    ArenaAttack,
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
from services import attack_service, character_service, feature_service, spellcasting_service
from services.item_service import is_weapon

_RNG = random.SystemRandom()
_DICE_RE = re.compile(r"(\d+)d(\d+)\s*([+-]\s*\d+)?")
_HIT_RE = re.compile(r"([+-]\s*\d+)\s*to hit", re.I)
_COUNT_WORDS = {"two": 2, "three": 3, "four": 4, "five": 5, "twice": 2, "three times": 3}
_ABILITIES = ("str", "dex", "con", "int", "wis", "cha")

# Class features the referee actually models. Anything else on the sheet is
# left alone: the arena teaches the loop, not every subclass.
_FEATURE_KEYS: dict[str, tuple[str, str, str]] = {
    "second wind": (
        "second_wind",
        "bonus",
        "Bonus action: heal 1d10 + your level.",
    ),
    "action surge": ("action_surge", "free", "Take a second action this turn."),
    "rage": (
        "rage",
        "bonus",
        "Bonus action: +2 melee damage and you take half from weapon attacks.",
    ),
    "lay on hands": ("lay_on_hands", "action", "Action: heal 5 HP from your pool."),
}


# ── Dice ─────────────────────────────────────────────────────────────────────


def roll_expr(expr: str, crit: bool = False) -> tuple[int, str]:
    """Roll a dice expression like ``1d8+3`` (dice doubled on a crit).

    Args:
        expr: The expression. A bare integer is a flat amount.
        crit: Roll the dice twice (the modifier once), as a critical hit does.

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
    total = max(0, sum(dice) + mod)
    shown = f"{count}d{sides}" + (f"{mod:+d}" if mod else "")
    mod_txt = f"{mod:+d}" if mod else ""
    return total, f"{shown} → [{', '.join(map(str, dice))}]{mod_txt} = {total}"


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
        tail = desc[dice.end() :].strip().split(" ")
        if tail and tail[0].isalpha():
            dtype = tail[0].strip(".,")
        out.append(
            ArenaFoeAttack(
                name=name or "Attack",
                hit_bonus=int(hit.group(1).replace(" ", "")),
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


def _pc_attacks(db: Session, pc: PlayerCharacter, dm_email: str) -> list[ArenaAttack]:
    """Equipped weapons via the sheet's attack math, then spells, then fists."""
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
        ranged = bool(item.weapon_range) or "ranged" in (item.weapon_category or "").lower()
        out.append(
            ArenaAttack(
                key=f"w-{item.id}",
                name=item.name,
                kind="weapon",
                hit_bonus=prev.hit_bonus,
                damage=prev.damage_roll,
                damage_type=prev.damage_type,
                melee=not ranged,
                note=f"{prev.ability.upper()} · {prev.damage_type}",
            )
        )
    stats = character_service.spellcasting_stats(pc)
    if stats.get("attack_bonus") is not None:
        for row in spellcasting_service.list_known_for_character(db, pc.id, dm_email):
            from db.repos.spell_repo import SpellRepo

            spell = SpellRepo.get_by_id(db, row.spell_id)
            if spell is None or not spell.damage_dice:
                continue
            if spell.level > 0 and not row.prepared:
                continue
            dice = (
                _cantrip_scale(spell.damage_dice, pc.level)
                if spell.level == 0
                else spell.damage_dice
            )
            attack_type = (spell.attack_type or "").lower()
            save = (spell.save_ability or "").lower()[:3] or None
            out.append(
                ArenaAttack(
                    key=f"s-{spell.id}",
                    name=spell.name,
                    kind="cantrip" if spell.level == 0 else "spell",
                    hit_bonus=stats["attack_bonus"] if attack_type in ("melee", "ranged") else None,
                    save_ability=save if attack_type not in ("melee", "ranged") else None,
                    save_dc=(
                        stats["save_dc"]
                        if save and attack_type not in ("melee", "ranged")
                        else None
                    ),
                    half_on_save=spell.level > 0,
                    damage=dice,
                    damage_type=spell.damage_type or "force",
                    spell_level=spell.level,
                    melee=attack_type == "melee",
                    note=(f"level {spell.level}" if spell.level else "cantrip")
                    + (
                        f" · {spell.save_ability} save"
                        if save and attack_type not in ("melee", "ranged")
                        else ""
                    ),
                )
            )
    if not any(a.kind == "weapon" for a in out):
        str_mod = attack_service.ability_modifier(pc.score_str)
        out.insert(
            0,
            ArenaAttack(
                key="unarmed",
                name="Unarmed Strike",
                kind="unarmed",
                hit_bonus=str_mod + attack_service.proficiency_bonus(pc.level),
                damage=str(max(1, 1 + str_mod)),
                damage_type="bludgeoning",
                note="no weapon equipped",
            ),
        )
    return out


def _pc_features(db: Session, pc: PlayerCharacter, dm_email: str) -> list[ArenaFeature]:
    """The modeled features the sheet actually has, with uses left."""
    out: list[ArenaFeature] = []
    for row in feature_service.list_for_character(db, pc.id, dm_email):
        spec = _FEATURE_KEYS.get((row.feature_name or "").strip().lower())
        if not spec:
            continue
        key, cost, blurb = spec
        uses = max(0, (row.max_uses or 0) - (row.uses_spent or 0))
        if key == "lay_on_hands":
            uses = max(uses, pc.level)  # a pool of 5 × level, spent 5 at a time
        out.append(
            ArenaFeature(  # type: ignore[arg-type]
                key=key, name=row.feature_name, uses_left=uses, cost=cost, blurb=blurb
            )
        )
    cls = getattr(pc.character_class, "value", str(pc.character_class)).lower()
    if cls == "rogue" and pc.level >= 2 and not any(f.key == "cunning_dodge" for f in out):
        out.append(
            ArenaFeature(
                key="cunning_dodge",
                name="Cunning Action: Dodge",
                uses_left=99,
                cost="bonus",
                blurb="Bonus action: the foe attacks you at disadvantage until your next turn.",
            )
        )
    return out


def _build_pc(db: Session, pc: PlayerCharacter, dm_email: str) -> ArenaPc:
    """Snapshot the real sheet into the arena's copy."""
    slots: dict[str, int] = {}
    try:
        state = spellcasting_service.slot_state(db, pc.id, dm_email)
        slots = {lvl: int(s.remaining) for lvl, s in state.levels.items() if s.max > 0}
    except Exception:  # noqa: BLE001 — non-casters and odd sheets simply have no slots
        slots = {}
    return ArenaPc(
        name=pc.character_name,
        ac=pc.ac,
        hp=max(1, pc.hp_current),
        hp_max=pc.hp_max,
        dex_mod=attack_service.ability_modifier(pc.score_dex),
        level=pc.level,
        character_class=getattr(pc.character_class, "value", str(pc.character_class)),
        attacks=_pc_attacks(db, pc, dm_email),
        features=_pc_features(db, pc, dm_email),
        slots=slots,
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
        rows.append(
            ArenaFoeOption(
                id=m.id,
                name=m.name,
                cr=m.challenge_rating,
                ac=m.ac,
                hp_average=m.hp_average,
                creature_type=getattr(m.creature_type, "value", str(m.creature_type)),
                suggested=lo <= v <= hi,
                image_url=m.image_url,
            )
        )
    rows.sort(key=lambda r: (cr_value(r.cr), r.name))
    return rows


# ── The fight ────────────────────────────────────────────────────────────────


def _log(state: ArenaState, who: str, text: str, dice: Optional[str] = None, **kw: Any) -> None:
    """Append one line to the fight log."""
    line = ArenaLogLine(round=state.round, who=who, text=text, dice=dice, **kw)  # type: ignore
    state.log.append(line)


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
    return state


def _attack_cost_ok(state: ArenaState) -> Optional[str]:
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


def _melee_bonus(state: ArenaState, attack: ArenaAttack) -> int:
    return 2 if state.pc.raging and attack.kind in ("weapon", "unarmed") and attack.melee else 0


def _resolve_player_attack(state: ArenaState, attack: ArenaAttack) -> None:
    """Attack roll or saving throw, then damage."""
    foe = state.foe
    if attack.hit_bonus is not None:
        nat, dtxt = d20()
        total = nat + attack.hit_bonus
        crit = nat == 20
        hit = crit or (nat != 1 and total >= foe.ac)
        if not hit:
            state.stats.misses += 1
            _log(
                state,
                "you",
                f"{attack.name}: {total} vs AC {foe.ac} — miss.",
                dice=f"{dtxt}{attack.hit_bonus:+d} = {total}",
                hit=False,
            )
            return
        dmg, btxt = roll_expr(attack.damage, crit=crit)
        dmg += _melee_bonus(state, attack)
        state.stats.hits += 1
        state.stats.crits += int(crit)
        foe.hp = max(0, foe.hp - dmg)
        state.stats.dealt += dmg
        _log(
            state,
            "you",
            f"{attack.name}: {'CRITICAL HIT' if crit else 'hit'} for {dmg} {attack.damage_type}. "
            f"{foe.name} is at {foe.hp}/{foe.hp_max}.",
            dice=f"{dtxt}{attack.hit_bonus:+d} = {total} vs AC {foe.ac} · {btxt}"
            + (" +2 rage" if _melee_bonus(state, attack) else ""),
            hit=True,
            crit=crit,
        )
        return
    # Save-based (or automatic, like Magic Missile when no save is listed).
    dmg, btxt = roll_expr(attack.damage)
    if attack.save_ability and attack.save_dc:
        nat, dtxt = d20()
        mod = foe.saves.get(attack.save_ability, 0)
        total = nat + mod
        saved = total >= attack.save_dc
        if saved:
            dmg = dmg // 2 if attack.half_on_save else 0
        foe.hp = max(0, foe.hp - dmg)
        state.stats.dealt += dmg
        state.stats.hits += int(not saved)
        state.stats.misses += int(saved and dmg == 0)
        _log(
            state,
            "you",
            f"{attack.name}: {foe.name} {'saves' if saved else 'fails'} "
            f"({total} vs DC {attack.save_dc}) — {dmg} {attack.damage_type}. "
            f"{foe.name} is at {foe.hp}/{foe.hp_max}.",
            dice=f"foe {dtxt}{mod:+d} = {total} vs DC {attack.save_dc} · {btxt}",
            hit=not saved,
        )
        return
    foe.hp = max(0, foe.hp - dmg)
    state.stats.dealt += dmg
    state.stats.hits += 1
    _log(
        state,
        "you",
        f"{attack.name} lands for {dmg} {attack.damage_type}. "
        f"{foe.name} is at {foe.hp}/{foe.hp_max}.",
        dice=btxt,
        hit=True,
    )


def _foe_turn(state: ArenaState) -> None:
    """The foe attacks with everything it has; then a new round begins."""
    foe, pc = state.foe, state.pc
    for atk in foe.attacks:
        for _ in range(atk.count):
            if pc.hp <= 0:
                break
            nat, dtxt = d20("dis" if state.dodging else None)
            total = nat + atk.hit_bonus
            crit = nat == 20
            hit = crit or (nat != 1 and total >= pc.ac)
            if not hit:
                _log(
                    state,
                    "foe",
                    f"{foe.name}'s {atk.name}: {total} vs your AC {pc.ac} — miss.",
                    dice=f"{dtxt}{atk.hit_bonus:+d} = {total}",
                    hit=False,
                )
                continue
            dmg, btxt = roll_expr(atk.damage, crit=crit)
            note = ""
            if pc.raging:
                dmg = dmg // 2
                note = " (halved by Rage)"
            pc.hp = max(0, pc.hp - dmg)
            state.stats.taken += dmg
            _log(
                state,
                "foe",
                f"{foe.name}'s {atk.name}: {'CRITICAL' if crit else 'hit'} for {dmg}{note}. "
                f"You're at {pc.hp}/{pc.hp_max}.",
                dice=f"{dtxt}{atk.hit_bonus:+d} = {total} vs AC {pc.ac} · {btxt}",
                hit=True,
                crit=crit,
            )
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
    state.dodging = False
    _log(state, "ref", f"Round {state.round}. Your turn.")


def _feature(state: ArenaState, key: str) -> None:
    feat = next((f for f in state.pc.features if f.key == key), None)
    if feat is None:
        raise ValueError("You don't have that feature.")
    if feat.uses_left <= 0:
        raise ValueError(f"No uses of {feat.name} left.")
    if feat.cost == "bonus" and state.bonus_used:
        raise ValueError("You've used your bonus action this turn.")
    if feat.cost == "action":
        why = _attack_cost_ok(state)
        if why:
            raise ValueError(why)
    pc = state.pc
    if key == "second_wind":
        heal, btxt = roll_expr(f"1d10+{pc.level}")
        gained = min(heal, pc.hp_max - pc.hp)
        pc.hp += gained
        state.stats.healed += gained
        _log(state, "you", f"Second Wind: +{gained} HP. You're at {pc.hp}/{pc.hp_max}.", dice=btxt)
    elif key == "action_surge":
        state.extra_action = True
        _log(state, "you", "Action Surge: you have a second action this turn.")
    elif key == "rage":
        pc.raging = True
        _log(state, "you", "You rage: +2 melee damage, and weapon hits against you are halved.")
    elif key == "cunning_dodge":
        state.dodging = True
        _log(
            state,
            "you",
            "Cunning Action — Dodge: the foe attacks you at disadvantage until your next turn.",
        )
    elif key == "lay_on_hands":
        gained = min(5, pc.hp_max - pc.hp)
        pc.hp += gained
        state.stats.healed += gained
        _log(state, "you", f"Lay on Hands: +{gained} HP. You're at {pc.hp}/{pc.hp_max}.")
    if feat.cost == "bonus":
        state.bonus_used = True
    elif feat.cost == "action":
        _spend_action(state)
    if key != "cunning_dodge":
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
    out: list[str] = []
    low = pc.hp <= pc.hp_max // 2
    if (
        low
        and not state.bonus_used
        and any(f.key == "second_wind" and f.uses_left > 0 for f in pc.features)
    ):
        out.append(
            "Under half HP with a bonus action free: "
            "Second Wind heals 1d10 + your level and costs no action."
        )
    if low and not state.bonus_used and any(f.key == "cunning_dodge" for f in pc.features):
        out.append("Cunning Action lets you Dodge as a bonus action, then still attack.")
    if (
        not state.action_used
        and any(f.key == "action_surge" and f.uses_left > 0 for f in pc.features)
        and state.foe.hp <= state.foe.hp_max // 3
    ):
        out.append("The foe is nearly down: Action Surge gives you a second action to finish it.")
    if (
        not state.action_used
        and not pc.raging
        and any(f.key == "rage" and f.uses_left > 0 for f in pc.features)
    ):
        out.append("Rage is a bonus action: do it before you attack, not after.")
    if any(a.kind == "cantrip" for a in pc.attacks) and any(v > 0 for v in pc.slots.values()):
        out.append(
            "Cantrips never run out. "
            "Spend a slot when it changes the fight, not on round one out of habit."
        )
    if pc.hp <= pc.hp_max // 4 and state.action_used is False:
        out.append("Very low? Dodge: every attack on you has disadvantage until your next turn.")
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
    if state.phase == "over":
        raise ValueError("The fight is over — start another.")
    kind = action.kind
    if kind in ("attack", "cast"):
        why = _attack_cost_ok(state)
        if why:
            raise ValueError(why)
        attack = next((a for a in state.pc.attacks if a.key == action.key), None)
        if attack is None:
            raise ValueError("That attack isn't on your sheet.")
        if attack.spell_level > 0:
            lvl = str(attack.spell_level)
            if state.pc.slots.get(lvl, 0) <= 0:
                raise ValueError(f"No level-{lvl} slots left.")
            state.pc.slots[lvl] -= 1
            state.stats.slots_spent += 1
        _spend_action(state)
        _resolve_player_attack(state, attack)
    elif kind == "dodge":
        why = _attack_cost_ok(state)
        if why:
            raise ValueError(why)
        _spend_action(state)
        state.dodging = True
        _log(state, "you", "You Dodge: attacks against you have disadvantage until your next turn.")
    elif kind == "feature":
        _feature(state, action.key or "")
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
        _foe_turn(state)
    if state.phase != "over" and state.foe.hp <= 0:
        state.phase = "over"
        state.result = "won"
        state.stats.rounds = state.round
        _log(state, "ref", f"{state.foe.name} goes down. Well fought.")
    state.tips = _tips(state)
    return state
