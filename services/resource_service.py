"""Character counters (Plan 135): a homebrew subclass's (Superiority Dice) and hand-made ones.

James (beta DM, 2014 rules) wanted a box on the sheet for subclass resources, with the die
where it applies (a Battle Master's d8 that grows to d10 and d12). Two ways in:

- **Subclass counters.** A DM's homebrew subclass declares them (``SubclassResource``). A
  character of that subclass (in that DM's campaigns, by ``homebrew_service.subclass_for``)
  has each one from its level on. Its size and die are computed every time it's read, from
  the character's level, scores and proficiency bonus (``SubclassResource.state_at``), so a
  level-up or an edit to the subclass changes them with no sync. Only the spent uses are
  stored: a ``character_resources`` row with ``source="subclass"`` keyed by the counter's
  name, made the first time a use is spent. Its id is derived from the character and the
  name (``subclass_counter_id``), so the sheet can address a counter before any row exists.
  Rows whose counter no longer exists (renamed, removed, another subclass) are ignored when
  read and cleared on the next rest.
- **Hand-made counters** (``source="custom"``): any character, any name (a book subclass
  like Battle Master isn't in either SRD; an NPC's own pool). The row holds the size, die
  and recovery.

The list puts subclass counters first (in the subclass's order), then hand-made ones (oldest
first). ``uses_spent`` is clamped to the size on every read and change.

Authorization mirrors the class-feature trackers (``feature_service``): the campaign's DM
manages every counter of their characters. A player on their play link (the router resolves
the link to the character) may list, spend and restore that character's counters only; like
features, adding or editing counters is the DM's.

Rests (``refill_on_rest``, called by ``rest_service`` after its own DM check): a short rest
refills "short" counters, a long rest "short" and "long" ones; "none" never refills itself.
"""

from __future__ import annotations

import uuid
from typing import Any, Optional

from sqlmodel import Session

from db.repos.campaign_repo import CampaignRepo
from db.repos.character_repo import CharacterRepo
from db.repos.resource_repo import ResourceRepo
from domain.character import (
    MAX_CUSTOM_RESOURCES,
    CharacterResource,
    CharacterResourceConflictError,
    CharacterResourceCreate,
    CharacterResourceNotFoundError,
    CharacterResourceRead,
    CharacterResourceUpdate,
    PlayerCharacter,
    proficiency_bonus,
)
from integrations.event_bus import publish_pc_updated
from services import homebrew_service

# A fixed namespace for the ids of subclass counters (uuid5 of character id + name).
_SUBCLASS_COUNTER_NS = uuid.UUID("5e1b2c4d-1350-4a35-9f13-5c0de135aaaa")

_NOT_HERE = "That counter isn't on this character (it may have been removed)."


def subclass_counter_id(character_id: uuid.UUID, name: str) -> uuid.UUID:
    """The stable id of a subclass counter on one character (its stored row uses it too).

    Args:
        character_id: The character.
        name: The counter's name (case and outer spaces ignored).

    Returns:
        A UUID derived from both, the same every time.
    """
    return uuid.uuid5(_SUBCLASS_COUNTER_NS, f"{character_id}:{name.strip().casefold()}")


# ── Authorization ───────────────────────────────────────────────────────────


def _pc_or_404(db: Session, character_id: uuid.UUID) -> PlayerCharacter:
    """The character, or CharacterResourceNotFoundError."""
    pc = CharacterRepo.get_by_id(db, character_id)
    if pc is None:
        raise CharacterResourceNotFoundError(f"Player character {character_id} not found.")
    return pc


def _assert_dm(db: Session, character_id: uuid.UUID, dm_email: Optional[str]) -> PlayerCharacter:
    """The character, once the caller is shown to be its campaign's DM (fail closed).

    Args:
        db: Active database session.
        character_id: The character.
        dm_email: The signed-in caller.

    Returns:
        The character.

    Raises:
        CharacterResourceNotFoundError: No such character (or campaign).
        PermissionError: No identity, or not this campaign's DM.
    """
    if not dm_email or not dm_email.strip():
        raise PermissionError("Sign in to manage this character's counters.")
    pc = _pc_or_404(db, character_id)
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        raise CharacterResourceNotFoundError(f"Campaign for PC {character_id} not found.")
    if (campaign.dm_email or "").strip().lower() != dm_email.strip().lower():
        raise PermissionError("You do not have permission to manage this PC's counters.")
    return pc


# ── Reading ─────────────────────────────────────────────────────────────────


