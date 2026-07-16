"""Battle-map library router (Plan 42)."""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.battle_map import BattleMapCreate, BattleMapRead, BattleMapUpdate
from services import battle_map_service

router = APIRouter(tags=["battle-maps"])


@router.get("/campaigns/{campaign_id}/battle-maps", response_model=list[BattleMapRead])
def list_battle_maps(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[BattleMapRead]:
    """List a campaign's battle-map library.

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Battle maps newest-first.
    """
    try:
        maps = battle_map_service.list_maps(db, campaign_id, user)
        return [BattleMapRead.model_validate(m) for m in maps]
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/campaigns/{campaign_id}/battle-maps",
    response_model=BattleMapRead,
    status_code=status.HTTP_201_CREATED,
)
def create_battle_map(
    campaign_id: uuid.UUID, body: BattleMapCreate, db: DB, user: CurrentUser
) -> BattleMapRead:
    """Add a map (already uploaded via /uploads/map) to the campaign library.

    Args:
        campaign_id: UUID of the campaign.
        body: Map metadata incl. the uploaded image_url and pixel dims.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The created BattleMap.
    """
    try:
        return BattleMapRead.model_validate(
            battle_map_service.create_map(db, campaign_id, user, body)
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/battle-maps/{map_id}", response_model=BattleMapRead)
def update_battle_map(
    map_id: uuid.UUID, body: BattleMapUpdate, db: DB, user: CurrentUser
) -> BattleMapRead:
    """Rename / regrid / edit fog regions on a map.

    Args:
        map_id: UUID of the battle map.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The updated BattleMap.
    """
    try:
        return BattleMapRead.model_validate(battle_map_service.update_map(db, map_id, user, body))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/battle-maps/{map_id}/backdrop", response_model=BattleMapRead)
def generate_battle_map_backdrop(
    map_id: uuid.UUID, body: dict, db: DB, user: CurrentUser
) -> BattleMapRead:
    """Generate an AI 360° backdrop for the map and persist its URL (Plan 45).

    Body: ``{"style_hints": "optional scene description"}``. Calls OpenAI
    ``gpt-image-1`` in wide landscape and uploads the result to Vercel Blob;
    the 3D board wraps it around the scene as a skybox dome.

    Args:
        map_id: UUID of the battle map.
        body: JSON with optional ``style_hints``.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The updated BattleMap with backdrop_url set.
    """
    try:
        return BattleMapRead.model_validate(
            battle_map_service.generate_backdrop(
                db, map_id, user, style_hints=(body.get("style_hints") or None)
            )
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.post("/battle-maps/{map_id}/terrain", response_model=BattleMapRead)
def generate_battle_map_terrain(map_id: uuid.UUID, db: DB, user: CurrentUser) -> BattleMapRead:
    """Auto-generate 3D terrain (a heightmap) for the map (Plan 45 Tier 3).

    Runs the map image through ``gpt-image-1``'s edit API to produce a
    grayscale elevation map; the 3D board displaces its geometry from it.

    Args:
        map_id: UUID of the battle map.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The updated BattleMap with heightmap_url set.
    """
    try:
        return BattleMapRead.model_validate(battle_map_service.generate_heightmap(db, map_id, user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(exc))


@router.delete("/battle-maps/{map_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_battle_map(map_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a map from the library.

    Args:
        map_id: UUID of the battle map.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        battle_map_service.delete_map(db, map_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
