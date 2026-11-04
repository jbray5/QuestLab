"""Plan 131 — a 2014 PC levels up by the 2014 rules (SRD 5.1).

The tests run on their own in-memory database with both editions' SRD spells seeded, as
production has them, so every catalog lookup must keep to the PC's edition. The expected
numbers are the SRD 5.1 class tables (hard-coded: the dataset isn't in the repo).
"""

import uuid

import pytest
from sqlmodel import Session, SQLModel, create_engine
from sqlmodel.pool import StaticPool

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.spell_service as spell_svc
from db.base import _json_serializer, relax_duckdb_indexes
from db.repos.spell_repo import SpellRepo
from domain.character import CharacterSpellCreate
from domain.enums import CharacterClass, Ruleset
from domain.level_up import ClassChoicePick, FeatChoice, LevelUpChoices, SpellSwap
from services import feature_service, levelup_service, player_service, spellcasting_service

ASI = "Ability Score Improvement"


@pytest.fixture(scope="module")
def engine():
    """One database for this module, with the 2024 and the 2014 spell catalogs."""
    eng = create_engine(
        "duckdb:///:memory:", poolclass=StaticPool, json_serializer=_json_serializer
    )
    SQLModel.metadata.create_all(eng)
    relax_duckdb_indexes(eng)
    with Session(eng) as s:
        spell_svc.seed_srd_spells(s)
    return eng


@pytest.fixture()
def db(engine):
    """A session on the module's database."""
    with Session(engine) as session:
        yield session


def _pc(
    db: Session,
    cls: CharacterClass,
    level: int,
    *,
    ruleset: str = "2014",
    scores=(10, 14, 14, 10, 12, 16),
    subclass=None,
    race="Human",
    feats=None,
    skills=None,
    spells=(),
    prepared=True,
):
    """A PC in a fresh campaign of ``ruleset``, knowing ``spells`` from that edition."""
    dm = f"dm131l_{uuid.uuid4().hex[:8]}@example.com"
    campaign = camp_svc.create_campaign(db, name="Old School", dm_email=dm, ruleset=ruleset)
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Hero",
        race=race,
        character_class=cls,
        level=level,
        score_str=scores[0],
        score_dex=scores[1],
        score_con=scores[2],
        score_int=scores[3],
        score_wis=scores[4],
        score_cha=scores[5],
        hp_max=10 * level,
        hp_current=10 * level,
        ac=14,
        subclass=subclass,
        feats=feats,
        skill_proficiencies=skills,
    )
    for name in spells:
        spell = SpellRepo.get_by_name(db, name, ruleset=ruleset)
        assert spell is not None, name
        spellcasting_service.learn_spell(
            db, pc.id, CharacterSpellCreate(spell_id=spell.id, known=True, prepared=prepared), dm
        )
    if level < 20:
        levelup_service.grant(db, pc.id, dm)
    return pc, dm


def _step(plan, key):
    """The plan's class choice with this key."""
    return next(s for s in plan.class_choices if s.key == key)


def _sheet_spells(db: Session, pc, dm):
    """{spell name: (prepared, ruleset)} for every spell on the sheet."""
    out = {}
    for row in spellcasting_service.list_known_for_character(db, pc.id, dm):
        spell = SpellRepo.get_by_id(db, row.spell_id)
        out[spell.name] = (row.prepared, spell.ruleset)
    return out


# ── Paladin 1 → 2: first spells, slots, prepared count, Fighting Style ─────────


def test_paladin_2_gets_first_spells_and_a_fighting_style(db: Session):
    """Paladin 1 → 2: first spells, 2 first-level slots, CHA mod + 1 prepared, a Fighting Style."""
    pc, dm = _pc(db, CharacterClass.PALADIN, 1, scores=(16, 10, 14, 8, 10, 16))
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.ruleset == Ruleset.R2014
    assert plan.slots_before == {} and plan.slots_after == {"1": 2}
    sc = plan.spellcasting
    assert sc.first_spells and sc.prepared_caster
    assert sc.prepared_count == 4 and sc.new_spells == 4  # CHA +3, half of level 2
    assert sc.max_spell_level == 1 and sc.new_cantrips == 0
    assert {"Bless", "Shield of Faith"} <= {o.name for o in sc.options}
    names = [f.name for f in plan.new_features]
    assert "Divine Smite" in names and "Paladin's Smite" not in names
    style = _step(plan, "fighting_style")
    assert style.count == 1 and style.kind == "feat"
    assert {o.name for o in style.options} == {
        "Defense",
        "Dueling",
        "Great Weapon Fighting",
        "Protection",
    }
    assert "Spells you prepare each day: 0 → 4" in plan.scaling

    res = levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            spells=["Bless", "Cure Wounds", "Shield of Faith", "Command"],
            class_choices=[ClassChoicePick(key="fighting_style", picks=["Defense"])],
        ),
    )
    assert res.level == 2
    assert "Fighting Style: Defense" in res.summary
    sheet = char_svc.CharacterRepo.get_by_id(db, pc.id)
    assert "Defense" in sheet.feats
    assert sheet.spell_slots == {"1": 2}
    spells = _sheet_spells(db, pc, dm)
    assert set(spells) == {"Bless", "Cure Wounds", "Shield of Faith", "Command"}
    assert all(p and r == "2014" for p, r in spells.values())


