"""Player-view router (Plan 00025).

Public endpoints under ``/api/play/{pc_id}/*`` that let a player at the
table self-service their own character without DM-level credentials. The
character's UUID is the implicit secret — the DM shares each URL out of
band to the right player.

Auth model: NO ``CurrentUser`` dependency. Every endpoint takes the
``pc_id`` in the path and only ever touches that one PC. ``player_service``
enforces "you can only touch this PC" and rejects writes outside the
allowed table-state scope.
"""

import uuid

from fastapi import APIRouter, HTTPException, status

from api.deps import DB
from domain.character import PlayerCharacter
from services import player_service

router = APIRouter(tags=["play"])


# ── Reads ──────────────────────────────────────────────────────────────────────


@router.get("/play/{pc_id}")
def get_pc(pc_id: uuid.UUID, db: DB):
    """Return the PC sheet (read-only) for the player view.

    Args:
        pc_id: UUID of the player character (implicit secret).
        db: Database session.

    Returns:
        Full PlayerCharacterRead projection.
    """
    try:
        return player_service.get_character(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/play/{pc_id}/spellcasting-stats")
def spellcasting_stats(pc_id: uuid.UUID, db: DB) -> dict:
    """Computed spell save DC and attack bonus."""
    try:
        return player_service.spellcasting_stats(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/play/{pc_id}/skill-bonuses")
def skill_bonuses(pc_id: uuid.UUID, db: DB) -> dict[str, int]:
    """Computed skill bonuses keyed by skill name."""
    try:
        return player_service.skill_bonuses(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/play/{pc_id}/saving-throws")
def saving_throws(pc_id: uuid.UUID, db: DB) -> dict[str, int]:
    """Computed saving-throw bonuses by ability."""
    try:
        return player_service.saving_throws(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/play/{pc_id}/spell-slots")
def spell_slots(pc_id: uuid.UUID, db: DB):
    """Per-level spell slot state."""
    try:
        return player_service.slot_state(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/play/{pc_id}/spells")
def spells(pc_id: uuid.UUID, db: DB):
    """Known and prepared spells (with full spell details)."""
    try:
        return player_service.list_spells(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/play/{pc_id}/features")
def features(pc_id: uuid.UUID, db: DB):
    """Class features (with max + spent usage)."""
    try:
        return player_service.list_features(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/play/{pc_id}/inventory")
def inventory(pc_id: uuid.UUID, db: DB):
    """Inventory (read-only in player scope)."""
    try:
        return player_service.list_inventory(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/play/{pc_id}/npcs")
def list_visible_npcs(pc_id: uuid.UUID, db: DB) -> list[dict]:
    """Return campaign NPCs the player should see (Plan 38 P3-3).

    Public projection: name, role, race, appearance, location, status,
    portrait_url. DM-facing fields (secret, motivation, dialog_hooks,
    notes) are stripped server-side so a curious player hitting the API
    directly can't surface them.
    """
    try:
        return player_service.list_visible_npcs(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/play/{pc_id}/combat-state")
def combat_state(pc_id: uuid.UUID, db: DB) -> dict:
    """Conditions + defeated flag for this PC during active combat (Plan 00037).

    Returns ``{in_combat: bool, conditions: list[str], defeated: bool}``.
    Used by the PlayerView to render a Conditions strip next to the HP
    bar so a charmed / prone / poisoned player sees it on their phone.
    """
    try:
        return player_service.combat_state(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.get("/play/{pc_id}/turn-state")
def turn_state(pc_id: uuid.UUID, db: DB) -> dict:
    """Is it this PC's turn in any active session combat? (Plan 00028).

    Returns ``{active: true, session_id, round, active_combatant_name}`` when
    a session has this PC as the active combatant. Returns ``{active: false}``
    otherwise. Used by the PlayerView to render the "It's your turn!" banner
    on initial load and after reconnect.
    """
    try:
        return player_service.turn_state(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# ── Writes (table-state self-service) ─────────────────────────────────────────


@router.post("/play/{pc_id}/damage", response_model=PlayerCharacter)
def apply_damage(pc_id: uuid.UUID, body: dict, db: DB) -> PlayerCharacter:
    """Player applies damage to themselves. Body: ``{"amount": <int>}``."""
    try:
        return player_service.apply_damage(db, pc_id, int(body.get("amount", 0)))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/play/{pc_id}/heal", response_model=PlayerCharacter)
def apply_healing(pc_id: uuid.UUID, body: dict, db: DB) -> PlayerCharacter:
    """Player heals themselves. Body: ``{"amount": <int>}``."""
    try:
        return player_service.apply_healing(db, pc_id, int(body.get("amount", 0)))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/play/{pc_id}/death-save", response_model=PlayerCharacter)
def resolve_death_save(pc_id: uuid.UUID, body: dict, db: DB) -> PlayerCharacter:
    """Player resolves a death save. Body: ``{"d20": <1..20>}``."""
    try:
        return player_service.resolve_death_save(db, pc_id, int(body.get("d20", 0)))
    except ValueError as exc:
        # 422 for invalid d20 / not-dying; 404 if PC missing handled by service
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.post("/play/{pc_id}/spend-hit-dice", response_model=PlayerCharacter)
def spend_hit_dice(pc_id: uuid.UUID, body: dict, db: DB) -> PlayerCharacter:
    """Player spends N hit dice. Body: ``{"count": <int>}``."""
    try:
        return player_service.spend_hit_dice(db, pc_id, int(body.get("count", 0)))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.post("/play/{pc_id}/spell-slots/{level}/expend")
def expend_spell_slot(pc_id: uuid.UUID, level: int, db: DB):
    """Player expends one slot of the given level."""
    try:
        return player_service.expend_spell_slot(db, pc_id, level)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.post("/play/{pc_id}/spell-slots/{level}/restore")
def restore_spell_slot(pc_id: uuid.UUID, level: int, db: DB):
    """Player restores one slot of the given level (recovery / misclick fix)."""
    try:
        return player_service.restore_spell_slot(db, pc_id, level)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.post("/play/{pc_id}/features/{character_feature_id}/spend")
def spend_feature_use(pc_id: uuid.UUID, character_feature_id: uuid.UUID, db: DB):
    """Player spends one use of a class feature they own."""
    try:
        return player_service.spend_feature(db, pc_id, character_feature_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc))


@router.patch("/play/{pc_id}/state", response_model=PlayerCharacter)
def patch_state(pc_id: uuid.UUID, body: dict, db: DB) -> PlayerCharacter:
    """Bounded player-scope PATCH.

    Accepted fields: ``heroic_inspiration``, ``concentration_on``,
    ``exhaustion``, ``cp``, ``sp``, ``ep``, ``gp``, ``pp``. Anything else
    raises 403 — those are DM-only.
    """
    try:
        return player_service.patch_state(db, pc_id, body)
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


# ── Character Forge (Plan 48) ─────────────────────────────────────────────────


@router.get("/play/{pc_id}/gear")
def list_gear(pc_id: uuid.UUID, db: DB) -> list[dict]:
    """Inventory joined with item details for the Forge equipment list.

    Args:
        pc_id: UUID of the player character.
        db: Database session.

    Returns:
        Gear rows with name/type/rarity/image + equipped state.
    """
    try:
        return player_service.list_gear(db, pc_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.patch("/play/{pc_id}/appearance", response_model=PlayerCharacter)
def set_appearance(pc_id: uuid.UUID, body: dict, db: DB) -> PlayerCharacter:
    """Save the player's appearance notes.

    Args:
        pc_id: UUID of the player character.
        body: ``{"appearance": "<text>"}``.
        db: Database session.

    Returns:
        The refreshed PC.
    """
    try:
        return player_service.set_appearance(db, pc_id, str(body.get("appearance", "")))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/play/{pc_id}/gear/{character_item_id}/equip")
def set_equipped(pc_id: uuid.UUID, character_item_id: uuid.UUID, body: dict, db: DB):
    """Equip or unequip one of this PC's own inventory rows.

    Args:
        pc_id: UUID of the player character.
        character_item_id: UUID of the inventory row.
        body: ``{"equipped": true|false}``.
        db: Database session.

    Returns:
        The updated inventory row.
    """
    try:
        return player_service.set_equipped(
            db, pc_id, character_item_id, bool(body.get("equipped", True))
        )
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.post("/play/{pc_id}/hero")
def forge_hero(pc_id: uuid.UUID, db: DB) -> dict:
    """Generate the base character model (appearance-only, 90s cooldown).

    Args:
        pc_id: UUID of the player character.
        db: Database session.

    Returns:
        ``{"hero_url": <url>}``.
    """
    try:
        return player_service.forge_hero(db, pc_id)
    except ValueError as exc:
        # The cooldown message is a throttle, not a missing resource.
        if "forge is still glowing" in str(exc):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Hero generation failed: {exc}"
        )


@router.post("/play/{pc_id}/loadout")
def dress_model(pc_id: uuid.UUID, db: DB) -> dict:
    """Render the character wearing their equipped gear (90s cooldown).

    Args:
        pc_id: UUID of the player character.
        db: Database session.

    Returns:
        ``{"loadout_url": <url>}``.
    """
    try:
        return player_service.dress_model(db, pc_id)
    except ValueError as exc:
        if "forge is still glowing" in str(exc):
            raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(exc))
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
    except PermissionError as exc:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(exc))
    except RuntimeError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Loadout render failed: {exc}"
        )
