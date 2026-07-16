"""BattleMap service — auth + CRUD for the campaign battle-map library (Plan 42).

Authorization: every operation verifies the caller owns the map's campaign,
reusing ``campaign_service._assert_owner``.
"""

import uuid
from typing import Optional

from sqlmodel import Session as DBSession

from db.repos.battle_map_repo import BattleMapRepo
from db.repos.campaign_repo import CampaignRepo
from db.repos.table_state_repo import TableStateRepo
from domain.battle_map import BattleMap, BattleMapCreate, BattleMapUpdate
from integrations import blob_storage
from integrations.openai_client import edit_image, generate_image
from services import campaign_service

# Plan 45 — the 3D board wraps this image on an inverted sphere; the horizon
# band is what matters, so a wide landscape frame is enough.
_BACKDROP_STYLE = (
    "Seamless 360-degree equirectangular panorama for a fantasy tabletop scene, "
    "horizon centered vertically, no text, no watermark, no people in the "
    "foreground, painterly high-fantasy environment art, soft volumetric light, "
    "muted cinematic palette. Left and right edges must tile seamlessly."
)


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


def _build_backdrop_prompt(battle_map: BattleMap, style_hints: Optional[str]) -> str:
    """Compose the panorama prompt from the map name + optional DM hints.

    Args:
        battle_map: The map the backdrop surrounds.
        style_hints: Optional free-text scene description from the DM.

    Returns:
        The full prompt sent to the image model.
    """
    hint = f" Scene: {style_hints.strip()}." if style_hints and style_hints.strip() else ""
    return (
        f"Environment backdrop surrounding a tabletop battle map named "
        f"'{battle_map.name}'.{hint} {_BACKDROP_STYLE}"
    )


def generate_backdrop(
    db: DBSession, map_id: uuid.UUID, dm_email: str, style_hints: Optional[str] = None
) -> BattleMap:
    """Generate a 360° AI backdrop for a map and persist its URL (owner only).

    Calls OpenAI ``gpt-image-1`` in wide landscape, uploads the bytes to
    Vercel Blob, and saves the URL to ``backdrop_url``.

    Args:
        db: Active database session.
        map_id: UUID of the battle map.
        dm_email: Email of the requesting DM.
        style_hints: Optional scene description folded into the prompt.

    Returns:
        The updated BattleMap with backdrop_url set.

    Raises:
        ValueError: If the map or its campaign does not exist.
        PermissionError: If the DM does not own the campaign.
        RuntimeError: If image generation or the blob upload fails.
    """
    battle_map = _get_owned_map(db, map_id, dm_email)
    prompt = _build_backdrop_prompt(battle_map, style_hints)
    png_bytes = generate_image(prompt, size="1536x1024", quality="medium")
    url = blob_storage.upload(path=f"backdrops/battlemap-{battle_map.id}.png", data=png_bytes)
    return BattleMapRepo.update(db, battle_map, BattleMapUpdate(backdrop_url=url))


_HEIGHTMAP_PROMPT = (
    "Convert this top-down fantasy battle map into a grayscale HEIGHT MAP of "
    "the exact same scene at the exact same framing and scale — every feature "
    "stays in exactly the same position. The source is orthographic top-down: "
    "each feature's painted footprint is exactly its height silhouette. "
    "Pure black = flat walkable ground "
    "(roads, paths, grass, dirt, water). Dark gray = low features (bushes, "
    "rubble, small rocks). Mid gray = boulders, standing stones, statues, low "
    "walls. Light gray to white = the tallest features (large trees and tree "
    "canopies, buildings, cliffs). Smooth soft gradients between levels, no "
    "hard outlines, no text, grayscale only, no color."
)


def generate_heightmap(db: DBSession, map_id: uuid.UUID, dm_email: str) -> BattleMap:
    """Auto-generate 3D terrain for a map (Plan 45 Tier 3, owner only).

    Feeds the map image back through ``gpt-image-1``'s edit API asking for a
    grayscale elevation map of the same scene; the 3D board displaces its
    geometry from the result. Fully automatic — no authored regions.

    Args:
        db: Active database session.
        map_id: UUID of the battle map.
        dm_email: Email of the requesting DM.

    Returns:
        The updated BattleMap with heightmap_url set.

    Raises:
        ValueError: If the map or its campaign does not exist.
        PermissionError: If the DM does not own the campaign.
        RuntimeError: If the download, generation, or upload fails.
    """
    battle_map = _get_owned_map(db, map_id, dm_email)
    source = blob_storage.download(battle_map.image_url)
    png_bytes = edit_image(_HEIGHTMAP_PROMPT, source, size="1536x1024")
    url = blob_storage.upload(path=f"heightmaps/battlemap-{battle_map.id}.png", data=png_bytes)
    return BattleMapRepo.update(db, battle_map, BattleMapUpdate(heightmap_url=url))


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
