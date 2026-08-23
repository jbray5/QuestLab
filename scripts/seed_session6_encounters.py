"""Seed Session 6 encounters: the Restwater fight + optional creature pools.

The DM loads an encounter to put monsters (with HP tracking) on the board.

1. RESTWATER — the boss fight. 1x Green Hag (already in the catalog; the
   2024 MM numbers match the handoff exactly: AC 17, HP 82). dm_notes
   carry the run-state and point at the Restwater Companion.
2. THE CROSSING (OPTIONAL) — the handoff's "may or may not be used"
   creatures. The catalog lacks them, so this seeds the SRD 5.1 stat
   blocks first (transcribed published stats — no homebrew): Giant
   Octopus, Plesiosaurus, Hunter Shark, Giant Shark, Giant Sea Horse.
3. THE BEACH (OPTIONAL) — small crab-things run as SRD Giant Crabs
   (closest published block; swap freely at the table).

No encounter for the Ring: the handoff gives the champion no stats by
design — that fight is adjudicated, not rostered.

Idempotent: monsters and encounters are matched by name and skipped.

Usage:
    python scripts/seed_session6_encounters.py --dm-email you@example.com [--dry-run]
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.parse
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

import httpx  # noqa: E402

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_ADVENTURE_ID = "ee3d7a70-4a01-4b9b-b026-f5415146b3bc"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"

# SRD 5.1 stat blocks, transcribed (CC-BY-4.0). Same dict shape as
# integrations/dnd_rules/stat_blocks.py.
SRD_SEA_CREATURES: list[dict] = [
    {
        "name": "Giant Octopus",
        "size": "Large",
        "creature_type": "Beast",
        "alignment": "unaligned",
        "ac": 11,
        "hp_average": 52,
        "hp_formula": "8d10+8",
        "speed": {"walk": 10, "swim": 60},
        "score_str": 17,
        "score_dex": 13,
        "score_con": 13,
        "score_int": 4,
        "score_wis": 10,
        "score_cha": 4,
        "skills": {"Perception": 4, "Stealth": 5},
        "senses": {"darkvision": 60, "passive_perception": 14},
        "challenge_rating": "1",
        "xp": 200,
        "proficiency_bonus": 2,
        "traits": [
            {"name": "Hold Breath", "desc": "Out of water, it can hold its breath for 1 hour."},
            {
                "name": "Underwater Camouflage",
                "desc": "Advantage on Stealth checks made while underwater.",
            },
            {"name": "Water Breathing", "desc": "Can breathe only underwater."},
        ],
        "actions": [
            {
                "name": "Tentacles",
                "desc": "+5 to hit, reach 15 ft. 10 (2d6+3) bludgeoning; target is grappled "
                "(escape DC 16) and restrained. Ink Cloud (recharges after rest): 20-ft "
                "radius cloud, then Dash as bonus action.",
            }
        ],
    },
    {
        "name": "Plesiosaurus",
        "size": "Large",
        "creature_type": "Beast",
        "alignment": "unaligned",
        "ac": 13,
        "ac_notes": "natural armor",
        "hp_average": 68,
        "hp_formula": "8d10+24",
        "speed": {"walk": 20, "swim": 40},
        "score_str": 18,
        "score_dex": 15,
        "score_con": 16,
        "score_int": 2,
        "score_wis": 12,
        "score_cha": 5,
        "skills": {"Perception": 3, "Stealth": 4},
        "senses": {"passive_perception": 13},
        "challenge_rating": "2",
        "xp": 450,
        "proficiency_bonus": 2,
        "traits": [{"name": "Hold Breath", "desc": "Can hold its breath for 1 hour."}],
        "actions": [{"name": "Bite", "desc": "+6 to hit, reach 10 ft. 14 (3d6+4) piercing."}],
    },
    {
        "name": "Hunter Shark",
        "size": "Large",
        "creature_type": "Beast",
        "alignment": "unaligned",
        "ac": 12,
        "ac_notes": "natural armor",
        "hp_average": 45,
        "hp_formula": "6d10+12",
        "speed": {"walk": 0, "swim": 40},
        "score_str": 18,
        "score_dex": 13,
        "score_con": 15,
        "score_int": 1,
        "score_wis": 10,
        "score_cha": 4,
        "skills": {"Perception": 2},
        "senses": {"blindsight": 30, "passive_perception": 12},
        "challenge_rating": "2",
        "xp": 450,
        "proficiency_bonus": 2,
        "traits": [
            {
                "name": "Blood Frenzy",
                "desc": "Advantage on melee attacks against creatures missing HP.",
            },
            {"name": "Water Breathing", "desc": "Can breathe only underwater."},
        ],
        "actions": [{"name": "Bite", "desc": "+6 to hit. 13 (2d8+4) piercing."}],
    },
    {
        "name": "Giant Shark",
        "size": "Huge",
        "creature_type": "Beast",
        "alignment": "unaligned",
        "ac": 13,
        "ac_notes": "natural armor",
        "hp_average": 126,
        "hp_formula": "11d12+55",
        "speed": {"walk": 0, "swim": 50},
        "score_str": 23,
        "score_dex": 11,
        "score_con": 21,
        "score_int": 1,
        "score_wis": 10,
        "score_cha": 5,
        "skills": {"Perception": 3},
        "senses": {"blindsight": 60, "passive_perception": 13},
        "challenge_rating": "5",
        "xp": 1800,
        "proficiency_bonus": 3,
        "traits": [
            {
                "name": "Blood Frenzy",
                "desc": "Advantage on melee attacks against creatures missing HP.",
            },
            {"name": "Water Breathing", "desc": "Can breathe only underwater."},
        ],
        "actions": [{"name": "Bite", "desc": "+9 to hit. 22 (3d10+6) piercing."}],
    },
    {
        "name": "Giant Sea Horse",
        "size": "Large",
        "creature_type": "Beast",
        "alignment": "unaligned",
        "ac": 13,
        "ac_notes": "natural armor",
        "hp_average": 16,
        "hp_formula": "3d10",
        "speed": {"walk": 0, "swim": 40},
        "score_str": 12,
        "score_dex": 15,
        "score_con": 11,
        "score_int": 2,
        "score_wis": 12,
        "score_cha": 5,
        "senses": {"passive_perception": 11},
        "challenge_rating": "1/2",
        "xp": 100,
        "proficiency_bonus": 2,
        "traits": [
            {
                "name": "Charge",
                "desc": "If it moves 20+ ft straight toward a target and hits with Ram, "
                "+7 (2d6) extra bludgeoning and DC 11 STR save or knocked prone.",
            },
            {"name": "Water Breathing", "desc": "Can breathe only underwater."},
        ],
        "actions": [{"name": "Ram", "desc": "+3 to hit. 4 (1d6+1) bludgeoning."}],
    },
    {
        "name": "Giant Crab",
        "size": "Medium",
        "creature_type": "Beast",
        "alignment": "unaligned",
        "ac": 15,
        "ac_notes": "natural armor",
        "hp_average": 13,
        "hp_formula": "3d8",
        "speed": {"walk": 30, "swim": 30},
        "score_str": 13,
        "score_dex": 15,
        "score_con": 11,
        "score_int": 1,
        "score_wis": 9,
        "score_cha": 3,
        "skills": {"Stealth": 4},
        "senses": {"blindsight": 30, "passive_perception": 9},
        "challenge_rating": "1/8",
        "xp": 25,
        "proficiency_bonus": 2,
        "traits": [{"name": "Amphibious", "desc": "Can breathe air and water."}],
        "actions": [
            {
                "name": "Claw",
                "desc": "+3 to hit. 4 (1d6+1) bludgeoning; target is grappled (escape DC 11). "
                "The crab has two claws, each of which can grapple one target.",
            }
        ],
    },
]


def _get(api: str, headers: dict, path: str):
    """GET JSON."""
    r = httpx.get(f"{api}/{path.lstrip('/')}", headers=headers, timeout=120.0)
    r.raise_for_status()
    return r.json()


def _monster_id(api: str, headers: dict, name: str) -> str | None:
    """Look up a monster id by exact name."""
    qs = urllib.parse.urlencode({"search": name})
    for m in _get(api, headers, f"monsters?{qs}"):
        if str(m.get("name", "")).casefold() == name.casefold():
            return m["id"]
    return None


def main() -> int:
    """Seed the monsters and the three encounters."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--adventure-id", default=DEFAULT_ADVENTURE_ID)
    parser.add_argument("--dm-email", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    headers = {AUTH_HEADER: args.dm_email}
    api = args.api_base

    # ── 1. Ensure the sea-creature stat blocks ────────────────────────────
    ids: dict[str, str] = {}
    for block in SRD_SEA_CREATURES:
        existing = _monster_id(api, headers, block["name"])
        if existing:
            ids[block["name"]] = existing
            print(f"  · {block['name']} already in catalog")
            continue
        if args.dry_run:
            print(f"  [dry-run] would create monster {block['name']}")
            continue
        body = {**block, "source": "SRD 5.1", "is_custom": True}
        r = httpx.post(f"{api}/monsters", headers=headers, json=body, timeout=60.0)
        if r.status_code >= 400:
            print(f"  ✗ {block['name']} failed: {r.status_code} {r.text[:200]}")
            continue
        ids[block["name"]] = r.json()["id"]
        print(f"  ✓ {block['name']} created")

    hag_id = _monster_id(api, headers, "Green Hag")
    if hag_id is None:
        print("  ✗ Green Hag not found in the catalog — Restwater encounter skipped")

    # ── 2. Encounters ─────────────────────────────────────────────────────
    existing_enc = {
        e["name"] for e in _get(api, headers, f"adventures/{args.adventure_id}/encounters")
    }
    encounters: list[dict] = []
    if hag_id:
        encounters.append(
            {
                "name": "Restwater",
                "description": "The bathhouse boss fight (destination A). Run it from the "
                "Restwater Companion — /campaigns/{id}/restwater.",
                "monster_roster": [{"monster_id": hag_id, "count": 1}],
                "dm_notes": "AUNTIE SORREL = Green Hag. Run-state: AC 17, HP 82, Init +1. "
                "Regen +10/turn while POOLS FULL; cannot drop below 1 HP while POOLS "
                "FULL. Claw +6, 13 (2d8+4) slashing — one Claw in P1, two from P2. "
                "Phases by cumulative damage dealt: P2 at 30, P3 at 60 OR pools "
                "drained. House actions (init 20, one/round, P3): companion has them. "
                "Spring-gate: 2 creatures, same round, STR DC 12 each (DC 10 variant), "
                "or cold iron knife = auto. Allies: Mira AC 15 HP 20 (COMPROMISED "
                "until drain), Edrik bedridden HP 15, The Welcome AC 13 HP 12 "
                "(Recite 1/fight), staff x3 AC 11 HP 9 (never targeted).",
            }
        )
    crossing_roster = [
        ("Giant Octopus", 1),
        ("Plesiosaurus", 1),
        ("Hunter Shark", 1),
        ("Giant Shark", 1),
        ("Giant Sea Horse", 3),
    ]
    if all(name in ids for name, _ in crossing_roster):
        encounters.append(
            {
                "name": "The Crossing (optional)",
                "description": "No scheduled combat — this is the creature pool if the "
                "crossing goes loud. Use any subset.",
                "monster_roster": [
                    {"monster_id": ids[name], "count": count} for name, count in crossing_roster
                ],
                "dm_notes": "Sea horses are Large and rideable. Token tray for all of "
                "these is already parked on the Session 6 table.",
            }
        )
    if "Giant Crab" in ids:
        encounters.append(
            {
                "name": "The Beach (optional)",
                "description": "Opener skirmish: small crab-things, runnable without a board.",
                "monster_roster": [{"monster_id": ids["Giant Crab"], "count": 3}],
                "dm_notes": "Run as SRD Giant Crabs (closest published block) — reskin "
                "freely at the table.",
            }
        )

    for enc in encounters:
        if enc["name"] in existing_enc:
            print(f"  · encounter '{enc['name']}' already exists")
            continue
        if args.dry_run:
            print(f"  [dry-run] would create encounter '{enc['name']}'")
            continue
        r = httpx.post(
            f"{api}/adventures/{args.adventure_id}/encounters",
            headers=headers,
            json=enc,
            timeout=60.0,
        )
        if r.status_code >= 400:
            print(f"  ✗ '{enc['name']}' failed: {r.status_code} {r.text[:300]}")
            continue
        print(f"  ✓ encounter '{enc['name']}' created ({json.dumps(enc['monster_roster'])})")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
