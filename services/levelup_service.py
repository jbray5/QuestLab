"""Level-up guide (Plan 115) — the DM grants a level, the player's guide spends it.

``grant`` / ``revoke`` are DM-scoped (campaign owner only). ``plan_for`` / ``apply`` are
player-scoped: the PC's UUID is the capability (Plan 25), and ``apply`` only works while the
DM's grant is open, so a shared sheet link can't level itself.

``apply`` validates every choice before writing anything, then makes one sheet update through
``character_service.update_character`` (which recomputes slots, syncs class features and
publishes ``pc.updated``) and finally learns or forgets spells.

Plan 131: every rules table comes from ``rulesets`` for the PC's edition, and every catalog
lookup keeps to that edition's spells. A 2014 PC levels by the SRD 5.1 rules: known casters
learn from the Spells Known table and may swap one, prepared casters get a bigger daily list
(the Wizard two spellbook spells), subclass spells become always prepared, and the class
choices the new level brings (Pact Boon, Eldritch Invocations, Metamagic, Expertise...) are
asked for and checked.

Plan 134: a 2024 PC gets the same two paths from the 2024 tables. The class choices the new
level brings (Eldritch Invocations, Expertise, Metamagic, Weapon Mastery, Fighting Style, the
SRD subclasses' own) are asked for, checked and recorded as the 2024 creator does, so a PC
built at a level and one levelled to it end with the same records. The always-prepared
spells that arrive (domain, oath, circle, patron, Paladin's Smite...) are learned and
prepared, and don't count against the 2024 prepared number. The 2024 spell counts are
unchanged.

Plan 133: the campaign DM's homebrew subclasses (``homebrew_service``) join the subclass
choice in both editions. A PC whose subclass is homebrew gets the DM's features at the
levels the DM set ("What's new") and the always-prepared spells, learned and prepared. The
SRD subclass tables never read a homebrew name (a homebrew "Life" is not the Life Domain).
A homebrew race's hit points per level count toward every level's gain.
"""

import uuid
from datetime import UTC, datetime
from types import ModuleType, SimpleNamespace
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
from domain.enums import CharacterClass, Ruleset
from domain.homebrew import HomebrewSubclassRead
from domain.level_up import (
    ChoiceOption,
    ChoiceStep,
    ClassChoicePick,
    GrantedSpell,
    HomebrewSubclassOption,
    LevelUpChoices,
    LevelUpPlan,
    LevelUpResult,
    NewFeature,
    SpellOption,
    SpellStep,
)
from domain.spell import Spell
from integrations.dnd_rules import rulesets
from integrations.event_bus import publish_pc_updated
from services import (
    character_service,
    feat_rules,
    feature_service,
    homebrew_service,
    spellcasting_service,
)
from services.auth_service import catalog_visible

_PREPARED_CASTERS = {"Cleric", "Druid", "Paladin", "Wizard"}
_ABILITY_NAMES = {
    "STR": "Strength",
    "DEX": "Dexterity",
    "CON": "Constitution",
    "INT": "Intelligence",
    "WIS": "Wisdom",
    "CHA": "Charisma",
}
# Skills and expertise first, then the picks that may depend on them (as feat_rules orders).
_KIND_ORDER = {"skill": 0, "expertise": 1, "feat": 2, "option": 3, "spell": 4, "weapon": 5}
# The class tables' marker for "your subclass gives you something here" (both editions).
_SUB_MARK = "Subclass feature"


# ── Lookups ───────────────────────────────────────────────────────────────────


def _pc_or_raise(db: Session, pc_id: uuid.UUID) -> PlayerCharacter:
    """The PC, or ValueError when the id is unknown."""
    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        raise ValueError(f"Character {pc_id} not found.")
    return pc


def _dm_email(db: Session, pc: PlayerCharacter) -> str:
    """The email of the DM who owns the PC's campaign."""
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {pc.campaign_id} not found.")
    return campaign.dm_email


def _assert_owner(db: Session, pc: PlayerCharacter, dm_email: str) -> None:
    """PermissionError unless ``dm_email`` owns the PC's campaign."""
    if _dm_email(db, pc) != dm_email.strip().lower():
        raise PermissionError("You do not have permission to level this character.")


def _class_name(pc: PlayerCharacter) -> str:
    """The PC's class as its plain name ("Paladin")."""
    return getattr(pc.character_class, "value", str(pc.character_class))


def _ruleset(pc: PlayerCharacter) -> str:
    """The PC's edition as its plain value ("2024" when missing)."""
    return rulesets.normalize(getattr(pc, "ruleset", None))


def _tables(pc: PlayerCharacter) -> tuple[ModuleType, ModuleType]:
    """(level-up tables, character-option tables) for the PC's edition."""
    ruleset = _ruleset(pc)
    return rulesets.levelup(ruleset), rulesets.options(ruleset)


def _scores(pc: PlayerCharacter, rules: ModuleType) -> dict[str, int]:
    """The PC's six ability scores by abbreviation."""
    return {a: int(getattr(pc, f"score_{a.lower()}")) for a in rules.ABILITIES}


def _mod(score: int) -> int:
    """The ability modifier for a score."""
    return (score - 10) // 2


def _hp_bonus_per_level(
    pc: PlayerCharacter,
    feats: list[str],
    subclass: Optional[str],
    homebrew_race_hp: Optional[int] = None,
) -> int:
    """Extra max HP each level brings: Tough, Dwarven Toughness, Draconic Resilience, and a
    homebrew race's hit points per level (Plan 133).

    ``subclass`` is the one the SRD tables may read: None for a homebrew subclass. Likewise a
    homebrew race (``homebrew_race_hp`` not None) never reads as an SRD one by its name
    ("Dwarfling" is not a Dwarf), as in the builder.
    """
    race = None if homebrew_race_hp is not None else pc.race
    bonus = feat_rules.hp_bonus_per_level(race, subclass, feats, _ruleset(pc))
    return bonus + (homebrew_race_hp or 0)


def _hit_die(class_name: str, srd: ModuleType) -> int:
    """The class's hit die size (the edition's table, else the enum's)."""
    if class_name in srd.CLASSES:
        return int(srd.CLASSES[class_name]["hit_die"])
    return character_service.hit_die_for(CharacterClass(class_name))


