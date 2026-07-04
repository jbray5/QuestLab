"""Seed a self-contained Table View demo into a deployed QuestLab (Plan 42).

Creates (idempotently) a dedicated "Table View Demo" campaign → adventure →
session, a battle map pointing at the committed /demo-map.svg with fog regions,
and a live table state (active map, fog on, one region revealed, a few tokens,
darkness + a title card). Prints the public /table/{session_id} URL to open on
any device — the projector surface needs no login.

Auth is the same trusted header the deployed API reads
(``X-MS-CLIENT-PRINCIPAL-NAME``); pass --dm-email to own the demo so it also
shows up in that DM's dashboard for driving the console.

Usage:
    python scripts/seed_demo_map.py \
        --api-base https://questlab-api-9yhe.onrender.com/api \
        --dm-email you@example.com \
        --frontend https://questlab.vercel.app
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"

CAMPAIGN_NAME = "✨ Table View Demo"
ADVENTURE_TITLE = "Demo Adventure"
MAP_NAME = "The Wyrmrest Tavern"

REGIONS = [
    {
        "id": "hearth",
        "name": "Hearthside",
        "points": [[60, 420], [820, 420], [820, 1000], [60, 1000]],
    },
    {"id": "bar", "name": "The Bar", "points": [[1180, 60], [2040, 60], [2040, 720], [1180, 720]]},
    {
        "id": "floor",
        "name": "Main Floor",
        "points": [[760, 460], [1520, 460], [1520, 1020], [760, 1020]],
    },
    {
        "id": "cellar",
        "name": "Cellar Corner",
        "points": [[60, 1040], [420, 1040], [420, 1440], [60, 1440]],
    },
]

TOKENS = [
    {
        "id": "t-willa",
        "kind": "pc",
        "ref_id": None,
        "label": "Willa",
        "image_url": None,
        "x": 980,
        "y": 720,
        "size": 1,
        "color": None,
    },
    {
        "id": "t-thane",
        "kind": "pc",
        "ref_id": None,
        "label": "Thane",
        "image_url": None,
        "x": 1180,
        "y": 770,
        "size": 1,
        "color": None,
    },
    {
        "id": "t-bandit",
        "kind": "monster",
        "ref_id": None,
        "label": "Bandit",
        "image_url": None,
        "x": 1080,
        "y": 910,
        "size": 1,
        "color": None,
    },
]


def _req(method: str, url: str, email: str, body: dict | None = None) -> object:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Content-Type", "application/json")
    req.add_header(AUTH_HEADER, email)
    try:
        with urllib.request.urlopen(req, timeout=45) as resp:
            raw = resp.read().decode()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:400]
        print(f"  ! {method} {url} -> {exc.code}: {detail}", file=sys.stderr)
        raise


def _find(items: object, key: str, value: str) -> dict | None:
    if isinstance(items, list):
        for it in items:
            if isinstance(it, dict) and it.get(key) == value:
                return it
    return None


def main() -> int:
    """Seed the demo and print the shareable Table View URL."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    ap = argparse.ArgumentParser()
    ap.add_argument("--api-base", default=DEFAULT_API_BASE)
    ap.add_argument("--dm-email", required=True)
    ap.add_argument("--frontend", default="", help="Frontend origin, for printing the /table URL")
    args = ap.parse_args()
    api = args.api_base.rstrip("/")
    email = args.dm_email.strip().lower()

    print(f"→ Seeding demo into {api} as {email}")

    # 1. Campaign
    campaigns = _req("GET", f"{api}/campaigns", email)
    campaign = _find(campaigns, "name", CAMPAIGN_NAME)
    if campaign is None:
        campaign = _req(
            "POST",
            f"{api}/campaigns",
            email,
            {"name": CAMPAIGN_NAME, "setting": "Anywhere", "tone": "a warm tavern night"},
        )
        print(f"  + campaign {campaign['id']}")
    cid = campaign["id"]

    # 2. Adventure
    advs = _req("GET", f"{api}/campaigns/{cid}/adventures", email)
    adv = _find(advs, "title", ADVENTURE_TITLE)
    if adv is None:
        adv = _req(
            "POST",
            f"{api}/campaigns/{cid}/adventures",
            email,
            {"title": ADVENTURE_TITLE, "synopsis": "A demo of the projected Table View."},
        )
        print(f"  + adventure {adv['id']}")
    aid = adv["id"]

    # 3. Session
    sessions = _req("GET", f"{api}/adventures/{aid}/sessions", email)
    session = sessions[0] if isinstance(sessions, list) and sessions else None
    if session is None:
        session = _req(
            "POST",
            f"{api}/adventures/{aid}/sessions",
            email,
            {"session_number": 1, "title": "Demo Session"},
        )
        print(f"  + session {session['id']}")
    sid = session["id"]

    # 4. Battle map
    maps = _req("GET", f"{api}/campaigns/{cid}/battle-maps", email)
    battle_map = _find(maps, "name", MAP_NAME)
    if battle_map is None:
        battle_map = _req(
            "POST",
            f"{api}/campaigns/{cid}/battle-maps",
            email,
            {
                "name": MAP_NAME,
                "image_url": "/demo-map.svg",
                "width": 2100,
                "height": 1500,
                "grid_size": 150,
                "regions": REGIONS,
            },
        )
        print(f"  + battle map {battle_map['id']}")
    map_id = battle_map["id"]

    # 5. Live table state — fog on, one region revealed, tokens, atmosphere.
    _req(
        "PATCH",
        f"{api}/sessions/{sid}/table",
        email,
        {
            "active_map_id": map_id,
            "fog_on": True,
            "revealed_region_ids": ["floor"],
            "tokens": TOKENS,
            "darkness": 0.32,
            "title": "The Wyrmrest Tavern",
        },
    )
    print("  ✓ table state set")

    table_url = f"{args.frontend.rstrip('/')}/table/{sid}" if args.frontend else f"/table/{sid}"
    print("\n─────────────────────────────────────────────")
    print(f"  Session id : {sid}")
    print(f"  Table View : {table_url}")
    print("  Console     : open the demo campaign → session → HUD → 🗺 Table")
    print("─────────────────────────────────────────────")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
