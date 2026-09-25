"""Put the Summer Games crowd on Session 8's board (Plan 114).

Eight knots of four bystanders, ringing the festival ground at the foot of the
Candlestair and leaving the middle clear for the party. Run this once the
backend carrying the crowd fields is deployed — an older API silently drops
them, and the knots come back as ordinary tokens with no numbers.

    python scripts/seed_s8_crowd.py <session-id> [--api URL] [--reset]

``--reset`` puts every knot back to four standing and nobody lost, which is how
you rewind the scene if you want to run it again.
"""

import argparse
import json
import sys
import urllib.error
import urllib.request

DEFAULT_API = "https://questlab-api-9yhe.onrender.com/api"
DM_EMAIL = "justinray5@outlook.com"

# The Candlestair, as fractions of the picture. The stair runs up the middle,
# so the knots sit either side of it and along the bottom edge.
KNOTS: list[tuple[float, float]] = [
    (0.15, 0.895),
    (0.30, 0.883),
    (0.70, 0.883),
    (0.85, 0.895),
    (0.12, 0.962),
    (0.28, 0.986),
    (0.72, 0.986),
    (0.88, 0.962),
]
PER_KNOT = 4


def call(api: str, method: str, path: str, body: dict | None = None) -> dict:
    """Call the QuestLab API as the DM.

    Args:
        api: Base API URL.
        method: HTTP verb.
        path: Path under the API root.
        body: JSON body, or None.

    Returns:
        The decoded response, or an empty dict.

    Raises:
        SystemExit: If the server rejects the call.
    """
    req = urllib.request.Request(
        api + path,
        method=method,
        headers={"X-MS-CLIENT-PRINCIPAL-NAME": DM_EMAIL, "Content-Type": "application/json"},
        data=json.dumps(body).encode() if body is not None else None,
    )
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raise SystemExit(f"{method} {path} -> {exc.code}: {exc.read().decode()[:400]}")


def main() -> int:
    """Place or reset the crowd knots.

    Returns:
        0 on success, 1 if the API dropped the crowd fields.
    """
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("session_id")
    ap.add_argument("--api", default=DEFAULT_API)
    ap.add_argument("--reset", action="store_true", help="Back to four standing, nobody lost.")
    args = ap.parse_args()

    state = call(args.api, "GET", f"/sessions/{args.session_id}/table")
    # The player projection is the one place that hands back the staged map's
    # pixel size without needing to know its campaign.
    board = (call(args.api, "GET", f"/table/{args.session_id}") or {}).get("map")
    if not board:
        raise SystemExit("No map staged on this session — stage the Candlestair first.")

    existing = {
        t["id"]: t for t in state.get("tokens") or [] if str(t.get("id", "")).startswith("knot-")
    }
    # Running this again mid-scene must not quietly wipe the tally the whole
    # session hangs on, so counts are preserved unless --reset says otherwise.
    live = any((t.get("hurt") or t.get("dying") or t.get("dead")) for t in existing.values())
    if live and not args.reset:
        print(
            "knots are already in play (someone is down or lost); "
            "re-placing positions only. Pass --reset to start the scene over."
        )

    others = [t for t in state.get("tokens") or [] if not str(t.get("id", "")).startswith("knot-")]
    knots = []
    for i, (u, v) in enumerate(KNOTS, start=1):
        was = existing.get(f"knot-{i}", {}) if not args.reset else {}
        knots.append(
            {
                "id": f"knot-{i}",
                "kind": "custom",
                "ref_id": None,
                "label": f"Crowd {i}",
                "image_url": None,
                "x": round(u * board["width"]),
                "y": round(v * board["height"]),
                "size": 1.4,
                "color": "#8aa35c",
                "crowd": was.get("crowd", PER_KNOT),
                "hurt": was.get("hurt", 0),
                "dying": was.get("dying", 0),
                "dead": was.get("dead", 0),
            }
        )
    call(args.api, "PATCH", f"/sessions/{args.session_id}/table", {"tokens": others + knots})

    back = call(args.api, "GET", f"/sessions/{args.session_id}/table")
    kept = [t for t in back.get("tokens") or [] if t.get("crowd") is not None]
    if len(kept) != len(KNOTS):
        print(
            f"FAILED: {len(kept)} of {len(KNOTS)} knots kept their numbers.\n"
            "The API is running a build without the crowd fields - deploy first.",
            file=sys.stderr,
        )
        return 1
    what = "reset" if args.reset else "placed"
    standing = sum(int(t.get("crowd") or 0) for t in kept)
    lost = sum(int(t.get("dead") or 0) for t in kept)
    print(
        f"{what} {len(kept)} crowd knots on session {args.session_id} "
        f"— {standing} standing, {lost} lost"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
