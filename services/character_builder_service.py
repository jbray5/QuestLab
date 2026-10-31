"""Character builder (Plan 74) — the creator wizard's brain, for players and DMs.

``options`` hands the wizard the SRD compendium; ``create`` validates a
build, derives the sheet (HP, AC, saves, skills, speed), creates the PC
under the campaign owner's identity, learns the chosen spells, grants
class features via the existing level sync, and stocks the starting kit.

Plan 126: the DM gets the same wizard (``options_for_dm`` / ``create_for_dm``:
campaign owner only, no join code, the player sign-up switch doesn't apply),
and a build at level 4+ makes its Ability Score Improvement or feat picks,
validated with the level-up guide's rules (``services.feat_rules``) and applied
before hit points, Armor Class, saves and skills are worked out.

Plan 128: every rule the wizard explains is checked here too. A subclass is required
once the level reaches it; cantrips and prepared spells are picked up to the class's
count; always-prepared spells (Divine Smite, Hunter's Mark, domain and oath spells...)
are added free; the background's Magic Initiate (or a Human's) picks its spells; and
the class's own choices (Fighting Style, Weapon Mastery, Expertise, Divine Order,
Eldritch Invocations, Metamagic...) are made and recorded the way the level-up guide
records picks. The spell list only shows the shared catalog and this DM's homebrew.
"""

import uuid
from typing import Any, Optional

from sqlmodel import Session as DBSession

from db.repos.campaign_repo import CampaignRepo
from db.repos.item_repo import ItemRepo
from db.repos.spell_repo import SpellRepo
from domain.campaign import Campaign
from domain.character import CharacterItemCreate, CharacterSpellCreate
from domain.character_builder import BuilderOptions, BuildResult, CharacterBuild, OriginFeatPicks
from domain.enums import CharacterClass
from domain.spell import Spell
from integrations.dnd_rules import levelup_2024 as rules
from integrations.dnd_rules import srd_character_options_2024 as srd
from services import (
    character_service,
    feat_rules,
    feature_service,
    inventory_service,
    player_service,
    spellcasting_service,
)
from services.auth_service import catalog_visible

_MI = "Magic Initiate"


def options(db: DBSession, campaign_id: uuid.UUID) -> BuilderOptions:
    """The compendium the creator renders, scoped to a campaign (player path).

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign the player is joining.

    Returns:
        BuilderOptions.

    Raises:
        ValueError: If the campaign is unknown.
        PermissionError: If the campaign has player sign-up off.
    """
    return _options(db, _campaign_open(db, campaign_id))


