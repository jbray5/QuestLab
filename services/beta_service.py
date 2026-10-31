"""The friends beta (Plan 125): invite codes, the sign-up gate, feedback.

Rules:
- While ``BETA_INVITES=required`` (the default), starting a NEW DM account
  (password sign-up or a first Discord/Patreon sign-in) needs a valid invite
  code. Existing accounts and admins are never asked.
- An invite has a use limit and can be revoked; each account it starts
  remembers the code, so the admin sees who came in through whom.
- Players never need an account or a code.
- Feedback is stored for the admin's inbox and, when ``FEEDBACK_WEBHOOK_URL``
  is set, posted to that Discord channel (best effort, never blocks a send).
"""

import logging
import secrets
import uuid
from typing import Optional

from sqlmodel import Session

from db.repos.adventure_repo import AdventureRepo
from db.repos.beta_repo import FeedbackRepo, InviteRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.session_repo import SessionRepo
from db.repos.user_repo import UserRepo
from domain.beta import (
    BetaDm,
    BetaInvite,
    BetaOverview,
    Feedback,
    FeedbackCreate,
    FeedbackRead,
    InviteCheck,
    InviteJoiner,
    InviteRead,
)
from integrations import feature_flags

logger = logging.getLogger(__name__)

# No 0/O, 1/I/L: codes get read aloud and typed from a text message.
_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_KIND_LABEL = {"loved": "Loved it", "confusing": "Confusing", "broken": "Broken", "idea": "Idea"}


def _require_admin(email: str) -> None:
    """Admin check, imported late (auth_service imports this module)."""
    from services.auth_service import require_admin

    require_admin(email)


def _normalise(code: Optional[str]) -> str:
    """Invite codes are case- and space-insensitive: ``ql-ab12 cd`` reads as ``QL-AB12CD``."""
    return "".join((code or "").split()).upper()[:40]


def _new_code(db: Session) -> str:
    """A fresh, unused, easy-to-type code like ``QL-7KQ2MX``."""
    while True:
        code = "QL-" + "".join(secrets.choice(_ALPHABET) for _ in range(6))
        if InviteRepo.get_by_code(db, code) is None:
            return code


def invites_required() -> bool:
    """Whether new accounts need an invite right now."""
    return feature_flags.beta_invites_required()


def _invite_read(db: Session, invite: BetaInvite) -> InviteRead:
    joined = [
        InviteJoiner(email=u.email, display_name=u.display_name)
        for u in UserRepo.list_by_invite(db, invite.code)
    ]
    return InviteRead(
        id=invite.id,
        code=invite.code,
        label=invite.label,
        max_uses=invite.max_uses,
        uses=invite.uses,
        revoked=invite.revoked,
        created_at=invite.created_at,
        joined=joined,
    )


def create_invite(db: Session, admin_email: str, label: str, max_uses: int = 3) -> InviteRead:
    """Make an invite for a friend.

    Args:
        db: Active database session.
        admin_email: The requesting admin.
        label: Who it is for ("Sam's table").
        max_uses: How many accounts it may start.

    Returns:
        The new invite.

    Raises:
        PermissionError: If the requester isn't an admin.
    """
    _require_admin(admin_email)
    invite = BetaInvite(
        code=_new_code(db),
        label=label.strip()[:120],
        max_uses=max(1, min(100, max_uses)),
        created_by_email=admin_email.strip().lower(),
    )
    return _invite_read(db, InviteRepo.save(db, invite))


def list_invites(db: Session, admin_email: str) -> list[InviteRead]:
    """Every invite with who joined through it.

    Args:
        db: Active database session.
        admin_email: The requesting admin.

    Returns:
        Invites, newest first.

    Raises:
        PermissionError: If the requester isn't an admin.
    """
    _require_admin(admin_email)
    return [_invite_read(db, i) for i in InviteRepo.list_all(db)]


def revoke_invite(db: Session, admin_email: str, invite_id: uuid.UUID) -> InviteRead:
    """Stop an invite from starting more accounts (accounts it started stay).

    Args:
        db: Active database session.
        admin_email: The requesting admin.
        invite_id: The invite.

    Returns:
        The revoked invite.

    Raises:
        PermissionError: If the requester isn't an admin.
        ValueError: If the invite doesn't exist.
    """
    _require_admin(admin_email)
    invite = InviteRepo.get(db, invite_id)
    if invite is None:
        raise ValueError("Invite not found.")
    invite.revoked = True
    return _invite_read(db, InviteRepo.save(db, invite))


def check_invite(db: Session, code: str) -> InviteCheck:
    """Tell the sign-up page whether a code works and who it's for (public).

    Args:
        db: Active database session.
        code: The code from the link or the form.

    Returns:
        ``valid`` and, when valid, the label to greet them with.
    """
    invite = InviteRepo.get_by_code(db, _normalise(code))
    if invite is None or invite.revoked or invite.uses >= invite.max_uses:
        return InviteCheck(valid=False)
    return InviteCheck(valid=True, label=invite.label or None)


