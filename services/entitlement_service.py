"""AI entitlements (Plan 73) — who may spend generation credits.

Policy is env-driven so a personal deployment stays wide open:

    AI_GATE=off        (default) everyone signed in may use AI
    AI_GATE=patreon    active patrons, admins, and AI_FREE_EMAILS only
    AI_DAILY_LIMIT=50  per-user generations per UTC day (0 = unlimited)
    AI_FREE_EMAILS     comma-separated allowlist (friends, playtesters)
    PATREON_URL        the public Patreon page shown in the paywall

Ownership matters for player-facing AI (the forge): a player's request is
charged to — and gated on — the DM who owns the campaign.
"""

import os
from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Optional

from sqlmodel import Session as DBSession

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.user_repo import AiUsageRepo, UserRepo


@dataclass(frozen=True)
class Entitlement:
    """The answer to "may this person generate right now?"."""

    allowed: bool
    reason: Optional[str] = None  # "patreon_required" | "daily_limit" | None
    remaining_today: Optional[int] = None
    patreon_url: Optional[str] = None


def gate_mode() -> str:
    """The configured AI gate: ``off`` or ``patreon``."""
    mode = os.environ.get("AI_GATE", "off").strip().lower()
    return "patreon" if mode == "patreon" else "off"


def daily_limit() -> int:
    """Per-user generations per UTC day; 0 means unlimited."""
    try:
        return max(0, int(os.environ.get("AI_DAILY_LIMIT", "50")))
    except ValueError:
        return 50


def _free_emails() -> set[str]:
    raw = os.environ.get("AI_FREE_EMAILS", "") + "," + os.environ.get("BOOTSTRAP_ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _today() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


def check_ai(db: DBSession, email: str) -> Entitlement:
    """Decide whether ``email`` may run an AI generation now.

    Args:
        db: Active database session.
        email: The DM's email (campaign owner for player-facing calls).

    Returns:
        An Entitlement; ``allowed`` is False with a reason when gated.
    """
    email = email.strip().lower()
    patreon_url = os.environ.get("PATREON_URL", "").strip() or None
    if email in _free_emails():
        # Admins and the allowlist skip both the gate and the daily allowance —
        # the DM running the show shouldn't hit a wall mid-prep.
        return Entitlement(True, None, None, patreon_url)
    if gate_mode() == "patreon":
        user = UserRepo.get_by_email(db, email)
        if user is None or not user.patron_active:
            return Entitlement(False, "patreon_required", None, patreon_url)
    limit = daily_limit()
    if limit:
        row = AiUsageRepo.get(db, email, _today())
        used = row.count if row else 0
        if used >= limit:
            return Entitlement(False, "daily_limit", 0, patreon_url)
        return Entitlement(True, None, limit - used, patreon_url)
    return Entitlement(True, None, None, patreon_url)


def record_ai(db: DBSession, email: str) -> int:
    """Count one generation against ``email`` for today.

    Args:
        db: Active database session.
        email: The DM's email.

    Returns:
        Today's count after recording.
    """
    return AiUsageRepo.increment(db, email.strip().lower(), _today())


def owner_email_for_pc(db: DBSession, pc_id) -> Optional[str]:
    """Resolve the DM who owns a player character's campaign.

    Args:
        db: Active database session.
        pc_id: UUID of the PC.

    Returns:
        The owner's email, or None if the PC/campaign is unknown.
    """
    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        return None
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    return campaign.dm_email if campaign else None
