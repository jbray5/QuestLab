"""Upload checks (SEC-004): decide a file's type from its bytes, never its name.

The browser's content-type and the filename are both client-controlled. A file
named ``x.html`` sent as ``image/png`` used to be stored as ``.html`` and served
from the API origin (stored XSS). Every upload is now identified by its magic
bytes, stored under an extension chosen here, and served only if that extension
is on the media allowlist.
"""

from typing import NamedTuple, Optional


class MediaKind(NamedTuple):
    """A recognised upload: the extension it is stored under and its media type."""

    ext: str
    content_type: str


IMAGE_TYPES = frozenset({"image/jpeg", "image/png", "image/webp", "image/gif"})
VIDEO_TYPES = frozenset({"video/mp4", "video/webm"})
MODEL_TYPES = frozenset({"model/gltf-binary"})

# What /uploads/ may serve, by extension (everything we can store, nothing else).
SERVABLE_EXTENSIONS = frozenset({"jpg", "png", "webp", "gif", "mp4", "webm", "glb"})


def sniff_media(contents: bytes) -> Optional[MediaKind]:
    """Identify an upload from its leading bytes.

    Recognises JPEG, PNG, GIF, WebP, MP4 (ISO base media ``ftyp``), WebM/Matroska
    and binary glTF 2. Anything else, including SVG, HTML and text, is ``None``.

    Args:
        contents: The uploaded bytes.

    Returns:
        The stored extension and media type, or ``None`` when unrecognised.
    """
    head = contents[:16]
    if head.startswith(b"\xff\xd8\xff"):
        return MediaKind("jpg", "image/jpeg")
    if head.startswith(b"\x89PNG\r\n\x1a\n"):
        return MediaKind("png", "image/png")
    if head.startswith((b"GIF87a", b"GIF89a")):
        return MediaKind("gif", "image/gif")
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return MediaKind("webp", "image/webp")
    if len(head) >= 12 and head[4:8] == b"ftyp":
        return MediaKind("mp4", "video/mp4")
    if head.startswith(b"\x1a\x45\xdf\xa3"):
        return MediaKind("webm", "video/webm")
    if len(head) >= 12 and head[:4] == b"glTF" and int.from_bytes(head[4:8], "little") == 2:
        return MediaKind("glb", "model/gltf-binary")
    return None


def accept_upload(contents: bytes, allowed: frozenset[str]) -> Optional[MediaKind]:
    """Return the sniffed kind when it is one of ``allowed`` media types, else ``None``.

    Args:
        contents: The uploaded bytes.
        allowed: Media types this endpoint takes (e.g. ``IMAGE_TYPES``).

    Returns:
        The kind to store, or ``None`` to reject the upload.
    """
    kind = sniff_media(contents)
    if kind is None or kind.content_type not in allowed:
        return None
    return kind


def is_servable(path: str) -> bool:
    """True when an ``/uploads/`` path ends in an extension we would have stored.

    Args:
        path: The request path (or filename).

    Returns:
        Whether the file may be served.
    """
    name = path.rsplit("/", 1)[-1]
    if "." not in name:
        return False
    return name.rsplit(".", 1)[-1].lower() in SERVABLE_EXTENSIONS
