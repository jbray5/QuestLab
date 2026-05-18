"""Seed The Severance — create the 5 player characters via the deployed API.

One-shot. Run after Plan 36 + character-sheet review.

Pipeline for each PC:
    1. POST /api/campaigns/{cid}/characters     -> create with skills+feats
    2. PATCH /api/characters/{pid}              -> starting gp (not in Create)
    3. POST /api/characters/{pid}/spells (xN)   -> learn each spell
    4. POST /api/characters/{pid}/inventory(xN) -> add each item

Before running:
    1. Fill in the five ``player_name`` slots in PCS below.
    2. Confirm the campaign UUID is correct (default: The Severance).
    3. Optionally dry-run first.

Auth: passes the DM email through the trusted identity header
(``X-MS-CLIENT-PRINCIPAL-NAME``). The deployed API reads the same header.

Idempotency: pre-flight refuses if the campaign already has PCs (unless
--force). Spell + inventory adds are idempotent server-side.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
HTTP_TIMEOUT = 60  # Render free tier cold-start can stretch the first call.

# Replace player_name values with real player names before running.
# Spells: tuples of (name, prepared). known is always True for L1 PCs.
# Inventory: tuples of (name, quantity, equipped).
PCS: list[dict] = [
    {
        "player_name": "Player 1",
        "character_name": "Warlock (TBN)",
        "race": "Elf (Drow)",
        "character_class": "Warlock",
        "level": 1,
        "background": "Wayfarer",
        "alignment": None,
        "score_str": 8, "score_dex": 14, "score_con": 13,
        "score_int": 12, "score_wis": 12, "score_cha": 16,
        "hp_max": 9, "hp_current": 9, "ac": 13, "speed": 30,
        "saving_throw_proficiencies": ["WIS", "CHA"],
        "feats": ["Lucky"],
        "skill_proficiencies": {
            "Arcana": 1, "Deception": 1, "Insight": 1,
            "Perception": 1, "Stealth": 1,
        },
        "spells_to_learn": [
            ("Eldritch Blast", True),
            ("Prestidigitation", True),
            ("Dancing Lights", True),
            ("Find Familiar", True),
            ("Charm Person", True),
            ("Hex", True),
        ],
        "inventory_to_add": [
            ("Dagger", 2, True),
            ("Quarterstaff", 1, False),
        ],
        "notes": (
            "Pact of the Chain at L1 — in 2024 PHB, Pact of the Chain is an "
            "Eldritch Invocation with an L2 prereq. Treat as flavor (Find "
            "Familiar is a free Warlock spell anyway) or swap to a real L1 "
            "invocation. Cantrips: 3 listed; Warlock L1 has 2 cantrips known."
        ),
    },
    {
        "player_name": "Player 2",
        "character_name": "Nya",
        "race": "Human",
        "character_class": "Sorcerer",
        "level": 1,
        "background": "Charlatan",
        "alignment": None,
        "score_str": 10, "score_dex": 14, "score_con": 15,
        "score_int": 8, "score_wis": 12, "score_cha": 16,
        "hp_max": 10, "hp_current": 10, "ac": 12, "speed": 30,
        "saving_throw_proficiencies": ["CON", "CHA"],
        "feats": ["Skilled", "Tough"],
        "skill_proficiencies": {
            "Deception": 1, "Insight": 1, "Persuasion": 1,
            "Sleight of Hand": 1,
        },
        "spells_to_learn": [
            ("Mending", True),
            ("Prestidigitation", True),
            ("Shocking Grasp", True),
            ("Sorcerous Burst", True),
            ("Burning Hands", True),
            ("Detect Magic", True),
        ],
        "inventory_to_add": [
            ("Dagger", 2, True),
        ],
        "backstory": (
            "Mother murdered when she was young; raised by an assassin lord. "
            "Sorcerer father somewhere in her past. On the run."
        ),
        "notes": (
            "Sheet listed saves as DEX+CON; corrected to CON+CHA per "
            "Sorcerer 2024 RAW. HP 10 assumes Tough (+2)."
        ),
    },
    {
        "player_name": "Player 3",
        "character_name": "Rogue (TBN)",
        "race": "Elf (Wood)",
        "character_class": "Rogue",
        "level": 1,
        "background": "Wayfarer",
        "alignment": None,
        "score_str": 12, "score_dex": 16, "score_con": 13,
        "score_int": 14, "score_wis": 12, "score_cha": 8,
        "hp_max": 9, "hp_current": 9, "ac": 14, "speed": 35,
        "saving_throw_proficiencies": ["DEX", "INT"],
        "feats": ["Lucky"],
        "skill_proficiencies": {
            "Acrobatics": 1, "Insight": 1, "Investigation": 1,
            "Perception": 1, "Sleight of Hand": 2, "Stealth": 2,
        },
        "spells_to_learn": [],
        "inventory_to_add": [
            ("Shortbow", 1, True),
            ("Shortsword", 1, True),
            ("Dagger", 2, False),
        ],
        "notes": "Expertise: Sleight of Hand, Stealth. Sneak Attack 1d6.",
    },
    {
        "player_name": "Player 4",
        "character_name": "Creed Ashmantle",
        "race": "Dragonborn",
        "character_class": "Paladin",
        "level": 1,
        "background": "Noble",
        "alignment": "Lawful Neutral",
        "score_str": 16, "score_dex": 10, "score_con": 13,
        "score_int": 10, "score_wis": 12, "score_cha": 14,
        "hp_max": 11, "hp_current": 11, "ac": 18, "speed": 30,
        "saving_throw_proficiencies": ["WIS", "CHA"],
        "feats": ["Skilled"],
        "skill_proficiencies": {
            "Athletics": 1, "History": 1, "Intimidation": 1, "Persuasion": 1,
        },
        "spells_to_learn": [
            ("Command", True),
            ("Searing Smite", True),
        ],
        "inventory_to_add": [
            ("Longsword", 1, True),
        ],
        "notes": (
            "Chain mail + shield = AC 18 (armor + shield not in items "
            "catalog — track manually). Weapon Mastery: Longsword (Sap). "
            "Species: Fire breath weapon, Fire resistance, Darkvision."
        ),
    },
    {
        "player_name": "Player 5",
        "character_name": "Willa Thornwood",
        "race": "Aasimar",
        "character_class": "Druid",
        "level": 1,
        "background": "Sage",
        "alignment": "Chaotic Neutral",
        "score_str": 8, "score_dex": 12, "score_con": 14,
        "score_int": 15, "score_wis": 16, "score_cha": 10,
        "hp_max": 10, "hp_current": 10, "ac": 12, "speed": 30,
        "saving_throw_proficiencies": ["INT", "WIS"],
        "feats": ["Magic Initiate"],
        "skill_proficiencies": {
            "Arcana": 1, "History": 1, "Nature": 1, "Perception": 1,
        },
        "spells_to_learn": [
            ("Druidcraft", True),
            ("Produce Flame", True),
            ("Light", True),
            ("Animal Friendship", True),
            ("Cure Wounds", True),
            ("Faerie Fire", True),
            ("Thunderwave", True),
        ],
        "inventory_to_add": [
            ("Scimitar", 1, True),
            ("Quarterstaff", 1, False),
        ],
        "notes": (
            "Primal Order: Warden. Sage normally grants Magic Initiate "
            "(Wizard) — player took Magic Initiate (Druid) for the bonus "
            "Druid cantrip. DM-approved swap. Aasimar: Celestial Resistance "
            "(necrotic + radiant), Darkvision, Healing Hands. Leather armor "
            "and Druidic Focus tracked manually (not in items catalog)."
        ),
    },
]

GP_PER_PC = [31, 43, 24, 38, 17]


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


def _existing_pc_count(api_base: str, campaign_id: str, dm_email: str) -> int:
    """GET the campaign's current PC list and return its length."""
    url = f"{api_base.rstrip('/')}/campaigns/{campaign_id}/characters"
    pcs = _request(url, method="GET", dm_email=dm_email)
    return len(pcs) if isinstance(pcs, list) else 0


