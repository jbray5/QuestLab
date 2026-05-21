"""Generate the Session 1 battle-map reference SVG (hex grid).

One-shot helper. Produces campaigns/session-01-battlemap.svg — a
hex-grid schematic of the Market Green outside The Hearth, the Act 3
combat arena for Lantern-Eve. Meant as a DM reference while drawing
the real map on a physical hex sheet.

Hex layout: pointy-top, offset rows. 1 hex = 5 ft (same as a 1-inch
square in standard 5e). Map is ~15 hexes wide x 13 tall (~75 x 65 ft).

Run:
    python scripts/gen_session1_battlemap.py
"""

from __future__ import annotations

import math
from pathlib import Path

SIZE = 34  # hex circumradius in px
COLS = 15
ROWS = 13
MARGIN = 28
LEGEND_W = 300

HEX_W = math.sqrt(3) * SIZE
HEX_H = 2 * SIZE
ROW_STEP = HEX_H * 0.75

GRID_W = HEX_W * COLS + HEX_W / 2
GRID_H = ROW_STEP * (ROWS - 1) + HEX_H
SVG_W = int(GRID_W + MARGIN * 2 + LEGEND_W)
SVG_H = int(GRID_H + MARGIN * 2)


def hex_center(col: int, row: int) -> tuple[float, float]:
    """Pixel centre of the hex at (col, row), pointy-top offset rows."""
    x = MARGIN + HEX_W * (col + 0.5 * (row & 1)) + HEX_W / 2
    y = MARGIN + SIZE + row * ROW_STEP
    return x, y


def hex_points(cx: float, cy: float) -> str:
    """SVG points string for a pointy-top hexagon centred at (cx, cy)."""
    pts = []
    for i in range(6):
        ang = math.radians(60 * i - 90)
        pts.append(f"{cx + SIZE * math.cos(ang):.1f},{cy + SIZE * math.sin(ang):.1f}")
    return " ".join(pts)


