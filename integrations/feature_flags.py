"""Product-level settings read from the environment (Plan 86).

QuestLab has no generative AI (Plan 124 removed the dormant ``AI_FEATURES``
switch along with the code it guarded). Plan 130 adds the pricing switch
(``PRICING``) and QuestLab's Patreon campaign (``PATREON_CAMPAIGN_ID``).
"""

import os


def beta_invites_required() -> bool:
    """Whether starting a new DM account needs a friends-beta invite (Plan 125).

    ``BETA_INVITES=required`` (the default) or ``off``. Existing accounts and
    admins are never asked for one.
    """
    return os.environ.get("BETA_INVITES", "required").strip().lower() != "off"


def feedback_webhook_url() -> str:
    """A Discord webhook that receives each beta feedback note, or "" for none (Plan 125)."""
    return os.environ.get("FEEDBACK_WEBHOOK_URL", "").strip()


def public_web_url() -> str:
    """Where the frontend is served; used for assets the API hands out (the sample map)."""
    return os.environ.get("PUBLIC_WEB_URL", "https://quest-lab-tau.vercel.app").strip().rstrip("/")


def pricing_on() -> bool:
    """Whether the Free plan's caps are enforced (Plan 130).

    ``PRICING=off`` (the default, the beta: no caps) or ``on`` (Free DMs get
    2 campaigns and 250 MB of uploads; Patrons get more). Players never pay.
    """
    return os.environ.get("PRICING", "off").strip().lower() == "on"


def patreon_campaign_id() -> str:
    """QuestLab's own Patreon campaign id, or "" when not set (Plan 130).

    A DM's membership of THIS campaign is what makes them a Patron.
    """
    return os.environ.get("PATREON_CAMPAIGN_ID", "").strip()


def support_url() -> str:
    """The public Patreon page people support QuestLab on (``PATREON_URL``), or ""."""
    return os.environ.get("PATREON_URL", "").strip()
