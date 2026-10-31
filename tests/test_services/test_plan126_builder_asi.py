"""Plan 126 — the creator's Ability Score Improvement / feat step, validated on the server.

A build at level 4 or higher makes one pick per improvement level it has passed (the Fighter
and Rogue get extra ones), each checked against the build as it stands at that level, and the
result lands on the scores BEFORE hit points, Armor Class, saves and skills are worked out.
"""

import uuid

import pytest
from sqlmodel import Session, delete

import services.campaign_service as camp_svc
from db.repos.character_repo import CharacterRepo
from db.repos.spell_repo import SpellRepo
from domain.character import CharacterSpell
from domain.spell import SpellCreate
from integrations.dnd_rules import levelup_2024 as rules
from integrations.dnd_rules import srd_character_options_2024 as srd
from services import character_builder_service as builder
from services import character_service, spellcasting_service
from tests.test_services.test_character_builder import _build

ASI = "Ability Score Improvement"


@pytest.fixture(autouse=True)
def _clean(duckdb_session: Session):
    """Drop the spell rows these tests teach, so later suites can wipe the spells table."""
    yield
    duckdb_session.rollback()
    duckdb_session.exec(delete(CharacterSpell))
    duckdb_session.commit()


def _campaign(db):
    dm = f"dm126_{uuid.uuid4().hex[:6]}@example.com"
    return camp_svc.create_campaign(db, name="Ladder", setting="R", tone="T", dm_email=dm)


def _spell(db, name: str, level: int, school: str, classes: list[str]) -> None:
    if SpellRepo.get_by_name(db, name) is None:
        SpellRepo.create(
            db,
            SpellCreate(
                name=name,
                level=level,
                school=school,
                classes=classes,
                casting_time="1 action",
                range="30 ft",
                duration="Instant",
                description="x",
            ),
        )


def _pc(db, campaign, res):
    return character_service.get_character(db, uuid.UUID(res.pc_id), campaign.dm_email)


def _asi(level: int, **asi: int) -> dict:
    return {"level": level, "name": ASI, "asi": asi}