def test_paladin_2_needs_its_fighting_style(db: Session):
    """The Fighting Style is required, and only the Paladin's styles are allowed."""
    pc, _dm = _pc(db, CharacterClass.PALADIN, 1, scores=(16, 10, 14, 8, 10, 16))
    with pytest.raises(ValueError, match="Fighting Style: choose one"):
        levelup_service.apply(db, pc.id, LevelUpChoices(spells=["Bless"]))
    with pytest.raises(ValueError, match="Archery isn't one of the choices"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                class_choices=[ClassChoicePick(key="fighting_style", picks=["Archery"])]
            ),
        )


# ── Warlock: invocations at 2, Pact Boon at 3 ─────────────────────────────────


def test_warlock_2_picks_two_invocations(db: Session):
    """Warlock 1 → 2: two invocations, one more known spell, the Fiend's expanded list."""
    pc, _dm = _pc(
        db,
        CharacterClass.WARLOCK,
        1,
        subclass="The Fiend",
        spells=["Eldritch Blast", "Minor Illusion", "Charm Person"],
    )
    plan = levelup_service.plan_for(db, pc.id)
    inv = _step(plan, "invocations")
    assert inv.count == 2 and inv.book
    by_name = {o.name: o for o in inv.options}
    assert by_name["Agonizing Blast"].ok
    assert by_name["Thirsting Blade"].reason == "Needs Warlock level 5."
    assert by_name["Book of Ancient Secrets"].reason == "Needs Pact of the Tome."
    assert plan.spellcasting.new_spells == 1  # Spells Known 2 → 3
    assert plan.spellcasting.spell_swap and not plan.spellcasting.cantrip_swap
    # The Fiend's expanded list joins the Warlock list to learn from.
    assert "Burning Hands" in {o.name for o in plan.spellcasting.options}
    assert "pact_boon" not in {s.key for s in plan.class_choices}

    res = levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            spells=["Burning Hands"],
            spell_swap=SpellSwap(forget="Charm Person", learn="Hellish Rebuke"),
            class_choices=[
                ClassChoicePick(key="invocations", picks=["Agonizing Blast", "Devil's Sight"])
            ],
        ),
    )
    feats = char_svc.CharacterRepo.get_by_id(db, pc.id).feats
    assert {"Eldritch Invocation: Agonizing Blast", "Eldritch Invocation: Devil's Sight"} <= set(
        feats
    )
    assert "Swapped Charm Person for Hellish Rebuke" in res.summary


def test_warlock_invocation_prerequisites_are_checked(db: Session):
    """Invocations need their cantrip and Warlock level; no repeats; book names are kept."""
    pc, _dm = _pc(db, CharacterClass.WARLOCK, 1, subclass="The Fiend", spells=["Minor Illusion"])
    plan = levelup_service.plan_for(db, pc.id)
    agonizing = next(o for o in _step(plan, "invocations").options if o.name == "Agonizing Blast")
    assert agonizing.reason == "Needs the Eldritch Blast cantrip."
    for picks, msg in (
        (["Agonizing Blast", "Devil's Sight"], "needs the Eldritch Blast cantrip"),
        (["Thirsting Blade", "Devil's Sight"], "needs Warlock level 5"),
        (["Devil's Sight", "Devil's Sight"], "picked twice"),
    ):
        with pytest.raises(ValueError, match=msg):
            levelup_service.apply(
                db,
                pc.id,
                LevelUpChoices(class_choices=[ClassChoicePick(key="invocations", picks=picks)]),
            )
    # A book invocation is recorded by name, with a warning.
    res = levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            class_choices=[
                ClassChoicePick(key="invocations", picks=["Devil's Sight"], book=["Ghostly Gaze"])
            ]
        ),
    )
    assert any("Ghostly Gaze is recorded by name" in w for w in res.warnings)


