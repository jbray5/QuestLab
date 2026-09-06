"""Onboarding router (Plan 73) — the starter campaign for a new DM."""

from fastapi import APIRouter, HTTPException, status
from fastapi.responses import JSONResponse

from api.deps import DB, CurrentUser
from services import onboarding_service

router = APIRouter(tags=["onboarding"])


@router.post("/onboarding/starter", status_code=status.HTTP_201_CREATED)
def create_starter(db: DB, user: CurrentUser) -> dict:
    """Create the sample campaign (once) for the signed-in DM.

    Args:
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Ids of the created campaign, adventure and session.
    """
    existing = onboarding_service.find_starter(db, user)
    if existing is not None:
        # Plan 83 — already built: hand back its ids so the dashboard opens it.
        return JSONResponse(status_code=status.HTTP_200_OK, content=existing)
    try:
        return onboarding_service.seed_starter(db, user)
    except (ValueError, PermissionError) as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
