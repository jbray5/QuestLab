"""Generate the four Session 6 boards ("Into the Fey", Plan 00059).

Two fight boards (the session forks and only one fires), one traversal
board, one optional opener. Boards are shared screens: ZERO text, ZERO
labels, ZERO creatures baked into the art — tokens carry the creatures.

Generates without a grid (the Table View draws its own overlay) and saves
locally for inspection. Upload with scripts/seed_session6_boards.py.

Usage:
    python scripts/gen_session6_boards.py
    python scripts/gen_session6_boards.py --only restwater
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

OUT_DIR = _ROOT / "data" / "generated-maps"

# Scene descriptions transcribed from the Session 6 handoff — what the doc
# says the board must show is what the prompt asks for. Nothing invented.
BOARDS = {
    "restwater": (
        "Restwater",
        "a fey bathhouse built into a green hillside, STRICT TOP-DOWN: a central main "
        "hall of pale timber and cedar with a large ornate standing water clock near its "
        "middle; three or four terraced open-air soaking pools stepping down the hillside "
        "outside the hall, steaming turquoise water; three or four small guest rooms "
        "opening off the hall, each with a clear doorway gap in its walls; a front gate "
        "at one end; wide clear doorway openings connecting hall, rooms, and pool "
        "terraces; lit paper lanterns in daytime, drifting steam wisps; warm golden "
        "inviting light, immaculately clean; AND, inset along the bottom edge of the map "
        "separated by a thick band of solid dark rock, a small separate stone chamber "
        "directly beneath the main pool containing a large shut sluice gate mechanism of "
        "stone and timber with a wheel, a narrow water channel leading from it",
    ),
    "ring-strand": (
        "The Ring at the Strand",
        "a harbor-town waterfront festival plaza, STRICT TOP-DOWN: at the exact center a "
        "raised square wrestling ring roughly four squares wide, wooden platform edged "
        "with taut ropes on posts, its boundary crisp and unmistakable; dense festival "
        "crowds packed all around the ring shown as colorful massed shapes seen from "
        "above; an open clear space beside the ring; generic market stalls with plain "
        "colored awnings sketched around the plaza edges, no signage, no readable goods; "
        "harbor water along one full side with small boats; strung pennant lines and "
        "festival lights across the plaza; bright golden daylight, loud happy colors",
    ),
    "crossing-shallows": (
        "The Crossing (Shallows)",
        "a mile-wide strait of shallow glass-clear sunlit water crossed from one short "
        "edge to the other, STRICT TOP-DOWN: a white sand beach along one short edge and "
        "a lush green coastline along the opposite short edge; running the full length "
        "between them under the knee-deep transparent water, a clearly visible straight "
        "paved stone road on the seafloor; off the road several very large dark sleeping "
        "silhouette shapes on the sandy bottom, indistinct dark masses only with no "
        "detail; a few patches of subtly discolored water; wide open white sand seafloor "
        "everywhere else, fully visible through the warm bright shallow water, golden "
        "hour sunlight",
    ),
    "beach": (
        "The Beach",
        "a white glittering sand cove, STRICT TOP-DOWN: calm flat warm sea along one "
        "side, an extremely green dense treeline inland along the other, open sparkling "
        "white sand between; on a low rock outcrop above the cove a small stone shrine "
        "of four upright posts and a flat lintel, a soft silver-white glow inside it, "
        "no flame, no smoke; scattered driftwood and small tide pools on the sand; "
        "bright warm daylight",
    ),
}

_MAP_STYLE = (
    "STRICT ORTHOGRAPHIC TOP-DOWN fantasy battle map for a tabletop RPG: the camera looks "
    "straight down at 90 degrees — zero perspective, no tilt, no horizon. Every object is "
    "seen exactly from above; walls and stonework show ONLY their top cross-section, no "
    "side faces anywhere. Painterly high-detail environment art. "
    # Readability rule (2026-07-31): the table's darkness dial adds the night —
    # the ART must be bright. Dark art + the dial = an unreadable black board.
    "BRIGHT, EVENLY LIT and clearly readable: mid-tone colors, no deep shadows, "
    "no near-black areas, every floor detail plainly visible as if lit for a printed "
    "atlas page. Terrain fills the entire frame edge to edge. STRICTLY NO grid lines, "
    "NO text, NO labels, NO characters or creatures, NO UI elements, NO borders."
)


def _load_dotenv(path: Path) -> None:
    """Load KEY=value lines into the environment without printing them."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> int:
    """Generate each board and save it locally for inspection."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", default=None, help="Generate a single slug.")
    parser.add_argument("--quality", default="high", choices=["low", "medium", "high"])
    args = parser.parse_args()

    _load_dotenv(_ROOT / ".env")
    from integrations.openai_client import generate_image

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = {args.only: BOARDS[args.only]} if args.only else BOARDS

    for slug, (name, scene) in todo.items():
        out = OUT_DIR / f"s6-{slug}.png"
        if out.exists():
            print(f"  · {out.name} exists — skipped")
            continue
        print(f"Generating '{name}' …")
        png = generate_image(
            f"Scene: {scene}. {_MAP_STYLE}", size="1536x1024", quality=args.quality
        )
        out.write_bytes(png)
        print(f"  ✓ {out.name} ({len(png) // 1024} KB)")

    print("\nInspect the PNGs, then upload with scripts/seed_session6_boards.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