def test_warlock_3_takes_a_pact_boon(db: Session):
    """Warlock 2 → 3: one Pact Boon, recorded on the sheet; pact slots go to 2nd level."""
    pc, _dm = _pc(
        db,
        CharacterClass.WARLOCK,
        2,
        subclass="The Fiend",
        spells=["Eldritch Blast", "Minor Illusion", "Charm Person", "Hellish Rebuke"],
        feats=["Eldritch Invocation: Agonizing Blast", "Eldritch Invocation: Devil's Sight"],
    )
    plan = levelup_service.plan_for(db, pc.id)
    boon = _step(plan, "pact_boon")
    assert boon.count == 1 and {o.name for o in boon.options} == {
        "Pact of the Chain",
        "Pact of the Blade",
        "Pact of the Tome",
    }
    assert "invocations" not in {s.key for s in plan.class_choices}
    assert plan.slots_after == {"2": 2}
    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            spells=["Scorching Ray"],
            class_choices=[ClassChoicePick(key="pact_boon", picks=["Pact of the Blade"])],
        ),
    )
    sheet = char_svc.CharacterRepo.get_by_id(db, pc.id)
    assert "Pact Boon: Pact of the Blade" in sheet.feats
    assert sheet.spell_slots == {"pact": 2, "level": 2}


def test_warlock_5_adds_one_invocation(db: Session):
    """Warlock 4 → 5: one more invocation (the totals are 2 → 3); taken ones are marked."""
    pc, _dm = _pc(
        db,
        CharacterClass.WARLOCK,
        4,
        subclass="The Fiend",
        spells=["Eldritch Blast", "Minor Illusion", "Mage Hand"],
        feats=[
            "Eldritch Invocation: Agonizing Blast",
            "Eldritch Invocation: Devil's Sight",
            "Pact Boon: Pact of the Blade",
        ],
    )
    plan = levelup_service.plan_for(db, pc.id)
    inv = _step(plan, "invocations")
    assert inv.count == 1  # 2 known at 4, 3 at 5
    assert set(inv.taken) == {"Agonizing Blast", "Devil's Sight"}
    by_name = {o.name: o for o in inv.options}
    assert by_name["Thirsting Blade"].ok  # level 5 and the Pact of the Blade
    assert by_name["Agonizing Blast"].reason == "Already yours."
    with pytest.raises(ValueError, match="already have Agonizing Blast"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                class_choices=[ClassChoicePick(key="invocations", picks=["Agonizing Blast"])]
            ),
        )
    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            class_choices=[ClassChoicePick(key="invocations", picks=["Thirsting Blade"])]
        ),
    )
    assert (
        "Eldritch Invocation: Thirsting Blade" in char_svc.CharacterRepo.get_by_id(db, pc.id).feats
    )


def test_warlock_11_mystic_arcanum_is_a_6th_level_pick(db: Session):
    """Warlock 11: a 6th-level Mystic Arcanum, recorded but not added as a slot spell."""
    pc, dm = _pc(db, CharacterClass.WARLOCK, 10, subclass="The Fiend", spells=["Eldritch Blast"])
    plan = levelup_service.plan_for(db, pc.id)
    arcanum = _step(plan, "mystic_arcanum")
    assert arcanum.kind == "spell" and arcanum.count == 1
    assert arcanum.spells and {s.level for s in arcanum.spells} == {6}
    assert all("Warlock" in s.classes for s in arcanum.spells)
    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(class_choices=[ClassChoicePick(key="mystic_arcanum", picks=["Eyebite"])]),
    )
    assert "Mystic Arcanum: Eyebite" in char_svc.CharacterRepo.get_by_id(db, pc.id).feats
    # Cast once a day with no slot: a note on the sheet, not a spell needing a 6th-level slot.
    assert "Eyebite" not in _sheet_spells(db, pc, dm)


# ── Fighter 3 → 4: the improvement or Grappler ────────────────────────────────


