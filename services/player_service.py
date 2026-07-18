"""Player-scope service (Plan 00025).

Thin authz-and-shape layer between ``api/routers/play.py`` and the
existing services. The model:

    Player URL = /play/{pcId}
    The UUID is the implicit secret. DM shares each URL out of band to
    the player who owns the character.

The player_service:
1. Looks up the PC by ID (raises NotFound if missing).
2. Resolves the DM email from the campaign (so the existing services'
   authz model still works — we impersonate the DM under the hood).
3. Dispatches to the existing service.

This preserves all business logic in one place (the existing services),
and confines the player-side "you can only see/touch this one PC" rule
to the player_service.

Player write scope:
- HP damage / heal (temp-HP waterfall)
- Death saves
- Hit dice spend
- Spell slot expend (per level)
- Class feature use spend
- Inspiration toggle, concentration drop, exhaustion adjust, currency
  set (via PATCH /state)
- Equip / unequip own gear, appearance notes, hero-render forge (Plan 48)

Forbidden in player scope (DM only):
- Create / delete / edit identity of any PC
- Attune (DM-managed)
- Spell knowledge changes (DM-managed)
- Anything touching other PCs or campaigns
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from domain.character import PlayerCharacter
from services import character_service, feature_service, spellcasting_service


def _get_pc_or_raise(db: Session, pc_id: uuid.UUID) -> PlayerCharacter:
    """Return the PC row by ID or raise ValueError."""
    pc = CharacterRepo.get_by_id(db, pc_id)
    if pc is None:
        raise ValueError(f"Character {pc_id} not found.")
    return pc


def _dm_email_for(db: Session, pc_id: uuid.UUID) -> str:
    """Look up the owning DM's email for a PC.

    Args:
        db: Active database session.
        pc_id: UUID of the player character.

    Returns:
        Email of the DM that owns the campaign this PC belongs to.

    Raises:
        ValueError: If the PC or its campaign is not found.
    """
    pc = _get_pc_or_raise(db, pc_id)
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign {pc.campaign_id} not found.")
    return campaign.dm_email


# ── Reads ──────────────────────────────────────────────────────────────────────


def get_character(db: Session, pc_id: uuid.UUID):
    """Read a PC (player-scope)."""
    dm = _dm_email_for(db, pc_id)
    return character_service.get_character(db, pc_id, dm)


def spellcasting_stats(db: Session, pc_id: uuid.UUID) -> dict[str, Any]:
    """Computed spell DC / attack bonus for a PC."""
    pc = _get_pc_or_raise(db, pc_id)
    return character_service.spellcasting_stats(pc)


def skill_bonuses(db: Session, pc_id: uuid.UUID) -> dict[str, int]:
    """Computed skill bonuses for a PC."""
    dm = _dm_email_for(db, pc_id)
    pc = character_service.get_character(db, pc_id, dm)
    return character_service.compute_skill_bonuses(pc)


def saving_throws(db: Session, pc_id: uuid.UUID) -> dict[str, int]:
    """Computed saving-throw bonuses for a PC."""
    dm = _dm_email_for(db, pc_id)
    pc = character_service.get_character(db, pc_id, dm)
    return character_service.compute_saving_throws(pc)


def slot_state(db: Session, pc_id: uuid.UUID):
    """Read this PC's spell slot state."""
    dm = _dm_email_for(db, pc_id)
    return spellcasting_service.slot_state(db, pc_id, dm)


def list_spells(db: Session, pc_id: uuid.UUID):
    """List this PC's known/prepared spells, enriched with full spell details.

    Plan 39 — players want to see "what does Searing Smite do?" on their
    phones, not just the name. Each row is the CharacterSpell join row
    plus the full Spell description / range / components / damage / etc.
    """
    from db.repos.spell_repo import SpellRepo

    dm = _dm_email_for(db, pc_id)
    rows = spellcasting_service.list_known_for_character(db, pc_id, dm)
    out: list[dict[str, Any]] = []
    for r in rows:
        spell = SpellRepo.get_by_id(db, r.spell_id)
        if spell is None:
            continue
        out.append(
            {
                "id": str(r.id),
                "spell_id": str(r.spell_id),
                "prepared": r.prepared,
                "name": spell.name,
                "level": spell.level,
                "school": spell.school,
                "casting_time": spell.casting_time,
                "range": spell.range,
                "components_v": spell.components_v,
                "components_s": spell.components_s,
                "components_m": spell.components_m,
                "duration": spell.duration,
                "is_ritual": spell.is_ritual,
                "is_concentration": spell.is_concentration,
                "description": spell.description,
                "higher_levels": spell.higher_levels,
                "damage_dice": spell.damage_dice,
                "damage_type": spell.damage_type,
                "save_ability": spell.save_ability,
                "attack_type": spell.attack_type,
            }
        )
    return out


