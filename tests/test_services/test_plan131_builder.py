"""Plan 131 — the character builder in a 2014 campaign (SRD 5.1).

A campaign set to the 2014 rules builds with the 2014 tables: ability bonuses from the race
(the Half-Elf chooses two +1s), subraces, no background bonus and no Origin feats, subclasses at
the 2014 levels, known casters learning their table's count, prepared casters preparing ability
modifier + level, the Wizard's spellbook, the Paladin's first spells at level 2, the Dragonborn's
ancestry, the High Elf's Wizard cantrip and the Warlock's Pact Boon. A 2024 campaign is unchanged.
"""

import uuid

import pytest
from sqlmodel import Session, delete, select

import services.campaign_service as camp_svc
from db.repos.spell_repo import SpellRepo
from domain.character import CharacterSpell
from domain.character_builder import CharacterBuild
from domain.spell import Spell, SpellCreate
from services import character_builder_service as builder
from services import character_service, spellcasting_service

STANDARD = {"STR": 8, "DEX": 13, "CON": 14, "INT": 10, "WIS": 12, "CHA": 15}


@pytest.fixture(autouse=True)
def _clean(duckdb_session: Session):
    """Drop the spell rows these tests teach, so later suites can wipe the spells table."""
    yield
    duckdb_session.rollback()
    duckdb_session.exec(delete(CharacterSpell))
    duckdb_session.commit()


def _campaign(db, ruleset: str = "2014"):
    dm = f"dm131b_{uuid.uuid4().hex[:6]}@example.com"
    return camp_svc.create_campaign(
        db, name="Old School", setting="R", tone="T", dm_email=dm, ruleset=ruleset
    )


def _spell(db, name: str, level: int, classes: list[str], ruleset: str = "2014", **extra) -> str:
    """A catalog spell in one edition (created once per test session)."""
    found = db.exec(select(Spell).where(Spell.name == name, Spell.ruleset == ruleset)).first()
    if found is None:
        SpellRepo.create(
            db,
            SpellCreate(
                name=name,
                level=level,
                school="Evocation",
                classes=classes,
                casting_time="1 action",
                range="60 feet",
                duration="Instantaneous",
                description=f"{name} does a thing. It does it well.",
                ruleset=ruleset,
                **extra,
            ),
        )
    return name


def _spells(db, prefix: str, cls: str, level: int, n: int) -> list[str]:
    return [_spell(db, f"P131 {prefix} {i}", level, [cls]) for i in range(n)]


def _build(**over) -> CharacterBuild:
    base = dict(
        character_name="Wren",
        player_name="Justin",
        species="Human",
        character_class="Fighter",
        background="Acolyte",
        level=1,
        scores=dict(STANDARD),
        score_method="standard",
        background_bonus={},
        skills=["Athletics", "Perception"],
        class_choices=[],
    )
    base.update(over)
    return CharacterBuild(**base)


def _choices(**picks) -> list[dict]:
    return [{"key": k, "picks": v} for k, v in picks.items()]


def _pc(db, campaign, res):
    return character_service.get_character(db, uuid.UUID(res.pc_id), campaign.dm_email)


def _sheet_spells(db, campaign, res) -> dict[str, bool]:
    """Spell name → prepared, for the new PC."""
    rows = spellcasting_service.list_known_for_character(
        db, uuid.UUID(res.pc_id), campaign.dm_email
    )
    return {SpellRepo.get_by_id(db, r.spell_id).name: bool(r.prepared) for r in rows}