class TestImprovementCount:
    def test_level_4_build_must_include_one_improvement(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match=r"1 Ability Score Improvement \(level 4\)"):
            builder.create(duckdb_session, c.id, _build(level=4))
        res = builder.create(duckdb_session, c.id, _build(level=4, asi=[_asi(4, STR=2)]))
        pc = _pc(duckdb_session, c, res)
        assert pc.score_str == 19  # 15 + 2 (Soldier) + 2 (level 4)
        assert "Level 4: Ability Score Improvement (+2 STR)" in (pc.notes or "")

    def test_fighter_level_6_has_two_improvements(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        assert sorted(lv for lv in rules.asi_levels("Fighter") if lv <= 6) == [4, 6]
        with pytest.raises(ValueError, match=r"2 Ability Score Improvements \(levels 4 and 6\)"):
            builder.create(duckdb_session, c.id, _build(level=6, asi=[_asi(4, STR=2)]))
        res = builder.create(
            duckdb_session,
            c.id,
            _build(level=6, asi=[_asi(4, STR=2), {"level": 6, "name": "Tough"}]),
        )
        pc = _pc(duckdb_session, c, res)
        assert pc.score_str == 19
        assert pc.feats == ["Savage Attacker", "Tough"]
        # d10+2, five levels of 6+2, Dwarven Toughness 1 and Tough 2 at every level.
        assert pc.hp_max == 12 + 5 * 8 + 6 * 3 == res.hp_max

    def test_rogue_and_wrong_levels(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        assert sorted(lv for lv in rules.asi_levels("Rogue") if lv <= 10) == [4, 8, 10]
        with pytest.raises(ValueError, match="levels 4 and 6"):
            builder.create(
                duckdb_session, c.id, _build(level=6, asi=[_asi(4, STR=2), _asi(5, CON=2)])
            )
        with pytest.raises(ValueError, match="first comes at level 4"):
            builder.create(duckdb_session, c.id, _build(level=3, asi=[_asi(3, STR=2)]))

    def test_shape_of_the_increase(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match=r"\+2 to one score or \+1 to two"):
            builder.create(duckdb_session, c.id, _build(level=4, asi=[_asi(4, STR=1)]))
        res = builder.create(duckdb_session, c.id, _build(level=4, asi=[_asi(4, STR=1, DEX=1)]))
        pc = _pc(duckdb_session, c, res)
        assert (pc.score_str, pc.score_dex) == (18, 14)


class TestTheRules:
    def test_a_plus_two_past_20_is_refused(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        rolled = {"STR": 18, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10}
        with pytest.raises(ValueError, match="20 is the most"):
            builder.create(
                duckdb_session,
                c.id,
                _build(level=4, score_method="manual", scores=rolled, asi=[_asi(4, STR=2)]),
            )
        # +1 to two still fits: STR 19 → 20.
        rolled["STR"] = 17
        res = builder.create(
            duckdb_session,
            c.id,
            _build(level=4, score_method="manual", scores=rolled, asi=[_asi(4, STR=1, CON=1)]),
        )
        assert _pc(duckdb_session, c, res).score_str == 20

    def test_a_feat_without_its_prerequisite_is_refused(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="Level 4: War Caster: Needs the Spellcasting"):
            builder.create(
                duckdb_session,
                c.id,
                _build(level=4, asi=[{"level": 4, "name": "War Caster", "asi": {"WIS": 1}}]),
            )
        # A Wizard (no armor training) can't take Heavy Armor Master, nor GWM with STR 10.
        wiz = dict(
            character_class="Wizard",
            species="Elf",
            background="Sage",
            kit="Quarterstaff & dagger",
            scores={"INT": 15, "DEX": 14, "CON": 13, "WIS": 12, "STR": 10, "CHA": 8},
            background_bonus={"INT": 2, "CON": 1},
            skills=["Arcana", "Investigation", "Perception"],
            level=4,
        )
        with pytest.raises(ValueError, match="Needs heavy armor training"):
            builder.create(
                duckdb_session,
                c.id,
                _build(**wiz, asi=[{"level": 4, "name": "Heavy Armor Master", "asi": {"STR": 1}}]),
            )
        with pytest.raises(ValueError, match="Needs STR 13"):
            builder.create(
                duckdb_session,
                c.id,
                _build(**wiz, asi=[{"level": 4, "name": "Great Weapon Master", "asi": {"STR": 1}}]),
            )
        with pytest.raises(ValueError, match="Unknown feat"):
            builder.create(
                duckdb_session, c.id, _build(level=4, asi=[{"level": 4, "name": "Made Up"}])
            )

    def test_prerequisites_see_the_build_so_far(self, duckdb_session: Session):
        """STR 12 can't take Great Weapon Master at 4, but can after a level-4 +1 STR."""
        c = _campaign(duckdb_session)
        base = dict(
            level=6,
            scores={"STR": 12, "DEX": 15, "CON": 14, "INT": 8, "WIS": 13, "CHA": 10},
            background_bonus={"DEX": 2, "CON": 1},
        )
        gwm = {"name": "Great Weapon Master", "asi": {"STR": 1}}
        with pytest.raises(ValueError, match="Level 4: Great Weapon Master: Needs STR 13"):
            builder.create(
                duckdb_session, c.id, _build(**base, asi=[{"level": 4, **gwm}, _asi(6, DEX=2)])
            )
        res = builder.create(
            duckdb_session, c.id, _build(**base, asi=[_asi(4, STR=1, CON=1), {"level": 6, **gwm}])
        )
        pc = _pc(duckdb_session, c, res)
        assert pc.score_str == 14 and "Great Weapon Master" in pc.feats
        # A feat can't be taken twice (Savage Attacker comes with the Soldier background).
        with pytest.raises(ValueError, match="Already taken"):
            builder.create(
                duckdb_session,
                c.id,
                _build(**base, asi=[{"level": 4, "name": "Savage Attacker"}, _asi(6, DEX=2)]),
            )

    def test_con_from_an_improvement_raises_hp_at_every_level(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        strong = builder.create(duckdb_session, c.id, _build(level=4, asi=[_asi(4, STR=2)]))
        tough = builder.create(duckdb_session, c.id, _build(level=4, asi=[_asi(4, CON=2)]))
        # CON 15 (+2): 10+2 + 3 × (6+2) + Dwarf 4 = 40. CON 17 (+3): 13 + 3 × 9 + 4 = 44.
        assert strong.hp_max == 40
        assert tough.hp_max == 44
        assert _pc(duckdb_session, c, tough).score_con == 17

    def test_dex_from_an_improvement_feeds_ac_and_skills(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        res = builder.create(
            duckdb_session,
            c.id,
            _build(
                level=4,
                kit="Studded leather, scimitar & shortsword, longbow",
                skills=["Acrobatics", "Perception"],
                asi=[_asi(4, DEX=2)],
            ),
        )
        pc = _pc(duckdb_session, c, res)
        assert pc.score_dex == 15 and res.ac == 12 + 2  # studded leather + DEX 15 (+2)
        bonuses = character_service.compute_skill_bonuses(
            CharacterRepo.get_by_id(duckdb_session, uuid.UUID(res.pc_id))
        )
        assert bonuses["Acrobatics"] == 2 + 2  # DEX +2, proficiency +2 at level 4


class TestFeatsLandOnTheSheet:
    def test_resilient_skilled_and_feat_spells(self, duckdb_session: Session):
        _spell(duckdb_session, "Misty Step", 2, "Conjuration", ["Sorcerer", "Warlock", "Wizard"])
        _spell(duckdb_session, "P126 Charm Thing", 1, "Enchantment", ["Bard"])
        c = _campaign(duckdb_session)
        res = builder.create(
            duckdb_session,
            c.id,
            _build(
                level=8,
                asi=[
                    {"level": 4, "name": "Resilient", "asi": {"WIS": 1}},
                    {
                        "level": 6,
                        "name": "Skilled",
                        "skills": ["Stealth", "History", "Arcana"],
                    },
                    {
                        "level": 8,
                        "name": "Fey Touched",
                        "asi": {"WIS": 1},
                        "spells": ["P126 Charm Thing"],
                    },
                ],
            ),
        )
        pc = _pc(duckdb_session, c, res)
        assert set(pc.saving_throw_proficiencies) == {"STR", "CON", "WIS"}
        assert pc.score_wis == 14
        assert {"Stealth", "History", "Arcana"} <= set(pc.skill_proficiencies)
        assert pc.feats == ["Savage Attacker", "Resilient", "Skilled", "Fey Touched"]
        known = spellcasting_service.list_known_for_character(
            duckdb_session, uuid.UUID(res.pc_id), c.dm_email
        )
        names = {SpellRepo.get_by_id(duckdb_session, k.spell_id).name for k in known}
        assert names == {"Misty Step", "P126 Charm Thing"}

    def test_a_feat_spell_cant_double_a_class_pick(self, duckdb_session: Session):
        _spell(duckdb_session, "P126 Spark", 0, "Evocation", ["Wizard", "Sorcerer"])
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="picked twice"):
            builder.create(
                duckdb_session,
                c.id,
                _build(
                    character_class="Wizard",
                    species="Human",
                    background="Criminal",  # Sage would already give Magic Initiate (Wizard)
                    kit="Quarterstaff & dagger",
                    scores={"INT": 15, "DEX": 14, "CON": 13, "WIS": 12, "STR": 10, "CHA": 8},
                    background_bonus={"INT": 2, "CON": 1},
                    skills=["Arcana", "Investigation", "Insight"],
                    level=4,
                    cantrips=["P126 Spark"],
                    asi=[
                        {
                            "level": 4,
                            "name": "Magic Initiate",
                            "choice": "Wizard",
                            "spells": ["P126 Spark"],
                        }
                    ],
                ),
            )

    def test_a_book_feat_is_recorded_by_name(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        res = builder.create(
            duckdb_session,
            c.id,
            _build(
                level=4,
                asi=[{"level": 4, "name": "Boon of Thunder", "from_book": True, "asi": {"CON": 1}}],
            ),
        )
        pc = _pc(duckdb_session, c, res)
        assert "Boon of Thunder" in pc.feats and pc.score_con == 16
        assert any("from your book" in w for w in res.warnings)


class TestRulesData:
    def test_half_casters_reach_each_spell_level_on_time(self):
        assert [srd.max_spell_level("Paladin", lv) for lv in (1, 2, 4, 5, 9, 13, 17, 20)] == [
            1,
            1,
            1,
            2,
            3,
            4,
            5,
            5,
        ]
        assert srd.max_spell_level("Wizard", 5) == 3 and srd.max_spell_level("Warlock", 9) == 5

    def test_every_srd_subclass_has_its_features(self):
        for name, cls in srd.CLASSES.items():
            for sub in cls["srd_subclasses"]:
                table = rules.SUBCLASS_LEVEL_FEATURES[sub]
                assert min(table) == cls["subclass_level"], sub
                # Later subclass features land on the class table's "Subclass feature" levels.
                marks = {
                    lv
                    for lv, names in rules.CLASS_LEVEL_FEATURES[name].items()
                    if any(n == "Subclass feature" for n in names)
                }
                assert set(table) - {cls["subclass_level"]} == marks, sub

    def test_options_carry_the_improvement_data(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        o = builder.options(duckdb_session, c.id)
        assert o.asi_levels["Fighter"] == [4, 6, 8, 12, 14, 16, 19]
        assert any(f["name"] == "Great Weapon Master" for f in o.feats)
        assert o.subclass_features["Champion"][3] == ["Improved Critical", "Remarkable Athlete"]
        assert o.spell_slots["Wizard"][0] == {"1": 2}
        assert o.feature_notes["Monk: Unarmored Defense"]
