"""Pure-python PNG helpers (Plan 46).

No Pillow/numpy — a minimal PNG codec: decode 8-bit RGB/RGBA, encode RGB.
``scripts/seed_crier_roster.py`` paints its procedural avatars with
``encode_rgb_png``. (The AI cut-out keyers and the auto-props footprint diff
that once lived here went with generative AI in Plan 124.)
"""

import struct
import zlib


def decode_png(data: bytes) -> tuple[int, int, int, bytearray]:
    """Decode an 8-bit RGB/RGBA PNG into raw pixel bytes.

    Args:
        data: The PNG file bytes.

    Returns:
        (width, height, bytes_per_pixel, pixel bytes row-major).

    Raises:
        ValueError: If the PNG is not 8-bit color type 2 or 6.
    """
    w, h, depth, ctype = struct.unpack(">IIBB", data[16:26])
    if depth != 8 or ctype not in (2, 6):
        raise ValueError(f"Unsupported PNG (depth={depth}, colortype={ctype}).")
    bpp = 4 if ctype == 6 else 3
    idat = b""
    i = 8
    while i < len(data):
        ln = struct.unpack(">I", data[i : i + 4])[0]
        typ = data[i + 4 : i + 8]
        if typ == b"IDAT":
            idat += data[i + 8 : i + 8 + ln]
        i += 12 + ln
    raw = zlib.decompress(idat)
    stride = w * bpp
    out = bytearray(w * h * bpp)
    prev = bytearray(stride)
    pos = 0
    for row in range(h):
        f = raw[pos]
        line = bytearray(raw[pos + 1 : pos + 1 + stride])
        pos += 1 + stride
        if f == 1:
            for x in range(bpp, stride):
                line[x] = (line[x] + line[x - bpp]) & 0xFF
        elif f == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif f == 3:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                line[x] = (line[x] + ((a + prev[x]) >> 1)) & 0xFF
        elif f == 4:
            for x in range(stride):
                a = line[x - bpp] if x >= bpp else 0
                b = prev[x]
                c = prev[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pr = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pr) & 0xFF
        out[row * stride : (row + 1) * stride] = line
        prev = line
    return w, h, bpp, out


def encode_rgb_png(w: int, h: int, rgb: bytes) -> bytes:
    """Encode raw RGB bytes as a filter-0 PNG (test/debug helper).

    Args:
        w: Image width.
        h: Image height.
        rgb: Row-major RGB bytes (3 per pixel).

    Returns:
        PNG file bytes.
    """

    def chunk(typ: bytes, body: bytes) -> bytes:
        return (
            struct.pack(">I", len(body))
            + typ
            + body
            + struct.pack(">I", zlib.crc32(typ + body) & 0xFFFFFFFF)
        )

    stride = w * 3
    raw = b"".join(b"\x00" + bytes(rgb[r * stride : (r + 1) * stride]) for r in range(h))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )
