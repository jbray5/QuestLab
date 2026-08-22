"""Level Creed Ashmantle to 3 on the live QuestLab data (Session 5 prep).

Idempotent: GET-then-PATCH/POST/DELETE by natural key. Safe to re-run.

Player-confirmed choices (verified against the 2024 PHB):
    1. Level 2 retcon: drop Blessed Warrior -> the Guidance cantrip (and any
       other Cleric cantrip) comes OFF his spell list.
    2. Fighting Style: Dueling (the 2024 name for "Duelist") — +2 damage
       when wielding a melee weapon in one hand and no other weapons
       (shield is fine). Recorded in ``feats`` (2024 fighting styles are
       feats) and in the notes block.
    3. Level 3: subclass Oath of the Ancients.
       - Channel Divinity: 2 uses (regain one on short rest, all on long).
         Options: Divine Sense (Bonus Action) + Nature's Wrath (Magic
         action; STR save within 15 ft or Restrained 1 min, repeat save
         each turn).
       - Oath spells, always prepared: Ensnaring Strike, Speak with Animals.
    4. Features re-sync so Channel Divinity (Paladin) lands on his sheet.

NOT done here (table decisions):
    - hp_max: rolled at the table. Pass --hp-max to set it once rolled.
    - The extra prepared spell L3 grants (4 prepared vs 3): player's pick.

Usage:
    python scripts/apply_level3_creed.py --dm-email justinray5@outlook.com --dry-run
    python scripts/apply_level3_creed.py --dm-email justinray5@outlook.com [--hp-max 21]
"""

from __future__ import annotations

import argparse
import json
import sys
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, Optional

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
HTTP_TIMEOUT = 60  # Render cold starts can stretch the first call.

SUBCLASS = "Oath of the Ancients"
FIGHTING_STYLE_FEAT = "Dueling"
# Cleric cantrips that could have come from Blessed Warrior at level 2.
CLERIC_CANTRIPS_TO_DROP = ("Guidance", "Sacred Flame", "Thaumaturgy", "Spare the Dying")
OATH_SPELLS = ("Ensnaring Strike", "Speak with Animals")

NOTES_MARKER = "== LEVEL 3 (Session 5) =="
NOTES_BLOCK = f"""
{NOTES_MARKER}
Oath of the Ancients. Fighting Style: Dueling (+2 damage, one-handed melee
weapon + nothing in the other hand — shield OK). Blessed Warrior dropped
(no Cleric cantrips).
Channel Divinity: 2 uses — regain 1 on short rest, all on long rest.
  - Divine Sense (Bonus Action): know location/type of Celestials, Fiends,
    Undead within 60 ft for 10 min.
  - Nature's Wrath (Magic action): creatures of choice within 15 ft,
    STR save or Restrained 1 min (repeat save at end of each turn).
Oath spells (always prepared): Ensnaring Strike, Speak with Animals.
L3 = 4 prepared spells — one more level-1 pick still owed at the table.
""".strip()


class Ctx:
    """Carries connection settings + dry-run flag for every API call."""

    def __init__(self, api_base: str, dm_email: str, dry_run: bool) -> None:
        """Store normalized connection settings."""
        self.api_base = api_base.rstrip("/")
        self.dm_email = dm_email
        self.dry_run = dry_run

    def url(self, path: str) -> str:
        """Join a path onto the API base."""
        return f"{self.api_base}/{path.lstrip('/')}"


def _request(
    ctx: Ctx,
    path: str,
    *,
    method: str = "GET",
    body: Optional[dict] = None,
) -> Any:
    """Send a JSON HTTP request and parse the JSON response."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        ctx.url(path),
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            AUTH_HEADER: ctx.dm_email,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        raise RuntimeError(f"{method} {path} -> HTTP {exc.code}: {detail}") from exc


def _write(ctx: Ctx, path: str, *, method: str, body: Optional[dict], label: str) -> Any:
    """Perform a write (or print it in dry-run mode)."""
    if ctx.dry_run:
        print(f"  [dry-run] {method} {path} — {label}")
        return None
    result = _request(ctx, path, method=method, body=body)
    print(f"  ✓ {label}")
    return result


def _find_creed(ctx: Ctx, campaign_id: str) -> Optional[dict]:
    """Return Creed's PC record, or None."""
    pcs = _request(ctx, f"campaigns/{campaign_id}/characters")
    for pc in pcs:
        if "creed" in str(pc.get("character_name", "")).casefold():
            return pc
    return None


def _spell_id_by_name(ctx: Ctx, name: str) -> Optional[str]:
    """Resolve a spell name to its catalog UUID. Returns None on miss."""
    qs = urllib.parse.urlencode({"q": name})
    hits = _request(ctx, f"spells?{qs}")
    if not isinstance(hits, list):
        return None
    target = name.casefold()
    for s in hits:
        if str(s.get("name", "")).casefold() == target:
            return s.get("id")
    return None


