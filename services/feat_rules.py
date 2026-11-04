"""Feat and Ability Score Improvement rules (Plan 126) — shared by the level-up guide and the
character creator.

Plan 115 wrote these inside ``levelup_service``. The creator needs the same rules for a PC
built at level 4 or higher (one pick per Ability Score Improvement level it has already
passed), so they live here and both services call them. Pure functions: no I/O, no session.
The data (feat catalog, class tables) stays in ``integrations/dnd_rules/levelup_2024.py``.

Plan 131: every function that reads those tables takes ``ruleset`` ("2024", the default, or
"2014") and reads that edition's tables through ``rulesets``; the 2014 modules have the same
names and shapes.

Plan 135: the campaign DM's homebrew feats (``homebrew_rows``) are catalog rows too, in both
editions, passed in as ``homebrew`` by the creator and the level-up guide so both offer and
apply them the same way:

- "general" and "origin" feats are offered at every Ability Score Improvement (the 2024
  rules let an Origin feat be taken there; the 2014 rules have no Origin feats, so one is
  simply a feat).
- "epic_boon" feats only from level 19 (``EPIC_BOON_LEVEL``), in both editions.
- "fighting_style" feats join the Fighting Style class choice (``choice_rows``) and, like the
  rules' styles, are taken at an improvement only in 2024 and only with the Fighting Style
  feature.
- The +1 follows ``asi_options`` (None, "any" or ability codes), capped at 20 by the caller;
  ``repeatable`` lets the feat be taken again. The free-text prerequisite is shown, never
  checked. The feat goes on the sheet by name.
"""

from types import ModuleType
from typing import Any, Iterable, Optional

from domain.homebrew import HomebrewFeatRead
from domain.level_up import FeatChoice, FeatOption
from domain.spell import Spell
from integrations.dnd_rules import rulesets

ASI = "Ability Score Improvement"
EPIC_BOON_LEVEL = 19
_CATEGORY_ORDER = {"general": 0, "fighting_style": 1, "origin": 2, "epic_boon": 3}
_BLURB_FALLBACK = 160  # a feat with no blurb shows the start of its text, this long at most


def homebrew_row(feat: HomebrewFeatRead) -> dict[str, Any]:
    """One homebrew feat as a rules ``FEATS`` row, marked ``homebrew`` (Plan 135).

    Every rule key the catalog rows have is present (no spells, skills or choices: a DM's
    feat says those in its text). A fighting style needs the Fighting Style feature, as the
    rules' styles do; the free-text prerequisite is only shown. The extra keys are
    ``homebrew``, ``description``, ``prerequisite`` and ``power_attack`` (a plain dict).
    """
    blurb = feat.blurb.strip()
    if not blurb:
        text = " ".join(feat.description.split())
        blurb = text if len(text) <= _BLURB_FALLBACK else text[: _BLURB_FALLBACK - 1] + "…"
    return {
        "name": feat.name,
        "category": feat.category,
        "blurb": blurb,
        "prereq": {"fighting_style": True} if feat.category == "fighting_style" else {},
        "asi_options": feat.asi_options,
        "save_prof": False,
        "fixed_spells": [],
        "spell_picks": [],
        "skill_pick": None,
        "expertise_pick": 0,
        "choice": None,
        "hp_per_level": 0,
        "ac_bonus_in_armor": 0,
        "repeatable": bool(feat.repeatable),
        "srd": False,
        "homebrew": True,
        "description": feat.description,
        "prerequisite": feat.prerequisite,
        "power_attack": feat.power_attack.model_dump() if feat.power_attack else None,
    }


def homebrew_rows(feats: Iterable[HomebrewFeatRead]) -> list[dict[str, Any]]:
    """The campaign DM's homebrew feats as ``FEATS`` rows (``homebrew_row``), in order."""
    return [homebrew_row(f) for f in feats]


