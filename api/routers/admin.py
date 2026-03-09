"""Admin router — monster seeding and campaign export (admin-only)."""

import json

from fastapi import APIRouter, HTTPException, Response, status

from api.deps import DB, CurrentUser
from db.repos.campaign_repo import CampaignRepo
from db.repos.monster_repo import MonsterRepo
from domain.monster import MonsterStatBlock as Monster
from integrations.dnd_rules.stat_blocks import seed_monsters
from services import auth_service

router = APIRouter(prefix="/admin", tags=["admin"])


def _require_admin(user: str) -> None:
    """Raise HTTP 403 if the user is not a bootstrap admin.

    Args:
        user: Authenticated user email.

    Raises:
        HTTPException 403: If the user is not an admin.
    """
    try:
        auth_service.require_admin(user)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/monsters", response_model=list[Monster])
def list_monsters(db: DB, user: CurrentUser) -> list[Monster]:
    """List all monster stat blocks (admin only).

    Args:
        db: Database session.
        user: Authenticated DM email.

    Returns:
        List of Monster objects.
    """
    _require_admin(user)
    return MonsterRepo.list_all(db)


@router.post("/monsters/seed", status_code=status.HTTP_200_OK)
def seed(db: DB, user: CurrentUser) -> dict:
    """Seed SRD monsters if the table is empty (admin only).

    Args:
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Dict with ``inserted`` count.
    """
    _require_admin(user)
    inserted = seed_monsters(db)
    return {"inserted": inserted}


@router.post("/monsters/reseed", status_code=status.HTTP_200_OK)
def reseed(db: DB, user: CurrentUser) -> dict:
    """Delete all monsters and re-seed from SRD data (admin only).

    Args:
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Dict with ``deleted`` and ``inserted`` counts.
    """
    _require_admin(user)
    deleted = MonsterRepo.delete_all(db)
    inserted = seed_monsters(db)
    return {"deleted": deleted, "inserted": inserted}


@router.get("/export/campaigns")
def export_campaigns(db: DB, user: CurrentUser) -> Response:
    """Export all campaigns owned by the current DM as JSON (admin only).

    Args:
        db: Database session.
        user: Authenticated DM email.

    Returns:
        JSON file download response.
    """
    _require_admin(user)
    campaigns = CampaignRepo.list_by_dm(db, user)
    data = [
        {
            "id": str(c.id),
            "name": c.name,
            "setting": c.setting,
            "tone": c.tone,
            "dm_email": c.dm_email,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in campaigns
    ]
    return Response(
        content=json.dumps(data, indent=2),
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=campaigns_export.json"},
    )
