"""Class-feature router (Plan 00021).

Two surfaces:
- Catalog browsing: ``GET /class-features`` (filterable by class + level).
- Per-PC management: ``GET/POST/PATCH/DELETE /characters/{id}/features``.
"""

import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Query, status

from api.deps import DB, CurrentUser
from domain.character import (
    CharacterFeatureCreate,
    CharacterFeatureRead,
    ClassFeatureRead,
)
from domain.enums import CharacterClass
from services import feature_service

router = APIRouter(tags=["features"])


@router.get("/class-features", response_model=list[ClassFeatureRead])
def list_class_features(
    db: DB,
    _user: CurrentUser,
    character_class: Optional[CharacterClass] = Query(None, description="Filter by class"),
    max_level: int = Query(20, ge=1, le=20),
) -> list[ClassFeatureRead]:
    """Browse the 2024 class-feature catalog.

    Args:
        db: Database session.
        _user: Authenticated DM.
        character_class: Optional class filter.
        max_level: Inclusive upper bound on level_acquired.

    Returns:
        Filtered feature list.
    """
    return feature_service.list_catalog(db, character_class=character_class, max_level=max_level)


@router.get(
    "/characters/{character_id}/features",
    response_model=list[CharacterFeatureRead],
)
def list_character_features(
    character_id: uuid.UUID, db: DB, user: CurrentUser
) -> list[CharacterFeatureRead]:
    """List a PC's class features with hydrated max_uses + name.

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Hydrated CharacterFeatureRead list.
    """
    try:
        return feature_service.list_for_character(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/characters/{character_id}/features",
    response_model=CharacterFeatureRead,
    status_code=status.HTTP_201_CREATED,
)
def learn_character_feature(
    character_id: uuid.UUID,
    body: CharacterFeatureCreate,
    db: DB,
    user: CurrentUser,
) -> CharacterFeatureRead:
    """Add a class feature to a PC (idempotent on feature_id).

    Args:
        character_id: UUID of the PC.
        body: Validated payload.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Hydrated CharacterFeatureRead.
    """
    try:
        return feature_service.learn_feature(db, character_id, body, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/characters/{character_id}/features/{character_feature_id}/spend",
    response_model=CharacterFeatureRead,
)
def spend_feature_use(
    character_id: uuid.UUID,
    character_feature_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
) -> CharacterFeatureRead:
    """Spend one use of a PC's class feature.

    Args:
        character_id: URL grouping.
        character_feature_id: UUID of the PC-feature row.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Hydrated CharacterFeatureRead with the new uses_spent value.
    """
    try:
        return feature_service.spend_use(db, character_feature_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/characters/{character_id}/features/{character_feature_id}/restore",
    response_model=CharacterFeatureRead,
)
def restore_feature_use(
    character_id: uuid.UUID,
    character_feature_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
) -> CharacterFeatureRead:
    """Restore one use (undo button).

    Args:
        character_id: URL grouping.
        character_feature_id: UUID of the row.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Hydrated CharacterFeatureRead.
    """
    try:
        return feature_service.restore_use(db, character_feature_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete(
    "/characters/{character_id}/features/{character_feature_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def forget_character_feature(
    character_id: uuid.UUID,
    character_feature_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
) -> None:
    """Remove a feature from a PC.

    Args:
        character_id: URL grouping.
        character_feature_id: UUID of the row.
        db: Database session.
        user: Authenticated DM.
    """
    try:
        feature_service.forget_feature(db, character_feature_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/characters/{character_id}/features/sync")
def sync_character_features(character_id: uuid.UUID, db: DB, user: CurrentUser) -> dict:
    """Grant every catalog feature the PC now qualifies for (level-up helper).

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM.

    Returns:
        ``{"granted": [<feature names>]}`` — empty when already up to date.
    """
    try:
        return {"granted": feature_service.sync_for_level(db, character_id, user)}
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
