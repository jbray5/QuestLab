"""Plans and pricing (Plan 130): who is a Patron, what each plan allows, and the caps.

Rules:
- Players never pay. Nothing here touches the player link, phone, join page or market.
- ``PRICING=off`` (the default, the beta): nothing is capped. The plan page
  still shows usage and what the plans will be.
- ``PRICING=on``: a Free DM may run ``FREE_CAMPAIGNS`` campaigns and upload
  ``FREE_UPLOAD_BYTES``; a Patron has unlimited campaigns and
  ``PATRON_UPLOAD_BYTES``. Admins have no caps at all.
- Over a cap never deletes or hides anything: it only refuses a NEW campaign
  or upload, with a ``PlanLimitError`` the API turns into a 402.
- A DM is a Patron when they are an admin, an admin gave them Patron
  (``users.patron_comped``), or their Patreon membership of QuestLab's
  campaign is active, worth at least ``PATRON_MIN_CENTS`` a month, and was
  checked within ``MEMBERSHIP_FRESH_DAYS`` days (each Patreon sign-in or
  "Link your Patreon" checks it again; Patreon handles the payment).
- Storage use is the uploads ledger: every recorded upload's bytes. Uploads
  from before the ledger count as 0.
"""

import logging
from datetime import UTC, datetime, timedelta
from typing import Optional

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.upload_repo import UploadRepo
from db.repos.user_repo import UserRepo
from domain.plan import CompResult, PlanName, PlanStatus, PlanWhy
from domain.upload import Upload, UploadKind
from domain.user import User
from integrations import feature_flags, oauth
from integrations.oauth import PatreonMembership

logger = logging.getLogger(__name__)

# ── The plans, in one place ───────────────────────────────────────────────────
_MB = 1024 * 1024
FREE_CAMPAIGNS = 2
FREE_UPLOAD_BYTES = 250 * _MB
PATRON_UPLOAD_BYTES = 5 * 1024 * _MB
# A Patreon membership counts when it is worth at least this much a month...
PATRON_MIN_CENTS = 400
# ...or, paid yearly, at least this much a year ($40/year is the $4 tier paid yearly).
PATRON_MIN_ANNUAL_CENTS = 4000
# How long a Patreon check counts for. Patreon user tokens expire, so there is no
# background polling: each Patreon sign-in or "Link your Patreon" refreshes it.
MEMBERSHIP_FRESH_DAYS = 40
PRICE_MONTHLY = "$4/month"
PRICE_YEARLY = "$40/year"

_CAMPAIGNS_MESSAGE = (
    "Free DMs run two campaigns. Become a Patron for unlimited campaigns, "
    "or delete one you've finished."
)
_FREE_STORAGE_MESSAGE = (
    "Free DMs have 250 MB for pictures, maps and figures, and this file would go past it. "
    "Become a Patron for 5 GB."
)
_PATRON_STORAGE_MESSAGE = (
    "Patrons have 5 GB for pictures, maps and figures, and this file would go past it. "
    'Tell us with "Send feedback" in the menu if you need more room.'
)


class PlanLimitError(Exception):
    """A new campaign or upload would go past the DM's plan. The API answers 402.

    Deliberately not a ValueError or PermissionError, so routers that map those
    to 422/403 let it through to the app-wide 402 handler.
    """

    def __init__(self, limit: str, message: str) -> None:
        """Remember which limit was hit and the sentence to show.

        Args:
            limit: ``"campaigns"`` or ``"storage"``.
            message: Plain words for the DM.
        """
        super().__init__(message)
        self.limit = limit
        self.message = message

    def detail(self) -> dict:
        """The 402 body's ``detail``: a code the frontend knows, and the sentence."""
        return {"code": "plan_limit", "limit": self.limit, "message": self.message}


# ── Rules (pure) ──────────────────────────────────────────────────────────────


def _now() -> datetime:
    """The current time, timezone-aware UTC."""
    return datetime.now(UTC)


def _as_utc(value: Optional[datetime]) -> Optional[datetime]:
    """Read a stored time as UTC (the users columns are timezone-naive UTC)."""
    if value is None:
        return None
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def _is_admin(email: str) -> bool:
    """Admin check, imported late (auth_service imports this module)."""
    from services.auth_service import is_admin

    return is_admin(email)


