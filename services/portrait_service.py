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
from datetime import datetime, timezone
from typing import Optional

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.monster_repo import MonsterRepo
from db.repos.npc_repo import NpcRepo
from domain.character import PlayerCharacter, PlayerCharacterRead, PlayerCharacterUpdate
from domain.monster import MonsterStatBlock, MonsterStatBlockUpdate
from domain.npc import Npc, NpcRead, NpcUpdate
from integrations import blob_storage
from integrations.openai_client import edit_image, generate_image

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


def _build_monster_prompt(monster: MonsterStatBlock, style_hints: Optional[str]) -> str:
    """Build an image prompt from a monster's identity fields."""
    size = monster.size.value if hasattr(monster.size, "value") else str(monster.size)
    ctype = (
        monster.creature_type.value
        if hasattr(monster.creature_type, "value")
        else str(monster.creature_type)
    )
    bits: list[str] = [
        f"Creature portrait of {monster.name}",
        f"a {size} {ctype}",
    ]
    if monster.alignment:
        bits.append(monster.alignment)
    # Use the first trait/action description as flavor anchoring if present.
    traits = getattr(monster, "traits", None) or []
    if traits and isinstance(traits, list) and traits:
        first = traits[0]
        if isinstance(first, dict) and first.get("desc"):
            snippet = str(first["desc"]).strip().split(".")[0]
            if snippet:
                bits.append(snippet)
    bits.append(
        "Painterly fantasy bestiary illustration, dramatic lighting, full-body "
        "framing, atmospheric background hinting at habitat, ominous but readable."
    )
    if style_hints:
        bits.append(style_hints.strip())
    return ". ".join(b.strip().rstrip(".") for b in bits if b.strip()) + "."


_FIGURE_STYLE = (
    "2D game character sprite asset, full body, standing pose, entire figure "
    "in frame with feet visible, painterly heroic-fantasy style. The figure "
    "is the ONLY thing in the image, isolated on a fully transparent "
    "background: no backdrop, no scenery, no gradient, no outline, no white "
    "edge, no glow, no shadow, no floor, no text. (The board applies an "
    "alpha-curve clean-up pass client-side, so residual halo is tolerated.)"
)


def build_figure_prompt(subject: str, style_hints: Optional[str] = None) -> str:
    """Compose a minifig prompt for an arbitrary subject (Plan 45).

    Shared by the PC/monster figure generators and the free-form token
    figure endpoint (tokens with no linked entity, e.g. demo boards).

    Args:
        subject: Who/what the figure depicts (name + short description).
        style_hints: Optional extra prompt text.

    Returns:
        The full prompt for the transparent standee image.
    """
    bits: list[str] = [subject]
    if style_hints:
        bits.append(style_hints.strip())
    bits.append(_FIGURE_STYLE)
    return ". ".join(b.strip().rstrip(".") for b in bits if b.strip()) + "."


def _build_pc_figure_prompt(pc: PlayerCharacter, style_hints: Optional[str]) -> str:
    """Build a full-body minifig prompt from a PC's identity fields.

    Args:
        pc: The player character.
        style_hints: Optional extra prompt text.

    Returns:
        The full prompt for the transparent standee image.
    """
    cls = (
        pc.character_class.value
        if hasattr(pc.character_class, "value")
        else str(pc.character_class)
    )
    return build_figure_prompt(
        f"{pc.character_name}, a {pc.race} {cls}, level {pc.level} adventurer", style_hints
    )


def generate_pc_figure(
    session: Session,
    character_id: uuid.UUID,
    dm_email: str,
    style_hints: Optional[str] = None,
) -> PlayerCharacterRead:
    """Generate a transparent full-body minifig for a PC (Plan 45).

    Args:
        session: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.
        style_hints: Optional extra prompt text.

    Returns:
        Updated PlayerCharacterRead with ``figure_url`` set.

    Raises:
        ValueError: If the PC is not found.
        PermissionError: If the DM does not own the campaign or keys are missing.
        RuntimeError: If the upstream API calls fail.
    """
    pc = _assert_pc_owner(session, character_id, dm_email)
    prompt = _build_pc_figure_prompt(pc, style_hints)
    png_bytes = generate_image(prompt, size="1024x1536", background="transparent")
    url = blob_storage.upload(path=f"figures/pc-{pc.id}.png", data=png_bytes)
    updated = CharacterRepo.update(session, pc, PlayerCharacterUpdate(figure_url=url))
    return PlayerCharacterRead.model_validate(updated)