def list_features(db: Session, pc_id: uuid.UUID):
    """List this PC's class features with current usage."""
    dm = _dm_email_for(db, pc_id)
    return feature_service.list_for_character(db, pc_id, dm)


def list_inventory(db: Session, pc_id: uuid.UUID):
    """List this PC's inventory."""
    from services import inventory_service

    dm = _dm_email_for(db, pc_id)
    return inventory_service.list_for_character(db, pc_id, dm)


def list_visible_npcs(db: Session, pc_id: uuid.UUID) -> list[dict[str, Any]]:
    """Return campaign NPCs as a player-safe projection (Plan 38 P3-3).

    Strips DM-facing fields (secret, motivation, dialog_hooks, notes,
    tags, monster_stat_block_id) and returns only what a player would
    plausibly know after meeting the NPC: portrait, name, role, race,
    appearance, location, status.

    No DM-controlled "revealed" toggle yet — for the MVP we trust that
    the DM only seeds NPCs the players have met. Future enhancement:
    add an ``is_revealed`` flag on the Npc model and filter here.

    Args:
        db: Active database session.
        pc_id: UUID of the player character.

    Returns:
        List of NPC dicts (sorted by name), safe to expose on /play/.
    """
    pc = _get_pc_or_raise(db, pc_id)
    from db.repos.npc_repo import NpcRepo

    npcs = NpcRepo.list_by_campaign(db, pc.campaign_id)
    # Plan 38 P3-3 — DM-controlled visibility. Filter hidden NPCs server
    # side so even a curious player hitting /api/play/{id}/npcs can't see
    # the names/portraits of NPCs the DM hasn't revealed yet.
    visible = [n for n in npcs if getattr(n, "is_revealed", True)]
    return [
        {
            "id": str(npc.id),
            "name": npc.name,
            "role": npc.role,
            "race": npc.race,
            "appearance": npc.appearance,
            "location": npc.location,
            "status": npc.status.value if hasattr(npc.status, "value") else npc.status,
            "portrait_url": npc.portrait_url,
        }
        for npc in sorted(visible, key=lambda n: n.name)
    ]


def combat_state(db: Session, pc_id: uuid.UUID) -> dict[str, Any]:
    """Return the PC's active-combat conditions and temp HP (Plan 00037).

    If any session is currently in active combat and this PC has a
    ``SessionCombatant`` row in it, returns
    ``{in_combat: True, conditions, defeated}``. Otherwise returns
    ``{in_combat: False, conditions: [], defeated: False}``.

    temp_hp is NOT included here — it lives on the PlayerCharacter row and
    is already exposed via the main GET /play/{pc_id} payload.

    Args:
        db: Active database session.
        pc_id: UUID of the player character.

    Returns:
        Combat-state dict suitable for JSON serialization.
    """
    _get_pc_or_raise(db, pc_id)
    from db.repos.session_repo import SessionCombatantRepo

    found = SessionCombatantRepo.find_combatant_in_active_combat(db, pc_id)
    if found is None:
        return {"in_combat": False, "conditions": [], "defeated": False}
    _, combatant = found
    return {
        "in_combat": True,
        "conditions": list(combatant.conditions or []),
        "defeated": bool(combatant.defeated),
    }


def turn_state(db: Session, pc_id: uuid.UUID) -> dict[str, Any]:
    """Return whether it's currently this PC's turn (Plan 00028).

    If any session currently has this PC as the active combatant, returns
    ``{active: True, session_id, round, active_combatant_name}``. Otherwise
    returns ``{active: False}``.

    Args:
        db: Active database session.
        pc_id: UUID of the player character.

    Returns:
        Turn-state dict suitable for direct JSON serialization.
    """
    # Confirm the PC exists; ignore the result.
    _get_pc_or_raise(db, pc_id)
    from db.repos.session_repo import SessionCombatantRepo

    found = SessionCombatantRepo.find_active_for_character(db, pc_id)
    if found is None:
        return {"active": False}
    game_session, combatant = found
    return {
        "active": True,
        "session_id": str(game_session.id),
        "round": game_session.combat_round,
        "active_combatant_name": combatant.name,
    }


