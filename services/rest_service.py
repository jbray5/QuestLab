"""Rest mechanics (Plan 00021).

Per-PC and party-wide short / long rest helpers. Consolidates:
- Class-feature usage resets (recovery=short or long)
- Spell-slot recovery (long rest = full; short rest = Warlock pact only)
- HP restoration (long rest only — sets hp_current = hp_max)

The party-wide variants resolve "the party" from
``session.attending_pc_ids``. Each PC gets its own ``RestSummary`` so the
UI can show a per-PC toast.
"""

from __future__ import annotations

import uuid

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.class_feature_repo import CharacterFeatureRepo, ClassFeatureRepo
from db.repos.session_repo import SessionRepo
from domain.character import PlayerCharacter, RestSummary
from domain.enums import CharacterClass, RecoveryType
from integrations.event_bus import publish_pc_updated
from services import spellcasting_service


def _assert_pc_owner(db: Session, character_id: uuid.UUID, dm_email: str) -> PlayerCharacter:
    """Verify the DM owns the PC's campaign, return the PC.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        PlayerCharacter.

    Raises:
        ValueError: If PC or campaign not found.
        PermissionError: If the DM does not own the campaign.
    """
    pc = CharacterRepo.get_by_id(db, character_id)
    if pc is None:
        raise ValueError(f"Player character {character_id} not found.")
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        raise ValueError(f"Campaign for PC {character_id} not found.")
    if campaign.dm_email != dm_email.strip().lower():
        raise PermissionError("You do not have permission to rest this PC.")
    return pc


def _reset_features(db: Session, character_id: uuid.UUID, recovery: RecoveryType) -> list[str]:
    """Zero out uses_spent for every PC-feature with the given recovery type.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        recovery: RecoveryType to filter on (SHORT or LONG).

    Returns:
        List of feature names that were restored (had uses_spent > 0).
    """
    rows = CharacterFeatureRepo.list_for_character(db, character_id)
    restored: list[str] = []
    for row in rows:
        feature = ClassFeatureRepo.get_by_id(db, row.feature_id)
        if feature is None:
            continue
        if feature.recovery != recovery:
            continue
        if row.uses_spent > 0:
            row.uses_spent = 0
            db.add(row)
            restored.append(feature.name)
    if restored:
        db.commit()
    return restored


def short_rest_pc(db: Session, character_id: uuid.UUID, dm_email: str) -> RestSummary:
    """Apply a short rest to one PC.

    Restores ``recovery=SHORT`` class features and (for Warlock) pact slots.
    HP and long-rest features are untouched.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        RestSummary listing what was restored.
    """
    pc = _assert_pc_owner(db, character_id, dm_email)
    restored = _reset_features(db, character_id, RecoveryType.SHORT)

    slot_levels_restored: list[str] = []
    if pc.character_class == CharacterClass.WARLOCK:
        # Warlock pact magic recovers on short rest.
        before = spellcasting_service.slot_state(db, character_id, dm_email)
        # If any slot is used, long_rest_recover (which zeros all) is the
        # cleanest way to restore them — Warlocks only have one slot tier.
        if any(lvl.used > 0 for lvl in before.levels.values()):
            after = spellcasting_service.long_rest_recover(db, character_id, dm_email)
            slot_levels_restored = list(after.levels.keys())

    # Short rest may have reset features and/or warlock slots — emit once.
    publish_pc_updated(pc.id, pc.campaign_id)

    return RestSummary(
        character_id=pc.id,
        character_name=pc.character_name,
        rest_type="short",
        features_restored=restored,
        slot_levels_restored=slot_levels_restored,
        hp_restored=0,
    )


