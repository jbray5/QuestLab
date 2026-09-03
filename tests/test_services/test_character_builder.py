"""Character builder (Plan 74): options, validation, derived sheet, spells, kit, toggle."""

import uuid

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
from db.repos.campaign_repo import CampaignRepo
from db.repos.spell_repo import SpellRepo
from domain.character_builder import CharacterBuild
from domain.spell import SpellCreate
from services import character_builder_service as builder
from services import character_service, spellcasting_service


def _cleanup(db, pc_id: str, dm: str) -> None:
    character_service.delete_character(db, uuid.UUID(pc_id), dm)


def _campaign(db):
    dm = f"dm_{uuid.uuid4().hex[:6]}@example.com"
    return camp_svc.create_campaign(db, name="Open Table", setting="R", tone="T", dm_email=dm)


def _build(**over) -> CharacterBuild:
    base = dict(
        character_name="Bram Oakhelm",
        player_name="Justin",
        species="Dwarf",
        character_class="Fighter",
        background="Soldier",
        level=1,
        scores={"STR": 15, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10},
        score_method="standard",
        background_bonus={"STR": 2, "CON": 1},
        skills=["Athletics", "Perception"],
        kit="Chain mail, longsword & shield",
    )
    base.update(over)
    return CharacterBuild(**base)


class TestOptions:
    def test_options_carry_the_srd(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        o = builder.options(duckdb_session, c.id)
        assert [s["name"] for s in o.species][:3] == ["Dragonborn", "Dwarf", "Elf"]
        assert set(o.classes) == {
            "Barbarian",
            "Bard",
            "Cleric",
            "Druid",
            "Fighter",
            "Monk",
            "Paladin",
            "Ranger",
            "Rogue",
            "Sorcerer",
            "Warlock",
            "Wizard",
        }
        assert o.classes["Wizard"]["srd_subclasses"] == ["Evoker"]
        assert o.point_buy_budget == 27 and 15 in o.standard_array


class TestCreate:
    def test_fighter_sheet_is_derived(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        res = builder.create(duckdb_session, c.id, _build())
        pc = character_service.get_character(duckdb_session, uuid.UUID(res.pc_id), c.dm_email)
        assert pc.race == "Dwarf" and pc.background == "Soldier" and pc.level == 1
        assert pc.score_str == 17 and pc.score_con == 15  # +2 / +1 background bonus
        # d10 + CON(+2) + Dwarven Toughness(+1)
        assert res.hp_max == 13 and pc.hp_max == 13
        # Chain mail 16 + shield 2 (no dex)
        assert res.ac == 18
        assert set(pc.saving_throw_proficiencies) == {"STR", "CON"}
        assert set(pc.skill_proficiencies) == {"Athletics", "Perception", "Intimidation"}
        assert pc.speed == 30
        _cleanup(duckdb_session, res.pc_id, c.dm_email)

    def test_standard_array_enforced(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError):
            builder.create(
                duckdb_session,
                c.id,
                _build(scores={"STR": 18, "DEX": 18, "CON": 18, "INT": 18, "WIS": 18, "CHA": 18}),
            )

    def test_point_buy_budget_enforced(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError):
            builder.create(
                duckdb_session,
                c.id,
                _build(
                    score_method="pointbuy",
                    scores={"STR": 15, "DEX": 15, "CON": 15, "INT": 15, "WIS": 8, "CHA": 8},
                ),
            )

    def test_skill_list_and_count_enforced(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError):
            builder.create(duckdb_session, c.id, _build(skills=["Arcana"]))  # not a Fighter skill
        with pytest.raises(
            ValueError
        ):  # three class picks; Fighter gets two (Athletics is Soldier's)
            builder.create(
                duckdb_session, c.id, _build(skills=["Perception", "Survival", "Insight"])
            )

    def test_wizard_learns_only_wizard_spells_within_caps(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        for name, lvl, classes in (
            ("Fire Bolt", 0, ["Sorcerer", "Wizard"]),
            ("Mage Hand", 0, ["Wizard"]),
            ("Light", 0, ["Cleric"]),
            ("Magic Missile", 1, ["Wizard"]),
            ("Fireball", 3, ["Wizard"]),
        ):
            SpellRepo.create(
                duckdb_session,
                SpellCreate(
                    name=name,
                    level=lvl,
                    school="Evocation",
                    classes=classes,
                    casting_time="1 action",
                    range="60 ft",
                    duration="Instant",
                    description="x",
                ),
            )
        res = builder.create(
            duckdb_session,
            c.id,
            _build(
                character_class="Wizard",
                species="Human",
                background="Sage",
                kit="Quarterstaff & dagger",
                scores={"INT": 15, "DEX": 14, "CON": 13, "WIS": 12, "STR": 10, "CHA": 8},
                background_bonus={"INT": 2, "CON": 1},
                skills=["Arcana", "Investigation"],
                cantrips=["Fire Bolt", "Mage Hand", "Light"],
                spells=["Magic Missile", "Fireball"],
            ),
        )
        known = spellcasting_service.list_known_for_character(
            duckdb_session, uuid.UUID(res.pc_id), c.dm_email
        )
        names = sorted(SpellRepo.get_by_id(duckdb_session, k.spell_id).name for k in known)
        assert names == ["Fire Bolt", "Mage Hand", "Magic Missile"]
        assert any("Light" in w for w in res.warnings) and any(
            "Fireball" in w for w in res.warnings
        )
        assert res.ac == 12  # unarmored 10 + DEX 2
        _cleanup(duckdb_session, res.pc_id, c.dm_email)

    def test_signup_toggle_blocks(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        row = CampaignRepo.get_by_id(duckdb_session, c.id)
        row.allow_player_signup = False
        duckdb_session.add(row)
        duckdb_session.commit()
        with pytest.raises(PermissionError):
            builder.options(duckdb_session, c.id)
        with pytest.raises(PermissionError):
            builder.create(duckdb_session, c.id, _build())
