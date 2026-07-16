"""Apply Session 2 canon + Session 3 prep to the live QuestLab data (2026-07-15).

Idempotent: GET-then-PATCH/POST by natural key. No deletes. Safe to re-run.

What it does (Part 2 of the Saturday handoff):
    1. PCs: the four actives -> level 2; Creed heroic_inspiration=True;
       Sarranthia annotated EXITED in notes (the model has no archive flag).
    2. NPCs: Wenneth -> Dead (the tree on the green); Petal, the
       Tinker-sprite, and the Lutenist ensured as cards; Yelvyne gains the
       sisters thread; Halve's card stripped back to the open mystery.
    3. Items: "Halve's Ciphered Page" ensured in the catalog and placed in
       Nya's inventory. (The AELIM key goes in campaign world_notes, NOT on
       the item card — item text can reach the player view.)
    4. Campaign world_notes: a SESSION 2 CANON block appended (shrine RELIT,
       the tree, pixies gone, the moral debt, DM-only cipher mechanics).
    5. Session 3 row ensured (title/date/attendees) and its DM brief
       overwritten with the hand-authored three-act beats (briefs have no
       hand-create HTTP route, so we generate-then-overwrite).
    6. Encounter "Driven Wolves" (4x SRD Wolf — same stats) ensured.

Usage:
    python scripts/apply_session2_canon.py --dm-email justinray5@outlook.com --dry-run
    python scripts/apply_session2_canon.py --dm-email justinray5@outlook.com
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
DEFAULT_ADVENTURE_ID = "ee3d7a70-4a01-4b9b-b026-f5415146b3bc"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
HTTP_TIMEOUT = 60  # Render cold starts can stretch the first call.

SESSION3_TITLE = "The Morning After & the Road Out"
SESSION3_DATE = "2026-07-18"
WORLD_NOTES_MARKER = "== SESSION 2 CANON (2026-07-15) =="

WORLD_NOTES_BLOCK = f"""
{WORLD_NOTES_MARKER}
Hollowmere shrine: RELIT (by the party, hands joined around Willa; portal opened,
collapsed, erupted into the silver-light fountain). Their logic: "we can re-sever it
later if needed." Live moral debt: they overrode Wenneth's dying wish and believe
severance is reversible.
- A twisted dead tree stands on the Market Green where Wenneth died. Permanent.
- Pixies: gone from Hollowmere forever.
- Petal lives: hollow, changed, permanent burn scars, won't carry shears.
- The Tinker-sprite (spared by Nya) imprinted on Willa. It will not cross into the
  shrine's light.
- Sarranthia (Jenna) exited; the cipher passed to Nya. Arrest thread = optional soft
  rumor only; Belva shuts it down.
- DM-ONLY, cipher: key = AELIM. Conjuration aura = tracking link to Halve.
  Abjuration aura = anti-translation ward. Decoding breaks the ward first, then the
  tracking link. Content hints at an unnamed "wrong hand" (identity undecided).
- Canon policy: commit only what play requires; name things when they walk on
  screen. Shelved lore: campaigns/parking-lot.md.
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


# ---------------------------------------------------------------------------
# 1. Player characters
# ---------------------------------------------------------------------------


def update_pcs(ctx: Ctx, campaign_id: str) -> dict[str, dict]:
    """Level-up the four actives, bank Creed's Inspiration, annotate Sarranthia."""
    print("\n[1/6] Player characters")
    pcs = _request(ctx, f"campaigns/{campaign_id}/characters")
    by_key: dict[str, dict] = {}
    for key in ("thane", "nya", "creed", "willa", "sarranthia", "warlock"):
        hit = _find(pcs, "character_name", key)
        if hit:
            by_key[key] = hit
    sarranthia = by_key.get("sarranthia") or by_key.get("warlock")

    for key in ("thane", "nya", "creed", "willa"):
        pc = by_key.get(key)
        if not pc:
            print(f"  ⚠ PC matching '{key}' not found — skipped")
            continue
        patch: dict[str, Any] = {}
        if pc.get("level") != 2:
            patch["level"] = 2
        if key == "creed" and not pc.get("heroic_inspiration"):
            patch["heroic_inspiration"] = True
        if patch:
            _write(
                ctx,
                f"characters/{pc['id']}",
                method="PATCH",
                body=patch,
                label=f"{pc['character_name']}: {patch}",
            )
        else:
            print(f"  = {pc['character_name']} already up to date")

    if sarranthia:
        marker = "EXITED after Session 2"
        notes = sarranthia.get("notes") or ""
        if marker not in notes:
            exited = (
                f"[{marker} — Jenna left the table; the cipher passed to Nya. "
                "Optional arrest-rumor hook only (Belva shuts it down). "
                "Do not delete this PC; door stays open.]\n" + notes
            )
            _write(
                ctx,
                f"characters/{sarranthia['id']}",
                method="PATCH",
                body={"notes": exited},
                label=f"{sarranthia['character_name']}: annotated EXITED",
            )
        else:
            print("  = Sarranthia already annotated EXITED")
    else:
        print("  ⚠ Sarranthia not found — skipped")
    return by_key


