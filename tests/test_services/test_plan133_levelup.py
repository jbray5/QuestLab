"""Plan 133 — homebrew subclasses in the level-up guide and the every-feature listing.

James's 2014 Zelda campaign has a homebrew Paladin oath, "Oath of the Triforce", with
features at 3 and 7 and Bless always prepared from 3. A Paladin reaching 3 is offered it next
to the SRD oath; picking it records it, its 3rd-level feature shows in "What's new", Bless is
learned and prepared, and levelling 6 → 7 shows the 7th-level feature. The sheet's and the
phone's feature listing show its features too. Both editions work, and another DM's homebrew
never shows.

The tests run on their own in-memory database with both editions' SRD spells seeded.
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
from domain.enums import CharacterClass
from domain.homebrew import HomebrewRaceCreate, HomebrewSubclassCreate
from domain.level_up import LevelUpChoices
from services import feature_service, homebrew_service, levelup_service, spellcasting_service

TRIFORCE = "Oath of the Triforce"
BLURB = "Knights sworn to the three golden triangles."


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
    return f"dm133l_{uuid.uuid4().hex[:8]}@example.com"


def _triforce(db: Session, dm: str, **extras):
    """James's oath: features at 3 and 7, Bless always prepared from 3."""
    payload = {
        "name": TRIFORCE,
        "character_class": "Paladin",
        "blurb": BLURB,
        "features": [
            {"level": 7, "name": "Aura of Wisdom", "text": "Allies near you add your Wisdom."},
            {"level": 3, "name": "Triforce Strike", "text": "Spend a Channel Divinity..."},
        ],
        "always_prepared": {"3": ["Bless"]},
    }
    payload.update(extras)
    return homebrew_service.create_subclass(db, HomebrewSubclassCreate(**payload), dm)


def _pc(
    db: Session,
    dm: str,
    cls: CharacterClass,
    level: int,
    *,
    ruleset: str = "2014",
    subclass=None,
    race="Human",
    spells=(),
    scores=(16, 10, 14, 8, 10, 16),
):
    """A PC in a fresh campaign of ``dm`` and ``ruleset``, with a level-up granted."""
    campaign = camp_svc.create_campaign(db, name="Hyrule", dm_email=dm, ruleset=ruleset)
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Link",
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
        ac=16,
        subclass=subclass,
    )
    for name in spells:
        spell = SpellRepo.get_by_name(db, name, ruleset=ruleset)
        assert spell is not None, name
        spellcasting_service.learn_spell(
            db, pc.id, CharacterSpellCreate(spell_id=spell.id, known=True, prepared=True), dm
        )
    levelup_service.grant(db, pc.id, dm)
    return pc


def _sheet_spells(db: Session, pc, dm: str) -> dict:
    """{spell name: prepared} for every spell on the sheet."""
    out = {}
    for row in spellcasting_service.list_known_for_character(db, pc.id, dm):
        out[SpellRepo.get_by_id(db, row.spell_id).name] = row.prepared
    return out


def _jump_to(db: Session, pc, dm: str, level: int) -> None:
    """The DM sets the PC's level directly, then grants the next one."""
    char_svc.update_character(db, pc.id, dm, PlayerCharacterUpdate(level=level, pending_level=None))
    levelup_service.grant(db, pc.id, dm)


def _names(rows) -> list[str]:
    """The names of listing rows."""
    return [r["name"] for r in rows]


# ── 2014: offered at 3, picked, then 6 → 7 ────────────────────────────────────