# ── Writes (table-state actions) ──────────────────────────────────────────────


def apply_damage(db: Session, pc_id: uuid.UUID, amount: int) -> PlayerCharacter:
    """Player applies damage to themselves (temp-HP waterfall)."""
    dm = _dm_email_for(db, pc_id)
    return character_service.apply_damage(db, pc_id, amount, dm)


def apply_healing(db: Session, pc_id: uuid.UUID, amount: int) -> PlayerCharacter:
    """Player heals themselves (clamped to hp_max)."""
    dm = _dm_email_for(db, pc_id)
    return character_service.apply_healing(db, pc_id, amount, dm)


def resolve_death_save(db: Session, pc_id: uuid.UUID, d20: int) -> PlayerCharacter:
    """Player resolves a death save (2024 RAW)."""
    dm = _dm_email_for(db, pc_id)
    return character_service.resolve_death_save(db, pc_id, d20, dm)


def spend_hit_dice(db: Session, pc_id: uuid.UUID, count: int) -> PlayerCharacter:
    """Player spends N hit dice (short-rest healing)."""
    dm = _dm_email_for(db, pc_id)
    return character_service.spend_hit_dice(db, pc_id, count, dm)


def expend_spell_slot(db: Session, pc_id: uuid.UUID, level: int):
    """Player expends one slot of the given level."""
    dm = _dm_email_for(db, pc_id)
    return spellcasting_service.expend_slot(db, pc_id, level, dm)


def restore_spell_slot(db: Session, pc_id: uuid.UUID, level: int):
    """Player restores one slot of the given level (rarely used)."""
    dm = _dm_email_for(db, pc_id)
    return spellcasting_service.restore_slot(db, pc_id, level, dm)


def spend_feature(db: Session, pc_id: uuid.UUID, character_feature_id: uuid.UUID):
    """Player spends one use of a class feature they own."""
    dm = _dm_email_for(db, pc_id)
    return feature_service.spend_use(db, character_feature_id, dm)


# ── Bounded player-state PATCH ────────────────────────────────────────────────


# Only these fields can be set via the player /state endpoint. Everything
# else (level, class, scores, identity, etc.) is DM-only.
_PLAYER_PATCHABLE = {
    "heroic_inspiration",
    "concentration_on",
    "exhaustion",
    "cp",
    "sp",
    "ep",
    "gp",
    "pp",
}


def patch_state(db: Session, pc_id: uuid.UUID, fields: dict[str, Any]) -> PlayerCharacter:
    """Apply a bounded player-side PATCH to a PC.

    Only fields the player legitimately controls at the table are
    accepted. Anything else (level, scores, class, etc.) raises
    PermissionError so a tampered request can't escalate.

    Args:
        db: Active database session.
        pc_id: UUID of the PC.
        fields: Partial state dict.

    Returns:
        Updated PlayerCharacter row.

    Raises:
        PermissionError: If the dict contains a field not in the
            player-allowed set.
        ValueError: If the PC is not found.
    """
    rejected = set(fields) - _PLAYER_PATCHABLE
    if rejected:
        raise PermissionError(f"Player scope cannot modify: {sorted(rejected)}. Ask the DM.")
    dm = _dm_email_for(db, pc_id)
    from domain.character import PlayerCharacterUpdate

    update = PlayerCharacterUpdate.model_validate(fields)
    character_service.update_character(db, pc_id, dm, update)
    return _get_pc_or_raise(db, pc_id)


# ---------------------------------------------------------------------------
# Plan 00048 — Character Forge: gear, appearance, and the hero render
# ---------------------------------------------------------------------------

# Minimum seconds between player-triggered hero generations (paid API call
# behind a capability URL — the cooldown is the abuse guard).
_HERO_COOLDOWN_SECONDS = 90

# Player-editable appearance length cap.
_APPEARANCE_MAX = 1500

