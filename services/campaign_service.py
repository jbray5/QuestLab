"""Campaign service — business logic and authorization for Campaign operations.

Rules enforced here:
- Only the owning DM can read, update, or delete their campaigns.
- A DM may own at most 20 campaigns (soft limit).
"""

import uuid
from typing import Optional

from sqlmodel import Session

from db.repos.adventure_repo import AdventureRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.encounter_repo import EncounterRepo
from db.repos.item_repo import LootTableRepo
from db.repos.map_repo import MapEdgeRepo, MapNodeRepo, MapRepo
from db.repos.session_repo import SessionRepo, SessionRunbookRepo
from domain.campaign import Campaign, CampaignCreate, CampaignRead, CampaignUpdate

MAX_CAMPAIGNS_PER_DM = 20


def _assert_owner(campaign: Campaign, dm_email: str) -> None:
    """Raise PermissionError if dm_email is not the campaign owner.

    Args:
        campaign: The campaign to check ownership of.
        dm_email: Email of the requesting DM.

    Raises:
        PermissionError: If the DM does not own the campaign.
    """
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to access this campaign.")


def list_campaigns(session: Session, dm_email: str) -> list[CampaignRead]:
    """Return all campaigns owned by the DM.

    Args:
        session: Active database session.
        dm_email: Email of the requesting DM.

    Returns:
        List of CampaignRead schemas ordered by created_at descending.
    """
    campaigns = CampaignRepo.list_by_dm(session, dm_email)
    return [CampaignRead.model_validate(c) for c in campaigns]


def get_campaign(session: Session, campaign_id: uuid.UUID, dm_email: str) -> CampaignRead:
    """Fetch a campaign by ID, enforcing ownership.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        CampaignRead schema.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    campaign = CampaignRepo.get_by_id(session, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    _assert_owner(campaign, dm_email)
    return CampaignRead.model_validate(campaign)


def create_campaign(
    session: Session,
    name: str,
    setting: str,
    tone: str,
    dm_email: str,
    world_notes: Optional[str] = None,
) -> CampaignRead:
    """Create a new campaign for the requesting DM.

    Args:
        session: Active database session.
        name: Campaign name.
        setting: World or setting name.
        tone: Narrative tone description.
        dm_email: Email of the owning DM.
        world_notes: Optional free-form world-building notes.

    Returns:
        The newly created CampaignRead.

    Raises:
        ValueError: If the DM already has MAX_CAMPAIGNS_PER_DM campaigns.
    """
    existing = CampaignRepo.list_by_dm(session, dm_email)
    if len(existing) >= MAX_CAMPAIGNS_PER_DM:
        raise ValueError(
            f"Campaign limit reached ({MAX_CAMPAIGNS_PER_DM}). "
            "Archive an existing campaign before creating a new one."
        )
    data = CampaignCreate(
        name=name,
        setting=setting,
        tone=tone,
        dm_email=dm_email.strip().lower(),
        world_notes=world_notes,
    )
    campaign = CampaignRepo.create(session, data)
    return CampaignRead.model_validate(campaign)


def update_campaign(
    session: Session,
    campaign_id: uuid.UUID,
    dm_email: str,
    update: CampaignUpdate,
) -> CampaignRead:
    """Apply a partial update to a campaign, enforcing ownership.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        update: Fields to change.

    Returns:
        The updated CampaignRead.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    campaign = CampaignRepo.get_by_id(session, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    _assert_owner(campaign, dm_email)
    updated = CampaignRepo.update(session, campaign, update)
    return CampaignRead.model_validate(updated)


def delete_campaign(session: Session, campaign_id: uuid.UUID, dm_email: str) -> None:
    """Delete a campaign and all child records, enforcing ownership.

    Deletion order respects FK constraints:
    session_runbooks → game_sessions → map_edges → map_nodes → maps
    → encounters → loot_tables → adventures → player_characters → campaign

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    campaign = CampaignRepo.get_by_id(session, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    _assert_owner(campaign, dm_email)

    # Cascade: delete all child records in FK-safe order
    for character in CharacterRepo.list_by_campaign(session, campaign_id):
        CharacterRepo.delete(session, character)

    for adventure in AdventureRepo.list_by_campaign(session, campaign_id):
        _delete_adventure_children(session, adventure.id)
        AdventureRepo.delete(session, adventure)

    CampaignRepo.delete(session, campaign)


def _delete_adventure_children(session: Session, adventure_id: uuid.UUID) -> None:
    """Delete all child records of an adventure in FK-safe order.

    Args:
        session: Active database session.
        adventure_id: UUID of the adventure whose children to delete.
    """
    for game_session in SessionRepo.list_by_adventure(session, adventure_id):
        runbook = SessionRunbookRepo.get_by_session(session, game_session.id)
        if runbook:
            SessionRunbookRepo.delete(session, runbook)
        SessionRepo.delete(session, game_session)

    for enc in EncounterRepo.list_by_adventure(session, adventure_id):
        EncounterRepo.delete(session, enc)

    for loot_table in LootTableRepo.list_by_adventure(session, adventure_id):
        LootTableRepo.delete(session, loot_table)

    for map_obj in MapRepo.list_by_adventure(session, adventure_id):
        for edge in MapEdgeRepo.list_by_map(session, map_obj.id):
            MapEdgeRepo.delete(session, edge)
        for node in MapNodeRepo.list_by_map(session, map_obj.id):
            MapNodeRepo.delete(session, node)
        MapRepo.delete(session, map_obj)
