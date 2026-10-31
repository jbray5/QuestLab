"""Product-level settings read from the environment (Plan 86).

QuestLab has no generative AI (Plan 124 removed the dormant ``AI_FEATURES``
switch along with the code it guarded).
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
