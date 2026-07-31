"""Upload Session 5's two battle maps into the library (P3, Session 5 handoff).

Both PNGs are generated first (scripts/generate_battle_map.py, already run —
inspect them in data/generated-maps/ before uploading):

  1. THE CROSSING — the ghost ship's main deck. Rails on all four sides
     (the fight pulls creatures TO the rails), mast + cargo as cover,
     open water past every edge.
  2. THE DROWNED TEMPLE — the boss arena. The chained lantern mass on its
     dais at one end, the prisoner platform beside it, and four markable
     hazard zones seeded as named fog regions (cold surge / leaning water)
     the DM reveals or repositions in the Map Builder.

Idempotent: a map whose name already exists in the campaign is skipped.

Usage:
    python scripts/seed_session5_maps.py --dm-email you@example.com
    python scripts/seed_session5_maps.py --api-base http://localhost:8000/api --dm-email ...
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT))

import httpx  # noqa: E402

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
WIDTH, HEIGHT = 1536, 1024
GRID = 64  # px per 5-ft square → 24 × 16 squares

MAPS = [
    {
        "name": "The Crossing",
        "png": _REPO_ROOT / "data" / "generated-maps" / "the-crossing.png",
        "regions": [],
    },
    {
        "name": "The Drowned Temple",
        "png": _REPO_ROOT / "data" / "generated-maps" / "the-drowned-temple.png",
        # The handoff's 3-4 markable hazard zones. Rough placements the DM
        # nudges in the Map Builder; names are what the table hears.
        "regions": [
            {
                "id": "surge-west",
                "name": "Cold Surge — West",
                "points": [[180, 420], [560, 420], [560, 700], [180, 700]],
            },
            {
                "id": "surge-east",
                "name": "Cold Surge — East",
                "points": [[980, 420], [1360, 420], [1360, 700], [980, 700]],
            },
            {
                "id": "leaning-south",
                "name": "Leaning Water — South",
                "points": [[480, 760], [1050, 760], [1050, 980], [480, 980]],
            },
            {
                "id": "glyph-ring",
                "name": "The Glyph Ring",
                "points": [[600, 430], [930, 430], [930, 730], [600, 730]],
            },
        ],
    },
]


def main() -> int:
    """Upload both PNGs and create their BattleMap rows."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--campaign-id", default=DEFAULT_CAMPAIGN_ID)
    parser.add_argument("--dm-email", required=True)
    args = parser.parse_args()

    headers = {AUTH_HEADER: args.dm_email}

    existing = httpx.get(
        f"{args.api_base}/campaigns/{args.campaign_id}/battle-maps",
        headers=headers,
        timeout=60.0,
    )
    existing.raise_for_status()
    have = {m["name"] for m in existing.json()}

    for spec in MAPS:
        if spec["name"] in have:
            print(f"  · '{spec['name']}' already in the library — skipped")
            continue
        if not spec["png"].exists():
            print(f"  ✗ {spec['png']} missing — run generate_battle_map.py first")
            return 1

        data = spec["png"].read_bytes()
        print(f"Uploading {spec['png'].name} ({len(data) // 1024} KB) …")
        resp = httpx.post(
            f"{args.api_base}/uploads/map",
            headers=headers,
            files={"file": (spec["png"].name, data, "image/png")},
            timeout=180.0,
        )
        resp.raise_for_status()
        image_url = resp.json()["url"]

        resp = httpx.post(
            f"{args.api_base}/campaigns/{args.campaign_id}/battle-maps",
            headers=headers,
            json={
                "name": spec["name"],
                "image_url": image_url,
                "width": WIDTH,
                "height": HEIGHT,
                "grid_size": GRID,
                "regions": spec["regions"],
            },
            timeout=60.0,
        )
        resp.raise_for_status()
        zones = f", {len(spec['regions'])} hazard zones" if spec["regions"] else ""
        print(f"  ✓ '{spec['name']}' created (grid {GRID}px{zones})")

    print("\nDone. Import campaigns/session-05-scenes.json from the Board's ⬆ Import button")
    print("to wire the presets to these maps.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
