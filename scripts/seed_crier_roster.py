"""Seed the Town Crier roster for the Severance campaign (Plan 56).

Creates the four NPC posting identities from the Session 5 handoff and
writes a placeholder avatar PNG for each into ``frontend/public/crier-avatars/``.
The DM swaps those files for real art later — same filenames, no DB change.

Idempotent: an identity whose name already exists is updated in place, not
duplicated; an avatar file that already exists is left alone.

Usage::

    python scripts/seed_crier_roster.py                      # avatars + identities
    python scripts/seed_crier_roster.py --avatars-only       # no API calls
    python scripts/seed_crier_roster.py --api http://localhost:8000/api

Channels are deliberately NOT seeded: a webhook URL is a credential and is
pasted in by the DM through the Town Crier page.
"""

from __future__ import annotations

import argparse
import json
import math
import sys
import urllib.error
import urllib.request
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_ROOT = Path(__file__).resolve().parent.parent
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from integrations.image_tools import encode_rgb_png  # noqa: E402

CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
HEADERS = {
    "X-MS-CLIENT-PRINCIPAL-NAME": "justinray5@outlook.com",
    "Content-Type": "application/json",
}
DEFAULT_API = "https://questlab-api-9yhe.onrender.com/api"
# Discord fetches the avatar itself, so this must be an absolute, publicly
# reachable origin — not a relative path and not localhost.
DEFAULT_PUBLIC_BASE = "https://quest-lab-tau.vercel.app"

AVATAR_DIR = _ROOT / "frontend" / "public" / "crier-avatars"
AVATAR_SIZE = 256

# The four seed identities, per the Session 5 handoff. Colours are the
# handoff's own accents.
ROSTER = [
    {
        "name": "The Tallyman",
        "slug": "tallyman",
        # old-honey gold — patchwork-coat peddler, warm lantern light
        "color": 0xC8963E,
        "backdrop": 0x2A1D0E,
        "sort_order": 0,
    },
    {
        "name": "Sister Maren",
        "slug": "maren",
        # parchment — ink-stained hands, candlelit page
        "color": 0xD9C9A3,
        "backdrop": 0x241E14,
        "sort_order": 1,
    },
    {
        "name": "The Lutenist",
        "slug": "lutenist",
        # deep red — a lute and an overconfident feathered cap
        "color": 0x8E2434,
        "backdrop": 0x1E0F12,
        "sort_order": 2,
    },
    {
        "name": "Blackreef Harbor",
        "slug": "blackreef-harbor",
        # sea-slate — the harbor at dusk, narrator identity
        "color": 0x54707F,
        "backdrop": 0x111A1F,
        "sort_order": 3,
    },
]


def _rgb(color: int) -> tuple[int, int, int]:
    """Split a 0xRRGGBB int into its components.

    Args:
        color: Packed colour integer.

    Returns:
        (r, g, b), each 0-255.
    """
    return ((color >> 16) & 0xFF, (color >> 8) & 0xFF, color & 0xFF)


def make_placeholder(color: int, backdrop: int, size: int = AVATAR_SIZE) -> bytes:
    """Render a placeholder avatar: a lit disc on a dark ground.

    Deliberately abstract — colour-coded stand-ins so the DM can tell
    identities apart at a glance in Discord, not portraits. Real art
    replaces the file at the same path.

    Args:
        color: The identity's accent colour, 0xRRGGBB.
        backdrop: The surrounding dark tone, 0xRRGGBB.
        size: Square edge length in pixels.

    Returns:
        PNG bytes.
    """
    cr, cg, cb = _rgb(color)
    br, bg, bb = _rgb(backdrop)
    centre = (size - 1) / 2.0
    radius = size * 0.42

    out = bytearray()
    for y in range(size):
        for x in range(size):
            dist = math.hypot(x - centre, y - centre)
            if dist <= radius:
                # Soft falloff from the centre, like lantern light.
                glow = 0.45 + 0.55 * (1.0 - (dist / radius) ** 2)
                out += bytes((int(cr * glow), int(cg * glow), int(cb * glow)))
            else:
                # A faint halo just outside the disc, then flat backdrop.
                halo = max(0.0, 1.0 - (dist - radius) / (size * 0.10))
                out += bytes(
                    (
                        int(br + (cr - br) * 0.18 * halo),
                        int(bg + (cg - bg) * 0.18 * halo),
                        int(bb + (cb - bb) * 0.18 * halo),
                    )
                )

    return encode_rgb_png(size, size, bytes(out))


