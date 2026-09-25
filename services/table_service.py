"""Table service — live projected battle-map surface for the Table View (Plan 42).

Two audiences:
- The DM console (Session HUD) reads/writes the raw ``TableState`` — auth via
  session ownership.
- The projector reads ``get_projection`` — NO auth (capability URL, session
  UUID is the secret, same model as /play). The projection is deliberately
  thin: revealed fog + tokens + darkness + which token glows. It never carries
  HP, initiative, DM notes, or the names of unrevealed regions.
"""

import re
import uuid
from typing import Optional

from sqlmodel import Session as DBSession

from db.repos.adventure_repo import AdventureRepo
from db.repos.battle_map_repo import BattleMapRepo
from db.repos.character_repo import CharacterRepo
from db.repos.monster_repo import MonsterRepo
from db.repos.session_repo import SessionCombatantRepo, SessionRepo
from db.repos.table_state_repo import TableStateRepo
from domain.enums import CreatureSize
from domain.table_state import (
    InitiativeEntry,
    TableMap,
    TableProjection,
    TableState,
    TableStateRead,
    TableStateUpdate,
    Token,
)
from integrations import blob_storage, image_tools
from integrations.event_bus import publish_table_ping, publish_table_updated, recent_table_rolls
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


def _rescale_tokens_for_map(
    tokens: list[dict],
    old_map: Optional[object],
    new_map: object,
) -> list[dict]:
    """Move tokens to the same *relative* spot on a differently-sized map (Plan 96).

    Token coordinates are absolute image pixels, so switching from a small map
    to a large one used to leave every token inside the old map's footprint —
    the whole party clumped in one corner. Carrying the fractional position
    across keeps the arrangement and puts it on the new board.

    Args:
        tokens: The stored token dicts.
        old_map: The battle map the coordinates were authored against, if any.
        new_map: The map being switched to.

    Returns:
        The tokens with x/y rescaled and clamped inside the new map.
    """
    ow = float(getattr(old_map, "width", 0) or 0)
    oh = float(getattr(old_map, "height", 0) or 0)
    nw = float(getattr(new_map, "width", 0) or 0)
    nh = float(getattr(new_map, "height", 0) or 0)
    if not (ow and oh and nw and nh) or (ow == nw and oh == nh):
        return tokens
    # Copy rather than mutate: the caller's list holds the rows SQLAlchemy
    # loaded, and editing those in place leaves old and new looking identical,
    # so no UPDATE is ever emitted.
    moved: list[dict] = []
    for token in tokens:
        fresh = dict(token)
        try:
            fresh["x"] = round(min(max(float(fresh.get("x", 0)) / ow, 0.0), 1.0) * nw, 2)
            fresh["y"] = round(min(max(float(fresh.get("y", 0)) / oh, 0.0), 1.0) * nh, 2)
        except (TypeError, ValueError):  # a malformed token keeps its coords
            pass
        moved.append(fresh)
    return moved


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

    switched_to = None
    if "active_map_id" in patch and patch["active_map_id"] is not None:
        battle_map = BattleMapRepo.get_by_id(db, patch["active_map_id"])
        campaign_id = session_service.get_campaign_id_for_adventure(db, game_session.adventure_id)
        if battle_map is None or battle_map.campaign_id != campaign_id:
            raise ValueError("Battle map not found in this session's campaign.")
        if patch["active_map_id"] != state.active_map_id:
            switched_to = battle_map
        # Plan 113 — staging a map puts it on the session's shelf.
        if "map_shelf" not in patch:
            shelf = [str(m) for m in (state.map_shelf or [])]
            if str(patch["active_map_id"]) not in shelf:
                patch["map_shelf"] = shelf + [str(patch["active_map_id"])]

    # Normalize nested pydantic models (tokens) to plain JSON-able dicts.
    if "tokens" in patch and patch["tokens"] is not None:
        patch["tokens"] = [t if isinstance(t, dict) else t.model_dump() for t in patch["tokens"]]

    # Plan 96 — a map swap carries the tokens over by fraction, so the party
    # never lands clumped inside the old map's footprint. Only when the caller
    # is not already setting positions itself.
    if switched_to is not None and "tokens" not in patch:
        old_map = BattleMapRepo.get_by_id(db, state.active_map_id) if state.active_map_id else None
        carried = _rescale_tokens_for_map(list(state.tokens or []), old_map, switched_to)
        if carried:
            patch["tokens"] = carried

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