def _build_monster_figure_prompt(monster: MonsterStatBlock, style_hints: Optional[str]) -> str:
    """Build a full-body minifig prompt from a monster's identity fields.

    Args:
        monster: The monster stat block.
        style_hints: Optional extra prompt text.

    Returns:
        The full prompt for the transparent standee image.
    """
    size = monster.size.value if hasattr(monster.size, "value") else str(monster.size)
    ctype = (
        monster.creature_type.value
        if hasattr(monster.creature_type, "value")
        else str(monster.creature_type)
    )
    return build_figure_prompt(f"{monster.name}, a {size} {ctype}", style_hints)


def generate_monster_figure(
    session: Session,
    monster_id: uuid.UUID,
    dm_email: str,
    style_hints: Optional[str] = None,
) -> MonsterStatBlock:
    """Generate a transparent full-body minifig for a monster (Plan 45).

    Args:
        session: Active database session.
        monster_id: UUID of the monster.
        dm_email: Email of the requesting DM.
        style_hints: Optional extra prompt text.

    Returns:
        Updated ``MonsterStatBlock`` row with ``figure_url`` set.

    Raises:
        ValueError: If the monster is not found.
        PermissionError: If env keys are missing.
        RuntimeError: If the upstream API calls fail.
    """
    monster = _assert_monster_managed(session, monster_id, dm_email)
    prompt = _build_monster_figure_prompt(monster, style_hints)
    png_bytes = generate_image(prompt, size="1024x1536", background="transparent")
    url = blob_storage.upload(path=f"figures/monster-{monster.id}.png", data=png_bytes)
    return MonsterRepo.update(session, monster, MonsterStatBlockUpdate(figure_url=url))


def _assert_monster_managed(
    session: Session, monster_id: uuid.UUID, dm_email: str
) -> MonsterStatBlock:
    """Verify the requester can manage this monster row.

    DMs are admins by convention for any non-SRD (``is_custom``) entry
    they created. SRD entries (``is_custom=False``) live in a shared
    catalog; we allow any signed-in DM to attach a portrait to them
    since portraits are stored on the row and benefit every campaign.

    Args:
        session: Active database session.
        monster_id: UUID of the monster.
        dm_email: Email of the requesting DM (currently unused — placeholder
            for richer authz when a Monsters-per-campaign concept lands).

    Returns:
        The MonsterStatBlock row.

    Raises:
        ValueError: If the monster is not found.
    """
    monster = MonsterRepo.get_by_id(session, monster_id)
    if monster is None:
        raise ValueError(f"Monster {monster_id} not found.")
    return monster


def generate_monster_portrait(
    session: Session,
    monster_id: uuid.UUID,
    dm_email: str,
    style_hints: Optional[str] = None,
) -> MonsterStatBlock:
    """Generate a portrait for a monster and persist the image URL.

    Args:
        session: Active database session.
        monster_id: UUID of the monster.
        dm_email: Email of the requesting DM.
        style_hints: Optional extra prompt text.

    Returns:
        Updated ``MonsterStatBlock`` row.

    Raises:
        ValueError: If the monster is not found.
        PermissionError: If env keys are missing.
        RuntimeError: If the upstream API calls fail.
    """
    monster = _assert_monster_managed(session, monster_id, dm_email)
    prompt = _build_monster_prompt(monster, style_hints)
    png_bytes = generate_image(prompt)
    url = blob_storage.upload(
        path=blob_storage.portrait_path("monster", monster.id),
        data=png_bytes,
    )
    return MonsterRepo.update(session, monster, MonsterStatBlockUpdate(image_url=url))


# ---------------------------------------------------------------------------
# Plan 00048 — Character Forge: the player's full-body hero render
# ---------------------------------------------------------------------------


def _build_hero_prompt(pc: PlayerCharacter) -> str:
    """Build the character-model prompt from identity + appearance only.

    Deliberately excludes equipped gear: the model is a *persistent* likeness
    of who the character is (Plan 48 revision — gear is shown in equipment
    slots on the screen, not baked into the render, so equipping a sword
    never re-rolls the character's face).

    Args:
        pc: The player character row.

    Returns:
        The image prompt string.
    """
    klass = (
        pc.character_class.value
        if hasattr(pc.character_class, "value")
        else str(pc.character_class)
    )
    bits: list[str] = [f"Full-body character model of {pc.character_name}, a {pc.race} {klass}"]
    if pc.subclass:
        bits.append(f"({pc.subclass})")
    if pc.appearance:
        bits.append(pc.appearance.strip()[:1200])
    bits.append(
        "Video-game character-select model: one figure standing straight and "
        "facing forward, full body from head to boots in frame, symmetrical "
        "neutral pose, painterly fantasy detail, clean die-cut cutout on a fully "
        "transparent background, no scenery, no ground, no shadow. "
        "No text, no watermark, no border"
    )
    return ". ".join(b.strip().rstrip(".") for b in bits if b.strip()) + "."