# Keyword → equipment slot, checked most-specific first. A row that matches
# nothing is a non-slot carried item (potion, scroll, provisions) and shows
# in the pack only. Drives the Diablo-style paper-doll (Plan 48 revision).
_SLOT_KEYWORDS: list[tuple[str, tuple[str, ...]]] = [
    ("off_hand", ("shield",)),
    ("ring", ("ring", "signet", "band")),
    ("neck", ("amulet", "necklace", "pendant", "periapt", "medallion", "torc", "brooch")),
    ("head", ("helm", "helmet", "hat", "cap", "circlet", "crown", "hood", "coif", "mask")),
    ("feet", ("boot", "greave", "sabaton", "shoe", "sandal", "slipper")),
    ("hands", ("glove", "gauntlet", "bracer", "vambrace", "mitt")),
    ("back", ("cloak", "cape", "mantle", "shawl", "wrap")),
    (
        "body",
        (
            "armor",
            "armour",
            "mail",
            "plate",
            "breastplate",
            "cuirass",
            "leather",
            "hide",
            "robe",
            "vestment",
            "tunic",
            "chestpiece",
        ),
    ),
    (
        "main_hand",
        (
            "sword",
            "axe",
            "bow",
            "dagger",
            "mace",
            "spear",
            "staff",
            "wand",
            "hammer",
            "flail",
            "glaive",
            "halberd",
            "rapier",
            "scimitar",
            "club",
            "sling",
            "crossbow",
            "whip",
            "javelin",
            "trident",
            "blade",
            "quarterstaff",
            "morningstar",
            "pike",
            "lance",
            "warhammer",
            "greatsword",
            "longsword",
            "shortsword",
            "handaxe",
            "greataxe",
            "maul",
            "sickle",
        ),
    ),
]


def _equip_slot(item_type: str, name: str) -> str | None:
    """Map an item to a paper-doll slot, or None if it isn't slotted gear.

    Matches keywords against word *prefixes* (so "boots" hits "boot" but
    "adventuring" does not hit "ring") rather than raw substrings.

    Args:
        item_type: The catalog item_type ("Weapon", "Armor", "Ring"...).
        name: The item name (carries most of the signal for gear).

    Returns:
        A slot key (head/body/hands/feet/back/main_hand/off_hand/neck/ring)
        or None for carried, non-equippable items.
    """
    tokens = re.findall(r"[a-z]+", f"{item_type} {name}".lower())
    for slot, words in _SLOT_KEYWORDS:
        if any(tok.startswith(w) for tok in tokens for w in words):
            return slot
    # A weapon/armor type that dodged the keyword lists still gets a home.
    t = item_type.lower()
    if "weapon" in t:
        return "main_hand"
    if "armor" in t or "armour" in t:
        return "body"
    return None


def list_gear(db: Session, pc_id: uuid.UUID) -> list[dict[str, Any]]:
    """Inventory rows joined with catalog item details for the character screen.

    Args:
        db: Active database session.
        pc_id: UUID of the PC.

    Returns:
        One dict per inventory row: ids, name/type/rarity/image from the
        catalog, quantity/equipped/attuned from the row, plus the derived
        paper-doll ``slot`` (None for carried, non-equippable items).
    """
    from db.repos.item_repo import ItemRepo
    from services import inventory_service
    from services.shop_service import sell_price_gp

    dm = _dm_email_for(db, pc_id)
    gear: list[dict[str, Any]] = []
    for row in inventory_service.list_for_character(db, pc_id, dm):
        item = ItemRepo.get_by_id(db, row.item_id)
        if item is None:
            continue
        gear.append(
            {
                "character_item_id": str(row.id),
                "item_id": str(item.id),
                "name": item.name,
                "item_type": item.item_type,
                "rarity": item.rarity.value if hasattr(item.rarity, "value") else item.rarity,
                "description": item.description,
                "image_url": item.image_url,
                "is_magic": item.is_magic,
                "quantity": row.quantity,
                "equipped": row.equipped,
                "attuned": row.attuned,
                "slot": _equip_slot(item.item_type, item.name),
                # What a vendor pays per unit (None = won't buy) — Plan 51.
                "sell_gp": sell_price_gp(item),
            }
        )
    return gear


