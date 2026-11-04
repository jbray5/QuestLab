"""Plan 134 — a 2024 PC's level-up asks the class's later choices and adds the spells that
become always prepared (TD-131i, TD-131j).

The counts are the 2024 tables' running totals at the new level minus at the old one, as the
2024 creator reads them: Eldritch Invocations 3 → 5 at Warlock 5, Expertise 2 → 4 at Rogue 6,
Metamagic 2 → 4 at Sorcerer 10, Weapon Mastery 3 → 4 at Fighter 4. The picks are checked and
recorded the way the creator records them, so a Warlock built at 5 and one levelled 1 → 5 end
with the same invocations and spells.

The tests run on their own in-memory database with both editions' SRD spells seeded, as
production has them.
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
from domain.character import CharacterSpellCreate, PlayerCharacterUpdate
from domain.character_builder import CharacterBuild
from domain.enums import CharacterClass
from domain.level_up import ClassChoicePick, FeatChoice, LevelUpChoices
from services import character_builder_service as builder
from services import levelup_service, spellcasting_service

ASI = "Ability Score Improvement"
INV = "Eldritch Invocation: "


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


def _dm() -> str:
    """A fresh DM email."""
    return f"dm134_{uuid.uuid4().hex[:8]}@example.com"


def _pc(
    db: Session,
    cls: CharacterClass,
    level: int,
    *,
    scores=(10, 14, 14, 10, 14, 16),
    subclass=None,
    feats=None,
    skills=None,
    spells=(),
):
    """A 2024 PC in a fresh campaign, knowing ``spells`` (prepared), with a level granted."""
    dm = _dm()
    campaign = camp_svc.create_campaign(db, name="New Rules", dm_email=dm, ruleset="2024")
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Hero",
        race="Human",
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
        spell = SpellRepo.get_by_name(db, name, ruleset="2024")
        assert spell is not None, name
        spellcasting_service.learn_spell(
            db, pc.id, CharacterSpellCreate(spell_id=spell.id, known=True, prepared=True), dm
        )
    levelup_service.grant(db, pc.id, dm)
    return pc, dm


def _step(plan, key):
    """The plan's class choice with this key."""
    return next(s for s in plan.class_choices if s.key == key)


def _pick(key: str, *picks: str, book=()) -> ClassChoicePick:
    """One class choice's picks."""
    return ClassChoicePick(key=key, picks=list(picks), book=list(book))


def _feats(db: Session, pc) -> list[str]:
    """The sheet's feats as stored."""
    return list(char_svc.CharacterRepo.get_by_id(db, pc.id).feats or [])


def _sheet_spells(db: Session, pc, dm: str) -> dict[str, bool]:
    """{spell name: prepared} for every spell on the sheet."""
    out = {}
    for row in spellcasting_service.list_known_for_character(db, pc.id, dm):
        out[SpellRepo.get_by_id(db, row.spell_id).name] = row.prepared
    return out


def _jump_to(db: Session, pc, dm: str, level: int) -> None:
    """The DM sets the PC's level directly, then grants the next one."""
    char_svc.update_character(db, pc.id, dm, PlayerCharacterUpdate(level=level, pending_level=None))
    levelup_service.grant(db, pc.id, dm)


# ── Warlock 4 → 5: two more invocations (3 → 5), the Fiend's 5th-level spells ──────


_WARLOCK_4 = dict(
    subclass="Fiend Patron",
    feats=[f"{INV}Armor of Shadows", f"{INV}Agonizing Blast", f"{INV}Pact of the Blade"],
    spells=["Eldritch Blast", "Minor Illusion", "Mage Hand", "Hex"],
)