def test_fighter_4_offers_the_improvement_or_grappler(db: Session):
    """Fighter 3 → 4: the improvement or Grappler (STR 13); fighting styles are locked."""
    pc, _dm = _pc(db, CharacterClass.FIGHTER, 3, scores=(13, 14, 14, 10, 10, 8), feats=["Defense"])
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.asi_level
    ok = {f.name for f in plan.feats if f.ok}
    assert ok == {ASI, "Grappler"}
    styles = [f for f in plan.feats if f.category == "fighting_style"]
    assert styles and not any(f.ok for f in styles)
    res = levelup_service.apply(db, pc.id, LevelUpChoices(feat=FeatChoice(name="Grappler")))
    assert "Grappler" in char_svc.CharacterRepo.get_by_id(db, pc.id).feats
    assert res.level == 4


def test_fighter_4_grappler_needs_strength_13(db: Session):
    """Grappler is locked below STR 13; the improvement still works."""
    pc, _dm = _pc(db, CharacterClass.FIGHTER, 3, scores=(12, 14, 14, 10, 10, 8))
    plan = levelup_service.plan_for(db, pc.id)
    grappler = next(f for f in plan.feats if f.name == "Grappler")
    assert not grappler.ok
    levelup_service.apply(db, pc.id, LevelUpChoices(feat=FeatChoice(name=ASI, asi={"STR": 2})))
    assert char_svc.CharacterRepo.get_by_id(db, pc.id).score_str == 14


def test_a_book_feat_is_recorded_by_name(db: Session):
    """A feat from the player's book is recorded by name."""
    pc, _dm = _pc(db, CharacterClass.FIGHTER, 3)
    res = levelup_service.apply(
        db, pc.id, LevelUpChoices(feat=FeatChoice(name="Sentinel", from_book=True))
    )
    assert "Sentinel" in char_svc.CharacterRepo.get_by_id(db, pc.id).feats
    assert any("from your book" in s for s in res.summary)


# ── Sorcerer 2 → 3: Metamagic ─────────────────────────────────────────────────


def test_sorcerer_3_picks_two_metamagic(db: Session):
    """Sorcerer 2 → 3: two Metamagic options and one more known spell."""
    pc, _dm = _pc(
        db,
        CharacterClass.SORCERER,
        2,
        subclass="Draconic Bloodline",
        spells=["Fire Bolt", "Light", "Mage Hand", "Message", "Burning Hands", "Mage Armor"],
        feats=["Dragon Ancestor: Red"],
    )
    plan = levelup_service.plan_for(db, pc.id)
    meta = _step(plan, "metamagic")
    assert meta.count == 2 and len(meta.options) == 8
    assert plan.spellcasting.new_spells == 1  # Spells Known 3 → 4
    assert plan.hp_bonus_per_level == 1  # Draconic Resilience
    with pytest.raises(ValueError, match="Metamagic: choose one more"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                class_choices=[ClassChoicePick(key="metamagic", picks=["Quickened Spell"])]
            ),
        )
    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            spells=["Scorching Ray"],
            class_choices=[
                ClassChoicePick(key="metamagic", picks=["Quickened Spell", "Twinned Spell"])
            ],
        ),
    )
    feats = char_svc.CharacterRepo.get_by_id(db, pc.id).feats
    assert {"Metamagic: Quickened Spell", "Metamagic: Twinned Spell"} <= set(feats)


# ── Wizard 2 → 3: two spellbook spells ────────────────────────────────────────


def test_wizard_3_adds_two_spellbook_spells(db: Session):
    """Wizard 2 → 3: two spellbook spells, prepared only while under INT mod + level."""
    book = ["Fire Bolt", "Light", "Mage Hand", "Magic Missile", "Shield", "Sleep"]
    pc, dm = _pc(
        db,
        CharacterClass.WIZARD,
        2,
        scores=(8, 14, 14, 16, 12, 10),
        subclass="School of Evocation",
        spells=book + ["Mage Armor", "Detect Magic"],
    )
    plan = levelup_service.plan_for(db, pc.id)
    sc = plan.spellcasting
    assert sc.spellbook and sc.prepared_caster
    assert sc.new_spells == 2 and sc.max_spell_level == 2
    assert sc.prepared_count == 6  # INT +3, level 3
    assert "Add two Wizard spells to your spellbook (pick them below)." in plan.scaling
    # Magic Missile is in both catalogs; the plan offers only the 2014 row's spells, once.
    names = [o.name for o in sc.options]
    assert len(names) == len(set(names))
    res = levelup_service.apply(db, pc.id, LevelUpChoices(spells=["Scorching Ray", "Misty Step"]))
    assert "Spellbook: Scorching Ray, Misty Step" in res.summary
    spells = _sheet_spells(db, pc, dm)
    assert {"Scorching Ray", "Misty Step"} <= set(spells)
    # 5 leveled spells were prepared (cap at level 2 was 5); level 3 makes room for one more,
    # so the second new spell waits in the spellbook.
    assert [spells["Scorching Ray"][0], spells["Misty Step"][0]] == [True, False]
    assert all(r == "2014" for _p, r in spells.values())


