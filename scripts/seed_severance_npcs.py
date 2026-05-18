"""Seed the four Hearth-and-Hollow NPCs into The Severance campaign.

One-shot. Posts each NPC to the campaign and then PATCHes the adventure's
``npc_roster`` to a denormalized snapshot the runbook generator reads.

Run:
    python scripts/seed_severance_npcs.py --dm-email justinray5@outlook.com

Idempotent? No — running twice creates duplicate NPC rows. Pre-flight
refuses if the campaign already has NPCs unless --force is passed.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any, Optional

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
DEFAULT_ADVENTURE_ID = "ee3d7a70-4a01-4b9b-b026-f5415146b3bc"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
HTTP_TIMEOUT = 60

# Each NPC's notes ends with an `**Accent:**` line so the table-voice cue
# shows up on the NPC card during the session.
NPCS: list[dict] = [
    {
        "name": "Priestess Yelvyne",
        "role": "Steward of the Lantern Shrine",
        "race": "Human",
        "gender": "Female",
        "age": "late 60s",
        "appearance": (
            "Stoop-shouldered woman in faded green-and-gold vestments. A "
            "lantern pendant at her throat flickers in time with the shrine. "
            "Hands stained with shrine-oil and lichen."
        ),
        "personality": (
            "Patient and slow-speaking; her warmth conceals a stubborn "
            "certainty. Treats the shrine as if it were a family member, "
            "not an artifact."
        ),
        "motivation": (
            "Preserve the Lantern Shrine and the village's tie to the "
            "Feywild — at any cost."
        ),
        "secret": (
            "Her predecessor walked into the shrine and never came out. "
            "She fears the bargain will eventually come for her too."
        ),
        "dialog_hooks": [
            "The light is older than Hollowmere. It is older than my grandmother's grandmother's name for it.",
            "If the shrine goes dark, the village goes with it. Some night, eventually. That is the bargain.",
            "Wenneth speaks like a fool dressed in branches. Do not listen to her at the cost of the village.",
        ],
        "tags": ["lantern circle", "session 1", "moral pole - preserve"],
        "location": "Hollowmere — Lantern Shrine grounds",
        "notes": (
            "Moral pole — preserve. Play warm but immovable; not a villain, has "
            "real reasons.\n\n**Accent:** Welsh village elder. Slow, deliberate, "
            "slight quaver from age; pitch slightly below your natural voice. "
            "Long vowels on important words ('the liiight'). One-beat pause "
            "before 'Hollowmere' every time."
        ),
    },
    {
        "name": "Wenneth",
        "role": "Dryad of the Hollowmere copse",
        "race": "Dryad (Fey)",
        "gender": "Female",
        "age": "uncountable; appears mid-30s",
        "appearance": (
            "Tall and willow-thin, bark-knot hair, mossy eyes. Smells "
            "faintly of rain on warm stone. Stays barefoot even on the "
            "tavern's wooden floors. Skin shimmers in shrine-light."
        ),
        "personality": (
            "Wry, mournful, casually unsettling. Speaks in present tense "
            "even of dead things. Doesn't quite get how humans count days."
        ),
        "motivation": (
            "End the severance pain in her grove — even if it means "
            "letting the shrine die."
        ),
        "secret": (
            "Her own tree is one of the anchors. She physically feels every "
            "severance as a friend ceasing to breathe, and has been hiding "
            "the deterioration for months."
        ),
        "dialog_hooks": [
            "The bonds do not hold us close. They hold us still. Stillness is not life.",
            "Yelvyne loves the shrine the way a child loves a sick dog — by refusing to see it suffer.",
            "If you ask me to choose: let it go. The Feywild does not need a leash.",
        ],
        "tags": ["fey", "lantern circle", "session 1", "moral pole - sever"],
        "location": "Hollowmere — tavern (initially), copse outside village",
        "notes": (
            "Moral pole — sever. Visibly wilts the moment the shrine severs "
            "in Act 2.\n\n**Accent:** Soft Irish lilt slowed by ~30%. Breathy. "
            "Tiny half-second delays mid-sentence ('The bonds do not — hold "
            "us close.'). Never blinks during dialog. Imagine you just "
            "realized you have a body."
        ),
    },
    {
        "name": "Belva",
        "role": "Owner-bartender of The Hollow Drum",
        "race": "Halfling",
        "gender": "Female",
        "age": "50s",
        "appearance": (
            "Apron always damp. Two pencils stuck in her gray-streaked "
            "hair. Missing the top half of one ear — a story she won't "
            "tell. Voice that carries across a crowded room."
        ),
        "personality": (
            "Brassy, kind, nosier than she admits. Remembers what everyone "
            "drinks and what they owe."
        ),
        "motivation": (
            "Keep her tavern open and her people fed. Loves the village "
            "like a cranky aunt."
        ),
        "secret": (
            "She rented her loft to the recruiter three nights ago for "
            "old coin 'that don't tarnish.' She's starting to regret the "
            "silence."
        ),
        "dialog_hooks": [
            "First round's on me 'cause you look like you've ridden a long way — second round, you pay double, friend.",
            "Wenneth? Comes in for cider every fortnight. Says less than a stone but listens like one.",
            "Aye, I rented the loft. He paid in old coin. The kind that don't tarnish. Don't ask me again.",
        ],
        "tags": ["session 1", "tavern", "intel"],
        "location": "Hollowmere — The Hollow Drum tavern",
        "notes": (
            "Human anchor of the session. Drops a tankard the instant the "
            "shrine darkens — use her to seed warmth so the loss has "
            "stakes. Only reveals the loft secret if PCs press.\n\n"
            "**Accent:** Brassy working-class — Cockney or Bronx barkeep, "
            "pick one. Volume up 20%. Drops her t's ('li'l', 'wha'?'). "
            "Calls everyone 'love' or 'duck.' Slams things on the bar to "
            "punctuate jokes. When startled, the accent SLIPS one syllable "
            "into something else and snaps back — tell that she's not from "
            "here originally."
        ),
    },
    {
        "name": "Master Halve",
        "role": "The recruiter — calls himself a 'concerned scholar'",
        "race": "Unknown (presents as Human)",
        "gender": "Male",
        "age": "ageless; looks 40-something",
        "appearance": (
            "Slate-gray traveling coat. Gloves he never removes. Eyes the "
            "same shade as old ice. Speaks with a precision that makes "
            "every word sound chosen. Walks without sound."
        ),
        "personality": (
            "Polite to the point of menace. Listens longer than he speaks. "
            "Treats each PC like a piece on a board he's already won."
        ),
        "motivation": (
            "Identify which PCs will agree to sever shrines when the time "
            "comes. He's testing them, not yet recruiting them."
        ),
        "secret": (
            "Agent of whatever-is-doing-the-severing. Not the wielder, but "
            "he chooses the targets. He recognized something specific in "
            "each of the 5 PCs that made them useful."
        ),
        "dialog_hooks": [
            "You came because I asked. That is the first decision you have made this evening. Notice it.",
            "Some lights should be put out. Some lights ARE being put out. The question is who decides — the dying light, or someone who can still see.",
            "Hollowmere is a small place. A very small place. After tonight, it will be smaller.",
        ],
        "tags": ["session 1", "antagonist - cipher", "lantern circle - hidden"],
        "location": "Hollowmere — The Hollow Drum tavern (loft)",
        "notes": (
            "Campaign cipher. Does NOT engage in combat in session 1 — "
            "vanishes before the corrupted fey arrive. Call each PC out by "
            "something only they would know (Warlock's patron silence, "
            "Rogue's fey kin, Nya's mother, Creed's oath, Willa's reading). "
            "Reveals: 0. Suspicions: 100.\n\n**Accent:** Hannibal Lecter "
            "calm — crisp, low-volume, hyper-precise. No regional accent at "
            "all. Every consonant clipped. Never raises pitch even on "
            "questions. Holds eye contact two beats too long after a "
            "sentence ends. Pauses before names ('Wayfair…er. Yes.'). "
            "Speak QUIETER than feels natural so they lean in."
        ),
    },
]


def _request(
    url: str,
    *,
    method: str,
    dm_email: str,
    body: Optional[dict] = None,
) -> Any:
    """Send a JSON HTTP request and parse the JSON response."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            AUTH_HEADER: dm_email,
        },
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else {}