def _save_tokens(
    db: DBSession, session_id: uuid.UUID, state: TableState, tokens: list[dict]
) -> TableStateRead:
    """Persist a rewritten token list and tell every watching surface.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        state: The loaded table state row to write back.
        tokens: The full replacement token list, as plain dicts.

    Returns:
        The refreshed TableStateRead.
    """
    state.tokens = tokens
    TableStateRepo.save(db, state)
    publish_table_updated(session_id)
    return TableStateRead.model_validate(state)


def crowd_trample(knot: dict, count: int = 1) -> dict:
    """Knock ``count`` bystanders off their feet at one knot (Plan 114).

    Args:
        knot: A crowd token as a plain dict.
        count: How many people go down. Capped at how many are standing.

    Returns:
        A new dict with ``crowd`` and ``hurt`` moved.
    """
    out = dict(knot)
    standing = int(out.get("crowd") or 0)
    moved = max(0, min(int(count or 0), standing))
    out["crowd"] = standing - moved
    out["hurt"] = int(out.get("hurt") or 0) + moved
    return out


def crowd_save(knot: dict) -> dict:
    """Pull one bystander back onto their feet (Plan 114).

    Takes from ``dying`` first — those are the ones who die at the end of this
    round — and only then from ``hurt``.

    Args:
        knot: A crowd token as a plain dict.

    Returns:
        A new dict with one person moved back to ``crowd``, or an unchanged
        copy when nobody is down.
    """
    out = dict(knot)
    dying = int(out.get("dying") or 0)
    hurt = int(out.get("hurt") or 0)
    if dying > 0:
        out["dying"] = dying - 1
    elif hurt > 0:
        out["hurt"] = hurt - 1
    else:
        return out
    out["crowd"] = int(out.get("crowd") or 0) + 1
    return out


def crowd_resolve(knot: dict) -> dict:
    """Advance one knot's trampled clock by a round (Plan 114).

    Anyone who went down last round and was not reached dies now; anyone who
    went down this round becomes next round's dying. A bystander therefore
    always gets one full round in which the party can save them.

    Args:
        knot: A crowd token as a plain dict.

    Returns:
        A new dict with the clock advanced.
    """
    out = dict(knot)
    out["dead"] = int(out.get("dead") or 0) + int(out.get("dying") or 0)
    out["dying"] = int(out.get("hurt") or 0)
    out["hurt"] = 0
    return out


def crowd_op(
    db: DBSession,
    session_id: uuid.UUID,
    dm_email: str,
    token_id: str,
    op: str,
    count: int = 1,
) -> TableStateRead:
    """Trample or save bystanders at one crowd knot (Plan 114).

    A knot holds four numbers: ``crowd`` standing, ``hurt`` knocked down this
    round, ``dying`` knocked down last round, ``dead``. Trampling moves people
    from ``crowd`` to ``hurt``; saving brings one back, taking from ``dying``
    first because those are the ones about to die.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.
        token_id: The crowd token to act on.
        op: ``"trample"`` or ``"save"``.
        count: How many people, for a trample. Ignored by a save.

    Returns:
        The refreshed TableStateRead.

    Raises:
        ValueError: If the session has no table state, the token is not a
            crowd knot, or ``op`` is not a known operation.
        PermissionError: If the DM does not own the campaign.
    """
    if op not in ("trample", "save"):
        raise ValueError(f"Unknown crowd op: {op}")
    session_service.get_session(db, session_id, dm_email)
    state = TableStateRepo.get_by_session(db, session_id)
    if state is None:
        raise ValueError("No table state for this session.")
    n = max(1, min(int(count or 1), 99))
    found = False
    tokens = []
    for raw in state.tokens or []:
        t = dict(raw)
        if t.get("id") == token_id and t.get("crowd") is not None:
            found = True
            t = crowd_trample(t, n) if op == "trample" else crowd_save(t)
        tokens.append(t)
    if not found:
        raise ValueError("No crowd knot with that token id.")
    return _save_tokens(db, session_id, state, tokens)