def membership_cents(membership: PatreonMembership) -> int:
    """What a Patreon membership is worth a month, in cents, for the Patron check.

    Patreon reports ``currently_entitled_amount_cents`` per payment cycle, so an
    annual member's amount is the year's total (Patreon's own plugin divides by
    ``pledge_cadence``). A yearly payment of ``PATRON_MIN_ANNUAL_CENTS`` counts
    as ``PATRON_MIN_CENTS`` a month: $40/year is the $4 tier paid yearly. The
    entitled tier's own monthly price, when Patreon sends it, also counts (it is
    in the campaign's currency, so a patron paying in another currency isn't
    short-changed by the exchange rate). The larger of the two wins.

    Args:
        membership: The parsed membership.

    Returns:
        Monthly-equivalent cents (0 when there is no membership).
    """
    if not membership.found:
        return 0
    paid = membership.entitled_cents
    cadence = membership.cadence_months
    if cadence >= 12:
        # Each year counts at the yearly price: paid / years / (annual / monthly).
        monthly = paid * PATRON_MIN_CENTS * 12 // (PATRON_MIN_ANNUAL_CENTS * cadence)
    elif cadence > 1:
        monthly = paid // cadence
    else:
        monthly = paid
    return max(monthly, membership.tier_cents)


def patreon_counts(user: Optional[User], now: Optional[datetime] = None) -> bool:
    """Whether this user's last Patreon check makes them a Patron right now.

    Args:
        user: The account, if any.
        now: The current time (tests pass one).

    Returns:
        True for an active membership worth enough, checked within 40 days.
    """
    if user is None or not user.patron_active or user.patron_tier_cents < PATRON_MIN_CENTS:
        return False
    checked = _as_utc(user.patron_checked_at)
    if checked is None:
        return False
    return (now or _now()) - checked <= timedelta(days=MEMBERSHIP_FRESH_DAYS)


def plan_for(
    email: str, user: Optional[User], now: Optional[datetime] = None
) -> tuple[PlanName, Optional[PlanWhy]]:
    """Which plan a DM is on, and why.

    Args:
        email: The DM's email.
        user: Their account row, if any.
        now: The current time (tests pass one).

    Returns:
        ``("patron", "admin" | "comped" | "patreon")`` or ``("free", None)``.
    """
    if _is_admin(email):
        return "patron", "admin"
    if user is not None and user.patron_comped:
        return "patron", "comped"
    if patreon_counts(user, now):
        return "patron", "patreon"
    return "free", None


def limits_for(plan: PlanName, why: Optional[PlanWhy]) -> tuple[Optional[int], Optional[int]]:
    """The campaign and upload limits of a plan (None means unlimited).

    Args:
        plan: ``free`` or ``patron``.
        why: Why they are a Patron (admins have no limits at all).

    Returns:
        ``(campaigns_limit, upload_bytes_limit)``.
    """
    if why == "admin":
        return None, None
    if plan == "patron":
        return None, PATRON_UPLOAD_BYTES
    return FREE_CAMPAIGNS, FREE_UPLOAD_BYTES


# ── Reads ─────────────────────────────────────────────────────────────────────


def plan_of(db: Session, email: str) -> tuple[PlanName, Optional[PlanWhy]]:
    """Look up a DM's plan.

    Args:
        db: Active database session.
        email: The DM's email.

    Returns:
        ``(plan, why)`` as in ``plan_for``.
    """
    return plan_for(email, UserRepo.get_by_email(db, email))


def is_patron(db: Session, email: str) -> bool:
    """Whether a DM is on the Patron plan (admins included).

    Args:
        db: Active database session.
        email: The DM's email.

    Returns:
        True for a Patron.
    """
    return plan_of(db, email)[0] == "patron"


def upload_bytes_used(db: Session, email: str) -> int:
    """Bytes a DM has uploaded since the ledger began.

    Args:
        db: Active database session.
        email: The DM's email.

    Returns:
        The total.
    """
    return UploadRepo.total_bytes(db, email)


def status(db: Session, email: str) -> PlanStatus:
    """The signed-in DM's plan page: plan, usage, limits and Patreon state.

    Args:
        db: Active database session.
        email: The signed-in DM.

    Returns:
        A PlanStatus.
    """
    email = email.strip().lower()
    user = UserRepo.get_by_email(db, email)
    now = _now()
    plan, why = plan_for(email, user, now)
    campaigns_limit, upload_limit = limits_for(plan, why)
    counts = patreon_counts(user, now)
    checked = _as_utc(user.patron_checked_at) if user else None
    return PlanStatus(
        plan=plan,
        why=why,
        pricing_on=feature_flags.pricing_on(),
        campaigns_used=len(CampaignRepo.list_by_dm(db, email)),
        campaigns_limit=campaigns_limit,
        upload_bytes_used=upload_bytes_used(db, email),
        upload_bytes_limit=upload_limit,
        patreon_linked=bool(user and user.patreon_id),
        patron_checked_at=checked,
        patreon_counts=counts,
        patreon_counts_until=(
            checked + timedelta(days=MEMBERSHIP_FRESH_DAYS) if counts and checked else None
        ),
        patreon_available="patreon" in oauth.configured_providers(),
        support_url=feature_flags.support_url() or None,
        price_monthly=PRICE_MONTHLY,
        price_yearly=PRICE_YEARLY,
        free_campaigns=FREE_CAMPAIGNS,
        free_upload_bytes=FREE_UPLOAD_BYTES,
        patron_upload_bytes=PATRON_UPLOAD_BYTES,
    )


