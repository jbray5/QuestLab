"""Admin router — monster seeding and campaign export (admin-only)."""

import json
import uuid

from fastapi import APIRouter, HTTPException, Response, status

from api.deps import DB, CurrentUser
from domain.beta import BetaOverview, FeedbackRead, InviteCreate, InviteRead
from domain.monster import MonsterStatBlock as Monster
from integrations.dnd_rules.stat_blocks import seed_monsters
from services import auth_service, beta_service, campaign_service, encounter_service

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
    return encounter_service.list_monsters(db)


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
    deleted = encounter_service.delete_all_monsters(db)
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
    campaigns = campaign_service.list_campaigns(db, user)
    data = [
        {
            "id": str(c.id),
            "name": c.name,
            "setting": c.setting,
            "tone": c.tone,
            "description": c.description,
            "world_notes": c.world_notes,
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


@router.get("/waitlist")
def list_waitlist(db: DB, user: CurrentUser) -> dict:
    """List beta-waitlist signups, newest last (admin only, Plan 54).

    Args:
        db: Database session.
        user: Authenticated admin email.

    Returns:
        ``{"count": N, "entries": [{email, source, created_at}]}``.
    """
    _require_admin(user)
    from sqlmodel import select

    from db.repos.waitlist_repo import WaitlistRepo
    from domain.waitlist import WaitlistEntry

    rows = db.exec(select(WaitlistEntry).order_by(WaitlistEntry.created_at.asc())).all()
    return {
        "count": WaitlistRepo.count(db),
        "entries": [
            {"email": r.email, "source": r.source, "created_at": str(r.created_at)} for r in rows
        ],
    }


# ── The friends beta (Plan 125) ────────────────────────────────────────────────


def _beta_call(fn, *args):
    """Run an admin beta service call, mapping its errors to HTTP answers."""
    try:
        return fn(*args)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/invites", response_model=list[InviteRead])
def list_invites(db: DB, user: CurrentUser) -> list[InviteRead]:
    """Every beta invite with who joined through it (admin only).

    Args:
        db: Database session.
        user: Authenticated admin email.

    Returns:
        Invites, newest first.
    """
    return _beta_call(beta_service.list_invites, db, user)


@router.post("/invites", response_model=InviteRead, status_code=status.HTTP_201_CREATED)
def create_invite(body: InviteCreate, db: DB, user: CurrentUser) -> InviteRead:
    """Make a beta invite for a friend (admin only).

    Args:
        body: Who it is for and how many accounts it may start.
        db: Database session.
        user: Authenticated admin email.

    Returns:
        The new invite (its link is ``/welcome?invite=<code>``).
    """
    return _beta_call(beta_service.create_invite, db, user, body.label, body.max_uses)


@router.post("/invites/{invite_id}/revoke", response_model=InviteRead)
def revoke_invite(invite_id: uuid.UUID, db: DB, user: CurrentUser) -> InviteRead:
    """Stop an invite from starting more accounts (admin only).

    Args:
        invite_id: The invite.
        db: Database session.
        user: Authenticated admin email.

    Returns:
        The revoked invite.
    """
    return _beta_call(beta_service.revoke_invite, db, user, invite_id)


@router.get("/beta", response_model=BetaOverview)
def beta_overview(db: DB, user: CurrentUser) -> BetaOverview:
    """Who is in the beta and how much they've played (admin only).

    Args:
        db: Database session.
        user: Authenticated admin email.

    Returns:
        Invite-only status and every DM with campaign and session counts.
    """
    return _beta_call(beta_service.overview, db, user)


@router.get("/feedback", response_model=list[FeedbackRead])
def list_feedback(db: DB, user: CurrentUser) -> list[FeedbackRead]:
    """The feedback inbox, newest first (admin only).

    Args:
        db: Database session.
        user: Authenticated admin email.

    Returns:
        Every note with its sender.
    """
    return _beta_call(beta_service.list_feedback, db, user)


@router.post("/feedback/{feedback_id}/seen", response_model=FeedbackRead)
def mark_feedback_seen(feedback_id: uuid.UUID, db: DB, user: CurrentUser) -> FeedbackRead:
    """Mark a feedback note as read (admin only).

    Args:
        feedback_id: The note.
        db: Database session.
        user: Authenticated admin email.

    Returns:
        The updated note.
    """
    return _beta_call(beta_service.mark_seen, db, user, feedback_id)
