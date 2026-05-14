"""Tests for services/spellcasting_service.py — PC spell list + slot tracking.

Plan 00020. All tests use the shared DuckDB in-memory engine. Each test
clears character_spells + the slot-used column to avoid cross-test bleed.
"""

import uuid

import pytest
from sqlmodel import Session, delete

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.spellcasting_service as sc_svc
from db.repos.spell_repo import SpellRepo
from domain.character import (
    CharacterSpell,
    CharacterSpellCreate,
    NoSpellSlotError,
    PlayerCharacter,
)
from domain.enums import CharacterClass
from domain.spell import SpellCreate


@pytest.fixture(autouse=True)
def _clean(duckdb_session: Session):
    """Wipe character_spells and reset spell_slots_used before each test."""
    duckdb_session.exec(delete(CharacterSpell))
    duckdb_session.commit()
    # Reset slot counters across any PCs that linger from prior tests.
    pcs = duckdb_session.exec(  # noqa: F841
        # Use the SQLModel select; cheap because the table is small in tests
        __import__("sqlmodel").select(PlayerCharacter)
    ).all()
    for p in pcs:
        p.spell_slots_used = None
        duckdb_session.add(p)
    duckdb_session.commit()
    yield


def _unique_dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _make_campaign(db, dm_email):
    return camp_svc.create_campaign(
        db, name="Test", setting="Realms", tone="Heroic", dm_email=dm_email
    )


def _make_pc(
    db,
    campaign_id,
    dm_email,
    *,
    name: str = "Hero",
    character_class: CharacterClass = CharacterClass.WIZARD,
    level: int = 5,
):
    return char_svc.create_character(
        db,
        campaign_id=campaign_id,
        dm_email=dm_email,
        player_name="Player",
        character_name=name,
        race="Human",
        character_class=character_class,
        level=level,
        score_str=10,
        score_dex=14,
        score_con=14,
        score_int=16,
        score_wis=10,
        score_cha=10,
        hp_max=20,
        hp_current=20,
        ac=12,
        speed=30,
    )


def _make_spell(db: Session, name: str = "Fireball", level: int = 3):
    return SpellRepo.create(
        db,
        SpellCreate(
            name=name,
            level=level,
            school="Evocation",
            casting_time="1 action",
            range="150 feet",
            components_v=True,
            components_s=True,
            duration="Instantaneous",
            description=f"{name} description.",
            classes=["Wizard"],
        ),
    )


# ── learn_spell / list_known / set_prepared / forget_spell ──────────────────


class TestLearnSpell:
    """Tests for spellcasting_service.learn_spell."""

    def test_create_new_row(self, duckdb_session: Session):
        """First learn creates the row with the supplied flags."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        spell = _make_spell(duckdb_session)
        row = sc_svc.learn_spell(
            duckdb_session,
            pc.id,
            CharacterSpellCreate(spell_id=spell.id, prepared=True),
            dm,
        )
        assert row.character_id == pc.id
        assert row.spell_id == spell.id
        assert row.known is True
        assert row.prepared is True

    def test_idempotent_unions_flags(self, duckdb_session: Session):
        """Repeat learns merge by union: prepared once -> always prepared."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        spell = _make_spell(duckdb_session)
        first = sc_svc.learn_spell(
            duckdb_session,
            pc.id,
            CharacterSpellCreate(spell_id=spell.id, prepared=False),
            dm,
        )
        second = sc_svc.learn_spell(
            duckdb_session,
            pc.id,
            CharacterSpellCreate(spell_id=spell.id, prepared=True),
            dm,
        )
        assert first.id == second.id  # same row
        assert second.prepared is True

    def test_unknown_spell_raises(self, duckdb_session: Session):
        """Unknown spell_id raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        with pytest.raises(ValueError):
            sc_svc.learn_spell(
                duckdb_session,
                pc.id,
                CharacterSpellCreate(spell_id=uuid.uuid4()),
                dm,
            )

    def test_non_owner_denied(self, duckdb_session: Session):
        """Another DM can't add spells to someone else's PC."""
        dm1, dm2 = _unique_dm(), _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        pc = _make_pc(duckdb_session, c.id, dm1)
        spell = _make_spell(duckdb_session)
        with pytest.raises(PermissionError):
            sc_svc.learn_spell(
                duckdb_session,
                pc.id,
                CharacterSpellCreate(spell_id=spell.id),
                dm2,
            )


class TestSetPrepared:
    """Tests for spellcasting_service.set_prepared."""

    def test_toggle(self, duckdb_session: Session):
        """Toggle prepared on/off."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        spell = _make_spell(duckdb_session)
        row = sc_svc.learn_spell(duckdb_session, pc.id, CharacterSpellCreate(spell_id=spell.id), dm)
        on = sc_svc.set_prepared(duckdb_session, row.id, True, dm)
        assert on.prepared is True
        off = sc_svc.set_prepared(duckdb_session, row.id, False, dm)
        assert off.prepared is False


