"""Homebrew races and subclasses (Plan 133): a DM's own character options.

A DM makes races and subclasses in the "Races & subclasses" catalog. Every character built in
that DM's campaigns can pick them (``for_campaign``), players on the join link included.

Rules enforced here:

- **Ownership (SEC-003).** A row is stamped with its author. Lists show only the caller's own
  rows (there are no shared homebrew rows: the SRD options live in ``integrations``). Only
  the author or an admin changes or deletes one (``auth_service.require_catalog_editor``).
- **Names.** Unique per DM within each table, ignoring case. A name that is already an SRD
  race (or 2014 subrace, which the sheet stores as the race: "Hill Dwarf") or an SRD
  subclass of either edition is refused too, so the builder never meets two options with
  one name. Refusals are ``HomebrewConflictError`` (409) in plain words.
- **In use.** Characters refer to a race or subclass by name. While a character in the
  author's campaigns uses one, it can't be deleted, renamed, moved to another class, or
  narrowed to a ruleset that character doesn't play by. The refusal names up to three of
  them.
"""

import re
import uuid
from typing import Any, Optional

from sqlmodel import Session

from db.repos.homebrew_repo import HomebrewRaceRepo, HomebrewSubclassRepo
from domain.homebrew import (
    HomebrewConflictError,
    HomebrewNotFoundError,
    HomebrewRace,
    HomebrewRaceCreate,
    HomebrewRaceRead,
    HomebrewRaceUpdate,
    HomebrewSubclass,
    HomebrewSubclassCreate,
    HomebrewSubclassRead,
    HomebrewSubclassUpdate,
    RaceTemplate,
    RaceTrait,
    check_race_total,
)
from integrations.dnd_rules import rulesets
from services.auth_service import require_catalog_editor

# ── Authorization ───────────────────────────────────────────────────────────


def _require_dm(email: Optional[str]) -> str:
    """The signed-in DM's email, normalised; refuse an anonymous caller (fail closed).

    Raises:
        PermissionError: If there is no identity.
    """
    if not email or not email.strip():
        raise PermissionError("Sign in to make homebrew.")
    return email.strip().lower()


# ── Races ───────────────────────────────────────────────────────────────────


def list_races(db: Session, email: str, ruleset: Any = None) -> list[HomebrewRaceRead]:
    """The caller's own homebrew races, by name.

    Args:
        db: Active database session.
        email: The signed-in DM.
        ruleset: "2024"/"2014" (or a Ruleset) keeps that edition's races plus those valid in
            both; None lists them all.

    Returns:
        The races.

    Raises:
        PermissionError: If there is no identity.
        ValueError: If ``ruleset`` is not a known ruleset.
    """
    me = _require_dm(email)
    rows = HomebrewRaceRepo.list_for_owner(db, me, _edition(ruleset))
    return [HomebrewRaceRead.model_validate(r) for r in rows]


def create_race(db: Session, payload: HomebrewRaceCreate, email: str) -> HomebrewRaceRead:
    """Make a homebrew race, stamped as the caller's.

    Args:
        db: Active database session.
        payload: The validated race.
        email: The authoring DM.

    Returns:
        The new race.

    Raises:
        PermissionError: If there is no identity.
        HomebrewConflictError: If the name is an SRD race or one of the DM's own.
    """
    me = _require_dm(email)
    _require_free_race_name(db, payload.name, me)
    return HomebrewRaceRead.model_validate(HomebrewRaceRepo.create(db, payload, me))