# ---------------------------------------------------------------------------
# 2. NPCs
# ---------------------------------------------------------------------------

NEW_NPCS: list[dict] = [
    {
        "match": "petal",
        "create": {
            "name": "Petal",
            "role": "Blossom-seller (was)",
            "race": "Human",
            "status": "Alive",
            "location": "Hollowmere",
            "appearance": "Young; hands wrapped — permanent burn scars. Quiet now.",
            "personality": "Hollow, changed. Speaks flatly, rarely, without looking at anyone.",
            "quick_who": "The corrupted flower-seller the party saved — Nya downed her "
            "non-lethally; mercy lifted the corruption.",
            "want_now": "Nothing she can name. Won't carry shears.",
            "voice": "Flat. One line at a time.",
            "secret_short": "None — she genuinely remembers nothing past the light dimming.",
            "notes": "S3 line, flat: 'There's a tree on the green. There wasn't a tree.' "
            "Her mother Mira thanks the party through tears — especially Nya, which stings.",
        },
    },
    {
        "match": "tinker",
        "create": {
            "name": "The Tinker-sprite",
            "role": "Willa's fey companion",
            "race": "Sprite (fey)",
            "status": "Alive",
            "location": "Wherever Willa is",
            "appearance": "Tiny, blue, quick as a struck match.",
            "personality": "Wordless, expressive, fiercely attached to Willa.",
            "quick_who": "The sprite Nya spared at ~4x lethal — mercy lifted its corruption; "
            "it imprinted on Willa.",
            "want_now": "To stay near Willa. To NOT go near the shrine.",
            "voice": "Says nothing; means everything.",
            "secret_short": "It will not cross into the shrine's light. Say nothing about it.",
            "notes": "The quiet tell of the relighting's unnamed price. Loses its mind "
            "(joyfully) when Willa first Wild Shapes into a gull.",
        },
    },
    {
        "match": "lutenist",
        "create": {
            "name": "The Lutenist",
            "role": "Recurring gag NPC — unnamed (that's the bit)",
            "race": "Human",
            "status": "Alive",
            "location": "The Hearth (the wreckage of it)",
            "appearance": "Travel-worn finery; a lute older than he is.",
            "personality": "Undeterrable. Played through the entire battle without stopping.",
            "quick_who": "Played through the whole Session 2 battle. Never stopped. Not once.",
            "want_now": "An audience.",
            "voice": "Undeterrable theatrical tenor.",
            "secret_short": "None. That's the joke.",
            "notes": "Composing a ballad of the battle in which every verse is wrong. "
            "Wants Creed (who plays lute) to duet the chorus. Gave Creed a spare lute "
            "string 'for luck.'",
        },
    },
]