def _slots(class_name: str, level: int, ruleset: str = "2024") -> dict[str, int]:
    """Max spell slots per slot level, Warlock pact slots folded to their level."""
    try:
        raw = character_service.compute_spell_slots(CharacterClass(class_name), level, ruleset)
    except ValueError:
        return {}
    if "pact" in raw and "level" in raw:
        return {str(int(raw["level"])): int(raw["pact"])}
    return {str(k): int(v) for k, v in raw.items()}


def _spell_counts(srd: ModuleType, class_name: str, old: int, new: int) -> tuple[int, int, int]:
    """New cantrips, new leveled spells, and the highest castable level at ``new`` (2024).

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
    """A catalog spell as a picker option."""
    return SpellOption(
        name=spell.name, level=spell.level, school=spell.school, classes=list(spell.classes or [])
    )


def _known_spells(db: Session, pc: PlayerCharacter, dm: str) -> list[Spell]:
    """The catalog rows of every spell on the PC's sheet."""
    out: list[Spell] = []
    for row in spellcasting_service.list_known_for_character(db, pc.id, dm):
        spell = SpellRepo.get_by_id(db, row.spell_id)
        if spell is not None:
            out.append(spell)
    return out


def _named(table: dict[str, Any], name: Optional[str]) -> Optional[str]:
    """The key of ``table`` a sheet's subclass names ("Life" → "Life Domain"), or None."""
    text = (name or "").strip().casefold()
    if not text:
        return None
    for key in table:
        if key.casefold() == text:
            return key
    for key in table:
        if key.casefold() in text or text in key.casefold():
            return key
    return None


def _srd_subclass(rules: ModuleType, subclass: Optional[str]) -> Optional[str]:
    """The SRD subclass a sheet names, spelled as the tables key it ("Life" → "Life Domain");
    any other subclass (a book one) as written."""
    return _named(rules.SUBCLASS_LEVEL_FEATURES, subclass) or subclass


def _land(rules: ModuleType, feats: list[str]) -> Optional[str]:
    """The Circle of the Land's land recorded on the sheet ("Circle of the Land: Forest")."""
    spec = rules.CHOICE_KINDS.get("land")
    if spec is None:
        return None
    prefix = f"{spec.get('record') or spec['label']}: ".casefold()
    for entry in feats:
        if entry.casefold().startswith(prefix):
            picked = entry[len(prefix) :].strip().casefold()
            return next((k for k in rules.LAND_SPELLS if k.casefold() == picked), None)
    return None


# ── Homebrew subclasses and races (Plan 133) ──────────────────────────────────


def _homebrew_scope(pc: PlayerCharacter, dm: str) -> SimpleNamespace:
    """The campaign as ``homebrew_service`` reads it: its DM, and the PC's edition."""
    return SimpleNamespace(dm_email=dm, ruleset=_ruleset(pc))


def _homebrew_subclasses(
    db: Session, pc: PlayerCharacter, dm: str, class_name: str
) -> list[HomebrewSubclassRead]:
    """The campaign DM's homebrew subclasses for this class and edition, by name.

    Only the PC's own campaign DM's rows (SEC-003): never another DM's homebrew.
    """
    _races, subs = homebrew_service.for_campaign(db, _homebrew_scope(pc, dm))
    return [s for s in subs if s.character_class.casefold() == class_name.casefold()]


def _homebrew_named(
    subs: list[HomebrewSubclassRead], name: Optional[str]
) -> Optional[HomebrewSubclassRead]:
    """The homebrew subclass a sheet (or a pick) names, ignoring case, or None."""
    key = (name or "").strip().casefold()
    return next((s for s in subs if s.name.casefold() == key), None) if key else None


def _homebrew_race_hp(db: Session, pc: PlayerCharacter, dm: str) -> Optional[int]:
    """A homebrew race's extra hit points per level; None when the race isn't homebrew."""
    race = homebrew_service.race_for(db, _homebrew_scope(pc, dm), pc.race)
    return int(race.hp_per_level or 0) if race else None


def _homebrew_features(
    sub: HomebrewSubclassRead, low: int, high: int, tag: Optional[str] = None
) -> list[NewFeature]:
    """A homebrew subclass's features that arrive at levels ``low``–``high``, with its text."""
    return [
        NewFeature(name=f.name, note=f.text or None, subclass=tag, homebrew=True)
        for f in sorted(sub.features, key=lambda f: f.level)
        if low <= f.level <= high
    ]


def _homebrew_always(
    sub: HomebrewSubclassRead,
    low: int,
    high: int,
    skip: set[str],
    spelled: dict[str, str],
    tag: Optional[str] = None,
) -> list[GrantedSpell]:
    """A homebrew subclass's always-prepared spells set at levels ``low``–``high``.

    Spells in ``skip`` (on the sheet already, or granted by the class) are left out; names
    the catalog knows take its spelling (``spelled``), the rest stay as the DM typed them
    (``apply`` warns about those in plain words).
    """
    out: list[GrantedSpell] = []
    seen = set(skip)
    for level, names in sorted((sub.always_prepared or {}).items(), key=lambda kv: int(kv[0])):
        if not low <= int(level) <= high:
            continue
        for name in names:
            if name.casefold() in seen:
                continue
            seen.add(name.casefold())
            out.append(
                GrantedSpell(name=spelled.get(name.casefold(), name), source=sub.name, subclass=tag)
            )
    return out


def _always_only(always: list[GrantedSpell]) -> Optional[SpellStep]:
    """A spells step with nothing to pick, for a class without spells whose homebrew
    subclass grants always-prepared ones (None when it grants none)."""
    if not always:
        return None
    return SpellStep(
        new_cantrips=0,
        new_spells=0,
        max_spell_level=0,
        prepared_caster=False,
        cantrip_swap=False,
        spell_swap=False,
        known=[],
        options=[],
        always_prepared=always,
    )


def _with_extra_always(always: list[GrantedSpell], extra: list[GrantedSpell]) -> list[GrantedSpell]:
    """``always`` plus the homebrew grants it doesn't already hold (no spell twice)."""
    have = {g.name.casefold() for g in always if g.subclass is None}
    return always + [g for g in extra if g.name.casefold() not in have]


# ── The plan: 2014 pieces ─────────────────────────────────────────────────────