def choice_rows(
    class_name: str,
    key: str,
    ruleset: Any = "2024",
    homebrew: Optional[list[dict[str, Any]]] = None,
) -> list[dict[str, Any]]:
    """A class choice's listed options; the Fighting Style choice adds the DM's styles.

    Plan 135: a homebrew "fighting_style" feat is offered to every class whose Fighting Style
    choice lists feats (``kind`` "feat"), marked ``homebrew``. Other choices are unchanged.
    """
    rules = rulesets.levelup(ruleset)
    rows = list(rules.choice_options(class_name, key))
    if not homebrew or rules.CHOICE_KINDS.get(key, {}).get("kind") != "feat":
        return rows
    have = {r["name"].casefold() for r in rows}
    rows += [
        {"name": r["name"], "blurb": r["blurb"], "srd": False, "homebrew": True}
        for r in homebrew
        if r["category"] == "fighting_style" and r["name"].casefold() not in have
    ]
    return rows


def _tables(ruleset: Any) -> tuple[ModuleType, ModuleType]:
    """(level-up tables, character-option tables) for one edition."""
    return rulesets.levelup(ruleset), rulesets.options(ruleset)


def feat_names(feats: list[str], ruleset: Any = "2024") -> set[str]:
    """Casefolded base feat names on a sheet ("Elemental Adept (Fire)" → "elemental adept")."""
    rules = rulesets.levelup(ruleset)
    return {rules.base_feat_name(f).casefold() for f in feats}


def is_caster(class_name: str, subclass: Optional[str], ruleset: Any = "2024") -> bool:
    """True when the class (or a third-caster subclass) has Spellcasting or Pact Magic."""
    rules, srd = _tables(ruleset)
    cls = srd.CLASSES.get(class_name)
    if cls and cls["spellcasting"]:
        return True
    return any(s.casefold() in (subclass or "").casefold() for s in rules.CASTER_SUBCLASSES)


def armor_training(
    class_name: str,
    feats: list[str],
    ruleset: Any = "2024",
    subclass: Optional[str] = None,
) -> set[str]:
    """Armor categories the class trains, widened by the armor-training feats on the sheet.

    Plan 128: a Cleric's Divine Order (Protector) or a Druid's Primal Order (Warden), recorded
    as "Divine Order: Protector" in ``feats``, widens it too (2024 only; 2014 has no Orders).
    Plan 131: a 2014 subclass can add armor too (the Life Domain's heavy armor).
    """
    rules, srd = _tables(ruleset)
    sub = (subclass or "").casefold()
    out_sub = {
        a
        for name, armor in getattr(rules, "SUBCLASS_ARMOR", {}).items()
        if sub and name.casefold() in sub
        for a in armor
    }
    out = set(srd.CLASSES.get(class_name, {}).get("armor", [])) | out_sub
    names = feat_names(feats, ruleset)
    if "lightly armored" in names:
        out |= {"light", "shields"}
    if "moderately armored" in names:
        out |= {"medium", "shields"}
    if "heavily armored" in names:
        out.add("heavy")
    for key in ("divine_order", "primal_order"):
        spec = rules.CHOICE_KINDS.get(key)
        if spec is None:
            continue
        for opt in spec["options"]:
            if entry(key, opt["name"], ruleset).casefold() in names:
                out |= set(opt.get("armor") or [])
    return out


def has_fighting_style(
    class_name: str,
    level: int,
    feats: list[str],
    ruleset: Any = "2024",
    homebrew: Optional[list[dict[str, Any]]] = None,
) -> bool:
    """True once the class has its Fighting Style feature, or a Fighting Style feat is taken.

    Plan 135: the campaign DM's homebrew fighting styles count as Fighting Style feats.
    """
    rules = rulesets.levelup(ruleset)
    at = rules.FIGHTING_STYLE_LEVEL.get(class_name)
    if at is not None and level >= at:
        return True
    styles = {
        f["name"].casefold()
        for f in [*rules.FEATS, *(homebrew or [])]
        if f["category"] == "fighting_style"
    }
    return bool(feat_names(feats, ruleset) & styles)