# ── Bard 2 → 3: Expertise, +1 known spell, College of Lore's skills ───────────


def test_bard_3_expertise_and_one_more_spell(db: Session):
    """Bard 2 → 3: Expertise in two skills, one more spell, College of Lore's three skills."""
    pc, _dm = _pc(
        db,
        CharacterClass.BARD,
        2,
        skills={"Performance": 1, "Persuasion": 1, "Deception": 1},
        spells=["Vicious Mockery", "Mage Hand", "Healing Word", "Charm Person", "Sleep"],
    )
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.needs_subclass and plan.subclass_options == ["College of Lore"]
    exp = _step(plan, "expertise")
    assert exp.count == 2 and exp.subclass is None
    lore = _step(plan, "bonus_proficiencies")
    assert lore.count == 3 and lore.subclass == "College of Lore"
    assert plan.spellcasting.new_spells == 1  # Spells Known 5 → 6
    lore_feats = [f.name for f in plan.new_features if f.subclass == "College of Lore"]
    assert lore_feats == ["Bonus Proficiencies", "Cutting Words"]

    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            subclass="College of Lore",
            spells=["Invisibility"],
            class_choices=[
                ClassChoicePick(key="expertise", picks=["Performance", "Persuasion"]),
                ClassChoicePick(key="bonus_proficiencies", picks=["Arcana", "History", "Nature"]),
            ],
        ),
    )
    sheet = char_svc.CharacterRepo.get_by_id(db, pc.id)
    assert sheet.skill_proficiencies["Performance"] == 2
    assert sheet.skill_proficiencies["Persuasion"] == 2
    assert sheet.skill_proficiencies["Arcana"] == 1


def test_bard_3_from_my_book_skips_lores_choice(db: Session):
    """A book subclass brings no Lore choice; Expertise needs trained skills."""
    pc, _dm = _pc(db, CharacterClass.BARD, 2, skills={"Performance": 1, "Persuasion": 1})
    with pytest.raises(ValueError, match="has no Bonus Proficiencies"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                subclass="College of Valor",
                class_choices=[
                    ClassChoicePick(key="expertise", picks=["Performance", "Persuasion"]),
                    ClassChoicePick(
                        key="bonus_proficiencies", picks=["Arcana", "History", "Nature"]
                    ),
                ],
            ),
        )
    with pytest.raises(ValueError, match="trained in Stealth first"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                subclass="College of Valor",
                class_choices=[ClassChoicePick(key="expertise", picks=["Performance", "Stealth"])],
            ),
        )
    res = levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            subclass="College of Valor",
            class_choices=[ClassChoicePick(key="expertise", picks=["Performance", "Persuasion"])],
        ),
    )
    assert "Subclass: College of Valor" in res.summary


def test_bard_10_magical_secrets_are_the_new_known_spells(db: Session):
    """Bard 9 → 10: the two Magical Secrets are the new known spells, from any list."""
    pc, dm = _pc(
        db,
        CharacterClass.BARD,
        9,
        subclass="College of Lore",
        skills={"Performance": 2, "Persuasion": 2, "Deception": 1, "Insight": 1},
        spells=["Vicious Mockery", "Healing Word"],
    )
    plan = levelup_service.plan_for(db, pc.id)
    secrets = _step(plan, "magical_secrets")
    assert secrets.count == 2 and secrets.kind == "spell"
    assert {"Fireball", "Counterspell"} <= {s.name for s in secrets.spells}
    assert max(s.level for s in secrets.spells) == 5
    assert plan.spellcasting.new_spells == 0  # Spells Known 12 → 14: the two secrets
    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            cantrips=["Light"],
            class_choices=[
                ClassChoicePick(key="expertise", picks=["Deception", "Insight"]),
                ClassChoicePick(key="magical_secrets", picks=["Fireball", "Counterspell"]),
            ],
        ),
    )
    spells = _sheet_spells(db, pc, dm)
    assert {"Fireball", "Counterspell", "Light"} <= set(spells)
    feats = char_svc.CharacterRepo.get_by_id(db, pc.id).feats
    assert "Magical Secrets: Fireball" in feats