def _features_2014(
    rules: ModuleType,
    class_name: str,
    subclass: Optional[str],
    new: int,
    needs_subclass: bool,
    subclass_options: list[str],
) -> list[NewFeature]:
    """The class features at ``new``, with an SRD subclass's own features in place of the
    "Subclass feature" marker, and each subclass option's features when it's picked now."""
    sub = _named(rules.SUBCLASS_LEVEL_FEATURES, subclass)
    out: list[NewFeature] = []
    for name in rules.features_at(class_name, new):
        if name.endswith(" Subclass"):
            note = "Choose your subclass below." if needs_subclass else None
            out.append(NewFeature(name=name, note=note))
            continue
        if name == "Subclass feature" and sub is not None:
            continue  # the SRD subclass's own features are listed below
        out.append(NewFeature(name=name, note=rules.feature_note(class_name, name)))
    if sub is not None:
        for name in rules.SUBCLASS_LEVEL_FEATURES[sub].get(new, []):
            out.append(NewFeature(name=name, note=rules.feature_note(class_name, name)))
    if needs_subclass:
        for option in subclass_options:
            for name in rules.SUBCLASS_LEVEL_FEATURES.get(option, {}).get(new, []):
                out.append(
                    NewFeature(
                        name=name, note=rules.feature_note(class_name, name), subclass=option
                    )
                )
    return out


def _option_lock(
    row: dict[str, Any],
    level: int,
    have: set[str],
    cantrips: set[str],
    damage: bool = True,
    attack: bool = True,
) -> Optional[str]:
    """Why an option's prerequisite isn't met yet (a Warlock level, a Pact Boon, a cantrip).

    Plan 134: a 2024 invocation asks for a damaging cantrip (``damage``) or one that attacks
    (``attack``) rather than naming it, as the creator checks.
    """
    need = row.get("level")
    if need and level < need:
        return f"Needs Warlock level {need}."
    req = row.get("requires")
    if req and req.casefold() not in have:
        return f"Needs {req}."
    want = row.get("cantrip")
    if want == "damage" and not damage:
        return "Needs a Warlock cantrip that deals damage."
    if want == "attack" and not attack:
        return "Needs a Warlock cantrip that deals damage with an attack."
    if want and want not in ("damage", "attack") and want.casefold() not in cantrips:
        return f"Needs the {want} cantrip."
    return None


def _choice_spells(
    spec: dict[str, Any],
    srd: ModuleType,
    class_name: str,
    level: int,
    had: int,
    count: int,
    known: set[str],
    all_spells: list[Spell],
) -> list[SpellOption]:
    """The catalog spells a "spell" choice may take (Magical Secrets, Mystic Arcanum).

    ``spec["levels"]`` gives one spell level per pick in order (Mystic Arcanum: 6th, then
    7th...), so the new picks take the levels after the ``had`` earlier ones. Without it, any
    level the class can cast (and cantrips, if allowed). ``spec["lists"]`` None = any class.
    """
    levels = spec.get("levels")
    if levels:
        wanted = set(levels[had : had + count])
    else:
        wanted = set(range(1, srd.max_spell_level(class_name, level) + 1))
        if spec.get("cantrips"):
            wanted.add(0)
    lists = spec.get("lists")
    rows = [
        s
        for s in all_spells
        if s.level in wanted
        and (lists is None or any(c in (s.classes or []) for c in lists))
        and s.name.casefold() not in known
    ]
    return [_option(s) for s in sorted(rows, key=lambda s: (s.level, s.name))]


def _choice_step(
    rules: ModuleType,
    srd: ModuleType,
    ruleset: str,
    class_name: str,
    key: str,
    count: int,
    had: int,
    level: int,
    feats: list[str],
    known: list[Spell],
    all_spells: list[Spell],
    subclass: Optional[str],
) -> ChoiceStep:
    """One class choice of the new level, with its options and what's already taken.

    Plan 134 (2024): Weapon Mastery offers the mastery weapons the class may master; an
    option the rules let you take again (Lessons of the First Ones) is never "already yours";
    an option that alone teaches cantrips (Blessed Warrior) says how many and from which list.
    """
    spec = rules.CHOICE_KINDS[key]
    kind = spec["kind"]
    step = ChoiceStep(
        key=key,
        label=spec["label"],
        kind=kind,
        note=spec.get("note"),
        count=count,
        book=bool(spec.get("book")),
        subclass=subclass,
    )
    if kind in ("skill", "expertise"):
        pool = spec.get("pool")
        if pool == "class":
            pool = srd.CLASSES[class_name]["skills"]["from"]
        step.skills = list(pool) if pool else None
        return step
    # Earlier picks are recorded as "Label: Choice" (a Fighting Style feat by its own name).
    prefix = f"{spec.get('record') or spec['label']}: "
    step.taken = [f[len(prefix) :] for f in feats if f.casefold().startswith(prefix.casefold())]
    if kind == "spell":
        known_names = {s.name.casefold() for s in known}
        step.spells = _choice_spells(
            spec["spell"], srd, class_name, level, had, count, known_names, all_spells
        )
        return step
    sheet = {f.casefold() for f in feats}
    if kind == "weapon":
        for w in feat_rules.mastery_weapons(ruleset):
            if not rules.mastery_weapon_ok(class_name, w["category"], w["properties"]):
                continue
            taken = feat_rules.entry(key, w["name"], ruleset).casefold() in sheet
            step.options.append(
                ChoiceOption(
                    name=w["name"],
                    blurb=w["mastery"] or "",
                    ok=not taken,
                    reason="Already yours." if taken else None,
                    category=w["category"],
                )
            )
        return step
    rows = rules.choice_options(class_name, key)
    styles = feat_rules.feat_names(feats, ruleset)
    have = {f.split(": ", 1)[1].casefold() for f in feats if ": " in f}
    cantrips = {s.name.casefold() for s in known if s.level == 0}
    damage = any(s.damage_dice for s in known if s.level == 0)
    attack = any(s.damage_dice and s.attack_type for s in known if s.level == 0)
    if kind == "feat":
        step.taken = [r["name"] for r in rows if r["name"].casefold() in styles]
    for row in rows:
        if kind == "feat":
            taken = row["name"].casefold() in styles
        else:
            taken = (
                not row.get("repeatable")
                and feat_rules.entry(key, row["name"], ruleset).casefold() in sheet
            )
        reason = (
            "Already yours." if taken else _option_lock(row, level, have, cantrips, damage, attack)
        )
        step.options.append(
            ChoiceOption(
                name=row["name"], blurb=row.get("blurb", ""), ok=reason is None, reason=reason
            )
        )
    grants = [int((row.get("cantrips") or {}).get("count", 0)) for row in rows]
    step.cantrips = min(grants) if grants else 0
    for option, row, grant in zip(step.options, rows, grants):
        if grant > step.cantrips:
            option.cantrips = grant - step.cantrips
            option.cantrip_list = (row.get("cantrips") or {}).get("list")
    return step


