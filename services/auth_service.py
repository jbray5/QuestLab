"""Auth service — identity resolution and role enforcement.

All authorization checks live here. Pages must call this service;
they must not enforce auth themselves.
"""

import os

from integrations.identity import get_current_user_email as _get_email


def get_current_user_email() -> str:
    """Return the authenticated DM email for the current request.

    Delegates to integrations.identity, which reads the trusted header in
    production or falls back to CURRENT_USER_EMAIL in development.

    Returns:
        Lowercased, stripped email string.

    Raises:
        PermissionError: If no identity can be resolved (fail-closed).
    """
    return _get_email()


def get_bootstrap_admins() -> list[str]:
    """Return the list of bootstrap admin emails from environment config.

    Returns:
        Normalised list of admin email strings.
    """
    raw = os.environ.get("BOOTSTRAP_ADMIN_EMAILS", "")
    return [e.strip().lower() for e in raw.split(",") if e.strip()]


def is_admin(email: str) -> bool:
    """Return True if the email belongs to a bootstrap admin.

    Args:
        email: Email to check (case-insensitive).

    Returns:
        True if admin, False otherwise.
    """
    return email.strip().lower() in get_bootstrap_admins()


def require_admin(email: str) -> None:
    """Raise PermissionError if the email is not an admin.

    Args:
        email: Email to check.

    Raises:
        PermissionError: If the user is not an admin.
    """
    if not is_admin(email):
        raise PermissionError(f"Admin access required. '{email}' is not an admin.")
