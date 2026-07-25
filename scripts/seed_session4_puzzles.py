"""Seed Saturday's two puzzles into the Puzzle Workbench (Plan 55).

  1. THE REFRAIN — a 13-glyph substitution board resolving to
     COMEHOMECHILD, with E and H pre-known (Maren's two sounds).
  2. HALVE'S PAGE — the Session 2 cipher prop: Appendix B enciphered
     with the key AELIM (Vigenère, spaces skipped), so the in-app
     decoder reproduces the real letters the table works by hand.

Idempotent: skips a puzzle whose title already exists in the campaign.

Usage:
    python scripts/seed_session4_puzzles.py
    python scripts/seed_session4_puzzles.py --api http://localhost:8000/api
"""

import argparse
import json
import sys
import urllib.error
import urllib.request

sys.stdout.reconfigure(encoding="utf-8", errors="replace")

CAMPAIGN_ID = "80b6f517-d124-4fea-9435-8e727f3171a9"
HEADERS = {
    "X-MS-CLIENT-PRINCIPAL-NAME": "justinray5@outlook.com",
    "Content-Type": "application/json",
}
ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
KEY = "AELIM"

# Master script Appendix B — the decoded page, read aloud in Maren's voice.
PLAINTEXT = (
    "TO WHOEVER HOLDS THIS AFTER I AM GONE. I WILL NOT PRETEND THE WORK IS "
    "PAINLESS. THREE LIGHTS ARE DARK NOW AND THE FOURTH IS CLOSE. THE WEAVER "
    "IS DYING. SHE HAS BEEN DYING SINCE LONG BEFORE YOUR GRANDMOTHER DREW HER "
    "FIRST BREATH, AND EVERY LANTERN I PUT OUT IS A MERCY, THOUGH NO WARM "
    "LITTLE TOWN WILL EVER NAME IT SO. I HAVE FOUND THE FIVE AT LAST. THE "
    "ANCHOR AND THE VESSEL ARE AMONG THEM. THE WORLD TOOK ALL THIS TIME TO "
    "MAKE THEM FOR ME. BUT THERE IS ANOTHER HAND AT THE WORK NOW. IT IS NOT "
    "MINE. IT IS CLUMSY, AND IT LEAVES WOUNDS THAT WILL NOT CLOSE. I MUST "
    "REACH THE NEXT SHRINE BEFORE IT DOES. THE NAME IS THE KEY. IT ALWAYS "
    "WAS. DO NOT GRIEVE THE DARK. THE DARK IS ONLY THE WORLD LEARNING HOW TO "
    "SLEEP AGAIN."
)


def encipher(plaintext: str, key: str) -> str:
    """Vigenère-encipher, advancing the key only on letters.

    Args:
        plaintext: The message (letters + punctuation).
        key: The repeating key.

    Returns:
        The ciphertext, punctuation preserved in place.
    """
    key_alpha = [c for c in key.upper() if c.isalpha()]
    out: list[str] = []
    n = 0
    for ch in plaintext:
        if ch.isalpha():
            shift = ALPHA.index(key_alpha[n % len(key_alpha)])
            out.append(ALPHA[(ALPHA.index(ch.upper()) + shift) % 26])
            n += 1
        else:
            out.append(ch)
    return "".join(out)


REFRAIN = {
    "kind": "glyph",
    "title": "The Refrain (thirteen marks)",
    "config": {
        "tokens": [
            "g1",
            "g2",
            "g3",
            "g4",
            "g5",
            "g2",
            "g3",
            "g4",
            "g1",
            "g5",
            "g6",
            "g7",
            "g8",
        ],
        "mapping": {
            "g1": "C",
            "g2": "O",
            "g3": "M",
            "g4": "E",
            "g5": "H",
            "g6": "I",
            "g7": "L",
            "g8": "D",
        },
        "preknown": {"g4": "E", "g5": "H"},
        "answer": "COMEHOMECHILD",
        "hide_spaces": True,
    },
}


def call(api: str, method: str, path: str, body=None, timeout=60):
    """Call the API; return parsed JSON (or None)."""
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(f"{api}{path}", data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req, timeout=timeout) as res:
        raw = res.read()
        return json.loads(raw) if raw else None


def main() -> None:
    """Seed both puzzles, skipping any that already exist."""
    parser = argparse.ArgumentParser()
    parser.add_argument("--api", default="https://questlab-api-9yhe.onrender.com/api")
    api = parser.parse_args().api.rstrip("/")

    ciphertext = encipher(PLAINTEXT, KEY)
    page = {
        "kind": "cipher",
        "title": "Halve's Page (warded)",
        "config": {
            "key": KEY,
            "ciphertext": ciphertext,
            "plaintext": PLAINTEXT,
            "intro": "The marks will not hold still. The page does not want reading.",
        },
    }

    existing = {p["title"] for p in call(api, "GET", f"/campaigns/{CAMPAIGN_ID}/puzzles")}
    for spec in (REFRAIN, page):
        if spec["title"] in existing:
            print(f"= {spec['title']} already seeded")
            continue
        try:
            created = call(api, "POST", f"/campaigns/{CAMPAIGN_ID}/puzzles", spec)
            print(f"+ {created['title']}  ->  /puzzle/{created['id']}")
        except urllib.error.HTTPError as exc:
            print(f"! {spec['title']} FAILED {exc.code}: {exc.read()[:160]}")

    # Sanity: the crib from the addendum must hold.
    head = ciphertext[:10]
    print(f"\ncipher head: {head!r} (addendum crib: 'TS HPAEZPZ')")
    print("Player links live at <app>/puzzle/<id>; drive from campaign → 🧩 Puzzles.")


if __name__ == "__main__":
    main()