def hp_bonus_per_level(
    race: Optional[str], subclass: Optional[str], feats: list[str], ruleset: Any = "2024"
) -> int:
    """Extra max HP each level brings: Tough, Dwarven Toughness, Draconic Resilience."""
    rules = rulesets.levelup(ruleset)
    names = feat_names(feats, ruleset)
    bonus = sum(
        f["hp_per_level"]
        for f in rules.FEATS
        if f["hp_per_level"] and f["name"].casefold() in names
    )
    species = (race or "").casefold()
    bonus += sum(
        n for sp, n in rules.HP_PER_LEVEL_SPECIES.items() if species.startswith(sp.casefold())
    )
    sub = (subclass or "").casefold()
    bonus += sum(n for sc, n in rules.HP_PER_LEVEL_SUBCLASS.items() if sc.casefold() in sub)
    return bonus


def feat_options(
    class_name: str,
    level: int,
    scores: dict[str, int],
    feats: list[str],
    subclass: Optional[str],
    ruleset: Any = "2024",
    homebrew: Optional[list[dict[str, Any]]] = None,
) -> list[FeatOption]:
    """Every catalog feat with whether this PC may take it at ``level``, best picks first.

    Args:
        class_name: The PC's class.
        level: The level the pick is made at (an Ability Score Improvement level).
        scores: Ability scores before this pick (the book checks prerequisites against them).
        feats: Feat names already on the sheet.
        subclass: The PC's subclass, if any (third-casters count as casters).
        ruleset: Plan 131 — the edition whose feat catalog to offer.
        homebrew: Plan 135 — the campaign DM's feats (``homebrew_rows``), offered too.

    Returns:
        FeatOption rows: qualifying popular picks first, then the DM's homebrew, then the
        rest, locked ones last.
    """
    rules = rulesets.levelup(ruleset)
    popular = rules.POPULAR_FEATS.get(class_name, [])
    training = armor_training(class_name, feats, ruleset, subclass)
    style = has_fighting_style(class_name, level, feats, ruleset, homebrew)
    caster = is_caster(class_name, subclass, ruleset)
    out: list[FeatOption] = []
    for row in [*rules.FEATS, *(homebrew or [])]:
        ok, reason = rules.feat_qualifies(
            row,
            scores=scores,
            is_caster=caster,
            armor_training=training,
            has_fighting_style=style,
            current_feats=feats,
        )
        if ok and row["category"] == "epic_boon" and level < EPIC_BOON_LEVEL:
            ok, reason = False, f"An epic boon comes at level {EPIC_BOON_LEVEL}."
        out.append(
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
                repeatable=row["repeatable"],
                homebrew=bool(row.get("homebrew")),
                description=row.get("description", ""),
                prerequisite=row.get("prerequisite", ""),
                power_attack=row.get("power_attack"),
            )
        )
    rank = {name: i for i, name in enumerate(popular)}
    out.sort(
        key=lambda f: (
            not f.ok,
            rank.get(f.name, len(rank)),
            not f.homebrew,
            _CATEGORY_ORDER.get(f.category, 9),
            f.name,
        )
    )
    return out


def _homebrew_option(options: list[FeatOption], name: str) -> Optional[FeatOption]:
    """The campaign DM's homebrew feat called ``name`` among ``options`` (ignoring case)."""
    key = name.strip().casefold()
    return next((f for f in options if f.homebrew and f.name.casefold() == key), None)


def increase(
    asi: dict[str, int], allowed: list[str], *, feat: str, total: int, max_each: int
) -> dict[str, int]:
    """Validate an ability increase's shape: which abilities, how much each, how much in all.

    Raises:
        ValueError: If an ability isn't allowed or the amounts don't add up.
    """
    picks = {a: int(v) for a, v in asi.items() if int(v)}
    if any(a not in allowed for a in picks):
        raise ValueError(f"{feat} can raise only " + ", ".join(allowed) + ".")
    if any(v < 0 or v > max_each for v in picks.values()) or sum(picks.values()) != total:
        if feat == ASI:
            raise ValueError("Ability Score Improvement is +2 to one score or +1 to two.")
        raise ValueError(f"{feat} gives +1 to one ability: pick which.")
    return picks


