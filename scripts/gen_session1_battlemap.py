"""Generate the Session 1 battle-map reference SVG (flat-top hex grid).

One-shot helper. Produces campaigns/session-01-battlemap.svg — a
hex-grid schematic of the Market Green outside The Hearth, the Act 3
combat arena for Lantern-Eve. A DM reference while drawing the real
map on a physical hex mat.

Sized to the DM's actual mat — a Chessex 96246 reversible battlemat:
flat-top 1-inch hexes, near-square (~23.5 x 26 in). The hex grid here
is 21 columns x 20 rows so the drawn portion mirrors the mat's
proportions. The legend sits BELOW the grid so the map area itself
matches the mat 1:1 for reference. 1 hex = 5 ft.

Run:
    python scripts/gen_session1_battlemap.py
"""

from __future__ import annotations

import math
from pathlib import Path

SIZE = 26  # hex circumradius (centre to point) in px
COLS = 21
ROWS = 20
MARGIN = 30

SQRT3 = math.sqrt(3)
COL_STEP = 1.5 * SIZE  # horizontal distance between flat-top columns
HEX_V = SQRT3 * SIZE  # flat-to-flat height of a flat-top hex

GRID_W = SIZE * (2 + 1.5 * (COLS - 1))
GRID_H = HEX_V * ROWS + HEX_V / 2  # + odd-column offset slack
LEGEND_H = 248
SVG_W = int(GRID_W + MARGIN * 2)
SVG_H = int(GRID_H + MARGIN * 2 + LEGEND_H)


def hex_center(col: int, row: int) -> tuple[float, float]:
    """Pixel centre of the flat-top hex at (col, row); odd columns drop half a hex."""
    cx = MARGIN + SIZE + col * COL_STEP
    cy = MARGIN + HEX_V / 2 + row * HEX_V + (HEX_V / 2 if col & 1 else 0)
    return cx, cy


def hex_points(cx: float, cy: float) -> str:
    """SVG points string for a flat-top hexagon centred at (cx, cy)."""
    pts = []
    for i in range(6):
        ang = math.radians(60 * i)
        pts.append(f"{cx + SIZE * math.cos(ang):.1f},{cy + SIZE * math.sin(ang):.1f}")
    return " ".join(pts)


