"""Tamper seal for Practice Arena state (Plan 85, stabilised in Plan 88).

The phone holds the fight between turns; the seal is how the referee knows
the document it gets back is the one it handed out. HMAC-SHA256 over the
canonical JSON, keyed by the first of: ``ARENA_SECRET``, ``APP_SECRET``, a
digest of the database credentials (stable across deploys, never sent
anywhere), or — last resort — a per-process random secret, in which case a
restart ends open fights.
"""

import hashlib
import hmac
import os
import secrets


def _key() -> bytes:
    for name in ("ARENA_SECRET", "APP_SECRET"):
        raw = os.environ.get(name, "").strip()
        if raw:
            return hashlib.sha256(("arena:" + raw).encode("utf-8")).digest()
    creds = os.environ.get("PGPASSWORD", "").strip() + "@" + os.environ.get("PGHOST", "").strip()
    if creds != "@":
        return hashlib.sha256(("arena:" + creds).encode("utf-8")).digest()
    return secrets.token_bytes(32)


_SECRET = _key()


def sign(payload: str) -> str:
    """Hex HMAC of ``payload``."""
    return hmac.new(_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def verify(payload: str, signature: str) -> bool:
    """Constant-time check of ``signature`` against ``payload``."""
    return bool(signature) and hmac.compare_digest(sign(payload), signature)
