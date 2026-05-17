"""NPC service — campaign-scoped NPC sheets (Plan 00033).

Rules enforced here:
- A DM must own the parent campaign to manage NPCs in it.
- AI generation reuses ``ai_service.generate_npc`` and persists the result
  (unless the caller asks for a preview-only response).

NPCs are story entities — combat stats are optional via a link to a
Monster row. There is intentionally no embedded statblock.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.npc_repo import NpcRepo
from domain.npc import Npc, NpcCreate, NpcRead, NpcUpdate

MAX_NPCS_PER_CAMPAIGN = 100


# ── Authz helpers ─────────────────────────────────────────────────────────────


def _assert_campaign_owner(session: Session, campaign_id: uuid.UUID, dm_email: str) -> None:
    """Raise if the DM does not own the campaign.

    Args:
        session: Active database session.
        campaign_id: UUID of the campaign to check.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the campaign is not found.
        PermissionError: If the DM does not own the campaign.
    """
    campaign = CampaignRepo.get_by_id(session, campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {campaign_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to manage NPCs in this campaign.")


def _get_npc_or_raise(session: Session, npc_id: uuid.UUID) -> Npc:
    """Fetch an NPC row or raise ValueError."""
    npc = NpcRepo.get_by_id(session, npc_id)
    if npc is None:
        raise ValueError(f"NPC {npc_id} not found.")
    return npc


# ── CRUD ──────────────────────────────────────────────────────────────────────


def list_for_campaign(session: Session, campaign_id: uuid.UUID, dm_email: str) -> list[NpcRead]:
    """List all NPCs in a campaign.

    Args:
        session: Active database session.
        campaign_id: UUID of the parent campaign.
        dm_email: Email of the requesting DM.

    Returns:
        List of NpcRead projections.

    Raises:
        ValueError: If the campaign is not found.
        PermissionError: If the DM does not own the campaign.
    """
    _assert_campaign_owner(session, campaign_id, dm_email)
    rows = NpcRepo.list_by_campaign(session, campaign_id)
    return [NpcRead.model_validate(r) for r in rows]


def get_npc(session: Session, npc_id: uuid.UUID, dm_email: str) -> NpcRead:
    """Fetch a single NPC by ID, enforcing DM ownership.

    Args:
        session: Active database session.
        npc_id: UUID of the NPC.
        dm_email: Email of the requesting DM.

    Returns:
        NpcRead projection.

    Raises:
        ValueError: If the NPC or its campaign is not found.
        PermissionError: If the DM does not own the campaign.
    """
    npc = _get_npc_or_raise(session, npc_id)
    _assert_campaign_owner(session, npc.campaign_id, dm_email)
    return NpcRead.model_validate(npc)


def create_npc(
    session: Session,
    campaign_id: uuid.UUID,
    dm_email: str,
    payload: NpcCreate,
) -> NpcRead:
    """Create a new NPC within a campaign.

    Args:
        session: Active database session.
        campaign_id: UUID of the parent campaign.
        dm_email: Email of the owning DM.
        payload: Validated creation payload.

    Returns:
        The newly created NpcRead.

    Raises:
        ValueError: If the campaign cap is reached or campaign is missing.
        PermissionError: If the DM does not own the campaign.
    """
    _assert_campaign_owner(session, campaign_id, dm_email)
    existing = NpcRepo.list_by_campaign(session, campaign_id)
    if len(existing) >= MAX_NPCS_PER_CAMPAIGN:
        raise ValueError(f"Campaign already has {MAX_NPCS_PER_CAMPAIGN} NPCs (maximum).")
    if not payload.name.strip():
        raise ValueError("NPC name cannot be empty.")
    npc = NpcRepo.create(session, campaign_id, payload)
    return NpcRead.model_validate(npc)


def update_npc(
    session: Session,
    npc_id: uuid.UUID,
    dm_email: str,
    update: NpcUpdate,
) -> NpcRead:
    """Apply a partial update to an NPC.

    Args:
        session: Active database session.
        npc_id: UUID of the NPC.
        dm_email: Email of the requesting DM.
        update: Partial update payload.

    Returns:
        The updated NpcRead.

    Raises:
        ValueError: If the NPC is not found.
        PermissionError: If the DM does not own the campaign.
    """
    npc = _get_npc_or_raise(session, npc_id)
    _assert_campaign_owner(session, npc.campaign_id, dm_email)
    updated = NpcRepo.update(session, npc, update)
    return NpcRead.model_validate(updated)


def delete_npc(session: Session, npc_id: uuid.UUID, dm_email: str) -> None:
    """Delete an NPC.

    Args:
        session: Active database session.
        npc_id: UUID of the NPC.
        dm_email: Email of the requesting DM.

    Raises:
        ValueError: If the NPC is not found.
        PermissionError: If the DM does not own the campaign.
    """
    npc = _get_npc_or_raise(session, npc_id)
    _assert_campaign_owner(session, npc.campaign_id, dm_email)
    NpcRepo.delete(session, npc)


# ── AI generation ─────────────────────────────────────────────────────────────


def generate_npc_from_ai(
    session: Session,
    campaign_id: uuid.UUID,
    dm_email: str,
    role: str,
    save: bool = True,
) -> NpcRead:
    """Generate an NPC via Claude and (optionally) persist it.

    Uses the existing ``ai_service.generate_npc`` to fill in name,
    appearance, personality, secret, and dialog hooks. The DM still owns
    the campaign — this just saves typing.

    Args:
        session: Active database session.
        campaign_id: UUID of the parent campaign.
        dm_email: Email of the requesting DM.
        role: Role hint (e.g. "innkeeper", "corrupt guard captain").
        save: If True, persist the result; if False, return as a
            preview (UUID is freshly generated but not in the DB).

    Returns:
        NpcRead of the generated (and possibly persisted) NPC.
    """
    from services import ai_service

    _assert_campaign_owner(session, campaign_id, dm_email)
    campaign = CampaignRepo.get_by_id(session, campaign_id)
    setting = campaign.setting if campaign and campaign.setting else "a fantasy world"
    tone = campaign.tone if campaign and campaign.tone else "heroic fantasy"

    ai_result = ai_service.generate_npc(role=role, setting=setting, tone=tone)

    payload = NpcCreate(
        name=ai_result.get("name", role.title()),
        role=role,
        appearance=ai_result.get("appearance"),
        personality=ai_result.get("personality"),
        secret=ai_result.get("secret"),
        dialog_hooks=ai_result.get("dialog_hooks") or [],
    )

    if save:
        npc = NpcRepo.create(session, campaign_id, payload)
        return NpcRead.model_validate(npc)

    # Preview mode — return as an in-memory NpcRead with a generated UUID
    # so the frontend can display it before the DM commits.
    from datetime import UTC, datetime

    return NpcRead.model_validate(
        {
            **payload.model_dump(),
            "id": uuid.uuid4(),
            "campaign_id": campaign_id,
            "status": "Alive",
            "created_at": datetime.now(UTC),
            "updated_at": datetime.now(UTC),
            # tags + dialog_hooks default to empty / None already.
        }
    )


__all__ = [
    "MAX_NPCS_PER_CAMPAIGN",
    "create_npc",
    "delete_npc",
    "generate_npc_from_ai",
    "get_npc",
    "list_for_campaign",
    "update_npc",
]
