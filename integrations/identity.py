"""Identity resolution from trusted HTTP headers (Azure Front Door + Entra ID).

In production, Azure Front Door injects the authenticated user's email via the
header named by ``AUTH_EMAIL_HEADER``. This module reads that header from the
Streamlit request context and returns the email string.

In local development (``ENV=development``), if the header is absent the module
falls back to the ``CURRENT_USER_EMAIL`` environment variable so developers can
work without a full Azure stack. This fallback is **never** active in production.

Raises:
    PermissionError: when no identity can be resolved (fail-closed).
"""

import os

import streamlit as st


def get_current_user_email() -> str:
    """Resolve the authenticated user's email from the request context.

    Reads the header configured by ``AUTH_EMAIL_HEADER``.  Falls back to
    ``CURRENT_USER_EMAIL`` env var in development.  Raises ``PermissionError``
    if no identity is available.

    Returns:
        Lowercase email string of the authenticated user.

    Raises:
        PermissionError: Identity header missing and not in development mode.
    """
    header_name = os.environ.get("AUTH_EMAIL_HEADER", "X-MS-CLIENT-PRINCIPAL-NAME")
    env = os.environ.get("ENV", "production").lower()

    email = _extract_from_headers(header_name)

    if email:
        return email.lower().strip()

    if env == "development":
        fallback = os.environ.get("CURRENT_USER_EMAIL", "").strip()
        if fallback:
            return fallback.lower()

    raise PermissionError("Access denied: identity header missing and no dev fallback configured.")


def _extract_from_headers(header_name: str) -> str | None:
    """Pull the named header value from the Streamlit request context.

    Args:
        header_name: HTTP header name to look up (case-insensitive).

    Returns:
        Header value string, or ``None`` if not present.
    """
    try:
        headers = st.context.headers
        # Streamlit headers dict is case-insensitive
        return headers.get(header_name) or None
    except AttributeError:
        # st.context not available (e.g., running outside Streamlit in tests)
        return None