def generate_pc_hero(session: Session, pc: PlayerCharacter) -> str:
    """Generate + persist the character model render (auth handled by caller).

    Args:
        session: Active database session.
        pc: The player character row (already ownership-checked upstream).

    Returns:
        The uploaded image URL.

    Raises:
        PermissionError: If OPENAI/BLOB env vars are missing.
        RuntimeError: If the upstream API calls fail.
    """
    prompt = _build_hero_prompt(pc)
    png_bytes = generate_image(prompt, size="1024x1536", background="transparent")
    url = blob_storage.upload(path=f"heroes/pc-{pc.id}.png", data=png_bytes)
    # Naive UTC on purpose: DuckDB round-trips tz-aware values through local
    # time (breaking the cooldown math), while naive UTC reads back verbatim;
    # Postgres (session tz = UTC on Render) interprets it as UTC either way.
    stamp = datetime.now(timezone.utc).replace(tzinfo=None)
    # A fresh base identity invalidates the old dressed render, so clear it.
    CharacterRepo.update(
        session,
        pc,
        PlayerCharacterUpdate(hero_url=url, loadout_url=None, hero_generated_at=stamp),
    )
    return url


def _build_loadout_prompt(pc: PlayerCharacter, equipped: list[str]) -> str:
    """Prompt for dressing the base model in its equipped gear (image-to-image).

    The base render is passed as the source image, so this asks the model to
    keep that exact character and only change what they wear/wield — that is
    how equipping shows on the body without turning the PC into a different
    person.

    Args:
        pc: The player character row.
        equipped: Display names of currently equipped items.

    Returns:
        The edit prompt string.
    """
    klass = (
        pc.character_class.value
        if hasattr(pc.character_class, "value")
        else str(pc.character_class)
    )
    gear = ", ".join(equipped[:12]) if equipped else "simple traveling clothes"
    return (
        f"This is {pc.character_name}, a {pc.race} {klass}. Keep the exact same "
        "character — same face, skin, build, hair and colours — and the same "
        "standing full-body pose. Only re-dress them so they are now visibly "
        f"wearing and wielding their equipped gear: {gear}. Weapons held in hand, "
        "armour and clothing worn on the body. Full body head to boots, clean "
        "die-cut cutout on a fully transparent background, no scenery, no shadow, "
        "painterly video-game character model. No text, no watermark, no border."
    )


def generate_pc_loadout(session: Session, pc: PlayerCharacter, equipped: list[str]) -> str:
    """Dress the base model in its equipped gear via image-to-image (Plan 48).

    Downloads the base character render (hero → figure → portrait), edits it to
    wear the equipped loadout while preserving identity, and persists the
    result on ``loadout_url``.

    Args:
        session: Active database session.
        pc: The player character row (ownership-checked upstream).
        equipped: Display names of currently equipped items.

    Returns:
        The uploaded dressed-render URL.

    Raises:
        ValueError: If the PC has no base render to dress.
        PermissionError: If OPENAI/BLOB env vars are missing.
        RuntimeError: If the upstream API calls fail.
    """
    base_url = pc.hero_url or pc.figure_url or pc.portrait_url
    if not base_url:
        raise ValueError("Generate a character model first, then dress it.")
    base_bytes = blob_storage.download(base_url)
    prompt = _build_loadout_prompt(pc, equipped)
    png_bytes = edit_image(prompt, base_bytes, size="1024x1536", background="transparent")
    url = blob_storage.upload(path=f"heroes/pc-{pc.id}-loadout.png", data=png_bytes)
    stamp = datetime.now(timezone.utc).replace(tzinfo=None)
    CharacterRepo.update(
        session,
        pc,
        PlayerCharacterUpdate(loadout_url=url, hero_generated_at=stamp),
    )
    return url


__all__ = [
    "generate_pc_portrait",
    "generate_npc_portrait",
    "generate_monster_portrait",
    "generate_pc_hero",
    "generate_pc_loadout",
]