def test_warlock_5_is_asked_its_new_invocations(db: Session):
    """Warlock 4 → 5: the table's 3 → 5 is two new picks, checked against the sheet."""
    pc, dm = _pc(db, CharacterClass.WARLOCK, 4, **_WARLOCK_4)
    plan = levelup_service.plan_for(db, pc.id)
    inv = _step(plan, "invocations")
    assert inv.count == 2 and inv.kind == "option" and inv.book and inv.subclass is None
    assert set(inv.taken) == {"Armor of Shadows", "Agonizing Blast", "Pact of the Blade"}
    by_name = {o.name: o for o in inv.options}
    assert by_name["Pact of the Blade"].reason == "Already yours."
    assert by_name["Thirsting Blade"].ok  # Pact of the Blade is on the sheet; level 5 now
    assert by_name["Devouring Blade"].reason == "Needs Warlock level 12."
    assert by_name["Gift of the Protectors"].reason == "Needs Warlock level 9."
    assert [s.key for s in plan.class_choices] == ["invocations"]

    res = levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            spells=["Counterspell"],
            class_choices=[_pick("invocations", "Thirsting Blade", "Eldritch Mind")],
        ),
    )
    assert "Eldritch Invocations: Thirsting Blade, Eldritch Mind" in res.summary
    feats = _feats(db, pc)
    assert f"{INV}Thirsting Blade" in feats and f"{INV}Eldritch Mind" in feats
    assert sum(f.startswith(INV) for f in feats) == 5


def test_warlock_5_gets_the_fiend_spells_learned_and_prepared(db: Session):
    """The Fiend Patron's 5th-level spells arrive always prepared, and no pick may take them."""
    pc, dm = _pc(db, CharacterClass.WARLOCK, 4, **_WARLOCK_4)
    sc = levelup_service.plan_for(db, pc.id).spellcasting
    assert [(g.name, g.source) for g in sc.always_prepared] == [
        ("Fireball", "Fiend Patron"),
        ("Stinking Cloud", "Fiend Patron"),
    ]
    assert "Fireball" not in {o.name for o in sc.options}
    res = levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(class_choices=[_pick("invocations", "Eldritch Mind", "Misty Visions")]),
    )
    assert "Always prepared: Fireball, Stinking Cloud" in res.summary
    spells = _sheet_spells(db, pc, dm)
    assert spells["Fireball"] is True and spells["Stinking Cloud"] is True


def test_warlock_invocation_refusals_are_plain(db: Session):
    """Missing, extra, unknown, repeated, locked and unasked picks are refused in plain words."""
    pc, _dm_ = _pc(db, CharacterClass.WARLOCK, 4, **_WARLOCK_4)

    def apply(*picks, key="invocations", book=()):
        return levelup_service.apply(
            db, pc.id, LevelUpChoices(class_choices=[_pick(key, *picks, book=book)])
        )

    with pytest.raises(ValueError, match="Eldritch Invocations: choose 2."):
        levelup_service.apply(db, pc.id, LevelUpChoices())
    with pytest.raises(ValueError, match="Eldritch Invocations: choose one more."):
        apply("Eldritch Mind")
    with pytest.raises(ValueError, match="you choose 2 at level 5"):
        apply("Eldritch Mind", "Misty Visions", "Devil's Sight")
    with pytest.raises(ValueError, match="you already have Agonizing Blast"):
        apply("Agonizing Blast", "Eldritch Mind")
    with pytest.raises(ValueError, match="Devouring Blade needs Warlock level 12"):
        apply("Devouring Blade", "Eldritch Mind")
    with pytest.raises(ValueError, match="Moon Beam isn't one of the choices"):
        apply("Moon Beam", "Eldritch Mind")
    with pytest.raises(ValueError, match="Eldritch Mind is picked twice"):
        apply("Eldritch Mind", "Eldritch Mind")
    with pytest.raises(ValueError, match="A level 5 Warlock has no Metamagic to choose"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                class_choices=[
                    _pick("invocations", "Eldritch Mind", "Misty Visions"),
                    _pick("metamagic", "Twinned Spell"),
                ]
            ),
        )
    # A book invocation is recorded by name, with a note to play it from the book.
    res = apply("Eldritch Mind", book=["Tomb of Levistus"])
    assert any("Tomb of Levistus is recorded by name" in w for w in res.warnings)
    assert f"{INV}Tomb of Levistus" in _feats(db, pc)