def _choice_steps(
    rules: ModuleType,
    srd: ModuleType,
    pc: PlayerCharacter,
    subclass: Optional[str],
    class_name: str,
    old: int,
    new: int,
    needs_subclass: bool,
    subclass_options: list[str],
    feats: list[str],
    known: list[Spell],
    all_spells: list[Spell],
) -> list[ChoiceStep]:
    """The class choices the new level brings: each table's running total at ``new`` minus
    the total at ``old``. A subclass picked at this level adds its own, tagged with it.

    ``subclass`` is the sheet's as the SRD tables may read it (None for a homebrew one).
    """
    ruleset = _ruleset(pc)
    sub = _srd_subclass(rules, subclass)
    groups = [
        (
            None,
            rules.class_choice_counts(class_name, new, None if needs_subclass else sub),
            rules.class_choice_counts(class_name, old, sub),
        )
    ]
    if needs_subclass:
        base = rules.class_choice_counts(class_name, new, None)
        groups += [
            (option, rules.class_choice_counts(class_name, new, option), base)
            for option in subclass_options
        ]
    steps: list[ChoiceStep] = []
    for subclass, now, before in groups:
        for key, total in now.items():
            had = int(before.get(key, 0))
            if total - had > 0:
                steps.append(
                    _choice_step(
                        rules,
                        srd,
                        ruleset,
                        class_name,
                        key,
                        total - had,
                        had,
                        new,
                        feats,
                        known,
                        all_spells,
                        subclass,
                    )
                )
    return steps


def _always_new(
    rules: ModuleType,
    class_name: str,
    old: int,
    new: int,
    subclass: Optional[str],
    land: Optional[str],
    known: set[str],
    tag: Optional[str] = None,
) -> list[GrantedSpell]:
    """Always-prepared spells that arrive at ``new`` and aren't on the sheet yet."""
    before = {n.casefold() for n, _src in rules.always_prepared(class_name, old, subclass, land)}
    return [
        GrantedSpell(name=name, source=src, subclass=tag)
        for name, src in rules.always_prepared(class_name, new, subclass, land)
        if name.casefold() not in before and name.casefold() not in known
    ]


def _srd_always(
    rules: ModuleType,
    class_name: str,
    old: int,
    new: int,
    subclass: Optional[str],
    feats: list[str],
    known: set[str],
    needs_subclass: bool,
    subclass_options: list[str],
) -> list[GrantedSpell]:
    """The SRD always-prepared spells the new level brings, either edition: the class's, the
    sheet's subclass's (and land's), and each subclass option's when it's picked now (tagged
    with it).

    ``subclass`` is the sheet's as the SRD tables may read it (None for a homebrew one).
    """
    land = _land(rules, feats)
    sub = _srd_subclass(rules, subclass)
    always = _always_new(rules, class_name, old, new, sub, land, known)
    if needs_subclass:
        for option in subclass_options:
            always += _always_new(rules, class_name, old, new, option, land, known, option)
    return always


def _spell_step_2014(
    rules: ModuleType,
    srd: ModuleType,
    pc: PlayerCharacter,
    subclass: Optional[str],
    class_name: str,
    old: int,
    new: int,
    scores: dict[str, int],
    known: list[Spell],
    all_spells: list[Spell],
    needs_subclass: bool,
    subclass_options: list[str],
    choices: list[ChoiceStep],
    extra_always: list[GrantedSpell],
) -> Optional[SpellStep]:
    """The 2014 spells step: known casters learn from their table and may swap one;
    prepared casters prepare more each day (the Wizard adds two spellbook spells).

    ``subclass`` is the sheet's as the SRD tables may read it (None for a homebrew one);
    ``extra_always`` are the homebrew subclass's always-prepared spells (Plan 133).
    """
    sc = srd.CLASSES.get(class_name, {}).get("spellcasting")
    if not sc:
        return _always_only(extra_always)
    feats = list(pc.feats or [])
    mod = _mod(scores[sc["ability"]])
    max_level = srd.max_spell_level(class_name, new)
    n_cantrips = max(0, srd.cantrips_known(class_name, new) - srd.cantrips_known(class_name, old))
    prepared = sc["kind"] == "prepared"
    if not prepared:
        n_spells = srd.spells_known(class_name, new) - srd.spells_known(class_name, old)
        # Magical Secrets count toward the Spells Known number: those picks are the new ones.
        n_spells -= sum(
            s.count
            for s in choices
            if s.kind == "spell" and rules.CHOICE_KINDS[s.key]["spell"].get("known")
        )
    elif sc.get("spellbook"):
        n_spells = srd.spellbook_size(class_name, new) - srd.spellbook_size(class_name, old)
    else:
        n_spells = srd.spells_prepared(class_name, new, mod) - srd.spells_prepared(
            class_name, old, mod
        )
    n_spells = max(0, n_spells)

    known_names = {s.name.casefold() for s in known}
    sub = _srd_subclass(rules, subclass)
    always = _srd_always(
        rules, class_name, old, new, subclass, feats, known_names, needs_subclass, subclass_options
    )
    always = _with_extra_always(always, extra_always)
    always_keys = {g.name.casefold() for g in always}
    expanded = {n.casefold() for n in rules.expanded_spells(sub, new)}
    # Only class-list spells can be swapped (a Fiend's expanded spells count as Warlock ones).
    class_known = [
        s for s in known if class_name in (s.classes or []) or s.name.casefold() in expanded
    ]
    spell_swap = class_name in rules.SPELL_SWAP_CLASSES and any(s.level >= 1 for s in class_known)
    cantrip_swap = class_name in rules.CANTRIP_SWAP_CLASSES and any(
        s.level == 0 for s in class_known
    )
    extra_cantrips = any(s.cantrips for s in choices)
    if not (n_cantrips or n_spells or spell_swap or cantrip_swap or always or extra_cantrips):
        return None

    options = [
        _option(s)
        for s in all_spells
        if (class_name in (s.classes or []) or s.name.casefold() in expanded)
        and s.level <= max_level
        and s.name.casefold() not in known_names
        and s.name.casefold() not in always_keys
    ]
    count = srd.spells_prepared(class_name, new, mod) if prepared else None
    ability = _ABILITY_NAMES.get(sc["ability"], sc["ability"])
    if not prepared:
        note = "Spells you know stay known. Each time you gain a level you may swap one."
    elif sc.get("spellbook"):
        note = (
            f"Your spellbook gets {n_spells} new spells. Each day you prepare {count} of your "
            f"spellbook spells ({ability} modifier + Wizard level); change them after a Long Rest."
        )
    else:
        how = (
            "half your Paladin level"
            if sc.get("prepared_formula") == "half_level"
            else (f"{class_name} level")
        )
        note = (
            f"You can now prepare {count} spells each day ({ability} modifier + {how}). "
            "Change them after any Long Rest."
        )
    return SpellStep(
        new_cantrips=n_cantrips,
        new_spells=n_spells,
        max_spell_level=max_level,
        prepared_caster=prepared,
        cantrip_swap=cantrip_swap,
        spell_swap=spell_swap,
        known=[_option(s) for s in class_known],
        options=options,
        note=note,
        prepared_count=count,
        spellbook=bool(sc.get("spellbook")),
        first_spells=srd.max_spell_level(class_name, old) == 0 and max_level > 0,
        always_prepared=always,
    )


