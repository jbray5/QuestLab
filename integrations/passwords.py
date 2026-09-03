"""Password hashing (Plan 73b) — stdlib scrypt, no new dependencies.

Stored form: ``scrypt$<n>$<r>$<p>$<salt_b64>$<hash_b64>``. Verification is
constant-time. Parameters follow the OWASP 2024 scrypt guidance
(N=2^15, r=8, p=1) — ~50 ms on a modern CPU, memory-hard.
"""

import base64
import hashlib
import hmac
import secrets

_N = 2**15
_R = 8
_P = 1
_DKLEN = 32
# OpenSSL caps scrypt at 32 MiB by default; N=2^15,r=8 needs ~33 MiB.
_MAXMEM = 128 * 1024 * 1024


def hash_password(password: str) -> str:
    """Hash a password for storage.

    Args:
        password: The plaintext password.

    Returns:
        The encoded hash string.

    Raises:
        ValueError: If the password is shorter than 8 characters.
    """
    if len(password) < 8:
        raise ValueError("Use at least 8 characters.")
    salt = secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=_N, r=_R, p=_P, dklen=_DKLEN, maxmem=_MAXMEM
    )
    return "scrypt${}${}${}${}${}".format(
        _N,
        _R,
        _P,
        base64.b64encode(salt).decode("ascii"),
        base64.b64encode(digest).decode("ascii"),
    )


def verify_password(password: str, encoded: str) -> bool:
    """Check a password against a stored hash (constant-time).

    Args:
        password: The plaintext password to check.
        encoded: The stored hash string.

    Returns:
        True when it matches; False on mismatch or a malformed hash.
    """
    try:
        algo, n, r, p, salt_b64, hash_b64 = encoded.split("$")
        if algo != "scrypt":
            return False
        salt = base64.b64decode(salt_b64)
        expected = base64.b64decode(hash_b64)
        digest = hashlib.scrypt(
            password.encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
            maxmem=_MAXMEM,
        )
    except (ValueError, TypeError):
        return False
    return hmac.compare_digest(digest, expected)