def test_invocation_prerequisites_read_the_sheet(db: Session):
    """Thirsting Blade needs Pact of the Blade (on the sheet or picked now); Agonizing Blast
    needs a damaging cantrip; Lessons of the First Ones may be taken again."""
    pc, _dm_ = _pc(
        db,
        CharacterClass.WARLOCK,
        4,
        feats=[
            f"{INV}Armor of Shadows",
            f"{INV}Lessons of the First Ones",
            f"{INV}Mask of Many Faces",
        ],
        spells=["Minor Illusion", "Mage Hand", "Prestidigitation", "Hex"],  # no damaging cantrip
    )
    inv = _step(levelup_service.plan_for(db, pc.id), "invocations")
    by_name = {o.name: o for o in inv.options}
    assert by_name["Thirsting Blade"].reason == "Needs Pact of the Blade."
    assert by_name["Agonizing Blast"].reason == "Needs a Warlock cantrip that deals damage."
    assert by_name["Repelling Blast"].ok is False
    assert by_name["Lessons of the First Ones"].ok  # repeatable
    with pytest.raises(ValueError, match="Thirsting Blade needs Pact of the Blade"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                class_choices=[_pick("invocations", "Thirsting Blade", "Eldritch Mind")]
            ),
        )
    with pytest.raises(ValueError, match="needs a Warlock cantrip that deals damage"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                class_choices=[_pick("invocations", "Agonizing Blast", "Eldritch Mind")]
            ),
        )
    # Pact of the Blade picked in the same step opens Thirsting Blade.
    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            class_choices=[_pick("invocations", "Pact of the Blade", "Thirsting Blade")]
        ),
    )
    assert {f"{INV}Pact of the Blade", f"{INV}Thirsting Blade"} <= set(_feats(db, pc))


def test_lessons_of_the_first_ones_can_be_taken_twice(db: Session):
    """A repeatable invocation already on the sheet is accepted again."""
    pc, _dm_ = _pc(
        db,
        CharacterClass.WARLOCK,
        4,
        feats=[f"{INV}Armor of Shadows", f"{INV}Lessons of the First Ones", f"{INV}Eldritch Mind"],
        spells=["Eldritch Blast"],
    )
    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            class_choices=[_pick("invocations", "Lessons of the First Ones", "Misty Visions")]
        ),
    )
    assert _feats(db, pc).count(f"{INV}Lessons of the First Ones") == 2


# ── Rogue 5 → 6: two Expertise ────────────────────────────────────────────────


_ROGUE_SKILLS = {"Stealth": 2, "Perception": 2, "Acrobatics": 1, "Insight": 1, "Athletics": 1}


def test_rogue_6_is_asked_two_expertise(db: Session):
    """Rogue 5 → 6: Expertise 2 → 4 is two skills the Rogue is trained in."""
    pc, _dm_ = _pc(db, CharacterClass.ROGUE, 5, subclass="Thief", skills=dict(_ROGUE_SKILLS))
    plan = levelup_service.plan_for(db, pc.id)
    exp = _step(plan, "expertise")
    assert exp.count == 2 and exp.kind == "expertise" and exp.skills is None
    assert "weapon_mastery" not in {s.key for s in plan.class_choices}  # 2 → 2
    res = levelup_service.apply(
        db, pc.id, LevelUpChoices(class_choices=[_pick("expertise", "Acrobatics", "Insight")])
    )
    assert "Expertise: Acrobatics, Insight" in res.summary
    sheet = char_svc.CharacterRepo.get_by_id(db, pc.id)
    assert sheet.skill_proficiencies["Acrobatics"] == 2
    assert sheet.skill_proficiencies["Insight"] == 2
    assert sheet.skill_proficiencies["Athletics"] == 1


def test_rogue_expertise_refusals(db: Session):
    """Expertise must be in a trained skill that isn't expert yet, and exactly two."""
    pc, _dm_ = _pc(db, CharacterClass.ROGUE, 5, subclass="Thief", skills=dict(_ROGUE_SKILLS))

    def apply(*picks):
        return levelup_service.apply(
            db, pc.id, LevelUpChoices(class_choices=[_pick("expertise", *picks)])
        )

    with pytest.raises(ValueError, match="Expertise: choose 2."):
        levelup_service.apply(db, pc.id, LevelUpChoices())
    with pytest.raises(ValueError, match="Expertise: choose one more."):
        apply("Acrobatics")
    with pytest.raises(ValueError, match="already have expertise in Stealth"):
        apply("Stealth", "Acrobatics")
    with pytest.raises(ValueError, match="need to be trained in Arcana first"):
        apply("Arcana", "Acrobatics")
    with pytest.raises(ValueError, match="Lockpicking isn't a skill"):
        apply("Lockpicking", "Acrobatics")


# ── Sorcerer 9 → 10: two more Metamagic (2 → 4) ───────────────────────────────