def _lookup_spell_id(api_base: str, dm_email: str, name: str) -> Optional[str]:
    """Resolve a spell name to its catalog UUID. Returns None on miss."""
    qs = urllib.parse.urlencode({"q": name})
    url = f"{api_base.rstrip('/')}/spells?{qs}"
    try:
        hits = _request(url, method="GET", dm_email=dm_email)
    except Exception:
        return None
    if not isinstance(hits, list):
        return None
    target = name.casefold()
    for s in hits:
        if str(s.get("name", "")).casefold() == target:
            return s.get("id")
    return None


def _lookup_item_id(api_base: str, dm_email: str, name: str) -> Optional[str]:
    """Resolve an item name to its catalog UUID, trying /items then /weapons."""
    target = name.casefold()
    for path in ("items", "weapons"):
        qs = urllib.parse.urlencode({"q": name})
        url = f"{api_base.rstrip('/')}/{path}?{qs}"
        try:
            hits = _request(url, method="GET", dm_email=dm_email)
        except Exception:
            continue
        if not isinstance(hits, list):
            continue
        for it in hits:
            if str(it.get("name", "")).casefold() == target:
                return it.get("id")
    return None


def _create_pc(
    api_base: str, campaign_id: str, dm_email: str, pc: dict
) -> Optional[str]:
    """POST a PC and return its UUID, or None on failure."""
    label = f"{pc['character_name']} ({pc['race']} {pc['character_class']})"
    # Strip script-only keys before sending.
    body = {k: v for k, v in pc.items() if k not in ("spells_to_learn", "inventory_to_add")}
    body["campaign_id"] = campaign_id
    url = f"{api_base.rstrip('/')}/campaigns/{campaign_id}/characters"
    try:
        created = _request(url, method="POST", dm_email=dm_email, body=body)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode()[:300]
        print(f"        FAIL POST PC — HTTP {exc.code}: {detail}")
        return None
    except Exception as exc:
        print(f"        FAIL POST PC — {type(exc).__name__}: {exc}")
        return None
    pid = created.get("id")
    print(f"  OK   {label} -> {pid}")
    return pid


