"""Batch-generate catalog art for items that have none.

Item art matters twice: players tap it in their inventory, and the
Identity Forge hands it to the loadout pass as a visual reference
("snap-on gear") — every item art added improves every character's
render. This walks the party's gear via the live API, finds items
without art, generates a clean prop render per item, uploads it to
Vercel Blob (via the API's upload route), and PATCHes the item row.

Costs OpenAI credits: ~1 image per item; --limit caps a run (default 6).
Equipped items first — they're the ones the forge references.

Examples:
    python scripts/generate_item_art.py --plan          # list, no spend
    python scripts/generate_item_art.py                 # up to 6 items
    python scripts/generate_item_art.py --limit 12 --all-inventory
    python scripts/generate_item_art.py --name "Longsword"
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

import httpx  # noqa: E402

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows cp1252 console
from dotenv import load_dotenv  # noqa: E402

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"

_PROMPT = (
    "A single {name}, the D&D adventuring item, presented alone as museum-grade "
    "equipment art: hand-painted dark-fantasy concept illustration, weathered "
    "realistic materials, dramatic soft lighting, centered on a plain very dark "
    "charcoal background with a subtle ground shadow. Nothing else in frame — "
    "no character, no hands, no scenery, no text, no watermark, no border."
)


def _gear_rows(api: str, campaign: str) -> list[dict]:
    """Every PC's gear rows via the public join roster + gear routes."""
    roster = httpx.get(f"{api}/play/join/{campaign}", timeout=60.0).json()
    rows: list[dict] = []
    for pc in roster:
        gear = httpx.get(f"{api}/play/{pc['id']}/gear", timeout=60.0).json()
        for g in gear:
            g["_pc"] = pc["character_name"]
            rows.append(g)
    return rows


def main() -> None:
    """CLI entry point."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--plan", action="store_true", help="list candidates, generate nothing")
    ap.add_argument("--limit", type=int, default=6, help="max images this run")
    ap.add_argument("--all-inventory", action="store_true", help="include unequipped items")
    ap.add_argument("--name", action="append", default=[], help="specific item name(s) only")
    ap.add_argument("--campaign", default=DEFAULT_CAMPAIGN_ID)
    ap.add_argument("--api", default=os.environ.get("QUESTLAB_API", DEFAULT_API_BASE))
    ap.add_argument("--dm-email", default="justinray5@outlook.com")
    args = ap.parse_args()

    rows = _gear_rows(args.api, args.campaign)
    # item_id -> (name, equipped anywhere, holders)
    items: dict[str, dict] = {}
    for g in rows:
        iid = g.get("item_id")
        if not iid or g.get("image_url"):
            continue
        entry = items.setdefault(iid, {"name": g["name"], "equipped": False, "holders": []})
        entry["equipped"] = entry["equipped"] or bool(g.get("equipped"))
        entry["holders"].append(g["_pc"])

    wanted = [
        (iid, e)
        for iid, e in items.items()
        if (not args.name or e["name"] in args.name)
        and (args.all_inventory or args.name or e["equipped"])
    ]
    wanted.sort(key=lambda t: (not t[1]["equipped"], t[1]["name"]))

    if not wanted:
        print("Every relevant item already has art. ✨")
        return
    print(f"{len(wanted)} item(s) missing art:")
    for _iid, e in wanted:
        tag = "equipped" if e["equipped"] else "inventory"
        print(f"  [{tag}] {e['name']}  (held by {', '.join(sorted(set(e['holders'])))})")
    if args.plan:
        print("\n--plan only — nothing generated.")
        return

    load_dotenv(_ROOT / ".env")
    from integrations.openai_client import generate_image

    headers = {AUTH_HEADER: args.dm_email}
    done = 0
    for iid, e in wanted[: args.limit]:
        print(f"\nGenerating {e['name']!r} …")
        png = generate_image(_PROMPT.format(name=e["name"]), size="1024x1024")
        up = httpx.post(
            f"{args.api}/uploads/map",  # blob-backed upload route (path prefix is cosmetic)
            headers=headers,
            files={"file": (f"item-{iid}.png", png, "image/png")},
            timeout=300.0,
        )
        up.raise_for_status()
        url = up.json()["url"]
        patch = httpx.patch(
            f"{args.api}/items/{iid}",
            headers=headers,
            json={"image_url": url},
            timeout=60.0,
        )
        patch.raise_for_status()
        done += 1
        print(f"  ✓ {url}")
    print(f"\nDone — {done} item(s) now have art. The forge references them automatically.")


if __name__ == "__main__":
    main()