def test_2014_triforce_offered_picked_and_levelled_to_7(db: Session):
    """2014 Paladin 2 → 3 is offered the oath; it brings its feature and Bless; 7 its aura."""
    dm = _dm()
    _triforce(db, dm)
    pc = _pc(db, dm, CharacterClass.PALADIN, 2, spells=["Cure Wounds"])

    plan = levelup_service.plan_for(db, pc.id)
    assert plan.needs_subclass
    assert plan.subclass_options == ["Oath of Devotion", TRIFORCE]
    assert [(o.name, o.blurb) for o in plan.homebrew_subclasses] == [(TRIFORCE, BLURB)]
    tagged = [f for f in plan.new_features if f.subclass == TRIFORCE]
    assert [(f.name, f.note, f.homebrew) for f in tagged] == [
        ("Triforce Strike", "Spend a Channel Divinity...", True)
    ]
    assert "Aura of Wisdom" not in {f.name for f in plan.new_features}
    # The SRD oath's own features still come with it.
    assert any(f.subclass == "Oath of Devotion" for f in plan.new_features)
    granted = [g for g in plan.spellcasting.always_prepared if g.subclass == TRIFORCE]
    assert [(g.name, g.source) for g in granted] == [("Bless", TRIFORCE)]
    assert "Bless" not in {o.name for o in plan.spellcasting.options}

    # Picked by any spelling, recorded as the DM wrote it.
    res = levelup_service.apply(db, pc.id, LevelUpChoices(subclass="oath of the TRIFORCE"))
    assert f"Subclass: {TRIFORCE}" in res.summary
    assert f"{TRIFORCE}: Triforce Strike" in res.summary
    # Only the homebrew oath's spell: the SRD oath's stay with the SRD oath.
    assert "Always prepared: Bless" in res.summary
    sheet = char_svc.CharacterRepo.get_by_id(db, pc.id)
    assert sheet.subclass == TRIFORCE and sheet.level == 3
    spells = _sheet_spells(db, pc, dm)
    assert spells["Bless"] is True
    assert "Sanctuary" not in spells

    _jump_to(db, pc, dm, 6)
    plan7 = levelup_service.plan_for(db, pc.id)
    assert not plan7.needs_subclass
    untagged = [f for f in plan7.new_features if not f.subclass]
    assert [(f.name, f.homebrew) for f in untagged if f.homebrew] == [("Aura of Wisdom", True)]
    assert "Subclass feature" not in {f.name for f in untagged}
    res7 = levelup_service.apply(db, pc.id, LevelUpChoices())
    assert f"{TRIFORCE}: Aura of Wisdom" in res7.summary


def test_2014_listing_shows_the_homebrew_features_up_to_the_level(db: Session):
    """The sheet's and the phone's every-feature list carry the oath's features by level."""
    dm = _dm()
    _triforce(db, dm)
    pc = _pc(db, dm, CharacterClass.PALADIN, 6, subclass=TRIFORCE)

    rows = feature_service.list_class_features(db, pc.id, dm)
    assert rows == feature_service.list_class_features_for_player(db, pc.id)
    sub = [r for r in rows if r["source"] == "subclass"]
    assert sub == [
        {"name": TRIFORCE, "level": 3, "source": "subclass", "note": BLURB},
        {
            "name": "Triforce Strike",
            "level": 3,
            "source": "subclass",
            "note": "Spend a Channel Divinity...",
        },
    ]
    names = _names(rows)
    assert "Paladin Subclass" not in names and "Aura of Wisdom" not in names
    assert {"Divine Sense", "Lay on Hands", "Aura of Protection"} <= set(names)
    levels = [r["level"] for r in rows]
    assert levels == sorted(levels)

    char_svc.update_character(db, pc.id, dm, PlayerCharacterUpdate(level=7))
    rows7 = feature_service.list_class_features(db, pc.id, dm)
    assert "Aura of Wisdom" in _names(rows7)
    assert not any(n.startswith(f"{TRIFORCE} feature") for n in _names(rows7))

    # Without a session the listing reads the SRD tables only, as before.
    plain = feature_service.class_features_of(char_svc.CharacterRepo.get_by_id(db, pc.id))
    assert "Aura of Wisdom" not in _names(plain)


# ── 2024: the same oath, valid in both editions ───────────────────────────────


def test_2024_triforce_offered_picked_and_levelled_to_7(db: Session):
    """2024 Paladin 2 → 3: offered, picked, Bless learned and prepared; 7 shows the aura."""
    dm = _dm()
    _triforce(db, dm)
    pc = _pc(db, dm, CharacterClass.PALADIN, 2, ruleset="2024", spells=["Cure Wounds"])

    plan = levelup_service.plan_for(db, pc.id)
    assert plan.ruleset.value == "2024"
    assert plan.needs_subclass and TRIFORCE in plan.subclass_options
    assert plan.subclass_options[0] == "Oath of Devotion"
    tagged = [f.name for f in plan.new_features if f.subclass == TRIFORCE]
    assert tagged == ["Triforce Strike"]
    # Plan 134: the SRD oath's spells come tagged with it too; keep to the homebrew one.
    granted = [g for g in plan.spellcasting.always_prepared if g.subclass == TRIFORCE]
    assert [(g.name, g.subclass) for g in granted] == [("Bless", TRIFORCE)]
    assert "Bless" not in {o.name for o in plan.spellcasting.options}

    res = levelup_service.apply(db, pc.id, LevelUpChoices(subclass=TRIFORCE))
    assert "Always prepared: Bless" in res.summary
    assert _sheet_spells(db, pc, dm)["Bless"] is True
    assert char_svc.CharacterRepo.get_by_id(db, pc.id).subclass == TRIFORCE

    _jump_to(db, pc, dm, 6)
    plan7 = levelup_service.plan_for(db, pc.id)
    names = [f.name for f in plan7.new_features if not f.subclass]
    assert "Aura of Wisdom" in names and "Subclass feature" not in names

    char_svc.update_character(db, pc.id, dm, PlayerCharacterUpdate(level=7, pending_level=None))
    rows = feature_service.list_class_features_for_player(db, pc.id)
    sub = [r["name"] for r in rows if r["source"] == "subclass"]
    assert sub == [TRIFORCE, "Triforce Strike", "Aura of Wisdom"]
    assert "Paladin Subclass" not in _names(rows)