def _scores(pc: PlayerCharacter) -> dict[str, int]:
    """Ability scores by code, as ``SubclassResource.state_at`` takes them."""
    return {
        "STR": pc.score_str,
        "DEX": pc.score_dex,
        "CON": pc.score_con,
        "INT": pc.score_int,
        "WIS": pc.score_wis,
        "CHA": pc.score_cha,
    }


def _subclass_counters(db: Session, pc: PlayerCharacter) -> list[CharacterResourceRead]:
    """The character's homebrew subclass counters at its level, with nothing spent yet.

    Only the campaign DM's own subclass counts (``homebrew_service.subclass_for``); a book
    subclass, or another DM's, has none. Counters the character hasn't reached are left out.
    """
    campaign = CampaignRepo.get_by_id(db, pc.campaign_id)
    if campaign is None:
        return []
    sub = homebrew_service.subclass_for(db, campaign, pc.character_class, pc.subclass)
    if sub is None:
        return []
    scores = _scores(pc)
    prof = proficiency_bonus(pc.level)
    out: list[CharacterResourceRead] = []
    for res in sub.resources:
        state = res.state_at(pc.level, scores, prof)
        if state is None:
            continue
        max_uses, die = state
        out.append(
            CharacterResourceRead(
                id=subclass_counter_id(pc.id, res.name),
                character_id=pc.id,
                source="subclass",
                name=res.name,
                max_uses=max_uses,
                die=die,
                recovery=res.recovery,
                uses_spent=0,
                notes=res.text or None,
                level=res.level,
            )
        )
    return out


def _custom_read(row: CharacterResource) -> CharacterResourceRead:
    """A hand-made counter row as the sheet reads it (spent uses clamped)."""
    max_uses = max(1, int(row.max_uses or 1))
    return CharacterResourceRead(
        id=row.id,
        character_id=row.character_id,
        source="custom",
        name=row.name,
        max_uses=max_uses,
        die=row.die,
        recovery=row.recovery if row.recovery in ("short", "long", "none") else "long",
        uses_spent=max(0, min(row.uses_spent, max_uses)),
        notes=row.notes,
    )


def _read_all(
    db: Session, pc: PlayerCharacter
) -> tuple[list[CharacterResourceRead], list[CharacterResource]]:
    """``(counters, stored rows)``: subclass counters first, then hand-made ones."""
    rows = ResourceRepo.list_for_character(db, pc.id)
    spent = {r.id: r.uses_spent for r in rows if r.source == "subclass"}
    out: list[CharacterResourceRead] = []
    for counter in _subclass_counters(db, pc):
        used = spent.get(counter.id, 0)
        out.append(counter.model_copy(update={"uses_spent": max(0, min(used, counter.max_uses))}))
    out.extend(_custom_read(r) for r in rows if r.source == "custom")
    return out, rows


def _find(db: Session, pc: PlayerCharacter, resource_id: uuid.UUID) -> CharacterResourceRead:
    """One of the character's counters by id, or CharacterResourceNotFoundError."""
    counters, _ = _read_all(db, pc)
    for counter in counters:
        if counter.id == resource_id:
            return counter
    raise CharacterResourceNotFoundError(_NOT_HERE)


def list_for_character(
    db: Session, character_id: uuid.UUID, dm_email: Optional[str]
) -> list[CharacterResourceRead]:
    """Every counter of a character, for its DM's sheet.

    Args:
        db: Active database session.
        character_id: The character.
        dm_email: The signed-in DM.

    Returns:
        Subclass counters (in the subclass's order), then hand-made ones (oldest first).

    Raises:
        CharacterResourceNotFoundError: No such character.
        PermissionError: Not this campaign's DM.
    """
    pc = _assert_dm(db, character_id, dm_email)
    return _read_all(db, pc)[0]


def list_for_player(db: Session, pc_id: uuid.UUID) -> list[CharacterResourceRead]:
    """Every counter of the character a play link opens (the router resolved the link).

    Args:
        db: Active database session.
        pc_id: The character the link belongs to.

    Returns:
        The same list the DM sees.
    """
    return _read_all(db, _pc_or_404(db, pc_id))[0]


# ── Spending and restoring ──────────────────────────────────────────────────