def assign_spell_picks(
    names: list[str], specs: list[dict[str, Any]], choice: Optional[str], catalog: dict[str, Spell]
) -> tuple[list[str], int]:
    """Match feat spell picks to the feat's pick rules; returns (spell names, picks left).

    Raises:
        ValueError: If a named spell fits none of the feat's picks.
    """
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


def apply_feat(
    fc: FeatChoice,
    options: list[FeatOption],
    feats: list[str],
    saves: list[str],
    skills: dict[str, int],
    catalog: dict[str, Spell],
    summary: list[str],
    warnings: list[str],
    ruleset: Any = "2024",
) -> tuple[dict[str, int], list[str], dict[str, Any]]:
    """Validate a feat (or Ability Score Improvement) pick and fold it into the sheet lists.

    ``feats``, ``saves``, ``skills``, ``summary`` and ``warnings`` are updated in place. The
    caller applies the returned increase to the scores (and checks the cap of 20).

    Args:
        fc: The pick.
        options: ``feat_options`` for this PC at this level (eligibility already worked out).
        feats: Feat names on the sheet so far.
        saves: Saving-throw proficiencies so far.
        skills: Skill proficiencies so far (1 proficient, 2 expertise).
        catalog: Spell catalog by casefolded name.
        summary: Lines describing what changed.
        warnings: Lines the player should read.
        ruleset: Plan 131 — the edition whose feat catalog the pick comes from.

    Returns:
        (ability increase, spells to learn, the catalog row — empty for a book feat).

    Raises:
        ValueError: If the feat is unknown, its prerequisite isn't met, or a sub-pick is wrong.

    Plan 135: the campaign DM's homebrew feats are found among ``options`` (``feat_options``
    with ``homebrew``), checked and applied like the rules' own; a book entry can't borrow a
    homebrew feat's name (pick it from the list instead).
    """
    rules, srd = _tables(ruleset)
    if fc.from_book:
        name = fc.name.strip()
        if _homebrew_option(options, name) is not None:
            raise ValueError(f"{name} is one of your DM's feats: pick it from the list.")
        if name.casefold() in feat_names(feats, ruleset) and name.casefold() != ASI.casefold():
            raise ValueError(f"You already have {name}.")
        inc = {}
        if fc.asi:
            inc = increase(fc.asi, rules.ABILITIES, feat=name, total=1, max_each=1)
        feats.append(name)
        summary.append(f"Feat: {name} (from your book)")
        warnings.append(f"{name} is recorded by name: play it from your book.")
        return inc, [], {}

    row = rules.FEATS_BY_NAME.get(fc.name.strip().casefold())
    if row is None:
        own = _homebrew_option(options, fc.name)
        if own is None:
            raise ValueError(f"Unknown feat {fc.name!r}. Pick 'From my book' for others.")
        row = own.model_dump()
    opt = next(f for f in options if f.name == row["name"])
    if not opt.ok:
        raise ValueError(f"{row['name']}: {opt.reason}")

    if row["name"] == ASI:
        inc = increase(fc.asi, rules.ABILITIES, feat=ASI, total=2, max_each=2)
    elif opt.asi_options:
        inc = increase(fc.asi, opt.asi_options, feat=row["name"], total=1, max_each=1)
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
    if row["name"] != ASI:
        feats.append(label)

    if row["save_prof"]:
        ability = next(iter(inc))
        if ability in saves:
            raise ValueError(f"You're already proficient in {ability} saves: pick another ability.")
        saves.append(ability)

    spells = [s for s in row["fixed_spells"]]
    if row["spell_picks"]:
        picked, left = assign_spell_picks(fc.spells, row["spell_picks"], fc.choice, catalog)
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