def main() -> None:
    """Build the SVG and write it to campaigns/session-01-battlemap.svg."""
    parts: list[str] = []
    parts.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{SVG_W}" height="{SVG_H}" '
        f'viewBox="0 0 {SVG_W} {SVG_H}" font-family="Georgia, serif">'
    )
    parts.append(f'<rect width="{SVG_W}" height="{SVG_H}" fill="#1a1712"/>')
    parts.append(
        f'<rect x="{MARGIN-6}" y="{MARGIN-6}" width="{GRID_W+12:.0f}" '
        f'height="{GRID_H+12:.0f}" fill="#241f17" stroke="#5a4a2a" stroke-width="2"/>'
    )

    grid_left = MARGIN
    grid_right = MARGIN + GRID_W
    grid_cx = MARGIN + GRID_W / 2

    # ── Hex grid ────────────────────────────────────────────────────────
    parts.append('<g stroke="#3a3326" stroke-width="1" fill="none">')
    for row in range(ROWS):
        for col in range(COLS):
            cx, cy = hex_center(col, row)
            if cy + SIZE > MARGIN + GRID_H + 4:
                continue
            parts.append(f'<polygon points="{hex_points(cx, cy)}"/>')
    parts.append("</g>")

    # ── Zone tints ──────────────────────────────────────────────────────
    parts.append(  # Mistwood band — top
        f'<rect x="{grid_left}" y="{MARGIN}" width="{GRID_W:.0f}" '
        f'height="{HEX_V*3:.0f}" fill="#16240f" opacity="0.55"/>'
    )
    hearth_top = MARGIN + HEX_V * (ROWS - 5)
    parts.append(  # Hearth interior — bottom
        f'<rect x="{grid_left}" y="{hearth_top:.0f}" width="{GRID_W:.0f}" '
        f'height="{HEX_V*5+HEX_V/2:.0f}" fill="#3a1e0c" opacity="0.6"/>'
    )

    def label(
        x, y, text, size=13, color="#e8dcc0", weight="normal", anchor="middle", style="normal"
    ):
        parts.append(
            f'<text x="{x:.0f}" y="{y:.0f}" font-size="{size}" fill="{color}" '
            f'font-weight="{weight}" font-style="{style}" text-anchor="{anchor}">{text}</text>'
        )

    # ── Mistwood ────────────────────────────────────────────────────────
    for col in range(0, COLS, 3):
        cx, cy = hex_center(col, 1)
        parts.append(
            f'<text x="{cx:.0f}" y="{cy+8:.0f}" font-size="24" text-anchor="middle">🌲</text>'
        )
    label(
        grid_cx,
        MARGIN + HEX_V * 3 - 8,
        "M I S T W O O D  —  corrupted fey emerge from this tree-line",
        14,
        "#7da55f",
        "bold",
    )

    # ── Standing stones (Wenneth's Round-2 Tree-Stride) ─────────────────
    for col in (5, 15):
        cx, cy = hex_center(col, 4)
        parts.append(
            f'<rect x="{cx-16:.0f}" y="{cy-24:.0f}" width="32" height="48" rx="6" '
            f'fill="#4b4640" stroke="#6f6a60" stroke-width="2"/>'
        )
        label(cx, cy + 42, "standing stone", 11, "#9a9488")
    label(
        grid_cx,
        MARGIN + HEX_V * 4 + HEX_V / 2 + 4,
        "Round 2 — Wenneth Tree-Strides out of a standing stone",
        12,
        "#c98fd0",
    )

    # ── Overturned festival dais (3/4 cover) ────────────────────────────
    dx, dy = hex_center(10, 8)
    parts.append(
        f'<rect x="{dx-66:.0f}" y="{dy-30:.0f}" width="132" height="60" rx="6" '
        f'fill="#5a3c1c" stroke="#8a5e2c" stroke-width="3" '
        f'transform="rotate(-8 {dx:.0f} {dy:.0f})"/>'
    )
    label(dx, dy - 2, "OVERTURNED DAIS", 12, "#e8dcc0", "bold")
    label(dx, dy + 14, "3/4 cover (+5 AC)", 11, "#c9a84c")

    # ── Lantern poles ───────────────────────────────────────────────────
    for col, row in [(3, 10), (10, 12), (17, 10)]:
        cx, cy = hex_center(col, row)
        parts.append(
            f'<line x1="{cx:.0f}" y1="{cy-22:.0f}" x2="{cx:.0f}" y2="{cy+20:.0f}" '
            f'stroke="#6f5a36" stroke-width="5"/>'
        )
        parts.append(
            f'<circle cx="{cx:.0f}" cy="{cy-26:.0f}" r="9" fill="#3a3326" '
            f'stroke="#6f5a36" stroke-width="2"/>'
        )
        label(cx, cy + 36, "lantern pole", 10, "#9a9488")

    # ── Low stone wall (half cover, gap, vault) ─────────────────────────
    _, wy = hex_center(0, 13)
    gap_a = grid_left + GRID_W * 0.42
    gap_b = grid_left + GRID_W * 0.58
    parts.append(
        f'<line x1="{grid_left+14}" y1="{wy:.0f}" x2="{gap_a:.0f}" y2="{wy:.0f}" '
        f'stroke="#7a7068" stroke-width="10" stroke-linecap="round"/>'
    )
    parts.append(
        f'<line x1="{gap_b:.0f}" y1="{wy:.0f}" x2="{grid_right-14:.0f}" y2="{wy:.0f}" '
        f'stroke="#7a7068" stroke-width="10" stroke-linecap="round"/>'
    )
    label(
        grid_left + GRID_W * 0.21,
        wy - 14,
        "LOW STONE WALL — half cover (+2 AC)",
        12,
        "#cfc6b4",
        "bold",
    )
    label((gap_a + gap_b) / 2, wy + 5, "gap", 10, "#9a9488")
    label(grid_left + GRID_W * 0.79, wy + 20, "vault: 5 ft move or DC 10 Athletics", 10, "#c9a84c")

    # ── The Hearth — interior (combat can move inside) ──────────────────
    # Semi-transparent fill so the hex grid shows through the room — a
    # fight that spills indoors still has hexes to move on.
    parts.append(
        f'<rect x="{grid_left+10}" y="{hearth_top+10:.0f}" width="{GRID_W-20:.0f}" '
        f'height="{HEX_V*5-8:.0f}" rx="7" fill="#3a1e0c" fill-opacity="0.42" '
        f'stroke="#8a5e2c" stroke-width="3"/>'
    )
    int_left = grid_left + 10
    int_right = grid_right - 10
    int_top = hearth_top + 10
    int_bot = hearth_top + HEX_V * 5 + 2

    # Door (in the top wall — opens onto the green)
    door_x = grid_cx
    parts.append(
        f'<rect x="{door_x-26:.0f}" y="{hearth_top+3:.0f}" width="52" height="14" fill="#c9a84c"/>'
    )
    label(door_x, hearth_top - 5, "DOOR", 11, "#c9a84c", "bold")
    for frac in (0.2, 0.8):
        wx = grid_left + GRID_W * frac
        parts.append(
            f'<rect x="{wx-22:.0f}" y="{hearth_top+4:.0f}" width="44" height="10" fill="#7da3c9"/>'
        )
        label(wx, hearth_top - 5, "window", 10, "#7da3c9")

    # Room title — small, tucked top-left so it doesn't fight the furniture
    label(int_left + 12, int_top + 22, "THE HEARTH — interior", 14, "#e8dcc0", "bold", "start")

    # Great hearth / fireplace — bottom-centre wall. The only fire left in
    # Hollowmere; bright light; shove a creature in for fire damage.
    fh_w = 168
    fx = grid_cx - fh_w / 2
    fy = int_bot - 30
    parts.append(
        f'<rect x="{fx:.0f}" y="{fy:.0f}" width="{fh_w}" height="30" rx="4" '
        f'fill="#7a3310" stroke="#b5601e" stroke-width="3"/>'
    )
    # flame glow
    parts.append(
        f'<ellipse cx="{grid_cx:.0f}" cy="{fy+8:.0f}" rx="{fh_w/2-12:.0f}" ry="22" '
        f'fill="#e8862e" opacity="0.5"/>'
    )
    for off in (-44, 0, 44):
        parts.append(
            f'<path d="M{grid_cx+off:.0f},{fy+22:.0f} q-7,-18 0,-30 q7,12 0,30 Z" '
            f'fill="#f0a838"/>'
        )
    label(grid_cx, fy - 8, "GREAT HEARTH — bright light; shove-in 1d10 fire", 11, "#f0a838", "bold")

    # The bar — Belva's counter, left side, an L of solid cover
    bar_x, bar_y = int_left + 26, int_top + 52
    parts.append(
        f'<rect x="{bar_x:.0f}" y="{bar_y:.0f}" width="190" height="26" rx="5" '
        f'fill="#5a3c1c" stroke="#8a5e2c" stroke-width="2"/>'
    )
    parts.append(
        f'<rect x="{bar_x:.0f}" y="{bar_y:.0f}" width="26" height="92" rx="5" '
        f'fill="#5a3c1c" stroke="#8a5e2c" stroke-width="2"/>'
    )
    label(bar_x + 105, bar_y + 17, "THE BAR", 11, "#e8dcc0", "bold")
    label(
        bar_x + 100,
        bar_y + 116,
        "Belva fights from here (poker) · 3/4 cover behind it",
        10,
        "#c9a84c",
        "start",
    )

    # Stairs up to the loft — top-right corner; where Master Halve was
    st_x, st_y = int_right - 92, int_top + 8
    for i in range(5):
        parts.append(
            f'<rect x="{st_x:.0f}" y="{st_y+i*11:.0f}" width="{80-i*12}" height="9" '
            f'fill="#6f5a36" stroke="#8a6f44" stroke-width="1"/>'
        )
    label(st_x + 40, st_y + 74, "stairs ↑ loft", 10, "#d9c9a8")
    label(st_x + 40, st_y + 88, "(Halve was up here)", 9, "#9a9488")

    # Villager huddle — back corner, far from the door
    vh_cx, vh_cy = int_left + 70, int_bot - 66
    parts.append(
        f'<ellipse cx="{vh_cx:.0f}" cy="{vh_cy:.0f}" rx="62" ry="40" '
        f'fill="#7da3c9" opacity="0.18" stroke="#7da3c9" stroke-width="1.5" '
        f'stroke-dasharray="4 3"/>'
    )
    parts.append(
        f'<text x="{vh_cx:.0f}" y="{vh_cy-2:.0f}" font-size="20" ' f'text-anchor="middle">👥</text>'
    )
    label(vh_cx, vh_cy + 22, "15 villagers — PROTECT", 10, "#7da3c9", "bold")
    label(vh_cx, vh_cy + 35, "Blossom-Seller threatens", 9, "#9a9488")
    label(vh_cx, vh_cy + 46, "them to force a disengage", 9, "#9a9488")

    # Tables + benches — scatter; overturn for half cover, difficult terrain
    for tx_frac, ty_off in [(0.56, 60), (0.74, 96), (0.62, 138), (0.86, 70)]:
        tcx = int_left + (int_right - int_left) * tx_frac
        tcy = int_top + ty_off
        parts.append(
            f'<circle cx="{tcx:.0f}" cy="{tcy:.0f}" r="17" fill="#4a3115" '
            f'stroke="#7a5226" stroke-width="2"/>'
        )
    label(
        int_left + (int_right - int_left) * 0.71,
        int_top + 162,
        "tables — overturn for 1/2 cover (+2 AC) & difficult terrain",
        10,
        "#c9a84c",
    )

    # ── Shrine off-map indicator ────────────────────────────────────────
    label(
        grid_right - 14,
        MARGIN + 22,
        "the dark Lantern Shrine is on the hill, far off —",
        12,
        "#6a6a78",
        anchor="end",
    )
    label(
        grid_right - 14,
        MARGIN + 38,
        "not reached this fight (it's the aftermath map) ↗",
        12,
        "#6a6a78",
        anchor="end",
    )

    # ── Legend strip (below the grid) ───────────────────────────────────
    ly = MARGIN + GRID_H + 18
    parts.append(
        f'<rect x="{MARGIN-6}" y="{ly-6:.0f}" width="{GRID_W+12:.0f}" '
        f'height="{LEGEND_H-24}" rx="8" fill="#241f17" stroke="#5a4a2a" stroke-width="2"/>'
    )
    label(MARGIN + 14, ly + 18, "SESSION 1 — HOLD THE HEARTH", 15, "#c9a84c", "bold", "start")
    label(
        MARGIN + 14,
        ly + 37,
        "Market Green, outside The Hearth · flat-top hexes · 1 hex = 5 ft · ~21 x 20 hexes",
        11,
        "#9a9488",
        "normal",
        "start",
        "italic",
    )

    col_w = GRID_W / 3
    col1 = MARGIN + 14
    col2 = MARGIN + 14 + col_w
    col3 = MARGIN + 14 + col_w * 2
    top = ly + 62

    def block(x, lines):
        cur = top
        for text, size, color, weight in lines:
            label(x, cur, text, size, color, weight, "start")
            cur += size + 6

    block(
        col1,
        [
            ("ROSTER  (375 XP · Moderate)", 12, "#e8dcc0", "bold"),
            ("Wenneth — Dryad statblock, corrupted", 11, "#d9c9a8", "normal"),
            ("Blossom-Seller — Bandit statblock", 11, "#d9c9a8", "normal"),
            ("3x Corrupted Pixie — Sprite statblock", 11, "#d9c9a8", "normal"),
            ("", 6, "#000", "normal"),
            ("FLOW", 12, "#e8dcc0", "bold"),
            ("R1: 2 pixies thru door, 1 thru window", 11, "#d9c9a8", "normal"),
            ("R2: Wenneth from a stone; Blossom-", 11, "#d9c9a8", "normal"),
            ("    Seller thru the door", 11, "#d9c9a8", "normal"),
            ("R3: Yelvyne arrives wounded", 11, "#d9c9a8", "normal"),
        ],
    )
    block(
        col2,
        [
            ("TERRAIN", 12, "#e8dcc0", "bold"),
            ("Low stone wall — half cover, +2 AC.", 11, "#d9c9a8", "normal"),
            ("  Vault: 5 ft move or DC 10 Athletics", 10, "#9a9488", "normal"),
            ("Overturned dais — 3/4 cover, +5 AC,", 11, "#d9c9a8", "normal"),
            ("  fits 2 Medium crouched", 10, "#9a9488", "normal"),
            ("Lantern poles x3 — topple DC 12 STR", 11, "#d9c9a8", "normal"),
            ("  -> 10 ft difficult terrain, or grab as", 10, "#9a9488", "normal"),
            ("  an improvised weapon (1d8 bludgeon)", 10, "#9a9488", "normal"),
            ("Standing stones — cover; Wenneth", 11, "#d9c9a8", "normal"),
            ("  Tree-Strides from one (Round 2)", 10, "#9a9488", "normal"),
        ],
    )
    block(
        col3,
        [
            ("LIGHT", 12, "#e8dcc0", "bold"),
            ("Dim across the green (firelight bleed)", 11, "#d9c9a8", "normal"),
            ("Bright within 10 ft of the door", 11, "#d9c9a8", "normal"),
            ("Past the lantern-pole ring = darkness;", 11, "#d9c9a8", "normal"),
            ("  no-darkvision PCs roll at disadvantage", 10, "#9a9488", "normal"),
            ("", 6, "#000", "normal"),
            ("MAT NOTE", 12, "#e8dcc0", "bold"),
            ("Sized to a Chessex 96246. Combat on", 11, "#d9c9a8", "normal"),
            ("the hex side; flip to the square side", 11, "#d9c9a8", "normal"),
            ("(your shrine grove) for the aftermath.", 11, "#d9c9a8", "normal"),
        ],
    )

    parts.append("</svg>")
    out = Path("campaigns/session-01-battlemap.svg")
    out.write_text("\n".join(parts), encoding="utf-8")
    print(f"OK -> {out}  ({SVG_W}x{SVG_H})  grid {COLS}x{ROWS} flat-top hexes")


if __name__ == "__main__":
    main()