def _change(
    db: Session, pc: PlayerCharacter, resource_id: uuid.UUID, delta: int
) -> CharacterResourceRead:
    """Spend (delta > 0) or give back (delta < 0) uses of one counter, clamped to its size.

    A subclass counter's row is made the first time a use is spent.
    """
    counter = _find(db, pc, resource_id)
    new = max(0, min(counter.max_uses, counter.uses_spent + delta))
    row = ResourceRepo.get_by_id(db, resource_id)
    if row is not None and row.character_id != pc.id:  # never another character's row
        raise CharacterResourceNotFoundError(_NOT_HERE)
    if row is None:
        if new == 0:
            return counter
        ResourceRepo.create(
            db,
            CharacterResource(
                id=resource_id,
                character_id=pc.id,
                source="subclass",
                name=counter.name,
                recovery=counter.recovery,
                uses_spent=new,
            ),
        )
    elif row.uses_spent != new:
        ResourceRepo.update(db, row, {"uses_spent": new})
    publish_pc_updated(pc.id, pc.campaign_id, kind="pc.features.updated")
    return counter.model_copy(update={"uses_spent": new})


def _amount(amount: int) -> int:
    """At least 1."""
    return max(1, int(amount))


def spend(
    db: Session,
    character_id: uuid.UUID,
    resource_id: uuid.UUID,
    dm_email: Optional[str],
    amount: int = 1,
) -> CharacterResourceRead:
    """The DM spends uses of a counter (never below none left).

    Args:
        db: Active database session.
        character_id: The character.
        resource_id: The counter.
        dm_email: The signed-in DM.
        amount: How many uses to spend (at least 1).

    Returns:
        The counter after the change.
    """
    pc = _assert_dm(db, character_id, dm_email)
    return _change(db, pc, resource_id, _amount(amount))


def restore(
    db: Session,
    character_id: uuid.UUID,
    resource_id: uuid.UUID,
    dm_email: Optional[str],
    amount: int = 1,
) -> CharacterResourceRead:
    """The DM gives uses of a counter back (never above full).

    Args:
        db: Active database session.
        character_id: The character.
        resource_id: The counter.
        dm_email: The signed-in DM.
        amount: How many uses to give back (at least 1).

    Returns:
        The counter after the change.
    """
    pc = _assert_dm(db, character_id, dm_email)
    return _change(db, pc, resource_id, -_amount(amount))


def spend_for_player(
    db: Session, pc_id: uuid.UUID, resource_id: uuid.UUID, amount: int = 1
) -> CharacterResourceRead:
    """The player spends uses of one of their own character's counters.

    Args:
        db: Active database session.
        pc_id: The character the play link belongs to.
        resource_id: The counter; another character's is "not on this character".
        amount: How many uses to spend.

    Returns:
        The counter after the change.
    """
    return _change(db, _pc_or_404(db, pc_id), resource_id, _amount(amount))


def restore_for_player(
    db: Session, pc_id: uuid.UUID, resource_id: uuid.UUID, amount: int = 1
) -> CharacterResourceRead:
    """The player gives back uses (a misclick fix) of their own character's counter.

    Args:
        db: Active database session.
        pc_id: The character the play link belongs to.
        resource_id: The counter.
        amount: How many uses to give back.

    Returns:
        The counter after the change.
    """
    return _change(db, _pc_or_404(db, pc_id), resource_id, -_amount(amount))


# ── Hand-made counters (the DM's) ───────────────────────────────────────────


def _require_free_name(
    counters: list[CharacterResourceRead], name: str, skip: Optional[uuid.UUID] = None
) -> None:
    """Refuse a name one of the character's counters already has (ignoring case)."""
    key = name.strip().casefold()
    for c in counters:
        if c.id != skip and c.name.casefold() == key:
            where = "from the subclass" if c.source == "subclass" else "on this sheet"
            raise CharacterResourceConflictError(
                f"There's already a counter called {c.name} {where}. Give this one its own name."
            )


def _custom_row(db: Session, pc: PlayerCharacter, resource_id: uuid.UUID) -> CharacterResource:
    """A hand-made counter row of this character, or the right refusal."""
    row = ResourceRepo.get_by_id(db, resource_id)
    if row is not None and row.character_id == pc.id and row.source == "custom":
        return row
    if any(c.id == resource_id for c in _subclass_counters(db, pc)):
        raise CharacterResourceConflictError(
            "This counter comes from the subclass. Change it in the subclass "
            "(Races & subclasses)."
        )
    raise CharacterResourceNotFoundError(_NOT_HERE)


