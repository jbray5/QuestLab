"""Plan 135 (RS) — character counters: a homebrew subclass's Superiority Dice and hand-made ones.

James (beta DM, 2014 rules) asked for a box on the sheet for subclass resources, with the die
where it applies. A homebrew subclass declares counters whose uses and die grow with level;
any character can also get a hand-made counter (Battle Master isn't in either SRD). Both
refill on rests. Only the spent uses of a subclass counter are stored, so a level-up or an
edit to the subclass resizes it with no sync.
"""

import uuid

import pytest

import services.campaign_service as camp_svc
import services.homebrew_service as hb_svc
from db.repos.resource_repo import ResourceRepo
from domain.character import (
    CharacterResourceConflictError,
    CharacterResourceCreate,
    CharacterResourceNotFoundError,
    CharacterResourceUpdate,
    PlayerCharacterUpdate,
)
from domain.enums import CharacterClass
from domain.homebrew import HomebrewSubclassCreate, HomebrewSubclassUpdate
from services import character_service
from services import resource_service as svc
from services import rest_service

SUPERIORITY = {
    "name": "Superiority Dice",
    "level": 3,
    "recovery": "short",
    "uses": {"3": 4, "7": 5, "15": 6},
    "die": {"3": "d8", "10": "d10", "18": "d12"},
    "text": "Spend a die to add it to an attack.",
}


def _dm() -> str:
    """A fresh DM email."""
    return f"dm135rs_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm: str, ruleset: str = "2014"):
    """A campaign for ``dm``."""
    return camp_svc.create_campaign(
        db, name="Hyrule", setting="R", tone="T", dm_email=dm, ruleset=ruleset
    )


def _subclass(db, dm: str, resources=None, name: str = "Sheikah Blade"):
    """A homebrew Fighter subclass with the Battle Master-style counter."""
    return hb_svc.create_subclass(
        db,
        HomebrewSubclassCreate(
            name=name,
            character_class="Fighter",
            resources=resources if resources is not None else [SUPERIORITY],
        ),
        dm,
    )


def _pc(db, campaign, dm: str, level: int = 10, subclass: str | None = "Sheikah Blade"):
    """A Fighter of ``level`` with ``subclass``."""
    return character_service.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="James",
        character_name=f"Impa {uuid.uuid4().hex[:4]}",
        race="Human",
        character_class=CharacterClass.FIGHTER,
        subclass=subclass,
        level=level,
        score_str=16,
        score_dex=14,
        score_con=14,
        score_int=10,
        score_wis=12,
        score_cha=8,
        hp_max=80,
        hp_current=80,
        ac=18,
    )


def _setup(db, level: int = 10, resources=None):
    """(dm, campaign, pc) with the homebrew subclass in the DM's catalog."""
    dm = _dm()
    c = _campaign(db, dm)
    _subclass(db, dm, resources=resources)
    return dm, c, _pc(db, c, dm, level=level)


def _custom(db, pc, dm, **extras):
    """A hand-made counter on ``pc``."""
    payload = {"name": "Fighting Spirit", "max_uses": 3, "recovery": "long"}
    payload.update(extras)
    return svc.create_custom(db, pc.id, CharacterResourceCreate(**payload), dm)


# ── Subclass counters ───────────────────────────────────────────────────────


def test_battle_master_style_counter_at_level_10(duckdb_session):
    """Level 10: 5 × d10. Spend one → 4 left. A short rest refills it and says so."""
    dm, _c, pc = _setup(duckdb_session)
    [dice] = svc.list_for_character(duckdb_session, pc.id, dm)
    assert (dice.source, dice.name, dice.max_uses, dice.die) == (
        "subclass",
        "Superiority Dice",
        5,
        "d10",
    )
    assert (dice.uses_spent, dice.recovery, dice.level) == (0, "short", 3)
    assert dice.notes == "Spend a die to add it to an attack."

    after = svc.spend(duckdb_session, pc.id, dice.id, dm)
    assert after.max_uses - after.uses_spent == 4
    assert svc.list_for_character(duckdb_session, pc.id, dm)[0].uses_spent == 1

    summary = rest_service.short_rest_pc(duckdb_session, pc.id, dm)
    assert "Superiority Dice" in summary.features_restored
    assert svc.list_for_character(duckdb_session, pc.id, dm)[0].uses_spent == 0


def test_counter_id_is_stable_before_and_after_a_row_exists(duckdb_session):
    """The sheet can spend a counter that has no stored row yet; the id never changes."""
    dm, _c, pc = _setup(duckdb_session)
    before = svc.list_for_character(duckdb_session, pc.id, dm)[0].id
    assert ResourceRepo.list_for_character(duckdb_session, pc.id) == []
    svc.spend(duckdb_session, pc.id, before, dm, amount=2)
    assert svc.list_for_character(duckdb_session, pc.id, dm)[0].id == before
    [row] = ResourceRepo.list_for_character(duckdb_session, pc.id)
    assert (row.source, row.name, row.uses_spent, row.max_uses) == (
        "subclass",
        "Superiority Dice",
        2,
        None,
    )


