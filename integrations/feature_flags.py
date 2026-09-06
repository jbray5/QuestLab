"""Product-level switches read from the environment (Plan 86).

``AI_FEATURES`` — ``off`` (default) or ``on``. QuestLab ships with no
generative AI: every generation route answers 404 and every generation
control is hidden unless this is explicitly ``on`` for a private deployment.
"""

import os


def ai_features_enabled() -> bool:
    """Whether generative AI routes are reachable at all. Default: no."""
    return os.environ.get("AI_FEATURES", "off").strip().lower() in ("on", "1", "true", "yes")


def public_web_url() -> str:
    """Where the frontend is served; used for assets the API hands out (the sample map)."""
    return os.environ.get("PUBLIC_WEB_URL", "https://quest-lab-tau.vercel.app").strip().rstrip("/")
