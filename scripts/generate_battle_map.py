"""Generate a battle-map image with gpt-image-1 and register it in the library.

Two-phase so the DM can inspect before spending an upload:
    1. Generate: calls OpenAI via integrations.openai_client, saves a local
       PNG (default under ./data/generated-maps/).
    2. Upload (--upload): pushes the PNG through the deployed API
       (POST /uploads/map -> Vercel Blob) and creates the BattleMap row.

The image is generated WITHOUT a grid — the Table View and 3D board draw
their own overlay from grid_size, which AI-painted grids never align with.

Usage:
    python scripts/generate_battle_map.py --name "The Waystone Road" \
        --hints "forest road forking at an ancient standing stone" \
        --dm-email you@example.com                # generate + save only
    python scripts/generate_battle_map.py --name "The Waystone Road" \
        --from-file data/generated-maps/the-waystone-road.png \
        --dm-email you@example.com --upload       # upload the inspected file
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_REPO_ROOT))

import httpx  # noqa: E402

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
DEFAULT_CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
WIDTH, HEIGHT = 1536, 1024  # gpt-image-1 landscape

_MAP_STYLE = (
    "STRICT ORTHOGRAPHIC TOP-DOWN fantasy battle map for a tabletop RPG: the "
    "camera looks straight down at 90 degrees — zero perspective, no tilt, no "
    "horizon. Every object is seen exactly from above: tree canopies are "
    "round leaf clusters from directly overhead (no trunks, no side foliage), "
    "standing stones and walls show ONLY their top cross-section, no side "
    "faces of anything anywhere. Painterly, high-detail environment art, "
    "soft even light with small contact shadows. Terrain fills the entire "
    "frame edge to edge. STRICTLY NO grid lines, NO text, NO labels, NO "
    "characters or creatures, NO UI elements, NO borders."
)


def _load_dotenv(path: Path) -> None:
    """Load KEY=value lines into the environment without overwriting or printing."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def _slug(name: str) -> str:
    """Filesystem-safe slug for the output filename."""
    return re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-") or "map"


def _build_prompt(name: str, hints: str) -> str:
    """Compose the full image prompt from the map name + scene hints."""
    scene = hints.strip() or name
    return f"Scene: {scene}. {_MAP_STYLE}"


def generate(name: str, hints: str, quality: str, out_dir: Path) -> Path:
    """Generate the map image and save it locally; returns the PNG path."""
    from integrations.openai_client import generate_image  # noqa: E402

    prompt = _build_prompt(name, hints)
    print(f"Generating '{name}' ({WIDTH}x{HEIGHT}, quality={quality}) …")
    print(f"  prompt: {prompt[:140]}…")
    png = generate_image(prompt, size="1536x1024", quality=quality)  # type: ignore[arg-type]
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{_slug(name)}.png"
    out.write_bytes(png)
    print(f"  saved {len(png) // 1024} KB -> {out}")
    return out


def upload(
    png_path: Path, name: str, grid: int, api_base: str, campaign_id: str, dm_email: str
) -> None:
    """Upload the PNG via the deployed API and create the BattleMap row."""
    headers = {AUTH_HEADER: dm_email}
    data = png_path.read_bytes()
    print(f"Uploading {png_path.name} ({len(data) // 1024} KB) to {api_base} …")
    resp = httpx.post(
        f"{api_base}/uploads/map",
        headers=headers,
        files={"file": (png_path.name, data, "image/png")},
        timeout=180.0,
    )
    resp.raise_for_status()
    image_url = resp.json()["url"]
    print(f"  blob: {image_url}")
    resp = httpx.post(
        f"{api_base}/campaigns/{campaign_id}/battle-maps",
        headers=headers,
        json={
            "name": name,
            "image_url": image_url,
            "width": WIDTH,
            "height": HEIGHT,
            "grid_size": grid,
        },
        timeout=60.0,
    )
    resp.raise_for_status()
    print(f"  ✓ battle map '{name}' created (id {resp.json()['id']}, grid {grid}px)")


def main() -> int:
    """Parse args; generate and/or upload."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--name", required=True, help="Battle-map name in the library")
    parser.add_argument("--hints", default="", help="Scene description folded into the prompt")
    parser.add_argument("--quality", default="high", choices=["low", "medium", "high"])
    parser.add_argument("--grid", type=int, default=64, help="Overlay grid size in px (>=8)")
    parser.add_argument("--from-file", default=None, help="Skip generation; use this PNG")
    parser.add_argument("--upload", action="store_true", help="Upload + register in the library")
    parser.add_argument("--out-dir", default=str(_REPO_ROOT / "data" / "generated-maps"))
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--campaign-id", default=DEFAULT_CAMPAIGN_ID)
    parser.add_argument("--dm-email", required=True)
    args = parser.parse_args()

    _load_dotenv(_REPO_ROOT / ".env")

    if args.from_file:
        png_path = Path(args.from_file)
        if not png_path.exists():
            print(f"✗ {png_path} not found")
            return 1
    else:
        png_path = generate(args.name, args.hints, args.quality, Path(args.out_dir))

    if args.upload:
        upload(png_path, args.name, args.grid, args.api_base, args.campaign_id, args.dm_email)
    else:
        print("Not uploaded (pass --upload after inspecting the PNG).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