def _scaling_2014(
    srd: ModuleType, class_name: str, old: int, new: int, scores: dict[str, int]
) -> list[str]:
    """The spell counts that change, as "X: a → b" lines (2014 tables)."""
    sc = srd.CLASSES.get(class_name, {}).get("spellcasting")
    if not sc:
        return []
    mod = _mod(scores[sc["ability"]])
    rows = [("Cantrips you know", srd.cantrips_known)]
    if sc["kind"] == "known":
        rows.append(("Spells you know", srd.spells_known))
    else:
        rows.append(
            ("Spells you prepare each day", lambda c, lvl: srd.spells_prepared(c, lvl, mod))
        )
    out = []
    for label, fn in rows:
        before, after = fn(class_name, old), fn(class_name, new)
        if before != after:
            out.append(f"{label}: {before} → {after}")
    return out


# ── The plan ──────────────────────────────────────────────────────────────────


def _spell_step_2024(
    rules: ModuleType,
    srd: ModuleType,
    class_name: str,
    old: int,
    new: int,
    known: list[Spell],
    all_spells: list[Spell],
    always: list[GrantedSpell],
    choices: Optional[list[ChoiceStep]] = None,
) -> Optional[SpellStep]:
    """The 2024 spells step (Plan 115). No pick may take an always-prepared spell
    (``always``): a homebrew subclass's (Plan 133), and since Plan 134 the SRD's too.

    Plan 134: a class choice option that teaches cantrips from another list (Blessed
    Warrior's two Cleric cantrips) puts that list's cantrips in ``choice_cantrips``.
    """
    known_names = {s.name.casefold() for s in known}
    n_cantrips, n_spells, max_level = _spell_counts(srd, class_name, old, new)
    if class_name not in srd.CLASSES or not srd.CLASSES[class_name]["spellcasting"]:
        return _always_only(always)
    # Only spells on the class list can be swapped: a species or feat cantrip (an Aasimar's
    # Light) isn't the class feature's to replace.
    class_known = [s for s in known if class_name in (s.classes or [])]
    cantrip_swap = class_name in rules.CANTRIP_SWAP_CLASSES and any(
        s.level == 0 for s in class_known
    )
    spell_swap = class_name in rules.SPELL_SWAP_CLASSES and any(s.level >= 1 for s in class_known)
    lists = {o.cantrip_list for c in choices or [] for o in c.options if o.cantrip_list}
    taught = any(c.cantrips for c in choices or []) or bool(lists)
    if not (n_cantrips or n_spells or cantrip_swap or spell_swap or always or taught):
        return None
    always_keys = {g.name.casefold() for g in always}
    options = [
        _option(s)
        for s in all_spells
        if class_name in (s.classes or [])
        and s.level <= max_level
        and s.name.casefold() not in known_names
        and s.name.casefold() not in always_keys
    ]
    offered = {o.name.casefold() for o in options}
    choice_cantrips = [
        _option(s)
        for s in all_spells
        if s.level == 0
        and any(x in (s.classes or []) for x in lists)
        and s.name.casefold() not in known_names | always_keys | offered
    ]
    note = None
    if class_name in _PREPARED_CASTERS:
        note = "You can change the rest of your prepared spells after any Long Rest."
    return SpellStep(
        new_cantrips=n_cantrips,
        new_spells=n_spells,
        max_spell_level=max_level,
        prepared_caster=class_name in _PREPARED_CASTERS,
        cantrip_swap=cantrip_swap,
        spell_swap=spell_swap,
        known=[_option(s) for s in class_known],
        options=options,
        note=note,
        always_prepared=always,
        choice_cantrips=choice_cantrips,
    )


def _visible_spells(db: Session, ruleset: str, dm: str) -> list[Spell]:
    """The spells this PC's level-up may offer: its edition's SRD rows and its DM's homebrew.

    Plan 132: never another DM's homebrew (SEC-003), and so a name lookup never resolves to it.
    """
    return [
        s
        for s in SpellRepo.list_all(db, ruleset=ruleset)
        if catalog_visible(s.created_by_email, dm)
    ]