def update_race(
    db: Session, race_id: uuid.UUID, payload: HomebrewRaceUpdate, email: str
) -> HomebrewRaceRead:
    """Change a homebrew race the caller made (or any, for an admin).

    Args:
        db: Active database session.
        race_id: UUID of the race.
        payload: The fields to change.
        email: The requesting DM.

    Returns:
        The updated race.

    Raises:
        PermissionError: If there is no identity, or the race is another DM's.
        HomebrewNotFoundError: If there is no such race.
        HomebrewConflictError: If the new name is taken, or the change would cut off a
            character that uses the race.
        ValueError: If the merged bonuses pass +4 in all.
    """
    me = _require_dm(email)
    race = _get_race(db, race_id)
    require_catalog_editor(race.created_by_email, me)
    patch = payload.model_dump(exclude_unset=True)
    check_race_total(
        patch.get("ability_bonuses", race.ability_bonuses or {}),
        patch["ability_choice"] if "ability_choice" in patch else race.ability_choice,
    )
    renamed = "name" in patch and patch["name"].casefold() != race.name.casefold()
    if renamed:
        _require_free_race_name(db, patch["name"], race.created_by_email, skip=race.id)
    users = HomebrewRaceRepo.users(db, race.created_by_email, race.name)
    _refuse_cutting_off(
        race.name, users, renamed, False, patch.get("ruleset", race.ruleset), "race"
    )
    return HomebrewRaceRead.model_validate(HomebrewRaceRepo.update(db, race, patch))


def delete_race(db: Session, race_id: uuid.UUID, email: str) -> None:
    """Delete a homebrew race, unless a character in the author's campaigns uses it.

    Args:
        db: Active database session.
        race_id: UUID of the race.
        email: The requesting DM.

    Raises:
        PermissionError: If there is no identity, or the race is another DM's.
        HomebrewNotFoundError: If there is no such race.
        HomebrewConflictError: If a character uses it (the message names who).
    """
    me = _require_dm(email)
    race = _get_race(db, race_id)
    require_catalog_editor(race.created_by_email, me)
    users = HomebrewRaceRepo.users(db, race.created_by_email, race.name)
    if users:
        raise HomebrewConflictError(_in_use(race.name, [n for n, _ in users], "delete", "race"))
    HomebrewRaceRepo.delete(db, race)


def race_templates(ruleset: Any = None) -> list[RaceTemplate]:
    """The SRD races laid out as homebrew races, to start a new one from ("Copy and edit").

    Each 2014 subrace comes as its own template ("Hill Dwarf": the Dwarf plus the subrace's
    bonuses, traits and hit points). "Darkvision 60 ft." and "Languages — ..." traits move
    into their own fields. The rows are not checked: the SRD Human's +6 is over a homebrew
    race's +4, and the form says so.

    Args:
        ruleset: "2024"/"2014" for one edition; None for both (2024 first).

    Returns:
        One template per SRD race (and 2014 subrace).

    Raises:
        ValueError: If ``ruleset`` is not a known ruleset.
    """
    editions = rulesets.RULESETS if ruleset is None else (rulesets.normalize(ruleset),)
    out: list[RaceTemplate] = []
    for edition in editions:
        for species in rulesets.options(edition).SPECIES:
            out.append(_template(species, None, edition))
            for sub in species.get("subraces") or []:
                out.append(_template(species, sub, edition))
    return out


# ── Subclasses ──────────────────────────────────────────────────────────────


def list_subclasses(
    db: Session, email: str, character_class: Optional[str] = None, ruleset: Any = None
) -> list[HomebrewSubclassRead]:
    """The caller's own homebrew subclasses, by class then name.

    Args:
        db: Active database session.
        email: The signed-in DM.
        character_class: A class name ("Paladin", any case) to keep only its subclasses.
        ruleset: "2024"/"2014" keeps that edition's subclasses plus those valid in both.

    Returns:
        The subclasses.

    Raises:
        PermissionError: If there is no identity.
        ValueError: If the class or the ruleset is unknown.
    """
    me = _require_dm(email)
    cls = _class_name(character_class) if character_class else None
    rows = HomebrewSubclassRepo.list_for_owner(db, me, _edition(ruleset), cls)
    return [HomebrewSubclassRead.model_validate(r) for r in rows]


