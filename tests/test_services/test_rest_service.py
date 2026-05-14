"""Tests for services/rest_service.py (Plan 00021) — per-PC + party rest."""

import uuid

import pytest
from sqlmodel import Session, delete

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.feature_service as feat_svc
import services.rest_service as rest_svc
import services.spellcasting_service as sc_svc
from db.repos.class_feature_repo import ClassFeatureRepo
from domain.character import (
    CharacterFeature,
    CharacterFeatureCreate,
    ClassFeature,
    ClassFeatureCreate,
    PlayerCharacter,
)
from domain.enums import CharacterClass, RecoveryType, UsesFormula


@pytest.fixture(autouse=True)
def _clean(duckdb_session: Session):
    """Wipe feature rows + reset slot counters between tests.

    Two commits across the child→parent delete pair: DuckDB checks FK
    constraints at statement time.
    """
    duckdb_session.exec(delete(CharacterFeature))
    duckdb_session.commit()
    duckdb_session.exec(delete(ClassFeature))
    duckdb_session.commit()
    pcs = duckdb_session.exec(__import__("sqlmodel").select(PlayerCharacter)).all()
    for p in pcs:
        p.spell_slots_used = None
        duckdb_session.add(p)
    duckdb_session.commit()
    yield


def _dm() -> str:
    return f"dm_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm):
    return camp_svc.create_campaign(db, name="C", setting="R", tone="T", dm_email=dm)


def _pc(
    db,
    campaign_id,
    dm,
    *,
    name: str = "Hero",
    character_class: CharacterClass = CharacterClass.FIGHTER,
    level: int = 5,
    hp_current: int | None = None,
):
    pc = char_svc.create_character(
        db,
        campaign_id=campaign_id,
        dm_email=dm,
        player_name="P",
        character_name=name,
        race="Human",
        character_class=character_class,
        level=level,
        score_str=14,
        score_dex=14,
        score_con=14,
        score_int=14,
        score_wis=14,
        score_cha=14,
        hp_max=20,
        hp_current=20 if hp_current is None else hp_current,
        ac=16,
        speed=30,
    )
    return pc


def _feature(
    db,
    *,
    name: str,
    character_class: CharacterClass,
    recovery: RecoveryType,
    uses_formula: UsesFormula = UsesFormula.FIXED_1,
):
    return ClassFeatureRepo.create(
        db,
        ClassFeatureCreate(
            name=name,
            character_class=character_class,
            level_acquired=1,
            recovery=recovery,
            uses_formula=uses_formula,
            description=name,
        ),
    )


# ── Per-PC rest ────────────────────────────────────────────────────────────


class TestShortRestPc:
    """Short-rest restores only `recovery=SHORT` features; HP untouched."""

    def test_restores_short_features_only(self, duckdb_session: Session):
        """Action Surge (short) restores; Indomitable (long) does not."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        short = _feature(
            duckdb_session,
            name="Action Surge",
            character_class=CharacterClass.FIGHTER,
            recovery=RecoveryType.SHORT,
        )
        long = _feature(
            duckdb_session,
            name="Indomitable",
            character_class=CharacterClass.FIGHTER,
            recovery=RecoveryType.LONG,
        )
        short_row = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=short.id), dm
        )
        long_row = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=long.id), dm
        )
        feat_svc.spend_use(duckdb_session, short_row.id, dm)
        feat_svc.spend_use(duckdb_session, long_row.id, dm)

        summary = rest_svc.short_rest_pc(duckdb_session, pc.id, dm)

        assert summary.rest_type == "short"
        assert "Action Surge" in summary.features_restored
        assert "Indomitable" not in summary.features_restored
        # Verify per-row state
        rows = feat_svc.list_for_character(duckdb_session, pc.id, dm)
        by_name = {r.feature_name: r for r in rows}
        assert by_name["Action Surge"].uses_spent == 0
        assert by_name["Indomitable"].uses_spent == 1  # untouched

    def test_short_rest_does_not_restore_hp(self, duckdb_session: Session):
        """HP is not part of a short rest in 2024 (hit dice spend is deferred)."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, hp_current=10)
        summary = rest_svc.short_rest_pc(duckdb_session, pc.id, dm)
        assert summary.hp_restored == 0
        # Re-read PC
        from db.repos.character_repo import CharacterRepo

        fresh = CharacterRepo.get_by_id(duckdb_session, pc.id)
        assert fresh is not None and fresh.hp_current == 10

    def test_short_rest_restores_warlock_slots(self, duckdb_session: Session):
        """Warlock pact magic slots come back on short rest."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, character_class=CharacterClass.WARLOCK, level=5)
        # Spend one pact slot
        sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)
        summary = rest_svc.short_rest_pc(duckdb_session, pc.id, dm)
        assert "3" in summary.slot_levels_restored
        state = sc_svc.slot_state(duckdb_session, pc.id, dm)
        assert state.levels["3"].used == 0

    def test_short_rest_does_not_restore_wizard_slots(self, duckdb_session: Session):
        """Non-Warlock spell slots stay spent on short rest."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, character_class=CharacterClass.WIZARD, level=5)
        sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)
        rest_svc.short_rest_pc(duckdb_session, pc.id, dm)
        state = sc_svc.slot_state(duckdb_session, pc.id, dm)
        assert state.levels["3"].used == 1  # not restored