def _build_plan(db: Session, pc: PlayerCharacter, dm: str) -> LevelUpPlan:
    """Everything the guide shows for the PC's next level, by the PC's edition."""
    rules, srd = _tables(pc)
    ruleset = _ruleset(pc)
    is_2014 = rulesets.is_2014(ruleset)
    class_name = _class_name(pc)
    old, new = pc.level, pc.level + 1
    feats = list(pc.feats or [])
    scores = _scores(pc, rules)
    caster = feat_rules.is_caster(class_name, pc.subclass, ruleset)
    cls = srd.CLASSES.get(class_name, {})
    die = _hit_die(class_name, srd)
    con = _mod(scores["CON"])
    # Plan 133 — the campaign DM's homebrew subclasses for this class. A homebrew subclass on
    # the sheet is never read as an SRD one (``srd_sub`` None), however loosely names match.
    hb_subs = _homebrew_subclasses(db, pc, dm, class_name)
    hb_sub = _homebrew_named(hb_subs, pc.subclass)
    srd_sub = None if hb_sub else pc.subclass
    bonus = _hp_bonus_per_level(pc, feats, srd_sub, _homebrew_race_hp(db, pc, dm))

    sub_level = int(cls.get("subclass_level", 3))
    needs_subclass = new >= sub_level and not (pc.subclass or "").strip()
    srd_options = list(cls.get("srd_subclasses", []))
    hb_options = hb_subs if needs_subclass else []
    if is_2014:
        new_features = _features_2014(rules, class_name, srd_sub, new, needs_subclass, srd_options)
    else:
        new_features = []
        for name in rules.features_at(class_name, new):
            note = rules.FEATURE_NOTES.get(name)
            if name.endswith(" Subclass"):
                note = "Choose your subclass below." if needs_subclass else None
            new_features.append(NewFeature(name=name, note=note))
    if hb_sub is not None:
        # The DM's own features stand in for the class table's "Subclass feature" marker.
        new_features = [f for f in new_features if f.name != _SUB_MARK or f.subclass]
        new_features += _homebrew_features(hb_sub, new, new)
    for option in hb_options:
        # Picked now: every feature up to this level comes with it.
        new_features += _homebrew_features(option, 1, new, option.name)

    asi_level = new in rules.asi_levels(class_name)
    feat_options = (
        feat_rules.feat_options(class_name, new, scores, feats, pc.subclass, ruleset)
        if asi_level
        else []
    )

    # Plan 131 — the PC's edition only: a name-keyed lookup must never pick the other's row.
    all_spells = _visible_spells(db, ruleset, dm)
    known = _known_spells(db, pc, dm)
    # Plan 133 — a homebrew subclass's always-prepared spells: the sheet's, from this level;
    # one picked now, every level up to this one (tagged with it, like an SRD option's).
    known_names = {s.name.casefold() for s in known}
    spelled = {s.name.casefold(): s.name for s in all_spells}
    extra_always: list[GrantedSpell] = []
    if hb_sub is not None:
        extra_always += _homebrew_always(hb_sub, new, new, known_names, spelled)
    for option in hb_options:
        extra_always += _homebrew_always(option, 1, new, known_names, spelled, option.name)
    scaling = rules.scaling_notes(class_name, old, new, is_caster=caster)
    # Plan 131 (2014), Plan 134 (2024): the class choices the new level brings, each edition
    # from its own tables.
    choices = _choice_steps(
        rules,
        srd,
        pc,
        srd_sub,
        class_name,
        old,
        new,
        needs_subclass,
        srd_options,
        feats,
        known,
        all_spells,
    )
    if is_2014:
        step = _spell_step_2014(
            rules,
            srd,
            pc,
            srd_sub,
            class_name,
            old,
            new,
            scores,
            known,
            all_spells,
            needs_subclass,
            srd_options,
            choices,
            extra_always,
        )
        scaling = _scaling_2014(srd, class_name, old, new, scores) + scaling
    else:
        # Plan 134 — the SRD always-prepared spells arriving now, then the homebrew ones.
        always = _srd_always(
            rules, class_name, old, new, srd_sub, feats, known_names, needs_subclass, srd_options
        )
        step = _spell_step_2024(
            rules,
            srd,
            class_name,
            old,
            new,
            known,
            all_spells,
            _with_extra_always(always, extra_always),
            choices,
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
        scaling=scaling,
        slots_before=_slots(class_name, old, ruleset),
        slots_after=_slots(class_name, new, ruleset),
        needs_subclass=needs_subclass,
        subclass_options=srd_options + [s.name for s in hb_subs],
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
        ruleset=Ruleset(ruleset),
        class_choices=choices,
        homebrew_subclasses=[HomebrewSubclassOption(name=s.name, blurb=s.blurb) for s in hb_subs],
    )


def _require_grant(pc: PlayerCharacter) -> None:
    """ValueError unless the DM has granted a level the PC hasn't reached."""
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


def _validate_spell_list(
    names: list[str], allowed: int, pool: dict[str, SpellOption], *, cantrip: bool
) -> list[str]:
    """Check new spell picks against the pool and the allowed count."""
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


def _apply_spell_choice(
    step: ChoiceStep, listed: list[str], book: list[str], feats: list[str], ruleset: str
) -> list[SpellOption]:
    """Check a "spell" choice's picks against its spell list and record them in ``feats``.

    Returns:
        The listed picks (the caller learns the ones the PC can cast with its slots).
    """
    pool = {o.name.casefold(): o for o in step.spells}
    rows = []
    for name in listed:
        row = pool.get(name.casefold())
        if row is None:
            hint = " Pick From my book for others." if step.book else ""
            raise ValueError(f"{step.label}: {name} isn't a spell you can pick here.{hint}")
        rows.append(row)
    feat_rules.no_repeats(step.label, [r.name for r in rows] + book)
    for name in [r.name for r in rows] + book:
        feats.append(feat_rules.entry(step.key, name, ruleset))
    return rows


