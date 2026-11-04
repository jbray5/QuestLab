"""Plan 133 — the character builder with the DM's homebrew races and subclasses, and custom origin.

James (beta, 11/3) runs a 2014 Zelda campaign. His homebrew "Hylian" (+2 DEX +1 WIS,
Perception, two traits) and "Oath of the Triforce" (a Paladin oath with features at 3 and 7 and
spells always prepared) must be real choices in the builder of every campaign he runs: the
options carry them in the SRD shapes, and a build applies them like the SRD ones. A 2014
campaign with custom origin on lets a race's bonuses move. Another DM's homebrew never shows,
and a campaign without homebrew gets the options it always did.
"""

import uuid

import pytest
from sqlmodel import Session, delete, select

import services.campaign_service as camp_svc
import services.homebrew_service as hb_svc
from db.repos.spell_repo import SpellRepo
from domain.character import CharacterSpell
from domain.character_builder import CharacterBuild
from domain.homebrew import HomebrewRaceCreate, HomebrewSubclassCreate
from domain.spell import Spell, SpellCreate
from integrations.dnd_rules import rulesets
from services import character_builder_service as builder
from services import character_service, spellcasting_service

# Fighter-friendly standard array: STR 15, DEX 13, CON 14, INT 8, WIS 12, CHA 10.
STANDARD = {"STR": 15, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10}
KIT_2014 = "Chain mail, longsword & shield, light crossbow"
KIT_2024 = "Chain mail, longsword & shield"
OATH = "Oath of the Triforce"


@pytest.fixture(autouse=True)
def _clean(duckdb_session: Session):
    """Drop the spell rows these tests teach, so later suites can wipe the spells table."""
    yield
    duckdb_session.rollback()
    duckdb_session.exec(delete(CharacterSpell))
    duckdb_session.commit()


def _dm() -> str:
    """A fresh DM email."""
    return f"dm133b_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, ruleset: str = "2014", dm: str | None = None, custom_origin: bool = False):
    """A campaign for ``dm`` (a fresh one if None) in ``ruleset``."""
    return camp_svc.create_campaign(
        db,
        name="Hyrule",
        setting="R",
        tone="T",
        dm_email=dm or _dm(),
        ruleset=ruleset,
        custom_origin=custom_origin,
    )


def _hylian(db, dm: str, **extras):
    """James's Hylian: 2014, +2 DEX +1 WIS, Perception, two traits, +1 HP a level."""
    payload = {
        "name": "Hylian",
        "ruleset": "2014",
        "ability_bonuses": {"DEX": 2, "WIS": 1},
        "skills": ["Perception"],
        "traits": [
            {"name": "Hylian Ears", "text": "You hear the whispers of the goddess"},
            {"name": "Courage", "text": "Advantage on saves against being frightened."},
        ],
        "languages": "Common and Hylian",
        "hp_per_level": 1,
        "darkvision": 60,
    }
    payload.update(extras)
    return hb_svc.create_race(db, HomebrewRaceCreate(**payload), dm)


def _oath(db, dm: str, **extras):
    """A Paladin oath with features at 3 and 7, spells always prepared at 3 and 7."""
    payload = {
        "name": OATH,
        "character_class": "Paladin",
        "blurb": "Knights sworn to the three golden triangles.",
        "features": [
            {"level": 7, "name": "Aura of Wisdom", "text": "Allies near you add your Wisdom."},
            {"level": 3, "name": "Triforce Strike", "text": "Spend a Channel Divinity to smite."},
        ],
        "always_prepared": {
            "3": ["P133 Bless", "P133 Shield of Faith", "P133 Nowhere"],
            "7": ["P133 Later"],
        },
    }
    payload.update(extras)
    return hb_svc.create_subclass(db, HomebrewSubclassCreate(**payload), dm)


