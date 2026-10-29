"""Level-up guide (Plan 115) — the DM grants a level, the player's guide spends it.

``grant`` / ``revoke`` are DM-scoped (campaign owner only). ``plan_for`` / ``apply`` are
player-scoped: the PC's UUID is the capability (Plan 25), and ``apply`` only works while the
DM's grant is open, so a shared sheet link can't level itself.

``apply`` validates every choice before writing anything, then makes one sheet update through
``character_service.update_character`` (which recomputes slots, syncs class features and
publishes ``pc.updated``) and finally learns or forgets spells.
"""

import uuid
from datetime import UTC, datetime
from typing import Any, Optional

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.character_spell_repo import CharacterSpellRepo
from db.repos.spell_repo import SpellRepo
from domain.character import (
    CharacterSpellCreate,
    PlayerCharacter,
    PlayerCharacterRead,
    PlayerCharacterUpdate,
)
from domain.enums import CharacterClass
from domain.level_up import (
    FeatChoice,
    FeatOption,
    LevelUpChoices,
    LevelUpPlan,
    LevelUpResult,
    NewFeature,
    SpellOption,
    SpellStep,
)
from domain.spell import Spell
from integrations.dnd_rules import levelup_2024 as rules
from integrations.dnd_rules import srd_character_options_2024 as srd
from integrations.event_bus import publish_pc_updated
from services import character_service, feature_service, spellcasting_service

_ASI = "Ability Score Improvement"
_PREPARED_CASTERS = {"Cleric", "Druid", "Paladin", "Wizard"}
_CATEGORY_ORDER = {"general": 0, "fighting_style": 1, "origin": 2}


# ── Lookups ───────────────────────────────────────────────────────────────────


def _pc_or_raise(db: Session, pc_id: uuid.UUID) -> PlayerCharacter:
    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        raise ValueError(f"Character {pc_id} not found.")
    return pc


def _dm_email(db: Session, pc: PlayerCharacter) -> str:
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {pc.campaign_id} not found.")
    return campaign.dm_email


def _assert_owner(db: Session, pc: PlayerCharacter, dm_email: str) -> None:
    if _dm_email(db, pc) != dm_email.strip().lower():
        raise PermissionError("You do not have permission to level this character.")


def _class_name(pc: PlayerCharacter) -> str:
    return getattr(pc.character_class, "value", str(pc.character_class))


def _scores(pc: PlayerCharacter) -> dict[str, int]:
    return {a: int(getattr(pc, f"score_{a.lower()}")) for a in rules.ABILITIES}


def _mod(score: int) -> int:
    return (score - 10) // 2


def _feat_names(feats: list[str]) -> set[str]:
    return {rules.base_feat_name(f).casefold() for f in feats}


def _is_caster(class_name: str, subclass: Optional[str]) -> bool:
    cls = srd.CLASSES.get(class_name)
    if cls and cls["spellcasting"]:
        return True
    return any(s.casefold() in (subclass or "").casefold() for s in rules.CASTER_SUBCLASSES)


def _armor_training(class_name: str, feats: list[str]) -> set[str]:
    out = set(srd.CLASSES.get(class_name, {}).get("armor", []))
    names = _feat_names(feats)
    if "lightly armored" in names:
        out |= {"light", "shields"}
    if "moderately armored" in names:
        out |= {"medium", "shields"}
    if "heavily armored" in names:
        out.add("heavy")
    return out


def _has_fighting_style(class_name: str, level: int, feats: list[str]) -> bool:
    at = rules.FIGHTING_STYLE_LEVEL.get(class_name)
    if at is not None and level >= at:
        return True
    styles = {f["name"].casefold() for f in rules.FEATS if f["category"] == "fighting_style"}
    return bool(_feat_names(feats) & styles)


def _hp_bonus_per_level(pc: PlayerCharacter, feats: list[str]) -> int:
    """Extra max HP each level brings: Tough, Dwarven Toughness, Draconic Resilience."""
    bonus = sum(
        f["hp_per_level"]
        for f in rules.FEATS
        if f["hp_per_level"] and f["name"].casefold() in _feat_names(feats)
    )
    race = (pc.race or "").casefold()
    bonus += sum(
        n for sp, n in rules.HP_PER_LEVEL_SPECIES.items() if race.startswith(sp.casefold())
    )
    sub = (pc.subclass or "").casefold()
    bonus += sum(n for sc, n in rules.HP_PER_LEVEL_SUBCLASS.items() if sc.casefold() in sub)
    return bonus