def test_sorcerer_10_is_asked_more_metamagic(db: Session):
    """Sorcerer 9 → 10: Metamagic 2 → 4, from the list or the player's book."""
    pc, _dm_ = _pc(
        db,
        CharacterClass.SORCERER,
        9,
        subclass="Draconic Sorcery",
        feats=["Metamagic: Quickened Spell", "Metamagic: Twinned Spell"],
    )
    meta = _step(levelup_service.plan_for(db, pc.id), "metamagic")
    assert meta.count == 2 and meta.book
    assert set(meta.taken) == {"Quickened Spell", "Twinned Spell"}
    assert {o.name for o in meta.options if o.reason == "Already yours."} == {
        "Quickened Spell",
        "Twinned Spell",
    }
    with pytest.raises(ValueError, match="you already have Twinned Spell"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(class_choices=[_pick("metamagic", "Twinned Spell", "Subtle Spell")]),
        )
    res = levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(class_choices=[_pick("metamagic", "Subtle Spell", book=["Aimed Spell"])]),
    )
    assert "Metamagic: Subtle Spell, Aimed Spell" in res.summary
    assert {"Metamagic: Subtle Spell", "Metamagic: Aimed Spell"} <= set(_feats(db, pc))


# ── Weapon Mastery count increases ────────────────────────────────────────────


def test_fighter_4_masters_one_more_weapon(db: Session):
    """Fighter 3 → 4: Weapon Mastery 3 → 4, one more weapon, recorded as the creator does."""
    pc, _dm_ = _pc(
        db,
        CharacterClass.FIGHTER,
        3,
        scores=(16, 12, 14, 10, 12, 8),
        subclass="Champion",
        feats=[
            "Defense",
            "Weapon Mastery: Longsword",
            "Weapon Mastery: Javelin",
            "Weapon Mastery: Greatsword",
        ],
    )
    plan = levelup_service.plan_for(db, pc.id)
    wm = _step(plan, "weapon_mastery")
    assert wm.count == 1 and wm.kind == "weapon" and not wm.book
    assert set(wm.taken) == {"Longsword", "Javelin", "Greatsword"}
    by_name = {o.name: o for o in wm.options}
    assert by_name["Longsword"].reason == "Already yours."
    assert (by_name["Battleaxe"].blurb, by_name["Battleaxe"].category) == (
        "Topple",
        "Martial Melee",
    )
    assert by_name["Longbow"].ok  # a Fighter masters any kind
    assert "fighting_style" not in {s.key for s in plan.class_choices}  # 1 → 1 until 7

    asi = FeatChoice(name=ASI, asi={"STR": 2})
    with pytest.raises(ValueError, match="Weapon Mastery: choose one."):
        levelup_service.apply(db, pc.id, LevelUpChoices(feat=asi))
    with pytest.raises(ValueError, match="you already have Longsword"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(feat=asi, class_choices=[_pick("weapon_mastery", "Longsword")]),
        )
    with pytest.raises(ValueError, match="Frying Pan isn't a weapon with a mastery property"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(feat=asi, class_choices=[_pick("weapon_mastery", "Frying Pan")]),
        )
    res = levelup_service.apply(
        db, pc.id, LevelUpChoices(feat=asi, class_choices=[_pick("weapon_mastery", "battleaxe")])
    )
    assert "Weapon Mastery: Battleaxe" in res.summary
    assert "Weapon Mastery: Battleaxe" in _feats(db, pc)


def test_barbarian_mastery_keeps_to_melee(db: Session):
    """Barbarian 3 → 4: one more mastery, melee only (the creator's filter)."""
    pc, _dm_ = _pc(
        db,
        CharacterClass.BARBARIAN,
        3,
        scores=(16, 12, 14, 10, 12, 8),
        subclass="Berserker",
        feats=["Weapon Mastery: Greataxe", "Weapon Mastery: Handaxe"],
        skills={"Athletics": 1, "Perception": 1, "Survival": 1},
    )
    wm = _step(levelup_service.plan_for(db, pc.id), "weapon_mastery")
    names = {o.name for o in wm.options}
    assert wm.count == 1 and "Maul" in names and "Longbow" not in names
    with pytest.raises(ValueError, match="a Barbarian can't master the Longbow"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                feat=FeatChoice(name=ASI, asi={"STR": 2}),
                class_choices=[_pick("weapon_mastery", "Longbow")],
            ),
        )