def gate_new_account(db: Session, email: str, code: Optional[str]) -> Optional[str]:
    """Let a NEW account start, spending one use of its invite when invites are required.

    Call this only when no account exists yet for ``email``. Admins and
    deployments with ``BETA_INVITES=off`` pass without a code (one given is
    still recorded and spent).

    Args:
        db: Active database session.
        email: The email the new account will have.
        code: The invite code offered, if any.

    Returns:
        The normalised code to record on the account, or None.

    Raises:
        ValueError: With a sentence the person can act on when a needed code
            is missing, unknown, revoked or used up.
    """
    from services.auth_service import is_admin

    wanted = _normalise(code)
    needed = invites_required() and not is_admin(email)
    if not wanted:
        if needed:
            raise ValueError(
                "QuestLab is in a friends-only beta for now. Ask the DM who told you about it "
                "for an invite link or code."
            )
        return None
    invite = InviteRepo.get_by_code(db, wanted)
    if invite is None or invite.revoked or invite.uses >= invite.max_uses:
        if not needed:
            return None
        if invite is not None and invite.uses >= invite.max_uses and not invite.revoked:
            raise ValueError(
                "That invite has already been used as many times as it allows. "
                "Ask for a fresh one."
            )
        raise ValueError("That invite code doesn't work. Check it, or ask for a fresh one.")
    invite.uses += 1
    InviteRepo.save(db, invite)
    return invite.code


def submit_feedback(db: Session, email: str, payload: FeedbackCreate) -> Feedback:
    """Store one note from the feedback sheet.

    Args:
        db: Active database session.
        email: The signed-in DM.
        payload: Kind, text, page and viewport.

    Returns:
        The stored note (the caller may then ``notify``).
    """
    note = Feedback(
        email=email.strip().lower(),
        kind=payload.kind,
        text=payload.text.strip(),
        page=payload.page.strip()[:300],
        viewport=payload.viewport.strip()[:40],
    )
    return FeedbackRepo.save(db, note)


def display_name_for(db: Session, email: str) -> str:
    """The name a DM signed up with, or "" (for the feedback ping).

    Args:
        db: Active database session.
        email: The DM's email.

    Returns:
        Their display name, or an empty string.
    """
    user = UserRepo.get_by_email(db, email)
    return user.display_name if user else ""


def notify(note: Feedback, display_name: str = "") -> None:
    """Post a note to the feedback Discord channel, if one is set. Never raises.

    Args:
        note: The stored note.
        display_name: The sender's name, when known.
    """
    url = feature_flags.feedback_webhook_url()
    if not url:
        return
    from integrations import discord_webhook

    who = f"{display_name} ({note.email})" if display_name else note.email
    body = (
        f"**{_KIND_LABEL.get(note.kind, note.kind)}** from {who}\n"
        f"{note.text[:1500]}\n"
        f"_Page: {note.page or '?'} · screen {note.viewport or '?'}_"
    )
    try:
        discord_webhook.post(url, username="QuestLab beta", content=body, channel_label="feedback")
    except Exception:  # noqa: BLE001 — feedback is stored; the ping is a courtesy
        logger.warning("Feedback webhook post failed for note %s", note.id)


def list_feedback(db: Session, admin_email: str) -> list[FeedbackRead]:
    """The feedback inbox, newest first.

    Args:
        db: Active database session.
        admin_email: The requesting admin.

    Returns:
        Every note with the sender's display name.

    Raises:
        PermissionError: If the requester isn't an admin.
    """
    _require_admin(admin_email)
    names: dict[str, str] = {}
    out = []
    for n in FeedbackRepo.list_all(db):
        if n.email not in names:
            user = UserRepo.get_by_email(db, n.email)
            names[n.email] = user.display_name if user else ""
        out.append(FeedbackRead(**n.model_dump(), display_name=names[n.email]))
    return out


def mark_seen(db: Session, admin_email: str, feedback_id: uuid.UUID) -> FeedbackRead:
    """Mark a note as read.

    Args:
        db: Active database session.
        admin_email: The requesting admin.
        feedback_id: The note.

    Returns:
        The updated note.

    Raises:
        PermissionError: If the requester isn't an admin.
        ValueError: If the note doesn't exist.
    """
    _require_admin(admin_email)
    note = FeedbackRepo.get(db, feedback_id)
    if note is None:
        raise ValueError("Feedback not found.")
    note.seen = True
    note = FeedbackRepo.save(db, note)
    user = UserRepo.get_by_email(db, note.email)
    return FeedbackRead(**note.model_dump(), display_name=user.display_name if user else "")


def overview(db: Session, admin_email: str) -> BetaOverview:
    """Who is in the beta and how much they've played.

    Args:
        db: Active database session.
        admin_email: The requesting admin.

    Returns:
        Whether sign-up is invite-only, and every DM with campaign and session counts.

    Raises:
        PermissionError: If the requester isn't an admin.
    """
    _require_admin(admin_email)
    dms = []
    for u in UserRepo.list_all(db):
        campaigns = CampaignRepo.list_by_dm(db, u.email)
        sessions = 0
        for c in campaigns:
            for a in AdventureRepo.list_by_campaign(db, c.id):
                sessions += len(SessionRepo.list_by_adventure(db, a.id))
        dms.append(
            BetaDm(
                email=u.email,
                display_name=u.display_name,
                invite_code=u.invite_code,
                created_at=u.created_at,
                last_seen_at=u.last_seen_at,
                campaigns=len(campaigns),
                sessions=sessions,
            )
        )
    return BetaOverview(invites_required=invites_required(), dms=dms)