def create_subclass(
    db: Session, payload: HomebrewSubclassCreate, email: str
) -> HomebrewSubclassRead:
    """Make a homebrew subclass, stamped as the caller's.

    Args:
        db: Active database session.
        payload: The validated subclass.
        email: The authoring DM.

    Returns:
        The new subclass.

    Raises:
        PermissionError: If there is no identity.
        HomebrewConflictError: If the name is an SRD subclass or one of the DM's own.
    """
    me = _require_dm(email)
    _require_free_subclass_name(db, payload.name, me)
    return HomebrewSubclassRead.model_validate(HomebrewSubclassRepo.create(db, payload, me))


def update_subclass(
    db: Session, subclass_id: uuid.UUID, payload: HomebrewSubclassUpdate, email: str
) -> HomebrewSubclassRead:
    """Change a homebrew subclass the caller made (or any, for an admin).

    Args:
        db: Active database session.
        subclass_id: UUID of the subclass.
        payload: The fields to change.
        email: The requesting DM.

    Returns:
        The updated subclass.

    Raises:
        PermissionError: If there is no identity, or the subclass is another DM's.
        HomebrewNotFoundError: If there is no such subclass.
        HomebrewConflictError: If the new name is taken, or the change would cut off a
            character that uses the subclass.
    """
    me = _require_dm(email)
    sub = _get_subclass(db, subclass_id)
    require_catalog_editor(sub.created_by_email, me)
    patch = payload.model_dump(exclude_unset=True)
    renamed = "name" in patch and patch["name"].casefold() != sub.name.casefold()
    if renamed:
        _require_free_subclass_name(db, patch["name"], sub.created_by_email, skip=sub.id)
    moved = "character_class" in patch and patch["character_class"] != sub.character_class
    users = HomebrewSubclassRepo.users(db, sub.created_by_email, sub.character_class, sub.name)
    _refuse_cutting_off(
        sub.name, users, renamed, moved, patch.get("ruleset", sub.ruleset), "subclass"
    )
    return HomebrewSubclassRead.model_validate(HomebrewSubclassRepo.update(db, sub, patch))


def delete_subclass(db: Session, subclass_id: uuid.UUID, email: str) -> None:
    """Delete a homebrew subclass, unless a character in the author's campaigns uses it.

    Args:
        db: Active database session.
        subclass_id: UUID of the subclass.
        email: The requesting DM.

    Raises:
        PermissionError: If there is no identity, or the subclass is another DM's.
        HomebrewNotFoundError: If there is no such subclass.
        HomebrewConflictError: If a character of its class has it (the message names who).
    """
    me = _require_dm(email)
    sub = _get_subclass(db, subclass_id)
    require_catalog_editor(sub.created_by_email, me)
    users = HomebrewSubclassRepo.users(db, sub.created_by_email, sub.character_class, sub.name)
    if users:
        raise HomebrewConflictError(_in_use(sub.name, [n for n, _ in users], "delete", "subclass"))
    HomebrewSubclassRepo.delete(db, sub)


# ── For the builder and the level-up guide (Plan 133 wave 2) ────────────────