def update_npcs(ctx: Ctx, campaign_id: str) -> None:
    """Wenneth dead, new cards ensured, Yelvyne sisters thread, Halve stripped."""
    print("\n[2/6] NPCs")
    npcs = _request(ctx, f"campaigns/{campaign_id}/npcs")

    wenneth = _find(npcs, "name", "wenneth")
    if wenneth:
        if wenneth.get("status") != "Dead":
            _write(
                ctx,
                f"npcs/{wenneth['id']}",
                method="PATCH",
                body={
                    "status": "Dead",
                    "location": "The Market Green — the dead tree",
                    "quick_who": "The Chapel Oak's dryad, three generations the village's "
                    "confidante. Died rooting into the ground where she fell.",
                    "want_now": "",
                    "secret_short": "Last words: 'The light was a cage. You don't know what "
                    "you're protecting.' What she wanted was the light OFF.",
                    "notes": "DEAD (Session 2). The severance unmade her — nothing pre-seeded "
                    "it. A twisted dead leafless tree now stands on the green, permanent. "
                    "The party relit the shrine over her dying wish (live moral debt).",
                },
                label="Wenneth -> Dead (the tree on the green)",
            )
        else:
            print("  = Wenneth already Dead")
    else:
        print("  ⚠ Wenneth not found — skipped")

    for spec in NEW_NPCS:
        existing = _find(npcs, "name", spec["match"])
        if existing:
            print(f"  = {existing['name']} already exists")
            continue
        _write(
            ctx,
            f"campaigns/{campaign_id}/npcs",
            method="POST",
            body=spec["create"],
            label=f"created NPC {spec['create']['name']}",
        )

    yelvyne = _find(npcs, "name", "yelvyne")
    if yelvyne:
        knows = list(yelvyne.get("knows") or [])
        sisters_fact = (
            "Her sisters, scattered near the other lights, could read the cipher "
            "(ancient magic, not her field). Her order is unnamed for now."
        )
        if not any("sisters" in str(k).casefold() for k in knows):
            knows.append(sisters_fact)
            _write(
                ctx,
                f"npcs/{yelvyne['id']}",
                method="PATCH",
                body={
                    "knows": knows,
                    "want_now": "To understand the price of the relighting — 'We bought back "
                    "the morning. I couldn't tell you the price yet.'",
                },
                label="Yelvyne: sisters thread added",
            )
        else:
            print("  = Yelvyne already carries the sisters thread")
    else:
        print("  ⚠ Yelvyne not found — skipped")

    halve = _find(npcs, "name", "halve")
    if halve:
        stripped = "recruits from afar"
        if stripped not in str(halve.get("notes", "")).casefold():
            _write(
                ctx,
                f"npcs/{halve['id']}",
                method="PATCH",
                body={
                    "status": "Missing",
                    "location": "Gone from Hollowmere — recruits from afar",
                    "quick_who": "The courtly 'recruiter' who vanished the night the shrine "
                    "severed. Suspicion: 100. Reveals: 0.",
                    "want_now": "Unknown. He is not here.",
                    "secret_short": "He IS a severer. Believes severance is mercy. Right, "
                    "rationalizing, or spoken-through: deliberately OPEN.",
                    "motivation": "Believes the fey bond is a parasite and negotiated "
                    "severance the only cure. Whether he is right is the campaign question.",
                    "notes": "Canon diet 2026-07-15: keep him a genuine mystery — no captive "
                    "assets, no tipped investigations, no routed compasses (see "
                    "campaigns/parking-lot.md). He recruits from afar and will circle back "
                    "in a few months, colder, having marked the relighting as a failed test.",
                },
                label="Halve: card stripped to the open mystery",
            )
        else:
            print("  = Halve already stripped")
    else:
        print("  ⚠ Halve not found — skipped")


# ---------------------------------------------------------------------------
# 3. The cipher item -> Nya
# ---------------------------------------------------------------------------


def ensure_cipher_item(ctx: Ctx, nya: Optional[dict]) -> None:
    """Ensure the cipher exists in the catalog and sits in Nya's inventory."""
    print("\n[3/6] The cipher -> Nya's inventory")
    if not nya:
        print("  ⚠ Nya not found — skipped")
        return
    qs = urllib.parse.urlencode({"q": "Ciphered Page"})
    hits = _request(ctx, f"items?{qs}")
    item = _find(hits if isinstance(hits, list) else [], "name", "ciphered page")
    if not item:
        item = _write(
            ctx,
            "items",
            method="POST",
            body={
                "name": "Halve's Ciphered Page",
                "rarity": "Common",
                "item_type": "Quest item",
                "is_magic": True,
                "attunement_required": False,
                "value_gp": 0,
                "description": "A page of dense, beautiful cipher in an unknown hand, found "
                "in the hooded traveler's room at The Hearth. Detect Magic reads two faint "
                "auras — conjuration and abjuration — but not the meaning.",
            },
            label="created catalog item 'Halve's Ciphered Page'",
        )
        if item is None:  # dry-run
            return
    else:
        print("  = catalog item already exists")

    inventory = _request(ctx, f"characters/{nya['id']}/inventory")
    rows = inventory if isinstance(inventory, list) else inventory.get("items", [])
    if any(str(r.get("item_id")) == str(item["id"]) for r in rows):
        print("  = Nya already carries the cipher")
        return
    _write(
        ctx,
        f"characters/{nya['id']}/inventory",
        method="POST",
        body={"item_id": item["id"], "quantity": 1, "notes": "Passed to Nya by Sarranthia."},
        label="cipher added to Nya's inventory",
    )


