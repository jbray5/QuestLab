"""Puzzles router — DM workbench + player display (Plan 55).

The projection and player actions are intentionally unauthenticated: the
puzzle UUID is a capability secret, the same trust model as the Table View.
Answers never appear in those payloads — see ``puzzle_service``.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.puzzle import (
    DecodeAttempt,
    GlyphAssign,
    KeyAttempt,
    PuzzleCreate,
    PuzzleProjection,
    PuzzleRead,
    PuzzleUpdate,
    ReadingAttempt,
    RevealRequest,
)
from services import puzzle_service

router = APIRouter(tags=["puzzles"])


def _not_found(exc: Exception) -> HTTPException:
    """404 for missing rows, 409 for business refusals."""
    msg = str(exc)
    code = status.HTTP_404_NOT_FOUND if "not found" in msg.lower() else status.HTTP_409_CONFLICT
    return HTTPException(status_code=code, detail=msg)


# ── DM routes ─────────────────────────────────────────────────────────────────


@router.get("/campaigns/{campaign_id}/puzzles", response_model=list[PuzzleRead])
def list_puzzles(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[PuzzleRead]:
    """List a campaign's puzzles (DM view — includes answers).

    Args:
        campaign_id: UUID of the campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        PuzzleReads in creation order.
    """
    try:
        return puzzle_service.list_puzzles(db, campaign_id, user)
    except ValueError as exc:
        raise _not_found(exc)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/campaigns/{campaign_id}/puzzles",
    response_model=PuzzleRead,
    status_code=status.HTTP_201_CREATED,
)
def create_puzzle(
    campaign_id: uuid.UUID, body: PuzzleCreate, db: DB, user: CurrentUser
) -> PuzzleRead:
    """Create a puzzle.

    Args:
        campaign_id: UUID of the campaign.
        body: Kind, title, config.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The created puzzle.
    """
    try:
        return puzzle_service.create_puzzle(db, campaign_id, user, body)
    except ValueError as exc:
        raise _not_found(exc)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/puzzles/{puzzle_id}", response_model=PuzzleRead)
def update_puzzle(
    puzzle_id: uuid.UUID, body: PuzzleUpdate, db: DB, user: CurrentUser
) -> PuzzleRead:
    """Update a puzzle's title / config / player-input toggle.

    Args:
        puzzle_id: UUID of the puzzle.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed puzzle.
    """
    try:
        return puzzle_service.update_puzzle(db, puzzle_id, user, body)
    except ValueError as exc:
        raise _not_found(exc)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/puzzles/{puzzle_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_puzzle(puzzle_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a puzzle.

    Args:
        puzzle_id: UUID of the puzzle.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        puzzle_service.delete_puzzle(db, puzzle_id, user)
    except ValueError as exc:
        raise _not_found(exc)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/puzzles/{puzzle_id}/reset", response_model=PuzzleRead)
def reset_puzzle(puzzle_id: uuid.UUID, db: DB, user: CurrentUser) -> PuzzleRead:
    """Reset a puzzle to its opening state.

    Args:
        puzzle_id: UUID of the puzzle.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The reset puzzle.
    """
    try:
        return puzzle_service.reset_puzzle(db, puzzle_id, user)
    except ValueError as exc:
        raise _not_found(exc)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/puzzles/{puzzle_id}/solve", response_model=PuzzleRead)
def solve_glyphs(puzzle_id: uuid.UUID, db: DB, user: CurrentUser) -> PuzzleRead:
    """DM override: fill a glyph board with its answer key.

    Args:
        puzzle_id: UUID of the puzzle.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The solved puzzle.
    """
    try:
        return puzzle_service.solve_glyphs(db, puzzle_id, user)
    except ValueError as exc:
        raise _not_found(exc)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/puzzles/{puzzle_id}/reveal", response_model=PuzzleRead)
def reveal(puzzle_id: uuid.UUID, body: RevealRequest, db: DB, user: CurrentUser) -> PuzzleRead:
    """Reveal the next word / line, or the whole cipher page.

    Args:
        puzzle_id: UUID of the puzzle.
        body: Reveal scope.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed puzzle.
    """
    try:
        return puzzle_service.reveal(db, puzzle_id, user, body.scope)
    except ValueError as exc:
        raise _not_found(exc)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/puzzles/{puzzle_id}/plaintext")
def plaintext(puzzle_id: uuid.UUID, db: DB, user: CurrentUser) -> dict:
    """DM-only: the decoded page, for reading aloud.

    Args:
        puzzle_id: UUID of the puzzle.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        ``{"plaintext": ...}``.
    """
    try:
        return puzzle_service.plaintext_so_far(db, puzzle_id, user)
    except ValueError as exc:
        raise _not_found(exc)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/puzzles/{puzzle_id}/dm-assign", response_model=PuzzleProjection)
def dm_assign(
    puzzle_id: uuid.UUID, body: GlyphAssign, db: DB, user: CurrentUser
) -> PuzzleProjection:
    """DM assigns/clears a glyph letter (bypasses the player-input toggle).

    Args:
        puzzle_id: UUID of the puzzle.
        body: Glyph + letter ("" clears).
        db: Database session.
        user: Authenticated DM email.

    Returns:
        The refreshed projection.
    """
    try:
        puzzle_service._get_owned_puzzle(db, puzzle_id, user)
        return puzzle_service.assign_glyph(db, puzzle_id, body.glyph, body.letter, is_dm=True)
    except ValueError as exc:
        raise _not_found(exc)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ── Player capability routes ──────────────────────────────────────────────────


@router.get("/puzzle/{puzzle_id}", response_model=PuzzleProjection)
def get_projection(puzzle_id: uuid.UUID, db: DB) -> PuzzleProjection:
    """Player-facing puzzle display — capability URL, no answers.

    Args:
        puzzle_id: UUID of the puzzle (the capability secret).
        db: Database session.

    Returns:
        The PuzzleProjection.
    """
    try:
        return puzzle_service.get_projection(db, puzzle_id)
    except ValueError as exc:
        raise _not_found(exc)


@router.post("/puzzle/{puzzle_id}/assign", response_model=PuzzleProjection)
def player_assign(puzzle_id: uuid.UUID, body: GlyphAssign, db: DB) -> PuzzleProjection:
    """Assign a glyph letter from the shared link (if the DM allows it).

    Args:
        puzzle_id: UUID of the puzzle.
        body: Glyph + letter.
        db: Database session.

    Returns:
        The refreshed projection.
    """
    try:
        return puzzle_service.assign_glyph(db, puzzle_id, body.glyph, body.letter)
    except ValueError as exc:
        raise _not_found(exc)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/puzzle/{puzzle_id}/reading")
def submit_reading(puzzle_id: uuid.UUID, body: ReadingAttempt, db: DB) -> dict:
    """Speak a full reading aloud — scored server-side, wrong ones hum.

    Args:
        puzzle_id: UUID of the puzzle.
        body: The candidate reading.
        db: Database session.

    Returns:
        ``{"correct", "hum", "solved"}``.
    """
    try:
        return puzzle_service.submit_reading(db, puzzle_id, body.reading)
    except ValueError as exc:
        raise _not_found(exc)


@router.post("/puzzle/{puzzle_id}/key")
def submit_key(puzzle_id: uuid.UUID, body: KeyAttempt, db: DB) -> dict:
    """Speak a key over the warded page.

    Args:
        puzzle_id: UUID of the puzzle.
        body: The candidate key.
        db: Database session.

    Returns:
        ``{"correct", "phase"}``.
    """
    try:
        return puzzle_service.submit_key(db, puzzle_id, body.key)
    except ValueError as exc:
        raise _not_found(exc)


@router.post("/puzzle/{puzzle_id}/decode")
def decode_letter(puzzle_id: uuid.UUID, body: DecodeAttempt, db: DB) -> dict:
    """Check one hand-decoded plaintext letter.

    Args:
        puzzle_id: UUID of the puzzle.
        body: Index + proposed letter.
        db: Database session.

    Returns:
        ``{"correct", "key_letter", "locked"}``.
    """
    try:
        return puzzle_service.decode_letter(db, puzzle_id, body.index, body.letter)
    except ValueError as exc:
        raise _not_found(exc)
