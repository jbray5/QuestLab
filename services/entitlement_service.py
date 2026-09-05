"""AI entitlements (Plan 73; tiers in Plan 77) — who may spend generation credits.

Policy is env-driven so a personal deployment stays wide open:

    AI_GATE=off        (default) everyone signed in may use AI
    AI_GATE=patreon    active patrons, admins, and AI_FREE_EMAILS only
    AI_DAILY_LIMIT=50  per-user generations per UTC day while the gate is off (0 = unlimited)
    AI_FREE_EMAILS     comma-separated allowlist (friends, playtesters)
    PATREON_URL        the public Patreon page shown in the paywall
    AI_TIERS           Patreon tiers, lowest first, as "cents:name:daily:scope,…"
                       default: 500:hearth:15:text,1200:lantern:40:all,2500:table:120:all

Three kinds of generation are metered: ``text`` (NPCs, monster suggestions,
briefs, runbooks, shop stock, item lore), ``art`` (portraits, standees,
backdrops, props, world maps, item images, the player forge) and ``pack`` (a
full Session Pack). A tier's scope is ``text`` or ``all``. A patron's tier is
the highest whose minimum pledge they meet; an active patron below the lowest
minimum (a legacy pledge) counts as the lowest tier.

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

DEFAULT_TIERS = "500:hearth:15:text,1200:lantern:40:all,2500:table:120:all"

TIER_LABELS = {"hearth": "Hearth", "lantern": "Lantern", "table": "Table"}
TIER_BLURBS = {
    "hearth": (
        "AI for prep: NPCs with secrets, monster picks, briefs, runbooks, shop stock, item lore."
    ),
    "lantern": (
        "Everything in Hearth, plus art — portraits, standees, backdrops, props, world maps, "
        "the players' forge — and full Session Packs."
    ),
    "table": (
        "Everything in Lantern with a much bigger daily allowance, a seat in the Discord, "
        "and your name in the credits."
    ),
}


@dataclass(frozen=True)
class Tier:
    """One Patreon tier as the app understands it."""

    name: str
    min_cents: int
    daily: int  # 0 = unlimited
    scope: str  # "text" | "all"

    def allows(self, kind: str) -> bool:
        """Whether this tier may run a generation of ``kind``."""
        return self.scope == "all" or kind == "text"


@dataclass(frozen=True)
class Entitlement:
    """The answer to "may this person generate right now?"."""

    allowed: bool
    reason: Optional[str] = None  # "patreon_required" | "tier_required" | "daily_limit" | None
    remaining_today: Optional[int] = None
    patreon_url: Optional[str] = None
    tier: str = "free"  # "free" | tier name | "admin" | "open" (gate off)
    required_tier: Optional[str] = None
    daily_limit: Optional[int] = None


def gate_mode() -> str:
    """The configured AI gate: ``off`` or ``patreon``."""
    mode = os.environ.get("AI_GATE", "off").strip().lower()
    return "patreon" if mode == "patreon" else "off"


def daily_limit() -> int:
    """Per-user generations per UTC day while the gate is off; 0 means unlimited."""
    try:
        return max(0, int(os.environ.get("AI_DAILY_LIMIT", "50")))
    except ValueError:
        return 50


def tiers() -> list[Tier]:
    """The configured tiers, lowest pledge first (defaults when AI_TIERS is unset or malformed)."""
    raw = os.environ.get("AI_TIERS", "").strip() or DEFAULT_TIERS
    out: list[Tier] = []
    try:
        for part in raw.split(","):
            cents, name, daily, scope = [p.strip() for p in part.split(":")]
            if scope not in ("text", "all") or not name:
                raise ValueError(part)
            out.append(Tier(name.lower(), max(0, int(cents)), max(0, int(daily)), scope))
    except ValueError:
        out = []
    if not out:
        for part in DEFAULT_TIERS.split(","):
            cents, name, daily, scope = part.split(":")
            out.append(Tier(name, int(cents), int(daily), scope))
    return sorted(out, key=lambda t: t.min_cents)


def tier_for_cents(cents: int) -> Optional[Tier]:
    """The highest tier whose minimum pledge ``cents`` meets, or None."""
    best: Optional[Tier] = None
    for t in tiers():
        if cents >= t.min_cents:
            best = t
    return best


def lowest_tier_for(kind: str) -> Optional[Tier]:
    """The cheapest tier that may run a generation of ``kind``."""
    for t in tiers():
        if t.allows(kind):
            return t
    return None


def plans() -> list[dict]:
    """The tier table for the paywall and the guide (public, no secrets)."""
    return [
        {
            "name": t.name,
            "label": TIER_LABELS.get(t.name, t.name.title()),
            "price_cents": t.min_cents,
            "daily": t.daily,
            "scope": t.scope,
            "blurb": TIER_BLURBS.get(t.name, "AI generation, metered daily."),
        }
        for t in tiers()
    ]


def _admin_emails() -> set[str]:
    raw = os.environ.get("BOOTSTRAP_ADMIN_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _free_emails() -> set[str]:
    raw = os.environ.get("AI_FREE_EMAILS", "")
    return {e.strip().lower() for e in raw.split(",") if e.strip()} | _admin_emails()


def personal_content_allowed(email: str) -> bool:
    """Whether ``email`` may receive non-SRD (personal-license) content, e.g. PHB subclass text.

    Only the deployment's admins — the DM whose own books those are. Everyone
    else gets the SRD 5.2.1 catalog.
    """
    return email.strip().lower() in _admin_emails()


def _today() -> str:
    return datetime.now(UTC).strftime("%Y-%m-%d")


def check_ai(db: DBSession, email: str, kind: str = "text") -> Entitlement:
    """Decide whether ``email`` may run an AI generation of ``kind`` now.

    Args:
        db: Active database session.
        email: The DM's email (campaign owner for player-facing calls).
        kind: ``text``, ``art`` or ``pack``.

    Returns:
        An Entitlement; ``allowed`` is False with a reason when gated.
    """
    email = email.strip().lower()
    patreon_url = os.environ.get("PATREON_URL", "").strip() or None
    if email in _free_emails():
        # Admins and the allowlist skip both the gate and the daily allowance —
        # the DM running the show shouldn't hit a wall mid-prep.
        return Entitlement(True, None, None, patreon_url, tier="admin")

    if gate_mode() == "patreon":
        user = UserRepo.get_by_email(db, email)
        tier: Optional[Tier] = None
        if user is not None and user.patron_active:
            tier = tier_for_cents(user.patron_tier_cents or 0) or (tiers()[0] if tiers() else None)
        if tier is None:
            need = lowest_tier_for(kind)
            return Entitlement(
                False, "patreon_required", None, patreon_url, "free", need.name if need else None
            )
        if not tier.allows(kind):
            need = lowest_tier_for(kind)
            return Entitlement(
                False, "tier_required", None, patreon_url, tier.name, need.name if need else None
            )
        limit = tier.daily
        tier_name = tier.name
    else:
        limit = daily_limit()
        tier_name = "open"

    if limit:
        row = AiUsageRepo.get(db, email, _today())
        used = row.count if row else 0
        if used >= limit:
            return Entitlement(False, "daily_limit", 0, patreon_url, tier_name, None, limit)
        return Entitlement(True, None, limit - used, patreon_url, tier_name, None, limit)
    return Entitlement(True, None, None, patreon_url, tier_name)


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
