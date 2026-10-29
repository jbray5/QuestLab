"""Level-up guide (Plan 115): grants, per-PC plans, and applying the player's choices.

The four PCs mirror the live party at level 3 going to 4 (Session 9), so the goldens are the
numbers Justin checks at the table: average HP 28 / 34 / 28 / 29.
"""

import uuid

import pytest
from sqlmodel import Session, delete

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.spell_repo import SpellRepo
from domain.character import CharacterSpell, CharacterSpellCreate
from domain.enums import CharacterClass
from domain.level_up import FeatChoice, LevelUpChoices, SpellSwap
from domain.spell import SpellCreate
from services import levelup_service, spellcasting_service


@pytest.fixture(autouse=True)
def _clean(duckdb_session: Session):
    """Drop the spell rows these tests teach, so later suites can wipe the spells table.

    The engine is shared across the run; a leftover character_spells row would pin its
    spell and break any later ``delete(Spell)`` on the foreign key.
    """
    yield
    duckdb_session.rollback()
    duckdb_session.exec(delete(CharacterSpell))
    duckdb_session.commit()


def _spell(db: Session, name: str, level: int, classes: list[str], school: str = "Evocation"):
    """Get or create a catalog spell (the test DB is shared across tests)."""
    row = SpellRepo.get_by_name(db, name)
    if row is not None:
        return row
    return SpellRepo.create(
        db,
        SpellCreate(
            name=name,
            level=level,
            school=school,
            classes=classes,
            casting_time="1 action",
            range="60 ft",
            duration="Instant",
            description="x",
        ),
    )


def _campaign(db: Session):
    dm = f"dm_{uuid.uuid4().hex[:8]}@example.com"
    return camp_svc.create_campaign(db, name="Hollowmere", setting="R", tone="T", dm_email=dm)


_PARTY = {
    "willa": dict(
        character_name="Willa Thornwood",
        player_name="Hayley",
        race="Aasimar",
        character_class=CharacterClass.DRUID,
        subclass="Circle of Stars",
        scores=(8, 12, 14, 15, 16, 10),
        hp=21,
        ac=12,
        saves=["INT", "WIS"],
        skills={"Arcana": 1, "History": 1, "Nature": 1, "Perception": 1},
        feats=["Magic Initiate"],
    ),
    "nya": dict(
        character_name="Nya Ashwyn",
        player_name="Chelsea",
        race="Human",
        character_class=CharacterClass.SORCERER,
        subclass="Wild Magic",
        scores=(10, 14, 15, 8, 12, 16),
        hp=26,
        ac=14,
        saves=["CON", "CHA"],
        skills={"Deception": 1, "Stealth": 1},
        feats=["Skilled", "Tough", "Metamagic: Seeking Spell", "Metamagic: Twinned Spell"],
    ),
    "creed": dict(
        character_name="Creed Ashmantle",
        player_name="Cory",
        race="Dragonborn",
        character_class=CharacterClass.PALADIN,
        subclass="Oath of the Ancients",
        scores=(16, 10, 13, 10, 12, 14),
        hp=21,
        ac=19,
        saves=["WIS", "CHA"],
        skills={"Athletics": 1, "Insight": 1},
        feats=["Skilled", "Dueling"],
    ),
    "thane": dict(
        character_name='Thaelen "Thane" Amakiir',
        player_name="Parker",
        race="Elf (Wood)",
        character_class=CharacterClass.ROGUE,
        subclass="Soulknife",
        scores=(12, 16, 13, 14, 12, 8),
        hp=23,
        ac=14,
        saves=["DEX", "INT"],
        skills={"Perception": 1, "Stealth": 2, "Investigation": 1},
        feats=["Lucky"],
    ),
}


def _pc(db: Session, campaign, key: str, level: int = 3, **over):
    spec = {**_PARTY[key], **over}
    s = spec["scores"]
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=campaign.dm_email,
        player_name=spec["player_name"],
        character_name=spec["character_name"],
        race=spec["race"],
        character_class=spec["character_class"],
        level=level,
        score_str=s[0],
        score_dex=s[1],
        score_con=s[2],
        score_int=s[3],
        score_wis=s[4],
        score_cha=s[5],
        hp_max=spec["hp"],
        hp_current=spec["hp"],
        ac=spec["ac"],
        subclass=spec["subclass"],
        saving_throw_proficiencies=spec["saves"],
        skill_proficiencies=spec["skills"],
        feats=spec["feats"],
    )
    return pc