# ── Always prepared: the Life Domain at 3 and 5 ───────────────────────────────


_CLERIC_2 = dict(
    scores=(10, 10, 14, 10, 16, 12),
    spells=[
        "Sacred Flame",
        "Guidance",
        "Thaumaturgy",
        "Guiding Bolt",
        "Healing Word",
        "Command",
        "Sanctuary",
        "Shield of Faith",
    ],
)
_LIFE_3 = ["Aid", "Bless", "Cure Wounds", "Lesser Restoration"]


def test_life_cleric_3_and_5_domain_spells_learned_and_prepared(db: Session):
    """Life Domain 2 → 3: its four domain spells; 4 → 5: Mass Healing Word and Revivify."""
    pc, dm = _pc(db, CharacterClass.CLERIC, 2, subclass="Life Domain", **_CLERIC_2)
    sc = levelup_service.plan_for(db, pc.id).spellcasting
    assert [g.name for g in sc.always_prepared] == _LIFE_3
    assert {g.source for g in sc.always_prepared} == {"Life Domain"}
    assert sc.new_spells == 1  # the 2024 prepared number 5 → 6; the domain's are on top
    assert not set(_LIFE_3) & {o.name for o in sc.options}

    res = levelup_service.apply(db, pc.id, LevelUpChoices(spells=["Spiritual Weapon"]))
    assert "Always prepared: Aid, Bless, Cure Wounds, Lesser Restoration" in res.summary
    spells = _sheet_spells(db, pc, dm)
    assert all(spells[n] is True for n in _LIFE_3 + ["Spiritual Weapon"])

    _jump_to(db, pc, dm, 4)
    sc5 = levelup_service.plan_for(db, pc.id).spellcasting
    assert [g.name for g in sc5.always_prepared] == ["Mass Healing Word", "Revivify"]
    res5 = levelup_service.apply(db, pc.id, LevelUpChoices())
    assert "Always prepared: Mass Healing Word, Revivify" in res5.summary
    spells5 = _sheet_spells(db, pc, dm)
    assert spells5["Mass Healing Word"] is True and spells5["Revivify"] is True


def test_domain_spells_come_with_the_domain_picked_now(db: Session):
    """A Cleric picking the Life Domain at 3 gets its spells; a book domain doesn't."""
    pc, dm = _pc(db, CharacterClass.CLERIC, 2, **_CLERIC_2)
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.needs_subclass
    tagged = [(g.name, g.subclass) for g in plan.spellcasting.always_prepared]
    assert tagged == [(n, "Life Domain") for n in _LIFE_3]
    res = levelup_service.apply(db, pc.id, LevelUpChoices(subclass="Life Domain"))
    assert "Always prepared: Aid, Bless, Cure Wounds, Lesser Restoration" in res.summary
    assert set(_LIFE_3) <= set(_sheet_spells(db, pc, dm))

    other, odm = _pc(db, CharacterClass.CLERIC, 2, **_CLERIC_2)
    res = levelup_service.apply(db, other.id, LevelUpChoices(subclass="Light Domain"))
    assert not any(s.startswith("Always prepared") for s in res.summary)
    assert not set(_LIFE_3) & set(_sheet_spells(db, other, odm))


# ── Subclass choices picked now, the land's circle spells ─────────────────────


def test_hunter_picked_now_brings_hunters_prey(db: Session):
    """Ranger 2 → 3: Hunter's Prey comes only with the Hunter, tagged with it."""
    spells = ["Hunter's Mark", "Cure Wounds", "Goodberry"]
    pc, _dm_ = _pc(db, CharacterClass.RANGER, 2, scores=(10, 16, 14, 10, 14, 8), spells=spells)
    prey = _step(levelup_service.plan_for(db, pc.id), "hunters_prey")
    assert prey.subclass == "Hunter" and prey.count == 1
    levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(subclass="Hunter", class_choices=[_pick("hunters_prey", "Colossus Slayer")]),
    )
    assert "Hunter's Prey: Colossus Slayer" in _feats(db, pc)

    other, _odm = _pc(db, CharacterClass.RANGER, 2, scores=(10, 16, 14, 10, 14, 8), spells=spells)
    with pytest.raises(ValueError, match="No class choices to make at level 3"):
        levelup_service.apply(
            db,
            other.id,
            LevelUpChoices(
                subclass="Gloom Stalker",
                class_choices=[_pick("hunters_prey", "Colossus Slayer")],
            ),
        )
    levelup_service.apply(db, other.id, LevelUpChoices(subclass="Gloom Stalker"))


