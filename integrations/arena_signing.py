"""Tamper seal for Practice Arena state (Plan 85).

The phone holds the fight between turns; the seal is how the referee knows
the document it gets back is the one it handed out. HMAC-SHA256 over the
canonical JSON, keyed by ``ARENA_SECRET`` (or a per-process random secret, in
which case a restart simply ends open fights).
"""

import hashlib
import hmac
import os
import secrets

_SECRET = (os.environ.get("ARENA_SECRET") or secrets.token_hex(32)).encode()


def sign(payload: str) -> str:
    """Hex HMAC of ``payload``."""
    return hmac.new(_SECRET, payload.encode("utf-8"), hashlib.sha256).hexdigest()


def verify(payload: str, signature: str) -> bool:
    """Constant-time check of ``signature`` against ``payload``."""
    return bool(signature) and hmac.compare_digest(sign(payload), signature)
