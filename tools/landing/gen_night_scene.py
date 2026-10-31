"""The /try landing hero's night scene, drawn by code (Plan 121): seeded, same picture every run.

No generative AI and no licensed art: ridges by midpoint displacement, pines as stacked
triangles, an inn with lit windows on a hill over a moonlit lake.

Writes ``frontend/src/components/landing/nightScene.generated.ts`` with one SVG string per
parallax layer (all on a 1600x900 viewBox): sky (stars + moon), far (ridge), mid (lake, hill,
inn, forest), mist, near (framing pines), ground (the strip the page grows out of).

Usage: ``python tools/landing/gen_night_scene.py [out.ts]``
"""

import json
import math
import random
import sys
from pathlib import Path

R = random.Random(20261030)
W, H = 1600, 900

INK_FAR = "#1D2F29"
INK_MID = "#14211C"
INK_NEAR = "#0D1311"
GROUND = "#111513"
LAKE = "#13241F"
MOON = "#EDE5CF"
LAMP = "#F0A062"


def ridge(x0, x1, y0, y1, amp, rough, steps=7):
    """Midpoint displacement between two ends: a list of (x, y)."""
    pts = [(x0, y0), (x1, y1)]
    a = amp
    for _ in range(steps):
        nxt = [pts[0]]
        for (ax, ay), (bx, by) in zip(pts, pts[1:]):
            mx, my = (ax + bx) / 2, (ay + by) / 2 + R.uniform(-a, a)
            nxt += [(mx, my), (bx, by)]
        pts = nxt
        a *= rough
    return pts


def at(pts, x):
    """The ridge's height at x (linear between samples)."""
    for (ax, ay), (bx, by) in zip(pts, pts[1:]):
        if ax <= x <= bx:
            t = (x - ax) / (bx - ax or 1)
            return ay + (by - ay) * t
    return pts[-1][1]


def poly(pts, bottom=H + 40):
    """A filled silhouette under a ridge line, closed at ``bottom``."""
    d = f"M{pts[0][0]:.0f},{bottom} " + " ".join(f"L{x:.0f},{y:.0f}" for x, y in pts)
    return d + f" L{pts[-1][0]:.0f},{bottom}Z"


def pine(x, base, h, w=None):
    """A layered pine: three stacked tiers and a trunk, as one path."""
    w = w or h * R.uniform(0.34, 0.42)
    d = []
    tiers = 3 if h < 90 else 4
    for i in range(tiers):
        top = base - h + i * h * 0.22
        bot = base - h * 0.12 - (tiers - 1 - i) * h * 0.16
        half = w * (0.42 + i * 0.2) / 2 * 1.0
        jag = R.uniform(-2, 2)
        d.append(
            f"M{x:.1f},{top:.1f} L{x + half + jag:.1f},{bot:.1f} L{x - half + jag:.1f},{bot:.1f}Z"
        )
    d.append(
        f"M{x - w * 0.05:.1f},{base - h * 0.14:.1f} h{w * 0.1:.1f} V{base + 2:.1f} h{-w * 0.1:.1f}Z"
    )
    return " ".join(d)


def forest(pts, x0, x1, hmin, hmax, density):
    d = []
    x = x0
    while x < x1:
        base = at(pts, x) + R.uniform(2, 8)
        d.append(pine(x, base, R.uniform(hmin, hmax)))
        x += R.uniform(*density)
    return " ".join(d)


def svg(body, extra=""):
    """One full-frame layer, anchored to the bottom so wide and narrow screens keep the ground."""
    return (
        f'<svg viewBox="0 0 {W} {H}" preserveAspectRatio="xMidYMax slice" aria-hidden="true" '
        f'style="position: absolute; inset: 0; width: 100%; height: 100%; display: block{extra}">{body}</svg>'
    )


# --- sky: stars and the moon ------------------------------------------------
stars = []
for _ in range(130):
    x, y = R.uniform(0, W), R.uniform(0, 470) ** 1.0
    if math.hypot(x - 1290, y - 175) < 70:
        continue
    r = R.choice([0.6, 0.7, 0.8, 0.9, 1.1, 1.3, 1.6])
    op = R.uniform(0.35, 0.9) * (1 - y / 700)
    if R.random() < 0.3:
        stars.append(
            f'<circle class="ql-tw" cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="#ECE7DA" '
            f'opacity="{op:.2f}" style="animation-delay: -{R.uniform(0, 5):.1f}s; '
            f'animation-duration: {R.uniform(3, 6):.1f}s"></circle>'
        )
    else:
        stars.append(
            f'<circle cx="{x:.0f}" cy="{y:.0f}" r="{r}" fill="#ECE7DA" opacity="{op:.2f}"></circle>'
        )