_DRUID_2 = dict(
    scores=(10, 12, 14, 10, 16, 10),
    spells=["Druidcraft", "Produce Flame", "Goodberry", "Entangle", "Thunderwave"],
)


def test_land_picked_at_3_brings_its_circle_spells(db: Session):
    """Druid 2 → 3: the land picked with the Circle of the Land sets its spells right away."""
    pc, dm = _pc(db, CharacterClass.DRUID, 2, **_DRUID_2)
    land = _step(levelup_service.plan_for(db, pc.id), "land")
    assert land.subclass == "Circle of the Land" and land.count == 1
    res = levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            subclass="Circle of the Land",
            spells=["Moonbeam"],
            class_choices=[_pick("land", "Arid")],
        ),
    )
    assert "Circle of the Land: Arid" in _feats(db, pc)
    assert "Always prepared: Blur, Burning Hands, Fire Bolt" in res.summary
    spells = _sheet_spells(db, pc, dm)
    assert spells["Blur"] is True and spells["Burning Hands"] and spells["Fire Bolt"]

    _jump_to(db, pc, dm, 4)
    always = levelup_service.plan_for(db, pc.id).spellcasting.always_prepared
    assert [(g.name, g.source) for g in always] == [("Fireball", "Circle of the Land (Arid)")]


def test_a_pick_the_new_land_makes_always_prepared_is_refused(db: Session):
    """Fog Cloud picked as a new spell while Polar makes it always prepared: pick another."""
    pc, _dm_ = _pc(db, CharacterClass.DRUID, 2, **_DRUID_2)
    with pytest.raises(ValueError, match="Fog Cloud is always prepared for you"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                subclass="Circle of the Land",
                spells=["Fog Cloud"],
                class_choices=[_pick("land", "Polar")],
            ),
        )


# ── Paladin 1 → 2: Fighting Style (Blessed Warrior's cantrips), Divine Smite ───


def test_paladin_2_fighting_style_and_divine_smite(db: Session):
    """Paladin 1 → 2: a Fighting Style feat, and Divine Smite always prepared."""
    pc, dm = _pc(
        db, CharacterClass.PALADIN, 1, scores=(16, 10, 14, 8, 10, 14), spells=["Bless", "Heroism"]
    )
    plan = levelup_service.plan_for(db, pc.id)
    style = _step(plan, "fighting_style")
    assert style.kind == "feat" and style.count == 1
    blessed = next(o for o in style.options if o.name == "Blessed Warrior")
    assert (blessed.cantrips, blessed.cantrip_list) == (2, "Cleric")
    assert all(o.cantrips == 0 for o in style.options if o.name != "Blessed Warrior")
    sc = plan.spellcasting
    assert [(g.name, g.source) for g in sc.always_prepared] == [("Divine Smite", "Paladin's Smite")]
    assert {"Sacred Flame", "Guidance"} <= {c.name for c in sc.choice_cantrips}
    assert not any(o.level == 0 for o in sc.options)
    with pytest.raises(ValueError, match="Fighting Style: choose one."):
        levelup_service.apply(db, pc.id, LevelUpChoices())
    res = levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            spells=["Shield of Faith"], class_choices=[_pick("fighting_style", "Defense")]
        ),
    )
    assert "Defense" in _feats(db, pc)
    assert "Always prepared: Divine Smite" in res.summary
    assert _sheet_spells(db, pc, dm)["Divine Smite"] is True


def test_blessed_warrior_teaches_two_cleric_cantrips(db: Session):
    """Blessed Warrior: two Cleric cantrips, recorded as the creator records it."""
    pc, dm = _pc(
        db, CharacterClass.PALADIN, 1, scores=(16, 10, 14, 8, 10, 14), spells=["Bless", "Heroism"]
    )
    # Only with Blessed Warrior, and only from the Cleric list.
    with pytest.raises(ValueError, match="You can pick 0 new cantrips"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                cantrips=["Sacred Flame"], class_choices=[_pick("fighting_style", "Defense")]
            ),
        )
    with pytest.raises(ValueError, match="Druidcraft isn't a cantrip you can pick"):
        levelup_service.apply(
            db,
            pc.id,
            LevelUpChoices(
                cantrips=["Sacred Flame", "Druidcraft"],
                class_choices=[_pick("fighting_style", "Blessed Warrior")],
            ),
        )
    res = levelup_service.apply(
        db,
        pc.id,
        LevelUpChoices(
            cantrips=["Sacred Flame", "Guidance"],
            class_choices=[_pick("fighting_style", "Blessed Warrior")],
        ),
    )
    assert "Fighting Style: Blessed Warrior" in _feats(db, pc)
    assert "New cantrips: Sacred Flame, Guidance" in res.summary
    spells = _sheet_spells(db, pc, dm)
    assert "Sacred Flame" in spells and "Guidance" in spells