def write_avatars() -> None:
    """Write a placeholder PNG for each roster entry.

    Existing files are left alone, so a DM who has already dropped in real
    art does not lose it on a re-run.
    """
    AVATAR_DIR.mkdir(parents=True, exist_ok=True)
    for entry in ROSTER:
        target = AVATAR_DIR / f"{entry['slug']}.png"
        if target.exists():
            print(f"  · {target.name} already exists — left alone")
        else:
            target.write_bytes(make_placeholder(entry["color"], entry["backdrop"]))
            print(f"  + {target.name}")


def _call(api: str, method: str, path: str, payload: dict | None = None):
    """Make one JSON API call.

    Args:
        api: API base URL.
        method: HTTP method.
        path: Path below the API base.
        payload: Optional JSON body.

    Returns:
        The decoded response, or None for empty bodies.

    Raises:
        urllib.error.HTTPError: On a non-2xx response.
    """
    data = json.dumps(payload).encode() if payload is not None else None
    req = urllib.request.Request(f"{api}{path}", data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req) as resp:
        body = resp.read().decode()
    return json.loads(body) if body else None


def seed_identities(api: str, campaign_id: str, public_base: str) -> None:
    """Create or update the four NPC identities.

    Args:
        api: API base URL.
        campaign_id: UUID string of the owning campaign.
        public_base: Absolute origin serving the avatar files.
    """
    existing = {n["name"]: n for n in _call(api, "GET", f"/campaigns/{campaign_id}/crier/npcs")}

    for entry in ROSTER:
        avatar = f"{public_base.rstrip('/')}/crier-avatars/{entry['slug']}.png"
        body = {
            "name": entry["name"],
            "avatar_url": avatar,
            "embed_color": entry["color"],
            "sort_order": entry["sort_order"],
        }
        if entry["name"] in existing:
            _call(api, "PATCH", f"/crier/npcs/{existing[entry['name']]['id']}", body)
            print(f"  ~ {entry['name']} updated")
        else:
            _call(api, "POST", f"/campaigns/{campaign_id}/crier/npcs", body)
            print(f"  + {entry['name']} created")


def main() -> None:
    """Entry point."""
    parser = argparse.ArgumentParser(description="Seed the Town Crier roster.")
    parser.add_argument("--api", default=DEFAULT_API, help="API base URL.")
    parser.add_argument("--campaign", default=CAMPAIGN_ID, help="Campaign UUID.")
    parser.add_argument(
        "--public-base",
        default=DEFAULT_PUBLIC_BASE,
        help="Absolute origin serving frontend/public (Discord must reach it).",
    )
    parser.add_argument(
        "--avatars-only",
        action="store_true",
        help="Write placeholder PNGs and make no API calls.",
    )
    args = parser.parse_args()

    print("Writing placeholder avatars…")
    write_avatars()

    if args.avatars_only:
        print("\nAvatars only — no API calls made.")
        return

    print(f"\nSeeding identities via {args.api} …")
    try:
        seed_identities(args.api, args.campaign, args.public_base)
    except urllib.error.HTTPError as exc:
        print(f"  ! HTTP {exc.code}: {exc.read().decode()[:300]}")
        raise SystemExit(1)

    print("\nDone. Paste your channel webhook URLs in the Town Crier page.")


if __name__ == "__main__":
    main()