def main() -> int:
    """Parse args, POST each NPC, then PATCH the adventure roster."""
    p = argparse.ArgumentParser(description="Seed The Severance NPCs.")
    p.add_argument("--api-base", default=os.environ.get("QUESTLAB_API_BASE", DEFAULT_API_BASE))
    p.add_argument("--dm-email", default=os.environ.get("CURRENT_USER_EMAIL"))
    p.add_argument("--campaign-id", default=DEFAULT_CAMPAIGN_ID)
    p.add_argument("--adventure-id", default=DEFAULT_ADVENTURE_ID)
    p.add_argument("--dry-run", action="store_true")
    p.add_argument("--force", action="store_true")
    args = p.parse_args()

    if not args.dm_email:
        print("error: pass --dm-email or set CURRENT_USER_EMAIL.", file=sys.stderr)
        return 2

    base = args.api_base.rstrip("/")
    npc_list_url = f"{base}/campaigns/{args.campaign_id}/npcs"
    adv_url = f"{base}/adventures/{args.adventure_id}"

    print(f"API       : {args.api_base}")
    print(f"Campaign  : {args.campaign_id}")
    print(f"Adventure : {args.adventure_id}")
    print(f"DM        : {args.dm_email}")
    print(f"NPCs      : {len(NPCS)}")
    print()

    if not args.dry_run:
        try:
            existing = _request(npc_list_url, method="GET", dm_email=args.dm_email)
        except urllib.error.HTTPError as exc:
            print(f"Pre-flight GET failed (HTTP {exc.code}): {exc.read().decode()[:300]}")
            return 1
        if isinstance(existing, list) and existing and not args.force:
            print(
                f"refusing: campaign already has {len(existing)} NPC(s). "
                "Pass --force to add anyway."
            )
            return 1

    created_npcs: list[dict] = []
    failures = 0
    for i, npc in enumerate(NPCS, start=1):
        label = f"{npc['name']} ({npc.get('role', '?')})"
        if args.dry_run:
            print(f"[{i}/{len(NPCS)}] DRY  would POST {label}")
            continue
        try:
            row = _request(npc_list_url, method="POST", dm_email=args.dm_email, body=npc)
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode()[:300]
            print(f"[{i}/{len(NPCS)}] FAIL {label} — HTTP {exc.code}: {detail}")
            failures += 1
            continue
        except Exception as exc:
            print(f"[{i}/{len(NPCS)}] FAIL {label} — {type(exc).__name__}: {exc}")
            failures += 1
            continue
        print(f"[{i}/{len(NPCS)}] OK   {label} -> {row.get('id')}")
        created_npcs.append(row)

    if failures:
        print(f"\n{failures} NPC(s) failed; not updating adventure roster.")
        return 1

    if args.dry_run:
        print("\nDRY  would PATCH adventure npc_roster with denormalized snapshot.")
        return 0

    # The runbook generator reads {name, role, description} per row.
    roster = [
        {
            "name": npc["name"],
            "role": npc["role"],
            "description": npc.get("appearance") or npc.get("personality", ""),
        }
        for npc in created_npcs
    ]
    print(f"\nUpdating adventure roster with {len(roster)} NPC(s)…")
    try:
        _request(adv_url, method="PATCH", dm_email=args.dm_email, body={"npc_roster": roster})
        print("OK — adventure npc_roster set.")
    except Exception as exc:
        print(f"FAIL — adventure PATCH: {exc}")
        return 1

    print("\nDone — runbook regen will now include these NPCs.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
