"""Pure-python image utilities for the auto-props pipeline (Plan 46).

No Pillow/numpy — a minimal PNG codec (8-bit RGB/RGBA) plus the footprint
diff that finds where tall features stood by comparing a map against its
AI-generated ground layer. Slow-ish (seconds) but dependency-free and only
run at prep time.
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


def diff_footprints(
    original: bytes,
    ground: bytes,
    *,
    grid_x: int = 96,
    grid_y: int = 64,
    threshold: float = 0.12,
    min_cells: int = 8,
) -> list[dict]:
    """Find tall-feature footprints by diffing a map against its ground layer.

    Downsamples both images onto a coarse grid, thresholds the mean RGB
    difference, extracts connected components, and classifies each blob by
    the ORIGINAL image's color at its centroid (green-dominant = tree, else
    stone). Very large blobs (merged treelines) are split along their longer
    axis so a forest edge becomes several trees, not one giant.

    Args:
        original: PNG bytes of the full map.
        ground: PNG bytes of the AI ground layer (same dimensions).
        grid_x: Diff grid columns.
        grid_y: Diff grid rows.
        threshold: Mean-abs-RGB difference (0..1) that marks a changed cell.
        min_cells: Blobs smaller than this are regeneration noise.

    Returns:
        Footprints: [{x, y, kind, size_px, cells}] in image pixels, largest
        first. `y` is the blob centroid; callers offset toward the base.

    Raises:
        ValueError: If the two images have different dimensions.
    """
    w1, h1, bpp1, a = decode_png(original)
    w2, h2, bpp2, b = decode_png(ground)
    if (w1, h1) != (w2, h2):
        raise ValueError(f"Dimension mismatch: {(w1, h1)} vs {(w2, h2)}.")

    cw, ch = w1 / grid_x, h1 / grid_y
    mask = [[False] * grid_x for _ in range(grid_y)]
    for gy in range(grid_y):
        for gx in range(grid_x):
            total = 0
            for sy in range(3):
                for sx in range(3):
                    px = int((gx + 0.25 + sx * 0.25) * cw)
                    py = int((gy + 0.25 + sy * 0.25) * ch)
                    i1 = (py * w1 + px) * bpp1
                    i2 = (py * w2 + px) * bpp2
                    total += (
                        abs(a[i1] - b[i2]) + abs(a[i1 + 1] - b[i2 + 1]) + abs(a[i1 + 2] - b[i2 + 2])
                    )
            if total / (9 * 3 * 255) > threshold:
                mask[gy][gx] = True

    def classify(px: float, py: float) -> str:
        i1 = (int(py) * w1 + int(px)) * bpp1
        r, g, bl = a[i1], a[i1 + 1], a[i1 + 2]
        return "tree" if g > r and g > bl else "stone"

    seen = [[False] * grid_x for _ in range(grid_y)]
    out: list[dict] = []
    for gy in range(grid_y):
        for gx in range(grid_x):
            if not mask[gy][gx] or seen[gy][gx]:
                continue
            stack = [(gx, gy)]
            seen[gy][gx] = True
            cells: list[tuple[int, int]] = []
            while stack:
                x, y = stack.pop()
                cells.append((x, y))
                for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
                    if 0 <= nx < grid_x and 0 <= ny < grid_y and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(cells) < min_cells:
                continue
            xs = [c[0] for c in cells]
            ys = [c[1] for c in cells]
            bw, bh = max(xs) - min(xs) + 1, max(ys) - min(ys) + 1
            size_px = round(max(bw, bh) * cw)
            # Split merged treelines: 1 prop per ~120 cells, up to 3, spread
            # along the blob's longer axis.
            n_props = min(3, max(1, len(cells) // 120))
            for k in range(n_props):
                frac = (k + 1) / (n_props + 1)
                if bw >= bh:
                    tx = min(xs) + bw * frac
                    band = [c[1] for c in cells if abs(c[0] - tx) <= max(1, bw / (2 * n_props))]
                    ty = sum(band) / len(band) if band else sum(ys) / len(ys)
                else:
                    ty = min(ys) + bh * frac
                    band = [c[0] for c in cells if abs(c[1] - ty) <= max(1, bh / (2 * n_props))]
                    tx = sum(band) / len(band) if band else sum(xs) / len(xs)
                px, py = (tx + 0.5) * cw, (ty + 0.5) * ch
                out.append(
                    {
                        "x": round(px),
                        "y": round(py),
                        "kind": classify(px, py),
                        "size_px": round(size_px / n_props) if n_props > 1 else size_px,
                        "cells": len(cells) // n_props,
                    }
                )
    out.sort(key=lambda z: -int(z["cells"]))
    return out
