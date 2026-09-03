"""Signed session tokens (Plan 73) — stdlib HMAC, no new dependencies.

A token is ``base64url(payload) . base64url(hmac_sha256(secret, payload))``
where payload is JSON ``{"sub": email, "exp": unix_seconds, "kind": ...}``.
The secret comes from ``APP_SECRET``. Verification is constant-time and
fail-closed: no secret, bad signature, or expiry → ``None``.
"""

import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from typing import Any, Optional

_DEFAULT_TTL_SECONDS = 30 * 24 * 3600


def _secret() -> Optional[bytes]:
    raw = os.environ.get("APP_SECRET", "").strip()
    return raw.encode("utf-8") if raw else None


def _b64e(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _b64d(text: str) -> bytes:
    pad = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + pad)


def issue(
    subject: str,
    *,
    kind: str = "session",
    ttl_seconds: int = _DEFAULT_TTL_SECONDS,
    extra: Optional[dict[str, Any]] = None,
) -> str:
    """Mint a signed token for ``subject``.

    Args:
        subject: The identity (lowercased email) the token asserts.
        kind: Token kind — ``session`` for logins, ``state`` for OAuth CSRF.
        ttl_seconds: Lifetime.
        extra: Additional claims (kept small; the token rides in headers).

    Returns:
        The token string.

    Raises:
        RuntimeError: If ``APP_SECRET`` is not configured.
    """
    secret = _secret()
    if secret is None:
        raise RuntimeError("APP_SECRET is not configured — cannot issue tokens.")
    payload: dict[str, Any] = {
        "sub": subject.strip().lower(),
        "exp": int(time.time()) + ttl_seconds,
        "kind": kind,
        "nonce": secrets.token_urlsafe(8),
    }
    if extra:
        payload.update(extra)
    body = json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    sig = hmac.new(secret, body, hashlib.sha256).digest()
    return f"{_b64e(body)}.{_b64e(sig)}"


def verify(token: str, *, kind: str = "session") -> Optional[dict[str, Any]]:
    """Validate a token and return its claims, or ``None`` if it is not trustworthy.

    Args:
        token: The token string.
        kind: The expected token kind.

    Returns:
        The claims dict, or ``None`` on any failure (fail-closed).
    """
    secret = _secret()
    if secret is None or not token or "." not in token:
        return None
    try:
        body_b64, sig_b64 = token.split(".", 1)
        body = _b64d(body_b64)
        expected = hmac.new(secret, body, hashlib.sha256).digest()
        if not hmac.compare_digest(expected, _b64d(sig_b64)):
            return None
        claims = json.loads(body)
    except (ValueError, TypeError):
        return None
    if claims.get("kind") != kind:
        return None
    if int(claims.get("exp", 0)) < int(time.time()):
        return None
    if not claims.get("sub"):
        return None
    return claims
