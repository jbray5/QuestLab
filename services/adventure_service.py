"""Adventure service — business logic and authorization for Adventure operations.

Rules enforced here:
- A DM must own the parent campaign to manage its adventures.
- Each adventure's NPC roster entries must have name and role fields.
- act_count must be 1–5.
"""

import uuid
from typing import Any, Optional

from sqlmodel import Session

from db.repos.adventure_repo import AdventureRepo
from db.repos.campaign_repo import CampaignRepo
from domain.adventure import Adventure, AdventureCreate, AdventureRead, AdventureUpdate
from domain.enums import AdventureTier


def _assert_campaign_owner(session: Session, campaign_id: uuid.UUID, dm_email: str) -> None:
    """Verify the DM owns the campaign; raise otherwise.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign to verify.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    campaign = CampaignRepo.get_by_id(session, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to access this campaign.")


def _assert_adventure_owner(session: Session, adventure: Adventure, dm_email: str) -> None:
    """Verify the DM owns the adventure's parent campaign.

    Args:
        session: Active database session.
        adventure: Adventure ORM object.
        dm_email: Email of the requesting DM.

    Raises:
        PermissionError: If the DM does not own the parent campaign.
    """
    _assert_campaign_owner(session, adventure.campaign_id, dm_email)


def _validate_npc_roster(roster: Optional[list[dict[str, Any]]]) -> None:
    """Validate that each NPC entry has at least name and role.

    Args:
        roster: List of NPC dicts to validate, or None.

    Raises:
        ValueError: If any entry is missing name or role.
    """
    if not roster:
        return
    for i, npc in enumerate(roster):
        if not npc.get("name"):
            raise ValueError(f"NPC entry {i} is missing a 'name'.")
        if not npc.get("role"):
            raise ValueError(f"NPC entry {i} is missing a 'role'.")


def list_adventures(session: Session, campaign_id: uuid.UUID, dm_email: str) -> list[AdventureRead]:
    """Return all adventures for a campaign, verifying DM ownership.

    Args:
        session: Active database session.
        campaign_id: UUID of the parent campaign.
        dm_email: Email of the requesting DM.

    Returns:
        List of AdventureRead schemas.
    """
    _assert_campaign_owner(session, campaign_id, dm_email)
    adventures = AdventureRepo.list_by_campaign(session, campaign_id)
    return [AdventureRead.model_validate(a) for a in adventures]


def get_adventure(session: Session, adventure_id: uuid.UUID, dm_email: str) -> AdventureRead:
    """Fetch an adventure by ID, enforcing DM ownership of its campaign.

    Args:
        session: Active database session.
        adventure_id: UUID of the adventure.
        dm_email: Email of the requesting DM.

    Returns:
        AdventureRead schema.

    Raises:
        ValueError: If the adventure does not exist.
        PermissionError: If the DM does not own the parent campaign.
    """
    adventure = AdventureRepo.get_by_id(session, adventure_id)
    if adventure is None:
        raise ValueError(f"Adventure {adventure_id} not found.")
    _assert_adventure_owner(session, adventure, dm_email)
    return AdventureRead.model_validate(adventure)


def create_adventure(
    session: Session,
    campaign_id: uuid.UUID,
    title: str,
    tier: AdventureTier,
    dm_email: str,
    synopsis: Optional[str] = None,
    act_count: int = 3,
    npc_roster: Optional[list[dict[str, Any]]] = None,
    location_notes: Optional[str] = None,
) -> AdventureRead:
    """Create a new adventure within a campaign.

    Args:
        session: Active database session.
        campaign_id: UUID of the parent campaign.
        title: Adventure title.
        tier: Play tier (level range).
        dm_email: Email of the requesting DM.
        synopsis: Optional story synopsis.
        act_count: Number of acts (1–5).
        npc_roster: Optional list of NPC dicts ({name, role, description}).
        location_notes: Optional location descriptions.

    Returns:
        The newly created AdventureRead.

    Raises:
        ValueError: If campaign not found or NPC roster invalid.
        PermissionError: If DM doesn't own the campaign.
    """
    _assert_campaign_owner(session, campaign_id, dm_email)
    _validate_npc_roster(npc_roster)
    data = AdventureCreate(
        campaign_id=campaign_id,
        title=title,
        tier=tier,
        synopsis=synopsis,
        act_count=act_count,
        npc_roster=npc_roster,
        location_notes=location_notes,
    )
    adventure = AdventureRepo.create(session, data)
    return AdventureRead.model_validate(adventure)


def update_adventure(
    session: Session,
    adventure_id: uuid.UUID,
    dm_email: str,
    update: AdventureUpdate,
) -> AdventureRead:
    """Apply a partial update to an adventure, enforcing ownership.

    Args:
        session: Active database session.
        adventure_id: UUID of the adventure.
        dm_email: Email of the requesting DM.
        update: Fields to change.

    Returns:
        The updated AdventureRead.

    Raises:
        ValueError: If adventure not found or NPC roster invalid.
        PermissionError: If DM doesn't own the parent campaign.
    """
    adventure = AdventureRepo.get_by_id(session, adventure_id)
    if adventure is None:
        raise ValueError(f"Adventure {adventure_id} not found.")
    _assert_adventure_owner(session, adventure, dm_email)
    if update.npc_roster is not None:
        _validate_npc_roster(update.npc_roster)
    updated = AdventureRepo.update(session, adventure, update)
    return AdventureRead.model_validate(updated)


def delete_adventure(session: Session, adventure_id: uuid.UUID, dm_email: str) -> None:
    """Delete an adventure, enforcing ownership.

    Args:
        session: Active database session.
        adventure_id: UUID of the adventure.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the adventure does not exist.
        PermissionError: If DM doesn't own the parent campaign.
    """
    adventure = AdventureRepo.get_by_id(session, adventure_id)
    if adventure is None:
        raise ValueError(f"Adventure {adventure_id} not found.")
    _assert_adventure_owner(session, adventure, dm_email)
    AdventureRepo.delete(session, adventure)
