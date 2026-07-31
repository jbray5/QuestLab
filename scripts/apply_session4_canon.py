"""Apply Session 4 canon to the live QuestLab data (Session 5 handoff, P5).

Idempotent: GET-then-PATCH/POST by natural key. No deletes. Safe to re-run.

What it does:
    1. Willa: appends the Wild Shape known-form note (dog) and the named
       companion (Tinkerman) to her character notes.
    2. Nya: ensures "An old ferry-lantern (wickless)" exists in the item
       catalog and sits in her inventory — listed PLAINLY, with no note.
       In-app inventory notes are player-visible (confirmed: the /play
       inventory route returns raw rows), so the item's origin lives only
       in campaigns/the-severance.md, DM-only section.
    3. Campaign world_notes: appends a SESSION 4 CANON block (events per
       the handoff — no elaboration; no Tallyman price contents, no true
       name; statuses only).

Usage:
    python scripts/apply_session4_canon.py --dm-email justinray5@outlook.com --dry-run
    python scripts/apply_session4_canon.py --dm-email justinray5@outlook.com
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
HTTP_TIMEOUT = 60

WILLA_NOTES_MARKER = "== SESSION 4 =="
WILLA_NOTES_BLOCK = f"""
{WILLA_NOTES_MARKER}
Wild Shape known form: dog.
Companion: Tinkerman — the Tinker-sprite, named Session 4. Speaks rarely
(booming pro-wrestler voice); first words "I CAN HELP MOMMY."
""".strip()

LANTERN_NAME = "An old ferry-lantern (wickless)"
# Player-safe description — the origin note is DM-record only
# (campaigns/the-severance.md), never on the item or inventory row.
LANTERN_DESCRIPTION = "An old ferry-lantern with no wick."

WORLD_NOTES_MARKER = "== SESSION 4 CANON (logged 2026-07-30) =="
WORLD_NOTES_BLOCK = f"""
{WORLD_NOTES_MARKER}
Party crossed the Lantern Ford (west road), arrived Blackreef Cove at dusk.
The sea has been "singing" for three weeks.
- Met Mira (Willa's adoptive sister, runs The Mooring) and Sister Maren
  (chapel records-keeper). Captain Edrik Thorne sailed toward the song alone
  and is missing; his skiff drifted back empty, symbols burned into the deck.
- The party decoded the song's refrain: "COME HOME, CHILD."
- The sprite companion is named TINKERMAN — speaks rarely, booming
  pro-wrestler style; first words "I CAN HELP MOMMY."
- Cliffhanger: the song stopped mid-phrase; a crewless ghost ship entered the
  harbor and lowered its gangplank. Session 5: board, sail, descend to a
  drowned temple.
- Tallyman ledger status: name PAID - secret PAID - kind lie OUTSTANDING -
  sleepless night OUTSTANDING (banked). Contents of the paid prices are
  DM-record only (campaigns/the-severance.md).
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
    timeout: int = HTTP_TIMEOUT,
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
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode(errors="replace")[:500]
        raise RuntimeError(f"{method} {path} -> HTTP {exc.code}: {detail}") from exc


def _write(ctx: Ctx, path: str, *, method: str, body: dict, label: str) -> Any:
    """Perform a write (or print it in dry-run mode)."""
    if ctx.dry_run:
        print(f"  [dry-run] {method} {path} — {label}")
        return None
    result = _request(ctx, path, method=method, body=body)
    print(f"  ✓ {label}")
    return result


def _find(items: list, key: str, needle: str) -> Optional[dict]:
    """Return the first dict whose `key` contains `needle` (case-insensitive)."""
    needle = needle.casefold()
    for it in items:
        if needle in str(it.get(key, "")).casefold():
            return it
    return None


def update_willa(ctx: Ctx, willa: Optional[dict]) -> None:
    """Append the Session 4 notes block to Willa's character notes."""
    print("\n[1/3] Willa — Wild Shape form + Tinkerman")
    if not willa:
        print("  ⚠ Willa not found — skipped")
        return
    notes = willa.get("notes") or ""
    if WILLA_NOTES_MARKER in notes:
        print("  = Session 4 block already present")
        return
    combined = f"{notes.rstrip()}\n\n{WILLA_NOTES_BLOCK}".strip()
    _write(
        ctx,
        f"characters/{willa['id']}",
        method="PATCH",
        body={"notes": combined},
        label="Willa notes updated (Wild Shape: dog · companion: Tinkerman)",
    )


def ensure_lantern(ctx: Ctx, nya: Optional[dict]) -> None:
    """Ensure the ferry-lantern exists and sits plainly in Nya's inventory."""
    print("\n[2/3] The ferry-lantern -> Nya's inventory (no note — see docstring)")
    if not nya:
        print("  ⚠ Nya not found — skipped")
        return
    qs = urllib.parse.urlencode({"q": "ferry-lantern"})
    hits = _request(ctx, f"items?{qs}")
    item = _find(hits if isinstance(hits, list) else [], "name", "ferry-lantern")
    if not item:
        item = _write(
            ctx,
            "items",
            method="POST",
            body={
                "name": LANTERN_NAME,
                "rarity": "Common",
                "item_type": "Adventuring gear",
                "is_magic": False,
                "attunement_required": False,
                "value_gp": 0,
                "description": LANTERN_DESCRIPTION,
            },
            label=f"created catalog item '{LANTERN_NAME}'",
        )
        if item is None:  # dry-run
            return
    else:
        print("  = catalog item already exists")

    inventory = _request(ctx, f"characters/{nya['id']}/inventory")
    rows = inventory if isinstance(inventory, list) else inventory.get("items", [])
    if any(str(r.get("item_id")) == str(item["id"]) for r in rows):
        print("  = Nya already carries the lantern")
        return
    _write(
        ctx,
        f"characters/{nya['id']}/inventory",
        method="POST",
        body={"item_id": item["id"], "quantity": 1},
        label="lantern added to Nya's inventory (plainly, no note)",
    )


def update_world_notes(ctx: Ctx, campaign_id: str) -> None:
    """Append the Session 4 canon block to the campaign's world notes."""
    print("\n[3/3] Campaign world notes")
    campaign = _request(ctx, f"campaigns/{campaign_id}")
    notes = campaign.get("world_notes") or ""
    if WORLD_NOTES_MARKER in notes:
        print("  = Session 4 block already present")
        return
    combined = f"{notes.rstrip()}\n\n{WORLD_NOTES_BLOCK}".strip()
    _write(
        ctx,
        f"campaigns/{campaign_id}",
        method="PATCH",
        body={"world_notes": combined},
        label="Session 4 canon appended to world notes",
    )


def main() -> int:
    """Run all three canon updates."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--campaign-id", default=DEFAULT_CAMPAIGN_ID)
    parser.add_argument("--dm-email", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    ctx = Ctx(args.api_base, args.dm_email, args.dry_run)

    pcs = _request(ctx, f"campaigns/{args.campaign_id}/characters")
    pcs = pcs if isinstance(pcs, list) else []
    willa = _find(pcs, "name", "willa")
    nya = _find(pcs, "name", "nya")

    update_willa(ctx, willa)
    ensure_lantern(ctx, nya)
    update_world_notes(ctx, args.campaign_id)

    print("\nDone." + (" (dry run — nothing written)" if args.dry_run else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
