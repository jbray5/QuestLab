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
    python scripts/generate_item_art.py --shop <shop-id> --limit 12
    python scripts/generate_item_art.py --item <item-id> --item <item-id>

Generation runs **here**, against the local OPENAI_API_KEY, and only the
finished PNG is uploaded. The product itself ships without generative AI and
its AI routes still answer "Generative AI is not part of QuestLab" — see
plans/00086-no-generative-ai.md and the same posture in plans/00094.
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

# The Feywild in high summer: the dark-fantasy prompt reads as a dungeon, and a
# festival stall is not a dungeon. Same object, same framing, daylight.
_PROMPT_BRIGHT = (
    "A single {name}, the D&D adventuring item, presented alone as museum-grade "
    "equipment art: luminous hand-painted storybook illustration, warm summer "
    "daylight, bright saturated colours, gold and green highlights, centered on "
    "a plain pale cream background with a soft ground shadow. Light, airy and "
    "cheerful — a midsummer fair, not a dungeon. Nothing else in frame — no "
    "character, no hands, no scenery, no text, no watermark, no border."
)

_STYLES = {"dark": _PROMPT, "bright": _PROMPT_BRIGHT}


def _shop_rows(api: str, shop_id: str) -> list[dict]:
    """Every item on one shop's shelves, shaped like a gear row.

    Args:
        api: API base URL.
        shop_id: UUID of the shop.

    Returns:
        Rows carrying ``item_id``, ``name`` and ``image_url``.
    """
    front = httpx.get(f"{api}/storefront/{shop_id}", timeout=60.0).json()
    rows = []
    for it in front.get("items") or []:
        rows.append(
            {
                "item_id": it.get("item_id"),
                "name": it.get("name"),
                "image_url": it.get("image_url"),
                "equipped": True,  # a shelf has no notion of equipped; treat all as wanted
                "_pc": front.get("name", "the shop"),
            }
        )
    return rows


def _item_rows(api: str, headers: dict, item_ids: list[str]) -> list[dict]:
    """Named catalog items, shaped like gear rows.

    Args:
        api: API base URL.
        headers: Auth headers for the DM.
        item_ids: Catalog item UUIDs.

    Returns:
        Rows carrying ``item_id``, ``name`` and ``image_url``.
    """
    rows = []
    for iid in item_ids:
        r = httpx.get(f"{api}/items/{iid}", headers=headers, timeout=60.0)
        r.raise_for_status()
        it = r.json()
        rows.append(
            {
                "item_id": it["id"],
                "name": it["name"],
                "image_url": it.get("image_url"),
                "equipped": True,
                "_pc": "catalog",
            }
        )
    return rows


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
    ap.add_argument("--shop", default=None, help="stock one shop's shelves instead of party gear")
    ap.add_argument("--item", action="append", default=[], help="catalog item id(s) directly")
    ap.add_argument(
        "--style", choices=sorted(_STYLES), default="dark", help="art style for this run"
    )
    ap.add_argument("--force", action="store_true", help="redo art that already exists")
    ap.add_argument("--campaign", default=DEFAULT_CAMPAIGN_ID)
    ap.add_argument("--api", default=os.environ.get("QUESTLAB_API", DEFAULT_API_BASE))
    ap.add_argument("--dm-email", default="justinray5@outlook.com")
    args = ap.parse_args()

    headers = {AUTH_HEADER: args.dm_email}
    if args.item:
        rows = _item_rows(args.api, headers, args.item)
    elif args.shop:
        rows = _shop_rows(args.api, args.shop)
    else:
        rows = _gear_rows(args.api, args.campaign)
    # item_id -> (name, equipped anywhere, holders)
    items: dict[str, dict] = {}
    for g in rows:
        iid = g.get("item_id")
        if not iid or (g.get("image_url") and not args.force):
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
    verb = "to redo" if args.force else "missing art"
    print(f"{len(wanted)} item(s) {verb}:")
    for _iid, e in wanted:
        tag = "equipped" if e["equipped"] else "inventory"
        print(f"  [{tag}] {e['name']}  (held by {', '.join(sorted(set(e['holders'])))})")
    if args.plan:
        print("\n--plan only — nothing generated.")
        return

    load_dotenv(_ROOT / ".env")
    from integrations.openai_client import generate_image

    done = 0
    for iid, e in wanted[: args.limit]:
        print(f"\nGenerating {e['name']!r} …")
        png = generate_image(_STYLES[args.style].format(name=e["name"]), size="1024x1024")
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