# ---------------------------------------------------------------------------
# 4. Campaign world state
# ---------------------------------------------------------------------------


def update_world_notes(ctx: Ctx, campaign_id: str) -> None:
    """Append the Session 2 canon block to campaign world_notes (once)."""
    print("\n[4/6] Campaign world_notes")
    campaign = _request(ctx, f"campaigns/{campaign_id}")
    notes = campaign.get("world_notes") or ""
    if WORLD_NOTES_MARKER in notes:
        print("  = world_notes already carries the Session 2 canon block")
        return
    combined = (notes.rstrip() + "\n\n" if notes.strip() else "") + WORLD_NOTES_BLOCK
    _write(
        ctx,
        f"campaigns/{campaign_id}",
        method="PATCH",
        body={"world_notes": combined},
        label="Session 2 canon block appended (shrine RELIT, cipher key, moral debt)",
    )


# ---------------------------------------------------------------------------
# 5. Session 3 + its DM brief
# ---------------------------------------------------------------------------


def _session3_brief(active_pcs: dict[str, dict]) -> dict:
    """Build the hand-authored Session 3 brief payload (three acts as beats)."""

    def pc_name(key: str) -> str:
        """Best-effort character name for a spotlight entry."""
        pc = active_pcs.get(key)
        return pc["character_name"] if pc else key.title()

    return {
        "cold_open": "Dawn. The silver light is back — soft, ordinary, daylight — like it "
        "never left. Belva's cooking, the lutenist never stopped playing, and out on the "
        "green, where nothing stood two days ago: the tree.",
        "premise": "Act 1 let them have the win; Act 2 hand them a road; Act 3 walk them "
        "out and end on the stag. Full sheet: campaigns/session-03-opening-runsheet.md.",
        "danger_dial": "RP-heavy. One optional fight (Driven Wolves). HARD STOP at the "
        "corrupted stag — it is a promise, not an encounter.",
        "fallback": "Act 1 runs off the printed sheet with zero tech. If the 3D table "
        "isn't stable, the wolves run on the 2D map. No heroics.",
        "beats": [
            {
                "title": "Victory lap + the divvy",
                "cue": "Breakfast, gifts: potions (pool), acorn (Thane finds), lute string "
                "(Creed), Petal's last flower (Willa). Nya gets nothing — on purpose.",
                "kind": "rp",
                "trigger_kind": "manual",
            },
            {
                "title": "The memorial question",
                "cue": "Belva, quiet: 'Should we carve something for her? What would she " "want?'",
                "kind": "rp",
                "trigger_kind": "manual",
                "dm_note": "SOFT TRAP: what Wenneth wanted was the light OFF — and they "
                "relit it. Pure roleplay; do not resolve it for them.",
            },
            {
                "title": "Petal",
                "cue": "Hands wrapped, hollow. Flat, to no one: 'There's a tree on the "
                "green. There wasn't a tree.' Mira thanks Nya especially — it stings.",
                "kind": "rp",
                "trigger_kind": "manual",
            },
            {
                "title": "The sprite tell",
                "cue": "The Tinker-sprite will NOT cross into the shrine's light. Waits at "
                "the edge, wings still.",
                "kind": "reveal",
                "trigger_kind": "manual",
                "dm_note": "Say NOTHING. Fully deniable. If nobody notices, it keeps.",
            },
            {
                "title": "Level-2 vignettes",
                "cue": "Creed: dawn prayer + Inspiration banked. Thane: compass twitches "
                "toward the road. Nya: cipher hums cold. Willa: first Wild Shape (gull) — "
                "sprite loses its mind.",
                "kind": "rp",
                "trigger_kind": "manual",
            },
            {
                "title": "Yelvyne + the cipher",
                "cue": "'We bought back the morning. I couldn't tell you the price yet.' "
                "Cipher: ancient magic, not her field — her sisters near the other lights "
                "could read it.",
                "kind": "rp",
                "trigger_kind": "manual",
                "dm_note": "DM-only: key AELIM. Conjuration = tracking link to Halve; "
                "abjuration = anti-translation ward. Ward breaks first, then tracking.",
            },
            {
                "title": "Three roads (breakfast rumors)",
                "cue": "SOUTH: hooded man paid passage with untarnishing coin. WEST: the "
                "tide has been singing. MARKET: three villages over, gone by Thursday.",
                "kind": "rp",
                "trigger_kind": "manual",
                "dm_note": "Their pick is the Session 4 prep. Flavor, then shut up.",
            },
            {
                "title": "The Waystone",
                "cue": "Three riddle faces: NAME / TIDE / PROMISE. Solve = true 5-second "
                "glimpse + kind road. Botch = hard road + can't say the word till sundown.",
                "kind": "rp",
                "trigger_kind": "manual",
            },
            {
                "title": "Driven Wolves (optional)",
                "cue": "3-4 wolves acting wrong — driven, not hunting. Flee at half "
                "strength. After: they were running FROM something.",
                "kind": "combat",
                "trigger_kind": "manual",
            },
            {
                "title": "THE STAG — hard stop",
                "cue": "At the treeline: a stag plated in bark, black wet unblinking eyes. "
                "It watches. END THE SESSION on the silence.",
                "kind": "reveal",
                "trigger_kind": "manual",
                "dm_note": "The shrine is RELIT — no severed shrine out here. Corruption "
                "should not exist where they stand. What it is: decided later.",
            },
        ],
        "npc_faces": [
            {
                "name": "Belva",
                "quick_who": "Halfling keeper of The Hearth; hears everything.",
                "want_now": "Her village whole; the party fed.",
                "voice": "Warm, wry: 'call it even, loves.'",
                "secret_short": "Shuts down the Sarranthia arrest rumor flat.",
            },
            {
                "name": "Yelvyne",
                "quick_who": "Warm shrine steward, out of her depth on the cipher.",
                "want_now": "To name the price of the relighting. She can't yet.",
                "voice": "Grateful and unresolved.",
                "secret_short": "Her order is unnamed; sisters scattered near other lights.",
            },
            {
                "name": "Petal",
                "quick_who": "Saved blossom-seller; burn-scarred, hollow, changed.",
                "want_now": "Nothing she can name. Won't carry shears.",
                "voice": "Flat. One line.",
                "secret_short": "Remembers nothing past the light dimming.",
            },
            {
                "name": "The Lutenist",
                "quick_who": "Unnamed. Played through the whole battle.",
                "want_now": "An audience. A duet with Creed.",
                "voice": "Undeterrable theatrical tenor.",
                "secret_short": "None. That's the joke.",
            },
        ],
        "spotlight": [
            {"pc_name": pc_name("creed"), "flag": "Inspiration banked; dawn-prayer vignette."},
            {"pc_name": pc_name("thane"), "flag": "Compass twitches toward the road."},
            {"pc_name": pc_name("nya"), "flag": "Gets no gift on purpose; the cipher hums."},
            {"pc_name": pc_name("willa"), "flag": "First Wild Shape (gull); sprite meltdown."},
        ],
        "roads": [
            {
                "label": "South — the Silverway",
                "flavor": "A hooded man paid passage south with coin that doesn't tarnish.",
                "pull": "Thane's compass; the Halve thread",
            },
            {
                "label": "West — the coast",
                "flavor": "Fisherfolk say the tide has been singing.",
                "pull": "Willa's home waters",
            },
            {
                "label": "The Wandering Market",
                "flavor": "Appeared three villages over. Gone by Thursday.",
                "pull": "Curiosity bait; Nya's kind of wrong",
            },
        ],
    }


