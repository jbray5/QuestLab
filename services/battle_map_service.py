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
from integrations import blob_storage, image_tools
from integrations.openai_client import edit_image, generate_image
from services import campaign_service
from services.art_direction import HOUSE_STYLE

# Plan 45 — the 3D board wraps this image on an inverted sphere; the horizon
# band is what matters, so a wide landscape frame is enough.
_BACKDROP_STYLE = (
    "Seamless 360-degree equirectangular panorama for a fantasy tabletop scene, "
    "horizon centered vertically, no text, no watermark, no people in the "
    f"foreground. {HOUSE_STYLE}. Left and right edges must tile seamlessly."
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


_GROUND_PROMPT = (
    "Repaint this exact scene with every living tree, tree canopy, dead tree, "
    "and standing stone completely removed. Where they stood, continue the "
    "ground naturally — grass, flowers, dirt, road — flowing through "
    "uninterrupted. KEEP everything else exactly as it is: buildings, walls, "
    "paths, fire rings, wells, market stalls, small rocks and boulders, "
    "furniture. Same framing, same scale, same painterly style, same "
    "lighting, orthographic top-down."
)

# Shared prop sprite library (generated once, reused across maps).
_SPRITES = {
    "tree": [
        "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/9fdfa2dd-895c-4c3d-90ff-ec46c57809d0-8XuxxfELX6DR1pOB49boi3UvnjZH4N.png",  # noqa: E501
        "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/ce453d27-963d-4a12-a93a-973a3054e3b4-YUYU5Yk4NuPFPXAnCUQDq3gTCQEVcY.png",  # noqa: E501
    ],
    "stone": [
        "https://lemsan3qq1nll8xj.public.blob.vercel-storage.com/maps/53a39b2b-66c3-44b5-ac68-dfeed4854874-ZkNobofQW8iGI260PB3lIi8iyu3Dp1.png",  # noqa: E501
    ],
}


def generate_props(db: DBSession, map_id: uuid.UUID, dm_email: str) -> BattleMap:
    """Dioramify a map: AI ground layer + auto-placed upright props (Plan 46).

    Pipeline: repaint the map with tall features removed (gpt-image-1 edit),
    diff the original against it to find every footprint, classify each as
    tree/stone by the original's color, and place sprites from the shared
    library. The board renders the ground layer with the props standing on
    it — the TaleSpire look, one click, any map.

    Args:
        db: Active database session.
        map_id: UUID of the battle map.
        dm_email: Email of the requesting DM.

    Returns:
        The updated BattleMap with ground_url + props set.

    Raises:
        ValueError: If the map or its campaign does not exist.
        PermissionError: If the DM does not own the campaign.
        RuntimeError: If the download, generation, or upload fails.
    """
    battle_map = _get_owned_map(db, map_id, dm_email)
    source = blob_storage.download(battle_map.image_url)
    ground_png = edit_image(_GROUND_PROMPT, source, size="1536x1024")
    ground_url = blob_storage.upload(path=f"grounds/battlemap-{battle_map.id}.png", data=ground_png)
    try:
        feet = image_tools.diff_footprints(source, ground_png)
    except ValueError as exc:
        raise RuntimeError(f"Footprint diff failed: {exc}") from exc

    props: list[dict] = []
    tree_i = 0
    for f in feet[:28]:  # sanity cap per map
        kind = str(f["kind"])
        size_px = int(f["size_px"])
        if kind == "tree":
            url = _SPRITES["tree"][tree_i % len(_SPRITES["tree"])]
            tree_i += 1
            h = max(2.4, min(3.8, 2.4 + size_px / 300))
            base_y = int(f["y"]) + size_px // 4  # canopy centroid → trunk base
        else:
            url = _SPRITES["stone"][0]
            h = max(1.2, min(2.0, 1.2 + size_px / 160))
            base_y = int(f["y"]) + size_px // 6
        props.append(
            {
                "x": int(f["x"]),
                "y": min(battle_map.height - 4, base_y),
                "kind": kind,
                "url": url,
                "h": round(h, 2),
            }
        )

    return BattleMapRepo.update(db, battle_map, BattleMapUpdate(ground_url=ground_url, props=props))


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