def create_custom(
    db: Session,
    character_id: uuid.UUID,
    payload: CharacterResourceCreate,
    dm_email: Optional[str],
) -> CharacterResourceRead:
    """Add a hand-made counter to a character.

    Args:
        db: Active database session.
        character_id: The character.
        payload: Name, size, die, recovery and notes (validated).
        dm_email: The signed-in DM.

    Returns:
        The new counter, full.

    Raises:
        CharacterResourceConflictError: The name is taken, or the sheet is full.
    """
    pc = _assert_dm(db, character_id, dm_email)
    counters, rows = _read_all(db, pc)
    if sum(1 for r in rows if r.source == "custom") >= MAX_CUSTOM_RESOURCES:
        raise CharacterResourceConflictError(
            f"A character can have {MAX_CUSTOM_RESOURCES} hand-made counters at most."
        )
    _require_free_name(counters, payload.name)
    row = ResourceRepo.create(
        db,
        CharacterResource(
            character_id=pc.id,
            source="custom",
            name=payload.name,
            max_uses=payload.max_uses,
            die=payload.die,
            recovery=payload.recovery,
            uses_spent=0,
            notes=payload.notes,
        ),
    )
    publish_pc_updated(pc.id, pc.campaign_id, kind="pc.features.updated")
    return _custom_read(row)


def update_custom(
    db: Session,
    character_id: uuid.UUID,
    resource_id: uuid.UUID,
    payload: CharacterResourceUpdate,
    dm_email: Optional[str],
) -> CharacterResourceRead:
    """Change a hand-made counter (fields left out stay as they are).

    Shrinking it keeps the spent uses within the new size.

    Args:
        db: Active database session.
        character_id: The character.
        resource_id: The counter.
        payload: The fields to change (validated).
        dm_email: The signed-in DM.

    Returns:
        The counter after the change.

    Raises:
        CharacterResourceConflictError: A subclass counter, or a name that's taken.
        CharacterResourceNotFoundError: Not a counter of this character.
    """
    pc = _assert_dm(db, character_id, dm_email)
    row = _custom_row(db, pc, resource_id)
    fields: dict[str, Any] = payload.model_dump(exclude_unset=True)
    if "name" in fields:
        _require_free_name(_read_all(db, pc)[0], fields["name"], skip=row.id)
    size = int(fields.get("max_uses", row.max_uses or 1))
    spent = int(fields.get("uses_spent", row.uses_spent))
    fields["uses_spent"] = max(0, min(spent, size))
    row = ResourceRepo.update(db, row, fields)
    publish_pc_updated(pc.id, pc.campaign_id, kind="pc.features.updated")
    return _custom_read(row)


def delete_custom(
    db: Session, character_id: uuid.UUID, resource_id: uuid.UUID, dm_email: Optional[str]
) -> None:
    """Remove a hand-made counter. A subclass counter can't be removed here.

    Args:
        db: Active database session.
        character_id: The character.
        resource_id: The counter.
        dm_email: The signed-in DM.

    Raises:
        CharacterResourceConflictError: A subclass counter.
        CharacterResourceNotFoundError: Not a counter of this character.
    """
    pc = _assert_dm(db, character_id, dm_email)
    ResourceRepo.delete(db, _custom_row(db, pc, resource_id))
    publish_pc_updated(pc.id, pc.campaign_id, kind="pc.features.updated")


# ── Rests ───────────────────────────────────────────────────────────────────


def refill_on_rest(db: Session, pc: PlayerCharacter, rest: str) -> list[str]:
    """Refill a character's counters for a rest; the caller has already authorized it.

    A short rest refills "short" counters; a long rest refills "short" and "long" ones.
    Stored subclass rows whose counter no longer exists are cleared. No event is published:
    the rest publishes its own.

    Args:
        db: Active database session.
        pc: The resting character.
        rest: "short" or "long".

    Returns:
        The names of the counters that got uses back, in the sheet's order.
    """
    kinds = {"short"} if rest == "short" else {"short", "long"}
    counters, rows = _read_all(db, pc)
    by_id = {c.id: c for c in counters}
    stale = [r for r in rows if r.source == "subclass" and r.id not in by_id]
    refill = {
        r.id: r
        for r in rows
        if r.id in by_id and by_id[r.id].recovery in kinds and r.uses_spent > 0
    }
    restored = [c.name for c in counters if c.id in refill and c.uses_spent > 0]
    for row in refill.values():
        row.uses_spent = 0
    if refill:
        ResourceRepo.save_many(db, list(refill.values()))
    if stale:
        ResourceRepo.delete_many(db, stale)
    return restored