def _patch_gp(api_base: str, dm_email: str, pc_id: str, gp: int) -> None:
    """PATCH starting gp onto a PC (currency isn't in PlayerCharacterCreate)."""
    url = f"{api_base.rstrip('/')}/characters/{pc_id}"
    try:
        _request(url, method="PATCH", dm_email=dm_email, body={"gp": gp})
        print(f"        gp={gp}")
    except Exception as exc:
        print(f"        (gp PATCH failed: {exc})")


def _learn_spells(
    api_base: str, dm_email: str, pc_id: str, spells: list[tuple[str, bool]]
) -> None:
    """Look up + POST each spell. Misses are logged and skipped."""
    if not spells:
        return
    base = f"{api_base.rstrip('/')}/characters/{pc_id}/spells"
    hits, misses = 0, []
    for name, prepared in spells:
        spell_id = _lookup_spell_id(api_base, dm_email, name)
        if spell_id is None:
            misses.append(name)
            continue
        body = {"spell_id": spell_id, "known": True, "prepared": prepared}
        try:
            _request(base, method="POST", dm_email=dm_email, body=body)
            hits += 1
        except Exception as exc:
            print(f"        spell '{name}' POST failed: {exc}")
    msg = f"        spells: {hits}/{len(spells)} added"
    if misses:
        msg += f" (catalog miss: {', '.join(misses)})"
    print(msg)