def _spell(db, name: str, level: int, classes: list[str], ruleset: str) -> str:
    """A catalog spell in one edition (created once per test session)."""
    found = db.exec(select(Spell).where(Spell.name == name, Spell.ruleset == ruleset)).first()
    if found is None:
        SpellRepo.create(
            db,
            SpellCreate(
                name=name,
                level=level,
                school="Abjuration",
                classes=classes,
                casting_time="1 action",
                range="30 feet",
                duration="1 minute",
                description=f"{name} does a thing.",
                ruleset=ruleset,
            ),
        )
    return name


def _oath_spells(db, ruleset: str) -> None:
    """The oath's spells that exist (P133 Nowhere doesn't)."""
    for name in ("P133 Bless", "P133 Shield of Faith", "P133 Later"):
        _spell(db, name, 1, ["Cleric", "Paladin"], ruleset)


def _build(**over) -> CharacterBuild:
    """A 2014 level 1 Fighter build; ``class_choices`` None unless a test sends them."""
    base = dict(
        character_name="Link",
        player_name="James",
        species="Hylian",
        character_class="Fighter",
        background="Acolyte",
        level=1,
        scores=dict(STANDARD),
        score_method="standard",
        skills=["Athletics", "Survival"],
        kit=KIT_2014,
    )
    base.update(over)
    return CharacterBuild(**base)


def _pc(db, campaign, res):
    """The new PC."""
    return character_service.get_character(db, uuid.UUID(res.pc_id), campaign.dm_email)


def _sheet_spells(db, campaign, res) -> dict[str, bool]:
    """Spell name → prepared, for the new PC."""
    rows = spellcasting_service.list_known_for_character(
        db, uuid.UUID(res.pc_id), campaign.dm_email
    )
    return {SpellRepo.get_by_id(db, r.spell_id).name: bool(r.prepared) for r in rows}


def _scores(pc) -> dict[str, int]:
    """The PC's six scores by code."""
    return {a: getattr(pc, f"score_{a.lower()}") for a in STANDARD}


# ── Options ─────────────────────────────────────────────────────────────────