def test_spend_and_restore_are_clamped(duckdb_session):
    """Never below none left, never above full."""
    dm, _c, pc = _setup(duckdb_session)
    rid = svc.list_for_character(duckdb_session, pc.id, dm)[0].id
    assert svc.restore(duckdb_session, pc.id, rid, dm).uses_spent == 0
    assert svc.spend(duckdb_session, pc.id, rid, dm, amount=99).uses_spent == 5
    assert svc.spend(duckdb_session, pc.id, rid, dm).uses_spent == 5
    assert svc.restore(duckdb_session, pc.id, rid, dm, amount=2).uses_spent == 3


def test_level_change_resizes_with_no_sync_and_clamps(duckdb_session):
    """All 5 spent at level 10; dropped to level 5 the counter is 4 × d8 with 4 spent."""
    dm, _c, pc = _setup(duckdb_session)
    rid = svc.list_for_character(duckdb_session, pc.id, dm)[0].id
    svc.spend(duckdb_session, pc.id, rid, dm, amount=5)

    character_service.update_character(duckdb_session, pc.id, dm, PlayerCharacterUpdate(level=5))
    [dice] = svc.list_for_character(duckdb_session, pc.id, dm)
    assert (dice.max_uses, dice.die, dice.uses_spent) == (4, "d8", 4)
    assert svc.restore(duckdb_session, pc.id, rid, dm).uses_spent == 3

    character_service.update_character(duckdb_session, pc.id, dm, PlayerCharacterUpdate(level=18))
    [dice] = svc.list_for_character(duckdb_session, pc.id, dm)
    assert (dice.max_uses, dice.die, dice.uses_spent) == (6, "d12", 3)


def test_dm_edit_to_the_subclass_changes_the_sheet(duckdb_session):
    """The DM makes it 7 dice at level 7: every character reads it at once."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    sub = _subclass(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm)
    hb_svc.update_subclass(
        duckdb_session,
        sub.id,
        HomebrewSubclassUpdate(resources=[{**SUPERIORITY, "uses": {"3": 4, "7": 7}}]),
        dm,
    )
    assert svc.list_for_character(duckdb_session, pc.id, dm)[0].max_uses == 7


def test_formula_counter_follows_the_character(duckdb_session):
    """A counter that follows the proficiency bonus: +4 at level 10."""
    dm, _c, pc = _setup(
        duckdb_session,
        resources=[{"name": "Grit", "level": 1, "recovery": "long", "uses_formula": "prof_bonus"}],
    )
    [grit] = svc.list_for_character(duckdb_session, pc.id, dm)
    assert (grit.max_uses, grit.die, grit.recovery) == (4, None, "long")


def test_no_counter_before_its_level(duckdb_session):
    """A level 2 character has no Superiority Dice yet."""
    dm, _c, pc = _setup(duckdb_session, level=2)
    assert svc.list_for_character(duckdb_session, pc.id, dm) == []


def test_another_dms_subclass_never_counts(duckdb_session):
    """Same name, another DM's catalog: no counters."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _subclass(duckdb_session, _dm())
    pc = _pc(duckdb_session, c, dm)
    assert svc.list_for_character(duckdb_session, pc.id, dm) == []


def test_book_subclass_has_only_hand_made_counters(duckdb_session):
    """A Battle Master (not homebrew, not SRD) gets a hand-made counter and nothing else."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm, subclass="Battle Master")
    assert svc.list_for_character(duckdb_session, pc.id, dm) == []
    made = _custom(duckdb_session, pc, dm, name="Superiority Dice", max_uses=5, die="D10")
    [only] = svc.list_for_character(duckdb_session, pc.id, dm)
    assert (only.id, only.source, only.max_uses, only.die) == (made.id, "custom", 5, "d10")


def test_rename_in_the_subclass_drops_the_old_spent_uses(duckdb_session):
    """A renamed counter reads full; the old row is ignored, then cleared on a rest."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    sub = _subclass(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm)
    rid = svc.list_for_character(duckdb_session, pc.id, dm)[0].id
    svc.spend(duckdb_session, pc.id, rid, dm, amount=3)
    hb_svc.update_subclass(
        duckdb_session,
        sub.id,
        HomebrewSubclassUpdate(resources=[{**SUPERIORITY, "name": "Shadow Dice"}]),
        dm,
    )
    [dice] = svc.list_for_character(duckdb_session, pc.id, dm)
    assert (dice.name, dice.uses_spent) == ("Shadow Dice", 0)
    with pytest.raises(CharacterResourceNotFoundError):
        svc.spend(duckdb_session, pc.id, rid, dm)
    rest_service.long_rest_pc(duckdb_session, pc.id, dm)
    assert ResourceRepo.list_for_character(duckdb_session, pc.id) == []