def test_a_2024_srd_subclass_plan_is_unchanged(db: Session):
    """No homebrew: the 2024 SRD choice and an empty homebrew list, as before."""
    pc = _pc(db, _dm(), CharacterClass.PALADIN, 2, ruleset="2024")
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.subclass_options == ["Oath of Devotion"]
    assert plan.homebrew_subclasses == []
    assert not any(f.homebrew for f in plan.new_features)


# ── Ownership and editions ────────────────────────────────────────────────────


def test_another_dms_subclass_never_appears(db: Session):
    """Another DM's oath is never offered, listed or applied, even when typed by name."""
    _triforce(db, _dm())
    dm = _dm()
    pc = _pc(db, dm, CharacterClass.PALADIN, 2, spells=["Cure Wounds"])
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.subclass_options == ["Oath of Devotion"]
    assert plan.homebrew_subclasses == []
    assert not any(f.homebrew for f in plan.new_features)
    assert not any(g.source == TRIFORCE for g in plan.spellcasting.always_prepared)

    # Typed from the book, it's only a name: no features, no spells.
    res = levelup_service.apply(db, pc.id, LevelUpChoices(subclass=TRIFORCE))
    assert not any(s.startswith(f"{TRIFORCE}:") for s in res.summary)
    assert "Bless" not in _sheet_spells(db, pc, dm)
    rows = feature_service.list_class_features(db, pc.id, dm)
    assert "Triforce Strike" not in _names(rows)
    assert TRIFORCE in _names(rows)  # the book subclass's own placeholder, as before


def test_a_2014_only_subclass_is_not_offered_to_a_2024_pc(db: Session):
    """A subclass the DM kept to 2014 doesn't show in their 2024 campaign."""
    dm = _dm()
    _triforce(db, dm, ruleset="2014")
    pc = _pc(db, dm, CharacterClass.PALADIN, 2, ruleset="2024")
    plan = levelup_service.plan_for(db, pc.id)
    assert TRIFORCE not in plan.subclass_options and plan.homebrew_subclasses == []


def test_only_this_class_subclasses_are_offered(db: Session):
    """A homebrew Barbarian path isn't offered to a Paladin."""
    dm = _dm()
    homebrew_service.create_subclass(
        db,
        HomebrewSubclassCreate(name="Path of the Gerudo", character_class="Barbarian"),
        dm,
    )
    pc = _pc(db, dm, CharacterClass.PALADIN, 2)
    assert "Path of the Gerudo" not in levelup_service.plan_for(db, pc.id).subclass_options


# ── Edge cases ────────────────────────────────────────────────────────────────


def test_a_homebrew_name_is_never_read_as_an_srd_subclass(db: Session):
    """A homebrew Cleric subclass called "Life" is the DM's, not the Life Domain."""
    dm = _dm()
    homebrew_service.create_subclass(
        db,
        HomebrewSubclassCreate(
            name="Life",
            character_class="Cleric",
            features=[{"level": 3, "name": "Spark of Life", "text": "Heal a little more."}],
            always_prepared={"3": ["Guiding Bolt"]},
        ),
        dm,
    )
    pc = _pc(db, dm, CharacterClass.CLERIC, 2, subclass="Life", scores=(10, 10, 14, 10, 16, 12))
    plan = levelup_service.plan_for(db, pc.id)
    always = [g.name for g in plan.spellcasting.always_prepared]
    assert always == ["Guiding Bolt"]
    assert "Spark of Life" in {f.name for f in plan.new_features if f.homebrew}
    levelup_service.apply(db, pc.id, LevelUpChoices())
    spells = _sheet_spells(db, pc, dm)
    assert spells["Guiding Bolt"] is True and "Lesser Restoration" not in spells
    rows = feature_service.list_class_features(db, pc.id, dm)
    sub = [r["name"] for r in rows if r["source"] == "subclass"]
    assert sub == ["Life", "Spark of Life"]


