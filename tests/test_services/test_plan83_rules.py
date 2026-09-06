"""Plan 83 — rules-depth fixes the field test's rules lawyer flagged."""

import uuid
from types import SimpleNamespace

import pytest
from sqlmodel import Session

from domain.enums import UsesFormula
from services import character_builder_service as builder
from services import feature_service, rest_service
from tests.test_services.test_character_builder import _build, _campaign, _cleanup


class TestChannelDivinity:
    """2024 Cleric: two uses, three at 6, four at 18 — not proficiency bonus."""

    @pytest.mark.parametrize("level,uses", [(2, 2), (5, 2), (6, 3), (17, 3), (18, 4)])
    def test_uses_by_level(self, level, uses):
        pc = SimpleNamespace(level=level)
        assert feature_service.resolve_max_uses(UsesFormula.CHANNEL_DIVINITY, pc) == uses


class TestSpeciesSkills:
    """One species pick may sit off the class list; Keen Senses is three skills only."""

    def test_human_may_take_one_off_list_skill(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        out = builder.create(
            duckdb_session,
            c.id,
            _build(species="Human", skills=["Athletics", "Perception", "Insight", "Arcana"]),
        )
        assert out.pc_id
        _cleanup(duckdb_session, out.pc_id, c.dm_email)

    def test_human_cannot_take_two_off_list_skills(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="isn't on the Fighter skill list"):
            builder.create(
                duckdb_session,
                c.id,
                _build(species="Human", skills=["Athletics", "Perception", "Arcana", "Nature"]),
            )

    def test_elf_extra_skill_must_be_keen_senses(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="Insight, Perception, Survival"):
            builder.create(
                duckdb_session,
                c.id,
                _build(species="Elf", skills=["Athletics", "Perception", "Insight", "Arcana"]),
            )
        out = builder.create(
            duckdb_session,
            c.id,
            _build(species="Elf", skills=["Athletics", "Perception", "Insight", "Survival"]),
        )
        assert out.pc_id
        _cleanup(duckdb_session, out.pc_id, c.dm_email)

    def test_kit_armor_is_in_the_catalog(self, duckdb_session: Session):
        from db.repos.item_repo import ItemRepo
        from integrations.dnd_rules.srd_armor_2024 import SRD_ARMOR_2024
        from services import item_service

        item_service.seed_armor(duckdb_session, SRD_ARMOR_2024)
        assert item_service.seed_armor(duckdb_session, SRD_ARMOR_2024) == 0
        names = {i.name for i in ItemRepo.list_all(duckdb_session)}
        assert {"Chain Mail", "Chain Shirt", "Shield"} <= names


class TestLongRestResidue:
    """Temp HP, death saves and concentration are gone after a long rest."""

    def test_residue_cleared(self, duckdb_session: Session):
        from db.repos.character_repo import CharacterRepo

        c = _campaign(duckdb_session)
        out = builder.create(duckdb_session, c.id, _build())
        pc_id = uuid.UUID(str(out.pc_id))
        pc = CharacterRepo.get_by_id(duckdb_session, pc_id)
        pc.temp_hp = 5
        pc.death_save_failures = 2
        pc.concentration_on = "Bless"
        duckdb_session.add(pc)
        duckdb_session.commit()
        rest_service.long_rest_pc(duckdb_session, pc_id, c.dm_email)
        duckdb_session.expire_all()
        after = CharacterRepo.get_by_id(duckdb_session, pc_id)
        assert after.temp_hp == 0 and after.death_save_failures == 0
        assert after.concentration_on is None
        _cleanup(duckdb_session, str(pc_id), c.dm_email)


class TestLevelPatchSyncsFeatures:
    """A PATCHed level grants the class features the PC now qualifies for."""

    def test_level_two_cleric_gets_channel_divinity(self, duckdb_session: Session):
        # The shared engine may already hold a partial catalog from another test
        # module (seed_catalog then only syncs formulas), so plant the one row
        # this test is about if it's missing.
        from db.repos.class_feature_repo import ClassFeatureRepo
        from domain.character import PlayerCharacterUpdate
        from domain.enums import CharacterClass
        from integrations.dnd_rules.class_features_2024 import CLASS_FEATURES_2024
        from services import character_service

        feature_service.seed_catalog(duckdb_session, CLASS_FEATURES_2024)
        cd_payload = next(
            f
            for f in CLASS_FEATURES_2024
            if f.name == "Channel Divinity" and f.character_class == CharacterClass.CLERIC
        )
        if (
            ClassFeatureRepo.find_by_name_class(
                duckdb_session, "Channel Divinity", CharacterClass.CLERIC
            )
            is None
        ):
            ClassFeatureRepo.create(duckdb_session, cd_payload)
        c = _campaign(duckdb_session)
        pc = character_service.create_character(
            duckdb_session,
            campaign_id=c.id,
            dm_email=c.dm_email,
            player_name="P",
            character_name="Sister Ode",
            race="Human",
            character_class=CharacterClass.CLERIC,
            level=1,
            score_str=10,
            score_dex=10,
            score_con=14,
            score_int=10,
            score_wis=16,
            score_cha=12,
            hp_max=10,
            hp_current=10,
            ac=16,
            speed=30,
        )
        before = {
            f.feature_name
            for f in feature_service.list_for_character(duckdb_session, pc.id, c.dm_email)
        }
        assert "Channel Divinity" not in before
        character_service.update_character(
            duckdb_session, pc.id, c.dm_email, PlayerCharacterUpdate(level=2)
        )
        after = {
            f.feature_name
            for f in feature_service.list_for_character(duckdb_session, pc.id, c.dm_email)
        }
        assert "Channel Divinity" in after
        cd = next(
            f
            for f in feature_service.list_for_character(duckdb_session, pc.id, c.dm_email)
            if f.feature_name == "Channel Divinity"
        )
        assert cd.max_uses == 2
        _cleanup(duckdb_session, str(pc.id), c.dm_email)
