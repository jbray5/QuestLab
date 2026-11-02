"""Plan 132 — another DM's homebrew spell never reaches your table (SEC-003).

The level-up guide's spell options and its name lookups, and learning a spell by id, see
only the shared catalog and the PC's own DM's homebrew.
"""

import json
import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.levelup_service as levelup_svc
import services.spell_service as spell_svc
import services.spellcasting_service as cast_svc
from domain.character import CharacterSpellCreate
from domain.enums import CharacterClass
from domain.spell import SpellCreate


def _email(tag: str) -> str:
    return f"p132.{tag}.{uuid.uuid4().hex[:6]}@example.com"


def _homebrew(db: Session, name: str, owner: str):
    return spell_svc.create_spell(
        db,
        SpellCreate(
            name=name,
            level=1,
            school="Evocation",
            casting_time="Action",
            range="Self",
            duration="Instantaneous",
            description="A test spell.",
            classes=["Wizard"],
        ),
        dm_email=owner,
    )


def _wizard(db: Session, dm: str):
    c = camp_svc.create_campaign(db, name="Vis", dm_email=dm)
    return char_svc.create_character(
        db,
        campaign_id=c.id,
        dm_email=dm,
        player_name="P",
        character_name="T",
        race="Elf",
        character_class=CharacterClass.WIZARD,
        level=1,
        score_str=8,
        score_dex=14,
        score_con=12,
        score_int=16,
        score_wis=10,
        score_cha=8,
        hp_max=8,
        hp_current=8,
        ac=12,
    )


def test_level_up_plan_hides_other_dms_homebrew(duckdb_session: Session):
    """DM B's homebrew is absent from DM A's player's level-up plan; A's own is offered."""
    db = duckdb_session
    a, b = _email("a"), _email("b")
    tag = uuid.uuid4().hex[:5]
    _homebrew(db, f"Glimmer of B {tag}", b)
    _homebrew(db, f"Glimmer of A {tag}", a)
    pc = _wizard(db, a)
    levelup_svc.grant(db, pc.id, a)
    blob = json.dumps(levelup_svc.plan_for(db, pc.id).model_dump(mode="json"))
    assert f"Glimmer of B {tag}" not in blob
    assert f"Glimmer of A {tag}" in blob


def test_learning_another_dms_homebrew_by_id_is_refused(duckdb_session: Session):
    """The id of another DM's homebrew reads as not found; your own learns fine."""
    db = duckdb_session
    a, b = _email("a"), _email("b")
    theirs = _homebrew(db, f"Theirs {uuid.uuid4().hex[:5]}", b)
    mine = _homebrew(db, f"Mine {uuid.uuid4().hex[:5]}", a)
    pc = _wizard(db, a)
    with pytest.raises(ValueError, match="not found"):
        cast_svc.learn_spell(db, pc.id, CharacterSpellCreate(spell_id=theirs.id), a)
    row = cast_svc.learn_spell(db, pc.id, CharacterSpellCreate(spell_id=mine.id), a)
    assert row.spell_id == mine.id


def _item(db: Session, name: str, owner):
    from db.repos.item_repo import ItemRepo
    from domain.enums import ItemRarity
    from domain.item import ItemCreate

    return ItemRepo.create(
        db,
        ItemCreate(name=name, rarity=ItemRarity.COMMON, item_type="Adventuring Gear"),
        owner_email=owner,
    )


def test_inventory_add_refuses_another_dms_homebrew(duckdb_session: Session):
    """Adding another DM's homebrew item by id reads as not found; your own adds."""
    import services.inventory_service as inv_svc
    from domain.character import CharacterItemCreate

    db = duckdb_session
    a, b = _email("a"), _email("b")
    theirs = _item(db, f"Their trinket {uuid.uuid4().hex[:5]}", b)
    mine = _item(db, f"My trinket {uuid.uuid4().hex[:5]}", a)
    pc = _wizard(db, a)
    with pytest.raises(ValueError, match="not found"):
        inv_svc.add_item(db, pc.id, CharacterItemCreate(item_id=theirs.id), a)
    assert inv_svc.add_item(db, pc.id, CharacterItemCreate(item_id=mine.id), a).item_id == mine.id


def test_shop_name_match_prefers_the_shared_row(duckdb_session: Session):
    """A homebrew row that shares an SRD name (made before the name rule) never shadows it."""
    from domain.shop import ShopItemAdd
    from services import shop_service

    db = duckdb_session
    a = _email("a")
    name = f"P132 Lantern {uuid.uuid4().hex[:5]}"
    mine = _item(db, name, a)
    shared = _item(db, name, None)
    got = shop_service._find_or_create_item(db, ShopItemAdd(name=name), a)
    assert got.id == shared.id and got.id != mine.id
