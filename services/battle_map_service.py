"""BattleMap service — auth + CRUD for the campaign battle-map library (Plan 42).

Authorization: every operation verifies the caller owns the map's campaign,
reusing ``campaign_service._assert_owner``.
"""

import uuid

from sqlmodel import Session as DBSession

from db.repos.battle_map_repo import BattleMapRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.table_state_repo import TableStateRepo
from domain.battle_map import BattleMap, BattleMapCreate, BattleMapUpdate
from services import campaign_service


def _get_owned_campaign_id(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> uuid.UUID:
    """Verify the DM owns the campaign; return its id.

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        The campaign id.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the DM does not own it.
    """
    campaign = CampaignRepo.get_by_id(db, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    campaign_service._assert_owner(campaign, dm_email)
    return campaign.id


def _get_owned_map(db: DBSession, map_id: uuid.UUID, dm_email: str) -> BattleMap:
    """Fetch a battle map and verify the caller owns its campaign.

    Args:
        db: Active database session.
        map_id: UUID of the battle map.
        dm_email: Email of the requesting DM.

    Returns:
        The owned BattleMap.

    Raises:
        ValueError: If the map or its campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    battle_map = BattleMapRepo.get_by_id(db, map_id)
    if battle_map is None:
        raise ValueError(f"Battle map {map_id} not found.")
    _get_owned_campaign_id(db, battle_map.campaign_id, dm_email)
    return battle_map


def list_maps(db: DBSession, campaign_id: uuid.UUID, dm_email: str) -> list[BattleMap]:
    """List a campaign's battle maps (owner only).

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        Battle maps newest-first.
    """
    _get_owned_campaign_id(db, campaign_id, dm_email)
    return BattleMapRepo.list_for_campaign(db, campaign_id)


def create_map(
    db: DBSession, campaign_id: uuid.UUID, dm_email: str, data: BattleMapCreate
) -> BattleMap:
    """Add a map to a campaign's library (owner only).

    Args:
        db: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.
        data: Validated creation payload.

    Returns:
        The newly-created BattleMap.
    """
    _get_owned_campaign_id(db, campaign_id, dm_email)
    return BattleMapRepo.create(db, campaign_id, data)


def update_map(db: DBSession, map_id: uuid.UUID, dm_email: str, data: BattleMapUpdate) -> BattleMap:
    """Rename / regrid / edit fog regions on a map (owner only).

    Args:
        db: Active database session.
        map_id: UUID of the battle map.
        dm_email: Email of the requesting DM.
        data: Partial update payload.

    Returns:
        The updated BattleMap.
    """
    battle_map = _get_owned_map(db, map_id, dm_email)
    return BattleMapRepo.update(db, battle_map, data)


def delete_map(db: DBSession, map_id: uuid.UUID, dm_email: str) -> bool:
    """Delete a map, first clearing any table state that points at it.

    Args:
        db: Active database session.
        map_id: UUID of the battle map.
        dm_email: Email of the requesting DM.

    Returns:
        True once deleted.
    """
    battle_map = _get_owned_map(db, map_id, dm_email)
    TableStateRepo.clear_map_references(db, battle_map.id)
    return BattleMapRepo.delete(db, battle_map)