class TestRaces:
    def test_half_elf_bard_1(self, duckdb_session: Session):
        """+2 CHA and two chosen +1s, 2 extra skills, 2 cantrips and 4 known spells, no feat."""
        db = duckdb_session
        cantrips = _spells(db, "Bard tune", "Bard", 0, 3)
        spells = _spells(db, "Bard verse", "Bard", 1, 5)
        c = _campaign(db)
        build = _build(
            species="Half-Elf",
            character_class="Bard",
            scores={"STR": 8, "DEX": 14, "CON": 13, "INT": 10, "WIS": 12, "CHA": 15},
            ability_choice={"DEX": 1, "CON": 1},
            skills=["Performance", "Persuasion", "Deception", "Stealth", "Perception"],
            kit="Leather, rapier, dagger, lute",
            cantrips=cantrips[:2],
            spells=spells[:4],
        )
        res = builder.create(db, c.id, build)
        pc = _pc(db, c, res)
        assert pc.ruleset == "2014" and pc.race == "Half-Elf"
        assert (pc.score_cha, pc.score_dex, pc.score_con) == (17, 15, 14)
        assert set(pc.skill_proficiencies) == {
            "Performance",
            "Persuasion",
            "Deception",
            "Stealth",
            "Perception",
            "Insight",
            "Religion",
        }
        assert not pc.feats  # no Origin feat in 2014
        assert set(_sheet_spells(db, c, res)) == set(cantrips[:2] + spells[:4])
        assert pc.spell_slots == {"1": 2}
        assert "SRD 5.1" in pc.notes
        assert "Background Acolyte: skills Insight and Religion" in pc.notes
        assert "Origin feat" not in pc.notes and "None" not in pc.notes
        # Bard 1: d8 + CON(+2) = 10; leather 11 + DEX(+2) = 13.
        assert res.hp_max == 10 and res.ac == 13

    def test_half_elf_must_pick_two_plus_ones_not_charisma(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        base = dict(
            species="Half-Elf",
            skills=["Athletics", "Perception", "Stealth", "Arcana"],
            class_choices=_choices(fighting_style=["Defense"]),
        )
        for bad in ({}, {"DEX": 1}, {"DEX": 1, "CHA": 1}, {"DEX": 2}):
            with pytest.raises(
                ValueError, match="2 different abilities for \\+1 each, not Charisma"
            ):
                builder.create(duckdb_session, c.id, _build(ability_choice=bad, **base))
        res = builder.create(
            duckdb_session, c.id, _build(ability_choice={"STR": 1, "CON": 1}, **base)
        )
        pc = _pc(duckdb_session, c, res)
        assert (pc.score_str, pc.score_con, pc.score_cha) == (9, 15, 17)

    def test_hill_dwarf_fighter_4_with_an_asi(self, duckdb_session: Session):
        """Race stored as "Hill Dwarf"; Dwarven Toughness adds 1 HP a level; the ASI applies."""
        c = _campaign(duckdb_session)
        build = _build(
            species="Dwarf",
            subrace="hill dwarf",
            level=4,
            subclass="Champion",
            scores={"STR": 15, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10},
            kit="Chain mail, longsword & shield, light crossbow",
            class_choices=_choices(fighting_style=["Defense"]),
            asi=[{"level": 4, "name": "Ability Score Improvement", "asi": {"STR": 2}}],
        )
        res = builder.create(duckdb_session, c.id, build)
        pc = _pc(duckdb_session, c, res)
        assert pc.race == "Hill Dwarf"
        # CON 14 + 2 (Dwarf) = 16, WIS 12 + 1 (Hill Dwarf), STR 15 + 2 (ASI).
        assert (pc.score_con, pc.score_wis, pc.score_str) == (16, 13, 17)
        # d10: 10 + 3, then 3 × (6 + 3), then +1 × 4 levels (Dwarven Toughness) = 44.
        assert res.hp_max == 44
        assert res.ac == 19  # chain mail 16 + shield 2 + Defense 1
        assert "Hill Dwarf traits: Dwarven Toughness" in pc.notes

    def test_a_missing_subrace_is_refused(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="Pick a subrace: in the free rules a Dwarf is a Hill"):
            builder.create(duckdb_session, c.id, _build(species="Dwarf"))
        with pytest.raises(ValueError, match="an Elf is a High Elf"):
            builder.create(duckdb_session, c.id, _build(species="Elf"))
        with pytest.raises(ValueError, match="A Human has no subrace"):
            builder.create(duckdb_session, c.id, _build(subrace="Variant"))

    def test_a_book_subrace_is_recorded_with_its_bonus(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        res = builder.create(
            duckdb_session,
            c.id,
            _build(
                species="Dwarf",
                subrace="Mountain Dwarf",
                ability_choice={"STR": 2},
                class_choices=_choices(fighting_style=["Defense"]),
            ),
        )
        pc = _pc(duckdb_session, c, res)
        assert pc.race == "Mountain Dwarf"
        assert (pc.score_str, pc.score_con) == (10, 16)
        assert any("isn't in the SRD" in w for w in res.warnings)
        with pytest.raises(ValueError, match="subrace from your book gives"):
            builder.create(
                duckdb_session,
                c.id,
                _build(
                    species="Dwarf", subrace="Mountain Dwarf", ability_choice={"STR": 2, "WIS": 1}
                ),
            )

    def test_dragonborn_sorcerer_1(self, duckdb_session: Session):
        """Ancestry recorded, Draconic Resilience: AC 13 + DEX and +1 HP a level."""
        db = duckdb_session
        cantrips = _spells(db, "Sorc spark", "Sorcerer", 0, 4)
        spells = _spells(db, "Sorc surge", "Sorcerer", 1, 3)
        c = _campaign(db)
        base = dict(
            species="Dragonborn",
            character_class="Sorcerer",
            subclass="Draconic Bloodline",
            skills=["Arcana", "Persuasion"],
            kit="Light crossbow & daggers",
            cantrips=cantrips,
            spells=spells[:2],
            class_choices=_choices(dragon_ancestor=["Red"]),
        )
        with pytest.raises(ValueError, match="A Dragonborn chooses a Draconic Ancestry"):
            builder.create(db, c.id, _build(**base))
        with pytest.raises(ValueError, match="Draconic Ancestry: Plaid isn't one of the choices"):
            builder.create(
                db,
                c.id,
                _build(
                    species_choices=[{"key": "dragonborn_ancestry", "picks": ["Plaid"]}], **base
                ),
            )
        res = builder.create(
            db,
            c.id,
            _build(species_choices=[{"key": "dragonborn_ancestry", "picks": ["red"]}], **base),
        )
        pc = _pc(db, c, res)
        assert "Draconic Ancestry: Red" in pc.feats and "Dragon Ancestor: Red" in pc.feats
        assert (pc.score_str, pc.score_cha) == (10, 16)
        assert res.ac == 14  # 13 + DEX(+1), no armor
        assert res.hp_max == 6 + 2 + 1  # d6 + CON(+2) + Draconic Resilience
        assert "Race choices: Draconic Ancestry: Red." in pc.notes

    def test_high_elf_wizard_1_gets_an_extra_wizard_cantrip(self, duckdb_session: Session):
        db = duckdb_session
        cantrips = _spells(db, "Wiz spark", "Wizard", 0, 5)
        book = _spells(db, "Wiz page", "Wizard", 1, 7)
        c = _campaign(db)
        base = dict(
            species="Elf",
            subrace="High Elf",
            character_class="Wizard",
            scores={"STR": 8, "DEX": 13, "CON": 14, "INT": 15, "WIS": 12, "CHA": 10},
            skills=["Arcana", "Investigation"],
            kit="Quarterstaff & spellbook",
            spells=book[:6],
            prepared_spells=book[:4],
        )
        with pytest.raises(ValueError, match="pick 1 more cantrip. A level 1 Wizard has 4"):
            builder.create(db, c.id, _build(cantrips=cantrips[:3], **base))
        res = builder.create(db, c.id, _build(cantrips=cantrips[:4], **base))
        pc = _pc(db, c, res)
        assert pc.race == "High Elf" and pc.score_int == 16 and pc.score_dex == 15
        assert "Perception" in pc.skill_proficiencies  # Keen Senses
        known = _sheet_spells(db, c, res)
        assert set(cantrips[:4]) <= set(known)

    def test_a_high_elf_bards_extra_cantrip_comes_from_the_wizard_list(
        self, duckdb_session: Session
    ):
        db = duckdb_session
        bard = _spells(db, "Bard tune", "Bard", 0, 3)
        wiz = _spells(db, "Wiz spark", "Wizard", 0, 2)
        spells = _spells(db, "Bard verse", "Bard", 1, 4)
        c = _campaign(db)
        base = dict(
            species="Elf",
            subrace="High Elf",
            character_class="Bard",
            skills=["Performance", "Persuasion", "Deception"],
            kit="Leather, rapier, dagger, lute",
            spells=spells[:4],
        )
        with pytest.raises(ValueError, match="you get 1 Wizard cantrip: pick it from the Wizard"):
            builder.create(db, c.id, _build(cantrips=bard[:3], **base))
        with pytest.raises(ValueError, match="pick the rest from the Bard list"):
            builder.create(db, c.id, _build(cantrips=[bard[0], *wiz[:2]], **base))
        assert builder.create(db, c.id, _build(cantrips=[*bard[:2], wiz[0]], **base)).pc_id


class TestBackgroundsAndFeats:
    def test_a_background_bonus_is_refused(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="come from your race, not your background"):
            builder.create(duckdb_session, c.id, _build(background_bonus={"STR": 2, "CON": 1}))

    def test_an_origin_feat_is_refused(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="The 2014 rules have no Origin feats"):
            builder.create(duckdb_session, c.id, _build(origin_feat="Alert"))

    def test_human_gets_plus_one_to_everything_and_no_feat(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        res = builder.create(
            duckdb_session, c.id, _build(class_choices=_choices(fighting_style=["Archery"]))
        )
        pc = _pc(duckdb_session, c, res)
        assert (pc.score_str, pc.score_cha) == (9, 16)
        assert pc.feats == ["Archery"]

    def test_a_book_background_picks_two_skills(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        base = dict(background="Sage", class_choices=_choices(fighting_style=["Defense"]))
        with pytest.raises(ValueError, match="Background skills: pick 1 more skill"):
            builder.create(duckdb_session, c.id, _build(background_skills=["Arcana"], **base))
        with pytest.raises(ValueError, match="Acolyte gives Insight and Religion"):
            builder.create(duckdb_session, c.id, _build(background_skills=["Arcana", "History"]))
        res = builder.create(
            duckdb_session, c.id, _build(background_skills=["Arcana", "History"], **base)
        )
        pc = _pc(duckdb_session, c, res)
        assert {"Arcana", "History", "Athletics", "Perception"} == set(pc.skill_proficiencies)
        assert "Background skills (from your book): Arcana and History." in pc.notes


class TestCasters:
    def test_life_cleric_1(self, duckdb_session: Session):
        """Subclass at 1, domain spells always prepared, heavy armor from the Life Domain."""
        db = duckdb_session
        cantrips = _spells(db, "Cleric prayer", "Cleric", 0, 3)
        spells = _spells(db, "Cleric rite", "Cleric", 1, 5)
        _spell(db, "Bless", 1, ["Cleric", "Paladin"])
        _spell(db, "Cure Wounds", 1, ["Bard", "Cleric", "Druid", "Paladin", "Ranger"])
        c = _campaign(db)
        heavy = "Chain mail, shield, mace (Life Domain: heavy armor)"
        base = dict(
            character_class="Cleric",
            scores={"STR": 13, "DEX": 10, "CON": 14, "INT": 8, "WIS": 15, "CHA": 12},
            skills=["History", "Medicine"],
            kit=heavy,
            cantrips=cantrips,
        )
        with pytest.raises(ValueError, match="A Cleric picks a subclass at level 1"):
            builder.create(db, c.id, _build(spells=spells[:4], **base))
        # Wisdom 16 (+3) + level 1 = 4 prepared; the domain spells are on top.
        with pytest.raises(ValueError, match="pick 1 more spell. A level 1 Cleric with Wisdom"):
            builder.create(db, c.id, _build(subclass="Life Domain", spells=spells[:3], **base))
        with pytest.raises(ValueError, match="Chain Mail is heavy armor.*a Life Domain Cleric is"):
            builder.create(db, c.id, _build(subclass="Knowledge Domain", spells=spells[:4], **base))
        res = builder.create(db, c.id, _build(subclass="Life Domain", spells=spells[:4], **base))
        known = _sheet_spells(db, c, res)
        assert known["Bless"] and known["Cure Wounds"]
        assert set(spells[:4]) <= set(known)
        assert res.ac == 18  # chain mail 16 + shield 2
        assert "Always prepared: Bless, Cure Wounds." in _pc(db, c, res).notes

    def test_wizard_3_spellbook_and_prepared(self, duckdb_session: Session):
        """School of Evocation: a spellbook of 10, Intelligence modifier + 3 prepared."""
        db = duckdb_session
        cantrips = _spells(db, "Wiz spark", "Wizard", 0, 3)
        book = _spells(db, "Wiz page", "Wizard", 1, 7) + _spells(db, "Wiz tome", "Wizard", 2, 4)
        c = _campaign(db)
        base = dict(
            character_class="Wizard",
            level=3,
            subclass="School of Evocation",
            scores={"STR": 8, "DEX": 13, "CON": 14, "INT": 15, "WIS": 12, "CHA": 10},
            skills=["Investigation", "Medicine"],
            kit="Dagger & spellbook",
            cantrips=cantrips,
        )
        # Intelligence 16 (+3) + 3 = 6 prepared, out of the book.
        with pytest.raises(ValueError, match="pick 1 more spell. A level 3 Wizard's spellbook"):
            builder.create(db, c.id, _build(spells=book[:9], prepared_spells=book[:6], **base))
        with pytest.raises(ValueError, match="with Intelligence \\+3 prepares 6 spells a day"):
            builder.create(db, c.id, _build(spells=book[:10], prepared_spells=book[:7], **base))
        with pytest.raises(ValueError, match="isn't in your spellbook"):
            builder.create(db, c.id, _build(spells=book[:10], prepared_spells=book[5:11], **base))
        with pytest.raises(ValueError, match="Prepared spells: pick 1 more spell"):
            builder.create(db, c.id, _build(spells=book[:10], prepared_spells=book[:5], **base))
        res = builder.create(db, c.id, _build(spells=book[:10], prepared_spells=book[:6], **base))
        known = _sheet_spells(db, c, res)
        assert set(known) == set(cantrips + book[:10])
        assert sorted(n for n in book[:10] if known[n]) == sorted(book[:6])
        assert all(known[n] for n in cantrips)

    def test_paladin_1_has_no_spells_and_no_slots(self, duckdb_session: Session):
        db = duckdb_session
        vows = _spells(db, "Paladin vow", "Paladin", 1, 4)
        c = _campaign(db)
        base = dict(
            character_class="Paladin",
            skills=["Athletics", "Persuasion"],
            kit="Chain mail, longsword & shield, javelins",
        )
        with pytest.raises(ValueError, match="doesn't cast spells yet: they start at level 2"):
            builder.create(db, c.id, _build(spells=vows[:1], **base))
        res = builder.create(db, c.id, _build(**base))
        pc = _pc(db, c, res)
        assert not pc.spell_slots
        assert _sheet_spells(db, c, res) == {}

    def test_paladin_2_prepares_charisma_plus_one(self, duckdb_session: Session):
        db = duckdb_session
        vows = _spells(db, "Paladin vow", "Paladin", 1, 5)
        c = _campaign(db)
        base = dict(
            character_class="Paladin",
            level=2,
            scores={"STR": 15, "DEX": 10, "CON": 13, "INT": 8, "WIS": 12, "CHA": 14},
            skills=["Athletics", "Persuasion"],
            kit="Chain mail, longsword & shield, javelins",
            class_choices=_choices(fighting_style=["Defense"]),
        )
        # Charisma 15 (+2) + half of level 2 (1) = 3.
        with pytest.raises(
            ValueError, match="pick 1 more spell. A level 2 Paladin with Charisma \\+2"
        ):
            builder.create(db, c.id, _build(spells=vows[:2], **base))
        res = builder.create(db, c.id, _build(spells=vows[:3], **base))
        pc = _pc(db, c, res)
        assert pc.spell_slots == {"1": 2}
        assert set(_sheet_spells(db, c, res)) == set(vows[:3])
        assert res.ac == 19  # chain mail 16 + shield 2 + Defense 1

    def test_the_wrong_number_of_spells_is_refused(self, duckdb_session: Session):
        db = duckdb_session
        cantrips = _spells(db, "Bard tune", "Bard", 0, 3)
        spells = _spells(db, "Bard verse", "Bard", 1, 5)
        c = _campaign(db)
        base = dict(
            character_class="Bard",
            skills=["Performance", "Persuasion", "Deception"],
            kit="Leather, rapier, dagger, lute",
            cantrips=cantrips[:2],
        )
        with pytest.raises(ValueError, match="pick 1 more spell. A level 1 Bard has 4"):
            builder.create(db, c.id, _build(spells=spells[:3], **base))
        with pytest.raises(ValueError, match="A level 1 Bard has 4 spells: pick 4"):
            builder.create(db, c.id, _build(spells=spells[:5], **base))

    def test_warlock_3_fiend_pact_boon_and_invocations(self, duckdb_session: Session):
        """A Pact Boon and 2 invocations; Agonizing Blast needs Eldritch Blast; Fiend spells."""
        db = duckdb_session
        blast = _spell(
            db, "Eldritch Blast", 0, ["Warlock"], damage_dice="1d10", attack_type="ranged"
        )
        hexes = _spells(db, "Warlock hex", "Warlock", 0, 2)
        pacts = _spells(db, "Warlock pact", "Warlock", 1, 3) + _spells(
            db, "Warlock oath", "Warlock", 2, 1
        )
        burning = _spell(db, "Burning Hands", 1, ["Sorcerer", "Wizard"])
        c = _campaign(db)
        base = dict(
            character_class="Warlock",
            level=3,
            subclass="The Fiend",
            skills=["Arcana", "Deception"],
            kit="Leather, light crossbow, quarterstaff, daggers",
            spells=[*pacts[:3], burning],  # The Fiend's expanded list counts
        )
        good = _choices(
            pact_boon=["Pact of the Blade"], invocations=["Agonizing Blast", "Devil's Sight"]
        )
        with pytest.raises(ValueError, match="Agonizing Blast needs the Eldritch Blast cantrip"):
            builder.create(db, c.id, _build(cantrips=hexes, class_choices=good, **base))
        tome = _choices(
            pact_boon=["Pact of the Blade"],
            invocations=["Book of Ancient Secrets", "Devil's Sight"],
        )
        with pytest.raises(ValueError, match="Book of Ancient Secrets needs Pact of the Tome"):
            builder.create(db, c.id, _build(cantrips=[blast, hexes[0]], class_choices=tome, **base))
        with pytest.raises(ValueError, match="Pact Boon: choose one"):
            builder.create(
                db,
                c.id,
                _build(
                    cantrips=[blast, hexes[0]],
                    class_choices=_choices(invocations=["Agonizing Blast", "Devil's Sight"]),
                    **base,
                ),
            )
        res = builder.create(
            db, c.id, _build(cantrips=[blast, hexes[0]], class_choices=good, **base)
        )
        pc = _pc(db, c, res)
        assert "Pact Boon: Pact of the Blade" in pc.feats
        assert "Eldritch Invocation: Agonizing Blast" in pc.feats
        assert "Burning Hands" in _sheet_spells(db, c, res)
        assert pc.spell_slots == {"pact": 2, "level": 2}

    def test_land_druid_3_circle_spells_and_bonus_cantrip(self, duckdb_session: Session):
        """Circle of the Land: the land's extra Druid cantrip and, from 3, its circle spells."""
        db = duckdb_session
        cantrips = _spells(db, "Druid seed", "Druid", 0, 4)
        spells = _spells(db, "Druid root", "Druid", 1, 5)
        for name in ("Barkskin", "Spider Climb"):
            _spell(db, name, 2, ["Druid"])
        c = _campaign(db)
        # Wisdom 16 (+3) + level 3 = 6 prepared, and 2 cantrips + the circle's bonus one; the
        # circle spells come on top of them.
        res = builder.create(
            db,
            c.id,
            _build(
                character_class="Druid",
                level=3,
                subclass="Circle of the Land",
                scores={"STR": 8, "DEX": 13, "CON": 14, "INT": 10, "WIS": 15, "CHA": 12},
                skills=["Nature", "Perception"],
                kit="Leather, quarterstaff, sling",
                cantrips=cantrips[:3],
                spells=[*spells[:5], *_spells(db, "Druid bloom", "Druid", 2, 1)],
                class_choices=_choices(land=["Forest"]),
            ),
        )
        pc = _pc(db, c, res)
        assert "Circle of the Land: Forest" in pc.feats
        known = _sheet_spells(db, c, res)
        assert known["Barkskin"] and known["Spider Climb"]  # always prepared from Druid 3
        assert set(cantrips[:3]) <= set(known)


class TestSpellChoices:
    def test_mystic_arcanum_is_picked_from_the_catalog(self, duckdb_session: Session):
        """Warlock 11: one 6th-level Warlock spell, checked against the catalog and recorded."""
        db = duckdb_session
        blast = _spell(
            db, "Eldritch Blast", 0, ["Warlock"], damage_dice="1d10", attack_type="ranged"
        )
        hexes = _spells(db, "Warlock hex", "Warlock", 0, 3)
        pacts = (
            _spells(db, "Warlock pact", "Warlock", 1, 3)
            + _spells(db, "Warlock oath", "Warlock", 2, 3)
            + _spells(db, "Warlock vow", "Warlock", 3, 3)
            + _spells(db, "Warlock bond", "Warlock", 4, 3)
        )
        arcanum = _spell(db, "P131 Warlock arcanum", 6, ["Warlock"])
        seventh = _spell(db, "P131 Warlock seventh", 7, ["Warlock"])
        c = _campaign(db)

        def build(arc: list[str], book: list[str] = ()):
            return _build(
                character_class="Warlock",
                level=11,
                subclass="Archfey",
                scores={"STR": 8, "DEX": 14, "CON": 13, "INT": 10, "WIS": 12, "CHA": 15},
                skills=["Arcana", "Deception"],
                kit="Leather, light crossbow, quarterstaff, daggers",
                cantrips=[blast, *hexes],
                spells=pacts[:11],
                class_choices=[
                    {"key": "pact_boon", "picks": ["Pact of the Chain"]},
                    {
                        "key": "invocations",
                        "picks": [
                            "Agonizing Blast",
                            "Devil's Sight",
                            "Eldritch Sight",
                            "Mask of Many Faces",
                            "Beast Speech",
                        ],
                    },
                    {"key": "mystic_arcanum", "picks": arc, "book": list(book)},
                ],
                asi=[
                    {"level": 4, "name": "Ability Score Improvement", "asi": {"CHA": 2}},
                    {"level": 8, "name": "Ability Score Improvement", "asi": {"CHA": 2}},
                ],
            )

        with pytest.raises(ValueError, match="Mystic Arcanum: pick one spell of each level, 6th"):
            builder.create(db, c.id, build([seventh]))
        with pytest.raises(ValueError, match="Mystic Arcanum: Wish isn't in the spell list"):
            builder.create(db, c.id, build(["Wish"]))
        res = builder.create(db, c.id, build([arcanum]))
        pc = _pc(db, c, res)
        assert "Mystic Arcanum: P131 Warlock arcanum" in pc.feats
        # Like the level-up guide: no slot casts it, so it stays a note, not a spell row.
        assert arcanum not in _sheet_spells(db, c, res)
        assert not any("recorded by name" in w and arcanum in w for w in res.warnings)
        # A book entry still works, with the usual warning.
        res = builder.create(db, c.id, build([], ["Mass Suggestion"]))
        assert any("Mass Suggestion is recorded by name" in w for w in res.warnings)


class TestOptions:
    def test_2014_options(self, duckdb_session: Session):
        db = duckdb_session
        _spell(db, "P131 Twin Spell", 1, ["Wizard"], ruleset="2014")
        _spell(db, "P131 Twin Spell", 1, ["Wizard"], ruleset="2024")
        c = _campaign(db)
        o = builder.options(db, c.id)
        assert o.ruleset == "2014"
        names = [s["name"] for s in o.species]
        assert "Half-Elf" in names and "Half-Orc" in names and "Goliath" not in names
        assert [s["name"] for s in o.spells].count("P131 Twin Spell") == 1
        assert o.backgrounds[0]["feat"] is None and o.origin_feats == []
        assert o.classes["Cleric"]["subclass_level"] == 1
        assert o.classes["Wizard"]["spellcasting"]["spellbook"] is True
        assert o.spellbook_size == {"Wizard": [6 + 2 * i for i in range(20)]}
        assert o.unarmored_ac_base_subclass == {"Draconic Bloodline": 13}
        assert o.subclass_armor == {"Life Domain": ["heavy"]}
        assert o.expanded_spells["The Fiend"][1] == ["Burning Hands", "Command"]
        assert "dragonborn_ancestry" in o.choice_kinds and "pact_boon" in o.choice_kinds
        assert o.mastery_weapons == [] and o.weapon_mastery_filter == {}
        assert o.spell_slots["Paladin"][0] == {} and o.spell_slots["Paladin"][1] == {"1": 2}
        assert 19 in o.asi_levels["Fighter"] and 6 in o.asi_levels["Fighter"]
        kit_weapons = {w["name"] for w in o.weapons}
        assert kit_weapons <= {
            i for cls in o.classes.values() for k in cls["kits"] for i in k["items"]
        }

    def test_2024_options_only_gain_empty_keys(self, duckdb_session: Session):
        from integrations.dnd_rules import levelup_2024, srd_character_options_2024

        db = duckdb_session
        _spell(db, "P131 Twin Spell", 1, ["Wizard"], ruleset="2014")
        _spell(db, "P131 Twin Spell", 1, ["Wizard"], ruleset="2024")
        c = _campaign(db, "2024")
        o = builder.options(db, c.id)
        assert o.ruleset == "2024"
        assert o.species == srd_character_options_2024.SPECIES
        assert o.classes == srd_character_options_2024.CLASSES
        assert o.choice_kinds == levelup_2024.CHOICE_KINDS
        assert [s["name"] for s in o.spells].count("P131 Twin Spell") == 1
        assert o.spellbook_size == {} and o.unarmored_ac_base_subclass == {}
        assert o.subclass_armor == {} and o.expanded_spells == {}
        assert o.mastery_weapons  # weapon mastery is a 2024 rule

    def test_a_2024_build_refuses_the_2014_picks(self, duckdb_session: Session):
        c = _campaign(duckdb_session, "2024")
        base = dict(
            species="Dwarf",
            background="Soldier",
            background_bonus={"STR": 2, "CON": 1},
            kit="Chain mail, longsword & shield",
            class_choices=None,
        )
        with pytest.raises(ValueError, match="The 2024 rules have no subraces"):
            builder.create(duckdb_session, c.id, _build(subrace="Hill Dwarf", **base))
        with pytest.raises(ValueError, match="come from your background, not your species"):
            builder.create(duckdb_session, c.id, _build(ability_choice={"STR": 1}, **base))

    def test_the_dm_wizard_uses_the_campaigns_rules(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        assert builder.options_for_dm(duckdb_session, c.id, c.dm_email).ruleset == "2014"
        with pytest.raises(ValueError, match="no Origin feats"):
            builder.create_for_dm(duckdb_session, c.id, c.dm_email, _build(origin_feat="Alert"))
        res = builder.create_for_dm(
            duckdb_session,
            c.id,
            c.dm_email,
            _build(class_choices=_choices(fighting_style=["Defense"])),
        )
        assert _pc(duckdb_session, c, res).ruleset == "2014"
