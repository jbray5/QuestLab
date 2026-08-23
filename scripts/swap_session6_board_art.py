"""Swap regenerated art onto existing Session 6 battle-map rows (Plan 00059).

The seed script skips maps whose names exist, so art revisions go through
this: upload the new PNG, then PATCH the existing row's image_url (and
dimensions, in case the aspect changed). Sessions, scenes, and tokens stay
attached to the row.

Usage:
    python scripts/swap_session6_board_art.py --dm-email you@example.com \
        --slug restwater --slug crossing-shallows
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

import httpx  # noqa: E402

from scripts.gen_session6_boards import BOARDS  # noqa: E402

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
WIDTH, HEIGHT = 1536, 1024


def main() -> int:
    """Upload each slug's PNG and re-point its battle-map row."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--campaign-id", default=DEFAULT_CAMPAIGN_ID)
    parser.add_argument("--dm-email", required=True)
    parser.add_argument(
        "--slug",
        action="append",
        required=True,
        choices=sorted(BOARDS),
        help="Board slug(s) whose art to swap.",
    )
    args = parser.parse_args()

    headers = {AUTH_HEADER: args.dm_email}
    maps = httpx.get(
        f"{args.api_base}/campaigns/{args.campaign_id}/battle-maps",
        headers=headers,
        timeout=120.0,
    )
    maps.raise_for_status()
    by_name = {m["name"]: m for m in maps.json()}

    for slug in args.slug:
        name = BOARDS[slug][0]
        row = by_name.get(name)
        if row is None:
            print(f"  ✗ '{name}' not in the library — run seed_session6_boards.py first")
            continue
        png = _ROOT / "data" / "generated-maps" / f"s6-{slug}.png"
        if not png.exists():
            print(f"  ✗ {png.name} missing — run gen_session6_boards.py first")
            continue
        data = png.read_bytes()
        print(f"Uploading {png.name} ({len(data) // 1024} KB) …")
        up = httpx.post(
            f"{args.api_base}/uploads/map",
            headers=headers,
            files={"file": (png.name, data, "image/png")},
            timeout=180.0,
        )
        up.raise_for_status()
        patch = httpx.patch(
            f"{args.api_base}/battle-maps/{row['id']}",
            headers=headers,
            json={"image_url": up.json()["url"], "width": WIDTH, "height": HEIGHT},
            timeout=60.0,
        )
        patch.raise_for_status()
        print(f"  ✓ '{name}' art swapped")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