class TestOptions:
    def test_2014_options_carry_the_hylian_and_the_oath(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        _hylian(db, dm)
        _oath(db, dm)
        opts = builder.options(db, _campaign(db, dm=dm).id)
        row = next(s for s in opts.species if s["name"] == "Hylian")
        assert row["homebrew"] is True
        assert row["ability_bonuses"] == {"DEX": 2, "WIS": 1}
        assert row["ability_choice"] is None
        assert row["skills"] == ["Perception"] and row["skill_choice"] == 0
        assert row["subraces"] == [] and row["choices"] == {}
        assert row["hp_per_level_bonus"] == 1 and row["speed"] == 30
        assert row["traits"] == [
            "Hylian Ears — You hear the whispers of the goddess.",
            "Courage — Advantage on saves against being frightened.",
            "Darkvision 60 ft.",
            "Languages — Common and Hylian.",
            "Hit points — +1 every level.",
        ]
        # The SRD races come first, unchanged; the homebrew one after.
        srd = rulesets.options("2014").SPECIES
        assert opts.species[: len(srd)] == srd
        listed = opts.homebrew_subclasses["Paladin"]
        assert [s["name"] for s in listed] == [OATH]
        assert listed[0]["blurb"].startswith("Knights")
        assert [f["level"] for f in listed[0]["features"]] == [3, 7]
        assert opts.subclass_features[OATH] == {3: ["Triforce Strike"], 7: ["Aura of Wisdom"]}
        assert opts.feature_notes["Paladin: Triforce Strike"].startswith("Spend a Channel")
        assert opts.always_prepared_subclass[OATH][3] == [
            "P133 Bless",
            "P133 Nowhere",
            "P133 Shield of Faith",
        ]
        assert opts.custom_origin is False
        # The SRD tables themselves never change.
        rules = rulesets.levelup("2014")
        assert OATH not in rules.SUBCLASS_LEVEL_FEATURES
        assert OATH not in rules.ALWAYS_PREPARED_SUBCLASS
        assert "Paladin: Triforce Strike" not in rules.FEATURE_NOTES
        assert all(not s.get("homebrew") for s in srd)

    def test_2024_row_has_no_race_bonuses_and_says_its_skills(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        hb_svc.create_race(
            db,
            HomebrewRaceCreate(
                name="Zora",
                ability_bonuses={"DEX": 2, "WIS": 1},
                skills=["Athletics"],
                skill_choice=1,
                speed=35,
                traits=[{"name": "Swimmer", "text": "You swim at your walking speed."}],
            ),
            dm,
        )
        opts = builder.options(db, _campaign(db, ruleset="2024", dm=dm).id)
        row = next(s for s in opts.species if s["name"] == "Zora")
        assert row["homebrew"] is True and row["speed"] == 35
        assert "ability_bonuses" not in row and "ability_choice" not in row
        assert row["skills"] == ["Athletics"] and row["bonus_skill_choices"] == 1
        assert row["traits"] == [
            "Swimmer — You swim at your walking speed.",
            "Skills — trained in Athletics.",
            "Skill choice — trained in 1 more skill of your choice.",
        ]

    def test_hit_points_are_said_once(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        stout = {"name": "Stout", "text": "+1 hit point, and +1 more every level."}
        hb_svc.create_race(db, HomebrewRaceCreate(name="Goron", hp_per_level=1, traits=[stout]), dm)
        opts = builder.options(db, _campaign(db, ruleset="2024", dm=dm).id)
        row = next(s for s in opts.species if s["name"] == "Goron")
        assert row["traits"] == ["Stout — +1 hit point, and +1 more every level."]
        assert row["hp_per_level_bonus"] == 1

    def test_a_2014_only_race_stays_out_of_a_2024_campaign(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        _hylian(db, dm)
        opts = builder.options(db, _campaign(db, ruleset="2024", dm=dm).id)
        assert "Hylian" not in [s["name"] for s in opts.species]

    def test_an_srd_feature_never_shows_homebrew_words(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        _oath(
            db,
            dm,
            features=[
                {"level": 5, "name": "Extra Attack", "text": "Homebrew words."},
                {"level": 6, "name": "Aura of Protection", "text": "More homebrew words."},
            ],
        )
        opts = builder.options(db, _campaign(db, ruleset="2024", dm=dm).id)
        rules = rulesets.levelup("2024")
        assert opts.feature_notes == rules.FEATURE_NOTES
        assert opts.subclass_features[OATH] == {5: ["Extra Attack"], 6: ["Aura of Protection"]}
        # The wizard reads the oath's own words from here.
        assert opts.homebrew_subclasses["Paladin"][0]["features"][0]["text"] == "Homebrew words."

    def test_custom_origin_only_shows_in_2014(self, duckdb_session: Session):
        db = duckdb_session
        on = builder.options(db, _campaign(db, custom_origin=True).id)
        assert on.custom_origin is True
        assert builder.options(db, _campaign(db).id).custom_origin is False
        assert builder.options(db, _campaign(db, ruleset="2024").id).custom_origin is False

    def test_another_dms_homebrew_never_shows(self, duckdb_session: Session):
        db = duckdb_session
        james = _dm()
        _hylian(db, james)
        _oath(db, james)
        other = _campaign(db)
        opts = builder.options(db, other.id)
        assert "Hylian" not in [s["name"] for s in opts.species]
        assert opts.homebrew_subclasses == {}
        assert OATH not in opts.subclass_features
        # A build there treats the name as a race from the player's book.
        res = builder.create(db, other.id, _build())
        assert any("isn't in the SRD" in w for w in res.warnings)
        assert _scores(_pc(db, other, res)) == STANDARD

    @pytest.mark.parametrize("ruleset", ["2024", "2014"])
    def test_no_homebrew_means_the_same_options(self, duckdb_session: Session, ruleset: str):
        db = duckdb_session
        opts = builder.options(db, _campaign(db, ruleset=ruleset).id)
        srd, rules = rulesets.options(ruleset), rulesets.levelup(ruleset)
        assert opts.species == srd.SPECIES
        assert opts.subclass_features == rules.SUBCLASS_LEVEL_FEATURES
        assert opts.feature_notes == rules.FEATURE_NOTES
        assert opts.always_prepared_subclass == rules.ALWAYS_PREPARED_SUBCLASS
        assert opts.homebrew_subclasses == {} and opts.custom_origin is False


# ── Homebrew races in a build ───────────────────────────────────────────────


class TestHomebrewRaces:
    def test_2014_hylian_fighter(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        _hylian(db, dm)
        c = _campaign(db, dm=dm)
        res = builder.create(
            db, c.id, _build(class_choices=[{"key": "fighting_style", "picks": ["Defense"]}])
        )
        pc = _pc(db, c, res)
        assert pc.race == "Hylian" and pc.speed == 30
        assert _scores(pc) == {**STANDARD, "DEX": 15, "WIS": 13}
        # d10 + CON (+2) + the Hylian's +1 a level; chain mail 16 + shield 2 + Defense 1.
        assert res.hp_max == 13 and res.ac == 19
        assert pc.skill_proficiencies == {
            "Athletics": 1,
            "Survival": 1,
            "Insight": 1,
            "Religion": 1,
            "Perception": 1,
        }
        assert "Hylian traits (Medium): Hylian Ears — You hear the whispers" in pc.notes
        assert "Darkvision 60 ft. Languages — Common and Hylian. Hit points — +1" in pc.notes
        assert not any("SRD" in w for w in res.warnings)

    def test_hylian_hp_counts_every_level(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        _hylian(db, dm)
        c = _campaign(db, dm=dm)
        res = builder.create(db, c.id, _build(level=3, subclass="Champion"))
        # 10 + 2, then 2 × (6 + 2), plus 3 × 1.
        assert res.hp_max == 12 + 16 + 3

    def test_2014_race_ability_choice(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        hb_svc.create_race(
            db,
            HomebrewRaceCreate(
                name="Gerudo",
                ruleset="2014",
                ability_bonuses={"STR": 2},
                ability_choice={"choose": 2, "amount": 1, "exclude": ["STR"]},
            ),
            dm,
        )
        c = _campaign(db, dm=dm)
        res = builder.create(
            db, c.id, _build(species="gerudo", ability_choice={"CON": 1, "CHA": 1})
        )
        pc = _pc(db, c, res)
        assert pc.race == "Gerudo"
        assert _scores(pc) == {**STANDARD, "STR": 17, "CON": 15, "CHA": 11}
        with pytest.raises(ValueError, match="not Strength"):
            builder.create(db, c.id, _build(species="Gerudo", ability_choice={"STR": 1, "CON": 1}))

    def test_a_choice_with_nothing_excluded_reads_plainly(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        hb_svc.create_race(
            db,
            HomebrewRaceCreate(
                name="Kokiri", ruleset="2014", ability_choice={"choose": 3, "amount": 1}
            ),
            dm,
        )
        c = _campaign(db, dm=dm)
        with pytest.raises(ValueError, match=r"picks 3 different abilities for \+1 each\.$"):
            builder.create(db, c.id, _build(species="Kokiri", ability_choice={"DEX": 1}))

    def test_2024_species_gives_no_bonus_and_the_background_still_does(
        self, duckdb_session: Session
    ):
        db = duckdb_session
        dm = _dm()
        hb_svc.create_race(
            db,
            HomebrewRaceCreate(
                name="Zora",
                ability_bonuses={"DEX": 2, "WIS": 1},  # 2014 only: ignored here
                skills=["Athletics"],
                skill_choice=1,
                speed=35,
                traits=[{"name": "Swimmer", "text": "You swim at your walking speed."}],
            ),
            dm,
        )
        c = _campaign(db, ruleset="2024", dm=dm)
        res = builder.create(
            db,
            c.id,
            _build(
                species="Zora",
                background="Criminal",
                background_bonus={"DEX": 2, "CON": 1},
                scores={"STR": 15, "DEX": 14, "CON": 13, "INT": 12, "WIS": 10, "CHA": 8},
                skills=["Perception", "Survival", "Arcana"],  # the third: Zora's choice
                kit=KIT_2024,
            ),
        )
        pc = _pc(db, c, res)
        assert pc.race == "Zora" and pc.speed == 35
        assert _scores(pc) == {"STR": 15, "DEX": 16, "CON": 14, "INT": 12, "WIS": 10, "CHA": 8}
        assert set(pc.skill_proficiencies) == {
            "Perception",
            "Survival",
            "Arcana",
            "Athletics",
            "Sleight of Hand",
            "Stealth",
        }
        assert "Zora traits (Medium): Swimmer — You swim" in pc.notes
        with pytest.raises(ValueError, match="background, not your species"):
            builder.create(db, c.id, _build(species="Zora", ability_choice={"DEX": 1}))

    def test_2024_skill_choice_has_a_limit(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        hb_svc.create_race(db, HomebrewRaceCreate(name="Rito", skill_choice=1), dm)
        c = _campaign(db, ruleset="2024", dm=dm)
        with pytest.raises(ValueError, match="isn't on the Fighter skill list"):
            builder.create(
                db,
                c.id,
                _build(
                    species="Rito",
                    background="Criminal",
                    background_bonus={"DEX": 2, "CON": 1},
                    skills=["Perception", "Arcana", "Religion"],
                    kit=KIT_2024,
                ),
            )

    def test_a_skill_from_race_and_background_gives_another_pick(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        hb_svc.create_race(
            db, HomebrewRaceCreate(name="Sheikah", ruleset="2014", skills=["Insight"]), dm
        )
        c = _campaign(db, dm=dm)
        # Acolyte gives Insight too, so the Fighter picks one more skill of any kind.
        res = builder.create(
            db, c.id, _build(species="Sheikah", skills=["Athletics", "Survival", "Arcana"])
        )
        assert set(_pc(db, c, res).skill_proficiencies) == {
            "Athletics",
            "Survival",
            "Arcana",
            "Insight",
            "Religion",
        }

    def test_a_look_alike_name_gets_no_srd_toughness(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        hb_svc.create_race(db, HomebrewRaceCreate(name="Dwarfling", hp_per_level=2), dm)
        c = _campaign(db, ruleset="2024", dm=dm)
        res = builder.create(
            db,
            c.id,
            _build(
                species="Dwarfling",
                background="Criminal",
                background_bonus={"DEX": 2, "CON": 1},
                kit=KIT_2024,
            ),
        )
        # d10 + CON 15 (+2) + its own 2; never the 2024 Dwarf's Dwarven Toughness on top.
        assert res.hp_max == 14

    def test_a_homebrew_race_has_no_subrace(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        _hylian(db, dm)
        c = _campaign(db, dm=dm)
        with pytest.raises(ValueError, match="has no subrace"):
            builder.create(db, c.id, _build(subrace="Hill Hylian"))


# ── Homebrew subclasses in a build ──────────────────────────────────────────


class TestHomebrewSubclasses:
    @pytest.mark.parametrize("ruleset", ["2024", "2014"])
    def test_paladin_oath_at_3_learns_its_spells(self, duckdb_session: Session, ruleset: str):
        db = duckdb_session
        dm = _dm()
        _oath(db, dm)
        _oath_spells(db, ruleset)
        c = _campaign(db, ruleset=ruleset, dm=dm)
        res = builder.create(
            db,
            c.id,
            _build(
                species="Human",
                character_class="Paladin",
                subclass="oath of the triforce",
                level=3,
                background="Acolyte",
                skills=["Athletics", "Medicine"],
                kit="Chain mail, longsword & shield" + (", javelins" if ruleset == "2014" else ""),
                **({"background_bonus": {"WIS": 1, "CHA": 2}} if ruleset == "2024" else {}),
            ),
        )
        pc = _pc(db, c, res)
        assert pc.subclass == OATH
        assert not any("isn't in the SRD" in w for w in res.warnings)
        sheet = _sheet_spells(db, c, res)
        assert sheet["P133 Bless"] is True and sheet["P133 Shield of Faith"] is True
        assert "P133 Later" not in sheet  # it comes at 7
        assert (
            "P133 Nowhere (always prepared for Oath of the Triforce) isn't in the spell list yet: "
            "ask your DM to add it." in res.warnings
        )
        assert "P133 Bless, P133 Shield of Faith" in pc.notes

    def test_below_its_level_nothing_is_prepared(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        _oath(db, dm)
        _oath_spells(db, "2024")
        c = _campaign(db, ruleset="2024", dm=dm)
        res = builder.create(
            db,
            c.id,
            _build(
                species="Human",
                character_class="Paladin",
                subclass=OATH,
                level=2,
                background="Acolyte",
                background_bonus={"WIS": 1, "CHA": 2},
                skills=["Athletics", "Medicine"],
                kit="Chain mail, longsword & shield",
            ),
        )
        assert "Subclass recorded; it comes online at level 3." in res.warnings
        assert "P133 Bless" not in _sheet_spells(db, c, res)

    def test_the_oath_is_only_the_paladins(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        _oath(db, dm)
        c = _campaign(db, dm=dm)
        res = builder.create(db, c.id, _build(level=3, subclass=OATH))
        assert any("isn't in the SRD" in w for w in res.warnings)

    def test_a_look_alike_name_gets_no_srd_resilience(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        name = "Draconic Sorcery of Hyrule"
        hb_svc.create_subclass(
            db, HomebrewSubclassCreate(name=name, character_class="Sorcerer"), dm
        )
        c = _campaign(db, ruleset="2024", dm=dm)
        res = builder.create(
            db,
            c.id,
            _build(
                character_class="Sorcerer",
                subclass=name,
                level=3,
                species="Human",
                background="Criminal",
                background_bonus={"DEX": 2, "CON": 1},
                skills=["Arcana", "Insight"],
            ),
        )
        # d6 + CON 15 (+2), then 2 × (4 + 2); never Draconic Resilience by the name.
        assert res.hp_max == 20

    def test_a_class_pick_cant_repeat_an_oath_spell(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        _oath(db, dm)
        _oath_spells(db, "2024")
        c = _campaign(db, ruleset="2024", dm=dm)
        res = builder.create(
            db,
            c.id,
            _build(
                species="Human",
                character_class="Paladin",
                subclass=OATH,
                level=3,
                background="Acolyte",
                background_bonus={"WIS": 1, "CHA": 2},
                skills=["Athletics", "Medicine"],
                kit="Chain mail, longsword & shield",
                spells=["P133 Bless"],
            ),
        )
        # The older callers' path: a warning, and the spell stays (always prepared).
        assert "P133 Bless is always prepared for you: pick a different spell." in res.warnings
        assert _sheet_spells(db, c, res)["P133 Bless"] is True


# ── Custom origin ───────────────────────────────────────────────────────────


def _dwarf(**over) -> CharacterBuild:
    """A 2014 Hill Dwarf Fighter (race +2 CON, subrace +1 WIS)."""
    return _build(species="Dwarf", subrace="Hill Dwarf", **over)


class TestCustomOrigin:
    def test_hill_dwarf_moves_its_bonuses(self, duckdb_session: Session):
        db = duckdb_session
        c = _campaign(db, custom_origin=True)
        res = builder.create(db, c.id, _dwarf(origin_bonus={"DEX": 2, "INT": 1}))
        pc = _pc(db, c, res)
        assert pc.race == "Hill Dwarf"
        assert _scores(pc) == {**STANDARD, "DEX": 15, "INT": 9}
        # d10 + CON 14 (+2) + Dwarven Toughness 1: the toughness stays with the race.
        assert res.hp_max == 13

    def test_left_empty_the_race_keeps_its_own(self, duckdb_session: Session):
        db = duckdb_session
        c = _campaign(db, custom_origin=True)
        pc = _pc(db, c, builder.create(db, c.id, _dwarf()))
        assert _scores(pc) == {**STANDARD, "CON": 16, "WIS": 13}

    def test_refused_when_the_switch_is_off(self, duckdb_session: Session):
        db = duckdb_session
        c = _campaign(db)
        with pytest.raises(ValueError, match="Custom origin is off in this campaign"):
            builder.create(db, c.id, _dwarf(origin_bonus={"DEX": 2, "INT": 1}))

    def test_refused_in_2024(self, duckdb_session: Session):
        db = duckdb_session
        c = _campaign(db, ruleset="2024")
        with pytest.raises(ValueError, match="2024 rules"):
            builder.create(
                db,
                c.id,
                _build(
                    species="Dwarf",
                    background="Criminal",
                    background_bonus={"DEX": 2, "CON": 1},
                    kit=KIT_2024,
                    origin_bonus={"DEX": 2},
                ),
            )

    @pytest.mark.parametrize(
        "moved",
        [{"DEX": 3}, {"DEX": 2, "INT": 2}, {"DEX": 2}, {"DEX": 2, "INT": 1, "CHA": 1}],
    )
    def test_the_same_amounts_on_different_abilities(self, duckdb_session: Session, moved):
        db = duckdb_session
        c = _campaign(db, custom_origin=True)
        with pytest.raises(ValueError, match=r"\(\+2 and \+1\), each onto a different ability"):
            builder.create(db, c.id, _dwarf(origin_bonus=moved))

    def test_one_ability_named_twice_is_refused(self, duckdb_session: Session):
        db = duckdb_session
        c = _campaign(db, custom_origin=True)
        with pytest.raises(ValueError, match="goes on a different ability"):
            builder.create(db, c.id, _dwarf(origin_bonus={"DEX": 2, "dex": 1}))

    def test_half_elf_choices_stay_off_the_moved_bonus(self, duckdb_session: Session):
        db = duckdb_session
        c = _campaign(db, custom_origin=True)
        half = dict(species="Half-Elf", skills=["Athletics", "Survival", "Arcana", "Stealth"])
        res = builder.create(
            db,
            c.id,
            _build(**half, origin_bonus={"DEX": 2}, ability_choice={"CHA": 1, "CON": 1}),
        )
        assert _scores(_pc(db, c, res)) == {**STANDARD, "DEX": 15, "CON": 15, "CHA": 11}
        with pytest.raises(ValueError, match="not Dexterity"):
            builder.create(
                db,
                c.id,
                _build(**half, origin_bonus={"DEX": 2}, ability_choice={"DEX": 1, "CON": 1}),
            )
        # Kept where the race puts it, the +2 still bars Charisma.
        with pytest.raises(ValueError, match="not Charisma"):
            builder.create(db, c.id, _build(**half, ability_choice={"CHA": 1, "CON": 1}))

    def test_human_spreads_six_ones(self, duckdb_session: Session):
        db = duckdb_session
        c = _campaign(db, custom_origin=True)
        ones = {a: 1 for a in STANDARD}
        pc = _pc(db, c, builder.create(db, c.id, _build(species="Human", origin_bonus=ones)))
        assert _scores(pc) == {a: v + 1 for a, v in STANDARD.items()}

    def test_a_homebrew_race_can_move_too(self, duckdb_session: Session):
        db = duckdb_session
        dm = _dm()
        _hylian(db, dm)
        c = _campaign(db, dm=dm, custom_origin=True)
        pc = _pc(db, c, builder.create(db, c.id, _build(origin_bonus={"STR": 2, "CON": 1})))
        assert _scores(pc) == {**STANDARD, "STR": 17, "CON": 15}

    def test_a_book_race_has_nothing_to_move(self, duckdb_session: Session):
        db = duckdb_session
        c = _campaign(db, custom_origin=True)
        with pytest.raises(ValueError, match="from your book"):
            builder.create(
                db,
                c.id,
                _build(species="Aasimar", ability_choice={"CHA": 2}, origin_bonus={"DEX": 2}),
            )