def for_campaign(
    db: Session, campaign: Any
) -> tuple[list[HomebrewRaceRead], list[HomebrewSubclassRead]]:
    """The homebrew a campaign's characters may pick: its DM's races and subclasses.

    Only the campaign DM's own rows (``created_by_email`` equals ``campaign.dm_email``,
    ignoring case), and only those that fit the campaign's rules: ``ruleset`` NULL (both
    editions) or equal to the campaign's. Another DM's homebrew never shows.

    No authorization happens here: the caller (the character builder, the level-up guide,
    the player's join link) has already checked that the viewer may build or level a
    character in this campaign. Read-only.

    How the rows map onto the builder's SRD shapes (``rulesets.options(r)``):

    - A race: ``name``, ``size`` ("Small"/"Medium"), ``speed``, ``ability_bonuses``
      (``{"DEX": 2}``; 2014 only, the 2024 builder ignores it), ``ability_choice``
      (``AbilityChoice`` or None: ``choose`` N +``amount``, not on ``exclude``), ``skills``
      (fixed, canonical names), ``skill_choice`` (N more of the player's choice, any skill),
      ``traits`` (``RaceTrait``: ``name``, ``text``), ``languages`` (a line of text),
      ``hp_per_level`` (0–2, like the Hill Dwarf's 1), ``darkvision`` (feet, or None). No
      subraces: a variant is its own race.
    - A subclass: ``name``, ``character_class`` (the class name, "Paladin", as
      ``CLASSES`` is keyed), ``features`` (``SubclassFeature``: ``level``, ``name``,
      ``text``; sorted by level), ``always_prepared`` (``{"3": ["Bless"]}`` or None, levels
      as strings), ``blurb``.

    A character stores the race or subclass by name (``pc.race``, ``pc.subclass``); look
    one up with ``race_for`` / ``subclass_for``.

    Args:
        db: Active database session.
        campaign: The campaign (a ``Campaign`` row or ``CampaignRead``; anything with
            ``dm_email`` and ``ruleset``).

    Returns:
        ``(races, subclasses)``: races by name; subclasses by class, then name.
    """
    ruleset = rulesets.normalize(getattr(campaign, "ruleset", None))
    dm = campaign.dm_email
    races = HomebrewRaceRepo.list_for_owner(db, dm, ruleset)
    subs = HomebrewSubclassRepo.list_for_owner(db, dm, ruleset)
    return (
        [HomebrewRaceRead.model_validate(r) for r in races],
        [HomebrewSubclassRead.model_validate(s) for s in subs],
    )


def race_for(db: Session, campaign: Any, name: Optional[str]) -> Optional[HomebrewRaceRead]:
    """The campaign DM's homebrew race called ``name`` that fits the campaign's rules, or None.

    Matches ignore case and outer spaces. Same rules and no-authorization note as
    ``for_campaign``.

    Args:
        db: Active database session.
        campaign: The campaign (anything with ``dm_email`` and ``ruleset``).
        name: The race name, e.g. ``pc.race``.

    Returns:
        The race, or None when it isn't a homebrew race of this campaign.
    """
    if not name or not name.strip():
        return None
    races, _ = for_campaign(db, campaign)
    key = name.strip().casefold()
    return next((r for r in races if r.name.casefold() == key), None)


def subclass_for(
    db: Session, campaign: Any, character_class: Any, name: Optional[str]
) -> Optional[HomebrewSubclassRead]:
    """The campaign DM's homebrew subclass ``name`` for ``character_class``, or None.

    Matches ignore case. Same rules and no-authorization note as ``for_campaign``.

    Args:
        db: Active database session.
        campaign: The campaign (anything with ``dm_email`` and ``ruleset``).
        character_class: A ``CharacterClass`` or class name ("Paladin"), e.g.
            ``pc.character_class``.
        name: The subclass name, e.g. ``pc.subclass``.

    Returns:
        The subclass, or None when it isn't a homebrew subclass of this campaign.
    """
    if not name or not name.strip() or character_class is None:
        return None
    cls = str(getattr(character_class, "value", character_class)).strip().casefold()
    _, subs = for_campaign(db, campaign)
    key = name.strip().casefold()
    return next(
        (s for s in subs if s.character_class.casefold() == cls and s.name.casefold() == key),
        None,
    )


# ── Helpers ─────────────────────────────────────────────────────────────────


def _get_race(db: Session, race_id: uuid.UUID) -> HomebrewRace:
    """The race, or HomebrewNotFoundError."""
    race = HomebrewRaceRepo.get_by_id(db, race_id)
    if race is None:
        raise HomebrewNotFoundError("That homebrew race doesn't exist (it may have been deleted).")
    return race


