"""Generate + upload subclass-flavored card-background art (HUD party cards).

Four dark abstract textures, one per current PC subclass. Dark and
low-contrast on purpose: the card lays a scrim over them and the text
must stay readable. Uploaded via the app's /uploads/map lane (Vercel
Blob); prints the URL map to paste into SUBCLASS_CARD_ART.

Usage:
    python scripts/gen_subclass_card_art.py --dm-email you@example.com
"""

from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(_ROOT))

import httpx  # noqa: E402

DEFAULT_API_BASE = "https://questlab-api-9yhe.onrender.com/api"
AUTH_HEADER = "X-MS-CLIENT-PRINCIPAL-NAME"
OUT_DIR = _ROOT / "data" / "card-art"

_STYLE = (
    "Abstract texture for a UI card background: DARK, moody, low contrast, "
    "subtle — light text must remain readable over it. Edge-to-edge, no "
    "vignette. STRICTLY NO text, NO letters, NO creatures, NO characters, "
    "NO UI elements, NO borders."
)

ART = {
    "soulknife": (
        "Soulknife",
        "deep midnight blue-black psionic energy field, a few glowing cyan psychic "
        "blade streaks and faint neon filaments drifting through darkness",
    ),
    "circle-of-stars": (
        "Circle of Stars",
        "an ancient celestial star chart on a deep indigo night sky, fine faint gold "
        "constellation lines connecting tiny stars, delicate astronomical rings",
    ),
    "oath-of-the-ancients": (
        "Oath of the Ancients",
        "deep forest green-black tangle of ancient thorny vines and small leaves, a few "
        "faint golden fireflies glowing among the thorns",
    ),
    "wild-magic": (
        "Wild Magic",
        "chaotic ribbons of many vivid colors — magenta, teal, gold, violet — twisting "
        "through near-black darkness with tiny scattered sparks",
    ),
}


def _load_dotenv(path: Path) -> None:
    """Load KEY=value lines into the environment without printing them."""
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8", errors="ignore").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def main() -> int:
    """Generate each texture, upload it, print the subclass→URL map."""
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--api-base", default=DEFAULT_API_BASE)
    parser.add_argument("--dm-email", required=True)
    args = parser.parse_args()

    _load_dotenv(_ROOT / ".env")
    from integrations.openai_client import generate_image

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    urls: dict[str, str] = {}
    for slug, (subclass, scene) in ART.items():
        png_path = OUT_DIR / f"{slug}.png"
        if png_path.exists():
            print(f"  · {png_path.name} exists — reusing local file")
            png = png_path.read_bytes()
        else:
            print(f"Generating {subclass} …")
            png = generate_image(f"Scene: {scene}. {_STYLE}", size="1536x1024", quality="medium")
            png_path.write_bytes(png)
            print(f"  ✓ {png_path.name} ({len(png) // 1024} KB)")
        resp = httpx.post(
            f"{args.api_base}/uploads/map",
            headers={AUTH_HEADER: args.dm_email},
            files={"file": (f"card-{slug}.png", png, "image/png")},
            timeout=180.0,
        )
        resp.raise_for_status()
        urls[subclass] = resp.json()["url"]
        print(f"  ✓ uploaded → {urls[subclass]}")

    print("\nPaste into SUBCLASS_CARD_ART:")
    for subclass, url in urls.items():
        print(f'  "{subclass}": "{url}",')
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