def _hit_die(class_name: str) -> int:
    if class_name in srd.CLASSES:
        return int(srd.CLASSES[class_name]["hit_die"])
    return character_service.hit_die_for(CharacterClass(class_name))


def _slots(class_name: str, level: int) -> dict[str, int]:
    """Max spell slots per slot level, Warlock pact slots folded to their level."""
    try:
        raw = character_service.compute_spell_slots(CharacterClass(class_name), level)
    except ValueError:
        return {}
    if "pact" in raw and "level" in raw:
        return {str(int(raw["level"])): int(raw["pact"])}
    return {str(k): int(v) for k, v in raw.items()}


def _spell_counts(class_name: str, old: int, new: int) -> tuple[int, int, int]:
    """New cantrips, new leveled spells, and the highest castable level at ``new``.

    Counts are the class table's *delta*: PCs carry spells from species, feats and subclasses
    too, so "cap minus rows on the sheet" would undercount.
    """
    if class_name not in srd.CLASSES or not srd.CLASSES[class_name]["spellcasting"]:
        return 0, 0, 0
    cantrips = srd.cantrips_known(class_name, new) - srd.cantrips_known(class_name, old)
    spells = srd.spells_prepared(class_name, new) - srd.spells_prepared(class_name, old)
    if class_name == "Wizard":
        spells = max(spells, 2)  # two spellbook additions every Wizard level
    return max(0, cantrips), max(0, spells), srd.max_spell_level(class_name, new)


def _option(spell: Spell) -> SpellOption:
    return SpellOption(
        name=spell.name, level=spell.level, school=spell.school, classes=list(spell.classes or [])
    )


def _known_spells(db: Session, pc: PlayerCharacter, dm: str) -> list[Spell]:
    out: list[Spell] = []
    for row in spellcasting_service.list_known_for_character(db, pc.id, dm):
        spell = SpellRepo.get_by_id(db, row.spell_id)
        if spell is not None:
            out.append(spell)
    return out


# ── The plan ──────────────────────────────────────────────────────────────────


