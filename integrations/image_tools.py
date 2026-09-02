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


def encode_rgba_png(w: int, h: int, rgba: bytes) -> bytes:
    """Encode raw RGBA bytes as a filter-0 PNG.

    Args:
        w: Image width.
        h: Image height.
        rgba: Row-major RGBA bytes (4 per pixel).

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

    stride = w * 4
    raw = b"".join(b"\x00" + bytes(rgba[r * stride : (r + 1) * stride]) for r in range(h))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(raw, 6))
        + chunk(b"IEND", b"")
    )


def key_chroma(png: bytes, tolerance: int = 110) -> bytes:
    """Chroma-key a flat magenta backdrop to transparency (Plan 62).

    The cutout pipeline asks the model for a solid #FF00FF background —
    a colour no painted character contains — then removes it here,
    border-connected so magenta accents inside the subject survive.

    Args:
        png: PNG bytes (8-bit RGB or RGBA).
        tolerance: Max per-channel distance from pure magenta.

    Returns:
        RGBA PNG bytes with the backdrop keyed out, or the original bytes
        if no meaningful magenta region touches the border (or the input
        cannot be decoded — cleanup must never destroy a paid render).
    """
    try:
        w, h, bpp, px = decode_png(png)
    except Exception:
        return png

    # Adaptive reference: models render "#FF00FF" as anything from hot pink
    # to raspberry. Sample the corner patches; if their average sits in the
    # magenta/pink family, key against THAT colour (the backdrop is near-
    # uniform), not against the literal request.
    rs = gs = bs = n = 0
    for cx, cy in ((0, 0), (w - 9, 0), (0, h - 9), (w - 9, h - 9)):
        for dy in range(8):
            for dx in range(8):
                o = ((cy + dy) * w + (cx + dx)) * bpp
                rs += px[o]
                gs += px[o + 1]
                bs += px[o + 2]
                n += 1
    ref_r, ref_g, ref_b = rs // n, gs // n, bs // n
    pinkish = (ref_r - ref_g) >= 70 and (ref_b - ref_g) >= 25 and ref_r >= 140
    if not pinkish:
        return png  # backdrop isn't the requested chroma — don't guess
    tol = 48

    def is_mag(i: int) -> bool:
        o = i * bpp
        return (
            abs(px[o] - ref_r) <= tol
            and abs(px[o + 1] - ref_g) <= tol
            and abs(px[o + 2] - ref_b) <= tol
        )

    # Global match, not border-connected: the reference is corner-verified
    # pink that no painted subject contains, and border-only filling left
    # enclosed pockets (between legs, under cape gaps) un-keyed.
    seen = bytearray(w * h)
    filled = 0
    for i in range(w * h):
        if is_mag(i):
            seen[i] = 1
            filled += 1

    if filled < (w * h) * 0.05:
        return png  # no magenta backdrop found — leave untouched

    out = bytearray(w * h * 4)
    for i in range(w * h):
        o = i * bpp
        d = i * 4
        out[d] = px[o]
        out[d + 1] = px[o + 1]
        out[d + 2] = px[o + 2]
        out[d + 3] = 0 if seen[i] else (px[o + 3] if bpp == 4 else 255)
    # Despill + feather the one-pixel boundary: kill magenta fringe.
    for y in range(1, h - 1):
        base = y * w
        for x in range(1, w - 1):
            i = base + x
            if not seen[i] and (seen[i - 1] or seen[i + 1] or seen[i - w] or seen[i + w]):
                d = i * 4
                r, g, b = out[d], out[d + 1], out[d + 2]
                if r > g + 40 and b > g + 40:  # magenta spill
                    avg = (r + g + b) // 3
                    out[d] = out[d + 1] = out[d + 2] = avg
                out[d + 3] = min(out[d + 3], 150)
    # Shadow despill v2: painted drop-shadow pools keep a pink cast that
    # sits outside the key tolerance, and big pools have interiors far from
    # any keyed pixel — so flood from the keyed region across CONNECTED
    # pink-family pixels (whatever the pool size) and neutralize them to
    # gray. Pink accents deeper in the subject stay: they aren't connected
    # to the backdrop through pink. Valve: a flood covering >15% of the
    # image means the "pool" was the subject — abort the pass.
    from collections import deque

    def pinkish(i: int) -> bool:
        d = i * 4
        r, g, b = out[d], out[d + 1], out[d + 2]
        return r > g + 25 and b > g + 10

    spill = bytearray(w * h)
    queue: deque[int] = deque()
    for y in range(1, h - 1):
        base = y * w
        for x in range(1, w - 1):
            i = base + x
            if (
                not seen[i]
                and pinkish(i)
                and (seen[i - 1] or seen[i + 1] or seen[i - w] or seen[i + w])
            ):
                spill[i] = 1
                queue.append(i)
    count = 0
    while queue:
        i = queue.popleft()
        count += 1
        x, y = i % w, i // w
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 < nx < w - 1 and 0 < ny < h - 1:
                j = ny * w + nx
                if not spill[j] and not seen[j] and pinkish(j):
                    spill[j] = 1
                    queue.append(j)
    if count <= (w * h) * 0.15:
        for i in range(w * h):
            if spill[i]:
                d = i * 4
                avg = (out[d] + out[d + 1] + out[d + 2]) // 3
                out[d] = out[d + 1] = out[d + 2] = avg
    return encode_rgba_png(w, h, bytes(out))


def key_background(png: bytes, tolerance: int = 52) -> bytes:
    """Force a transparent background on a cutout image (Plan 62).

    The image models honour "transparent background" unreliably — edits in
    particular love to paint a warm haze behind the subject. This keys it
    out deterministically: flood-fill from every border pixel across
    near-uniform background colour (seeded from the corner patches) and
    zero the alpha of the filled region.

    Safety valves: an image that is already mostly transparent is returned
    untouched, and if the fill would eat more than 92% of the pixels (the
    "background" was the subject) the original is returned.

    Args:
        png: PNG bytes (8-bit RGB or RGBA).
        tolerance: Max per-channel colour distance treated as background.

    Returns:
        RGBA PNG bytes with the background keyed to transparent.
    """
    try:
        w, h, bpp, px = decode_png(png)
    except Exception:
        return png

    def rgb_at(x: int, y: int) -> tuple[int, int, int]:
        o = (y * w + x) * bpp
        return px[o], px[o + 1], px[o + 2]

    # Reference background colours: average of an 8x8 patch in each corner.
    refs: list[tuple[int, int, int]] = []
    for cx, cy in ((0, 0), (w - 8, 0), (0, h - 8), (w - 8, h - 8)):
        rs = gs = bs = 0
        for dy in range(8):
            for dx in range(8):
                r, g, b = rgb_at(min(w - 1, cx + dx), min(h - 1, cy + dy))
                rs += r
                gs += g
                bs += b
        refs.append((rs // 64, gs // 64, bs // 64))

    def near_ref(x: int, y: int) -> bool:
        r, g, b = rgb_at(x, y)
        for rr, rg, rb in refs:
            if abs(r - rr) <= tolerance and abs(g - rg) <= tolerance and abs(b - rb) <= tolerance:
                return True
        return False

    # Gradient-tracking fill: a pixel joins the background if it is close in
    # colour to the BACKGROUND NEIGHBOUR it was reached from (small step),
    # letting the fill ride smooth halo gradients while stopping at the
    # subject's painted edge. Seeds are border pixels near a corner colour.
    step = 16
    from collections import deque

    seen = bytearray(w * h)
    queue: deque[int] = deque()
    # Mode split: an image with real transparency gets ALPHA-ONLY halo
    # removal (colour rules leak on subjects that share the halo's palette —
    # a gold knight in an amber glow). Fully opaque images get the
    # colour-gradient fill instead.
    transparent_ct = sum(1 for i in range(3, len(px), 4) if px[i] == 0) if bpp == 4 else 0
    alpha_mode = bpp == 4 and transparent_ct > (w * h) * 0.05
    if alpha_mode:
        for i in range(w * h):
            if px[i * 4 + 3] == 0:
                seen[i] = 1
                queue.append(i)
    else:
        # Border pixels near a corner colour seed the opaque-background fill.
        for x in range(w):
            for y in (0, h - 1):
                i = y * w + x
                if near_ref(x, y) and not seen[i]:
                    seen[i] = 1
                    queue.append(i)
        for y in range(h):
            for x in (0, w - 1):
                i = y * w + x
                if near_ref(x, y) and not seen[i]:
                    seen[i] = 1
                    queue.append(i)

    filled = 0
    while queue:
        i = queue.popleft()
        filled += 1
        x, y = i % w, i // w
        o = i * bpp
        cr, cg, cb = px[o], px[o + 1], px[o + 2]
        for nx, ny in ((x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)):
            if 0 <= nx < w and 0 <= ny < h:
                j = ny * w + nx
                if not seen[j]:
                    no = j * bpp
                    if alpha_mode:
                        # Halo pixels betray themselves through partial alpha.
                        join = px[no + 3] < 252
                    else:
                        join = (
                            abs(px[no] - cr) <= step
                            and abs(px[no + 1] - cg) <= step
                            and abs(px[no + 2] - cb) <= step
                        )
                    if join:
                        seen[j] = 1
                        queue.append(j)

    if filled > (w * h) * 0.92 or filled < (w * h) * 0.02:
        return png  # keyed everything or nothing — don't trust it

    out = bytearray(w * h * 4)
    for i in range(w * h):
        o = i * bpp
        d = i * 4
        out[d] = px[o]
        out[d + 1] = px[o + 1]
        out[d + 2] = px[o + 2]
        out[d + 3] = 0 if seen[i] else (px[o + 3] if bpp == 4 else 255)
    # One-pixel feather: soften subject pixels that touch the keyed region.
    for y in range(1, h - 1):
        base = y * w
        for x in range(1, w - 1):
            i = base + x
            if not seen[i] and (seen[i - 1] or seen[i + 1] or seen[i - w] or seen[i + w]):
                out[i * 4 + 3] = min(out[i * 4 + 3], 140)
    return encode_rgba_png(w, h, bytes(out))


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
