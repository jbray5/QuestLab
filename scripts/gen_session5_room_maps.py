"""Generate the five player-facing room maps for the temple crawl (Session 5).

The crawl already had maps for the boss arena (The Drowned Temple) and the
descent (The Stair). These are the rooms in between — the ones the party
actually stands in and makes decisions on. The Gallery in particular NEEDS
a map: it is a trap where the safe path must be visible for players to
choose their steps.

Generates without a grid (the Table View draws its own overlay) and saves
locally for inspection. Upload with scripts/seed_session5_room_maps.py.

Usage:
    python scripts/gen_session5_room_maps.py
    python scripts/gen_session5_room_maps.py --only tide-gate
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

OUT_DIR = _ROOT / "data" / "generated-maps"

# Scene descriptions come straight from the room read-alouds — what the
# players are told they see is what the map must show.
ROOMS = {
    "tide-gate": (
        "The Tide Gate",
        "a small drowned antechamber of black temple stone, STRICT TOP-DOWN: at one end a "
        "tall doorway filled with a vertical sheet of standing water, pale blue-green and "
        "faintly luminous, with small fish suspended motionless inside it; set into the "
        "floor before the door, four large square stone tiles carved with simple angular "
        "marks; in the corner a small round tide pool glowing faint silver with tiny fish; "
        "wet flagstones, open floor to move on",
    ),
    "drowned-nave": (
        "The Drowned Nave",
        "a wide pillared temple hall under a thin sheet of standing water, STRICT TOP-DOWN: "
        "two rows of massive round stone pillars running the length of the room, open "
        "flagstone floor between them, and at the exact center a large rectangular stone "
        "tablet lying raised on a low plinth, its surface furred with pale barnacle growth; "
        "cold dim light, broken pews or benches along the edges",
    ),
    "the-gallery": (
        "The Gallery",
        "a long sloping corridor of dark wet temple stone, STRICT TOP-DOWN: winding through "
        "the middle of the corridor floor, a clearly visible meandering path of small "
        "glowing warm-gold patches — clusters of luminous limpets on individual flagstones — "
        "forming a safe stepping route from one end to the other; all surrounding floor is "
        "dark unlit stone; the side walls are densely carved with rows of angular glyphs; "
        "the glowing path must read unmistakably against the dark stone",
    ),
    "bell-well": (
        "The Bell Well",
        "a flooded circular shaft chamber seen STRICT TOP-DOWN from directly above: a round "
        "well of dark water filling most of the frame, and submerged just below the surface "
        "a huge ancient bronze bell, green with verdigris, seen from above as a great ring; "
        "three pale humanoid shapes cling motionless to its curve; a narrow stone ledge "
        "rings the shaft with rough handholds carved into the wall for climbing",
    ),
    "keepers-cell": (
        "The Keeper's Cell",
        "a small bare stone cell, STRICT TOP-DOWN: a low cot woven from dried kelp against "
        "one wall, every wall surface covered in dense scratched tally marks, and in a "
        "small side alcove a tiny arrangement of infant things and a half-finished wooden "
        "carving of a little boat; quiet, still water on the floor, deeply sad and intimate",
    ),
}

_MAP_STYLE = (
    "STRICT ORTHOGRAPHIC TOP-DOWN fantasy battle map for a tabletop RPG: the camera looks "
    "straight down at 90 degrees — zero perspective, no tilt, no horizon. Every object is "
    "seen exactly from above; walls and stonework show ONLY their top cross-section, no "
    "side faces anywhere. Painterly high-detail environment art, cold undersea light. "
    "Terrain fills the entire frame edge to edge. STRICTLY NO grid lines, NO text, NO "
    "labels, NO characters or creatures, NO UI elements, NO borders."
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
    """Generate each room map and save it locally for inspection."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--only", default=None, help="Generate a single slug.")
    parser.add_argument("--quality", default="high", choices=["low", "medium", "high"])
    args = parser.parse_args()

    _load_dotenv(_ROOT / ".env")
    from integrations.openai_client import generate_image

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    todo = {args.only: ROOMS[args.only]} if args.only else ROOMS

    for slug, (name, scene) in todo.items():
        out = OUT_DIR / f"{slug}.png"
        if out.exists():
            print(f"  · {out.name} exists — skipped")
            continue
        print(f"Generating '{name}' …")
        png = generate_image(
            f"Scene: {scene}. {_MAP_STYLE}", size="1536x1024", quality=args.quality
        )
        out.write_bytes(png)
        print(f"  ✓ {out.name} ({len(png) // 1024} KB)")

    print("\nInspect the PNGs, then upload with scripts/seed_session5_room_maps.py")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
