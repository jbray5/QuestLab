"""Characters router — player character CRUD, scoped to a campaign."""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB, CurrentUser
from domain.character import PlayerCharacter, PlayerCharacterCreate, PlayerCharacterUpdate
from services import character_service

router = APIRouter(tags=["characters"])


@router.get("/campaigns/{campaign_id}/characters", response_model=list[PlayerCharacter])
def list_characters(campaign_id: uuid.UUID, db: DB, user: CurrentUser) -> list[PlayerCharacter]:
    """List all player characters in a campaign.

    Args:
        campaign_id: UUID of the parent campaign.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        List of PlayerCharacter objects.
    """
    try:
        return character_service.list_characters(db, campaign_id, user)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post(
    "/campaigns/{campaign_id}/characters",
    response_model=PlayerCharacter,
    status_code=status.HTTP_201_CREATED,
)
def create_character(
    campaign_id: uuid.UUID, body: PlayerCharacterCreate, db: DB, user: CurrentUser
) -> PlayerCharacter:
    """Create a new player character.

    Args:
        campaign_id: UUID of the parent campaign.
        body: Character creation payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Newly created PlayerCharacter.
    """
    try:
        return character_service.create_character(
            db,
            campaign_id=campaign_id,
            dm_email=user,
            player_name=body.player_name,
            character_name=body.character_name,
            race=body.race,
            character_class=body.character_class,
            level=body.level,
            score_str=body.score_str,
            score_dex=body.score_dex,
            score_con=body.score_con,
            score_int=body.score_int,
            score_wis=body.score_wis,
            score_cha=body.score_cha,
            hp_max=body.hp_max,
            hp_current=body.hp_current,
            ac=body.ac,
            speed=body.speed or 30,
            subclass=body.subclass,
            background=body.background,
            alignment=body.alignment,
            saving_throw_proficiencies=body.saving_throw_proficiencies,
            skill_proficiencies=body.skill_proficiencies,
            feats=body.feats,
            equipment=body.equipment,
            spells_known=body.spells_known,
            spell_slots=body.spell_slots,
            backstory=body.backstory,
            notes=body.notes,
            portrait_url=body.portrait_url,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/characters/{character_id}", response_model=PlayerCharacter)
def get_character(character_id: uuid.UUID, db: DB, user: CurrentUser) -> PlayerCharacter:
    """Fetch a single player character by ID.

    Args:
        character_id: UUID of the character.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        PlayerCharacter object.
    """
    try:
        return character_service.get_character(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.patch("/characters/{character_id}", response_model=PlayerCharacter)
def update_character(
    character_id: uuid.UUID, body: PlayerCharacterUpdate, db: DB, user: CurrentUser
) -> PlayerCharacter:
    """Partially update a player character.

    Args:
        character_id: UUID of the character.
        body: Partial update payload.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Updated PlayerCharacter object.
    """
    try:
        return character_service.update_character(db, character_id, user, body)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.delete("/characters/{character_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_character(character_id: uuid.UUID, db: DB, user: CurrentUser) -> None:
    """Delete a player character.

    Args:
        character_id: UUID of the character.
        db: Database session.
        user: Authenticated DM email.
    """
    try:
        character_service.delete_character(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.get("/characters/{character_id}/skill-bonuses", response_model=dict[str, int])
def get_skill_bonuses(character_id: uuid.UUID, db: DB, user: CurrentUser) -> dict[str, int]:
    """Return all 18 skill bonuses for a PC (Plan 00022).

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Dict of skill_name -> total bonus.
    """
    try:
        pc = character_service.get_character(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return character_service.compute_skill_bonuses(pc)


@router.get("/characters/{character_id}/saving-throws", response_model=dict[str, int])
def get_saving_throws(character_id: uuid.UUID, db: DB, user: CurrentUser) -> dict[str, int]:
    """Return the six saving-throw bonuses for a PC (Plan 00022).

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM email.

    Returns:
        Dict keyed by uppercase ability label to total save bonus.
    """
    try:
        pc = character_service.get_character(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return character_service.compute_saving_throws(pc)


# ---------------------------------------------------------------------------
# Plan 00023 — combat state endpoints
# ---------------------------------------------------------------------------


@router.post("/characters/{character_id}/damage", response_model=PlayerCharacter)
def apply_damage_endpoint(
    character_id: uuid.UUID,
    body: dict,
    db: DB,
    user: CurrentUser,
) -> PlayerCharacter:
    """Apply damage to a PC with the temp-HP-first waterfall (Plan 00023).

    Body: ``{"amount": <int>}``.

    Args:
        character_id: UUID of the PC.
        body: JSON with the integer amount.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Updated PlayerCharacter.
    """
    try:
        return character_service.apply_damage(db, character_id, int(body.get("amount", 0)), user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/characters/{character_id}/heal", response_model=PlayerCharacter)
def apply_healing_endpoint(
    character_id: uuid.UUID,
    body: dict,
    db: DB,
    user: CurrentUser,
) -> PlayerCharacter:
    """Apply healing to a PC, clamped to hp_max. Resets death saves on revive.

    Body: ``{"amount": <int>}``.

    Args:
        character_id: UUID of the PC.
        body: JSON with the integer amount.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Updated PlayerCharacter.
    """
    try:
        return character_service.apply_healing(db, character_id, int(body.get("amount", 0)), user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


@router.post("/characters/{character_id}/death-save", response_model=PlayerCharacter)
def resolve_death_save_endpoint(
    character_id: uuid.UUID,
    body: dict,
    db: DB,
    user: CurrentUser,
) -> PlayerCharacter:
    """Apply a death-save d20 result to the PC's tracker.

    Body: ``{"d20": <int 1..20>}``.

    Args:
        character_id: UUID of the PC.
        body: JSON with the d20 result.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Updated PlayerCharacter.

    Raises:
        HTTPException 422: If d20 is out of range or the PC isn't dying.
    """
    try:
        return character_service.resolve_death_save(db, character_id, int(body.get("d20", 0)), user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ── Plan 00024 — caster stats + hit dice ────────────────────────────────────


@router.get("/characters/{character_id}/spellcasting-stats")
def spellcasting_stats_endpoint(
    character_id: uuid.UUID,
    db: DB,
    user: CurrentUser,
) -> dict:
    """Return computed spell save DC and attack bonus for a PC.

    Returns ``{"ability": "INT|WIS|CHA", "save_dc": int, "attack_bonus": int}``
    for casters, or ``{"ability": null, "save_dc": null, "attack_bonus": null}``
    for non-casters.

    Args:
        character_id: UUID of the PC.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Dict with computed spellcasting stats.
    """
    try:
        pc = character_service.get_character(db, character_id, user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    return character_service.spellcasting_stats(pc)


@router.post("/characters/{character_id}/spend-hit-dice", response_model=PlayerCharacter)
def spend_hit_dice_endpoint(
    character_id: uuid.UUID,
    body: dict,
    db: DB,
    user: CurrentUser,
) -> PlayerCharacter:
    """Mark N hit dice as spent on a PC (short-rest healing).

    Body: ``{"count": <int>}``. Healing itself is applied separately via the
    /heal endpoint after the player rolls the HD plus CON mod.

    Args:
        character_id: UUID of the PC.
        body: JSON with the integer count of HD to spend.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Updated PlayerCharacter.

    Raises:
        HTTPException 422: If count is non-positive or exceeds available HD.
    """
    try:
        return character_service.spend_hit_dice(db, character_id, int(body.get("count", 0)), user)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))


# ── Plan 00034 — AI portrait generation ────────────────────────────────────


@router.post("/characters/{character_id}/portrait", response_model=PlayerCharacter)
def generate_pc_portrait(
    character_id: uuid.UUID, body: dict, db: DB, user: CurrentUser
) -> PlayerCharacter:
    """Generate an AI portrait for a PC and persist the URL.

    Body: ``{"style_hints": "optional extra style"}``. Calls OpenAI
    ``gpt-image-1`` and uploads the result to Vercel Blob; the new URL
    is saved to ``portrait_url`` so every connected view picks it up.

    Args:
        character_id: UUID of the PC.
        body: JSON with optional ``style_hints``.
        db: Database session.
        user: Authenticated DM.

    Returns:
        Updated PlayerCharacter with portrait_url set.
    """
    from services import portrait_service

    try:
        return portrait_service.generate_pc_portrait(
            db, character_id, user, style_hints=(body.get("style_hints") or None)
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Portrait generation failed: {exc}",
        )
    except Exception as exc:
        # Safety net: any unanticipated error must still produce a real
        # HTTP response so CORS headers attach. Without this, an
        # exception path Starlette didn't expect leaves the browser
        # seeing a misleading CORS error instead of the upstream cause.
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Portrait generation failed: {type(exc).__name__}: {exc}",
        )