def set_appearance(db: Session, pc_id: uuid.UUID, appearance: str) -> PlayerCharacter:
    """Save the player's own appearance notes (Forge customization).

    Args:
        db: Active database session.
        pc_id: UUID of the PC.
        appearance: Free-text look description (capped at 1500 chars).

    Returns:
        The refreshed PC row.
    """
    from domain.character import PlayerCharacterUpdate

    _get_pc_or_raise(db, pc_id)
    dm = _dm_email_for(db, pc_id)
    text = appearance.strip()[:_APPEARANCE_MAX]
    character_service.update_character(db, pc_id, dm, PlayerCharacterUpdate(appearance=text))
    return _get_pc_or_raise(db, pc_id)


def set_equipped(db: Session, pc_id: uuid.UUID, character_item_id: uuid.UUID, equipped: bool):
    """Player equip/unequip — only rows belonging to this PC.

    Args:
        db: Active database session.
        pc_id: UUID of the PC (capability scope).
        character_item_id: UUID of the inventory row.
        equipped: New equipped state.

    Returns:
        The updated inventory row.

    Raises:
        ValueError: If the row doesn't exist.
        PermissionError: If the row belongs to a different character.
    """
    from db.repos.character_item_repo import CharacterItemRepo
    from services import inventory_service

    _get_pc_or_raise(db, pc_id)
    row = CharacterItemRepo.get_by_id(db, character_item_id)
    if row is None:
        raise ValueError(f"Inventory row {character_item_id} not found.")
    if row.character_id != pc_id:
        raise PermissionError("That item belongs to a different character.")
    dm = _dm_email_for(db, pc_id)
    return inventory_service.set_equipped(db, character_item_id, equipped, dm)


def forge_hero(db: Session, pc_id: uuid.UUID) -> dict[str, Any]:
    """Generate the full-body hero render for this PC (cooldown-guarded).

    Args:
        db: Active database session.
        pc_id: UUID of the PC.

    Returns:
        ``{"hero_url": <url>}``.

    Raises:
        ValueError: If the PC is not found, or the forge is still cooling
            down (message carries the seconds remaining).
        PermissionError / RuntimeError: Propagated from generation.
    """
    from integrations.event_bus import publish_pc_updated
    from services import portrait_service

    pc = _get_pc_or_raise(db, pc_id)
    _check_forge_cooldown(pc)
    url = portrait_service.generate_pc_hero(db, pc)
    publish_pc_updated(pc.id, pc.campaign_id)
    return {"hero_url": url}


def _check_forge_cooldown(pc: PlayerCharacter) -> None:
    """Raise ValueError if the shared image-forge cooldown hasn't elapsed.

    Args:
        pc: The player character row.

    Raises:
        ValueError: If the forge is still cooling down (message carries the
            seconds remaining).
    """
    from datetime import datetime, timezone

    if pc.hero_generated_at is None:
        return
    last = pc.hero_generated_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    elapsed = (datetime.now(timezone.utc) - last).total_seconds()
    if elapsed < _HERO_COOLDOWN_SECONDS:
        wait = int(_HERO_COOLDOWN_SECONDS - elapsed)
        raise ValueError(f"The forge is still glowing — try again in {wait}s.")


def dress_model(db: Session, pc_id: uuid.UUID) -> dict[str, Any]:
    """Render the character wearing their equipped gear (image-to-image).

    Preserves the base model's identity (same face/build) and only changes
    what the character wears/wields — this is the "gear on the model" action,
    triggered deliberately, not on every equip. Cooldown-guarded.

    Args:
        db: Active database session.
        pc_id: UUID of the PC.

    Returns:
        ``{"loadout_url": <url>}``.

    Raises:
        ValueError: PC not found, no base model yet, or cooling down.
        PermissionError / RuntimeError: Propagated from generation.
    """
    from integrations.event_bus import publish_pc_updated
    from services import portrait_service

    pc = _get_pc_or_raise(db, pc_id)
    _check_forge_cooldown(pc)
    # Ensure a base identity exists to dress; make one if the PC has nothing.
    if not (pc.hero_url or pc.figure_url or pc.portrait_url):
        portrait_service.generate_pc_hero(db, pc)
        pc = _get_pc_or_raise(db, pc_id)
    equipped = [g["name"] for g in list_gear(db, pc_id) if g["equipped"]]
    url = portrait_service.generate_pc_loadout(db, pc, equipped)
    publish_pc_updated(pc.id, pc.campaign_id)
    return {"loadout_url": url}


