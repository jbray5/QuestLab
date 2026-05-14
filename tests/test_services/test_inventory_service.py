"""Tests for services/inventory_service.py — PC inventory + attunement cap.

Plan 00019. All tests use the shared DuckDB in-memory engine. Each test
cleans `character_items` to avoid cross-test pollution.
"""

import uuid

import pytest
from sqlmodel import Session, delete

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.inventory_service as inv_svc
from db.repos.item_repo import ItemRepo
from domain.character import (
    AttunementLimitError,
    CharacterItem,
    CharacterItemCreate,
)
from domain.enums import CharacterClass, ItemRarity
from domain.item import ItemCreate


@pytest.fixture(autouse=True)
def _clean_character_items(duckdb_session: Session):
    """Wipe character_items before each test for isolation."""
    duckdb_session.exec(delete(CharacterItem))
    duckdb_session.commit()
    yield


def _unique_dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _make_campaign(db: Session, dm_email: str):
    return camp_svc.create_campaign(
        db, name="Test", setting="Realms", tone="Heroic", dm_email=dm_email
    )


def _make_pc(db: Session, campaign_id, dm_email: str, name: str = "Hero"):
    return char_svc.create_character(
        db,
        campaign_id=campaign_id,
        dm_email=dm_email,
        player_name="Player",
        character_name=name,
        race="Human",
        character_class=CharacterClass.FIGHTER,
        level=1,
        score_str=14,
        score_dex=14,
        score_con=14,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=12,
        hp_current=12,
        ac=16,
        speed=30,
    )


def _make_item(
    db: Session,
    name: str = "Potion of Healing",
    rarity: ItemRarity = ItemRarity.COMMON,
):
    return ItemRepo.create(
        db,
        ItemCreate(
            name=name,
            rarity=rarity,
            item_type="Potion",
            description="Restores 2d4+2 HP.",
            is_magic=True,
        ),
    )


class TestAddItem:
    """Tests for inventory_service.add_item."""

    def test_creates_new_row(self, duckdb_session: Session):
        """First add creates the row with the requested quantity."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)

        row = inv_svc.add_item(
            duckdb_session,
            pc.id,
            CharacterItemCreate(item_id=item.id, quantity=2),
            dm,
        )

        assert row.character_id == pc.id
        assert row.item_id == item.id
        assert row.quantity == 2
        assert row.equipped is False
        assert row.attuned is False

    def test_duplicate_add_bumps_quantity(self, duckdb_session: Session):
        """Adding the same item again increments quantity on the existing row."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)

        first = inv_svc.add_item(
            duckdb_session, pc.id, CharacterItemCreate(item_id=item.id, quantity=1), dm
        )
        second = inv_svc.add_item(
            duckdb_session, pc.id, CharacterItemCreate(item_id=item.id, quantity=3), dm
        )

        assert first.id == second.id
        assert second.quantity == 4

    def test_unknown_pc_raises(self, duckdb_session: Session):
        """Unknown PC raises ValueError."""
        dm = _unique_dm()
        item = _make_item(duckdb_session)
        with pytest.raises(ValueError):
            inv_svc.add_item(
                duckdb_session,
                uuid.uuid4(),
                CharacterItemCreate(item_id=item.id),
                dm,
            )

    def test_unknown_item_raises(self, duckdb_session: Session):
        """Unknown item raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        with pytest.raises(ValueError):
            inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=uuid.uuid4()), dm)

    def test_non_owner_denied(self, duckdb_session: Session):
        """A non-owning DM cannot modify another DM's PC's inventory."""
        dm1, dm2 = _unique_dm(), _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        pc = _make_pc(duckdb_session, c.id, dm1)
        item = _make_item(duckdb_session)
        with pytest.raises(PermissionError):
            inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=item.id), dm2)

    def test_initial_attune_respects_cap(self, duckdb_session: Session):
        """Adding a 4th attuned item via add_item raises AttunementLimitError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        for i in range(3):
            it = _make_item(duckdb_session, name=f"Ring of Magic #{i}")
            inv_svc.add_item(
                duckdb_session,
                pc.id,
                CharacterItemCreate(item_id=it.id, attuned=True),
                dm,
            )
        fourth = _make_item(duckdb_session, name="Cloak of Magic")
        with pytest.raises(AttunementLimitError):
            inv_svc.add_item(
                duckdb_session,
                pc.id,
                CharacterItemCreate(item_id=fourth.id, attuned=True),
                dm,
            )