def test_an_unknown_always_prepared_spell_is_a_plain_warning(db: Session):
    """A spell name the catalog doesn't know is listed, then warned about, never an error."""
    dm = _dm()
    _triforce(db, dm, always_prepared={"3": ["Bless", "Farore's Wind"]})
    pc = _pc(db, dm, CharacterClass.PALADIN, 2, spells=["Cure Wounds"])
    plan = levelup_service.plan_for(db, pc.id)
    names = [g.name for g in plan.spellcasting.always_prepared if g.subclass == TRIFORCE]
    assert names == ["Bless", "Farore's Wind"]
    res = levelup_service.apply(db, pc.id, LevelUpChoices(subclass=TRIFORCE))
    assert "Farore's Wind isn't in the spell catalog yet: ask your DM to add it." in res.warnings
    assert _sheet_spells(db, pc, dm)["Bless"] is True


def test_a_class_without_spells_still_gets_its_always_prepared_spells(db: Session):
    """A homebrew Fighter subclass's spell comes through a spells step with nothing to pick."""
    dm = _dm()
    homebrew_service.create_subclass(
        db,
        HomebrewSubclassCreate(
            name="Hylian Guard",
            character_class="Fighter",
            features=[{"level": 3, "name": "Shield Wall", "text": "Allies behind you..."}],
            always_prepared={"3": ["Shield of Faith"]},
        ),
        dm,
    )
    pc = _pc(db, dm, CharacterClass.FIGHTER, 2, ruleset="2024")
    plan = levelup_service.plan_for(db, pc.id)
    step = plan.spellcasting
    assert step is not None and step.new_spells == 0 and step.options == []
    assert [(g.name, g.subclass) for g in step.always_prepared] == [
        ("Shield of Faith", "Hylian Guard")
    ]
    levelup_service.apply(db, pc.id, LevelUpChoices(subclass="Hylian Guard"))
    assert _sheet_spells(db, pc, dm)["Shield of Faith"] is True


def test_a_homebrew_race_adds_its_hit_points_every_level(db: Session):
    """A homebrew race with 1 hit point per level adds it to each level's gain."""
    dm = _dm()
    homebrew_service.create_race(
        db, HomebrewRaceCreate(name="Goron", ruleset="2014", hp_per_level=1), dm
    )
    pc = _pc(db, dm, CharacterClass.FIGHTER, 4, race="Goron", subclass="Champion")
    plan = levelup_service.plan_for(db, pc.id)
    assert plan.hp_bonus_per_level == 1
    res = levelup_service.apply(db, pc.id, LevelUpChoices())
    assert res.hp_gain == 6 + 2 + 1  # d10 average, CON +2, Goron +1


def test_phone_daily_limit_knows_homebrew_always_prepared(db: Session):
    """On the phone, a homebrew subclass's own always-prepared spells are free, not the SRD's."""
    from services import player_service

    dm = _dm()
    _triforce(db, dm)
    pc = _pc(db, dm, CharacterClass.PALADIN, 3, subclass=TRIFORCE)
    assert player_service._always_prepared(db, pc, "Paladin") == {"bless"}
    # A homebrew "Life" Cleric gets its own spells, never the Life Domain's.
    homebrew_service.create_subclass(
        db,
        HomebrewSubclassCreate(
            name="Life", character_class="Cleric", always_prepared={"1": ["Guidance"]}
        ),
        dm,
    )
    cleric = _pc(db, dm, CharacterClass.CLERIC, 1, subclass="Life")
    assert player_service._always_prepared(db, cleric, "Cleric") == {"guidance"}


def test_a_homebrew_race_never_reads_as_an_srd_race_for_hp(db: Session):
    """A 2024 homebrew "Dwarfling" gets its own +0 HP per level, not the SRD Dwarf's +1."""
    from services import levelup_service as lu

    dm = _dm()
    homebrew_service.create_race(
        db,
        HomebrewRaceCreate(name="Dwarfling", ruleset="2024", hp_per_level=0),
        dm,
    )
    pc = _pc(db, dm, CharacterClass.FIGHTER, 1, ruleset="2024", race="Dwarfling")
    hb = lu._homebrew_race_hp(db, pc, dm)
    assert hb == 0
    assert lu._hp_bonus_per_level(pc, [], None, hb) == 0
    # The SRD Dwarf still gets its Dwarven Toughness.
    dwarf = _pc(db, dm, CharacterClass.FIGHTER, 1, ruleset="2024", race="Dwarf")
    assert lu._homebrew_race_hp(db, dwarf, dm) is None
    assert lu._hp_bonus_per_level(dwarf, [], None, None) == 1
