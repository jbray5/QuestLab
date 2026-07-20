"""Seed (or reset) the public demo world — Plan 54.

Run against a DEMO deployment (DEMO_MODE=true pins identity server-side,
so the auth header value is irrelevant there). Deletes every campaign the
demo identity owns, then rebuilds a small showcase campaign: a party with
art, a staged battle map with tokens, and one stocked shop. AI stays off
on the demo — all art reuses existing public blob URLs.

Usage:
    python scripts/seed_demo_world.py --api https://<demo-api>/api

Nightly reset: .github/workflows/demo-reset.yml runs this on a cron with
DEMO_API_URL from repo secrets.
"""

import argparse
import json
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

HEADERS = {
    "Content-Type": "application/json",
    # Ignored when DEMO_MODE pins identity; harmless otherwise.
    "X-MS-CLIENT-PRINCIPAL-NAME": "demo@questlab.app",
}

# Public art from the owner's blob store (generated in-app; free to reuse).
ART = {
    "map": "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/c708579c-70e1-4811-8f58-d92504868d0c-kDyq5ThugnkcHPxSHyt9aegBQgCHcG.png",  # noqa: E501
    "hero_paladin": "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/heroes/pc-9a450e7d-4def-40f9-8be1-dd060db7a93c-loadout-MonhrHDJ2FtqJRDVyoCBFsKBl2OfeW.png",  # noqa: E501
    "hero_sorcerer": "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/heroes/pc-c29ba294-345c-4e09-ba3e-f913d06136fc-loadout-NgyLpoCwgu6xpfkohlH3UaRZkJ5O80.png",  # noqa: E501
}

PARTY = [
    dict(
        player_name="Demo Seat 1",
        character_name="Ser Bram Emberscale",
        race="Dragonborn",
        character_class="Paladin",
        level=2,
        score_str=16,
        score_dex=10,
        score_con=14,
        score_int=8,
        score_wis=12,
        score_cha=14,
        hp_max=20,
        hp_current=20,
        ac=18,
        speed=30,
    ),
    dict(
        player_name="Demo Seat 2",
        character_name="Wren Duskwhisper",
        race="Human",
        character_class="Sorcerer",
        level=2,
        score_str=8,
        score_dex=14,
        score_con=14,
        score_int=12,
        score_wis=10,
        score_cha=16,
        hp_max=14,
        hp_current=14,
        ac=12,
        speed=30,
    ),
]

SHOP_ITEMS = [
    (
        "Potion of Healing",
        "Potion",
        "Common",
        50,
        6,
        "Drink to regain 2d4+2 hit points.",
        "Fresh off the still this morning.",
    ),
    (
        "Everbright Lantern",
        "Wondrous Item",
        "Common",
        25,
        3,
        "Needs no oil, can't be blown out. Bright light 30 ft, dim 30 more.",
        "Light you can trust in a wind.",
    ),
    (
        "Silvered Shortsword",
        "Weapon",
        "Common",
        100,
        2,
        "A shortsword sheathed in true silver — bites creatures that shrug off common steel.",
        "For the nights ordinary iron won't do.",
    ),
    (
        "Charm of the Curious Fox",
        "Trinket",
        "Uncommon",
        120,
        1,
        "1/day: advantage on one Investigation check. The fox knows.",
        "Curiosity, bottled. Mostly harmless.",
    ),
]