# ── Hand-made counters ──────────────────────────────────────────────────────


def test_custom_counter_works_like_a_subclass_one(duckdb_session):
    """Name, max, die, recovery: spend one → 2 left; a short rest refills it."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm, subclass=None)
    made = _custom(duckdb_session, pc, dm, name="  Psi Dice ", die="d6", recovery="short")
    assert (made.name, made.max_uses, made.die, made.recovery) == ("Psi Dice", 3, "d6", "short")
    assert svc.spend(duckdb_session, pc.id, made.id, dm).uses_spent == 1
    summary = rest_service.short_rest_pc(duckdb_session, pc.id, dm)
    assert summary.features_restored == ["Psi Dice"]
    assert svc.list_for_character(duckdb_session, pc.id, dm)[0].uses_spent == 0


def test_long_counters_wait_for_a_long_rest_and_none_never_refills(duckdb_session):
    """A short rest leaves "long" counters spent; a long rest refills them; "none" stays."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm, subclass=None)
    spirit = _custom(duckdb_session, pc, dm)
    charges = _custom(duckdb_session, pc, dm, name="Wand charges", max_uses=7, recovery="none")
    svc.spend(duckdb_session, pc.id, spirit.id, dm)
    svc.spend(duckdb_session, pc.id, charges.id, dm, amount=2)

    assert rest_service.short_rest_pc(duckdb_session, pc.id, dm).features_restored == []
    spent = {r.name: r.uses_spent for r in svc.list_for_character(duckdb_session, pc.id, dm)}
    assert spent == {"Fighting Spirit": 1, "Wand charges": 2}

    assert rest_service.long_rest_pc(duckdb_session, pc.id, dm).features_restored == [
        "Fighting Spirit"
    ]
    spent = {r.name: r.uses_spent for r in svc.list_for_character(duckdb_session, pc.id, dm)}
    assert spent == {"Fighting Spirit": 0, "Wand charges": 2}


def test_subclass_counters_come_first_then_hand_made(duckdb_session):
    """The sheet's order: the subclass's counters, then hand-made ones oldest first."""
    dm, _c, pc = _setup(duckdb_session)
    _custom(duckdb_session, pc, dm, name="Luck")
    _custom(duckdb_session, pc, dm, name="Arrows")
    names = [r.name for r in svc.list_for_character(duckdb_session, pc.id, dm)]
    assert names == ["Superiority Dice", "Luck", "Arrows"]


def test_custom_counter_edit_and_delete(duckdb_session):
    """Shrinking keeps the spent uses within the new size; die and notes clear with null."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm, subclass=None)
    made = _custom(duckdb_session, pc, dm, max_uses=6, die="d8", notes="Bonus action.")
    svc.spend(duckdb_session, pc.id, made.id, dm, amount=5)
    changed = svc.update_custom(
        duckdb_session,
        pc.id,
        made.id,
        CharacterResourceUpdate(max_uses=2, die=None, notes=None, name="Spirit"),
        dm,
    )
    assert (changed.name, changed.max_uses, changed.uses_spent) == ("Spirit", 2, 2)
    assert (changed.die, changed.notes) == (None, None)
    assert ResourceRepo.get_by_id(duckdb_session, made.id).uses_spent == 2
    svc.delete_custom(duckdb_session, pc.id, made.id, dm)
    assert svc.list_for_character(duckdb_session, pc.id, dm) == []


def test_names_are_unique_on_a_sheet(duckdb_session):
    """No two counters with one name, the subclass's included (ignoring case)."""
    dm, _c, pc = _setup(duckdb_session)
    with pytest.raises(CharacterResourceConflictError, match="from the subclass"):
        _custom(duckdb_session, pc, dm, name="superiority dice")
    luck = _custom(duckdb_session, pc, dm, name="Luck")
    with pytest.raises(CharacterResourceConflictError, match="on this sheet"):
        _custom(duckdb_session, pc, dm, name="LUCK")
    other = _custom(duckdb_session, pc, dm, name="Grit")
    with pytest.raises(CharacterResourceConflictError):
        svc.update_custom(duckdb_session, pc.id, other.id, CharacterResourceUpdate(name="luck"), dm)
    svc.update_custom(duckdb_session, pc.id, luck.id, CharacterResourceUpdate(name="Luck"), dm)