# ── Class choices (Plan 128) ──────────────────────────────────────────────────
# The creator asks for the class's own choices (Fighting Style, Weapon Mastery, Expertise,
# Divine/Primal Order, Eldritch Invocations, Metamagic and the SRD subclasses' ones). The rules
# live here, next to the feat rules, so the level-up guide can ask for the same choices later.

_KIND_ORDER = {"skill": 0, "expertise": 1, "feat": 2, "option": 3, "weapon": 4}


def entry(key: str, name: str, ruleset: Any = "2024") -> str:
    """How a class choice is written in ``feats``: "Divine Order: Protector"."""
    spec = rulesets.levelup(ruleset).CHOICE_KINDS[key]
    return f"{spec.get('record') or spec['label']}: {name}"


def mastery_weapons(ruleset: Any = "2024") -> list[dict[str, Any]]:
    """Every SRD weapon with a mastery property: name, category, properties, mastery.

    Plan 131: the 2014 rules have no Weapon Mastery, so a 2014 table gets an empty list.
    """
    if rulesets.is_2014(ruleset):
        return []
    from integrations.dnd_rules.srd_weapons_2024 import SRD_WEAPONS_2024

    return [
        {
            "name": w.name,
            "category": w.weapon_category or "",
            "properties": list(w.weapon_properties or []),
            "mastery": w.mastery,
        }
        for w in SRD_WEAPONS_2024
        if w.mastery
    ]


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def apply_class_choices(
    class_name: str,
    level: int,
    subclass: Optional[str],
    picks: dict[str, tuple[list[str], list[str]]],
    feats: list[str],
    skills: dict[str, int],
    cantrips: list[Spell],
    summary: list[str],
    warnings: list[str],
    ruleset: Any = "2024",
    homebrew: Optional[list[dict[str, Any]]] = None,
) -> dict[str, Any]:
    """Validate the class's choices at ``level`` and record them on the sheet lists.

    Each choice must have exactly its count of picks (``rules.class_choice_counts``), from its
    list (or named "from my book" where the book is allowed), with its prerequisites met.
    Skills land in ``skills`` (1 trained, 2 expertise); a Fighting Style feat in ``feats`` by
    name; anything else in ``feats`` as "Label: Choice". ``feats``, ``skills``, ``summary`` and
    ``warnings`` change in place.

    Args:
        class_name: The class.
        level: The starting level.
        subclass: The subclass, once it has arrived.
        picks: ``{choice key: (listed names, names from the player's book)}``.
        feats: Feat names on the sheet so far.
        skills: Skill proficiencies so far.
        cantrips: The class cantrips picked (an invocation may need a damaging one).
        summary: Lines describing what was chosen.
        warnings: Lines the player should read.
        ruleset: Plan 131 — the edition whose class choices apply.
        homebrew: Plan 135 — the campaign DM's feats; its fighting styles join the Fighting
            Style choice (``choice_rows``).

    Returns:
        Effects for the rest of the build: ``{"cantrips": extra cantrip count,
        "cantrip_lists": [class lists they come from], "land": the Circle's land or None}``.

    Raises:
        ValueError: On a missing, extra, unknown or locked pick, in plain words.
    """
    rules = rulesets.levelup(ruleset)
    counts = rules.class_choice_counts(class_name, level, subclass)
    for key in picks:
        if key not in counts:
            label = rules.CHOICE_KINDS.get(key, {}).get("label", key)
            raise ValueError(f"A level {level} {class_name} has no {label} to choose.")
    effects: dict[str, Any] = {"cantrips": 0, "cantrip_lists": [], "land": None}
    # Plan 131: a 2014 invocation can need the Pact Boon, which is its own choice: picked now,
    # or on an earlier level, where it's recorded as "Pact Boon: Pact of the Blade".
    elsewhere: set[str] = set()
    if rulesets.is_2014(ruleset):
        elsewhere = {n.strip() for named, _ in picks.values() for n in named if n and n.strip()}
        elsewhere |= {f.split(": ", 1)[1] for f in feats if ": " in f}
    order = sorted(counts, key=lambda k: _KIND_ORDER.get(rules.CHOICE_KINDS[k]["kind"], 9))
    for key in order:
        spec = rules.CHOICE_KINDS[key]
        label, kind, count = spec["label"], spec["kind"], counts[key]
        listed_raw, book_raw = picks.get(key, ([], []))
        listed = [n.strip() for n in listed_raw if n and n.strip()]
        book = [n.strip() for n in book_raw if n and n.strip()]
        if book and not spec.get("book"):
            raise ValueError(f"{label} is chosen from its list.")
        total = len(listed) + len(book)
        if total < count:
            raise ValueError(f"{label}: {_missing(kind, count - total, count)}")
        if total > count:
            raise ValueError(f"{label}: a level {level} {class_name} chooses {count}.")
        if kind in ("skill", "expertise"):
            apply_skills(spec, class_name, listed, skills, ruleset)
            summary.append(f"{label}: " + ", ".join(listed))
        elif kind == "weapon":
            names = mastery_picks(class_name, listed, ruleset)
            feats += [entry(key, n, ruleset) for n in names]
            summary.append(f"{label}: " + ", ".join(names))
        else:
            apply_options(
                key,
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
                homebrew,
            )
            for name in book:
                warnings.append(f"{label}: {name} is recorded by name. Play it from your book.")
            summary.append(f"{label}: " + ", ".join(listed + book))
    return effects