def call(api: str, method: str, path: str, body=None, timeout=120):
    """Call the demo API; returns parsed JSON or None."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{api}{path}", data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def main() -> None:
    """Wipe the demo identity's campaigns and rebuild the showcase."""
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--api", required=True, help="Demo API base, e.g. https://x.onrender.com/api"
    )
    api = parser.parse_args().api.rstrip("/")

    # 1. Wipe everything the demo identity owns (cascade handles children).
    for campaign in call(api, "GET", "/campaigns") or []:
        try:
            call(api, "DELETE", f"/campaigns/{campaign['id']}")
            print(f"- wiped campaign {campaign['name']}")
        except urllib.error.HTTPError as exc:
            print(f"! wipe failed for {campaign['name']}: {exc.code}")

    # 2. Showcase campaign.
    camp = call(
        api,
        "POST",
        "/campaigns",
        {
            "name": "The Lantern Road (Demo)",
            "setting": "A fey-touched valley where the market lanterns never quite go out.",
            "tone": "Whimsical adventure with teeth",
            "description": "A sandbox world for trying QuestLab. Poke everything - resets nightly.",
        },
    )
    cid = camp["id"]
    adv = call(
        api,
        "POST",
        f"/campaigns/{cid}/adventures",
        {
            "title": "First Night on the Lantern Road",
            "tier": "Tier1",
            "synopsis": "The caravan needs guards; the lanterns need lighting; "
            "the hedgerows disagree.",
        },
    )
    session = call(
        api,
        "POST",
        f"/adventures/{adv['id']}/sessions",
        {
            "session_number": 1,
            "title": "Demo Session — The Road Out",
        },
    )
    sid = session["id"]
    print(f"+ campaign/adventure/session ({cid[:8]}...)")

    # 3. Party with real art.
    pc_ids = []
    for spec, art in zip(PARTY, [ART["hero_paladin"], ART["hero_sorcerer"]]):
        pc = call(api, "POST", f"/campaigns/{cid}/characters", spec)
        call(
            api, "PATCH", f"/characters/{pc['id']}", {"figure_url": art, "hero_url": art, "gp": 40}
        )
        pc_ids.append(pc["id"])
    call(api, "PATCH", f"/sessions/{sid}", {"attending_pc_ids": pc_ids})
    print(f"+ party of {len(pc_ids)} with art + gold")

    # 4. Battle map staged on the table with tokens.
    bmap = call(
        api,
        "POST",
        f"/campaigns/{cid}/battle-maps",
        {
            "name": "The Lantern Road",
            "image_url": ART["map"],
            "width": 1536,
            "height": 1024,
            "grid_size": 96,
        },
    )
    tokens = [
        {
            "id": f"pc-{i}",
            "label": PARTY[i]["character_name"].split(" ")[0],
            "x": 500 + i * 120,
            "y": 620,
            "kind": "pc",
            "ref_id": pc_ids[i],
            "size": 1,
            "style": "figure",
            "image_url": [ART["hero_paladin"], ART["hero_sorcerer"]][i],
        }
        for i in range(len(pc_ids))
    ]
    call(
        api,
        "PATCH",
        f"/sessions/{sid}/table",
        {
            "active_map_id": bmap["id"],
            "tokens": tokens,
            "darkness": 0.1,
            "title": "The Lantern Road",
        },
    )
    print("+ battle map staged with party tokens")

    # 5. One stocked shop.
    shop = call(
        api,
        "POST",
        f"/campaigns/{cid}/shops",
        {
            "name": "The Curious Fox",
            "location": "Lantern Road, first bend",
            "keeper": "Maple, a fox who is also a shopkeeper. Don't ask.",
            "blurb": "Sundries, remedies, and one or two things Maple won't explain.",
        },
    )
    for name, itype, rarity, price, stock, desc, pitch in SHOP_ITEMS:
        call(
            api,
            "POST",
            f"/shops/{shop['id']}/items",
            {
                "name": name,
                "item_type": itype,
                "rarity": rarity,
                "price_gp": price,
                "stock": stock,
                "description": desc,
                "pitch": pitch,
            },
        )
    print(f"+ shop stocked ({len(SHOP_ITEMS)} items)")

    print("\nDemo world ready.")
    print("  DM app:      <frontend>/  (identity pinned server-side)")
    print(f"  Board:       <frontend>/sessions/{sid}/board")
    print(f"  Players' 3D: <frontend>/table/{sid}/3d")
    print(f"  Market:      <frontend>/market/{cid}")


if __name__ == "__main__":
    main()