def _apply_choices(
    rules: ModuleType,
    ruleset: str,
    class_name: str,
    level: int,
    steps: list[ChoiceStep],
    sent: list[ClassChoicePick],
    feats: list[str],
    skills: dict[str, int],
    cantrips: list[Spell],
    summary: list[str],
    warnings: list[str],
) -> list[SpellOption]:
    """Validate the class choices of a level-up and record them on the sheet lists.

    Each step needs exactly its count of *new* picks, from its list (or by name from the
    player's book where allowed), not already on the sheet, with prerequisites met. The
    checks and the recording are ``feat_rules``' (shared with the character creator); only
    the count is the level's delta instead of the running total. Plan 134: the same for a
    2024 level-up, Weapon Mastery included ("Weapon Mastery: Longsword", as the creator
    records it); an option the rules let you take again may be.

    Returns:
        The spells picked through "spell" choices (Magical Secrets, Mystic Arcanum).

    Raises:
        ValueError: On a missing, extra, unknown, repeated or locked pick, in plain words.
    """
    by_key: dict[str, ClassChoicePick] = {}
    for pick in sent:
        label = rules.CHOICE_KINDS.get(pick.key, {}).get("label", pick.key)
        if pick.key in by_key:
            raise ValueError(f"{label} is sent twice.")
        by_key[pick.key] = pick
    wanted = {s.key: s for s in steps}
    for key in by_key:
        if key not in wanted:
            label = rules.CHOICE_KINDS.get(key, {}).get("label", key)
            raise ValueError(f"A level {level} {class_name} has no {label} to choose.")
    # A prerequisite may name a pick made now or on an earlier level ("Pact of the Blade").
    elsewhere = {n.strip() for p in by_key.values() for n in p.picks if n.strip()}
    elsewhere |= {f.split(": ", 1)[1] for f in feats if ": " in f}
    effects: dict[str, Any] = {"cantrips": 0, "cantrip_lists": [], "land": None}
    spells: list[SpellOption] = []
    for step in sorted(steps, key=lambda s: _KIND_ORDER.get(s.kind, 9)):
        spec = rules.CHOICE_KINDS[step.key]
        pick = by_key.get(step.key)
        listed = [n.strip() for n in (pick.picks if pick else []) if n.strip()]
        book = [n.strip() for n in (pick.book if pick else []) if n.strip()]
        if book and not step.book:
            raise ValueError(f"{step.label} is chosen from its list.")
        total = len(listed) + len(book)
        if total < step.count:
            left = step.count - total
            raise ValueError(
                f"{step.label}: choose {'one' if left == 1 else left}"
                f"{'' if left == step.count else ' more'}."
            )
        if total > step.count:
            raise ValueError(f"{step.label}: you choose {step.count} at level {level}.")
        sheet = {f.casefold() for f in feats}
        styles = feat_rules.feat_names(feats, ruleset)
        again = {
            r["name"].casefold()
            for r in rules.choice_options(class_name, step.key)
            if r.get("repeatable")
        }
        for name in listed + book:
            if step.kind == "feat":
                taken = name.casefold() in styles
            elif step.kind in ("option", "spell", "weapon"):
                taken = (
                    name.casefold() not in again
                    and feat_rules.entry(step.key, name, ruleset).casefold() in sheet
                )
            else:
                taken = False
            if taken:
                raise ValueError(f"{step.label}: you already have {name}.")
        if step.kind in ("skill", "expertise"):
            feat_rules.apply_skills(spec, class_name, listed, skills, ruleset)
        elif step.kind == "spell":
            spells += _apply_spell_choice(step, listed, book, feats, ruleset)
        elif step.kind == "weapon":
            # The creator's own check (a mastery weapon this class may master), so a PC
            # built at this level and one levelled to it record the same names.
            listed = feat_rules.mastery_picks(class_name, listed, ruleset)
            feats += [feat_rules.entry(step.key, n, ruleset) for n in listed]
        else:
            feat_rules.apply_options(
                step.key,
                spec,
                class_name,
                level,
                listed,
                book,
                feats,
                cantrips,
                effects,
                ruleset,
                elsewhere,
            )
        for name in book:
            warnings.append(f"{step.label}: {name} is recorded by name. Play it from your book.")
        summary.append(f"{step.label}: " + ", ".join(listed + book))
    return spells


def _land_spells_now(
    db: Session,
    pc: PlayerCharacter,
    dm: str,
    rules: ModuleType,
    class_name: str,
    old: int,
    new: int,
    subclass: Optional[str],
    feats: list[str],
    have: list[GrantedSpell],
) -> list[GrantedSpell]:
    """The circle spells of a land picked on this level-up, not already in ``have``.

    A 2024 Circle of the Land picks its land at Druid 3, the level its first circle spells
    arrive, so the plan can't list them before the pick (Plan 134). ``subclass`` is the one
    the SRD tables may read (None for a homebrew one); ``feats`` hold this level's picks.
    """
    land = _land(rules, feats)
    if land is None or land == _land(rules, list(pc.feats or [])):
        return []
    known = {s.name.casefold() for s in _known_spells(db, pc, dm)}
    known |= {g.name.casefold() for g in have}
    return _always_new(rules, class_name, old, new, subclass, land, known)