# ── Checks (enforced only when PRICING=on) ────────────────────────────────────


def check_can_create_campaign(db: Session, email: str) -> None:
    """Refuse a new campaign past the Free plan's two. No-op while pricing is off.

    Args:
        db: Active database session.
        email: The DM creating it.

    Raises:
        PlanLimitError: A Free DM already runs ``FREE_CAMPAIGNS`` campaigns.
    """
    if not feature_flags.pricing_on():
        return
    plan, why = plan_of(db, email)
    limit, _ = limits_for(plan, why)
    if limit is not None and len(CampaignRepo.list_by_dm(db, email)) >= limit:
        raise PlanLimitError("campaigns", _CAMPAIGNS_MESSAGE)


def check_can_upload(db: Session, email: str, size_bytes: int) -> None:
    """Refuse an upload that would take a DM past their plan's storage. No-op while pricing is off.

    Args:
        db: Active database session.
        email: The uploading DM.
        size_bytes: The new file's size.

    Raises:
        PlanLimitError: The file would go past 250 MB (Free) or 5 GB (Patron).
    """
    if not feature_flags.pricing_on():
        return
    plan, why = plan_of(db, email)
    _, limit = limits_for(plan, why)
    if limit is None:
        return
    if upload_bytes_used(db, email) + max(0, size_bytes) > limit:
        message = _PATRON_STORAGE_MESSAGE if plan == "patron" else _FREE_STORAGE_MESSAGE
        raise PlanLimitError("storage", message)


# ── Writes ────────────────────────────────────────────────────────────────────


def record_upload(db: Session, email: str, url: str, size_bytes: int, kind: UploadKind) -> Upload:
    """Add a stored file to the uploads ledger (always, whether pricing is on or not).

    Args:
        db: Active database session.
        email: The uploading DM.
        url: Where the file now lives.
        size_bytes: Its size.
        kind: ``portrait``, ``map`` or ``model``.

    Returns:
        The ledger row.
    """
    row = Upload(
        owner_email=email.strip().lower(),
        url=url[:1000],
        size_bytes=max(0, int(size_bytes)),
        kind=kind,
    )
    return UploadRepo.add(db, row)


def apply_membership(
    user: User, membership: Optional[PatreonMembership], now: Optional[datetime] = None
) -> None:
    """Copy a fresh Patreon membership read onto the account (the caller saves it).

    ``None`` means the membership wasn't asked for (no PATREON_CAMPAIGN_ID), so
    the stored snapshot is left alone. A read that found no membership records
    that, so a lapsed Patron stops counting straight away.

    Args:
        user: The account to update.
        membership: What Patreon said, or None.
        now: The check time (tests pass one).
    """
    if membership is None:
        return
    user.patron_active = membership.active
    user.patron_tier_cents = membership_cents(membership)
    # Aware UTC: SQLModel 0.0.4x refuses naive datetimes on bind (it broke CI and
    # would have broken a Patreon sign-in on Render). Reads go through _as_utc,
    # which accepts either, so rows written naive before this still work.
    user.patron_checked_at = (now or _now()).astimezone(UTC)


def set_comped(db: Session, admin_email: str, email: str, comped: bool) -> CompResult:
    """Give Patron to a DM, or take it back (admin only).

    Args:
        db: Active database session.
        admin_email: The requesting admin.
        email: The DM to change.
        comped: True to give Patron, False to remove it.

    Returns:
        Their comp flag and plan afterwards.

    Raises:
        PermissionError: If the requester isn't an admin.
        ValueError: If there is no account with that email.
    """
    from services.auth_service import require_admin

    require_admin(admin_email)
    user = UserRepo.get_by_email(db, email)
    if user is None:
        raise ValueError("No account with that email.")
    user.patron_comped = bool(comped)
    user = UserRepo.save(db, user, touch=False)  # "Last seen" stays the DM's own
    logger.info("Patron comp %s for a DM by an admin", "given" if comped else "removed")
    plan, _ = plan_for(user.email, user)
    return CompResult(email=user.email, comped=user.patron_comped, plan=plan)