def _build_plan(db: Session, pc: PlayerCharacter, dm: str) -> LevelUpPlan:
    class_name = _class_name(pc)
    old, new = pc.level, pc.level + 1
    feats = list(pc.feats or [])
    scores = _scores(pc)
    caster = _is_caster(class_name, pc.subclass)
    cls = srd.CLASSES.get(class_name, {})
    die = _hit_die(class_name)
    con = _mod(scores["CON"])
    bonus = _hp_bonus_per_level(pc, feats)

    sub_level = int(cls.get("subclass_level", 3))
    needs_subclass = new >= sub_level and not (pc.subclass or "").strip()
    new_features = []
    for name in rules.features_at(class_name, new):
        note = rules.FEATURE_NOTES.get(name)
        if name.endswith(" Subclass"):
            note = "Choose your subclass below." if needs_subclass else None
        new_features.append(NewFeature(name=name, note=note))

    asi_level = new in rules.asi_levels(class_name)
    feat_options: list[FeatOption] = []
    if asi_level:
        popular = rules.POPULAR_FEATS.get(class_name, [])
        training = _armor_training(class_name, feats)
        style = _has_fighting_style(class_name, new, feats)
        for row in rules.FEATS:
            ok, reason = rules.feat_qualifies(
                row,
                scores=scores,
                is_caster=caster,
                armor_training=training,
                has_fighting_style=style,
                current_feats=feats,
            )
            feat_options.append(
                FeatOption(
                    name=row["name"],
                    category=row["category"],
                    blurb=row["blurb"],
                    ok=ok,
                    reason=reason,
                    popular=row["name"] in popular,
                    srd=row["srd"],
                    asi_options=(
                        list(rules.ABILITIES) if row["asi_options"] == "any" else row["asi_options"]
                    ),
                    save_prof=row["save_prof"],
                    fixed_spells=row["fixed_spells"],
                    spell_picks=row["spell_picks"],
                    skill_pick=row["skill_pick"],
                    expertise_pick=row["expertise_pick"],
                    choice=row["choice"],
                    hp_per_level=row["hp_per_level"],
                    ac_bonus_in_armor=row["ac_bonus_in_armor"],
                )
            )
        rank = {name: i for i, name in enumerate(popular)}
        feat_options.sort(
            key=lambda f: (
                not f.ok,
                rank.get(f.name, len(rank)),
                _CATEGORY_ORDER.get(f.category, 9),
                f.name,
            )
        )

    all_spells = SpellRepo.list_all(db)
    known = _known_spells(db, pc, dm)
    known_names = {s.name.casefold() for s in known}
    n_cantrips, n_spells, max_level = _spell_counts(class_name, old, new)
    step: Optional[SpellStep] = None
    if class_name in srd.CLASSES and srd.CLASSES[class_name]["spellcasting"]:
        # Only spells on the class list can be swapped: a species or feat cantrip (an Aasimar's
        # Light) isn't the class feature's to replace.
        class_known = [s for s in known if class_name in (s.classes or [])]
        cantrip_swap = class_name in rules.CANTRIP_SWAP_CLASSES and any(
            s.level == 0 for s in class_known
        )
        spell_swap = class_name in rules.SPELL_SWAP_CLASSES and any(
            s.level >= 1 for s in class_known
        )
        if n_cantrips or n_spells or cantrip_swap or spell_swap:
            options = [
                _option(s)
                for s in all_spells
                if class_name in (s.classes or [])
                and s.level <= max_level
                and s.name.casefold() not in known_names
            ]
            note = None
            if class_name in _PREPARED_CASTERS:
                note = "You can change the rest of your prepared spells after any Long Rest."
            step = SpellStep(
                new_cantrips=n_cantrips,
                new_spells=n_spells,
                max_spell_level=max_level,
                prepared_caster=class_name in _PREPARED_CASTERS,
                cantrip_swap=cantrip_swap,
                spell_swap=spell_swap,
                known=[_option(s) for s in class_known],
                options=options,
                note=note,
            )

    ac_abilities = ["DEX"]
    if class_name == "Monk":
        ac_abilities.append("WIS")
    if class_name == "Barbarian":
        ac_abilities.append("CON")

    return LevelUpPlan(
        pc_id=str(pc.id),
        character_name=pc.character_name,
        character_class=class_name,
        subclass=pc.subclass,
        from_level=old,
        to_level=new,
        pending_level=int(pc.pending_level or new),
        hit_die=die,
        con_mod=con,
        hp_max=pc.hp_max,
        hp_average_gain=max(1, die // 2 + 1 + con) + bonus,
        hp_bonus_per_level=bonus,
        new_features=new_features,
        scaling=rules.scaling_notes(class_name, old, new, is_caster=caster),
        slots_before=_slots(class_name, old),
        slots_after=_slots(class_name, new),
        needs_subclass=needs_subclass,
        subclass_options=list(cls.get("srd_subclasses", [])),
        asi_level=asi_level,
        feats=feat_options,
        scores=scores,
        skills={k: int(v) for k, v in (pc.skill_proficiencies or {}).items()},
        saves=[getattr(s, "value", str(s)) for s in (pc.saving_throw_proficiencies or [])],
        all_skills=list(srd.SKILLS),
        spellcasting=step,
        feat_spells=[_option(s) for s in all_spells if s.level <= 1] if asi_level else [],
        ac=pc.ac,
        ac_abilities=ac_abilities,
    )


def _require_grant(pc: PlayerCharacter) -> None:
    if not pc.pending_level or pc.pending_level <= pc.level:
        raise ValueError("No level-up is waiting. Your DM grants it from their screen.")
    if pc.level >= 20:
        raise ValueError("Level 20 is as high as it goes.")


# ── DM: grant and revoke ──────────────────────────────────────────────────────


def grant(
    db: Session, pc_id: uuid.UUID, dm_email: str, to_level: Optional[int] = None
) -> PlayerCharacterRead:
    """Open a level-up for a PC; their sheet shows the guide until they reach ``to_level``.

    Args:
        db: Active database session.
        pc_id: UUID of the PC.
        dm_email: Email of the requesting DM.
        to_level: Level to grant up to (default: one above the current level).

    Returns:
        The updated PlayerCharacterRead.

    Raises:
        ValueError: If the PC is unknown or the target level isn't above the current one.
        PermissionError: If the DM doesn't own the campaign.
    """
    pc = _pc_or_raise(db, pc_id)
    _assert_owner(db, pc, dm_email)
    target = to_level or pc.level + 1
    if target <= pc.level:
        raise ValueError(f"{pc.character_name} is already level {pc.level}.")
    if target > 20:
        raise ValueError("Level 20 is as high as it goes.")
    return character_service.update_character(
        db, pc_id, dm_email, PlayerCharacterUpdate(pending_level=target)
    )


def revoke(db: Session, pc_id: uuid.UUID, dm_email: str) -> PlayerCharacterRead:
    """Withdraw an open level-up grant.

    Args:
        db: Active database session.
        pc_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        The updated PlayerCharacterRead.
    """
    pc = _pc_or_raise(db, pc_id)
    _assert_owner(db, pc, dm_email)
    return character_service.update_character(
        db, pc_id, dm_email, PlayerCharacterUpdate(pending_level=None)
    )


# ── Player: plan and apply ────────────────────────────────────────────────────


def plan_for(db: Session, pc_id: uuid.UUID) -> LevelUpPlan:
    """The guide for this PC's next level (player scope).

    Args:
        db: Active database session.
        pc_id: UUID of the PC (capability URL).

    Returns:
        LevelUpPlan.

    Raises:
        ValueError: If the PC is unknown or no level-up is granted.
    """
    pc = _pc_or_raise(db, pc_id)
    _require_grant(pc)
    return _build_plan(db, pc, _dm_email(db, pc))


def _increase(
    asi: dict[str, int], allowed: list[str], *, feat: str, total: int, max_each: int
) -> dict[str, int]:
    picks = {a: int(v) for a, v in asi.items() if int(v)}
    if any(a not in allowed for a in picks):
        raise ValueError(f"{feat} can raise only " + ", ".join(allowed) + ".")
    if any(v < 0 or v > max_each for v in picks.values()) or sum(picks.values()) != total:
        if feat == _ASI:
            raise ValueError("Ability Score Improvement is +2 to one score or +1 to two.")
        raise ValueError(f"{feat} gives +1 to one ability: pick which.")
    return picks


def _assign_spell_picks(
    names: list[str], specs: list[dict[str, Any]], choice: Optional[str], catalog: dict[str, Spell]
) -> tuple[list[str], int]:
    """Match feat spell picks to the feat's pick rules; returns (spell names, picks left)."""
    remaining = list(dict.fromkeys(n.strip() for n in names if n.strip()))
    chosen: list[str] = []
    left = 0
    for spec in specs:
        want = int(spec["count"])
        for name in list(remaining):
            if want == 0:
                break
            spell = catalog.get(name.casefold())
            if spell is None or spell.level != spec["level"]:
                continue
            if spec.get("schools") and spell.school not in spec["schools"]:
                continue
            if spec.get("list_from_choice") and choice not in (spell.classes or []):
                continue
            chosen.append(spell.name)
            remaining.remove(name)
            want -= 1
        left += want
    if remaining:
        raise ValueError(f"{remaining[0]} doesn't fit this feat's spell choice.")
    return chosen, left


def _apply_feat(
    fc: FeatChoice,
    plan: LevelUpPlan,
    feats: list[str],
    saves: list[str],
    skills: dict[str, int],
    catalog: dict[str, Spell],
    summary: list[str],
    warnings: list[str],
) -> tuple[dict[str, int], list[str], dict[str, Any]]:
    """Validate a feat pick and fold it into the sheet lists; returns (increase, spells, row)."""
    if fc.from_book:
        name = fc.name.strip()
        if name.casefold() in _feat_names(feats) and name.casefold() != _ASI.casefold():
            raise ValueError(f"You already have {name}.")
        inc = {}
        if fc.asi:
            inc = _increase(fc.asi, rules.ABILITIES, feat=name, total=1, max_each=1)
        feats.append(name)
        summary.append(f"Feat: {name} (from your book)")
        warnings.append(f"{name} is recorded by name: play it from your book.")
        return inc, [], {}

    row = rules.FEATS_BY_NAME.get(fc.name.strip().casefold())
    if row is None:
        raise ValueError(f"Unknown feat {fc.name!r}. Pick 'From my book' for others.")
    opt = next(f for f in plan.feats if f.name == row["name"])
    if not opt.ok:
        raise ValueError(f"{row['name']}: {opt.reason}")

    if row["name"] == _ASI:
        inc = _increase(fc.asi, rules.ABILITIES, feat=_ASI, total=2, max_each=2)
    elif opt.asi_options:
        inc = _increase(fc.asi, opt.asi_options, feat=row["name"], total=1, max_each=1)
    elif fc.asi:
        raise ValueError(f"{row['name']} doesn't raise an ability score.")
    else:
        inc = {}

    label = row["name"]
    if row["choice"]:
        if fc.choice not in row["choice"]["options"]:
            raise ValueError(f"Pick a {row['choice']['label'].lower()} for {row['name']}.")
        label = f"{row['name']} ({fc.choice})"
        if label.casefold() in {f.casefold() for f in feats}:
            raise ValueError(f"You already have {label}.")
    if row["name"] != _ASI:
        feats.append(label)

    if row["save_prof"]:
        ability = next(iter(inc))
        if ability in saves:
            raise ValueError(f"You're already proficient in {ability} saves: pick another ability.")
        saves.append(ability)

    spells = [s for s in row["fixed_spells"]]
    if row["spell_picks"]:
        picked, left = _assign_spell_picks(fc.spells, row["spell_picks"], fc.choice, catalog)
        spells += picked
        if left:
            warnings.append(
                f"{label}: {left} spell pick{'s' if left > 1 else ''} still open. "
                "Tell your DM what you chose."
            )
    elif fc.spells:
        raise ValueError(f"{row['name']} doesn't grant a spell choice.")

    sp = row["skill_pick"]
    if sp:
        pool = sp["from"] or list(srd.SKILLS)
        picks = list(dict.fromkeys(fc.skills))
        if len(picks) > sp["count"]:
            raise ValueError(f"{row['name']} gives {sp['count']} skill pick(s).")
        for s in picks:
            if s not in pool:
                raise ValueError(f"{s} isn't one of {row['name']}'s skills.")
            if skills.get(s, 0) >= 1:
                if not sp["upgrade"]:
                    raise ValueError(f"You're already proficient in {s}.")
                if skills[s] >= 2:
                    raise ValueError(f"You already have expertise in {s}.")
                skills[s] = 2
            else:
                skills[s] = 1
        if len(picks) < sp["count"]:
            warnings.append(f"{label}: {sp['count'] - len(picks)} skill pick(s) still open.")
    elif fc.skills:
        raise ValueError(f"{row['name']} doesn't grant skills.")

    if row["expertise_pick"]:
        picks = list(dict.fromkeys(fc.expertise))
        if len(picks) > row["expertise_pick"]:
            raise ValueError(f"{row['name']} gives {row['expertise_pick']} expertise pick.")
        for s in picks:
            if skills.get(s, 0) < 1:
                raise ValueError(f"Expertise needs proficiency in {s} first.")
            if skills[s] >= 2:
                raise ValueError(f"You already have expertise in {s}.")
            skills[s] = 2
    elif fc.expertise:
        raise ValueError(f"{row['name']} doesn't grant expertise.")

    gained = ", ".join(f"+{v} {a}" for a, v in inc.items())
    summary.append(f"{label}" + (f" ({gained})" if gained else ""))
    return inc, spells, row


def _validate_spell_list(
    names: list[str], allowed: int, pool: dict[str, SpellOption], *, cantrip: bool
) -> list[str]:
    label = "cantrip" if cantrip else "spell"
    picks = list(dict.fromkeys(n.strip() for n in names if n.strip()))
    if len(picks) > allowed:
        raise ValueError(f"You can pick {allowed} new {label}{'' if allowed == 1 else 's'}.")
    out = []
    for name in picks:
        opt = pool.get(name.casefold())
        if opt is None or (opt.level == 0) != cantrip:
            raise ValueError(f"{name} isn't a {label} you can pick.")
        out.append(opt.name)
    return out


def apply(db: Session, pc_id: uuid.UUID, choices: LevelUpChoices) -> LevelUpResult:
    """Spend one granted level with the player's choices (player scope).

    Args:
        db: Active database session.
        pc_id: UUID of the PC (capability URL).
        choices: What the player picked in the guide.

    Returns:
        LevelUpResult describing what changed.

    Raises:
        ValueError: If no level is granted or any choice breaks the rules.
    """
    pc = _pc_or_raise(db, pc_id)
    _require_grant(pc)
    dm = _dm_email(db, pc)
    plan = _build_plan(db, pc, dm)
    class_name, old, new = plan.character_class, plan.from_level, plan.to_level

    feats = list(pc.feats or [])
    saves = list(plan.saves)
    skills = dict(plan.skills)
    old_scores = dict(plan.scores)
    new_scores = dict(old_scores)
    summary: list[str] = []
    warnings: list[str] = []
    learn: list[str] = []
    forget: list[str] = []
    catalog = {s.name.casefold(): s for s in SpellRepo.list_all(db)}

    # Subclass.
    subclass = pc.subclass
    picked_sub = (choices.subclass or "").strip()
    if plan.needs_subclass:
        if picked_sub:
            subclass = picked_sub
            summary.append(f"Subclass: {picked_sub}")
        else:
            warnings.append("No subclass yet: pick it with your DM.")
    elif picked_sub and picked_sub != (pc.subclass or ""):
        raise ValueError("Your subclass is already set. Ask your DM to change it.")

    # Ability Score Improvement or feat.
    feat_row: dict[str, Any] = {}
    if plan.asi_level:
        if choices.feat is None:
            raise ValueError("Pick your Ability Score Improvement or a feat.")
        inc, feat_spells, feat_row = _apply_feat(
            choices.feat, plan, feats, saves, skills, catalog, summary, warnings
        )
        for ability, v in inc.items():
            if new_scores[ability] + v > 20:
                raise ValueError(f"{ability} can't go above 20.")
            new_scores[ability] += v
        learn += feat_spells
    elif choices.feat is not None:
        raise ValueError(f"Level {new} isn't a feat level for a {class_name}.")

    # Spells.
    step = plan.spellcasting
    if step is None:
        if choices.cantrips or choices.spells or choices.cantrip_swap or choices.spell_swap:
            raise ValueError(f"No new {class_name} spells to pick at level {new}.")
    else:
        pool = {o.name.casefold(): o for o in step.options}
        known = {o.name.casefold(): o for o in step.known}
        cantrips = _validate_spell_list(choices.cantrips, step.new_cantrips, pool, cantrip=True)
        spells = _validate_spell_list(choices.spells, step.new_spells, pool, cantrip=False)
        taken = {n.casefold() for n in cantrips + spells}
        for swap, allowed, is_cantrip, label in (
            (choices.cantrip_swap, step.cantrip_swap, True, "cantrip"),
            (choices.spell_swap, step.spell_swap, False, "spell"),
        ):
            if swap is None:
                continue
            if not allowed:
                raise ValueError(f"A {class_name} can't swap a {label} on this level-up.")
            out = known.get(swap.forget.strip().casefold())
            into = pool.get(swap.learn.strip().casefold())
            if out is None or (out.level == 0) != is_cantrip:
                raise ValueError(f"{swap.forget} isn't a {label} you know.")
            if into is None or (into.level == 0) != is_cantrip or into.name.casefold() in taken:
                raise ValueError(f"{swap.learn} isn't a {label} you can swap in.")
            taken.add(into.name.casefold())
            forget.append(out.name)
            learn.append(into.name)
            summary.append(f"Swapped {out.name} for {into.name}")
        if cantrips:
            summary.append(
                "New cantrip" + ("s" if len(cantrips) > 1 else "") + ": " + ", ".join(cantrips)
            )
        if spells:
            summary.append(
                "New spell" + ("s" if len(spells) > 1 else "") + ": " + ", ".join(spells)
            )
        learn = cantrips + spells + learn
        open_c, open_s = step.new_cantrips - len(cantrips), step.new_spells - len(spells)
        if open_c > 0 or open_s > 0:
            parts = [f"{open_c} cantrip" + ("s" if open_c > 1 else "")] if open_c > 0 else []
            parts += [f"{open_s} spell" + ("s" if open_s > 1 else "")] if open_s > 0 else []
            warnings.append(
                "Still to pick: " + " and ".join(parts) + ". Tell your DM, who can add them."
            )
    if len({n.casefold() for n in learn}) != len(learn):
        raise ValueError("The same spell is picked twice.")

    # Hit points (2024: fixed value or a roll, + CON, minimum 1; CON changes are retroactive).
    die = plan.hit_die
    if choices.hp_method == "roll":
        if not choices.hp_roll or choices.hp_roll > die:
            raise ValueError(f"A d{die} roll is 1 to {die}.")
        die_part = choices.hp_roll
    else:
        die_part = die // 2 + 1
    old_con, new_con = _mod(old_scores["CON"]), _mod(new_scores["CON"])
    bonus = _hp_bonus_per_level(pc, feats)
    gain = max(1, die_part + new_con) + bonus + (new_con - old_con) * old
    if feat_row.get("hp_per_level"):
        gain += feat_row["hp_per_level"] * old  # Tough counts every earlier level too
    how = f"rolled {die_part}" if choices.hp_method == "roll" else f"average {die_part}"
    summary.insert(0, f"HP {pc.hp_max} → {pc.hp_max + gain} (+{gain}: d{die} {how})")

    # Armor class: only the part a raised ability (or the Defense style) changes.
    ac = pc.ac
    deltas = {a: _mod(new_scores[a]) - _mod(old_scores[a]) for a in plan.ac_abilities}
    mam_now = "medium armor master" in _feat_names(feats)
    mam_before = "medium armor master" in _feat_names(list(pc.feats or []))
    affects = (
        any(deltas.values()) or feat_row.get("ac_bonus_in_armor") or (mam_now and not mam_before)
    )
    if affects:
        armor = choices.armor
        if armor is None:
            warnings.append("Your AC may change: tell your DM what armor you wear.")
        else:
            delta = 0
            if armor in ("none", "light"):
                delta = deltas.get("DEX", 0)
                if armor == "none":
                    delta += deltas.get("WIS", 0) + deltas.get("CON", 0)
            elif armor == "medium":
                old_dex, new_dex = _mod(old_scores["DEX"]), _mod(new_scores["DEX"])
                delta = min(new_dex, 3 if mam_now else 2) - min(old_dex, 3 if mam_before else 2)
            if armor != "none":
                delta += int(feat_row.get("ac_bonus_in_armor") or 0)
            ac = max(1, min(30, pc.ac + delta))
            if ac != pc.ac:
                summary.append(f"AC {pc.ac} → {ac}")

    for ability in rules.ABILITIES:
        if new_scores[ability] != old_scores[ability]:
            summary.append(f"{ability} {old_scores[ability]} → {new_scores[ability]}")

    # Everything checks out: write the sheet.
    pending = int(pc.pending_level or new)
    stamp = datetime.now(UTC).strftime("%Y-%m-%d")
    note = f"Level {new} ({stamp}): " + "; ".join(summary)
    before_features = {f.feature_name for f in feature_service.list_for_character(db, pc.id, dm)}
    update = PlayerCharacterUpdate(
        level=new,
        hp_max=pc.hp_max + gain,
        hp_current=pc.hp_current + gain,
        ac=ac,
        subclass=subclass,
        feats=feats or None,
        saving_throw_proficiencies=saves,
        skill_proficiencies=skills or None,
        notes=((pc.notes or "").rstrip() + "\n" + note).strip(),
        pending_level=pending if pending > new else None,
        **{f"score_{a.lower()}": new_scores[a] for a in rules.ABILITIES},
    )
    updated = character_service.update_character(db, pc.id, dm, update)

    for name in forget:
        spell = catalog.get(name.casefold())
        row = CharacterSpellRepo.find_by_pc_and_spell(db, pc.id, spell.id) if spell else None
        if row is not None:
            spellcasting_service.forget_spell(db, row.id, dm)
    for name in learn:
        spell = catalog.get(name.casefold())
        if spell is None:
            warnings.append(f"{name} isn't in the spell catalog yet: ask your DM to add it.")
            continue
        spellcasting_service.learn_spell(
            db, pc.id, CharacterSpellCreate(spell_id=spell.id, known=True, prepared=True), dm
        )
    if learn or forget:
        publish_pc_updated(pc.id, pc.campaign_id)

    after_features = [f.feature_name for f in feature_service.list_for_character(db, pc.id, dm)]
    granted = [n for n in after_features if n and n not in before_features]

    return LevelUpResult(
        character_name=updated.character_name,
        level=updated.level,
        hp_max=updated.hp_max,
        hp_gain=gain,
        ac=updated.ac,
        summary=summary,
        features_granted=granted,
        warnings=warnings,
        more_levels=pending > new,
    )