def test_subclass_counters_are_read_only_on_the_sheet(duckdb_session):
    """Editing or removing a subclass counter here is refused: change it in the subclass."""
    dm, _c, pc = _setup(duckdb_session)
    rid = svc.list_for_character(duckdb_session, pc.id, dm)[0].id
    with pytest.raises(CharacterResourceConflictError, match="in the subclass"):
        svc.update_custom(duckdb_session, pc.id, rid, CharacterResourceUpdate(max_uses=9), dm)
    with pytest.raises(CharacterResourceConflictError, match="in the subclass"):
        svc.delete_custom(duckdb_session, pc.id, rid, dm)


def test_hand_made_counters_have_a_limit(duckdb_session, monkeypatch):
    """At most MAX_CUSTOM_RESOURCES hand-made counters on one character."""
    monkeypatch.setattr(svc, "MAX_CUSTOM_RESOURCES", 2)
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    pc = _pc(duckdb_session, c, dm, subclass=None)
    _custom(duckdb_session, pc, dm, name="A")
    _custom(duckdb_session, pc, dm, name="B")
    with pytest.raises(CharacterResourceConflictError, match="at most"):
        _custom(duckdb_session, pc, dm, name="C")


@pytest.mark.parametrize(
    "bad",
    [
        {"name": "", "max_uses": 3},
        {"name": "X", "max_uses": 0},
        {"name": "X", "max_uses": 101},
        {"name": "X", "max_uses": 3, "die": "d7"},
        {"name": "X", "max_uses": 3, "recovery": "dawn"},
        {"name": "X" * 81, "max_uses": 3},
    ],
)
def test_bad_custom_counters_are_refused(bad):
    """Names 1–80 characters, 1–100 uses, d4–d12, short/long/none."""
    with pytest.raises(ValueError):
        CharacterResourceCreate(**bad)


# ── Authorization and deletion ──────────────────────────────────────────────


def test_a_stranger_is_refused(duckdb_session):
    """Another DM can't list, spend, add, change or delete."""
    dm, _c, pc = _setup(duckdb_session)
    made = _custom(duckdb_session, pc, dm)
    stranger = _dm()
    with pytest.raises(PermissionError):
        svc.list_for_character(duckdb_session, pc.id, stranger)
    with pytest.raises(PermissionError):
        svc.spend(duckdb_session, pc.id, made.id, stranger)
    with pytest.raises(PermissionError):
        svc.restore(duckdb_session, pc.id, made.id, stranger)
    with pytest.raises(PermissionError):
        _custom(duckdb_session, pc, stranger, name="Mine")
    with pytest.raises(PermissionError):
        svc.update_custom(duckdb_session, pc.id, made.id, CharacterResourceUpdate(), stranger)
    with pytest.raises(PermissionError):
        svc.delete_custom(duckdb_session, pc.id, made.id, stranger)
    with pytest.raises(PermissionError):
        svc.list_for_character(duckdb_session, pc.id, "")


def test_player_link_spends_only_its_own_counters(duckdb_session):
    """The play link spends and restores its character's counters; another's is not there."""
    dm, c, pc = _setup(duckdb_session)
    friend = _pc(duckdb_session, c, dm)
    mine = svc.list_for_player(duckdb_session, pc.id)[0]
    assert svc.spend_for_player(duckdb_session, pc.id, mine.id).uses_spent == 1
    assert svc.restore_for_player(duckdb_session, pc.id, mine.id).uses_spent == 0
    with pytest.raises(CharacterResourceNotFoundError):
        svc.spend_for_player(duckdb_session, friend.id, mine.id)
    made = _custom(duckdb_session, pc, dm)
    with pytest.raises(CharacterResourceNotFoundError):
        svc.spend_for_player(duckdb_session, friend.id, made.id)


def test_deleting_a_character_deletes_its_counters(duckdb_session):
    """A character with a hand-made counter and a spent subclass counter deletes cleanly."""
    dm, _c, pc = _setup(duckdb_session)
    _custom(duckdb_session, pc, dm)
    rid = svc.list_for_character(duckdb_session, pc.id, dm)[0].id
    svc.spend(duckdb_session, pc.id, rid, dm)
    assert len(ResourceRepo.list_for_character(duckdb_session, pc.id)) == 2
    character_service.delete_character(duckdb_session, pc.id, dm)
    assert ResourceRepo.list_for_character(duckdb_session, pc.id) == []


def test_deleting_a_campaign_deletes_its_characters_counters(duckdb_session):
    """The campaign cascade goes through the character delete, counters included."""
    dm, c, pc = _setup(duckdb_session)
    _custom(duckdb_session, pc, dm)
    camp_svc.delete_campaign(duckdb_session, c.id, dm)
    assert ResourceRepo.list_for_character(duckdb_session, pc.id) == []