def _get_subclass(db: Session, subclass_id: uuid.UUID) -> HomebrewSubclass:
    """The subclass, or HomebrewNotFoundError."""
    sub = HomebrewSubclassRepo.get_by_id(db, subclass_id)
    if sub is None:
        raise HomebrewNotFoundError(
            "That homebrew subclass doesn't exist (it may have been deleted)."
        )
    return sub


def _edition(ruleset: Any) -> Optional[str]:
    """The plain ruleset value for a filter, or None when none was asked for."""
    return None if ruleset is None else rulesets.normalize(ruleset)


def _class_name(value: str) -> str:
    """The class name for a filter ("paladin" → "Paladin"), or ValueError."""
    key = value.strip().casefold()
    for edition in rulesets.RULESETS:
        for name in rulesets.options(edition).CLASSES:
            if name.casefold() == key:
                return name
    raise ValueError(f"{value!r} isn't one of the 12 classes.")


def srd_race_names() -> dict[str, str]:
    """Every SRD race name of both editions, plus the 2014 subraces ("Hill Dwarf").

    Returns:
        Casefolded name → the name as printed.
    """
    names: dict[str, str] = {}
    for edition in rulesets.RULESETS:
        for species in rulesets.options(edition).SPECIES:
            names.setdefault(species["name"].casefold(), species["name"])
            for sub in species.get("subraces") or []:
                names.setdefault(sub["name"].casefold(), sub["name"])
    return names


def srd_subclass_names() -> dict[str, str]:
    """Every SRD subclass name of both editions, any class.

    Returns:
        Casefolded name → the name as printed.
    """
    names: dict[str, str] = {}
    for edition in rulesets.RULESETS:
        for cls in rulesets.options(edition).CLASSES.values():
            for name in cls.get("srd_subclasses") or []:
                names.setdefault(name.casefold(), name)
    return names


_OWN_NAME = "Give this one its own name, so the character builder can tell them apart."


def _require_free_race_name(
    db: Session, name: str, owner: str, skip: Optional[uuid.UUID] = None
) -> None:
    """Refuse a race name that is an SRD race or subrace, or one of the owner's races."""
    srd = srd_race_names().get(name.strip().casefold())
    if srd:
        raise HomebrewConflictError(f"The rules already have a race called {srd}. {_OWN_NAME}")
    for row in HomebrewRaceRepo.list_named(db, owner, name):
        if row.id != skip:
            raise HomebrewConflictError(
                f"You already have a homebrew race called {row.name}. {_OWN_NAME}"
            )


def _require_free_subclass_name(
    db: Session, name: str, owner: str, skip: Optional[uuid.UUID] = None
) -> None:
    """Refuse a subclass name that is an SRD subclass, or one of the owner's subclasses."""
    srd = srd_subclass_names().get(name.strip().casefold())
    if srd:
        raise HomebrewConflictError(f"The rules already have a subclass called {srd}. {_OWN_NAME}")
    for row in HomebrewSubclassRepo.list_named(db, owner, name):
        if row.id != skip:
            raise HomebrewConflictError(
                f"You already have a homebrew subclass called {row.name} "
                f"(for the {row.character_class}). {_OWN_NAME}"
            )


def _refuse_cutting_off(
    name: str,
    users: list[tuple[str, str]],
    renamed: bool,
    moved: bool,
    new_ruleset: Optional[str],
    what: str,
) -> None:
    """Refuse a change that would leave characters pointing at a race or subclass they lose.

    Characters store the name, so a rename or a move to another class loses them all; a
    ruleset of "2014" or "2024" loses the ones who play by the other rules.

    Raises:
        HomebrewConflictError: Naming who would lose it and what to do instead.
    """
    if not users:
        return
    if renamed or moved:
        action = "rename" if renamed else "move"
        raise HomebrewConflictError(_in_use(name, [n for n, _ in users], action, what))
    if new_ruleset:
        lost = [(n, r or rulesets.R2024) for n, r in users if (r or rulesets.R2024) != new_ruleset]
        if lost:
            names = [n for n, _ in lost]
            one = len(set(names)) == 1
            rules = lost[0][1]
            raise HomebrewConflictError(
                f"{_who(names)} {'plays' if one else 'play'} by the {rules} rules and "
                f"{'uses' if one else 'use'} {name}, so {name} has to stay valid for the "
                f"{rules} rules. Keep it on both editions, or on {rules} only."
            )