def apply_options(
    key: str,
    spec: dict[str, Any],
    class_name: str,
    level: int,
    listed: list[str],
    book: list[str],
    feats: list[str],
    cantrips: list[Spell],
    effects: dict[str, Any],
    ruleset: Any = "2024",
    elsewhere: Optional[set[str]] = None,
    homebrew: Optional[list[dict[str, Any]]] = None,
) -> None:
    """Check listed options (and their prerequisites) and record them with the book entries.

    ``elsewhere`` holds names picked under other choices or already on the sheet, which a
    prerequisite may name (Plan 131: a 2014 invocation's Pact Boon). ``homebrew`` (Plan 135)
    adds the campaign DM's fighting styles to a Fighting Style choice.
    """
    label, kind = spec["label"], spec["kind"]
    options = {o["name"].casefold(): o for o in choice_rows(class_name, key, ruleset, homebrew)}
    rows = []
    for name in listed:
        row = options.get(name.casefold())
        if row is None:
            hint = " Pick From my book for others." if spec.get("book") else ""
            raise ValueError(f"{label}: {name} isn't one of the choices.{hint}")
        rows.append(row)
    no_repeats(label, [r["name"] for r in rows if not r.get("repeatable")])
    chosen = {r["name"] for r in rows} | (elsewhere or set())
    for row in rows:
        _check_prereq(label, row, level, chosen, cantrips)
        if kind == "feat" and row["name"].casefold() in feat_names(feats, ruleset):
            raise ValueError(f"{label}: you already have {row['name']}.")
        extra = row.get("cantrips")
        if extra:
            effects["cantrips"] += int(extra["count"])
            if extra["list"] not in effects["cantrip_lists"]:
                effects["cantrip_lists"].append(extra["list"])
        if key == "land":
            effects["land"] = row["name"]
        if kind == "feat" and not extra:
            feats.append(row["name"])  # a Fighting Style feat, as the guide records feats
        else:
            feats.append(entry(key, row["name"], ruleset))
    for name in book:
        feats.append(name if kind == "feat" else entry(key, name, ruleset))


