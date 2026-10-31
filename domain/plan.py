"""Plans and pricing (Plan 130): what a DM's plan is, what it allows, and how much they use.

Players never pay. During the beta (``PRICING=off``) nothing is capped; after
it, a Free DM has 2 campaigns and 250 MB of uploads and a Patron ($4/month or
$40/year on Patreon) has unlimited campaigns and 5 GB. The numbers live in
``services/plan_service.py``; these are the shapes the API speaks.
"""

from datetime import datetime
from typing import Literal, Optional

from pydantic import BaseModel
from pydantic import Field as PField

from domain.beta import BetaDm, BetaOverview

PlanName = Literal["free", "patron"]
# Why someone is a Patron: an admin, given Patron by an admin, or a Patreon membership.
PlanWhy = Literal["admin", "comped", "patreon"]


class PlanStatus(BaseModel):
    """The signed-in DM's plan, what it allows, and how much of it they use."""

    plan: PlanName
    why: Optional[PlanWhy] = None
    # False during the beta: the limits below are shown, never enforced.
    pricing_on: bool
    campaigns_used: int
    # The limits of this DM's plan; None means unlimited.
    campaigns_limit: Optional[int] = None
    upload_bytes_used: int
    upload_bytes_limit: Optional[int] = None
    # Patreon: linked at all, last read, and whether that membership counts now.
    patreon_linked: bool = False
    patron_checked_at: Optional[datetime] = None
    patreon_counts: bool = False
    # When the last Patreon check stops counting (checked_at + 40 days), if it counts.
    patreon_counts_until: Optional[datetime] = None
    # Whether this server can link a Patreon account at all (Patreon sign-in configured).
    patreon_available: bool = False
    # QuestLab's Patreon page (PATREON_URL), or None.
    support_url: Optional[str] = None
    price_monthly: str
    price_yearly: str
    # What each plan allows, for the "after the beta" explanation.
    free_campaigns: int
    free_upload_bytes: int
    patron_upload_bytes: int


class PatreonLinkStart(BaseModel):
    """Where to send the browser to link a Patreon account."""

    url: str


class PatreonLinkConfirm(BaseModel):
    """The signed result the Patreon callback handed the plan page, to attach to this DM."""

    token: str = PField(min_length=10, max_length=2000)


class PatreonLinkResult(BaseModel):
    """What linking did, in a sentence, and the plan afterwards."""

    message: str
    status: PlanStatus


class CompRequest(BaseModel):
    """Give Patron to a DM, or take it back (admin only)."""

    comped: bool


class CompResult(BaseModel):
    """A DM's plan after an admin changed their comp."""

    email: str
    comped: bool
    plan: PlanName


class BetaDmPlan(BetaDm):
    """A DM in the admin beta overview, with their plan (Plan 130)."""

    plan: PlanName = "free"
    comped: bool = False


class BetaPlanOverview(BetaOverview):
    """The admin beta overview whose rows carry each DM's plan (Plan 130)."""

    dms: list[BetaDmPlan]  # type: ignore[assignment]