sky = (
    '<defs><radialGradient id="qlHalo"><stop offset="0" stop-color="#EDE5CF" stop-opacity="0.32"></stop>'
    '<stop offset="0.35" stop-color="#EDE5CF" stop-opacity="0.08"></stop>'
    '<stop offset="1" stop-color="#EDE5CF" stop-opacity="0"></stop></radialGradient></defs>'
    + "".join(stars)
    + '<circle cx="1290" cy="175" r="240" fill="url(#qlHalo)"></circle>'
    + f'<circle cx="1290" cy="175" r="44" fill="{MOON}"></circle>'
    + '<circle cx="1276" cy="164" r="9" fill="#D9CFB4" opacity="0.55"></circle>'
    + '<circle cx="1303" cy="188" r="6" fill="#D9CFB4" opacity="0.45"></circle>'
    + '<circle cx="1284" cy="194" r="4" fill="#D9CFB4" opacity="0.4"></circle>'
)

# --- far: a long hazy ridge -------------------------------------------------
far_pts = ridge(-20, W + 20, 590, 565, 62, 0.5)
far = f'<path d="{poly(far_pts)}" fill="{INK_FAR}"></path>'
far += f'<path d="{forest(far_pts, -10, W + 10, 10, 22, (5, 11))}" fill="{INK_FAR}"></path>'

# --- mid: the lake, the inn's hill, the forest on the left -----------------
left_pts = ridge(-20, 900, 612, 630, 14, 0.5, 6)
mid = [
    f'<path d="{poly(left_pts)}" fill="{INK_MID}"></path>',
    f'<path d="{forest(left_pts, -10, 880, 34, 78, (9, 17))}" fill="{INK_MID}"></path>',
    f'<rect x="0" y="628" width="{W}" height="{H - 628}" fill="{LAKE}"></rect>',
    f'<rect x="0" y="628" width="{W}" height="1.5" fill="#2C4A41" opacity="0.8"></rect>',
    '<defs><filter id="qlSoft" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="10"></feGaussianBlur></filter>'
    '<filter id="qlSmoke" x="-100%" y="-100%" width="300%" height="300%"><feGaussianBlur stdDeviation="3.5"></feGaussianBlur></filter></defs>',
    f'<ellipse cx="1290" cy="700" rx="46" ry="66" fill="{MOON}" opacity="0.07" filter="url(#qlSoft)"></ellipse>',
]
# moon on the water: broken bright strokes under the moon, wider as they come near
for i in range(22):
    y = 636 + i * 6.5 + R.uniform(-2.5, 2.5)
    w = R.uniform(6, 22 + i * 2.2)
    x = 1290 - w / 2 + R.uniform(-10 - i * 1.4, 10 + i * 1.4)
    op = R.uniform(0.18, 0.5) * (1 - i / 30)
    mid.append(
        f'<rect class="ql-shim" x="{x:.0f}" y="{y:.1f}" width="{w:.0f}" height="1.4" rx="0.7" fill="{MOON}" '
        f'opacity="{op:.2f}" style="animation-delay: -{R.uniform(0, 3):.1f}s"></rect>'
    )
for _ in range(26):
    y = R.uniform(645, 790)
    x = R.uniform(700, 1560)
    mid.append(
        f'<rect x="{x:.0f}" y="{y:.0f}" width="{R.uniform(18, 60):.0f}" height="1.5" fill="#5FB8AD" '
        f'opacity="{R.uniform(0.08, 0.2):.2f}"></rect>'
    )
# the left shore and forest (under the copy: kept low and dark)

# the inn's hill, on the right of centre, sloping into the lake
hill_pts = [
    (860, 650),
    (900, 612),
    (960, 572),
    (1030, 548),
    (1100, 538),
    (1150, 541),
    (1200, 556),
    (1240, 584),
    (1270, 616),
    (1300, 640),
]
mid.append(f'<path d="{poly(hill_pts, bottom=652)}" fill="{INK_MID}"></path>')
mid.append(
    f'<path d="{forest([(870, 640), (1000, 560)], 875, 985, 26, 48, (12, 19))}" fill="{INK_MID}"></path>'
)
mid.append(
    f'<path d="{forest([(1180, 556), (1290, 632)], 1190, 1280, 22, 40, (13, 20))}" fill="{INK_MID}"></path>'
)