def mastery_picks(class_name: str, listed: list[str], ruleset: Any = "2024") -> list[str]:
    """Catalog names of the weapon kinds picked for Weapon Mastery, checked for the class."""
    rules = rulesets.levelup(ruleset)
    weapons = {w["name"].casefold(): w for w in mastery_weapons(ruleset)}
    names = []
    for name in listed:
        w = weapons.get(name.casefold())
        if w is None:
            raise ValueError(f"Weapon Mastery: {name} isn't a weapon with a mastery property.")
        if not rules.mastery_weapon_ok(class_name, w["category"], w["properties"]):
            raise ValueError(f"Weapon Mastery: a {class_name} can't master the {w['name']}.")
        names.append(w["name"])
    no_repeats("Weapon Mastery", names)
    return names


def _missing(kind: str, n: int, count: int) -> str:
    if count == 1 and n == 1:
        return "choose one."
    if kind == "weapon":
        return f"choose {_plural(n, 'more kind')} of weapon."
    if kind == "expertise":
        return f"choose {_plural(n, 'more skill')} you're trained in."
    if kind == "skill":
        return f"choose {_plural(n, 'more skill')}."
    return f"choose {n} more."


def no_repeats(label: str, names: list[str]) -> None:
    """Refuse a name picked twice in one choice (case-insensitive).

    Raises:
        ValueError: "<label>: <name> is picked twice."
    """
    seen: set[str] = set()
    for name in names:
        if name.casefold() in seen:
            raise ValueError(f"{label}: {name} is picked twice.")
        seen.add(name.casefold())


def apply_skills(
    spec: dict[str, Any],
    class_name: str,
    names: list[str],
    skills: dict[str, int],
    ruleset: Any = "2024",
) -> None:
    """Check skill or expertise picks against the choice's pool and record them in ``skills``.

    Used by the creator (through ``apply_class_choices``) and by the 2014 level-up guide,
    which checks only a level's new picks.

    Raises:
        ValueError: On an unknown skill, one outside the pool, or one already trained.
    """
    srd = rulesets.options(ruleset)
    label, kind = spec["label"], spec["kind"]
    pool = spec.get("pool")
    if pool == "class":
        pool = srd.CLASSES[class_name]["skills"]["from"]
    no_repeats(label, names)
    for name in names:
        if name not in srd.SKILLS:
            raise ValueError(f"{label}: {name} isn't a skill.")
        if pool and name not in pool:
            raise ValueError(f"{label}: pick from " + ", ".join(pool) + ".")
        have = int(skills.get(name, 0) or 0)
        if kind == "expertise":
            if have < 1:
                raise ValueError(f"{label}: you need to be trained in {name} first.")
            if have >= 2:
                raise ValueError(f"{label}: you already have expertise in {name}.")
            skills[name] = 2
        else:
            if have >= 1:
                raise ValueError(f"{label}: you're already trained in {name}.")
            skills[name] = 1


def _check_prereq(
    label: str, row: dict[str, Any], level: int, chosen: set[str], cantrips: list[Spell]
) -> None:
    need = row.get("level")
    if need and level < need:
        raise ValueError(f"{label}: {row['name']} needs Warlock level {need}.")
    req = row.get("requires")
    if req and req.casefold() not in {c.casefold() for c in chosen}:
        raise ValueError(f"{label}: {row['name']} needs {req}.")
    want = row.get("cantrip")
    if want == "damage" and not any(s.damage_dice for s in cantrips):
        raise ValueError(f"{label}: {row['name']} needs a Warlock cantrip that deals damage.")
    if want == "attack" and not any(s.damage_dice and s.attack_type for s in cantrips):
        raise ValueError(
            f"{label}: {row['name']} needs a Warlock cantrip that deals damage with an attack."
        )
    # Plan 131: a 2014 invocation names its cantrip ("Eldritch Blast").
    if (
        want
        and want not in ("damage", "attack")
        and not any(s.name.casefold() == want.casefold() for s in cantrips)
    ):
        raise ValueError(f"{label}: {row['name']} needs the {want} cantrip.")
