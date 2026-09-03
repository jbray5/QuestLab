"""Character builder (Plan 74) — the player-facing creator's brain.

``options`` hands the wizard the SRD compendium; ``create`` validates a
build, derives the sheet (HP, AC, saves, skills, speed), creates the PC
under the campaign owner's identity, learns the chosen spells, grants
class features via the existing level sync, and stocks the starting kit.
"""

import uuid
from typing import Any

from sqlmodel import Session as DBSession

from db.repos.campaign_repo import CampaignRepo
from db.repos.item_repo import ItemRepo
from db.repos.spell_repo import SpellRepo
from domain.character import CharacterItemCreate, CharacterSpellCreate
from domain.character_builder import BuilderOptions, BuildResult, CharacterBuild
from domain.enums import CharacterClass
from integrations.dnd_rules import srd_character_options_2024 as srd
from services import (
    character_service,
    feature_service,
    inventory_service,
    player_service,
    spellcasting_service,
)


def options(db: DBSession, campaign_id: uuid.UUID) -> BuilderOptions:
    """The compendium the creator renders, scoped to a campaign.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign the player is joining.

    Returns:
        BuilderOptions.

    Raises:
        ValueError: If the campaign is unknown or has player sign-up off.
    """
    campaign = _campaign_open(db, campaign_id)
    spells = [
        {"name": s.name, "level": s.level, "classes": list(s.classes or []), "school": s.school}
        for s in SpellRepo.list_all(db)
    ]
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
    )


def _campaign_open(db: DBSession, campaign_id: uuid.UUID):
    campaign = CampaignRepo.get_by_id(db, campaign_id)
    if campaign is None:
        raise ValueError("Campaign not found.")
    if not getattr(campaign, "allow_player_signup", True):
        raise PermissionError("This campaign's DM has turned off player sign-up.")
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
    """Turn a build into a real PC owned by the campaign's DM.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        build: The validated wizard output.

    Returns:
        BuildResult with the new pc_id.

    Raises:
        ValueError: On any invalid choice (scores, skills, class, spells).
        PermissionError: If player sign-up is off for the campaign.
    """
    campaign = _campaign_open(db, campaign_id)
    warnings: list[str] = []

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

    # Subclass gate: only at the class's subclass level.
    subclass = (build.subclass or "").strip() or None
    if subclass and level < cls["subclass_level"]:
        warnings.append(f"Subclass recorded; it comes online at level {cls['subclass_level']}.")
    if subclass and subclass not in cls["srd_subclasses"]:
        warnings.append(f"Subclass {subclass!r} isn't in the SRD — features are yours to track.")

    # Background: SRD or free text.
    bg = next(
        (b for b in srd.BACKGROUNDS if b["name"].lower() == build.background.strip().lower()), None
    )
    if bg is None:
        warnings.append(
            f"Background {build.background!r} isn't in the SRD — no automatic skills or feat."
        )

    # Skills: class picks must come from the class list, in the allowed number.
    allowed = set(cls["skills"]["from"])
    class_picks = [s for s in build.skills if s in srd.SKILLS]
    bg_skills = set(bg["skills"]) if bg else set()
    extra_allowed = (species_row or {}).get("bonus_skill_choices", 0)
    class_only = [s for s in class_picks if s not in bg_skills]
    if len([s for s in class_only if s in allowed]) > cls["skills"]["choose"] + extra_allowed:
        raise ValueError(f"{class_name} picks {cls['skills']['choose']} skills from its list.")
    for s in class_only:
        if s not in allowed and extra_allowed == 0:
            raise ValueError(f"{s} isn't on the {class_name} skill list.")
    skill_profs: dict[str, int] = {s: 1 for s in class_picks}
    for s in bg_skills:
        skill_profs[s] = 1

    # Derived numbers.
    con_mod = srd.ability_mod(scores["CON"])
    dex_mod = srd.ability_mod(scores["DEX"])
    hd = cls["hit_die"]
    hp = hd + con_mod + (hd // 2 + 1 + con_mod) * (level - 1)
    hp += level * (species_row or {}).get("hp_per_level_bonus", 0)
    feat_names = [bg["feat"].split(" (")[0]] if bg else []
    if build.origin_feat:
        feat_names.append(build.origin_feat)
    if "Tough" in feat_names:
        hp += 2 * level
    hp = max(1, hp)

    kit = next(
        (k for k in cls["kits"] if k["name"] == build.kit), cls["kits"][0] if cls["kits"] else None
    )
    armor_name = kit["armor"] if kit else None
    ac = 10 + dex_mod
    if armor_name and armor_name in srd.ARMOR:
        a = srd.ARMOR[armor_name]
        dex_part = dex_mod if a["dex_cap"] is None else min(dex_mod, a["dex_cap"])
        ac = a["base"] + dex_part
        if a.get("str_min") and scores["STR"] < a["str_min"]:
            warnings.append(
                f"{armor_name} wants Strength {a['str_min']} — speed drops by 10 ft. until then."
            )
    if kit and kit.get("shield"):
        ac += srd.SHIELD_BONUS
    if class_name == "Monk" and not armor_name:
        ac = 10 + dex_mod + srd.ability_mod(scores["WIS"])
    if class_name == "Barbarian" and not armor_name:
        ac = 10 + dex_mod + con_mod

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
        race=(species_row["name"] if species_row else build.species.strip()),
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
        saving_throw_proficiencies=list(cls["saves"]),
        skill_proficiencies=skill_profs,
        feats=feat_names or None,
        backstory=build.backstory or None,
        notes=_notes(species_row, bg, build.origin_feat, kit),
    )
    pc_id = uuid.UUID(str(pc.id))
    dm = campaign.dm_email

    if build.appearance:
        try:
            player_service.set_appearance(db, pc_id, build.appearance)
        except Exception:  # noqa: BLE001 — appearance is cosmetic; never fail a build on it
            warnings.append("Appearance note wasn't saved; add it from your sheet.")

    # Spells: only what the class list allows, within the SRD caps.
    sc = cls["spellcasting"]
    if sc:
        cap_cantrips = srd.cantrips_known(class_name, level)
        cap_spells = srd.spells_prepared(class_name, level)
        max_lvl = srd.max_spell_level(class_name, level)
        picked_c = [n for n in build.cantrips if n][:cap_cantrips]
        picked_s = [n for n in build.spells if n][:cap_spells]
        if len(build.cantrips) > cap_cantrips or len(build.spells) > cap_spells:
            warnings.append("Some spell picks were over the class limit and were dropped.")
        for name in picked_c + picked_s:
            spell = SpellRepo.get_by_name(db, name)
            if spell is None:
                warnings.append(f"Spell {name!r} isn't in the catalog.")
                continue
            if class_name not in (spell.classes or []):
                warnings.append(f"{name} isn't a {class_name} spell — skipped.")
                continue
            if spell.level > max_lvl:
                warnings.append(f"{name} is above your spell level — skipped.")
                continue
            spellcasting_service.learn_spell(
                db, pc_id, CharacterSpellCreate(spell_id=spell.id, known=True, prepared=True), dm
            )
    elif build.cantrips or build.spells:
        warnings.append(f"{class_name} doesn't cast spells at level {level}; spell picks ignored.")

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

    return BuildResult(
        pc_id=str(pc.id),
        character_name=pc.character_name,
        hp_max=hp,
        ac=ac,
        features_granted=granted,
        warnings=warnings,
    )


def _notes(
    species_row: dict[str, Any] | None, bg: dict[str, Any] | None, feat: str | None, kit
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
    return "\n".join(lines)
