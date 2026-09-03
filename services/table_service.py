"""Table service — live projected battle-map surface for the Table View (Plan 42).

Two audiences:
- The DM console (Session HUD) reads/writes the raw ``TableState`` — auth via
  session ownership.
- The projector reads ``get_projection`` — NO auth (capability URL, session
  UUID is the secret, same model as /play). The projection is deliberately
  thin: revealed fog + tokens + darkness + which token glows. It never carries
  HP, initiative, DM notes, or the names of unrevealed regions.
"""

import uuid
from typing import Optional

from sqlmodel import Session as DBSession

from db.repos.adventure_repo import AdventureRepo
from db.repos.battle_map_repo import BattleMapRepo
from db.repos.character_repo import CharacterRepo
from db.repos.session_repo import SessionCombatantRepo, SessionRepo
from db.repos.table_state_repo import TableStateRepo
from domain.table_state import TableMap, TableProjection, TableStateRead, TableStateUpdate, Token
from integrations import blob_storage, image_tools
from integrations.event_bus import publish_table_ping, publish_table_updated
from integrations.openai_client import generate_image
from services import portrait_service, session_service


def generate_token_figure(
    db: DBSession,
    session_id: uuid.UUID,
    dm_email: str,
    name: str,
    style_hints: Optional[str] = None,
) -> str:
    """Generate a minifig cut-out for an unlinked token (Plan 45).

    Tokens with no character/monster behind them (demo boards, ad-hoc
    markers) still deserve standees — this generates straight from the
    token's label and returns the blob URL without touching any entity.

    Args:
        db: Active database session.
        session_id: UUID of the game session (ownership anchor).
        dm_email: Email of the requesting DM.
        name: The token label / subject to depict.
        style_hints: Optional extra prompt text.

    Returns:
        The uploaded cut-out's public URL.

    Raises:
        ValueError: If the session does not exist.
        PermissionError: If the DM does not own the campaign.
        RuntimeError: If image generation or the upload fails.
    """
    session_service.get_session(db, session_id, dm_email)  # ownership check
    prompt = portrait_service.build_figure_prompt(name, style_hints)
    png_bytes = image_tools.key_chroma(generate_image(prompt, size="1024x1536"))
    return blob_storage.upload(path=f"figures/token-{uuid.uuid4().hex[:12]}.png", data=png_bytes)


def get_table_state(db: DBSession, session_id: uuid.UUID, dm_email: str) -> TableStateRead:
    """Return the DM-side raw table state, creating an empty one if needed.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.

    Returns:
        The TableStateRead for the console.

    Raises:
        ValueError: If the session does not exist.
        PermissionError: If the DM does not own the campaign.
    """
    session_service.get_session(db, session_id, dm_email)  # ownership check
    state = TableStateRepo.get_or_create(db, session_id)
    return TableStateRead.model_validate(state)


def update_table_state(
    db: DBSession, session_id: uuid.UUID, dm_email: str, update: TableStateUpdate
) -> TableStateRead:
    """Apply a partial update to the table surface and notify the Table View.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.
        update: Partial update payload.

    Returns:
        The refreshed TableStateRead.

    Raises:
        ValueError: If the session or a referenced map does not exist / is not
            in this session's campaign.
        PermissionError: If the DM does not own the campaign.
    """
    game_session = session_service.get_session(db, session_id, dm_email)
    state = TableStateRepo.get_or_create(db, session_id)
    patch = update.model_dump(exclude_unset=True)

    if "active_map_id" in patch and patch["active_map_id"] is not None:
        battle_map = BattleMapRepo.get_by_id(db, patch["active_map_id"])
        campaign_id = session_service.get_campaign_id_for_adventure(db, game_session.adventure_id)
        if battle_map is None or battle_map.campaign_id != campaign_id:
            raise ValueError("Battle map not found in this session's campaign.")

    # Normalize nested pydantic models (tokens) to plain JSON-able dicts.
    if "tokens" in patch and patch["tokens"] is not None:
        patch["tokens"] = [t if isinstance(t, dict) else t.model_dump() for t in patch["tokens"]]

    for field, value in patch.items():
        setattr(state, field, value)
    TableStateRepo.save(db, state)
    publish_table_updated(session_id)
    return TableStateRead.model_validate(state)


def ping(
    db: DBSession,
    session_id: uuid.UUID,
    dm_email: str,
    x: float,
    y: float,
    kind: Optional[str] = None,
    amount: Optional[int] = None,
) -> None:
    """Broadcast a transient ping or FX event to the table (owner only).

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.
        x: X in image-pixel coords.
        y: Y in image-pixel coords.
        kind: Optional FX kind (fire/frost/heal/arcane/hit/howl/thunder/sting).
        amount: Optional damage number for 'hit'.
    """
    session_service.get_session(db, session_id, dm_email)  # ownership check
    publish_table_ping(session_id, x, y, kind=kind, amount=amount)


