"""Product-level settings read from the environment (Plan 86).

QuestLab has no generative AI (Plan 124 removed the dormant ``AI_FEATURES``
switch along with the code it guarded).
"""

import os


def public_web_url() -> str:
    """Where the frontend is served; used for assets the API hands out (the sample map)."""
    return os.environ.get("PUBLIC_WEB_URL", "https://quest-lab-tau.vercel.app").strip().rstrip("/")
