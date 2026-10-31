"""The signed-in DM's own plan (Plan 130): plan status and linking a Patreon account.

``GET /me/plan``, ``POST /me/patreon/link`` and ``POST /me/patreon/confirm``.
The Patreon callback itself is ``/auth/patreon/callback`` (api/routers/auth.py),
shared with sign-in; its signed state says which it is.
"""

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.plan import PatreonLinkConfirm, PatreonLinkResult, PatreonLinkStart, PlanStatus
from services import auth_service, plan_service

router = APIRouter(prefix="/me", tags=["plan"])


@router.get("/plan", response_model=PlanStatus)
def my_plan(db: DB, user: CurrentUser) -> PlanStatus:
    """The signed-in DM's plan, usage, limits and Patreon state.

    Args:
        db: Database session.
        user: The signed-in DM.

    Returns:
        A PlanStatus.
    """
    return plan_service.status(db, user)


@router.post("/patreon/link", response_model=PatreonLinkStart)
def start_patreon_link(user: CurrentUser) -> PatreonLinkStart:
    """Start "Link your Patreon": the Patreon authorization URL for this DM.

    The signed state names this DM, so the result can only attach to them.

    Args:
        user: The signed-in DM.

    Returns:
        ``{url}`` to send the browser to.
    """
    try:
        return PatreonLinkStart(url=auth_service.start_patreon_link(user))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc))


@router.post("/patreon/confirm", response_model=PatreonLinkResult)
def confirm_patreon_link(body: PatreonLinkConfirm, db: DB, user: CurrentUser) -> PatreonLinkResult:
    """Attach the Patreon account the callback read to the signed-in DM who started the link.

    Args:
        body: The signed link result from the callback's redirect.
        db: Database session.
        user: The signed-in DM.

    Returns:
        What happened, in a sentence, and the plan afterwards.
    """
    try:
        return auth_service.confirm_patreon_link(db, user, body.token)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc))
