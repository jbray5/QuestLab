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