# ── Cleric (Life) 2 → 3: domain spells always prepared ────────────────────────


def test_life_cleric_3_domain_spells_always_prepared(db: Session):
    """Life Domain 2 → 3: Lesser Restoration and Spiritual Weapon become always prepared."""
    pc, dm = _pc(
        db,
        CharacterClass.CLERIC,
        2,
        scores=(10, 10, 14, 10, 16, 12),
        subclass="Life Domain",
        spells=["Sacred Flame", "Guidance", "Light", "Bless", "Cure Wounds", "Guiding Bolt"],
    )
    plan = levelup_service.plan_for(db, pc.id)
    sc = plan.spellcasting
    assert [g.name for g in sc.always_prepared] == ["Lesser Restoration", "Spiritual Weapon"]
    assert sc.always_prepared[0].source == "Life Domain"
    assert sc.prepared_count == 6 and sc.new_spells == 1  # WIS +3 + level 3
    assert "Lesser Restoration" not in {o.name for o in sc.options}
    assert plan.slots_after == {"1": 4, "2": 2}
    res = levelup_service.apply(db, pc.id, LevelUpChoices(spells=["Aid"]))
    assert "Always prepared: Lesser Restoration, Spiritual Weapon" in res.summary
    spells = _sheet_spells(db, pc, dm)
    assert spells["Lesser Restoration"][0] and spells["Spiritual Weapon"][0]
    assert spells["Aid"][0]


def test_a_loosely_typed_subclass_still_counts(db: Session):
    """A DM who typed "Life" gets the Life Domain's spells, features and free preparing."""
    pc, dm = _pc(db, CharacterClass.CLERIC, 2, scores=(10, 10, 14, 10, 12, 12), subclass="Life")
    plan = levelup_service.plan_for(db, pc.id)
    assert [g.name for g in plan.spellcasting.always_prepared] == [
        "Lesser Restoration",
        "Spiritual Weapon",
    ]
    levelup_service.apply(db, pc.id, LevelUpChoices())
    rows = spellcasting_service.list_known_for_character(db, pc.id, dm)
    res = player_service.set_spell_prepared(db, pc.id, rows[0].id, True)
    assert res["count"] == 0  # both are always prepared: nothing counts against the 4


def test_devotion_paladin_3_oath_spells_come_with_the_oath(db: Session):
    """Choosing Oath of Devotion at 3 adds its oath spells."""
    pc, dm = _pc(
        db,
        CharacterClass.PALADIN,
        2,
        scores=(16, 10, 14, 8, 10, 16),
        feats=["Defense"],
        spells=["Bless", "Cure Wounds"],
    )
    plan = levelup_service.plan_for(db, pc.id)
    oath = [g for g in plan.spellcasting.always_prepared if g.subclass == "Oath of Devotion"]
    assert [g.name for g in oath] == ["Protection from Evil and Good", "Sanctuary"]
    levelup_service.apply(db, pc.id, LevelUpChoices(subclass="Oath of Devotion"))
    assert {"Protection from Evil and Good", "Sanctuary"} <= set(_sheet_spells(db, pc, dm))


def test_land_druid_picks_a_land_and_its_cantrip(db: Session):
    """Druid 2 (Land): the land and its Bonus Cantrip; Druid 3 gets the land's spells."""
    pc, dm = _pc(
        db,
        CharacterClass.DRUID,
        1,
        scores=(10, 12, 14, 10, 16, 10),
        spells=["Druidcraft", "Guidance", "Goodberry", "Entangle"],
    )
    plan = levelup_service.plan_for(db, pc.id)
    land = _step(plan, "land")
    assert land.subclass == "Circle of the Land" and land.cantrips == 1
    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            subclass="Circle of the Land",
            cantrips=["Shillelagh"],
            spells=["Faerie Fire"],
            class_choices=[ClassChoicePick(key="land", picks=["Forest"])],
        ),
    )
    sheet = char_svc.CharacterRepo.get_by_id(db, pc.id)
    assert "Circle of the Land: Forest" in sheet.feats
    assert "Shillelagh" in _sheet_spells(db, pc, dm)
    # Druid 3: the Forest's circle spells.
    levelup_service.grant(db, pc.id, dm)
    plan3 = levelup_service.plan_for(db, pc.id)
    assert [g.name for g in plan3.spellcasting.always_prepared] == ["Barkskin", "Spider Climb"]