# the inn: a hall with a steep roof, a tower, a chimney, a lantern at the door
g = 540  # ground line at the inn
inn = (
    # light spilling from the windows onto the hill
    '<defs><radialGradient id="qlLamp"><stop offset="0" stop-color="#F0A062" stop-opacity="0.38"></stop>'
    '<stop offset="1" stop-color="#F0A062" stop-opacity="0"></stop></radialGradient>'
    '<filter id="qlGlow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.4"></feGaussianBlur></filter></defs>'
    f'<ellipse class="ql-flick" cx="1098" cy="{g - 18}" rx="120" ry="64" fill="url(#qlLamp)"></ellipse>'
    f'<path d="M1046,{g} V{g - 46} L1086,{g - 86} L1126,{g - 46} V{g}Z" fill="{INK_MID}"></path>'
    f'<path d="M1126,{g} V{g - 40} H1168 V{g}Z M1122,{g - 40} L1147,{g - 64} L1172,{g - 40}Z" fill="{INK_MID}"></path>'
    f'<path d="M1058,{g - 58} V{g - 92} H1068 V{g - 68}Z" fill="{INK_MID}"></path>'
    f'<path d="M1132,{g - 40} V{g - 108} L1146,{g - 132} L1160,{g - 108} V{g - 40}Z" fill="{INK_MID}"></path>'
)
wins = [
    (1060, g - 36),
    (1078, g - 36),
    (1096, g - 36),
    (1060, g - 18),
    (1096, g - 18),
    (1082, g - 64),
    (1136, g - 28),
    (1152, g - 28),
    (1142, g - 92),
]
for wx, wy in wins:
    inn += (
        f'<rect class="ql-flick" x="{wx - 2}" y="{wy - 2}" width="12" height="15" fill="{LAMP}" opacity="0.55" '
        f'filter="url(#qlGlow)" style="animation-delay: -{R.uniform(0, 2.6):.1f}s"></rect>'
        f'<rect x="{wx}" y="{wy}" width="8" height="11" rx="1" fill="#F7C48E"></rect>'
    )
inn += f'<rect x="1078" y="{g - 14}" width="12" height="14" fill="#2A1C10"></rect>'
inn += (
    f'<path d="M1192,{g + 2} V{g - 24}" stroke="{INK_MID}" stroke-width="3"></path>'
    f'<circle class="ql-flick" cx="1192" cy="{g - 27}" r="9" fill="{LAMP}" opacity="0.5" filter="url(#qlGlow)"></circle>'
    f'<circle cx="1192" cy="{g - 27}" r="3.2" fill="#FFD3AA"></circle>'
)
for i in range(4):
    inn += (
        f'<circle class="ql-smoke" cx="1063" cy="{g - 96}" r="7" fill="#A9B3AA" filter="url(#qlSmoke)" '
        f'style="animation-delay: -{i * 2.4:.1f}s"></circle>'
    )
# its lights on the water
for i in range(5):
    inn += (
        f'<rect class="ql-shim" x="{1078 + R.uniform(-30, 30):.0f}" y="{652 + i * 8}" '
        f'width="{R.uniform(10, 26):.0f}" height="2" rx="1" fill="{LAMP}" opacity="{0.4 - i * 0.06:.2f}" '
        f'style="animation-delay: -{R.uniform(0, 3):.1f}s"></rect>'
    )
mid.append(inn)

# --- near: tall pines framing both edges -----------------------------------
near_pts = ridge(-40, W + 40, 820, 830, 20, 0.5, 5)
near = []
for x in [-6, 34, 72, 118]:
    near.append(pine(x + R.uniform(-8, 8), 860, R.uniform(300, 420)))
for x in [1430, 1478, 1530, 1590]:
    near.append(pine(x + R.uniform(-8, 8), 860, R.uniform(260, 400)))
near_svg = f'<path d="{" ".join(near)}" fill="{INK_NEAR}"></path>'

# --- ground: the dark the page grows out of --------------------------------
ground_pts = ridge(-40, W + 40, 812, 806, 18, 0.5, 6)
ground = f'<path d="{poly(ground_pts)}" fill="{GROUND}"></path>'
ground += f'<path d="{forest(ground_pts, 150, 330, 34, 70, (14, 24))}" fill="{GROUND}"></path>'
ground += f'<path d="{forest(ground_pts, 1240, 1420, 34, 70, (14, 24))}" fill="{GROUND}"></path>'

# --- mist: two soft bands over the water -----------------------------------
mist = (
    '<defs><filter id="qlMist" x="-20%" y="-200%" width="140%" height="500%">'
    '<feGaussianBlur stdDeviation="14"></feGaussianBlur></filter></defs>'
    '<ellipse cx="560" cy="640" rx="520" ry="22" fill="#DCE5DD" opacity="0.06" filter="url(#qlMist)"></ellipse>'
    '<ellipse cx="1180" cy="700" rx="600" ry="26" fill="#DCE5DD" opacity="0.07" filter="url(#qlMist)"></ellipse>'
    '<ellipse cx="300" cy="760" rx="420" ry="20" fill="#DCE5DD" opacity="0.05" filter="url(#qlMist)"></ellipse>'
)

out = {
    "sky": svg(sky),
    "far": svg(far),
    "mid": svg("".join(mid)),
    "mist": svg(mist),
    "near": svg(near_svg),
    "ground": svg(ground),
}
target = (
    Path(sys.argv[1])
    if len(sys.argv) > 1
    else (
        Path(__file__).resolve().parents[2]
        / "frontend/src/components/landing/nightScene.generated.ts"
    )
)
NL = chr(10)
target.write_text(
    "// Generated by tools/landing/gen_night_scene.py: do not edit by hand."
    + NL
    + "/** The /try hero's night scene, one SVG string per parallax layer (Plan 121). */"
    + NL
    + f"export const NIGHT_SCENE = {json.dumps(out, indent=2)} as const;"
    + NL,
    encoding="utf-8",
    newline=NL,
)
print({k: len(v) for k, v in out.items()})