def main() -> None:
    """Build the SVG and write it to campaigns/session-01-battlemap.svg."""
    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SVG_W}" height="{SVG_H}" '
        f'viewBox="0 0 {SVG_W} {SVG_H}" font-family="Georgia, serif">'
    )
    # Background
    parts.append(f'<rect width="{SVG_W}" height="{SVG_H}" fill="#1a1712"/>')
    parts.append(
        f'<rect x="{MARGIN-6}" y="{MARGIN-6}" width="{GRID_W+12:.0f}" '
        f'height="{GRID_H+12:.0f}" fill="#241f17" stroke="#5a4a2a" stroke-width="2"/>'
    )

    # ── Hex grid ────────────────────────────────────────────────────────
    parts.append('<g stroke="#3a3326" stroke-width="1" fill="none">')
    for row in range(ROWS):
        for col in range(COLS):
            cx, cy = hex_center(col, row)
            if cx + SIZE > MARGIN + GRID_W + 4:
                continue
            parts.append(f'<polygon points="{hex_points(cx, cy)}"/>')
    parts.append("</g>")

    # ── Zone tints ──────────────────────────────────────────────────────
    # Mistwood band (top 2 rows) — corrupted fey emerge here
    parts.append(
        f'<rect x="{MARGIN}" y="{MARGIN}" width="{GRID_W:.0f}" '
        f'height="{ROW_STEP*2:.0f}" fill="#16240f" opacity="0.55"/>'
    )
    # The Hearth interior (bottom 3 rows)
    hearth_y = MARGIN + ROW_STEP * (ROWS - 3)
    parts.append(
        f'<rect x="{MARGIN}" y="{hearth_y:.0f}" width="{GRID_W:.0f}" '
        f'height="{ROW_STEP*3+SIZE*0.5:.0f}" fill="#3a1e0c" opacity="0.6"/>'
    )

    def label(
        x: float,
        y: float,
        text: str,
        size: int = 13,
        color: str = "#e8dcc0",
        weight: str = "normal",
        anchor: str = "middle",
    ) -> None:
        parts.append(
            f'<text x="{x:.0f}" y="{y:.0f}" font-size="{size}" fill="{color}" '
            f'font-weight="{weight}" text-anchor="{anchor}">{text}</text>'
        )

    def marker(col: int, row: int, glyph: str, color: str, r: int = 16) -> tuple[float, float]:
        cx, cy = hex_center(col, row)
        parts.append(
            f'<circle cx="{cx:.0f}" cy="{cy:.0f}" r="{r}" fill="{color}" '
            f'stroke="#1a1712" stroke-width="2"/>'
        )
        parts.append(
            f'<text x="{cx:.0f}" y="{cy+5:.0f}" font-size="16" fill="#1a1712" '
            f'text-anchor="middle" font-weight="bold">{glyph}</text>'
        )
        return cx, cy

    # ── Mistwood label + trees ──────────────────────────────────────────
    for col in range(0, COLS, 2):
        cx, cy = hex_center(col, 0)
        parts.append(
            f'<text x="{cx:.0f}" y="{cy+6:.0f}" font-size="22" ' f'text-anchor="middle">🌲</text>'
        )
    label(
        MARGIN + GRID_W / 2,
        MARGIN + ROW_STEP * 2 - 6,
        "M I S T W O O D  —  corrupted fey emerge from this tree-line",
        13,
        "#7da55f",
        "bold",
    )

    # ── Standing stones (Wenneth Tree-Strides out of one, Round 2) ──────
    for col, row in [(3, 3), (11, 3)]:
        cx, cy = hex_center(col, row)
        parts.append(
            f'<rect x="{cx-15:.0f}" y="{cy-22:.0f}" width="30" height="44" rx="6" '
            f'fill="#4b4640" stroke="#6f6a60" stroke-width="2"/>'
        )
        label(cx, cy + 38, "standing stone", 11, "#9a9488")
    label(
        MARGIN + GRID_W / 2,
        MARGIN + ROW_STEP * 3 + 4,
        "Round 2: Wenneth Tree-Strides out of a standing stone",
        12,
        "#c98fd0",
    )

    # ── Overturned festival dais (3/4 cover) ────────────────────────────
    dx, dy = hex_center(7, 5)
    parts.append(
        f'<rect x="{dx-58:.0f}" y="{dy-26:.0f}" width="116" height="52" rx="5" '
        f'fill="#5a3c1c" stroke="#8a5e2c" stroke-width="3" '
        f'transform="rotate(-8 {dx:.0f} {dy:.0f})"/>'
    )
    label(dx, dy + 2, "OVERTURNED DAIS", 11, "#e8dcc0", "bold")
    label(dx, dy + 16, "3/4 cover (+5 AC)", 10, "#c9a84c")

    # ── Low stone wall (half cover, vault DC 10 Athletics / 5ft) ────────
    wall_row = 8
    wy = MARGIN + SIZE + wall_row * ROW_STEP
    gap_start = MARGIN + GRID_W * 0.42
    gap_end = MARGIN + GRID_W * 0.58
    parts.append(
        f'<line x1="{MARGIN+10}" y1="{wy:.0f}" x2="{gap_start:.0f}" y2="{wy:.0f}" '
        f'stroke="#7a7068" stroke-width="9" stroke-linecap="round"/>'
    )
    parts.append(
        f'<line x1="{gap_end:.0f}" y1="{wy:.0f}" x2="{MARGIN+GRID_W-10:.0f}" y2="{wy:.0f}" '
        f'stroke="#7a7068" stroke-width="9" stroke-linecap="round"/>'
    )
    label(
        MARGIN + GRID_W * 0.22,
        wy - 12,
        "LOW STONE WALL — half cover (+2 AC)",
        11,
        "#cfc6b4",
        "bold",
    )
    label((gap_start + gap_end) / 2, wy + 4, "gap", 10, "#9a9488")
    label(MARGIN + GRID_W * 0.78, wy + 18, "vault: 5 ft move or DC 10 Athletics", 10, "#c9a84c")

    # ── Lantern poles (topple DC 12 STR) ────────────────────────────────
    for col, row in [(2, 6), (8, 7), (12, 6)]:
        cx, cy = hex_center(col, row)
        parts.append(
            f'<line x1="{cx:.0f}" y1="{cy-20:.0f}" x2="{cx:.0f}" y2="{cy+18:.0f}" '
            f'stroke="#6f5a36" stroke-width="5"/>'
        )
        parts.append(
            f'<circle cx="{cx:.0f}" cy="{cy-24:.0f}" r="8" fill="#3a3326" '
            f'stroke="#6f5a36" stroke-width="2"/>'
        )
        label(cx, cy + 32, "lantern pole", 10, "#9a9488")
    label(
        MARGIN + GRID_W / 2,
        MARGIN + SIZE + 7 * ROW_STEP + 30,
        "lantern poles: topple DC 12 STR -> 10ft difficult terrain, or improvised weapon 1d8",
        10,
        "#c9a84c",
    )

    # ── The Hearth tavern ───────────────────────────────────────────────
    htop = hearth_y
    parts.append(
        f'<rect x="{MARGIN+8}" y="{htop+8:.0f}" width="{GRID_W-16:.0f}" '
        f'height="{ROW_STEP*3-4:.0f}" rx="6" fill="#3a1e0c" '
        f'stroke="#8a5e2c" stroke-width="3"/>'
    )
    # door + windows on the top wall (the fey entry points)
    door_x = MARGIN + GRID_W * 0.5
    parts.append(
        f'<rect x="{door_x-22:.0f}" y="{htop+2:.0f}" width="44" height="12" ' f'fill="#c9a84c"/>'
    )
    label(door_x, htop - 4, "DOOR", 10, "#c9a84c", "bold")
    for wx_frac in (0.22, 0.78):
        wx = MARGIN + GRID_W * wx_frac
        parts.append(
            f'<rect x="{wx-18:.0f}" y="{htop+3:.0f}" width="36" height="9" ' f'fill="#7da3c9"/>'
        )
        label(wx, htop - 4, "window", 9, "#7da3c9")
    label(MARGIN + GRID_W / 2, htop + ROW_STEP * 1.5, "T H E   H E A R T H", 20, "#e8dcc0", "bold")
    label(
        MARGIN + GRID_W / 2,
        htop + ROW_STEP * 1.5 + 22,
        "15 villagers + Belva inside — the door & windows are the fey",
        11,
        "#d9b98a",
    )
    label(
        MARGIN + GRID_W / 2,
        htop + ROW_STEP * 1.5 + 38,
        "entry points AND what the party is protecting",
        11,
        "#d9b98a",
    )

    # ── Shrine off-map indicator ────────────────────────────────────────
    sx = MARGIN + GRID_W - 70
    sy = MARGIN + 30
    parts.append(
        f'<text x="{sx:.0f}" y="{sy:.0f}" font-size="13" fill="#6a6a78" '
        f'text-anchor="end">the dark Lantern Shrine is on the hill,</text>'
    )
    parts.append(
        f'<text x="{sx:.0f}" y="{sy+16:.0f}" font-size="13" fill="#6a6a78" '
        f'text-anchor="end">far off — not reachable this fight ↗</text>'
    )

    # ── Legend panel ────────────────────────────────────────────────────
    lx = MARGIN + GRID_W + 24
    ly = MARGIN
    parts.append(
        f'<rect x="{lx:.0f}" y="{ly:.0f}" width="{LEGEND_W-48}" '
        f'height="{GRID_H:.0f}" rx="8" fill="#241f17" stroke="#5a4a2a" stroke-width="2"/>'
    )
    legend_lines = [
        ("SESSION 1 — HOLD THE HEARTH", 15, "#c9a84c", "bold"),
        ("Market Green, outside The Hearth", 11, "#9a9488", "italic"),
        ("1 hex = 5 ft   ·   ~75 x 65 ft arena", 11, "#9a9488", "normal"),
        ("", 8, "#fff", "normal"),
        ("ROSTER (375 XP, Moderate)", 12, "#e8dcc0", "bold"),
        ("· Wenneth — Dryad statblock, corrupted", 11, "#d9c9a8", "normal"),
        ("· Blossom-Seller — Bandit statblock", 11, "#d9c9a8", "normal"),
        ("· 3x Corrupted Pixie — Sprite statblock", 11, "#d9c9a8", "normal"),
        ("", 8, "#fff", "normal"),
        ("TERRAIN", 12, "#e8dcc0", "bold"),
        ("Low stone wall — half cover, +2 AC.", 11, "#d9c9a8", "normal"),
        ("  Vault it: 5 ft move or DC 10 Athletics.", 10, "#9a9488", "normal"),
        ("Overturned dais — 3/4 cover, +5 AC,", 11, "#d9c9a8", "normal"),
        ("  fits 2 Medium crouched.", 10, "#9a9488", "normal"),
        ("Lantern poles (x3) — topple DC 12 STR", 11, "#d9c9a8", "normal"),
        ("  -> 10 ft difficult terrain, or grab as", 10, "#9a9488", "normal"),
        ("  an improvised weapon (1d8 bludgeon).", 10, "#9a9488", "normal"),
        ("Standing stones — cover; Wenneth", 11, "#d9c9a8", "normal"),
        ("  Tree-Strides out of one in Round 2.", 10, "#9a9488", "normal"),
        ("", 8, "#fff", "normal"),
        ("LIGHT", 12, "#e8dcc0", "bold"),
        ("Dim across the green (firelight bleed).", 11, "#d9c9a8", "normal"),
        ("Bright within 10 ft of the door.", 11, "#d9c9a8", "normal"),
        ("Past the lantern-pole ring = darkness;", 11, "#d9c9a8", "normal"),
        ("  no-darkvision PCs: disadvantage.", 10, "#9a9488", "normal"),
        ("", 8, "#fff", "normal"),
        ("FLOW", 12, "#e8dcc0", "bold"),
        ("R1: 2 pixies thru door, 1 thru window.", 11, "#d9c9a8", "normal"),
        ("R2: Wenneth from a standing stone;", 11, "#d9c9a8", "normal"),
        ("  Blossom-Seller thru the door.", 10, "#9a9488", "normal"),
        ("R3: Yelvyne arrives wounded.", 11, "#d9c9a8", "normal"),
    ]
    cur = ly + 26
    for text, size, color, weight in legend_lines:
        style = "italic" if weight == "italic" else "normal"
        fw = "bold" if weight == "bold" else "normal"
        if text:
            parts.append(
                f'<text x="{lx+16:.0f}" y="{cur:.0f}" font-size="{size}" '
                f'fill="{color}" font-weight="{fw}" font-style="{style}">{text}</text>'
            )
        cur += size + 7

    parts.append("</svg>")

    out = Path("campaigns/session-01-battlemap.svg")
    out.write_text("\n".join(parts), encoding="utf-8")
    print(f"OK -> {out}  ({SVG_W}x{SVG_H})")


if __name__ == "__main__":
    main()