# ── Improvement levels: Rogue 10, any class at 19 ─────────────────────────────


def test_rogue_10_is_an_improvement_level(db: Session):
    """Rogue 10 is a 2014 improvement level."""
    pc, _dm = _pc(db, CharacterClass.ROGUE, 9, skills={"Stealth": 2, "Perception": 2})
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.asi_level
    levelup_service.apply(db, pc.id, LevelUpChoices(feat=FeatChoice(name=ASI, asi={"DEX": 2})))
    assert char_svc.CharacterRepo.get_by_id(db, pc.id).score_dex == 16


def test_level_19_is_an_improvement_not_an_epic_boon(db: Session):
    """Level 19 is an improvement in 2014, never an Epic Boon."""
    pc, _dm = _pc(db, CharacterClass.BARBARIAN, 18, subclass="Path of the Berserker")
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.asi_level
    assert "Ability Score Improvement" in [f.name for f in plan.new_features]
    assert "Epic Boon" not in [f.name for f in plan.new_features]
    assert {f.category for f in plan.feats} <= {"general", "fighting_style"}
    levelup_service.apply(db, pc.id, LevelUpChoices(feat=FeatChoice(name=ASI, asi={"STR": 2})))


def test_2014_subclass_features_replace_the_marker(db: Session):
    """An SRD subclass's own features replace the "Subclass feature" marker."""
    pc, _dm = _pc(db, CharacterClass.FIGHTER, 9, subclass="Champion", feats=["Defense"])
    plan = levelup_service.plan_for(db, pc.id)
    names = [f.name for f in plan.new_features]
    assert "Additional Fighting Style" in names and "Subclass feature" not in names
    style = _step(plan, "fighting_style")
    assert style.count == 1
    defense = next(o for o in style.options if o.name == "Defense")
    assert defense.reason == "Already yours."
    with pytest.raises(ValueError, match="already have Defense"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                class_choices=[ClassChoicePick(key="fighting_style", picks=["Defense"])]
            ),
        )


def test_hill_dwarf_gets_its_hit_point(db: Session):
    """Dwarven Toughness adds 1 hit point per level for a Hill Dwarf."""
    pc, _dm = _pc(db, CharacterClass.FIGHTER, 1, race="Hill Dwarf", feats=["Defense"])
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.hp_bonus_per_level == 1
    assert plan.hp_average_gain == 6 + 2 + 1  # d10 average, CON +2, Dwarven Toughness


# ── Daily preparing, the feature listing, 2024 untouched ──────────────────────


def test_2014_ranger_is_not_a_daily_preparer(db: Session):
    """A 2014 Ranger can't prepare after a rest; a 2024 Ranger still can."""
    pc, _dm = _pc(db, CharacterClass.RANGER, 2, spells=["Cure Wounds"], prepared=False)
    row = spellcasting_service.list_known_for_character(db, pc.id, _dm)[0]
    with pytest.raises(ValueError, match="when they level up"):
        player_service.set_spell_prepared(db, pc.id, row.id, True)
    pc24, dm24 = _pc(
        db, CharacterClass.RANGER, 2, ruleset="2024", spells=["Cure Wounds"], prepared=False
    )
    row24 = spellcasting_service.list_known_for_character(db, pc24.id, dm24)[0]
    assert player_service.set_spell_prepared(db, pc24.id, row24.id, True)["prepared"]


def test_2014_prepared_cap_uses_the_ability_modifier(db: Session):
    """The 2014 prepared cap is the ability modifier + level."""
    pc, dm = _pc(
        db,
        CharacterClass.CLERIC,
        1,
        scores=(10, 10, 14, 10, 16, 12),
        subclass="Life Domain",
        spells=["Command", "Sanctuary", "Guiding Bolt", "Healing Word", "Bane"],
        prepared=False,
    )
    rows = spellcasting_service.list_known_for_character(db, pc.id, dm)
    out = [player_service.set_spell_prepared(db, pc.id, r.id, True) for r in rows[:4]]
    assert out[-1]["cap"] == 4  # WIS +3 + level 1
    with pytest.raises(ValueError, match="You can have 4 spells prepared"):
        player_service.set_spell_prepared(db, pc.id, rows[4].id, True)


