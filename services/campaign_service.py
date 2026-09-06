"""Campaign service — business logic and authorization for Campaign operations.

Rules enforced here:
- Only the owning DM can read, update, or delete their campaigns.
- A DM may own at most 20 campaigns (soft limit).
"""

import uuid
from typing import Optional

from sqlmodel import Session

from db.repos.adventure_repo import AdventureRepo
from db.repos.battle_map_repo import BattleMapRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.crier_repo import CrierChannelRepo, CrierNpcRepo, CrierPostRepo
from db.repos.encounter_repo import EncounterRepo
from db.repos.item_repo import LootTableRepo
from db.repos.map_repo import MapEdgeRepo, MapNodeRepo, MapRepo
from db.repos.notebook_repo import NotebookPageRepo, NotebookRepo
from db.repos.npc_repo import NpcRepo
from db.repos.puzzle_repo import PuzzleRepo
from db.repos.session_repo import SessionRepo, SessionRunbookRepo
from db.repos.shop_repo import ShopItemRepo, ShopRepo
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
    description: Optional[str] = None,
    world_notes: Optional[str] = None,
) -> CampaignRead:
    """Create a new campaign for the requesting DM.

    Args:
        session: Active database session.
        name: Campaign name.
        setting: World or setting name.
        tone: Narrative tone description.
        dm_email: Email of the owning DM.
        description: Optional campaign premise and overview.
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
        description=description,
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
    if "join_code" in update.model_fields_set:
        # Plan 83 — codes are short, upper-case, and "" clears them.
        code = "".join(ch for ch in (update.join_code or "").upper() if ch.isalnum())[:12]
        update.join_code = code or None
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

    # Cascade: delete all child records in FK-safe order. Plan 82 — every
    # table that points at a campaign, adventure or session goes first; six
    # of six field testers hit a 500 here because table state, combatants,
    # beats, briefs, battle maps, NPCs, notebooks, shops, puzzles and the
    # crier were left behind.
    for adventure in AdventureRepo.list_by_campaign(session, campaign_id):
        _delete_adventure_children(session, adventure.id)
        AdventureRepo.delete(session, adventure)

    for battle_map in BattleMapRepo.list_for_campaign(session, campaign_id):
        BattleMapRepo.delete(session, battle_map)
    for npc in NpcRepo.list_by_campaign(session, campaign_id):
        NpcRepo.delete(session, npc)
    for notebook in NotebookRepo.list_for_campaign(session, campaign_id):
        NotebookPageRepo.delete_for_notebook(session, notebook.id)
        NotebookRepo.delete(session, notebook)
    CrierPostRepo.delete_for_campaign(session, campaign_id)
    for crier_npc in CrierNpcRepo.list_for_campaign(session, campaign_id):
        CrierNpcRepo.delete(session, crier_npc)
    for channel in CrierChannelRepo.list_for_campaign(session, campaign_id):
        CrierChannelRepo.delete(session, channel)
    for shop in ShopRepo.list_for_campaign(session, campaign_id):
        ShopItemRepo.delete_for_shop(session, shop.id)
        ShopRepo.delete(session, shop)
    for puzzle in PuzzleRepo.list_for_campaign(session, campaign_id):
        PuzzleRepo.delete(session, puzzle)
    for character in CharacterRepo.list_by_campaign(session, campaign_id):
        CharacterRepo.delete(session, character)

    CampaignRepo.delete(session, campaign)


def _delete_adventure_children(session: Session, adventure_id: uuid.UUID) -> None:
    """Delete all child records of an adventure in FK-safe order.

    Args:
        session: Active database session.
        adventure_id: UUID of the adventure whose children to delete.
    """
    from services import session_service

    for game_session in SessionRepo.list_by_adventure(session, adventure_id):
        session_service.cascade_session_children(session, game_session.id)
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


def _row(obj: object) -> dict:
    """JSON-safe dump of a SQLModel row."""
    return obj.model_dump(mode="json")  # type: ignore[attr-defined]


def export_campaign(session: Session, campaign_id: uuid.UUID, dm_email: str) -> dict:
    """Everything the DM wrote, as one JSON bundle (Plan 83).

    Rows only — art stays at its URLs. Sessions carry their runbook; notebooks
    their pages; shops their stock. Combat rosters and table state are live
    state, not prep, and are left out.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign.
        dm_email: Email of the requesting DM.

    Returns:
        A dict with ``format``, the campaign, and its children.

    Raises:
        ValueError: If the campaign does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    from datetime import UTC, datetime

    campaign = CampaignRepo.get_by_id(session, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    _assert_owner(campaign, dm_email)

    adventures = []
    for adventure in AdventureRepo.list_by_campaign(session, campaign_id):
        sessions = []
        for game_session in SessionRepo.list_by_adventure(session, adventure.id):
            runbook = SessionRunbookRepo.get_by_session(session, game_session.id)
            sessions.append({**_row(game_session), "runbook": _row(runbook) if runbook else None})
        adventures.append(
            {
                **_row(adventure),
                "encounters": [
                    _row(e) for e in EncounterRepo.list_by_adventure(session, adventure.id)
                ],
                "sessions": sessions,
            }
        )
    notebooks = [
        {
            **_row(nb),
            "pages": [_row(p) for p in NotebookPageRepo.list_for_notebook(session, nb.id)],
        }
        for nb in NotebookRepo.list_for_campaign(session, campaign_id)
    ]
    shops = [
        {**_row(shop), "items": [_row(i) for i in ShopItemRepo.list_for_shop(session, shop.id)]}
        for shop in ShopRepo.list_for_campaign(session, campaign_id)
    ]
    return {
        "format": "questlab-campaign/1",
        "exported_at": datetime.now(UTC).isoformat(),
        "campaign": _row(campaign),
        "characters": [_row(c) for c in CharacterRepo.list_by_campaign(session, campaign_id)],
        "npcs": [_row(n) for n in NpcRepo.list_by_campaign(session, campaign_id)],
        "adventures": adventures,
        "battle_maps": [_row(m) for m in BattleMapRepo.list_for_campaign(session, campaign_id)],
        "notebooks": notebooks,
        "shops": shops,
        "puzzles": [_row(p) for p in PuzzleRepo.list_for_campaign(session, campaign_id)],
    }