class TestForgetSpell:
    """Tests for spellcasting_service.forget_spell."""

    def test_delete(self, duckdb_session: Session):
        """Forget removes the row."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        spell = _make_spell(duckdb_session)
        row = sc_svc.learn_spell(duckdb_session, pc.id, CharacterSpellCreate(spell_id=spell.id), dm)
        sc_svc.forget_spell(duckdb_session, row.id, dm)
        assert sc_svc.list_known_for_character(duckdb_session, pc.id, dm) == []


# ── Slot state ──────────────────────────────────────────────────────────────


class TestSlotState:
    """Tests for spellcasting_service.slot_state."""

    def test_wizard_level_5_max_slots(self, duckdb_session: Session):
        """L5 Wizard: 4 1st, 3 2nd, 2 3rd, all initially unused."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm, character_class=CharacterClass.WIZARD, level=5)
        state = sc_svc.slot_state(duckdb_session, pc.id, dm)
        assert state.character_id == pc.id
        assert state.levels["1"].max == 4
        assert state.levels["1"].remaining == 4
        assert state.levels["2"].max == 3
        assert state.levels["3"].max == 2

    def test_fighter_no_slots(self, duckdb_session: Session):
        """A pure martial returns an empty levels dict."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm, character_class=CharacterClass.FIGHTER, level=5)
        state = sc_svc.slot_state(duckdb_session, pc.id, dm)
        assert state.levels == {}

    def test_warlock_normalized_to_per_level(self, duckdb_session: Session):
        """L5 Warlock pact magic: 2 slots of level 3 → state has only level 3 entry."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm, character_class=CharacterClass.WARLOCK, level=5)
        state = sc_svc.slot_state(duckdb_session, pc.id, dm)
        assert "3" in state.levels
        assert state.levels["3"].max == 2
        assert "1" not in state.levels  # No level-1 slots for L5 Warlock


# ── expend / restore / long rest ────────────────────────────────────────────


class TestExpendSlot:
    """Tests for spellcasting_service.expend_slot."""

    def test_basic_expend(self, duckdb_session: Session):
        """Wizard L5: cast a fireball → 3rd-level remaining drops by 1."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)  # Wizard L5
        state = sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)
        assert state.levels["3"].used == 1
        assert state.levels["3"].remaining == 1
        # Other levels untouched
        assert state.levels["1"].used == 0
        assert state.levels["2"].used == 0

    def test_drains_to_zero(self, duckdb_session: Session):
        """Spending all level-3 slots leaves remaining=0."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)  # 2 third-level slots
        sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)
        state = sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)
        assert state.levels["3"].remaining == 0
        assert state.levels["3"].used == 2

    def test_overspend_raises(self, duckdb_session: Session):
        """4th expend on a 2-slot level raises NoSpellSlotError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)  # 2 third-level slots
        sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)
        sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)
        with pytest.raises(NoSpellSlotError):
            sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)

    def test_invalid_level_raises(self, duckdb_session: Session):
        """Slot level outside 1..9 raises ValueError."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        with pytest.raises(ValueError):
            sc_svc.expend_slot(duckdb_session, pc.id, 0, dm)
        with pytest.raises(ValueError):
            sc_svc.expend_slot(duckdb_session, pc.id, 10, dm)

    def test_unavailable_level_raises(self, duckdb_session: Session):
        """Expending a level the PC can't cast at all (e.g. L9 for a L5 Wizard)."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)  # Wizard L5 — no L4+ slots
        with pytest.raises(NoSpellSlotError):
            sc_svc.expend_slot(duckdb_session, pc.id, 9, dm)

    def test_non_owner_denied(self, duckdb_session: Session):
        """A non-owning DM cannot spend another DM's PC's slots."""
        dm1, dm2 = _unique_dm(), _unique_dm()
        c = _make_campaign(duckdb_session, dm1)
        pc = _make_pc(duckdb_session, c.id, dm1)
        with pytest.raises(PermissionError):
            sc_svc.expend_slot(duckdb_session, pc.id, 1, dm2)


class TestRestoreSlot:
    """Tests for spellcasting_service.restore_slot."""

    def test_undo(self, duckdb_session: Session):
        """Restore decrements used by 1."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)
        state = sc_svc.restore_slot(duckdb_session, pc.id, 3, dm)
        assert state.levels["3"].used == 0
        assert state.levels["3"].remaining == 2

    def test_restore_at_zero_is_noop(self, duckdb_session: Session):
        """Restoring when used is already 0 is a no-op (doesn't go negative)."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        state = sc_svc.restore_slot(duckdb_session, pc.id, 3, dm)
        assert state.levels["3"].used == 0


class TestLongRest:
    """Tests for spellcasting_service.long_rest_recover."""

    def test_full_recovery(self, duckdb_session: Session):
        """Long rest restores every level to max."""
        dm = _unique_dm()
        c = _make_campaign(duckdb_session, dm)
        pc = _make_pc(duckdb_session, c.id, dm)
        # Spend a bunch
        sc_svc.expend_slot(duckdb_session, pc.id, 1, dm)
        sc_svc.expend_slot(duckdb_session, pc.id, 1, dm)
        sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)
        state = sc_svc.long_rest_recover(duckdb_session, pc.id, dm)
        for lvl in state.levels.values():
            assert lvl.used == 0
            assert lvl.remaining == lvl.max