def test_2014_domain_spells_do_not_count_against_the_cap(db: Session):
    """Domain spells are free: they don't count against the prepared cap."""
    pc, dm = _pc(
        db,
        CharacterClass.CLERIC,
        1,
        scores=(10, 10, 14, 10, 12, 12),
        subclass="Life Domain",
        spells=["Bless", "Cure Wounds"],  # the Life Domain's, always prepared
    )
    extra = SpellRepo.get_by_name(db, "Guiding Bolt", ruleset="2014")
    row = spellcasting_service.learn_spell(
        db, pc.id, CharacterSpellCreate(spell_id=extra.id, known=True, prepared=False), dm
    )
    res = player_service.set_spell_prepared(db, pc.id, row.id, True)
    assert res["cap"] == 2 and res["count"] == 1  # WIS +1 + level 1; Bless/Cure Wounds free


def test_2014_feature_listing_uses_2014_names(db: Session):
    """The 2014 feature listing uses SRD 5.1 names and quotes this level's numbers."""
    monk, _ = _pc(db, CharacterClass.MONK, 6, subclass="Way of the Open Hand")
    names = [f["name"] for f in feature_service.class_features_of(monk)]
    assert "Ki" in names and "Monk's Focus" not in names
    assert "Wholeness of Body" in names and "Open Hand Technique" in names
    assert "Ability Score Improvement" not in names
    ki = next(f for f in feature_service.class_features_of(monk) if f["name"] == "Ki")
    assert "Ki points 6" in ki["note"]

    sorc, _ = _pc(db, CharacterClass.SORCERER, 2, subclass="Draconic Bloodline")
    sorc_names = [f["name"] for f in feature_service.class_features_of(sorc)]
    assert "Sorcery Points (Font of Magic)" in sorc_names
    assert "Dragon Ancestor" in sorc_names and "Innate Sorcery" not in sorc_names

    fighter, _ = _pc(db, CharacterClass.FIGHTER, 17, subclass="Champion")
    f_names = [f["name"] for f in feature_service.class_features_of(fighter)]
    assert "Two Extra Attacks" in f_names and "Extra Attack" not in f_names
    assert "Indomitable (three uses)" not in f_names
    indomitable = next(
        f for f in feature_service.class_features_of(fighter) if f["name"] == "Indomitable"
    )
    assert "Indomitable uses 3" in indomitable["note"]

    unnamed, _ = _pc(db, CharacterClass.ROGUE, 3)
    pick = next(
        f for f in feature_service.class_features_of(unnamed) if f["name"] == "Rogue Subclass"
    )
    assert pick["source"] == "class"


def test_2014_listing_names_match_the_tracked_rows(db: Session):
    """Every tracked 2014 row has a listing line FeaturePanel can pair it with."""
    from integrations.dnd_rules.class_features_2014 import CLASS_FEATURES_2014

    def same(name: str) -> str:
        return name.lower().split(" (")[0].split(" — ")[0].strip()

    subclasses = {
        "Druid": "Circle of the Land",
        "Monk": "Way of the Open Hand",
        "Paladin": "Oath of Devotion",
        "Warlock": "The Fiend",
        "Wizard": "School of Evocation",
    }
    for row in CLASS_FEATURES_2014:
        cls = row.character_class
        pc, _ = _pc(db, cls, 20, subclass=subclasses.get(cls.value))
        listed = {same(f["name"]) for f in feature_service.class_features_of(pc)}
        assert same(row.name) in listed, (cls.value, row.name)


def test_2024_plan_says_2024_and_asks_its_own_choices(db: Session):
    """A 2024 plan follows the 2024 tables (Plan 134): Warlock 1 → 2 picks two invocations."""
    pc, _dm = _pc(db, CharacterClass.WARLOCK, 1, ruleset="2024", spells=["Eldritch Blast"])
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.ruleset == Ruleset.R2024
    assert [(s.key, s.count) for s in plan.class_choices] == [("invocations", 2)]
    assert plan.spellcasting.prepared_count is None and not plan.spellcasting.always_prepared
    assert all(f.subclass is None for f in plan.new_features)
    with pytest.raises(ValueError, match="Eldritch Invocations: choose one more"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                class_choices=[ClassChoicePick(key="invocations", picks=["Agonizing Blast"])]
            ),
        )
    # 2024 catalog lookups keep to 2024 rows too.
    assert all(
        SpellRepo.get_by_name(db, o.name, ruleset="2024") is not None
        for o in plan.spellcasting.options
    )
    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            class_choices=[
                ClassChoicePick(key="invocations", picks=["Agonizing Blast", "Devil's Sight"])
            ]
        ),
    )
