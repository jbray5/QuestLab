"""Find (and optionally delete) orphaned Vercel Blob files.

Since the Pro upgrade, every regenerated portrait/figure/map leaves its
predecessor behind in the blob store, billed forever. This script lists
the store, crawls the live API for every blob URL still referenced, and
reports the difference. Deletion is opt-in and age-gated.

Safety model:
  - DRY RUN by default: prints the orphan report, deletes nothing.
  - --delete only removes blobs that are BOTH unreferenced and older
    than --min-age-days (default 2) — an upload mid-generation is never
    swept before its DB row lands.
  - The referenced set is crawled from the API (all campaigns' art,
    catalogs, table tokens, crier avatars). Add endpoints here if a new
    art-bearing surface ships.

Examples:
    python scripts/sweep_blobs.py                 # report only
    python scripts/sweep_blobs.py --delete        # sweep orphans >2 days old
    python scripts/sweep_blobs.py --delete --min-age-days 7
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

import httpx  # noqa: E402
from dotenv import load_dotenv  # noqa: E402

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
BLOB_API = "https://blob.vercel-storage.com"
_BLOB_URL_RE = re.compile(r"https://[a-z0-9]+\.public\.blob\.vercel-storage\.com/[^\"'\\\s]+")


def _blob_token() -> str:
    """Read the blob RW token from the environment / .env."""
    load_dotenv(_ROOT / ".env")
    token = os.environ.get("BLOB_READ_WRITE_TOKEN", "").strip()
    if not token:
        sys.exit("BLOB_READ_WRITE_TOKEN is not set (check .env).")
    return token


def list_store(token: str) -> list[dict]:
    """Return every blob in the store: {url, pathname, size, uploadedAt}."""
    blobs: list[dict] = []
    cursor: str | None = None
    while True:
        params = {"limit": "1000"}
        if cursor:
            params["cursor"] = cursor
        r = httpx.get(
            BLOB_API,
            params=params,
            headers={"authorization": f"Bearer {token}"},
            timeout=60.0,
        )
        r.raise_for_status()
        body = r.json()
        blobs.extend(body.get("blobs", []))
        cursor = body.get("cursor")
        if not body.get("hasMore"):
            return blobs


def referenced_urls(api: str, dm_email: str) -> set[str]:
    """Crawl the API for every blob URL any surface still points at."""
    headers = {AUTH_HEADER: dm_email}
    found: set[str] = set()

    def scan(path: str) -> object | None:
        r = httpx.get(f"{api}{path}", headers=headers, timeout=120.0)
        if r.status_code != 200:
            print(f"  [skip {r.status_code}] {path}")
            return None
        found.update(_BLOB_URL_RE.findall(r.text))
        return r.json()

    campaigns = scan("/campaigns") or []
    scan("/monsters")
    scan("/items")
    scan("/weapons")
    for campaign in campaigns:
        cid = campaign["id"]
        for sub in ("characters", "npcs", "battle-maps", "shops", "puzzles"):
            scan(f"/campaigns/{cid}/{sub}")
        for crier_sub in ("channels", "npcs", "posts"):
            scan(f"/campaigns/{cid}/crier/{crier_sub}")
        adventures = scan(f"/campaigns/{cid}/adventures") or []
        for adventure in adventures:
            sessions = scan(f"/adventures/{adventure['id']}/sessions") or []
            for game_session in sessions:
                # Table tokens can carry ad-hoc art no other row references.
                scan(f"/table/{game_session['id']}")
    return found


def main() -> None:
    """CLI entry point."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--delete", action="store_true", help="actually delete orphans")
    ap.add_argument("--min-age-days", type=float, default=2.0)
    ap.add_argument("--api", default=os.environ.get("QUESTLAB_API", DEFAULT_API_BASE))
    ap.add_argument("--dm-email", default="justinray5@outlook.com")
    args = ap.parse_args()

    token = _blob_token()
    print("Listing blob store…")
    blobs = list_store(token)
    total_mb = sum(b.get("size", 0) for b in blobs) / 1e6
    print(f"  {len(blobs)} blobs, {total_mb:.1f} MB total")

    print("Crawling API for referenced URLs…")
    refs = referenced_urls(args.api, args.dm_email)
    print(f"  {len(refs)} blob URLs referenced")

    cutoff = datetime.now(UTC) - timedelta(days=args.min_age_days)
    orphans: list[dict] = []
    young = 0
    for b in blobs:
        if b["url"] in refs:
            continue
        uploaded = datetime.fromisoformat(b["uploadedAt"].replace("Z", "+00:00"))
        if uploaded > cutoff:
            young += 1
            continue
        orphans.append(b)

    orphan_mb = sum(b.get("size", 0) for b in orphans) / 1e6
    print(f"\nOrphans older than {args.min_age_days:g}d: {len(orphans)} ({orphan_mb:.1f} MB)")
    if young:
        print(f"Unreferenced but too young to sweep: {young}")
    for b in sorted(orphans, key=lambda x: -x.get("size", 0))[:20]:
        print(f"  {b.get('size', 0) / 1e6:7.2f} MB  {b['pathname']}")
    if len(orphans) > 20:
        print(f"  … and {len(orphans) - 20} more")

    if not args.delete:
        print("\nDry run — pass --delete to remove them.")
        return
    if not orphans:
        print("Nothing to delete.")
        return

    print(f"\nDeleting {len(orphans)} orphans…")
    urls = [b["url"] for b in orphans]
    for i in range(0, len(urls), 100):
        chunk = urls[i : i + 100]
        r = httpx.post(
            f"{BLOB_API}/delete",
            json={"urls": chunk},
            headers={"authorization": f"Bearer {token}"},
            timeout=120.0,
        )
        r.raise_for_status()
        print(f"  deleted {i + len(chunk)}/{len(urls)}")
    print(f"Done — reclaimed ~{orphan_mb:.1f} MB.")


if __name__ == "__main__":
    main()