class TestSetQuantity:
    """Tests for inventory_service.set_quantity."""

    def test_update_quantity(self, duckdb_session: Session):
        """set_quantity adjusts the count."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)
        row = inv_svc.add_item(
            duckdb_session, pc.id, CharacterItemCreate(item_id=item.id, quantity=3), dm
        )
        updated = inv_svc.set_quantity(duckdb_session, row.id, 7, dm)
        assert updated is not None
        assert updated.quantity == 7

    def test_zero_deletes_row(self, duckdb_session: Session):
        """set_quantity(0) deletes the row and returns None."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)
        row = inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=item.id), dm)
        result = inv_svc.set_quantity(duckdb_session, row.id, 0, dm)
        assert result is None
        assert inv_svc.list_for_character(duckdb_session, pc.id, dm) == []

    def test_negative_quantity_raises(self, duckdb_session: Session):
        """Negative quantity raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)
        row = inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=item.id), dm)
        with pytest.raises(ValueError):
            inv_svc.set_quantity(duckdb_session, row.id, -1, dm)


class TestSetEquipped:
    """Tests for inventory_service.set_equipped."""

    def test_toggle(self, duckdb_session: Session):
        """Equipping then un-equipping persists the change."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)
        row = inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=item.id), dm)
        on = inv_svc.set_equipped(duckdb_session, row.id, True, dm)
        assert on.equipped is True
        off = inv_svc.set_equipped(duckdb_session, row.id, False, dm)
        assert off.equipped is False


class TestSetAttuned:
    """Tests for inventory_service.set_attuned + the 3-item cap."""

    def test_attune_first_item(self, duckdb_session: Session):
        """Attuning the first item works."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)
        row = inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=item.id), dm)
        updated = inv_svc.set_attuned(duckdb_session, row.id, True, dm)
        assert updated.attuned is True
        assert updated.attuned_at is not None

    def test_attunement_cap_blocks_fourth(self, duckdb_session: Session):
        """4th attunement raises AttunementLimitError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        rows = []
        for i in range(3):
            it = _make_item(duckdb_session, name=f"Item #{i}")
            r = inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=it.id), dm)
            inv_svc.set_attuned(duckdb_session, r.id, True, dm)
            rows.append(r)
        fourth_item = _make_item(duckdb_session, name="Fourth")
        fourth_row = inv_svc.add_item(
            duckdb_session, pc.id, CharacterItemCreate(item_id=fourth_item.id), dm
        )
        with pytest.raises(AttunementLimitError):
            inv_svc.set_attuned(duckdb_session, fourth_row.id, True, dm)

    def test_unattune_then_attune_other(self, duckdb_session: Session):
        """Dropping attunement frees a slot for a new attune."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        rows = []
        for i in range(3):
            it = _make_item(duckdb_session, name=f"Item #{i}")
            r = inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=it.id), dm)
            inv_svc.set_attuned(duckdb_session, r.id, True, dm)
            rows.append(r)
        # Drop one
        inv_svc.set_attuned(duckdb_session, rows[0].id, False, dm)
        # Now a 4th attune is fine
        fourth_item = _make_item(duckdb_session, name="Fourth")
        fourth_row = inv_svc.add_item(
            duckdb_session, pc.id, CharacterItemCreate(item_id=fourth_item.id), dm
        )
        updated = inv_svc.set_attuned(duckdb_session, fourth_row.id, True, dm)
        assert updated.attuned is True

    def test_unattune_clears_timestamp(self, duckdb_session: Session):
        """Dropping attunement nulls attuned_at."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)
        row = inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=item.id), dm)
        on = inv_svc.set_attuned(duckdb_session, row.id, True, dm)
        assert on.attuned_at is not None
        off = inv_svc.set_attuned(duckdb_session, row.id, False, dm)
        assert off.attuned is False
        assert off.attuned_at is None


class TestRemove:
    """Tests for inventory_service.remove."""

    def test_remove(self, duckdb_session: Session):
        """Remove deletes the row."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)
        row = inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=item.id), dm)
        inv_svc.remove(duckdb_session, row.id, dm)
        assert inv_svc.list_for_character(duckdb_session, pc.id, dm) == []


class TestAddHandout:
    """Tests for inventory_service.add_handout (Plan 16 integration)."""

    def test_first_handout_creates_row(self, duckdb_session: Session):
        """First handout creates a row with qty 1."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)
        row = inv_svc.add_handout(duckdb_session, pc.id, item.id, dm)
        assert row.quantity == 1

    def test_repeat_handout_bumps_quantity(self, duckdb_session: Session):
        """Repeated handouts of the same item increment quantity."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        item = _make_item(duckdb_session)
        inv_svc.add_handout(duckdb_session, pc.id, item.id, dm)
        inv_svc.add_handout(duckdb_session, pc.id, item.id, dm)
        row = inv_svc.add_handout(duckdb_session, pc.id, item.id, dm)
        assert row.quantity == 3
