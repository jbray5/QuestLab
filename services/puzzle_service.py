"""Puzzle service — the Puzzle Workbench (Plan 55).

DM operations require campaign ownership. The player-facing projection and
its actions ride a capability URL (the puzzle UUID is the secret), the same
trust model as the Table View.

The hard rule from the spec: answers never cross the wire to players. The
service is the only place that reads ``config`` (mapping / key / plaintext);
``PuzzleProjection`` carries just what the table already knows.
"""

import logging
import uuid
from typing import Any, Optional

from sqlmodel import Session as DBSession

from db.repos.campaign_repo import CampaignRepo
from db.repos.puzzle_repo import PuzzleRepo
from domain.campaign import Campaign
from domain.puzzle import Puzzle, PuzzleCreate, PuzzleProjection, PuzzleRead, PuzzleUpdate
from integrations.event_bus import event_bus
from services import campaign_service

logger = logging.getLogger(__name__)

_ALPHA = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"


# ── Authz ─────────────────────────────────────────────────────────────────────


def _get_owned_campaign(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> Campaign:
    """Fetch a campaign, asserting the requester owns it."""
    campaign = CampaignRepo.get_by_id(db, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    campaign_service._assert_owner(campaign, dm_email)
    return campaign


def _get_owned_puzzle(db: DBSession, puzzle_id: uuid.UUID, dm_email: str) -> Puzzle:
    """Fetch a puzzle, asserting the requester owns its campaign."""
    puzzle = _get_puzzle(db, puzzle_id)
    _get_owned_campaign(db, puzzle.campaign_id, dm_email)
    return puzzle


def _get_puzzle(db: DBSession, puzzle_id: uuid.UUID) -> Puzzle:
    """Fetch a puzzle by id or raise."""
    puzzle = PuzzleRepo.get_by_id(db, puzzle_id)
    if puzzle is None:
        raise ValueError(f"Puzzle {puzzle_id} not found.")
    return puzzle


def _publish(puzzle: Puzzle) -> None:
    """Notify watchers that this puzzle changed (player views refetch)."""
    event_bus.publish(
        f"puzzle:{puzzle.id}",
        {"type": "puzzle.updated", "puzzle_id": str(puzzle.id)},
    )
    event_bus.publish(
        f"campaign:{puzzle.campaign_id}",
        {"type": "puzzle.updated", "puzzle_id": str(puzzle.id)},
    )


def _state(puzzle: Puzzle) -> dict[str, Any]:
    """Return a mutable copy of the puzzle's state dict."""
    return dict(puzzle.state or {})


def _save_state(db: DBSession, puzzle: Puzzle, state: dict[str, Any]) -> Puzzle:
    """Reassign state (JSON columns need whole-value assignment) and save."""
    puzzle.state = state
    saved = PuzzleRepo.save(db, puzzle)
    _publish(saved)
    return saved


# ── DM CRUD ───────────────────────────────────────────────────────────────────


def list_puzzles(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> list[PuzzleRead]:
    """List a campaign's puzzles for the workbench.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        PuzzleReads (with config — DM only).
    """
    _get_owned_campaign(db, campaign_id, dm_email)
    return [PuzzleRead.model_validate(p) for p in PuzzleRepo.list_for_campaign(db, campaign_id)]


def create_puzzle(
    db: DBSession, campaign_id: uuid.UUID, dm_email: str, data: PuzzleCreate
) -> PuzzleRead:
    """Create a puzzle in a campaign.

    Glyph puzzles start with their pre-known letters already assigned, so
    the board opens showing exactly what Maren knows.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        data: Kind, title, config.

    Returns:
        The created PuzzleRead.

    Raises:
        ValueError: On an unknown kind.
    """
    _get_owned_campaign(db, campaign_id, dm_email)
    if data.kind not in ("glyph", "cipher"):
        raise ValueError(f"Unknown puzzle kind '{data.kind}'.")
    state: dict[str, Any] = (
        {"assignments": dict(data.config.get("preknown") or {}), "attempts": []}
        if data.kind == "glyph"
        else {"phase": "warded", "locked": {}, "first_sentence_at": None}
    )
    row = Puzzle(
        campaign_id=campaign_id,
        kind=data.kind,
        title=data.title,
        config=data.config,
        state=state,
        allow_player_input=data.allow_player_input,
    )
    return PuzzleRead.model_validate(PuzzleRepo.create(db, row))


def update_puzzle(
    db: DBSession, puzzle_id: uuid.UUID, dm_email: str, data: PuzzleUpdate
) -> PuzzleRead:
    """Update a puzzle's title / config / player-input toggle.

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle.
        dm_email: Email of the requesting DM.
        data: Partial update payload.

    Returns:
        The refreshed PuzzleRead.
    """
    puzzle = _get_owned_puzzle(db, puzzle_id, dm_email)
    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(puzzle, field, value)
    saved = PuzzleRepo.save(db, puzzle)
    _publish(saved)
    return PuzzleRead.model_validate(saved)


def delete_puzzle(db: DBSession, puzzle_id: uuid.UUID, dm_email: str) -> None:
    """Delete a puzzle.

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle.
        dm_email: Email of the requesting DM.
    """
    puzzle = _get_owned_puzzle(db, puzzle_id, dm_email)
    PuzzleRepo.delete(db, puzzle)


def reset_puzzle(db: DBSession, puzzle_id: uuid.UUID, dm_email: str) -> PuzzleRead:
    """Reset a puzzle to its opening state (DM only).

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle.
        dm_email: Email of the requesting DM.

    Returns:
        The reset PuzzleRead.
    """
    puzzle = _get_owned_puzzle(db, puzzle_id, dm_email)
    config = puzzle.config or {}
    puzzle.solved = False
    state = (
        {"assignments": dict(config.get("preknown") or {}), "attempts": []}
        if puzzle.kind == "glyph"
        else {"phase": "warded", "locked": {}, "first_sentence_at": None}
    )
    return PuzzleRead.model_validate(_save_state(db, puzzle, state))


# ── Player-facing projection ──────────────────────────────────────────────────


def get_projection(db: DBSession, puzzle_id: uuid.UUID) -> PuzzleProjection:
    """Player-safe puzzle view — capability URL, no answers.

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle (the capability secret).

    Returns:
        The PuzzleProjection.

    Raises:
        ValueError: If the puzzle does not exist.
    """
    puzzle = _get_puzzle(db, puzzle_id)
    config = puzzle.config or {}
    state = puzzle.state or {}
    proj = PuzzleProjection(
        id=puzzle.id,
        kind=puzzle.kind,
        title=puzzle.title,
        solved=puzzle.solved,
        allow_player_input=puzzle.allow_player_input,
    )
    if puzzle.kind == "glyph":
        proj.tokens = list(config.get("tokens") or [])
        proj.assignments = dict(state.get("assignments") or {})
        proj.hide_spaces = bool(config.get("hide_spaces", True))
        proj.hum = sum(1 for a in (state.get("attempts") or []) if not a.get("correct"))
    else:
        proj.phase = str(state.get("phase") or "warded")
        proj.intro = str(config.get("intro") or "")
        # The ciphertext is on the physical prop the players already hold,
        # so it is safe once the ward breaks. Warded = swimming, unreadable.
        proj.ciphertext = str(config.get("ciphertext") or "")
        proj.locked = dict(state.get("locked") or {})
    return proj


# ── Glyph board actions ───────────────────────────────────────────────────────


def _assert_glyph(puzzle: Puzzle) -> None:
    """Raise unless this is a glyph puzzle."""
    if puzzle.kind != "glyph":
        raise ValueError("That puzzle is not a glyph board.")


def assign_glyph(
    db: DBSession, puzzle_id: uuid.UUID, glyph: str, letter: str, *, is_dm: bool = False
) -> PuzzleProjection:
    """Assign a letter to a glyph (empty letter clears it).

    The assignment propagates automatically: the projection maps every
    occurrence of that glyph through ``assignments``.

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle.
        glyph: The glyph token id.
        letter: Single letter, or "" to clear.
        is_dm: True when called from the DM route (bypasses the
            player-input toggle).

    Returns:
        The refreshed projection.

    Raises:
        ValueError: Wrong kind, unknown glyph, or a bad letter.
        PermissionError: Player input while the DM has it disabled.
    """
    puzzle = _get_puzzle(db, puzzle_id)
    _assert_glyph(puzzle)
    if not is_dm and not puzzle.allow_player_input:
        raise PermissionError("The DM is driving this board.")
    config = puzzle.config or {}
    if glyph not in (config.get("tokens") or []):
        raise ValueError(f"Unknown glyph '{glyph}'.")
    letter = letter.strip().upper()
    if letter and (len(letter) != 1 or letter not in _ALPHA):
        raise ValueError("Assign a single A-Z letter.")

    state = _state(puzzle)
    assignments = dict(state.get("assignments") or {})
    if letter:
        assignments[glyph] = letter
    else:
        assignments.pop(glyph, None)
    state["assignments"] = assignments
    saved = _save_state(db, puzzle, state)
    return get_projection(db, saved.id)


def submit_reading(db: DBSession, puzzle_id: uuid.UUID, reading: str) -> dict[str, Any]:
    """Record a full reading spoken aloud; scores it server-side (Plan 55).

    A wrong reading is not blocked — it's *logged*, and the projection's
    ``hum`` count drives the page-hum FX the DM narrates a consequence for.

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle.
        reading: The candidate phrase.

    Returns:
        ``{"correct": bool, "hum": int, "solved": bool}``.

    Raises:
        ValueError: If the puzzle is not a glyph board.
    """
    from datetime import datetime, timezone

    puzzle = _get_puzzle(db, puzzle_id)
    _assert_glyph(puzzle)
    config = puzzle.config or {}
    answer = str(config.get("answer") or "").upper()
    normalized = "".join(ch for ch in reading.upper() if ch.isalpha())
    correct = bool(answer) and normalized == answer

    state = _state(puzzle)
    attempts = list(state.get("attempts") or [])
    attempts.append(
        {
            "reading": reading.strip()[:120],
            "correct": correct,
            "at": datetime.now(timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds"),
        }
    )
    state["attempts"] = attempts
    if correct:
        # Solving reveals the full mapping on the board.
        state["assignments"] = dict(config.get("mapping") or state.get("assignments") or {})
        puzzle.solved = True
    saved = _save_state(db, puzzle, state)
    hum = sum(1 for a in attempts if not a.get("correct"))
    logger.info("Puzzle %s reading '%s' -> %s", puzzle_id, reading[:40], correct)
    return {"correct": correct, "hum": hum, "solved": saved.solved}


def solve_glyphs(db: DBSession, puzzle_id: uuid.UUID, dm_email: str) -> PuzzleRead:
    """DM override: fill the board with the answer key.

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle.
        dm_email: Email of the requesting DM.

    Returns:
        The solved PuzzleRead.
    """
    puzzle = _get_owned_puzzle(db, puzzle_id, dm_email)
    _assert_glyph(puzzle)
    state = _state(puzzle)
    state["assignments"] = dict((puzzle.config or {}).get("mapping") or {})
    puzzle.solved = True
    return PuzzleRead.model_validate(_save_state(db, puzzle, state))


# ── Vigenère decoder actions ──────────────────────────────────────────────────


def _assert_cipher(puzzle: Puzzle) -> None:
    """Raise unless this is a cipher puzzle."""
    if puzzle.kind != "cipher":
        raise ValueError("That puzzle is not a cipher page.")


def vigenere_key_letter(ciphertext: str, index: int, key: str) -> str:
    """Return the key letter aligned to ``index`` (non-letters skipped).

    Mirrors the table method: the key advances only on letters, so spaces
    and punctuation don't consume key characters.

    Args:
        ciphertext: The full ciphertext.
        index: Character index into the ciphertext.
        key: The repeating key.

    Returns:
        The aligned key letter, or "" if the index isn't a letter.
    """
    if index < 0 or index >= len(ciphertext) or not ciphertext[index].isalpha():
        return ""
    letters_before = sum(1 for ch in ciphertext[:index] if ch.isalpha())
    key_alpha = [c for c in key.upper() if c.isalpha()]
    if not key_alpha:
        return ""
    return key_alpha[letters_before % len(key_alpha)]


def _decode_char(cipher_char: str, key_char: str) -> str:
    """Step one letter backward by the key letter (A=0 … Z=25)."""
    if not cipher_char.isalpha() or not key_char:
        return cipher_char
    shift = _ALPHA.index(key_char.upper())
    return _ALPHA[(_ALPHA.index(cipher_char.upper()) - shift) % 26]


def submit_key(db: DBSession, puzzle_id: uuid.UUID, key: str) -> dict[str, Any]:
    """Speak a key over the warded page; correct keys still it (Plan 55).

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle.
        key: The candidate key (case-insensitive).

    Returns:
        ``{"correct": bool, "phase": str}``.

    Raises:
        ValueError: If the puzzle is not a cipher page.
    """
    puzzle = _get_puzzle(db, puzzle_id)
    _assert_cipher(puzzle)
    expected = str((puzzle.config or {}).get("key") or "").strip().upper()
    correct = bool(expected) and key.strip().upper() == expected
    state = _state(puzzle)
    if correct and state.get("phase") == "warded":
        state["phase"] = "stilled"
        _save_state(db, puzzle, state)
    logger.info("Puzzle %s key attempt -> %s", puzzle_id, correct)
    return {"correct": correct, "phase": state.get("phase", "warded")}


def decode_letter(db: DBSession, puzzle_id: uuid.UUID, index: int, letter: str) -> dict[str, Any]:
    """Check one hand-decoded plaintext letter at a ciphertext index.

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle.
        index: Character index into the ciphertext.
        letter: The player's proposed plaintext letter.

    Returns:
        ``{"correct": bool, "key_letter": str, "locked": int}``.

    Raises:
        ValueError: Wrong kind, still warded, or an out-of-range index.
    """
    puzzle = _get_puzzle(db, puzzle_id)
    _assert_cipher(puzzle)
    state = _state(puzzle)
    if state.get("phase") == "warded":
        raise ValueError("The page is still warded — it wants a word first.")
    config = puzzle.config or {}
    ciphertext = str(config.get("ciphertext") or "")
    if index < 0 or index >= len(ciphertext):
        raise ValueError("That position isn't on the page.")
    key_letter = vigenere_key_letter(ciphertext, index, str(config.get("key") or ""))
    expected = _decode_char(ciphertext[index], key_letter)
    correct = letter.strip().upper() == expected.upper()
    if correct:
        locked = dict(state.get("locked") or {})
        locked[str(index)] = expected.upper()
        state["locked"] = locked
        _save_state(db, puzzle, state)
    return {
        "correct": correct,
        "key_letter": key_letter,
        "locked": len(state.get("locked") or {}),
    }


def reveal(db: DBSession, puzzle_id: uuid.UUID, dm_email: str, scope: str) -> PuzzleRead:
    """DM reveal — 'word' | 'line' | 'all' from the current cursor.

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle.
        dm_email: Email of the requesting DM.
        scope: How much to reveal.

    Returns:
        The refreshed PuzzleRead.

    Raises:
        ValueError: Wrong kind or an unknown scope.
    """
    puzzle = _get_owned_puzzle(db, puzzle_id, dm_email)
    _assert_cipher(puzzle)
    if scope not in ("word", "line", "all"):
        raise ValueError(f"Unknown reveal scope '{scope}'.")
    config = puzzle.config or {}
    ciphertext = str(config.get("ciphertext") or "")
    key = str(config.get("key") or "")
    state = _state(puzzle)
    locked = dict(state.get("locked") or {})
    # Revealing implies the ward is already down.
    if state.get("phase") == "warded":
        state["phase"] = "stilled"

    def lock(i: int) -> None:
        if ciphertext[i].isalpha():
            locked[str(i)] = _decode_char(ciphertext[i], vigenere_key_letter(ciphertext, i, key))

    cursor = 0
    while cursor < len(ciphertext) and str(cursor) in locked:
        cursor += 1
    if scope == "all":
        for i in range(len(ciphertext)):
            lock(i)
    elif scope == "line":
        end = ciphertext.find("\n", cursor)
        end = len(ciphertext) if end == -1 else end
        for i in range(cursor, end):
            lock(i)
    else:  # word
        i = cursor
        while i < len(ciphertext) and not ciphertext[i].isalpha():
            i += 1
        while i < len(ciphertext) and ciphertext[i].isalpha():
            lock(i)
            i += 1

    state["locked"] = locked
    alpha_total = sum(1 for ch in ciphertext if ch.isalpha())
    if len(locked) >= alpha_total and alpha_total:
        state["phase"] = "solved"
        puzzle.solved = True
    return PuzzleRead.model_validate(_save_state(db, puzzle, state))


def plaintext_so_far(db: DBSession, puzzle_id: uuid.UUID, dm_email: str) -> dict[str, str]:
    """DM-only: the full plaintext, for reading aloud.

    Args:
        db: Active database session.
        puzzle_id: UUID of the puzzle.
        dm_email: Email of the requesting DM.

    Returns:
        ``{"plaintext": <full decoded text>}``.
    """
    puzzle = _get_owned_puzzle(db, puzzle_id, dm_email)
    _assert_cipher(puzzle)
    config = puzzle.config or {}
    stored: Optional[str] = config.get("plaintext")
    if stored:
        return {"plaintext": stored}
    ciphertext = str(config.get("ciphertext") or "")
    key = str(config.get("key") or "")
    decoded = "".join(
        _decode_char(ch, vigenere_key_letter(ciphertext, i, key)) if ch.isalpha() else ch
        for i, ch in enumerate(ciphertext)
    )
    return {"plaintext": decoded}