def _prepared_room(db: Session, pc: PlayerCharacter, dm: str, cap: int, always: set[str]) -> int:
    """How many more leveled spells a prepared caster may have prepared, up to ``cap``.

    Always-prepared spells (domain, oath, circle) don't count against the number.
    """
    used = 0
    for row in spellcasting_service.list_known_for_character(db, pc.id, dm):
        spell = SpellRepo.get_by_id(db, row.spell_id)
        if spell and spell.level > 0 and row.prepared and spell.name.casefold() not in always:
            used += 1
    return cap - used


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
    rules, srd = _tables(pc)
    ruleset = _ruleset(pc)
    is_2014 = rulesets.is_2014(ruleset)
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
    capped: set[str] = set()  # new picks a 2014 prepared caster prepares only while there's room
    catalog = {s.name.casefold(): s for s in _visible_spells(db, ruleset, dm)}

    # Subclass. Plan 133: the DM's homebrew one is recorded as the DM spelled it.
    hb_subs = _homebrew_subclasses(db, pc, dm, class_name)
    subclass = pc.subclass
    picked_sub = (choices.subclass or "").strip()
    if plan.needs_subclass:
        if picked_sub:
            hb_pick = _homebrew_named(hb_subs, picked_sub)
            subclass = hb_pick.name if hb_pick else picked_sub
            summary.append(f"Subclass: {subclass}")
        else:
            warnings.append("No subclass yet: pick it with your DM.")
    elif picked_sub and picked_sub != (pc.subclass or ""):
        raise ValueError("Your subclass is already set. Ask your DM to change it.")
    hb_sub = _homebrew_named(hb_subs, subclass)
    if hb_sub is not None:
        low = 1 if plan.needs_subclass else new
        gained = [f.name for f in _homebrew_features(hb_sub, low, new)]
        if gained:
            summary.append(f"{hb_sub.name}: " + ", ".join(gained))
    # Plan 131 — what a subclass picked now brings is tagged with it; keep the chosen one's.
    active_choices = [s for s in plan.class_choices if s.subclass in (None, subclass)]
    if choices.class_choices and not is_2014 and not active_choices:
        raise ValueError(f"No class choices to make at level {new}.")
    # Plan 134 — an option picked now that teaches cantrips from another list (Blessed Warrior).
    sent = {p.key: {n.strip().casefold() for n in p.picks} for p in choices.class_choices}
    teaching = [
        o
        for s in active_choices
        for o in s.options
        if o.cantrips and o.name.casefold() in sent.get(s.key, set())
    ]

    # Ability Score Improvement or feat.
    feat_row: dict[str, Any] = {}
    if plan.asi_level:
        if choices.feat is None:
            raise ValueError("Pick your Ability Score Improvement or a feat.")
        inc, feat_spells, feat_row = feat_rules.apply_feat(
            choices.feat, plan.feats, feats, saves, skills, catalog, summary, warnings, ruleset
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
    picked_cantrips: list[str] = []
    picked: list[str] = []  # every spell the spells step picked (new ones and swaps in)
    always: list[GrantedSpell] = []
    if step is None:
        if choices.cantrips or choices.spells or choices.cantrip_swap or choices.spell_swap:
            raise ValueError(f"No new {class_name} spells to pick at level {new}.")
    else:
        pool = {o.name.casefold(): o for o in step.options}
        known = {o.name.casefold(): o for o in step.known}
        # Plan 131 — a choice can teach a cantrip too (the Circle of the Land's Bonus Cantrip).
        # Plan 134 — or one option of it, from its own list (Blessed Warrior: 2 Cleric ones).
        cantrip_cap = (
            step.new_cantrips
            + sum(s.cantrips for s in active_choices)
            + sum(o.cantrips for o in teaching)
        )
        lists = {o.cantrip_list for o in teaching}
        cantrip_pool = dict(pool)
        for option in step.choice_cantrips:
            if any(x in option.classes for x in lists):
                cantrip_pool.setdefault(option.name.casefold(), option)
        cantrips = _validate_spell_list(choices.cantrips, cantrip_cap, cantrip_pool, cantrip=True)
        spells = _validate_spell_list(choices.spells, step.new_spells, pool, cantrip=False)
        picked_cantrips = cantrips
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
            picked.append(into.name)
            summary.append(f"Swapped {out.name} for {into.name}")
        if cantrips:
            summary.append(
                "New cantrip" + ("s" if len(cantrips) > 1 else "") + ": " + ", ".join(cantrips)
            )
        if spells:
            word = "Spellbook" if step.spellbook else "New spell" + ("s" if len(spells) > 1 else "")
            summary.append(f"{word}: " + ", ".join(spells))
        learn = cantrips + spells + learn
        picked += cantrips + spells
        if step.prepared_count is not None:
            capped = {n.casefold() for n in spells}
        open_c, open_s = cantrip_cap - len(cantrips), step.new_spells - len(spells)
        if open_c > 0 or open_s > 0:
            parts = [f"{open_c} cantrip" + ("s" if open_c > 1 else "")] if open_c > 0 else []
            parts += [f"{open_s} spell" + ("s" if open_s > 1 else "")] if open_s > 0 else []
            warnings.append(
                "Still to pick: " + " and ".join(parts) + ". Tell your DM, who can add them."
            )
        always = [g for g in step.always_prepared if g.subclass in (None, subclass)]
        if always and is_2014:
            summary.append("Always prepared: " + ", ".join(g.name for g in always))

    # Plan 131 — the class choices (Pact Boon, Invocations, Metamagic, Expertise...); since
    # Plan 134 the 2024 ones too (Weapon Mastery, Fighting Style, the subclasses' own...).
    if active_choices or choices.class_choices:
        known_cantrips = [s for s in _known_spells(db, pc, dm) if s.level == 0]
        known_cantrips += [
            catalog[n.casefold()] for n in picked_cantrips if n.casefold() in catalog
        ]
        secrets = _apply_choices(
            rules,
            ruleset,
            class_name,
            new,
            active_choices,
            choices.class_choices,
            feats,
            skills,
            known_cantrips,
            summary,
            warnings,
        )
        top = step.max_spell_level if step else 0
        # Spells the PC can cast with its slots join its list; a Mystic Arcanum (6th level and
        # up, cast once a day with no slot) stays a note in its features.
        learn += [s.name for s in secrets if s.level <= top]
    if not is_2014:
        # Plan 134 — a land picked now brings its circle spells now (2024 Druid 3).
        srd_now = None if hb_sub else _srd_subclass(rules, subclass)
        always += _land_spells_now(db, pc, dm, rules, class_name, old, new, srd_now, feats, always)
        free = {g.name.casefold() for g in always}
        for name in picked:
            if name.casefold() in free:
                raise ValueError(f"{name} is always prepared for you: pick a different spell.")
        if always:
            summary.append("Always prepared: " + ", ".join(g.name for g in always))
    learn += [g.name for g in always if g.name.casefold() not in {n.casefold() for n in learn}]
    if len({n.casefold() for n in learn}) != len(learn):
        raise ValueError("The same spell is picked twice.")

    # Hit points (fixed value or a roll, + CON, minimum 1; CON changes are retroactive).
    die = plan.hit_die
    if choices.hp_method == "roll":
        if not choices.hp_roll or choices.hp_roll > die:
            raise ValueError(f"A d{die} roll is 1 to {die}.")
        die_part = choices.hp_roll
    else:
        die_part = die // 2 + 1
    old_con, new_con = _mod(old_scores["CON"]), _mod(new_scores["CON"])
    srd_pc_sub = None if _homebrew_named(hb_subs, pc.subclass) else pc.subclass
    bonus = _hp_bonus_per_level(pc, feats, srd_pc_sub, _homebrew_race_hp(db, pc, dm))
    gain = max(1, die_part + new_con) + bonus + (new_con - old_con) * old
    if feat_row.get("hp_per_level"):
        gain += feat_row["hp_per_level"] * old  # Tough counts every earlier level too
    how = f"rolled {die_part}" if choices.hp_method == "roll" else f"average {die_part}"
    summary.insert(0, f"HP {pc.hp_max} → {pc.hp_max + gain} (+{gain}: d{die} {how})")

    # Armor class: only the part a raised ability (or the Defense style) changes.
    ac = pc.ac
    deltas = {a: _mod(new_scores[a]) - _mod(old_scores[a]) for a in plan.ac_abilities}
    mam_now = "medium armor master" in feat_rules.feat_names(feats, ruleset)
    mam_before = "medium armor master" in feat_rules.feat_names(list(pc.feats or []), ruleset)
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

    # A 2014 prepared caster prepares new picks only while there's room in its daily number
    # (a Wizard's second spellbook spell may wait in the book); counted before the writes.
    room = 0
    if capped and step is not None:
        ability = srd.CLASSES[class_name]["spellcasting"]["ability"]
        cap = srd.spells_prepared(class_name, new, _mod(new_scores[ability]))
        land = _land(rules, feats)
        srd_new_sub = None if hb_sub else _srd_subclass(rules, subclass)
        always_keys = {
            n.casefold() for n, _ in rules.always_prepared(class_name, new, srd_new_sub, land)
        }
        if hb_sub is not None:
            always_keys |= {
                n.casefold()
                for lvl, names in (hb_sub.always_prepared or {}).items()
                if int(lvl) <= new
                for n in names
            }
        room = _prepared_room(db, pc, dm, cap, always_keys)

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
        prepared = True
        if name.casefold() in capped:
            prepared = room > 0
            room -= 1
        spellcasting_service.learn_spell(
            db, pc.id, CharacterSpellCreate(spell_id=spell.id, known=True, prepared=prepared), dm
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