def _add_inventory(
    api_base: str, dm_email: str, pc_id: str, items: list[tuple[str, int, bool]]
) -> None:
    """Look up + POST each item. Misses are logged and skipped."""
    if not items:
        return
    base = f"{api_base.rstrip('/')}/characters/{pc_id}/inventory"
    hits, misses = 0, []
    for name, qty, equipped in items:
        item_id = _lookup_item_id(api_base, dm_email, name)
        if item_id is None:
            misses.append(name)
            continue
        body = {"item_id": item_id, "quantity": qty, "equipped": equipped, "attuned": False}
        try:
            _request(base, method="POST", dm_email=dm_email, body=body)
            hits += 1
        except Exception as exc:
            print(f"        item '{name}' POST failed: {exc}")
    msg = f"        inventory: {hits}/{len(items)} added"
    if misses:
        msg += f" (catalog miss: {', '.join(misses)})"
    print(msg)


def main() -> int:
    """Parse args, validate, and seed each PC."""
    p = argparse.ArgumentParser(description="Seed The Severance PCs.")
    p.add_argument(
        "--api-base",
        default=os.environ.get("QUESTLAB_API_BASE", DEFAULT_API_BASE),
        help=f"Base URL of the QuestLab API (default: {DEFAULT_API_BASE})",
    )
    p.add_argument(
        "--dm-email",
        default=os.environ.get("CURRENT_USER_EMAIL"),
        help="DM identity (sent as the trusted identity header).",
    )
    p.add_argument(
        "--campaign-id",
        default=DEFAULT_CAMPAIGN_ID,
        help=f"Campaign UUID (default: The Severance, {DEFAULT_CAMPAIGN_ID})",
    )
    p.add_argument("--dry-run", action="store_true", help="Preview, don't POST.")
    p.add_argument(
        "--force",
        action="store_true",
        help="Seed even if the campaign already has PCs (default: refuse).",
    )
    args = p.parse_args()

    if not args.dm_email:
        print("error: pass --dm-email or set CURRENT_USER_EMAIL.", file=sys.stderr)
        return 2

    print(f"API      : {args.api_base}")
    print(f"Campaign : {args.campaign_id}")
    print(f"DM       : {args.dm_email}")
    print(f"PCs      : {len(PCS)}")
    print()

    if not args.dry_run:
        try:
            existing = _existing_pc_count(args.api_base, args.campaign_id, args.dm_email)
        except urllib.error.HTTPError as exc:
            print(f"Pre-flight GET failed (HTTP {exc.code}): {exc.read().decode()[:300]}")
            return 1
        except Exception as exc:
            print(f"Pre-flight GET failed: {type(exc).__name__}: {exc}")
            return 1

        if existing > 0 and not args.force:
            print(
                f"refusing: campaign already has {existing} PC(s). "
                "Pass --force to add anyway (will create duplicates)."
            )
            return 1

    failures = 0
    for i, pc in enumerate(PCS, start=1):
        gp = GP_PER_PC[i - 1]
        label = f"{pc['character_name']} ({pc['race']} {pc['character_class']})"
        print(f"[{i}/5] {label}")

        if args.dry_run:
            print(f"        DRY  would POST + add {len(pc['spells_to_learn'])} spells "
                  f"+ {len(pc['inventory_to_add'])} items, gp={gp}")
            continue

        pc_id = _create_pc(args.api_base, args.campaign_id, args.dm_email, pc)
        if pc_id is None:
            failures += 1
            continue
        _patch_gp(args.api_base, args.dm_email, pc_id, gp)
        _learn_spells(args.api_base, args.dm_email, pc_id, pc["spells_to_learn"])
        _add_inventory(args.api_base, args.dm_email, pc_id, pc["inventory_to_add"])

    print()
    if failures == 0:
        print("Done — open the campaign in QuestLab to verify.")
        return 0
    print(f"Done with {failures} failure(s). Investigate before re-running.")
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
