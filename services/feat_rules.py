"""Feat and Ability Score Improvement rules (Plan 126) — shared by the level-up guide and the
character creator.

Plan 115 wrote these inside ``levelup_service``. The creator needs the same rules for a PC
built at level 4 or higher (one pick per Ability Score Improvement level it has already
passed), so they live here and both services call them. Pure functions: no I/O, no session.
The data (feat catalog, class tables) stays in ``integrations/dnd_rules/levelup_2024.py``.
"""

from typing import Any, Optional

from domain.level_up import FeatChoice, FeatOption
from domain.spell import Spell
from integrations.dnd_rules import levelup_2024 as rules
from integrations.dnd_rules import srd_character_options_2024 as srd

ASI = "Ability Score Improvement"
_CATEGORY_ORDER = {"general": 0, "fighting_style": 1, "origin": 2}


def feat_names(feats: list[str]) -> set[str]:
    """Casefolded base feat names on a sheet ("Elemental Adept (Fire)" → "elemental adept")."""
    return {rules.base_feat_name(f).casefold() for f in feats}


def is_caster(class_name: str, subclass: Optional[str]) -> bool:
    """True when the class (or a third-caster subclass) has Spellcasting or Pact Magic."""
    cls = srd.CLASSES.get(class_name)
    if cls and cls["spellcasting"]:
        return True
    return any(s.casefold() in (subclass or "").casefold() for s in rules.CASTER_SUBCLASSES)


def armor_training(class_name: str, feats: list[str]) -> set[str]:
    """Armor categories the class trains, widened by the armor-training feats on the sheet."""
    out = set(srd.CLASSES.get(class_name, {}).get("armor", []))
    names = feat_names(feats)
    if "lightly armored" in names:
        out |= {"light", "shields"}
    if "moderately armored" in names:
        out |= {"medium", "shields"}
    if "heavily armored" in names:
        out.add("heavy")
    return out


def has_fighting_style(class_name: str, level: int, feats: list[str]) -> bool:
    """True once the class has its Fighting Style feature, or a Fighting Style feat is taken."""
    at = rules.FIGHTING_STYLE_LEVEL.get(class_name)
    if at is not None and level >= at:
        return True
    styles = {f["name"].casefold() for f in rules.FEATS if f["category"] == "fighting_style"}
    return bool(feat_names(feats) & styles)


def hp_bonus_per_level(race: Optional[str], subclass: Optional[str], feats: list[str]) -> int:
    """Extra max HP each level brings: Tough, Dwarven Toughness, Draconic Resilience."""
    names = feat_names(feats)
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
) -> list[FeatOption]:
    """Every catalog feat with whether this PC may take it at ``level``, best picks first.

    Args:
        class_name: The PC's class.
        level: The level the pick is made at (an Ability Score Improvement level).
        scores: Ability scores before this pick (the book checks prerequisites against them).
        feats: Feat names already on the sheet.
        subclass: The PC's subclass, if any (third-casters count as casters).

    Returns:
        FeatOption rows: qualifying popular picks first, then the rest, locked ones last.
    """
    popular = rules.POPULAR_FEATS.get(class_name, [])
    training = armor_training(class_name, feats)
    style = has_fighting_style(class_name, level, feats)
    caster = is_caster(class_name, subclass)
    out: list[FeatOption] = []
    for row in rules.FEATS:
        ok, reason = rules.feat_qualifies(
            row,
            scores=scores,
            is_caster=caster,
            armor_training=training,
            has_fighting_style=style,
            current_feats=feats,
        )
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
            )
        )
    rank = {name: i for i, name in enumerate(popular)}
    out.sort(
        key=lambda f: (
            not f.ok,
            rank.get(f.name, len(rank)),
            _CATEGORY_ORDER.get(f.category, 9),
            f.name,
        )
    )
    return out


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

    Returns:
        (ability increase, spells to learn, the catalog row — empty for a book feat).

    Raises:
        ValueError: If the feat is unknown, its prerequisite isn't met, or a sub-pick is wrong.
    """
    if fc.from_book:
        name = fc.name.strip()
        if name.casefold() in feat_names(feats) and name.casefold() != ASI.casefold():
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
        raise ValueError(f"Unknown feat {fc.name!r}. Pick 'From my book' for others.")
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