def drop_cleric_cantrips(ctx: Ctx, pc: dict) -> None:
    """Remove any Blessed Warrior cleric cantrips from Creed's spell list."""
    print("\n[1/4] Drop Blessed Warrior cantrips")
    rows = _request(ctx, f"characters/{pc['id']}/spells")
    drop_ids = {}
    for name in CLERIC_CANTRIPS_TO_DROP:
        sid = _spell_id_by_name(ctx, name)
        if sid:
            drop_ids[str(sid)] = name
    dropped = 0
    for row in rows:
        name = drop_ids.get(str(row.get("spell_id")))
        if name is None:
            continue
        _write(
            ctx,
            f"characters/{pc['id']}/spells/{row['id']}",
            method="DELETE",
            body=None,
            label=f"forgot {name}",
        )
        dropped += 1
    if not dropped:
        print("  = no cleric cantrips on the sheet — already clean")


def patch_character(ctx: Ctx, pc: dict, hp_max: Optional[int]) -> None:
    """Set level 3, subclass, the Dueling feat, and the notes block."""
    print("\n[2/4] Level 3 + subclass + Dueling")
    patch: dict[str, Any] = {}
    if pc.get("level") != 3:
        patch["level"] = 3
    if pc.get("subclass") != SUBCLASS:
        patch["subclass"] = SUBCLASS
    feats = list(pc.get("feats") or [])
    if FIGHTING_STYLE_FEAT not in feats:
        patch["feats"] = feats + [FIGHTING_STYLE_FEAT]
    notes = pc.get("notes") or ""
    if NOTES_MARKER not in notes:
        patch["notes"] = (notes.rstrip() + "\n\n" if notes.strip() else "") + NOTES_BLOCK
    if hp_max is not None and pc.get("hp_max") != hp_max:
        patch["hp_max"] = hp_max
    if patch:
        _write(
            ctx,
            f"characters/{pc['id']}",
            method="PATCH",
            body=patch,
            label=f"Creed: {sorted(patch)}",
        )
    else:
        print("  = already up to date")


def learn_oath_spells(ctx: Ctx, pc: dict) -> None:
    """Add the always-prepared Oath of the Ancients spells."""
    print("\n[3/4] Oath spells (always prepared)")
    rows = _request(ctx, f"characters/{pc['id']}/spells")
    have = {str(r.get("spell_id")) for r in rows}
    for name in OATH_SPELLS:
        sid = _spell_id_by_name(ctx, name)
        if sid is None:
            print(f"  ⚠ '{name}' not in the spell catalog — add manually")
            continue
        if str(sid) in have:
            print(f"  = {name} already on the sheet")
            continue
        _write(
            ctx,
            f"characters/{pc['id']}/spells",
            method="POST",
            body={"spell_id": sid, "known": True, "prepared": True},
            label=f"learned {name} (prepared)",
        )


def sync_features(ctx: Ctx, pc: dict) -> None:
    """Grant every catalog feature Creed now qualifies for (Channel Divinity)."""
    print("\n[4/4] Feature sync")
    if ctx.dry_run:
        print(f"  [dry-run] POST characters/{pc['id']}/features/sync")
        return
    granted = _request(ctx, f"characters/{pc['id']}/features/sync", method="POST", body={})
    names = granted.get("granted") or []
    print(f"  ✓ granted: {', '.join(names) if names else '(nothing new)'}")


def main() -> int:
    """Parse args and run the four idempotent steps."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--dm-email", required=True)
    parser.add_argument("--campaign-id", default=DEFAULT_CAMPAIGN_ID)
    parser.add_argument(
        "--hp-max",
        type=int,
        default=None,
        help="New max HP once rolled at the table (omit to leave unchanged).",
    )
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    ctx = Ctx(args.api_base, args.dm_email, args.dry_run)
    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"Creed Ashmantle -> level 3 [{mode}] -> {ctx.api_base}")

    creed = _find_creed(ctx, args.campaign_id)
    if creed is None:
        print("error: no PC matching 'creed' in the campaign.", file=sys.stderr)
        return 1
    print(
        f"Found {creed['character_name']} — L{creed['level']} "
        f"{creed['character_class']}, subclass={creed.get('subclass')!r}"
    )

    failures = 0
    for step in (
        lambda: drop_cleric_cantrips(ctx, creed),
        lambda: patch_character(ctx, creed, args.hp_max),
        lambda: learn_oath_spells(ctx, creed),
        lambda: sync_features(ctx, creed),
    ):
        try:
            step()
        except Exception as exc:  # noqa: BLE001 — keep going; report at the end.
            failures += 1
            print(f"  ✗ FAILED: {exc}")

    print(f"\nDone. {failures} step(s) failed." if failures else "\nDone. All steps clean.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
