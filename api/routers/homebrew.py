"""Homebrew router (Plan 133) — a DM's own races and subclasses.

Every route needs a signed-in DM; lists show only the caller's own rows (SEC-003). Create
stamps the caller as the author; update and delete need the author or an admin (403
otherwise). A clashing name, or changing one a character still uses, is a 409 with a plain
message; a bad field is a 422.
"""

import uuid
from typing import NoReturn, Optional

from fastapi import APIRouter, HTTPException, Query, status

from api.deps import DB, CurrentUser
from domain.enums import Ruleset
from domain.homebrew import (
    HomebrewConflictError,
    HomebrewNotFoundError,
    HomebrewRaceCreate,
    HomebrewRaceRead,
    HomebrewRaceUpdate,
    HomebrewSubclassCreate,
    HomebrewSubclassRead,
    HomebrewSubclassUpdate,
    RaceTemplate,
)
from services import homebrew_service

router = APIRouter(prefix="/homebrew", tags=["homebrew"])

_RULESET = Query(None, description="2024 or 2014: that edition's rows plus those valid in both")


def _http(exc: Exception) -> NoReturn:
    """Answer a service error with its HTTP status and plain message.

    Args:
        exc: The service's exception.

    Raises:
        HTTPException: 409, 404, 403 or 422.
    """
    if isinstance(exc, HomebrewConflictError):
        code = status.HTTP_409_CONFLICT
    elif isinstance(exc, HomebrewNotFoundError):
        code = status.HTTP_404_NOT_FOUND
    elif isinstance(exc, PermissionError):
        code = status.HTTP_403_FORBIDDEN
    else:
        code = status.HTTP_422_UNPROCESSABLE_ENTITY
    raise HTTPException(status_code=code, detail=str(exc)) from exc


_ERRORS = (HomebrewConflictError, HomebrewNotFoundError, PermissionError, ValueError)


# ── Races ───────────────────────────────────────────────────────────────────


@router.get("/races", response_model=list[HomebrewRaceRead])
def list_races(db: DB, user: CurrentUser, ruleset: Optional[Ruleset] = _RULESET):
    """The caller's homebrew races, by name.

    Args:
        db: Database session.
        user: The signed-in DM.
        ruleset: Optional edition filter.

    Returns:
        The races.
    """
    try:
        return homebrew_service.list_races(db, user, ruleset)
    except _ERRORS as exc:
        _http(exc)


@router.get("/race-templates", response_model=list[RaceTemplate])
def race_templates(_user: CurrentUser, ruleset: Optional[Ruleset] = _RULESET):
    """The SRD races laid out as homebrew races, to start a new one from.

    Args:
        _user: The signed-in DM.
        ruleset: One edition's races; omitted, both (2024 first).

    Returns:
        One template per SRD race and 2014 subrace.
    """
    return homebrew_service.race_templates(ruleset)


@router.post("/races", response_model=HomebrewRaceRead, status_code=status.HTTP_201_CREATED)
def create_race(body: HomebrewRaceCreate, db: DB, user: CurrentUser):
    """Make a homebrew race, stamped as the caller's.

    Args:
        body: The race.
        db: Database session.
        user: The authoring DM.

    Returns:
        The new race.
    """
    try:
        return homebrew_service.create_race(db, body, user)
    except _ERRORS as exc:
        _http(exc)


@router.patch("/races/{race_id}", response_model=HomebrewRaceRead)
def update_race(race_id: uuid.UUID, body: HomebrewRaceUpdate, db: DB, user: CurrentUser):
    """Change a homebrew race the caller made.

    Args:
        race_id: UUID of the race.
        body: The fields to change.
        db: Database session.
        user: The requesting DM (the author, or an admin).

    Returns:
        The updated race.
    """
    try:
        return homebrew_service.update_race(db, race_id, body, user)
    except _ERRORS as exc:
        _http(exc)


@router.delete("/races/{race_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_race(race_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a homebrew race no character uses.

    Args:
        race_id: UUID of the race.
        db: Database session.
        user: The requesting DM (the author, or an admin).
    """
    try:
        homebrew_service.delete_race(db, race_id, user)
    except _ERRORS as exc:
        _http(exc)


# ── Subclasses ──────────────────────────────────────────────────────────────


@router.get("/subclasses", response_model=list[HomebrewSubclassRead])
def list_subclasses(
    db: DB,
    user: CurrentUser,
    character_class: Optional[str] = Query(None, max_length=20, description="e.g. Paladin"),
    ruleset: Optional[Ruleset] = _RULESET,
):
    """The caller's homebrew subclasses, by class then name.

    Args:
        db: Database session.
        user: The signed-in DM.
        character_class: Optional class filter.
        ruleset: Optional edition filter.

    Returns:
        The subclasses.
    """
    try:
        return homebrew_service.list_subclasses(db, user, character_class, ruleset)
    except _ERRORS as exc:
        _http(exc)


@router.post(
    "/subclasses", response_model=HomebrewSubclassRead, status_code=status.HTTP_201_CREATED
)
def create_subclass(body: HomebrewSubclassCreate, db: DB, user: CurrentUser):
    """Make a homebrew subclass, stamped as the caller's.

    Args:
        body: The subclass.
        db: Database session.
        user: The authoring DM.

    Returns:
        The new subclass.
    """
    try:
        return homebrew_service.create_subclass(db, body, user)
    except _ERRORS as exc:
        _http(exc)


@router.patch("/subclasses/{subclass_id}", response_model=HomebrewSubclassRead)
def update_subclass(
    subclass_id: uuid.UUID, body: HomebrewSubclassUpdate, db: DB, user: CurrentUser
):
    """Change a homebrew subclass the caller made.

    Args:
        subclass_id: UUID of the subclass.
        body: The fields to change.
        db: Database session.
        user: The requesting DM (the author, or an admin).

    Returns:
        The updated subclass.
    """
    try:
        return homebrew_service.update_subclass(db, subclass_id, body, user)
    except _ERRORS as exc:
        _http(exc)


@router.delete("/subclasses/{subclass_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_subclass(subclass_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a homebrew subclass no character uses.

    Args:
        subclass_id: UUID of the subclass.
        db: Database session.
        user: The requesting DM (the author, or an admin).
    """
    try:
        homebrew_service.delete_subclass(db, subclass_id, user)
    except _ERRORS as exc:
        _http(exc)