def ensure_session3(ctx: Ctx, adventure_id: str, active_pcs: dict[str, dict]) -> None:
    """Ensure the Session 3 row + hand-authored brief exist."""
    print("\n[5/6] Session 3 + DM brief")
    sessions = _request(ctx, f"adventures/{adventure_id}/sessions")
    session = next((s for s in sessions if s.get("session_number") == 3), None)
    attending = [
        pc["id"] for k, pc in active_pcs.items() if k in ("thane", "nya", "creed", "willa")
    ]

    if not session:
        session = _write(
            ctx,
            f"adventures/{adventure_id}/sessions",
            method="POST",
            body={
                "session_number": 3,
                "title": SESSION3_TITLE,
                "date_planned": SESSION3_DATE,
                "attending_pc_ids": attending,
            },
            label=f"created Session 3 '{SESSION3_TITLE}'",
        )
        if session is None:  # dry-run
            return
    else:
        patch: dict[str, Any] = {}
        if session.get("title") != SESSION3_TITLE:
            patch["title"] = SESSION3_TITLE
        if attending and set(map(str, session.get("attending_pc_ids") or [])) != set(
            map(str, attending)
        ):
            patch["attending_pc_ids"] = attending
        if patch:
            _write(
                ctx,
                f"sessions/{session['id']}",
                method="PATCH",
                body=patch,
                label=f"Session 3 updated: {sorted(patch)}",
            )
        else:
            print("  = Session 3 row already up to date")

    sid = session["id"]
    if ctx.dry_run:
        print("  [dry-run] PATCH brief (generate first if the API demands it)")
        return
    payload = _session3_brief(active_pcs)
    try:
        _request(ctx, f"sessions/{sid}/brief", method="PATCH", body=payload)
        print("  ✓ brief overwritten with the hand-authored three acts")
    except RuntimeError as exc:
        if "generate" not in str(exc).casefold():
            raise
        print("  … no brief yet — generating a seed to overwrite (AI call, may take minutes)")
        _request(ctx, f"sessions/{sid}/brief", method="POST", body={}, timeout=300)
        _request(ctx, f"sessions/{sid}/brief", method="PATCH", body=payload)
        print("  ✓ brief generated, then overwritten with the hand-authored three acts")