class TestLongRestPc:
    """Long-rest restores everything: features (any recovery), slots, HP."""

    def test_restores_short_and_long_features(self, duckdb_session: Session):
        """Both recovery types reset."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)
        short = _feature(
            duckdb_session,
            name="Action Surge",
            character_class=CharacterClass.FIGHTER,
            recovery=RecoveryType.SHORT,
        )
        long = _feature(
            duckdb_session,
            name="Indomitable",
            character_class=CharacterClass.FIGHTER,
            recovery=RecoveryType.LONG,
        )
        s_row = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=short.id), dm
        )
        l_row = feat_svc.learn_feature(
            duckdb_session, pc.id, CharacterFeatureCreate(feature_id=long.id), dm
        )
        feat_svc.spend_use(duckdb_session, s_row.id, dm)
        feat_svc.spend_use(duckdb_session, l_row.id, dm)

        summary = rest_svc.long_rest_pc(duckdb_session, pc.id, dm)

        assert summary.rest_type == "long"
        assert set(summary.features_restored) == {"Action Surge", "Indomitable"}

    def test_restores_hp_to_max(self, duckdb_session: Session):
        """HP returns to hp_max; hp_restored reports the delta."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, hp_current=7)  # hp_max is 20
        summary = rest_svc.long_rest_pc(duckdb_session, pc.id, dm)
        assert summary.hp_restored == 13
        from db.repos.character_repo import CharacterRepo

        fresh = CharacterRepo.get_by_id(duckdb_session, pc.id)
        assert fresh is not None and fresh.hp_current == 20

    def test_restores_all_spell_slots(self, duckdb_session: Session):
        """Every slot level resets to max."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm, character_class=CharacterClass.WIZARD, level=5)
        sc_svc.expend_slot(duckdb_session, pc.id, 1, dm)
        sc_svc.expend_slot(duckdb_session, pc.id, 3, dm)
        rest_svc.long_rest_pc(duckdb_session, pc.id, dm)
        state = sc_svc.slot_state(duckdb_session, pc.id, dm)
        for lvl in state.levels.values():
            assert lvl.used == 0

    def test_idempotent_no_state_returns_zero_changes(self, duckdb_session: Session):
        """Long rest on an already-fresh PC reports nothing restored."""
        dm = _dm()
        c = _campaign(duckdb_session, dm)
        pc = _pc(duckdb_session, c.id, dm)  # full HP, no features spent
        summary = rest_svc.long_rest_pc(duckdb_session, pc.id, dm)
        assert summary.features_restored == []
        assert summary.slot_levels_restored == []
        assert summary.hp_restored == 0


# ── Party-wide rest (the DM's button) ──────────────────────────────────────


class TestPartyRest:
    """Party-wide rest endpoints iterate over `session.attending_pc_ids`."""

    def _session_with_party(self, db: Session, dm: str, pc_ids: list[uuid.UUID]):
        """Build a campaign → adventure → session with the given PCs attending."""
        import services.adventure_service as adv_svc
        import services.session_service as sess_svc
        from domain.enums import AdventureTier

        c = _campaign(db, dm)
        adv = adv_svc.create_adventure(
            db,
            campaign_id=c.id,
            title="A",
            tier=AdventureTier.TIER1,
            dm_email=dm,
        )
        gs = sess_svc.create_session(
            db,
            adventure_id=adv.id,
            session_number=1,
            title="S1",
            dm_email=dm,
            attending_pc_ids=pc_ids,
        )
        return c, gs

    def test_party_long_rest_applies_to_each(self, duckdb_session: Session):
        """Long rest hits every attending PC."""
        dm = _dm()
        # Build the party first
        c0 = _campaign(duckdb_session, dm)
        pc1 = _pc(duckdb_session, c0.id, dm, name="Alice", hp_current=5)
        pc2 = _pc(duckdb_session, c0.id, dm, name="Bob", hp_current=8)
        # Pretend the campaign IS the same as the session's by attaching the
        # session to the same campaign via a new adventure.
        # Easier path: create another campaign WITH the PCs already migrated
        # is messy — just spin a session whose adventure belongs to c0.
        import services.adventure_service as adv_svc
        import services.session_service as sess_svc
        from domain.enums import AdventureTier

        adv = adv_svc.create_adventure(
            duckdb_session,
            campaign_id=c0.id,
            title="A",
            tier=AdventureTier.TIER1,
            dm_email=dm,
        )
        gs = sess_svc.create_session(
            duckdb_session,
            adventure_id=adv.id,
            session_number=1,
            title="S1",
            dm_email=dm,
            attending_pc_ids=[pc1.id, pc2.id],
        )

        summaries = rest_svc.long_rest_party(duckdb_session, gs.id, dm)

        assert len(summaries) == 2
        names = {s.character_name for s in summaries}
        assert names == {"Alice", "Bob"}
        # Both PCs restored to max HP
        from db.repos.character_repo import CharacterRepo

        a = CharacterRepo.get_by_id(duckdb_session, pc1.id)
        b = CharacterRepo.get_by_id(duckdb_session, pc2.id)
        assert a is not None and a.hp_current == a.hp_max
        assert b is not None and b.hp_current == b.hp_max

    def test_party_rest_with_empty_roster(self, duckdb_session: Session):
        """Session with no attending PCs returns an empty summary list."""
        dm = _dm()
        import services.adventure_service as adv_svc
        import services.session_service as sess_svc
        from domain.enums import AdventureTier

        c = _campaign(duckdb_session, dm)
        adv = adv_svc.create_adventure(
            duckdb_session,
            campaign_id=c.id,
            title="A",
            tier=AdventureTier.TIER1,
            dm_email=dm,
        )
        gs = sess_svc.create_session(
            duckdb_session,
            adventure_id=adv.id,
            session_number=1,
            title="Empty",
            dm_email=dm,
            attending_pc_ids=[],
        )
        summaries = rest_svc.long_rest_party(duckdb_session, gs.id, dm)
        assert summaries == []

    def test_party_short_rest_returns_per_pc_summaries(self, duckdb_session: Session):
        """Each PC gets its own RestSummary."""
        dm = _dm()
        import services.adventure_service as adv_svc
        import services.session_service as sess_svc
        from domain.enums import AdventureTier

        c = _campaign(duckdb_session, dm)
        pc1 = _pc(duckdb_session, c.id, dm, name="One")
        pc2 = _pc(duckdb_session, c.id, dm, name="Two")
        adv = adv_svc.create_adventure(
            duckdb_session,
            campaign_id=c.id,
            title="A",
            tier=AdventureTier.TIER1,
            dm_email=dm,
        )
        gs = sess_svc.create_session(
            duckdb_session,
            adventure_id=adv.id,
            session_number=1,
            title="S1",
            dm_email=dm,
            attending_pc_ids=[pc1.id, pc2.id],
        )
        summaries = rest_svc.short_rest_party(duckdb_session, gs.id, dm)
        assert len(summaries) == 2
        assert all(s.rest_type == "short" for s in summaries)

    def test_non_owner_blocked(self, duckdb_session: Session):
        """Another DM cannot rest someone else's party."""
        dm1, dm2 = _dm(), _dm()
        import services.adventure_service as adv_svc
        import services.session_service as sess_svc
        from domain.enums import AdventureTier

        c = _campaign(duckdb_session, dm1)
        pc = _pc(duckdb_session, c.id, dm1)
        adv = adv_svc.create_adventure(
            duckdb_session,
            campaign_id=c.id,
            title="A",
            tier=AdventureTier.TIER1,
            dm_email=dm1,
        )
        gs = sess_svc.create_session(
            duckdb_session,
            adventure_id=adv.id,
            session_number=1,
            title="S1",
            dm_email=dm1,
            attending_pc_ids=[pc.id],
        )
        with pytest.raises(PermissionError):
            rest_svc.long_rest_party(duckdb_session, gs.id, dm2)