def crowd_resolve_round(db: DBSession, session_id: uuid.UUID, dm_email: str) -> TableStateRead:
    """Advance the trampled clock one round on every knot (Plan 114).

    Anyone who went down *last* round and was not reached dies now; anyone who
    went down *this* round becomes next round's dying. That gives the party a
    full round to get to somebody before the herd finishes them.

    Args:
        db: Active database session.
        session_id: UUID of the game session.
        dm_email: Email of the requesting DM.

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
        if t.get("crowd") is not None:
            t = crowd_resolve(t)
        tokens.append(t)
    return _save_tokens(db, session_id, state, tokens)


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
    return _save_tokens(db, session_id, state, tokens)


# Plan 111 — how tall a figure stands on the immersive table, in feet. The
# engine scales a model's bounding box to this, so a bought model and a
# Character Creator export stand right beside each other whatever their file
# says. Player-safe: a creature's size is public at any table.
_SIZE_HEIGHT_FT: dict[CreatureSize, float] = {
    CreatureSize.TINY: 1.5,
    CreatureSize.SMALL: 3.5,
    CreatureSize.MEDIUM: 6.0,
    CreatureSize.LARGE: 10.0,
    CreatureSize.HUGE: 16.0,
    CreatureSize.GARGANTUAN: 24.0,
}
_RACE_HEIGHT_FT: dict[str, float] = {
    "gnome": 3.5,
    "halfling": 3.0,
    "dwarf": 4.5,
    "goliath": 7.5,
    "dragonborn": 6.5,
    "orc": 6.3,
    "half-orc": 6.3,
    "bugbear": 7.0,
    "firbolg": 7.5,
    "kobold": 3.0,
    "goblin": 3.5,
    "fairy": 2.5,
}
_DEFAULT_HEIGHT_FT = 5.8


def height_ft_for_race(race: str | None) -> float:
    """Standing height for a PC of this race, in feet (Plan 111).

    Args:
        race: The character's race as typed on the sheet ("Rock Gnome").

    Returns:
        A height in feet; 5.8 for anything not in the table.
    """
    key = (race or "").strip().lower()
    for name, ft in _RACE_HEIGHT_FT.items():
        if name in key:
            return ft
    return _DEFAULT_HEIGHT_FT


def height_ft_for_size(size: CreatureSize | str | None) -> float:
    """Standing height for a creature of this size category, in feet (Plan 111).

    Args:
        size: A ``CreatureSize`` (or its value).

    Returns:
        A height in feet; Medium when unknown.
    """
    try:
        return _SIZE_HEIGHT_FT[CreatureSize(size)]
    except (ValueError, KeyError):
        return _SIZE_HEIGHT_FT[CreatureSize.MEDIUM]


def _stem(name: str | None) -> str:
    """A name reduced to what two spellings of the same creature share.

    ``"Cultist 1"`` and a token labelled ``"Cultist"`` both become ``cultist``;
    ``"Mira (ally, Large)"`` and ``"Mira (ally) - Large"`` both ``miraallylarge``.

    Args:
        name: A combatant name or a token label.

    Returns:
        Lower-case alphanumerics with any trailing number dropped.
    """
    flat = re.sub(r"[^a-z0-9]+", "", (name or "").lower())
    return re.sub(r"\d+$", "", flat) or flat


def _relink_tokens(tokens: list[Token], combatants: list) -> None:
    """Point orphaned foe tokens at the combatants they were made from.

    Rolling initiative replaces the roster, and every row gets a new id — but
    the tokens the DM placed still carry the old ones, so glow, hits and
    figures all miss. A token whose reference no longer exists is matched
    to a live combatant by name instead ("Cultist" → "Cultist 1", the next
    such token → "Cultist 2"), and its reference is rewritten for this
    projection. PC tokens reference character ids, which never change.

    Args:
        tokens: The session's tokens, mutated in place.
        combatants: The live SessionCombatant rows.
    """
    by_id = {str(c.id): c for c in combatants}
    by_stem: dict[str, list] = {}
    for c in combatants:
        if not c.character_id:
            by_stem.setdefault(_stem(c.name), []).append(c)
    used: set[str] = set()
    for token in tokens:
        if token.kind == "pc" or not token.ref_id:
            continue
        if token.ref_id in by_id:
            used.add(token.ref_id)
            _take_name(token, by_id[token.ref_id])
            continue
        candidates = [c for c in by_stem.get(_stem(token.label), []) if str(c.id) not in used]
        if candidates:
            token.ref_id = str(candidates[0].id)
            used.add(token.ref_id)
            _take_name(token, candidates[0])


def _take_name(token: Token, combatant) -> None:
    """Give a foe token its tracker row's name when it only carries the stem.

    Three tokens placed as "Cultist" stand for rows named "Cultist 1/2/3";
    the DM cannot tell them apart on the table until they say which.
    A token whose label the DM changed to something else is left alone.

    Args:
        token: The token, mutated in place.
        combatant: The live row it stands for.
    """
    name = getattr(combatant, "name", None)
    if name and token.label != name and _stem(token.label) == _stem(name):
        token.label = name


def _resolve_figures(
    db: DBSession, tokens: list[Token], combatant_monster: dict[str, uuid.UUID | None]
) -> None:
    """Stamp each token's 3D figure from the row it stands for (Plan 111).

    A PC token carries its character's ``model_url`` and a height from its
    race; a monster token, its stat block's ``model_url`` (through the
    combatant it references) and a height from its size. Resolved on every
    build, like conditions, so a model set after the token was placed shows
    up on the next refresh. Tokens with nothing behind them stay bare.

    Args:
        db: Active database session.
        tokens: The session's tokens, mutated in place.
        combatant_monster: combatant id → monster stat block id (or None).
    """
    monsters: dict[uuid.UUID, object] = {}
    for token in tokens:
        token.model_url = None
        token.model_height_ft = None
        if not token.ref_id:
            continue
        if token.kind == "pc":
            try:
                pc = CharacterRepo.get_by_id(db, uuid.UUID(token.ref_id))
            except ValueError:
                pc = None
            if pc is not None:
                token.model_url = pc.model_url
                token.model_height_ft = height_ft_for_race(pc.race)
        elif token.kind in ("monster", "custom"):
            monster_id = combatant_monster.get(token.ref_id)
            if monster_id is None:
                continue
            if monster_id not in monsters:
                monsters[monster_id] = MonsterRepo.get_by_id(db, monster_id)
            monster = monsters[monster_id]
            if monster is not None:
                token.model_url = monster.model_url
                token.model_height_ft = height_ft_for_size(monster.size)
                # Its art too, for the turn card and the order strip, unless the DM
                # gave the token a picture of its own.
                if not token.image_url and monster.image_url:
                    token.image_url = monster.image_url


def get_projection(db: DBSession, session_id: uuid.UUID) -> TableProjection:
    """Build the player-safe projection for the projector (NO auth).

    Resolves the active map, the revealed fog geometry (points only — unrevealed
    regions and all region names are omitted), tokens, darkness/title, and the
    turn glow derived from the running combat state. Foe HP never crosses this
    boundary; the initiative order and the party's own HP do (Plan 83).

    Args:
        db: Active database session.
        session_id: UUID of the game session (the capability secret).

    Returns:
        A TableProjection (empty-but-valid if no table state exists yet).
    """
    # Plan 85 — a dead link is a 404, not a forever-empty table.
    if SessionRepo.get_by_id(db, session_id) is None:
        raise ValueError(f"Session {session_id} not found.")
    state = TableStateRepo.get_by_session(db, session_id)

    table_map = None
    revealed_regions: list[list[list[float]]] = []
    tokens: list[Token] = []
    fog_on = False
    brush_reveals: list[dict[str, float]] = []
    darkness = 0.0
    title = ""
    weather: str | None = None
    revealed_exits: list[str] = []

    join_qr_on = False
    if state is not None:
        fog_on = state.fog_on
        brush_reveals = [dict(b) for b in (state.brush_reveals or [])]
        darkness = state.darkness
        title = state.title
        weather = state.weather
        join_qr_on = bool(getattr(state, "join_qr_on", False))
        revealed_exits = [
            i.split(":", 1)[1]
            for i in (state.revealed_region_ids or [])
            if isinstance(i, str) and i.startswith("exit:")
        ]
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
    initiative: list[InitiativeEntry] = []
    combat_round = int(getattr(game_session, "combat_round", 0) or 0) if game_session else 0
    combatant_monster: dict[str, uuid.UUID | None] = {}
    combatants = SessionCombatantRepo.list_for_session(db, session_id)
    _relink_tokens(tokens, combatants)
    for c in combatants:
        ref = str(c.character_id) if c.character_id else str(c.id)
        combatant_monster[str(c.id)] = c.monster_id
        if combat_running and c.defeated:
            defeated_refs.append(ref)
        if combat_running and c.id == game_session.combat_active_combatant_id:
            active_ref = ref
        if combat_running:
            is_pc = bool(c.character_id) or str(c.type).lower() == "pc"
            initiative.append(
                InitiativeEntry(
                    ref=ref,
                    name=c.name,
                    kind="pc" if is_pc else str(c.type).lower(),
                    active=c.id == game_session.combat_active_combatant_id,
                    defeated=bool(c.defeated),
                    hp_current=c.hp_current if is_pc else None,
                    hp_max=c.hp_max if is_pc else None,
                    conditions=list(c.conditions or []),
                )
            )
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

    _resolve_figures(db, tokens, combatant_monster)

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
        revealed_exits=revealed_exits,
        tokens=tokens,
        darkness=darkness,
        title=title,
        weather=weather,
        active_token_ref=active_ref,
        defeated_refs=defeated_refs,
        lost=sum(int(t.dead or 0) for t in tokens),
        combat_running=combat_running,
        round=combat_round if combat_running else 0,
        initiative=initiative,
        recent_rolls=recent_table_rolls(session_id),
    )