# ---------------------------------------------------------------------------
# 6. Driven Wolves encounter
# ---------------------------------------------------------------------------


def ensure_encounter(ctx: Ctx, adventure_id: str) -> None:
    """Ensure the 'Driven Wolves' encounter (4x SRD Wolf) exists."""
    print("\n[6/6] Encounter: Driven Wolves")
    qs = urllib.parse.urlencode({"search": "wolf"})
    monsters = _request(ctx, f"monsters?{qs}")
    wolf = next(
        (m for m in monsters if str(m.get("name", "")).casefold() == "wolf"),
        None,
    )
    if not wolf:
        print("  ⚠ SRD 'Wolf' not found in the monster catalog — skipped")
        return
    encounters = _request(ctx, f"adventures/{adventure_id}/encounters")
    if _find(encounters, "name", "driven wolves"):
        print("  = encounter already exists")
        return
    _write(
        ctx,
        f"adventures/{adventure_id}/encounters",
        method="POST",
        body={
            "name": "Driven Wolves",
            "description": "3-4 wolves on the road out of Hollowmere — acting wrong. "
            "Not hunting: driven out of the deeper woods, ribs showing, looking over "
            "their shoulders.",
            "monster_roster": [{"monster_id": wolf["id"], "count": 4}],
            "read_aloud_text": "The wolves come out of the treeline wrong — not stalking, "
            "spilling, like something behind them matters more than you do.",
            "dm_notes": "AC 13, HP 11, Bite +4 (2d4+2), Pack Tactics. FLEE AT HALF "
            "STRENGTH: when half the pack is down, the rest break. Drop to 3 wolves if "
            "the table is hurting. The tell (after): they were running FROM something. "
            "If the 3D tabletop is a GO, this is its debut board.",
        },
        label="created encounter 'Driven Wolves' (4x SRD Wolf)",
    )


def main() -> int:
    """Parse args and run all six idempotent update steps."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--dm-email", required=True)
    parser.add_argument("--campaign-id", default=DEFAULT_CAMPAIGN_ID)
    parser.add_argument("--adventure-id", default=DEFAULT_ADVENTURE_ID)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    ctx = Ctx(args.api_base, args.dm_email, args.dry_run)
    mode = "DRY-RUN" if args.dry_run else "LIVE"
    print(f"Applying Session 2 canon [{mode}] -> {ctx.api_base}")

    failures = 0
    active_pcs: dict[str, dict] = {}
    steps = [
        ("PCs", lambda: active_pcs.update(update_pcs(ctx, args.campaign_id))),
        ("NPCs", lambda: update_npcs(ctx, args.campaign_id)),
        ("Cipher item", lambda: ensure_cipher_item(ctx, active_pcs.get("nya"))),
        ("World notes", lambda: update_world_notes(ctx, args.campaign_id)),
        ("Session 3", lambda: ensure_session3(ctx, args.adventure_id, active_pcs)),
        ("Encounter", lambda: ensure_encounter(ctx, args.adventure_id)),
    ]
    for name, step in steps:
        try:
            step()
        except Exception as exc:  # noqa: BLE001 — keep going; report at the end.
            failures += 1
            print(f"  ✗ {name} FAILED: {exc}")

    print(f"\nDone. {failures} step(s) failed." if failures else "\nDone. All steps clean.")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