def buy_item(db: Session, pc_id: uuid.UUID, shop_item_id: uuid.UUID):
    """Buy a stocked shop item with this PC's coin (Plan 50).

    Thin player-scope dispatch — the marketplace rules (campaign match,
    coin-vs-bargain, stock, purse math) live in shop_service.purchase.

    Args:
        db: Active database session.
        pc_id: UUID of the buying PC.
        shop_item_id: UUID of the shop_items row.

    Returns:
        The PurchaseReceipt.
    """
    from services import shop_service

    _get_pc_or_raise(db, pc_id)
    return shop_service.purchase(db, pc_id, shop_item_id)


def sell_item(db: Session, pc_id: uuid.UUID, character_item_id: uuid.UUID):
    """Sell one unit of an inventory row to a vendor (Plan 51).

    Args:
        db: Active database session.
        pc_id: UUID of the selling PC.
        character_item_id: UUID of the character_items row.

    Returns:
        The SellReceipt.
    """
    from services import shop_service

    _get_pc_or_raise(db, pc_id)
    return shop_service.sell(db, pc_id, character_item_id)


def list_party(db: Session, pc_id: uuid.UUID) -> list[dict[str, str]]:
    """Names + ids of the PC's campaign-mates (Plan 51 pooling dropdown).

    Names only — no stats, no purses; the capability is the caller's own
    pc id.

    Args:
        db: Active database session.
        pc_id: UUID of the requesting PC.

    Returns:
        [{"id", "character_name"}] for every other PC in the campaign.
    """
    pc = _get_pc_or_raise(db, pc_id)
    return [
        {"id": str(other.id), "character_name": other.character_name}
        for other in CharacterRepo.list_by_campaign(db, pc.campaign_id)
        if other.id != pc.id
    ]


def give_coin(db: Session, pc_id: uuid.UUID, to_pc_id: uuid.UUID, amount_gp: float):
    """Pass coin to a party member (Plan 51 pooling).

    Copper-exact both sides; both purses re-denominated gp/sp/cp; both
    sheets refresh over SSE. This is how the party pools for a big buy:
    everyone gives to the designated buyer, the buyer buys.

    Args:
        db: Active database session.
        pc_id: UUID of the giving PC.
        to_pc_id: UUID of the receiving PC (same campaign).
        amount_gp: Amount in gold (fractions allowed: 0.5 = 5 sp).

    Returns:
        A TransferReceipt with the sender's new purse.

    Raises:
        ValueError: Bad amount, self-transfer, or insufficient coin.
        PermissionError: If the recipient is in a different campaign.
    """
    from domain.character import PlayerCharacterUpdate
    from domain.shop import TransferReceipt
    from integrations.event_bus import publish_pc_updated
    from services.shop_service import _purse_copper, _redenominate

    if amount_gp <= 0:
        raise ValueError("Give at least a copper.")
    pc = _get_pc_or_raise(db, pc_id)
    if to_pc_id == pc_id:
        raise ValueError("You already have that coin.")
    to_pc = CharacterRepo.get_by_id(db, to_pc_id)
    if to_pc is None or to_pc.campaign_id != pc.campaign_id:
        raise PermissionError("You can only share coin with your own party.")

    amount_cp = round(amount_gp * 100)
    purse_cp = _purse_copper(pc)
    if purse_cp < amount_cp:
        short = (amount_cp - purse_cp) / 100
        raise ValueError(f"Not enough coin — you're {short:g} gp short.")

    CharacterRepo.update(db, pc, PlayerCharacterUpdate(**_redenominate(purse_cp - amount_cp)))
    CharacterRepo.update(
        db, to_pc, PlayerCharacterUpdate(**_redenominate(_purse_copper(to_pc) + amount_cp))
    )
    publish_pc_updated(pc.id, pc.campaign_id)
    publish_pc_updated(to_pc.id, to_pc.campaign_id)

    refreshed = _get_pc_or_raise(db, pc_id)
    return TransferReceipt(
        to_name=to_pc.character_name,
        amount_gp=amount_gp,
        pp=refreshed.pp,
        gp=refreshed.gp,
        ep=refreshed.ep,
        sp=refreshed.sp,
        cp=refreshed.cp,
    )
