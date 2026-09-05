"""Per-IP request throttling (Plan 77) — stdlib only, in-process.

Good enough for a single API instance in front of a Reddit launch: a fixed
sixty-second window per (bucket, client IP).

    RATE_LIMIT=on|off                (default on; tests set off)
    RATE_LIMIT_AUTH_PER_MIN=20       sign-in, sign-up, waitlist, join-by-link
    RATE_LIMIT_WRITES_PER_MIN=120    every other POST / PUT / PATCH / DELETE

Reads (sheets, table state, SSE) are never throttled — a table full of phones
polls constantly and must keep working.
"""

import os
import threading
import time
from typing import Mapping, Optional

_AUTH_PREFIXES = ("/api/auth/login", "/api/auth/signup", "/api/waitlist")
_JOIN_PREFIX = "/api/play/join/"
_WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

_lock = threading.Lock()
_hits: dict[tuple[str, str], tuple[int, int]] = {}  # (bucket, ip) -> (minute, count)
_last_prune = 0


def enabled() -> bool:
    """Whether throttling is on (``RATE_LIMIT`` is anything but ``off``)."""
    return os.environ.get("RATE_LIMIT", "on").strip().lower() != "off"


def _limit(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default))))
    except ValueError:
        return default


def bucket_for(path: str, method: str) -> Optional[tuple[str, int]]:
    """Which bucket (and per-minute limit) a request falls into, or None for unthrottled."""
    m = method.upper()
    if path.startswith(_AUTH_PREFIXES) or (path.startswith(_JOIN_PREFIX) and m == "POST"):
        return ("auth", _limit("RATE_LIMIT_AUTH_PER_MIN", 20))
    if m in _WRITE_METHODS:
        return ("writes", _limit("RATE_LIMIT_WRITES_PER_MIN", 120))
    return None


def client_ip(headers: Mapping[str, str], fallback: str) -> str:
    """The caller's IP: the first hop of X-Forwarded-For behind Render's proxy, else the socket."""
    fwd = headers.get("x-forwarded-for") or headers.get("X-Forwarded-For") or ""
    first = fwd.split(",")[0].strip()
    return first or fallback


def check(path: str, method: str, headers: Mapping[str, str], fallback_ip: str) -> Optional[int]:
    """Record one request and say how many seconds to wait if it is over the limit.

    Args:
        path: Request path (``/api/...``).
        method: HTTP method.
        headers: Request headers (for X-Forwarded-For).
        fallback_ip: The socket peer address.

    Returns:
        None when allowed; otherwise the number of seconds until the window resets.
    """
    global _last_prune
    if not enabled():
        return None
    bucket = bucket_for(path, method)
    if bucket is None:
        return None
    name, limit = bucket
    now = int(time.time())
    minute = now // 60
    key = (name, client_ip(headers, fallback_ip))
    with _lock:
        if now - _last_prune > 120:
            stale = [k for k, (m, _) in _hits.items() if m < minute]
            for k in stale:
                del _hits[k]
            _last_prune = now
        m, count = _hits.get(key, (minute, 0))
        if m != minute:
            count = 0
        count += 1
        _hits[key] = (minute, count)
    if count > limit:
        return max(1, 60 - (now % 60))
    return None


def reset() -> None:
    """Forget every window (tests)."""
    with _lock:
        _hits.clear()
