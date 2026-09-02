"""Import maps from the local Czepeku library (./maps) into a campaign.

The 3 GB library lives in ./maps (gitignored — never committed). This
script browses it, web-optimizes a chosen image, uploads it through the
live API's /uploads/map (Vercel Blob), and registers it as a battle map
— stage-ready in the HUD. Runs locally against prod: no push, no deploy.

Licensing note: Czepeku maps are Patreon-licensed for personal use at
your own table. Fine for The Severance; do not ship them inside a
marketed/demo build.

Examples:
    # Browse what's synced so far
    python scripts/import_czepeku.py --list
    python scripts/import_czepeku.py --list --pack swamp

    # Import one variant (fuzzy pack + variant match)
    python scripts/import_czepeku.py --pack "Bullywug Swamp" --variant Day \\
        --name "The Croaking Mire" --grid 140

    # Any exact file also works
    python scripts/import_czepeku.py --file "maps/Windmill Farm/WindmillFarm_Night.jpeg"

    # Optional GPT restyle before upload (lossy: output is 1536x1024)
    python scripts/import_czepeku.py --pack Windmill --variant Day \\
        --restyle "make it autumnal, fey-touched, amber leaves"
"""

from __future__ import annotations

import argparse
import io
import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

import httpx  # noqa: E402
from PIL import Image  # noqa: E402

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
MAPS_DIR = _ROOT / "maps"

# Board darkness adds the night — keep uploads bright and let the dial
# work (see dark-maps lesson). Web-optimize: cap the long edge, recompress.
MAX_EDGE = 4096
JPEG_QUALITY = 87
_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}


def _library() -> dict[str, list[Path]]:
    """Map pack-directory name -> its image files, skipping animated media."""
    packs: dict[str, list[Path]] = {}
    if not MAPS_DIR.is_dir():
        return packs
    for pack_dir in sorted(p for p in MAPS_DIR.iterdir() if p.is_dir()):
        files = sorted(
            f for f in pack_dir.rglob("*") if f.is_file() and f.suffix.lower() in _IMAGE_EXTS
        )
        if files:
            packs[pack_dir.name] = files
    return packs


def _pick(packs: dict[str, list[Path]], pack_q: str, variant_q: str | None) -> Path:
    """Fuzzy-resolve a pack and variant to exactly one file, or exit loudly."""
    matches = [name for name in packs if pack_q.lower() in name.lower()]
    if len(matches) != 1:
        sys.exit(f"Pack match for {pack_q!r}: {matches or 'none'} — be more specific.")
    files = packs[matches[0]]
    if variant_q:
        files = [f for f in files if variant_q.lower() in f.stem.lower()]
    if len(files) != 1:
        shown = "\n  ".join(f.stem for f in files[:30]) or "none"
        sys.exit(f"Variant match in {matches[0]!r} is not unique:\n  {shown}")
    return files[0]


def _prettify(stem: str) -> str:
    """Turn 'GL_AgesOfTheValeInn_Indoors_Fog' into a readable map name."""
    parts = [p for p in stem.replace("-", "_").split("_") if p and not p.isupper()]
    words: list[str] = []
    for part in parts:
        # Split CamelCase runs into words.
        buf = ""
        for ch in part:
            if ch.isupper() and buf and not buf[-1].isupper():
                words.append(buf)
                buf = ch
            else:
                buf += ch
        words.append(buf)
    return " ".join(words)[:120] or stem[:120]


def _optimize(path: Path) -> tuple[bytes, int, int]:
    """Downscale to MAX_EDGE and recompress to JPEG; return (bytes, w, h)."""
    img = Image.open(path).convert("RGB")
    if max(img.size) > MAX_EDGE:
        img.thumbnail((MAX_EDGE, MAX_EDGE), Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue(), img.width, img.height


def _restyle(data: bytes, prompt: str) -> tuple[bytes, int, int]:
    """GPT edit pass (lossy — 1536x1024 output). Requires OPENAI_API_KEY."""
    from dotenv import load_dotenv

    load_dotenv(_ROOT / ".env")
    from integrations.openai_client import edit_image

    full = (
        f"{prompt}. Keep the same top-down battle-map layout and scale. "
        "Bright, evenly lit painterly cartography — do NOT darken the scene."
    )
    out = edit_image(full, data, size="1536x1024", quality="high")
    img = Image.open(io.BytesIO(out))
    return out, img.width, img.height


def main() -> None:
    """CLI entry point."""
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--list", action="store_true", help="browse the library")
    ap.add_argument("--pack", help="pack directory (fuzzy)")
    ap.add_argument("--variant", help="variant filename fragment (fuzzy)")
    ap.add_argument("--file", help="exact path to one image (overrides pack/variant)")
    ap.add_argument("--name", help="battle map name (default: prettified filename)")
    ap.add_argument("--grid", type=int, help="grid size in px, if known")
    ap.add_argument("--restyle", help="GPT edit prompt applied before upload (lossy)")
    ap.add_argument("--campaign", default=DEFAULT_CAMPAIGN_ID)
    ap.add_argument("--api", default=os.environ.get("QUESTLAB_API", DEFAULT_API_BASE))
    ap.add_argument("--dm-email", default="justinray5@outlook.com")
    ap.add_argument("--dry-run", action="store_true", help="optimize only, no upload")
    args = ap.parse_args()

    packs = _library()
    if args.list:
        needle = (args.pack or "").lower()
        for pack, files in packs.items():
            if needle and needle not in pack.lower():
                continue
            print(f"{pack}  ({len(files)} variants)")
            for f in files:
                print(f"  {f.stem}")
        if not packs:
            print("maps/ is empty or still syncing.")
        return

    if args.file:
        src = Path(args.file)
        if not src.is_file():
            sys.exit(f"No such file: {src}")
    elif args.pack:
        src = _pick(packs, args.pack, args.variant)
    else:
        sys.exit("Give --list, --file, or --pack (see --help).")

    print(f"Source: {src.relative_to(_ROOT) if src.is_relative_to(_ROOT) else src}")
    data, width, height = _optimize(src)
    print(f"Optimized: {width}x{height}, {len(data) / 1e6:.1f} MB")

    if args.restyle:
        print(f"Restyling via GPT: {args.restyle!r} …")
        data, width, height = _restyle(data, args.restyle)
        print(f"Restyled: {width}x{height}, {len(data) / 1e6:.1f} MB")

    name = args.name or _prettify(src.stem)
    if args.dry_run:
        print(f"[dry-run] would upload as {name!r} (grid={args.grid})")
        return

    headers = {AUTH_HEADER: args.dm_email}
    up = httpx.post(
        f"{args.api}/uploads/map",
        headers=headers,
        files={"file": (f"{src.stem}.jpg", data, "image/jpeg")},
        timeout=300.0,
    )
    up.raise_for_status()
    image_url = up.json()["url"]
    print(f"Uploaded: {image_url}")

    body = {
        "name": name,
        "image_url": image_url,
        "width": width,
        "height": height,
        "grid_size": args.grid,
    }
    created = httpx.post(
        f"{args.api}/campaigns/{args.campaign}/battle-maps",
        headers=headers,
        json=body,
        timeout=120.0,
    )
    created.raise_for_status()
    print(f"Battle map created: {created.json()['id']}  ({name!r}) — stage it from the HUD.")


if __name__ == "__main__":
    main()