# ── Built at 5 or levelled 1 → 5: the same records ────────────────────────────


def _warlock_build(level: int, invocations: list[str], cantrips: list[str], spells: list[str]):
    """A 2024 Warlock build for the creator, every choice made."""
    return CharacterBuild(
        character_name="Vex",
        player_name="P",
        species="Dwarf",
        character_class="Warlock",
        subclass="Fiend Patron" if level >= 3 else None,
        background="Soldier",
        level=level,
        scores={"STR": 8, "DEX": 14, "CON": 13, "INT": 10, "WIS": 12, "CHA": 15},
        background_bonus={"DEX": 1, "CON": 2},
        skills=["Arcana", "Deception"],
        cantrips=cantrips,
        spells=spells,
        asi=([{"level": 4, "name": ASI, "asi": {"CHA": 2}}] if level >= 4 else []),
        class_choices=[{"key": "invocations", "picks": invocations}],
    )


def test_a_warlock_built_at_5_matches_one_levelled_1_to_5(db: Session):
    """The creator at 5 and the guide 1 → 5 record the same invocations and the same spells."""
    invocations = [
        "Armor of Shadows",
        "Agonizing Blast",
        "Devil's Sight",
        "Pact of the Blade",
        "Thirsting Blade",
    ]
    cantrips = ["Eldritch Blast", "Minor Illusion", "Prestidigitation"]
    spells = ["Hex", "Charm Person", "Hellish Rebuke", "Misty Step", "Hold Person", "Counterspell"]

    built_dm = _dm()
    camp = camp_svc.create_campaign(db, name="Built", dm_email=built_dm, ruleset="2024")
    built = builder.create(db, camp.id, _warlock_build(5, invocations, cantrips, spells))
    built_pc = char_svc.CharacterRepo.get_by_id(db, uuid.UUID(built.pc_id))

    dm = _dm()
    camp1 = camp_svc.create_campaign(db, name="Levelled", dm_email=dm, ruleset="2024")
    first = builder.create(
        db, camp1.id, _warlock_build(1, invocations[:1], cantrips[:2], spells[:2])
    )
    pc_id = uuid.UUID(first.pc_id)
    levelup_service.grant(db, pc_id, dm, to_level=5)
    steps = [
        LevelUpChoices(spells=[spells[2]], class_choices=[_pick("invocations", *invocations[1:3])]),
        LevelUpChoices(subclass="Fiend Patron", spells=[spells[3]]),
        LevelUpChoices(
            feat=FeatChoice(name=ASI, asi={"CHA": 2}), cantrips=[cantrips[2]], spells=[spells[4]]
        ),
        LevelUpChoices(spells=[spells[5]], class_choices=[_pick("invocations", *invocations[3:])]),
    ]
    for choices in steps:
        levelup_service.apply(db, pc_id, choices)
    levelled = char_svc.CharacterRepo.get_by_id(db, pc_id)

    assert levelled.level == built_pc.level == 5
    assert levelled.subclass == built_pc.subclass == "Fiend Patron"
    records = [
        sorted(f for f in (p.feats or []) if f.startswith(INV)) for p in (built_pc, levelled)
    ]
    assert records[0] == records[1] == sorted(INV + n for n in invocations)
    assert levelled.score_cha == built_pc.score_cha
    built_spells = _sheet_spells(db, built_pc, built_dm)
    levelled_spells = _sheet_spells(db, levelled, dm)
    assert built_spells == levelled_spells
    fiend = [
        "Burning Hands",
        "Command",
        "Scorching Ray",
        "Suggestion",
        "Fireball",
        "Stinking Cloud",
    ]
    assert all(levelled_spells[n] is True for n in fiend)
