"""Portrait generation service (Plan 00034).

Orchestrates:
  1. Build an image prompt from a PC or NPC's attributes + optional
     style hints.
  2. Call OpenAI's image API via ``integrations.openai_client``.
  3. Upload the PNG to Vercel Blob via ``integrations.blob_storage``.
  4. Save the resulting public URL on the entity.

Auth is enforced at the call site (DM-only via the existing character /
NPC services).
"""

from __future__ import annotations

import uuid
from typing import Optional

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.npc_repo import NpcRepo
from domain.character import PlayerCharacter, PlayerCharacterRead, PlayerCharacterUpdate
from domain.npc import Npc, NpcRead, NpcUpdate
from integrations import blob_storage
from integrations.openai_client import generate_image

# Tone-by-default — keeps prompts grounded in the QuestLab aesthetic.
_DEFAULT_STYLE = (
    "Painterly fantasy character portrait, dramatic lighting, head and "
    "shoulders framing, neutral background, photoreal but slightly "
    "stylized."
)


# ── Authz ─────────────────────────────────────────────────────────────────────


def _assert_pc_owner(session: Session, character_id: uuid.UUID, dm_email: str) -> PlayerCharacter:
    """Verify the DM owns the PC's campaign; return the PC row."""
    pc = CharacterRepo.get_by_id(session, character_id)
    if pc is None:
        raise ValueError(f"Character {character_id} not found.")
    campaign = CampaignRepo.get_by_id(session, pc.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign for PC {character_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to manage this PC's portrait.")
    return pc


def _assert_npc_owner(session: Session, npc_id: uuid.UUID, dm_email: str) -> Npc:
    """Verify the DM owns the NPC's campaign; return the NPC row."""
    npc = NpcRepo.get_by_id(session, npc_id)
    if npc is None:
        raise ValueError(f"NPC {npc_id} not found.")
    campaign = CampaignRepo.get_by_id(session, npc.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign for NPC {npc_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to manage this NPC's portrait.")
    return npc


# ── Prompt builders ───────────────────────────────────────────────────────────


def _build_pc_prompt(pc: PlayerCharacter, style_hints: Optional[str]) -> str:
    """Build an image prompt from a PC's identity fields."""
    bits: list[str] = []
    klass = (
        pc.character_class.value
        if hasattr(pc.character_class, "value")
        else str(pc.character_class)
    )
    bits.append(f"Portrait of {pc.character_name}, a {pc.race} {klass}")
    if pc.subclass:
        bits.append(f"({pc.subclass} subclass)")
    if pc.background:
        bits.append(f"background: {pc.background}")
    if pc.backstory:
        # First sentence of the backstory keeps the prompt tight.
        first_sentence = pc.backstory.strip().split(".")[0]
        if first_sentence:
            bits.append(first_sentence)
    bits.append(_DEFAULT_STYLE)
    if style_hints:
        bits.append(style_hints.strip())
    return ". ".join(b.strip().rstrip(".") for b in bits if b.strip()) + "."


def _build_npc_prompt(npc: Npc, style_hints: Optional[str]) -> str:
    """Build an image prompt from an NPC's identity fields."""
    bits: list[str] = [f"Portrait of {npc.name}"]
    descriptors = [npc.race, npc.gender, npc.age, npc.role]
    descriptor_str = ", ".join(d for d in descriptors if d)
    if descriptor_str:
        bits.append(descriptor_str)
    if npc.appearance:
        first_sentence = npc.appearance.strip().split(".")[0]
        if first_sentence:
            bits.append(first_sentence)
    bits.append(_DEFAULT_STYLE)
    if style_hints:
        bits.append(style_hints.strip())
    return ". ".join(b.strip().rstrip(".") for b in bits if b.strip()) + "."


# ── Public API ────────────────────────────────────────────────────────────────


def generate_pc_portrait(
    session: Session,
    character_id: uuid.UUID,
    dm_email: str,
    style_hints: Optional[str] = None,
) -> PlayerCharacterRead:
    """Generate a portrait for a PC and persist the URL.

    Args:
        session: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.
        style_hints: Optional extra prompt text ("anime", "ink-wash", etc.).

    Returns:
        Updated ``PlayerCharacterRead``.

    Raises:
        ValueError: If the PC is not found.
        PermissionError: If the DM does not own the campaign OR the
            OPENAI / BLOB env vars are not configured.
        RuntimeError: If the upstream API calls fail.
    """
    pc = _assert_pc_owner(session, character_id, dm_email)
    prompt = _build_pc_prompt(pc, style_hints)
    png_bytes = generate_image(prompt)
    url = blob_storage.upload(
        path=blob_storage.portrait_path("pc", pc.id),
        data=png_bytes,
    )
    updated = CharacterRepo.update(
        session,
        pc,
        PlayerCharacterUpdate(portrait_url=url),
    )
    return PlayerCharacterRead.model_validate(updated)


def generate_npc_portrait(
    session: Session,
    npc_id: uuid.UUID,
    dm_email: str,
    style_hints: Optional[str] = None,
) -> NpcRead:
    """Generate a portrait for an NPC and persist the URL.

    Args:
        session: Active database session.
        npc_id: UUID of the NPC.
        dm_email: Email of the requesting DM.
        style_hints: Optional extra prompt text.

    Returns:
        Updated ``NpcRead``.

    Raises:
        ValueError: If the NPC is not found.
        PermissionError: If the DM does not own the campaign OR keys
            are not configured.
        RuntimeError: If the upstream API calls fail.
    """
    npc = _assert_npc_owner(session, npc_id, dm_email)
    prompt = _build_npc_prompt(npc, style_hints)
    png_bytes = generate_image(prompt)
    url = blob_storage.upload(
        path=blob_storage.portrait_path("npc", npc.id),
        data=png_bytes,
    )
    updated = NpcRepo.update(session, npc, NpcUpdate(portrait_url=url))
    return NpcRead.model_validate(updated)


__all__ = ["generate_pc_portrait", "generate_npc_portrait"]