def options_for_dm(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> BuilderOptions:
    """The same compendium for the campaign's DM (Plan 126): no join code, no sign-up switch.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: The signed-in DM.

    Returns:
        BuilderOptions.

    Raises:
        ValueError: If the campaign is unknown.
        PermissionError: If the DM doesn't own the campaign.
    """
    return _options(db, _campaign_owned(db, campaign_id, dm_email))


def _catalog(db: DBSession, campaign: Campaign) -> list[Spell]:
    """The spells this campaign's builds may use: the shared catalog and its DM's homebrew."""
    return [
        s for s in SpellRepo.list_all(db) if catalog_visible(s.created_by_email, campaign.dm_email)
    ]


def _spell_row(s: Spell) -> dict[str, Any]:
    """One spell for the picker: enough to choose by, and the full text a tap away.

    The picker shows the text's opening lines as the summary (worked out in the browser, so the
    payload doesn't carry them twice).
    """
    parts = [c for c, on in (("V", s.components_v), ("S", s.components_s)) if on]
    if s.components_m:
        parts.append(f"M ({s.components_m})")
    text = s.description or ""
    if s.higher_levels:
        text += f"\n\nWith a higher-level slot: {s.higher_levels}"
    return {
        "name": s.name,
        "level": s.level,
        "classes": list(s.classes or []),
        "school": s.school,
        "casting_time": s.casting_time,
        "range": s.range,
        "duration": s.duration,
        "components": ", ".join(parts),
        "concentration": bool(s.is_concentration),
        "ritual": bool(s.is_ritual),
        "damage": bool(s.damage_dice),
        "attack": bool(s.attack_type),
        "text": text,
    }


def _options(db: DBSession, campaign: Campaign) -> BuilderOptions:
    spells = [_spell_row(s) for s in _catalog(db, campaign)]
    weapon_names = {i for c in srd.CLASSES.values() for k in c["kits"] for i in k["items"]}
    weapons = [
        {
            "name": i.name,
            "damage_die": i.damage_die,
            "damage_type": i.damage_type,
            "category": i.weapon_category,
            "properties": list(i.weapon_properties or []),
        }
        for i in ItemRepo.list_all(db)
        if i.name in weapon_names
    ]

    def lists(table: dict[str, dict[str, list[tuple[int, int]]]]) -> dict[str, Any]:
        return {
            k: {key: [list(r) for r in rows] for key, rows in v.items()} for k, v in table.items()
        }

    return BuilderOptions(
        campaign_name=campaign.name,
        species=srd.SPECIES,
        backgrounds=srd.BACKGROUNDS,
        origin_feats=srd.ORIGIN_FEATS,
        classes=srd.CLASSES,
        skills=srd.SKILLS,
        standard_array=srd.STANDARD_ARRAY,
        point_buy_cost=srd.POINT_BUY_COST,
        point_buy_budget=srd.POINT_BUY_BUDGET,
        armor=srd.ARMOR,
        spells=spells,
        weapons=weapons,
        feats=[dict(row) for row in rules.FEATS],
        asi_levels={c: sorted(rules.asi_levels(c)) for c in srd.CLASSES},
        popular_feats={c: list(v) for c, v in rules.POPULAR_FEATS.items()},
        class_features={c: rules.CLASS_LEVEL_FEATURES.get(c, {}) for c in srd.CLASSES},
        subclass_features=rules.SUBCLASS_LEVEL_FEATURES,
        feature_notes=rules.FEATURE_NOTES,
        fighting_style_level=rules.FIGHTING_STYLE_LEVEL,
        caster_subclasses=sorted(rules.CASTER_SUBCLASSES),
        hp_per_level_species=rules.HP_PER_LEVEL_SPECIES,
        hp_per_level_subclass=rules.HP_PER_LEVEL_SUBCLASS,
        unarmored_ac_subclass=rules.UNARMORED_AC_SUBCLASS,
        spell_slots={
            c: [
                character_service.compute_spell_slots(CharacterClass(c), lvl)
                for lvl in range(1, 21)
            ]
            for c in srd.CLASSES
        },
        choice_kinds=rules.CHOICE_KINDS,
        class_choices=lists(rules.CLASS_CHOICES),
        subclass_choices=lists(rules.SUBCLASS_CHOICES),
        fighting_style_extras=rules.FIGHTING_STYLE_EXTRAS,
        mastery_weapons=feat_rules.mastery_weapons(),
        weapon_mastery_filter=rules.WEAPON_MASTERY_FILTER,
        always_prepared_class=rules.ALWAYS_PREPARED_CLASS,
        always_prepared_subclass=rules.ALWAYS_PREPARED_SUBCLASS,
        always_prepared_source=rules.ALWAYS_PREPARED_SOURCE,
        land_spells=rules.LAND_SPELLS,
        extra_spell_lists=rules.EXTRA_SPELL_LISTS,
        class_scales=rules.class_scales(),
    )


def _campaign_open(db: DBSession, campaign_id: uuid.UUID) -> Campaign:
    campaign = CampaignRepo.get_by_id(db, campaign_id)
    if campaign is None:
        raise ValueError("Campaign not found.")
    if not getattr(campaign, "allow_player_signup", True):
        raise PermissionError("This campaign's DM has turned off player sign-up.")
    return campaign


def _campaign_owned(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> Campaign:
    """The DM path: the campaign must exist and belong to ``dm_email`` (fail closed)."""
    campaign = CampaignRepo.get_by_id(db, campaign_id)
    if campaign is None:
        raise ValueError("Campaign not found.")
    if not dm_email or campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You can only add characters to your own campaigns.")
    return campaign


def _validate_scores(build: CharacterBuild) -> dict[str, int]:
    scores = {a: int(build.scores.get(a, 10)) for a in srd.ABILITIES}
    for a, v in scores.items():
        if not 3 <= v <= 20:
            raise ValueError(f"{a} must be between 3 and 20.")
    if build.score_method == "standard":
        if sorted(scores.values()) != sorted(srd.STANDARD_ARRAY):
            raise ValueError("Standard array must use exactly 15, 14, 13, 12, 10, 8.")
    elif build.score_method == "pointbuy":
        if any(v < 8 or v > 15 for v in scores.values()):
            raise ValueError("Point buy scores run from 8 to 15 before background bonuses.")
        spent = sum(srd.POINT_BUY_COST[v] for v in scores.values())
        if spent > srd.POINT_BUY_BUDGET:
            raise ValueError(f"Point buy spends {spent} of {srd.POINT_BUY_BUDGET} points.")
    bonus = {a: int(v) for a, v in build.background_bonus.items() if a in srd.ABILITIES}
    if bonus:
        vals = sorted(bonus.values(), reverse=True)
        if vals not in ([2, 1], [1, 1, 1]):
            raise ValueError("Background bonus is +2 and +1, or +1 to three abilities.")
    for a, v in bonus.items():
        scores[a] = min(20, scores[a] + v)
    return scores


def create(db: DBSession, campaign_id: uuid.UUID, build: CharacterBuild) -> BuildResult:
    """Turn a player's build into a real PC owned by the campaign's DM.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        build: The validated wizard output.

    Returns:
        BuildResult with the new pc_id.

    Raises:
        ValueError: On any invalid choice (scores, skills, class, improvements, spells).
        PermissionError: If player sign-up is off for the campaign.
    """
    return _create(db, _campaign_open(db, campaign_id), build)


def create_for_dm(
    db: DBSession, campaign_id: uuid.UUID, dm_email: str, build: CharacterBuild
) -> BuildResult:
    """The DM builds a character with the same rules (Plan 126).

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: The signed-in DM.
        build: The validated wizard output.

    Returns:
        BuildResult with the new pc_id and its player-link key.

    Raises:
        ValueError: On any invalid choice, or an unknown campaign.
        PermissionError: If the DM doesn't own the campaign.
    """
    return _create(db, _campaign_owned(db, campaign_id, dm_email), build)


def _join(items: list[Any]) -> str:
    """[4] → "4"; [4, 6] → "4 and 6"; [4, 6, 8] → "4, 6 and 8"."""
    words = [str(i) for i in items]
    return words[0] if len(words) == 1 else ", ".join(words[:-1]) + " and " + words[-1]


def _plural(n: int, word: str) -> str:
    return f"{n} {word}{'' if n == 1 else 's'}"


def _apply_improvements(
    build: CharacterBuild,
    class_name: str,
    scores: dict[str, int],
    feats: list[str],
    saves: list[str],
    skills: dict[str, int],
    subclass: Optional[str],
    catalog: dict[str, Spell],
    warnings: list[str],
    taken: Optional[set[str]] = None,
    always: Optional[set[str]] = None,
) -> tuple[list[str], list[str]]:
    """Validate and apply one Ability Score Improvement (or feat) per improvement level.

    Each pick is checked against the build as it stands at that level: the scores after the
    background bonus and the earlier picks, the feats taken so far, armor training and
    spellcasting. ``scores``, ``feats``, ``saves`` and ``skills`` change in place.

    Args:
        taken: Casefolded spells already picked elsewhere (class picks, Magic Initiate).
        always: Casefolded always-prepared spells (a feat can't spend a pick on one).

    Returns:
        (summary lines such as "Level 4: Ability Score Improvement (+2 STR)", feat spells to
        learn).

    Raises:
        ValueError: If the picks don't match the improvement levels or break a rule.
    """
    level = build.level
    due = sorted(lvl for lvl in rules.asi_levels(class_name) if lvl <= level)
    picks = sorted(build.asi, key=lambda p: p.level)
    if [p.level for p in picks] != due:
        if not due:
            first = min(rules.asi_levels(class_name))
            raise ValueError(
                f"A level {level} {class_name} has no Ability Score Improvement yet: "
                f"the first comes at level {first}."
            )
        many = len(due) != 1
        raise ValueError(
            f"A level {level} {class_name} has {len(due)} Ability Score Improvement"
            + ("s (levels " if many else " (level ")
            + _join(due)
            + "): choose +2/+1 or a feat for each."
        )
    summary_out: list[str] = []
    feat_spells: list[str] = []
    picked_spells: list[str] = []
    for pick in picks:
        options = feat_rules.feat_options(class_name, pick.level, scores, feats, subclass)
        summary: list[str] = []
        try:
            inc, spells, row = feat_rules.apply_feat(
                pick, options, feats, saves, skills, catalog, summary, warnings
            )
        except ValueError as exc:
            raise ValueError(f"Level {pick.level}: {exc}") from exc
        for ability, v in inc.items():
            if scores[ability] + v > 20:
                raise ValueError(
                    f"Level {pick.level}: {ability} is {scores[ability]}, and 20 is the most."
                )
            scores[ability] += v
        fixed = list(row.get("fixed_spells") or [])
        feat_spells += spells
        picked_spells += spells[len(fixed) :]
        summary_out += [f"Level {pick.level}: {line}" for line in summary]
    # A feat's spell pick can't double up a class pick (a fixed spell you already know just
    # stays known, as the book says for Telekinetic's Mage Hand).
    class_picks = {n.strip().casefold() for n in build.cantrips + build.spells if n.strip()}
    class_picks |= taken or set()
    seen: set[str] = set()
    for name in picked_spells:
        key = name.casefold()
        if key in class_picks or key in seen:
            raise ValueError(f"{name} is picked twice: choose a different spell for the feat.")
        if key in (always or set()):
            raise ValueError(
                f"{name} is always prepared for you: choose a different spell for the feat."
            )
        seen.add(key)
    return summary_out, feat_spells


def _armor_class(
    class_name: str,
    scores: dict[str, int],
    kit: Optional[dict[str, Any]],
    feats: list[str],
    subclass: Optional[str],
    warnings: list[str],
) -> int:
    """Armor Class from the kit's armor and shield, or the class's unarmored defense."""
    dex_mod = srd.ability_mod(scores["DEX"])
    taken = feat_rules.feat_names(feats)
    armor_name = kit["armor"] if kit else None
    shield = bool(kit and kit.get("shield"))
    if armor_name and armor_name in srd.ARMOR:
        a = srd.ARMOR[armor_name]
        cap = a["dex_cap"]
        if a["category"] == "medium" and "medium armor master" in taken:
            cap = 3
        ac = a["base"] + (dex_mod if cap is None else min(dex_mod, cap))
        if a.get("str_min") and scores["STR"] < a["str_min"]:
            warnings.append(
                f"{armor_name} wants Strength {a['str_min']} — speed drops by 10 ft. until then."
            )
        # The Defense fighting style: +1 while wearing armor.
        ac += sum(f["ac_bonus_in_armor"] for f in rules.FEATS if f["name"].casefold() in taken)
    else:
        ac = 10 + dex_mod
        if class_name == "Barbarian":
            ac = 10 + dex_mod + srd.ability_mod(scores["CON"])
        elif class_name == "Monk" and not shield:
            ac = 10 + dex_mod + srd.ability_mod(scores["WIS"])
        extra = rules.UNARMORED_AC_SUBCLASS.get(subclass or "")
        if extra:
            ac = max(ac, 10 + dex_mod + srd.ability_mod(scores[extra]))
    if shield:
        ac += srd.SHIELD_BONUS
    return ac


def _origin_picks(
    feat: str,
    fixed_list: Optional[str],
    picks: Optional[OriginFeatPicks],
    full: bool,
    skills: dict[str, int],
    catalog: dict[str, Spell],
    warnings: list[str],
) -> tuple[str, list[str]]:
    """Check an Origin feat's own picks (Plan 128) and fold its skills into ``skills``.

    Magic Initiate: a spell list (fixed by the background, or chosen for a Human's feat), two
    cantrips and one level 1 spell from it. Skilled: three skills you aren't trained in. Other
    Origin feats have nothing to pick.

    Args:
        feat: The feat's name ("Magic Initiate", "Skilled", "Alert"...).
        fixed_list: The spell list a background names ("Magic Initiate (Cleric)" → "Cleric").
        picks: What the wizard sent for this feat.
        full: The wizard's build (Plan 128): missing picks are refused, not just flagged.
        skills: Skill proficiencies so far.
        catalog: The campaign's spell catalog by casefolded name.
        warnings: Lines the player should read.

    Returns:
        (the feat as it goes on the sheet, e.g. "Magic Initiate (Cleric)", spells to learn).

    Raises:
        ValueError: On a wrong list, spell or skill, or (``full``) a missing pick.
    """
    row = rules.FEATS_BY_NAME.get(feat.casefold())
    if row is None:
        return feat, []
    picks = picks or OriginFeatPicks()
    if row["name"] == _MI:
        choice = fixed_list or picks.choice
        if fixed_list and picks.choice and picks.choice != fixed_list:
            raise ValueError(f"This Magic Initiate uses the {fixed_list} list.")
        options = row["choice"]["options"]
        if not choice:
            if full:
                raise ValueError(
                    "Magic Initiate: pick its spell list (" + " or ".join(options) + ")."
                )
            warnings.append("Magic Initiate: pick its spell list and spells on the sheet.")
            return _MI, []
        if choice not in options:
            raise ValueError("Magic Initiate's list is " + " or ".join(options) + ".")
        label = f"{_MI} ({choice})"
        try:
            chosen, _left = feat_rules.assign_spell_picks(
                list(picks.spells), row["spell_picks"], choice, catalog
            )
        except ValueError as exc:
            raise ValueError(f"{label}: {exc}") from exc
        needed = sum(
            min(
                int(spec["count"]),
                sum(
                    1
                    for s in catalog.values()
                    if s.level == spec["level"] and choice in (s.classes or [])
                ),
            )
            for spec in row["spell_picks"]
        )
        if len(chosen) < needed:
            msg = f"{label}: pick two cantrips and one level 1 spell from the {choice} list."
            if full:
                raise ValueError(msg)
            warnings.append(msg.replace("pick", "still to pick", 1) + " Add them on the sheet.")
        return label, chosen
    sp = row["skill_pick"]
    if sp:
        names = list(dict.fromkeys(n.strip() for n in picks.skills if n.strip()))
        if len(names) > sp["count"]:
            raise ValueError(f"{row['name']} gives {sp['count']} skills.")
        for s in names:
            if s not in srd.SKILLS:
                raise ValueError(f"{row['name']}: {s} isn't a skill.")
            if skills.get(s, 0) >= 1:
                raise ValueError(f"{row['name']}: you're already trained in {s}.")
            skills[s] = 1
        if len(names) < sp["count"]:
            left = sp["count"] - len(names)
            if full:
                raise ValueError(f"{row['name']}: pick {_plural(left, 'more skill')}.")
            warnings.append(f"{row['name']}: {_plural(left, 'skill')} still to pick on the sheet.")
        return row["name"], []
    if picks.choice or picks.spells or picks.skills:
        raise ValueError(f"{row['name']} has nothing to pick.")
    return row["name"], []


def _class_spells(
    names: list[str],
    *,
    cap: int,
    cantrip: bool,
    lists: set[str],
    max_level: int,
    always: set[str],
    catalog: dict[str, Spell],
    full: bool,
    who: str,
    warnings: list[str],
) -> list[Spell]:
    """Check class cantrip or spell picks against the class's lists, level and count.

    The count must reach ``cap`` (or every spell the catalog has, if fewer). In a ``full``
    build every rule is refused in plain words; an older caller gets warnings and the picks
    that fit (the pre-Plan-128 behaviour).
    """
    label = "cantrip" if cantrip else "spell"

    def refuse(msg: str) -> None:
        if full:
            raise ValueError(msg)
        warnings.append(msg)

    out: list[Spell] = []
    seen: set[str] = set()
    for raw in names:
        name = (raw or "").strip()
        if not name:
            continue
        spell = catalog.get(name.casefold())
        if spell is None:
            refuse(f"{name} isn't in the spell list.")
            continue
        key = spell.name.casefold()
        if key in seen:
            refuse(f"{spell.name} is picked twice.")
            continue
        seen.add(key)
        if cantrip and spell.level != 0:
            refuse(f"{spell.name} isn't a cantrip.")
            continue
        if not cantrip and not 1 <= spell.level <= max_level:
            refuse(
                f"{spell.name} isn't a spell you can prepare yet."
                if spell.level > max_level
                else f"{spell.name} is a cantrip: pick it with the cantrips."
            )
            continue
        if not lists & set(spell.classes or []):
            refuse(f"{spell.name} isn't a {' or '.join(sorted(lists))} spell.")
            continue
        if key in always:
            refuse(f"{spell.name} is always prepared for you: pick a different {label}.")
            continue
        out.append(spell)
    if len(out) > cap:
        if full:
            raise ValueError(f"{who} has {_plural(cap, label)}: pick {cap}.")
        warnings.append("Some spell picks were over the class limit and were dropped.")
        out = out[:cap]
    available = sum(
        1
        for s in catalog.values()
        if (s.level == 0 if cantrip else 1 <= s.level <= max_level)
        and lists & set(s.classes or [])
        and s.name.casefold() not in always
    )
    need = min(cap, available)
    if full and len(out) < need:
        left = need - len(out)
        raise ValueError(f"Spells: pick {_plural(left, 'more ' + label)}. {who} has {cap}.")
    return out


def _create(db: DBSession, campaign: Campaign, build: CharacterBuild) -> BuildResult:
    """Validate a build, derive the sheet and create the PC (shared by both paths)."""
    warnings: list[str] = []
    full = build.class_choices is not None  # the Plan 128 wizard: every choice is checked

    class_name = build.character_class.strip().title()
    if class_name not in srd.CLASSES:
        raise ValueError(f"Unknown class {build.character_class!r}.")
    cls = srd.CLASSES[class_name]
    scores = _validate_scores(build)
    level = build.level

    # Species: SRD or "from my book" (free text keeps the name; no traits assumed).
    species_row = next(
        (s for s in srd.SPECIES if s["name"].lower() == build.species.strip().lower()), None
    )
    speed = species_row["speed"] if species_row else 30
    if species_row is None:
        warnings.append(f"Species {build.species!r} isn't in the SRD — traits are yours to track.")
    race = species_row["name"] if species_row else build.species.strip()

    # Subclass: required once the level reaches it (Plan 128), an SRD one or a book's by name.
    subclass = (build.subclass or "").strip() or None
    sub_level = cls["subclass_level"]
    if subclass is None and level >= sub_level:
        raise ValueError(
            f"A {class_name} picks a subclass at level {sub_level}: choose one for this level "
            f"{level} character, or type the one from your book."
        )
    if subclass and level < sub_level:
        warnings.append(f"Subclass recorded; it comes online at level {sub_level}.")
    if subclass and subclass not in cls["srd_subclasses"]:
        warnings.append(f"Subclass {subclass!r} isn't in the SRD — features are yours to track.")
    active_subclass = subclass if subclass and level >= sub_level else None

    # Background: SRD or free text.
    bg = next(
        (b for b in srd.BACKGROUNDS if b["name"].lower() == build.background.strip().lower()), None
    )
    if bg is None:
        warnings.append(
            f"Background {build.background!r} isn't in the SRD — no automatic skills or feat."
        )
    if full and bg:
        if not build.background_bonus:
            raise ValueError(
                f"Choose where {bg['name']}'s ability bonus goes: +2 and +1, or three +1s."
            )
        outside = [a for a, v in build.background_bonus.items() if v and a not in bg["abilities"]]
        if outside:
            raise ValueError(
                f"{bg['name']} can only raise " + _join(bg["abilities"]) + f", not {outside[0]}."
            )

    # Skills: class picks must come from the class list, in the allowed number.
    # A species bonus (Human's Skillful, Elf's Keen Senses) adds exactly one more
    # pick, and only that one may sit off the class list (Plan 83).
    allowed = set(cls["skills"]["from"])
    class_picks = [s for s in build.skills if s in srd.SKILLS]
    bg_skills = set(bg["skills"]) if bg else set()
    extra_allowed = int((species_row or {}).get("bonus_skill_choices", 0) or 0)
    extra_from = set((species_row or {}).get("bonus_skill_from") or [])
    class_only = [s for s in class_picks if s not in bg_skills]
    off_list = [s for s in class_only if s not in allowed]
    if len(off_list) > extra_allowed:
        raise ValueError(f"{off_list[-1]} isn't on the {class_name} skill list.")
    if len(class_only) > cls["skills"]["choose"] + extra_allowed:
        raise ValueError(
            f"{class_name} picks {cls['skills']['choose']} skills from its list"
            + (f", plus {extra_allowed} more from your species." if extra_allowed else ".")
        )
    if full and len(class_only) < cls["skills"]["choose"] + extra_allowed:
        left = cls["skills"]["choose"] + extra_allowed - len(class_only)
        raise ValueError(f"Pick {_plural(left, 'more skill')}.")
    if extra_from:
        bad = [s for s in off_list if s not in extra_from]
        over = len(class_only) > cls["skills"]["choose"]
        if bad or (over and not any(s in extra_from for s in class_only)):
            raise ValueError(
                "Your species' extra skill must be one of " + ", ".join(sorted(extra_from)) + "."
            )
    skill_profs: dict[str, int] = {s: 1 for s in class_picks}
    for s in bg_skills:
        skill_profs[s] = 1
    saves = list(cls["saves"])

    catalog = {s.name.casefold(): s for s in _catalog(db, campaign)}

    # Feats so far: the background's origin feat, and a Human's Versatile pick, each with its
    # own picks (Plan 128: Magic Initiate's spells, Skilled's skills).
    origin_feat = (build.origin_feat or "").strip() or None
    if origin_feat:
        if origin_feat not in {f["name"] for f in srd.ORIGIN_FEATS}:
            raise ValueError(f"{origin_feat} isn't an Origin feat.")
        if species_row is not None and not species_row.get("bonus_origin_feat"):
            warnings.append(f"Only a Human picks an extra Origin feat; {origin_feat} was left off.")
            origin_feat = None
    elif full and species_row and species_row.get("bonus_origin_feat"):
        raise ValueError(f"A {species_row['name']} picks an Origin feat (Versatile).")
    feat_names: list[str] = []
    origin_spells: list[str] = []
    bg_list: Optional[str] = None
    if bg:
        bg_feat = bg["feat"].split(" (")[0]
        bg_list = bg["feat"][len(bg_feat) + 2 : -1] if "(" in bg["feat"] else None
        label, spells = _origin_picks(
            bg_feat, bg_list, build.background_feat_picks, full, skill_profs, catalog, warnings
        )
        feat_names.append(label)
        origin_spells += spells
    if origin_feat:
        row = rules.FEATS_BY_NAME.get(origin_feat.casefold())
        if origin_feat.casefold() in feat_rules.feat_names(feat_names) and not (
            row and row["repeatable"]
        ):
            raise ValueError(f"Your background already gives {origin_feat}: pick another feat.")
        if (
            origin_feat == _MI
            and bg_list
            and (build.origin_feat_picks or OriginFeatPicks()).choice == bg_list
        ):
            raise ValueError(
                f"Your background's Magic Initiate already uses the {bg_list} list: pick another."
            )
        label, spells = _origin_picks(
            origin_feat, None, build.origin_feat_picks, full, skill_profs, catalog, warnings
        )
        feat_names.append(label)
        origin_spells += spells
    _no_twice(origin_spells)

    # Plan 128 — the class's own choices, recorded the way the level-up guide records picks.
    choice_lines: list[str] = []
    effects: dict[str, Any] = {"cantrips": 0, "cantrip_lists": [], "land": None}
    counts = rules.class_choice_counts(class_name, level, active_subclass)
    if full:
        picks_by_key: dict[str, tuple[list[str], list[str]]] = {}
        for p in build.class_choices or []:
            if p.key not in rules.CHOICE_KINDS:
                raise ValueError(f"Unknown class choice {p.key!r}.")
            if p.key in picks_by_key:
                raise ValueError(f"{rules.CHOICE_KINDS[p.key]['label']} is sent twice.")
            picks_by_key[p.key] = (list(p.picks), list(p.book))
        cantrip_rows = [catalog[n.casefold()] for n in build.cantrips if n.casefold() in catalog]
        effects = feat_rules.apply_class_choices(
            class_name,
            level,
            active_subclass,
            picks_by_key,
            feat_names,
            skill_profs,
            cantrip_rows,
            choice_lines,
            warnings,
        )
    elif counts:
        labels = [rules.CHOICE_KINDS[k]["label"] for k in counts]
        warnings.append("Still to choose on the sheet: " + ", ".join(labels) + ".")

    # Always-prepared spells (Plan 128): free, and off the prepared count.
    always = rules.always_prepared(class_name, level, active_subclass, effects["land"])
    always_keys = {name.casefold() for name, _src in always}
    for name in origin_spells:
        if name.casefold() in always_keys:
            raise ValueError(f"{name} is always prepared for you: pick a different spell.")

    # Plan 126 — Ability Score Improvements and feats, before any number is derived: a CON
    # increase raises HP at every level, a DEX increase raises AC, saves and skills.
    asi_summary, feat_spells = _apply_improvements(
        build,
        class_name,
        scores,
        feat_names,
        saves,
        skill_profs,
        active_subclass,
        catalog,
        warnings,
        taken={n.casefold() for n in origin_spells},
        always=always_keys,
    )

    # Spells: only what the class lists allow, up to (and, for the wizard, exactly) the counts.
    sc = cls["spellcasting"]
    picked: list[Spell] = []
    who = f"A level {level} {class_name}"
    if sc or effects["cantrips"]:
        cantrip_cap = srd.cantrips_known(class_name, level) + int(effects["cantrips"])
        picked += _class_spells(
            build.cantrips,
            cap=cantrip_cap,
            cantrip=True,
            lists={class_name, *effects["cantrip_lists"]},
            max_level=0,
            always=always_keys,
            catalog=catalog,
            full=full,
            who=who,
            warnings=warnings,
        )
        picked += _class_spells(
            build.spells,
            cap=srd.spells_prepared(class_name, level),
            cantrip=False,
            lists={class_name, *rules.extra_spell_lists(class_name, level)},
            max_level=srd.max_spell_level(class_name, level),
            always=always_keys,
            catalog=catalog,
            full=full,
            who=who,
            warnings=warnings,
        )
    elif build.cantrips or build.spells:
        if full:
            raise ValueError(f"A {class_name} doesn't cast spells: leave the spell picks empty.")
        warnings.append(f"{class_name} doesn't cast spells at level {level}; spell picks ignored.")
    _no_twice([s.name for s in picked] + origin_spells)

    # Hit points (2024): the full die at level 1 and the fixed value after, each level adding
    # the CON modifier (at least 1 a level), plus Tough / Dwarven Toughness / Draconic Resilience.
    con_mod = srd.ability_mod(scores["CON"])
    hd = cls["hit_die"]
    hp = max(1, hd + con_mod) + max(1, hd // 2 + 1 + con_mod) * (level - 1)
    hp += level * feat_rules.hp_bonus_per_level(race, active_subclass, feat_names)
    hp = max(1, hp)

    kit = next(
        (k for k in cls["kits"] if k["name"] == build.kit), cls["kits"][0] if cls["kits"] else None
    )
    ac = _armor_class(class_name, scores, kit, feat_names, active_subclass, warnings)

    try:
        class_enum = CharacterClass(class_name)
    except ValueError as exc:
        raise ValueError(f"Unknown class {class_name!r}.") from exc

    pc = character_service.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=campaign.dm_email,
        player_name=build.player_name.strip(),
        character_name=build.character_name.strip(),
        race=race,
        character_class=class_enum,
        level=level,
        score_str=scores["STR"],
        score_dex=scores["DEX"],
        score_con=scores["CON"],
        score_int=scores["INT"],
        score_wis=scores["WIS"],
        score_cha=scores["CHA"],
        hp_max=hp,
        hp_current=hp,
        ac=ac,
        speed=speed,
        subclass=subclass,
        background=(bg["name"] if bg else build.background.strip()),
        saving_throw_proficiencies=saves,
        skill_proficiencies=skill_profs,
        feats=feat_names or None,
        backstory=build.backstory or None,
        notes=_notes(
            species_row,
            bg,
            origin_feat,
            kit,
            asi_summary,
            choices=choice_lines,
            always=[name for name, _src in always],
        ),
    )
    pc_id = uuid.UUID(str(pc.id))
    dm = campaign.dm_email

    if build.appearance:
        try:
            player_service.set_appearance(db, pc_id, build.appearance)
        except Exception:  # noqa: BLE001 — appearance is cosmetic; never fail a build on it
            warnings.append("Appearance note wasn't saved; add it from your sheet.")

    # Learn everything once: always-prepared, class picks, feat spells, Magic Initiate's.
    learned: set[str] = set()

    def learn(name: str) -> None:
        spell = catalog.get(name.casefold())
        if spell is None:
            warnings.append(f"{name} isn't in the spell catalog yet: ask your DM to add it.")
            return
        if spell.name.casefold() in learned:
            return
        learned.add(spell.name.casefold())
        spellcasting_service.learn_spell(
            db, pc_id, CharacterSpellCreate(spell_id=spell.id, known=True, prepared=True), dm
        )

    for name, _src in always:
        learn(name)
    for spell in picked:
        learn(spell.name)
    for name in feat_spells + origin_spells:
        learn(name)

    granted = feature_service.sync_for_level(db, pc_id, dm)

    # Starting kit: catalog weapons + the armor/shield as inventory rows.
    if kit:
        items = {i.name: i for i in ItemRepo.list_all(db)}
        wanted = (
            kit["items"]
            + ([kit["armor"]] if kit["armor"] else [])
            + (["Shield"] if kit.get("shield") else [])
        )
        missing: list[str] = []
        for name in wanted:
            row = items.get(name)
            if row is None:
                missing.append(name)
                continue
            try:
                inventory_service.add_item(
                    db, pc_id, CharacterItemCreate(item_id=row.id, quantity=1, equipped=True), dm
                )
            except Exception:  # noqa: BLE001 — gear is a convenience; the sheet is the point
                missing.append(name)
        if missing:
            warnings.append(
                "Not in the catalog yet, so add from your sheet or ask your DM: "
                + ", ".join(missing)
            )

    attend_newest_session(db, campaign.id, pc.id)

    return BuildResult(
        pc_id=str(pc.id),
        play_key=pc.play_token or str(pc.id),
        character_name=pc.character_name,
        hp_max=hp,
        ac=ac,
        features_granted=granted,
        warnings=warnings,
    )


def _no_twice(names: list[str]) -> None:
    """The same spell can't be picked twice across the class's picks and Magic Initiate's."""
    seen: set[str] = set()
    for name in names:
        if name.casefold() in seen:
            raise ValueError(f"{name} is picked twice: choose a different spell.")
        seen.add(name.casefold())


def attend_newest_session(db: DBSession, campaign_id: uuid.UUID, pc_id: uuid.UUID) -> None:
    """Put a freshly built PC on the newest session that hasn't been played yet (Plan 85).

    A player who builds from the join link on Thursday should be in Thursday's
    HUD without the DM ticking a box.
    """
    from db.repos.adventure_repo import AdventureRepo
    from db.repos.session_repo import SessionRepo
    from domain.enums import SessionStatus

    sessions = []
    for adventure in AdventureRepo.list_by_campaign(db, campaign_id):
        sessions.extend(SessionRepo.list_by_adventure(db, adventure.id))
    open_sessions = [g for g in sessions if g.status != SessionStatus.COMPLETE]
    if not open_sessions:
        return
    target = max(open_sessions, key=lambda g: (g.session_number, g.id.hex))
    ids = [str(x) for x in (target.attending_pc_ids or [])]
    if str(pc_id) in ids:
        return
    target.attending_pc_ids = ids + [str(pc_id)]
    db.add(target)
    db.commit()


def _notes(
    species_row: dict[str, Any] | None,
    bg: dict[str, Any] | None,
    feat: str | None,
    kit,
    improvements: Optional[list[str]] = None,
    choices: Optional[list[str]] = None,
    always: Optional[list[str]] = None,
) -> str:
    lines = ["Built with the QuestLab character creator (SRD 5.2.1)."]
    if species_row:
        lines.append(f"{species_row['name']} traits: " + " ".join(species_row["traits"]))
    if bg:
        lines.append(f"Background {bg['name']}: feat {bg['feat']}; tool {bg['tool']}.")
    if feat:
        lines.append(f"Origin feat (Versatile): {feat}.")
    if kit:
        lines.append(f"Starting kit: {kit['name']}.")
    if choices:
        lines.append("Class choices: " + "; ".join(choices) + ".")
    if always:
        lines.append("Always prepared: " + ", ".join(always) + ".")
    if improvements:
        lines.append("Ability Score Improvements and feats: " + "; ".join(improvements) + ".")
    return "\n".join(lines)