def _granted(db: Session, key: str, level: int = 3, to_level=None, **over):
    c = _campaign(db)
    pc = _pc(db, c, key, level, **over)
    levelup_service.grant(db, pc.id, c.dm_email, to_level)
    return c, pc


def _know(db: Session, campaign, pc, *spells) -> None:
    for sp in spells:
        spellcasting_service.learn_spell(
            db, pc.id, CharacterSpellCreate(spell_id=sp.id, prepared=True), campaign.dm_email
        )


def _asi(**inc) -> FeatChoice:
    return FeatChoice(name="Ability Score Improvement", asi=inc)


class TestGrant:
    def test_no_grant_no_guide(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        pc = _pc(duckdb_session, c, "thane")
        with pytest.raises(ValueError, match="No level-up"):
            levelup_service.plan_for(duckdb_session, pc.id)
        with pytest.raises(ValueError, match="No level-up"):
            levelup_service.apply(duckdb_session, pc.id, LevelUpChoices(feat=_asi(DEX=2)))

    def test_grant_and_revoke(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        pc = _pc(duckdb_session, c, "thane")
        assert levelup_service.grant(duckdb_session, pc.id, c.dm_email).pending_level == 4
        assert levelup_service.plan_for(duckdb_session, pc.id).to_level == 4
        assert levelup_service.revoke(duckdb_session, pc.id, c.dm_email).pending_level is None

    def test_only_the_campaign_dm_grants(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        pc = _pc(duckdb_session, c, "thane")
        with pytest.raises(PermissionError):
            levelup_service.grant(duckdb_session, pc.id, "someone@else.com")

    def test_grant_must_be_above_current_level(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        pc = _pc(duckdb_session, c, "thane")
        with pytest.raises(ValueError):
            levelup_service.grant(duckdb_session, pc.id, c.dm_email, to_level=3)


class TestPlan:
    @pytest.mark.parametrize(
        "key,die,gain", [("willa", 8, 7), ("nya", 6, 8), ("creed", 10, 7), ("thane", 8, 6)]
    )
    def test_average_hp_matches_the_table(self, duckdb_session: Session, key, die, gain):
        _, pc = _granted(duckdb_session, key)
        plan = levelup_service.plan_for(duckdb_session, pc.id)
        assert plan.hit_die == die and plan.hp_average_gain == gain
        assert plan.asi_level and plan.to_level == 4

    def test_nya_tough_is_in_the_average(self, duckdb_session: Session):
        _, pc = _granted(duckdb_session, "nya")
        plan = levelup_service.plan_for(duckdb_session, pc.id)
        assert plan.hp_bonus_per_level == 2 and plan.hp_max + plan.hp_average_gain == 34

    def test_spell_picks_are_the_table_delta(self, duckdb_session: Session):
        druid_c = _spell(duckdb_session, "LU Druidcraft", 0, ["Druid"])
        c, willa = _granted(duckdb_session, "willa")
        _know(duckdb_session, c, willa, druid_c)
        step = levelup_service.plan_for(duckdb_session, willa.id).spellcasting
        assert (step.new_cantrips, step.new_spells, step.max_spell_level) == (1, 1, 2)
        assert step.cantrip_swap and not step.spell_swap and step.prepared_caster

        sorc = _spell(duckdb_session, "LU Spark", 1, ["Sorcerer"])
        c, nya = _granted(duckdb_session, "nya")
        _know(duckdb_session, c, nya, sorc)
        step = levelup_service.plan_for(duckdb_session, nya.id).spellcasting
        assert (step.new_cantrips, step.new_spells) == (1, 1) and step.spell_swap

        _, creed = _granted(duckdb_session, "creed")
        step = levelup_service.plan_for(duckdb_session, creed.id).spellcasting
        assert (step.new_cantrips, step.new_spells, step.max_spell_level) == (0, 1, 1)

        _, thane = _granted(duckdb_session, "thane")
        assert levelup_service.plan_for(duckdb_session, thane.id).spellcasting is None

    def test_slots_and_scaling(self, duckdb_session: Session):
        _, willa = _granted(duckdb_session, "willa")
        plan = levelup_service.plan_for(duckdb_session, willa.id)
        assert plan.slots_before == {"1": 4, "2": 2} and plan.slots_after == {"1": 4, "2": 3}
        assert any("Wild Shape max CR" in n and "1/2" in n for n in plan.scaling)

        _, creed = _granted(duckdb_session, "creed")
        plan = levelup_service.plan_for(duckdb_session, creed.id)
        assert any("Lay on Hands pool: 15 HP → 20 HP" in n for n in plan.scaling)

    def test_feats_offered_follow_prerequisites(self, duckdb_session: Session):
        _, thane = _granted(duckdb_session, "thane")
        feats = {f.name: f for f in levelup_service.plan_for(duckdb_session, thane.id).feats}
        assert not feats["Lucky"].ok and feats["Lucky"].reason == "Already taken."
        assert not feats["Actor"].ok  # CHA 8
        assert feats["Skulker"].ok and feats["Skulker"].popular
        assert not feats["Archery"].ok  # no Fighting Style

        _, creed = _granted(duckdb_session, "creed")
        feats = {f.name: f for f in levelup_service.plan_for(duckdb_session, creed.id).feats}
        assert feats["Archery"].ok and not feats["Dueling"].ok
        assert feats["Heavy Armor Master"].ok and feats["Shield Master"].ok

        _, willa = _granted(duckdb_session, "willa")
        feats = {f.name: f for f in levelup_service.plan_for(duckdb_session, willa.id).feats}
        assert feats["War Caster"].ok and feats["Keen Mind"].ok
        assert not feats["Heavily Armored"].ok  # druids have no medium armor training
        assert feats["Magic Initiate"].ok  # repeatable with another list

    def test_popular_feats_lead_the_list(self, duckdb_session: Session):
        _, nya = _granted(duckdb_session, "nya")
        feats = levelup_service.plan_for(duckdb_session, nya.id).feats
        assert feats[0].name == "Ability Score Improvement"
        assert feats[1].name == "War Caster"


class TestApply:
    def test_willa_takes_wis_and_two_spells(self, duckdb_session: Session):
        _spell(duckdb_session, "LU Shillelagh", 0, ["Druid"])
        _spell(duckdb_session, "LU Moonbeam", 2, ["Druid"])
        c, pc = _granted(duckdb_session, "willa")
        res = levelup_service.apply(
            duckdb_session,
            pc.id,
            LevelUpChoices(
                feat=_asi(WIS=2), cantrips=["LU Shillelagh"], spells=["LU Moonbeam"], armor="light"
            ),
        )
        assert res.level == 4 and res.hp_max == 28 and res.hp_gain == 7 and not res.more_levels
        after = char_svc.get_character(duckdb_session, pc.id, c.dm_email)
        assert after.score_wis == 18 and after.hp_current == 28 and after.pending_level is None
        assert after.spell_slots == {"1": 4, "2": 3} or after.spell_slots == {1: 4, 2: 3}
        assert "Level 4" in (after.notes or "") and "WIS 16 → 18" in after.notes
        known = spellcasting_service.list_known_for_character(duckdb_session, pc.id, c.dm_email)
        names = {SpellRepo.get_by_id(duckdb_session, k.spell_id).name for k in known}
        assert {"LU Shillelagh", "LU Moonbeam"} <= names

    def test_thane_dex_raises_ac_in_light_armor_and_rolls_hp(self, duckdb_session: Session):
        c, pc = _granted(duckdb_session, "thane")
        res = levelup_service.apply(
            duckdb_session,
            pc.id,
            LevelUpChoices(feat=_asi(DEX=2), hp_method="roll", hp_roll=8, armor="light"),
        )
        assert res.ac == 15 and res.hp_gain == 9 and res.hp_max == 32

    def test_heavy_armor_ignores_dex(self, duckdb_session: Session):
        _, pc = _granted(duckdb_session, "thane")
        res = levelup_service.apply(
            duckdb_session, pc.id, LevelUpChoices(feat=_asi(DEX=2), armor="heavy")
        )
        assert res.ac == 14

    def test_con_increase_is_retroactive(self, duckdb_session: Session):
        _, pc = _granted(duckdb_session, "creed")
        res = levelup_service.apply(duckdb_session, pc.id, LevelUpChoices(feat=_asi(STR=1, CON=1)))
        # d10 average 6 + new CON +2, plus +1 for each of the 3 earlier levels.
        assert res.hp_gain == 11 and res.hp_max == 32

    def test_tough_taken_now_counts_every_level(self, duckdb_session: Session):
        _, pc = _granted(duckdb_session, "thane")
        res = levelup_service.apply(
            duckdb_session, pc.id, LevelUpChoices(feat=FeatChoice(name="Tough"))
        )
        assert res.hp_gain == 6 + 2 + 2 * 3

    def test_resilient_adds_the_save(self, duckdb_session: Session):
        c, pc = _granted(duckdb_session, "willa")
        levelup_service.apply(
            duckdb_session, pc.id, LevelUpChoices(feat=FeatChoice(name="Resilient", asi={"CON": 1}))
        )
        after = char_svc.get_character(duckdb_session, pc.id, c.dm_email)
        assert "CON" in [getattr(s, "value", s) for s in after.saving_throw_proficiencies]
        assert after.score_con == 15 and "Resilient" in after.feats

    def test_resilient_in_a_save_you_have_is_refused(self, duckdb_session: Session):
        _, pc = _granted(duckdb_session, "willa")
        with pytest.raises(ValueError, match="already proficient"):
            levelup_service.apply(
                duckdb_session,
                pc.id,
                LevelUpChoices(feat=FeatChoice(name="Resilient", asi={"WIS": 1})),
            )

    def test_fey_touched_learns_both_spells(self, duckdb_session: Session):
        _spell(duckdb_session, "Misty Step", 2, ["Sorcerer", "Warlock", "Wizard"], "Conjuration")
        _spell(duckdb_session, "LU Beguile", 1, ["Bard"], "Enchantment")
        c, pc = _granted(duckdb_session, "willa")
        levelup_service.apply(
            duckdb_session,
            pc.id,
            LevelUpChoices(
                feat=FeatChoice(name="Fey Touched", asi={"WIS": 1}, spells=["LU Beguile"])
            ),
        )
        known = spellcasting_service.list_known_for_character(duckdb_session, pc.id, c.dm_email)
        names = {SpellRepo.get_by_id(duckdb_session, k.spell_id).name for k in known}
        assert {"Misty Step", "LU Beguile"} <= names
        after = char_svc.get_character(duckdb_session, pc.id, c.dm_email)
        assert after.score_wis == 17

    def test_fey_touched_pick_must_fit_the_school(self, duckdb_session: Session):
        _spell(duckdb_session, "LU Zap", 1, ["Wizard"], "Evocation")
        _, pc = _granted(duckdb_session, "willa")
        with pytest.raises(ValueError, match="doesn't fit"):
            levelup_service.apply(
                duckdb_session,
                pc.id,
                LevelUpChoices(
                    feat=FeatChoice(name="Fey Touched", asi={"WIS": 1}, spells=["LU Zap"])
                ),
            )

    def test_skill_expert(self, duckdb_session: Session):
        c, pc = _granted(duckdb_session, "thane")
        levelup_service.apply(
            duckdb_session,
            pc.id,
            LevelUpChoices(
                feat=FeatChoice(
                    name="Skill Expert",
                    asi={"DEX": 1},
                    skills=["Athletics"],
                    expertise=["Perception"],
                )
            ),
        )
        after = char_svc.get_character(duckdb_session, pc.id, c.dm_email)
        assert after.skill_proficiencies["Athletics"] == 1
        assert after.skill_proficiencies["Perception"] == 2

    def test_unqualified_or_taken_feats_are_refused(self, duckdb_session: Session):
        _, pc = _granted(duckdb_session, "thane")
        with pytest.raises(ValueError, match="CHA 13"):
            levelup_service.apply(
                duckdb_session, pc.id, LevelUpChoices(feat=FeatChoice(name="Actor", asi={"CHA": 1}))
            )
        with pytest.raises(ValueError, match="Already taken"):
            levelup_service.apply(
                duckdb_session, pc.id, LevelUpChoices(feat=FeatChoice(name="Lucky"))
            )

    def test_asi_shape_and_cap(self, duckdb_session: Session):
        _, pc = _granted(duckdb_session, "thane")
        with pytest.raises(ValueError, match=r"\+2 to one"):
            levelup_service.apply(duckdb_session, pc.id, LevelUpChoices(feat=_asi(DEX=2, STR=1)))
        _, capped = _granted(duckdb_session, "thane", scores=(12, 19, 13, 14, 12, 8))
        with pytest.raises(ValueError, match="above 20"):
            levelup_service.apply(duckdb_session, capped.id, LevelUpChoices(feat=_asi(DEX=2)))

    def test_feat_step_is_required_at_asi_levels_only(self, duckdb_session: Session):
        _, pc = _granted(duckdb_session, "thane")
        with pytest.raises(ValueError, match="Ability Score Improvement or a feat"):
            levelup_service.apply(duckdb_session, pc.id, LevelUpChoices())
        _, low = _granted(duckdb_session, "thane", level=2)
        with pytest.raises(ValueError, match="isn't a feat level"):
            levelup_service.apply(duckdb_session, low.id, LevelUpChoices(feat=_asi(DEX=2)))

    def test_over_cap_spell_picks_are_refused(self, duckdb_session: Session):
        _spell(duckdb_session, "LU Thorn Whip", 0, ["Druid"])
        _spell(duckdb_session, "LU Poison Spray", 0, ["Druid"])
        _, pc = _granted(duckdb_session, "willa")
        with pytest.raises(ValueError, match="1 new cantrip"):
            levelup_service.apply(
                duckdb_session,
                pc.id,
                LevelUpChoices(feat=_asi(WIS=2), cantrips=["LU Thorn Whip", "LU Poison Spray"]),
            )

    def test_open_spell_picks_warn_not_block(self, duckdb_session: Session):
        _, pc = _granted(duckdb_session, "creed")
        res = levelup_service.apply(duckdb_session, pc.id, LevelUpChoices(feat=_asi(STR=2)))
        assert res.level == 4 and any("Still to pick: 1 spell" in w for w in res.warnings)

    def test_sorcerer_swaps_a_cantrip(self, duckdb_session: Session):
        old = _spell(duckdb_session, "LU Old Bolt", 0, ["Sorcerer"])
        _spell(duckdb_session, "LU New Frost", 0, ["Sorcerer"])
        c, pc = _granted(duckdb_session, "nya")
        _know(duckdb_session, c, pc, old)
        levelup_service.apply(
            duckdb_session,
            pc.id,
            LevelUpChoices(
                feat=_asi(CHA=2),
                cantrip_swap=SpellSwap(forget="LU Old Bolt", learn="LU New Frost"),
            ),
        )
        known = spellcasting_service.list_known_for_character(duckdb_session, pc.id, c.dm_email)
        names = {SpellRepo.get_by_id(duckdb_session, k.spell_id).name for k in known}
        assert "LU New Frost" in names and "LU Old Bolt" not in names

    def test_only_class_list_cantrips_swap(self, duckdb_session: Session):
        light = _spell(duckdb_session, "LU Light", 0, ["Cleric", "Wizard"])
        _spell(duckdb_session, "LU Thornlash", 0, ["Druid"])
        druidcraft = _spell(duckdb_session, "LU Druidcraft", 0, ["Druid"])
        c, pc = _granted(duckdb_session, "willa")
        _know(duckdb_session, c, pc, light, druidcraft)  # Light: an Aasimar's species cantrip
        step = levelup_service.plan_for(duckdb_session, pc.id).spellcasting
        assert "LU Light" not in {s.name for s in step.known}
        with pytest.raises(ValueError, match="isn't a cantrip you know"):
            levelup_service.apply(
                duckdb_session,
                pc.id,
                LevelUpChoices(
                    feat=_asi(WIS=2),
                    cantrip_swap=SpellSwap(forget="LU Light", learn="LU Thornlash"),
                ),
            )

    def test_paladin_cannot_swap_on_level_up(self, duckdb_session: Session):
        smite = _spell(duckdb_session, "LU Smite", 1, ["Paladin"])
        _spell(duckdb_session, "LU Heroism", 1, ["Paladin"])
        c, pc = _granted(duckdb_session, "creed")
        _know(duckdb_session, c, pc, smite)
        with pytest.raises(ValueError, match="can't swap"):
            levelup_service.apply(
                duckdb_session,
                pc.id,
                LevelUpChoices(
                    feat=_asi(STR=2), spell_swap=SpellSwap(forget="LU Smite", learn="LU Heroism")
                ),
            )

    def test_two_levels_granted_keeps_the_banner(self, duckdb_session: Session):
        c, pc = _granted(duckdb_session, "thane", to_level=5)
        res = levelup_service.apply(duckdb_session, pc.id, LevelUpChoices(feat=_asi(DEX=2)))
        assert res.level == 4 and res.more_levels
        plan = levelup_service.plan_for(duckdb_session, pc.id)
        assert plan.to_level == 5 and not plan.asi_level
        assert any("Sneak Attack: 2d6 → 3d6" in n for n in plan.scaling)

    def test_book_feat_is_recorded(self, duckdb_session: Session):
        c, pc = _granted(duckdb_session, "thane")
        res = levelup_service.apply(
            duckdb_session,
            pc.id,
            LevelUpChoices(feat=FeatChoice(name="Homebrew Knack", from_book=True, asi={"DEX": 1})),
        )
        after = char_svc.get_character(duckdb_session, pc.id, c.dm_email)
        assert "Homebrew Knack" in after.feats and after.score_dex == 17
        assert any("from your book" in w for w in res.warnings)