def long_rest_pc(db: Session, character_id: uuid.UUID, dm_email: str) -> RestSummary:
    """Apply a long rest to one PC.

    Restores all class features, all spell slots, and HP to maximum.

    Args:
        db: Active database session.
        character_id: UUID of the PC.
        dm_email: Email of the requesting DM.

    Returns:
        RestSummary listing what was restored.
    """
    pc = _assert_pc_owner(db, character_id, dm_email)

    short_features = _reset_features(db, character_id, RecoveryType.SHORT)
    long_features = _reset_features(db, character_id, RecoveryType.LONG)
    restored_features = short_features + long_features

    # Slots: zero everything.
    before = spellcasting_service.slot_state(db, character_id, dm_email)
    slot_levels_restored: list[str] = []
    if any(lvl.used > 0 for lvl in before.levels.values()):
        after = spellcasting_service.long_rest_recover(db, character_id, dm_email)
        slot_levels_restored = list(after.levels.keys())

    # HP back to max.
    hp_restored = max(0, pc.hp_max - pc.hp_current)
    if hp_restored > 0:
        pc.hp_current = pc.hp_max

    # Plan 00024 — hit dice: regain max(1, level // 2), capped by spent count.
    hd_recovered = min(pc.hit_dice_spent, max(1, pc.level // 2))
    if hd_recovered > 0:
        pc.hit_dice_spent -= hd_recovered

    # Plan 00024 — exhaustion drops by one level on long rest (2024 RAW).
    exhaustion_dropped = pc.exhaustion > 0
    if exhaustion_dropped:
        pc.exhaustion = max(0, pc.exhaustion - 1)

    if hp_restored > 0 or hd_recovered > 0 or exhaustion_dropped:
        db.add(pc)
        db.commit()
        db.refresh(pc)

    # Long rest changes many sub-systems (HP, slots, features, HD,
    # exhaustion). Emit a broad pc.updated so the player view and HUD
    # invalidate every related query in one pass.
    publish_pc_updated(pc.id, pc.campaign_id)

    return RestSummary(
        character_id=pc.id,
        character_name=pc.character_name,
        rest_type="long",
        features_restored=restored_features,
        slot_levels_restored=slot_levels_restored,
        hp_restored=hp_restored,
    )


def _resolve_party(db: Session, session_id: uuid.UUID, dm_email: str) -> list[uuid.UUID]:
    """Return the attending-PC UUIDs for a session.

    Honors ``session.attending_pc_ids`` exactly; if it's None or empty the
    party is empty (DM must mark attendees explicitly at session start).

    Args:
        db: Active database session.
        session_id: UUID of the session.
        dm_email: Email of the requesting DM (for authz via session_service).

    Returns:
        List of PC UUIDs.

    Raises:
        ValueError: If the session is not found.
        PermissionError: If the DM does not own the campaign.
    """
    from services import session_service

    session_service.get_session(db, session_id, dm_email)  # authz check
    game_session = SessionRepo.get_by_id(db, session_id)
    if game_session is None:
        raise ValueError(f"Session {session_id} not found.")
    raw = game_session.attending_pc_ids or []
    ids: list[uuid.UUID] = []
    for item in raw:
        try:
            ids.append(uuid.UUID(str(item)))
        except (ValueError, TypeError):
            continue
    return ids


def short_rest_party(db: Session, session_id: uuid.UUID, dm_email: str) -> list[RestSummary]:
    """Apply a short rest to every attending PC in a session.

    Args:
        db: Active database session.
        session_id: UUID of the session.
        dm_email: Email of the requesting DM.

    Returns:
        Per-PC RestSummary list.
    """
    pc_ids = _resolve_party(db, session_id, dm_email)
    return [short_rest_pc(db, pid, dm_email) for pid in pc_ids]


def long_rest_party(db: Session, session_id: uuid.UUID, dm_email: str) -> list[RestSummary]:
    """Apply a long rest to every attending PC in a session.

    Args:
        db: Active database session.
        session_id: UUID of the session.
        dm_email: Email of the requesting DM.

    Returns:
        Per-PC RestSummary list.
    """
    pc_ids = _resolve_party(db, session_id, dm_email)
    return [long_rest_pc(db, pid, dm_email) for pid in pc_ids]


__all__ = [
    "short_rest_pc",
    "long_rest_pc",
    "short_rest_party",
    "long_rest_party",
    "RestSummary",
]
