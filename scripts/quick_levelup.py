"""Quick in-session PC updates against the live API (Session 6+).

One command per table event — level bumps, subclass picks, HP, spells,
feats, notes — so real-time updates during play are one-liners. Runs
locally against the deployed API: no push, no deploy, no restart.

Examples:
    python scripts/quick_levelup.py --dm-email me@x.com --name nya \\
        --level 3 --subclass "Draconic Sorcery" --hp-max 24
    python scripts/quick_levelup.py --dm-email me@x.com --name willa \\
        --learn "Moonbeam" --learn "Pass Without Trace"
    python scripts/quick_levelup.py --dm-email me@x.com --name creed --hp 23
    python scripts/quick_levelup.py --dm-email me@x.com --name thane \\
        --feat "Skulker" --note "L3: picked Thief" --dry-run

Feature sync runs automatically whenever --level or --subclass is given
(grants any newly qualified class features); force it with --sync.
"""

from __future__ import annotations

import argparse
import sys
import urllib.parse
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

import httpx  # noqa: E402

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"


def _spell_id(api: str, headers: dict, name: str) -> str | None:
    """Resolve a spell name to its catalog UUID (exact, case-insensitive)."""
    qs = urllib.parse.urlencode({"q": name})
    r = httpx.get(f"{api}/spells?{qs}", headers=headers, timeout=60.0)
    r.raise_for_status()
    for s in r.json():
        if str(s.get("name", "")).casefold() == name.casefold():
            return s["id"]
    return None


def main() -> int:
    """Apply the requested updates to one PC."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    p = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    p.add_argument("--api-base", default=DEFAULT_API_BASE)
    p.add_argument("--campaign-id", default=DEFAULT_CAMPAIGN_ID)
    p.add_argument("--dm-email", required=True)
    p.add_argument("--name", required=True, help="PC name (case-insensitive substring).")
    p.add_argument("--level", type=int, default=None)
    p.add_argument("--subclass", default=None)
    p.add_argument("--hp-max", type=int, default=None)
    p.add_argument("--hp", type=int, default=None, help="Current HP.")
    p.add_argument("--learn", action="append", default=[], help="Spell to add (known+prepared).")
    p.add_argument("--forget", action="append", default=[], help="Spell to remove.")
    p.add_argument("--feat", action="append", default=[], help="Feat to append.")
    p.add_argument("--note", default=None, help="Line to append to the PC's notes.")
    p.add_argument("--sync", action="store_true", help="Force a class-feature sync.")
    p.add_argument("--dry-run", action="store_true")
    args = p.parse_args()

    api, headers, dry = args.api_base, {AUTH_HEADER: args.dm_email}, args.dry_run

    r = httpx.get(f"{api}/campaigns/{args.campaign_id}/characters", headers=headers, timeout=120.0)
    r.raise_for_status()
    needle = args.name.casefold()
    pcs = [c for c in r.json() if needle in str(c["character_name"]).casefold()]
    if len(pcs) != 1:
        print(f"error: '{args.name}' matched {len(pcs)} PCs — be more specific.")
        return 1
    pc = pcs[0]
    print(
        f"{pc['character_name']} — L{pc['level']} {pc['character_class']}, "
        f"subclass={pc.get('subclass')!r}, HP {pc['hp_current']}/{pc['hp_max']}"
    )

    patch: dict = {}
    if args.level is not None and pc["level"] != args.level:
        patch["level"] = args.level
    if args.subclass is not None and pc.get("subclass") != args.subclass:
        patch["subclass"] = args.subclass
    if args.hp_max is not None and pc["hp_max"] != args.hp_max:
        patch["hp_max"] = args.hp_max
    if args.hp is not None and pc["hp_current"] != args.hp:
        patch["hp_current"] = args.hp
    for feat in args.feat:
        feats = patch.get("feats", list(pc.get("feats") or []))
        if feat not in feats:
            patch["feats"] = feats + [feat]
    if args.note:
        notes = pc.get("notes") or ""
        patch["notes"] = (notes.rstrip() + "\n" if notes.strip() else "") + args.note

    if patch:
        if dry:
            print(f"  [dry-run] PATCH {sorted(patch)}")
        else:
            httpx.patch(
                f"{api}/characters/{pc['id']}", headers=headers, json=patch, timeout=60.0
            ).raise_for_status()
            print(f"  ✓ patched {sorted(patch)}")
    else:
        print("  = no character fields to change")

    if args.forget:
        rows = httpx.get(
            f"{api}/characters/{pc['id']}/spells", headers=headers, timeout=60.0
        ).json()
        for name in args.forget:
            sid = _spell_id(api, headers, name)
            row = next((x for x in rows if str(x["spell_id"]) == str(sid)), None) if sid else None
            if row is None:
                print(f"  ⚠ forget: '{name}' not on the sheet")
                continue
            if dry:
                print(f"  [dry-run] DELETE spell {name}")
            else:
                httpx.delete(
                    f"{api}/characters/{pc['id']}/spells/{row['id']}",
                    headers=headers,
                    timeout=60.0,
                ).raise_for_status()
                print(f"  ✓ forgot {name}")

    for name in args.learn:
        sid = _spell_id(api, headers, name)
        if sid is None:
            print(f"  ⚠ learn: '{name}' not in the spell catalog")
            continue
        if dry:
            print(f"  [dry-run] POST spell {name}")
        else:
            resp = httpx.post(
                f"{api}/characters/{pc['id']}/spells",
                headers=headers,
                json={"spell_id": sid, "known": True, "prepared": True},
                timeout=60.0,
            )
            if resp.status_code < 400:
                print(f"  ✓ learned {name} (prepared)")
            else:
                print(f"  ⚠ learn '{name}': {resp.status_code} {resp.text[:120]}")

    if args.sync or "level" in patch or "subclass" in patch:
        if dry:
            print("  [dry-run] POST features/sync")
        else:
            granted = (
                httpx.post(
                    f"{api}/characters/{pc['id']}/features/sync", headers=headers, timeout=60.0
                )
                .json()
                .get("granted", [])
            )
            print(f"  ✓ feature sync: {', '.join(granted) if granted else '(nothing new)'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