def _who(names: list[str]) -> str:
    """Up to three names in plain words: "Link", "Link and Zelda", "A, B, C and 2 more"."""
    unique = list(dict.fromkeys(names))
    shown = unique[:3]
    rest = len(unique) - len(shown)
    if rest > 0:
        return f"{', '.join(shown)} and {rest} more"
    if len(shown) > 1:
        return f"{', '.join(shown[:-1])} and {shown[-1]}"
    return shown[0]


def _in_use(name: str, users: list[str], action: str, what: str) -> str:
    """The plain refusal for changing a race or subclass characters use: who, and what next."""
    unique = list(dict.fromkeys(users))
    one = len(unique) == 1
    uses = "uses" if one else "use"
    if action == "delete":
        whose = f"{unique[0]}'s" if one else "their"
        return (
            f"{name} can't be deleted yet: {_who(users)} {uses} it. "
            f"Change {whose} {what} first, then delete it."
        )
    verb = "renamed" if action == "rename" else "moved to another class"
    return (
        f"{name} can't be {verb} while {_who(users)} {uses} it: the character sheet finds it "
        f"by name. Use Copy and edit to make the new version instead."
    )


# ── SRD templates ───────────────────────────────────────────────────────────

_DARKVISION_RE = re.compile(r"^darkvision (\d+) ft\.?$", re.IGNORECASE)


def _template(species: dict[str, Any], sub: Optional[dict[str, Any]], edition: str) -> RaceTemplate:
    """One SRD race (or a 2014 race with one subrace) as a homebrew race template."""
    bonuses = dict(species.get("ability_bonuses") or {})
    for ability, amount in ((sub or {}).get("ability_bonuses") or {}).items():
        bonuses[ability] = bonuses.get(ability, 0) + amount
    lines = list(species.get("traits") or []) + list((sub or {}).get("traits") or [])
    traits: list[RaceTrait] = []
    languages = ""
    darkvision: Optional[int] = None
    for line in lines:
        name, _, text = (part.strip() for part in line.partition(" — "))
        seen = _DARKVISION_RE.match(line.strip())
        if seen and int(seen.group(1)) in (30, 60, 120):
            darkvision = int(seen.group(1))
        elif name.casefold() == "languages" and text:
            languages = text.rstrip(".")
        else:
            traits.append(_trait(name, text))
    return RaceTemplate(
        name=(sub or species)["name"],
        ruleset=edition,
        size=species.get("size", "Medium"),
        speed=int(species.get("speed", 30)),
        ability_bonuses=bonuses,
        ability_choice=species.get("ability_choice"),
        skills=list(species.get("skills") or []),
        skill_choice=int(species.get("skill_choice") or species.get("bonus_skill_choices") or 0),
        traits=traits,
        languages=languages,
        hp_per_level=int(species.get("hp_per_level_bonus", 0))
        + int((sub or {}).get("hp_per_level", 0)),
        darkvision=darkvision,
    )


def _trait(name: str, text: str) -> RaceTrait:
    """A trait from an SRD line: "Name — text", or a sentence that is all name."""
    if not text and len(name) > 80:
        cut = name[:80].rsplit(" ", 1)[0].rstrip(",.;:")
        return RaceTrait(name=cut, text=name)
    return RaceTrait(name=name[:80], text=text[:1000])