def stand_down(db: DBSession, session_id: uuid.UUID, dm_email: str, group: str) -> TableStateRead:
    """Flip every token in ``group`` from hostile to neutral in one action (Plan 72).

    The fight can be won by something other than hit points (a gate opens,
    a bell rings) — every standing enemy in the group stops being an enemy
    at once, and the board shows it: red rings turn grey.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.
        group: The token group tag to stand down.

    Returns:
        The refreshed TableStateRead.

    Raises:
        ValueError: If the session has no table state.
        PermissionError: If the DM does not own the campaign.
    """
    session_service.get_session(db, session_id, dm_email)
    state = TableStateRepo.get_by_session(db, session_id)
    if state is None:
        raise ValueError("No table state for this session.")
    tokens = []
    for raw in state.tokens or []:
        t = dict(raw)
        if t.get("group") == group and t.get("kind") == "monster":
            t["kind"] = "custom"
            t["color"] = "#9aa0b4"
        tokens.append(t)
    state.tokens = tokens
    TableStateRepo.save(db, state)
    publish_table_updated(session_id)
    return TableStateRead.model_validate(state)


def get_projection(db: DBSession, session_id: uuid.UUID) -> TableProjection:
    """Build the player-safe projection for the projector (NO auth).

    Resolves the active map, the revealed fog geometry (points only — unrevealed
    regions and all region names are omitted), tokens, darkness/title, and the
    turn glow derived from the running combat state. No HP or initiative ever
    crosses this boundary.

    Args:
        db: Active database session.
        session_id: UUID of the game session (the capability secret).

    Returns:
        A TableProjection (empty-but-valid if no table state exists yet).
    """
    state = TableStateRepo.get_by_session(db, session_id)

    table_map = None
    revealed_regions: list[list[list[float]]] = []
    tokens: list[Token] = []
    fog_on = False
    brush_reveals: list[dict[str, float]] = []
    darkness = 0.0
    title = ""
    weather: str | None = None

    join_qr_on = False
    if state is not None:
        fog_on = state.fog_on
        brush_reveals = [dict(b) for b in (state.brush_reveals or [])]
        darkness = state.darkness
        title = state.title
        weather = state.weather
        join_qr_on = bool(getattr(state, "join_qr_on", False))
        tokens = [Token.model_validate(t) for t in (state.tokens or [])]
        if state.active_map_id is not None:
            battle_map = BattleMapRepo.get_by_id(db, state.active_map_id)
            if battle_map is not None:
                table_map = TableMap(
                    id=battle_map.id,
                    name=battle_map.name,
                    image_url=battle_map.image_url,
                    width=battle_map.width,
                    height=battle_map.height,
                    grid_size=battle_map.grid_size,
                    backdrop_url=battle_map.backdrop_url,
                    heightmap_url=battle_map.heightmap_url,
                    ground_url=battle_map.ground_url,
                    props=battle_map.props,
                    video_url=getattr(battle_map, "video_url", None),
                )
                revealed_ids = set(state.revealed_region_ids or [])
                for region in battle_map.regions or []:
                    if region.get("id") in revealed_ids:
                        revealed_regions.append(region.get("points") or [])

    # Turn glow — computed independently of table state, but only while combat
    # is actually running (Plan 41 lifecycle), so nothing leaks between fights.
    active_ref: str | None = None
    defeated_refs: list[str] = []
    condition_by_ref: dict[str, list[str]] = {}
    game_session = SessionRepo.get_by_id(db, session_id)
    combat_running = (
        game_session is not None and getattr(game_session, "combat_state", "idle") == "running"
    )
    # Conditions flow whenever combatant rows exist — the DM marks poison
    # during setup or lulls too (Plan 69). Turn glow/defeat stay gated on a
    # RUNNING combat so nothing leaks between fights.
    for c in SessionCombatantRepo.list_for_session(db, session_id):
        ref = str(c.character_id) if c.character_id else str(c.id)
        if combat_running and c.defeated:
            defeated_refs.append(ref)
        if combat_running and c.id == game_session.combat_active_combatant_id:
            active_ref = ref
        if c.conditions:
            # Both keys: HUD tokens ref combatant ids, PC tokens ref
            # character ids (Plan 65).
            condition_by_ref[str(c.id)] = list(c.conditions)
            if c.character_id:
                condition_by_ref[str(c.character_id)] = list(c.conditions)

    # Token state FX (Plan 65) — overwrite live-state fields from combat
    # truth on every build so stale stored copies never leak through.
    for token in tokens:
        ref = token.ref_id or token.id
        token.conditions = condition_by_ref.get(ref, [])
        token.concentrating = None
        if token.kind == "pc" and token.ref_id:
            try:
                pc = CharacterRepo.get_by_id(db, uuid.UUID(token.ref_id))
            except ValueError:
                pc = None
            if pc is not None:
                token.concentrating = bool(pc.concentration_on)

    campaign_id = None
    if game_session is not None:
        adventure = AdventureRepo.get_by_id(db, game_session.adventure_id)
        if adventure is not None:
            campaign_id = adventure.campaign_id

    return TableProjection(
        session_id=session_id,
        campaign_id=campaign_id,
        join_qr_on=join_qr_on,
        map=table_map,
        fog_on=fog_on,
        revealed_regions=revealed_regions,
        brush_reveals=brush_reveals,
        tokens=tokens,
        darkness=darkness,
        title=title,
        weather=weather,
        active_token_ref=active_ref,
        defeated_refs=defeated_refs,
    )
