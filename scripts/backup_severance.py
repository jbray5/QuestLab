"""Backup The Severance campaign — full snapshot via the deployed API.

Run periodically (especially before any session). Dumps everything the
DM needs to fully reconstruct the campaign if Render's Postgres or the
QuestLab service goes sideways:

    - campaign metadata
    - adventures, with their encounters, sessions, runbooks, npc rosters
    - player characters, with their spells, inventory, features
    - campaign-scoped NPCs

Output: a timestamped subdirectory under ``campaigns/backups/`` with:
    snapshot.json   — single flat tree of everything fetched
    MANIFEST.md     — human-readable summary (counts + PC names + session titles)

Recovery path: if Render dies, the JSON has every UUID, every stat, every
runbook scene, every loot entry. A small re-seed script could rebuild the
campaign on any fresh QuestLab deploy.

Run:
    python scripts/backup_severance.py --dm-email justinray5@outlook.com

Stdlib-only. Read-only against the API (no mutations).
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
DEFAULT_OUT_DIR = "campaigns/backups"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
HTTP_TIMEOUT = 60


def _get(url: str, dm_email: str) -> Any:
    """Read-only GET, JSON-decoded."""
    req = urllib.request.Request(
        url,
        headers={
            "Accept": "application/json",
            AUTH_HEADER: dm_email,
        },
    )
    with urllib.request.urlopen(req, timeout=HTTP_TIMEOUT) as resp:
        raw = resp.read()
        return json.loads(raw) if raw else None


def _safe_get(url: str, dm_email: str, default: Any = None) -> Any:
    """Best-effort GET — returns ``default`` on any error.

    Used for nested endpoints that might 404 (e.g. a session with no
    runbook yet) without aborting the whole backup.
    """
    try:
        return _get(url, dm_email)
    except urllib.error.HTTPError:
        return default
    except Exception:
        return default


def snapshot_campaign(api_base: str, campaign_id: str, dm_email: str) -> dict:
    """Fetch every piece of data tied to one campaign."""
    base = api_base.rstrip("/")
    out: dict[str, Any] = {
        "schema_version": 1,
        "captured_at": datetime.utcnow().isoformat() + "Z",
        "api_base": base,
        "campaign_id": campaign_id,
    }

    print("  · campaign...", flush=True)
    out["campaign"] = _get(f"{base}/campaigns/{campaign_id}", dm_email)

    print("  · npcs...", flush=True)
    out["npcs"] = _get(f"{base}/campaigns/{campaign_id}/npcs", dm_email) or []

    print("  · characters...", flush=True)
    characters = _get(f"{base}/campaigns/{campaign_id}/characters", dm_email) or []
    enriched_characters = []
    for pc in characters:
        pc_id = pc.get("id")
        if not pc_id:
            continue
        print(f"    · {pc.get('character_name', pc_id)}...", flush=True)
        enriched_characters.append(
            {
                "pc": pc,
                "spells": _safe_get(f"{base}/characters/{pc_id}/spells", dm_email, default=[]),
                "inventory": _safe_get(
                    f"{base}/characters/{pc_id}/inventory", dm_email, default=[]
                ),
                "features": _safe_get(f"{base}/characters/{pc_id}/features", dm_email, default=[]),
                "spell_slots": _safe_get(
                    f"{base}/characters/{pc_id}/spell-slots", dm_email, default=None
                ),
            }
        )
    out["characters"] = enriched_characters

    print("  · adventures...", flush=True)
    adventures = _get(f"{base}/campaigns/{campaign_id}/adventures", dm_email) or []
    enriched_adventures = []
    for adv in adventures:
        adv_id = adv.get("id")
        if not adv_id:
            continue
        print(f"    · {adv.get('title', adv_id)}...", flush=True)
        encounters = _safe_get(f"{base}/adventures/{adv_id}/encounters", dm_email, default=[])
        sessions = _safe_get(f"{base}/adventures/{adv_id}/sessions", dm_email, default=[])
        enriched_sessions = []
        for s in sessions:
            s_id = s.get("id")
            if not s_id:
                continue
            print(f"      · session: {s.get('title', s_id)}", flush=True)
            enriched_sessions.append(
                {
                    "session": s,
                    "runbook": _safe_get(f"{base}/sessions/{s_id}/runbook", dm_email, default=None),
                    "combat_state": _safe_get(
                        f"{base}/sessions/{s_id}/combat", dm_email, default=None
                    ),
                }
            )
        enriched_adventures.append(
            {
                "adventure": adv,
                "encounters": encounters,
                "sessions": enriched_sessions,
            }
        )
    out["adventures"] = enriched_adventures

    return out


def write_manifest(snapshot: dict, manifest_path: Path) -> None:
    """Render a human-readable Markdown summary alongside the JSON."""
    c = snapshot.get("campaign") or {}
    advs = snapshot.get("adventures") or []
    pcs = snapshot.get("characters") or []
    npcs = snapshot.get("npcs") or []

    lines: list[str] = []
    lines.append(f"# Backup — {c.get('name', 'Unknown campaign')}")
    lines.append("")
    lines.append(f"- **Captured:** {snapshot.get('captured_at')}")
    lines.append(f"- **Campaign UUID:** `{snapshot.get('campaign_id')}`")
    lines.append(f"- **API base:** {snapshot.get('api_base')}")
    lines.append("")
    lines.append("## Counts")
    lines.append(f"- Adventures: **{len(advs)}**")
    lines.append(f"- Player characters: **{len(pcs)}**")
    lines.append(f"- NPCs: **{len(npcs)}**")
    enc_count = sum(len(a.get("encounters") or []) for a in advs)
    ses_count = sum(len(a.get("sessions") or []) for a in advs)
    runbook_count = sum(1 for a in advs for s in (a.get("sessions") or []) if s.get("runbook"))
    lines.append(f"- Encounters: **{enc_count}**")
    lines.append(f"- Sessions: **{ses_count}**")
    lines.append(f"- Runbooks saved: **{runbook_count}**")
    lines.append("")

    lines.append("## Player characters")
    for entry in pcs:
        pc = entry.get("pc") or {}
        name = pc.get("character_name", "?")
        cls = pc.get("character_class", "?")
        race = pc.get("race", "?")
        lvl = pc.get("level", "?")
        hp = f"{pc.get('hp_current', '?')}/{pc.get('hp_max', '?')}"
        gp = pc.get("gp", 0)
        n_sp = len(entry.get("spells") or [])
        n_inv = len(entry.get("inventory") or [])
        lines.append(
            f"- **{name}** — Lv{lvl} {race} {cls} · HP {hp} · gp {gp} · "
            f"{n_sp} spells · {n_inv} inventory rows"
        )
    lines.append("")

    lines.append("## NPCs")
    for npc in npcs:
        name = npc.get("name", "?")
        role = npc.get("role") or "—"
        revealed = npc.get("is_revealed", True)
        lines.append(f"- **{name}** ({role}) {'[hidden]' if not revealed else ''}")
    lines.append("")

    lines.append("## Adventures and sessions")
    for adv_entry in advs:
        adv = adv_entry.get("adventure") or {}
        lines.append(f"### {adv.get('title', '?')}")
        encs = adv_entry.get("encounters") or []
        if encs:
            lines.append("Encounters:")
            for e in encs:
                lines.append(f"  - {e.get('name', '?')} ({e.get('difficulty', '?')})")
        sess = adv_entry.get("sessions") or []
        for s_entry in sess:
            s = s_entry.get("session") or {}
            has_runbook = "✓" if s_entry.get("runbook") else "—"
            lines.append(
                f"- Session {s.get('session_number', '?')}: "
                f"{s.get('title', '?')} · {s.get('status', '?')} · runbook {has_runbook}"
            )
        lines.append("")

    manifest_path.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    """Parse args, snapshot the campaign, write JSON + MANIFEST.md."""
    p = argparse.ArgumentParser(description="Backup The Severance campaign.")
    p.add_argument("--api-base", default=os.environ.get("QUESTLAB_API_BASE", DEFAULT_API_BASE))
    p.add_argument("--dm-email", default=os.environ.get("CURRENT_USER_EMAIL"))
    p.add_argument("--campaign-id", default=DEFAULT_CAMPAIGN_ID)
    p.add_argument("--out-dir", default=DEFAULT_OUT_DIR)
    args = p.parse_args()

    if not args.dm_email:
        print("error: pass --dm-email or set CURRENT_USER_EMAIL.", file=sys.stderr)
        return 2

    timestamp = datetime.utcnow().strftime("%Y%m%d-%H%M%SZ")
    out_root = Path(args.out_dir) / timestamp
    out_root.mkdir(parents=True, exist_ok=True)

    print(f"Backing up campaign {args.campaign_id}")
    print(f"  -> {out_root}")
    print()
    try:
        snap = snapshot_campaign(args.api_base, args.campaign_id, args.dm_email)
    except urllib.error.HTTPError as exc:
        print(f"FAIL HTTP {exc.code}: {exc.read().decode()[:300]}")
        return 1
    except Exception as exc:
        print(f"FAIL {type(exc).__name__}: {exc}")
        return 1

    json_path = out_root / "snapshot.json"
    json_path.write_text(json.dumps(snap, indent=2, sort_keys=True), encoding="utf-8")

    manifest_path = out_root / "MANIFEST.md"
    write_manifest(snap, manifest_path)

    size_kb = json_path.stat().st_size / 1024
    print()
    print(f"OK — snapshot.json ({size_kb:.1f} KB)")
    print("OK — MANIFEST.md")
    print(f"Backup dir: {out_root}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
