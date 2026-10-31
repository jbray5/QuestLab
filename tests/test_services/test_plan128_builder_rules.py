"""Plan 128 — the character wizard's rules choices, checked on the server.

Persona run 3 found finished characters with no subclass at level 5, a level 1 Bard with no
spells, a Cleric 4 with 2 of 7 prepared, always-prepared spells (Divine Smite, Find Steed)
counted as ordinary picks, Magic Initiate's spells never asked for, and the class's own choices
(Fighting Style, Weapon Mastery, Expertise, Divine Order, Invocations, Metamagic) left for the
sheet. The wizard now asks for all of them, and the builder refuses a build that skips one.
"""

import uuid

import pytest
from sqlmodel import Session, delete

import services.campaign_service as camp_svc
from db.repos.spell_repo import SpellRepo
from domain.character import CharacterSpell
from domain.spell import SpellCreate
from integrations.dnd_rules import levelup_2024 as rules
from services import character_builder_service as builder
from services import character_service, feat_rules, spellcasting_service
from tests.test_services.test_character_builder import _build


@pytest.fixture(autouse=True)
def _clean(duckdb_session: Session):
    """Drop the spell rows these tests teach, so later suites can wipe the spells table."""
    yield
    duckdb_session.rollback()
    duckdb_session.exec(delete(CharacterSpell))
    duckdb_session.commit()


def _campaign(db):
    dm = f"dm128_{uuid.uuid4().hex[:6]}@example.com"
    return camp_svc.create_campaign(db, name="Rules", setting="R", tone="T", dm_email=dm)


def _spell(db, name: str, level: int, classes: list[str], owner: str | None = None, **extra):
    if SpellRepo.get_by_name(db, name) is None:
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
                description=f"{name} does a thing. It does it well. Then it stops.",
                **extra,
            ),
            owner_email=owner,
        )


def _spells(db, prefix: str, cls: str, level: int, n: int) -> list[str]:
    names = [f"P128 {prefix} {i}" for i in range(n)]
    for name in names:
        _spell(db, name, level, [cls])
    return names


def _known(db, campaign, res) -> set[str]:
    rows = spellcasting_service.list_known_for_character(
        db, uuid.UUID(res.pc_id), campaign.dm_email
    )
    return {SpellRepo.get_by_id(db, r.spell_id).name for r in rows}


def _pc(db, campaign, res):
    return character_service.get_character(db, uuid.UUID(res.pc_id), campaign.dm_email)


def _choices(**picks) -> list[dict]:
    return [{"key": k, "picks": v} for k, v in picks.items()]


FIGHTER = dict(
    skills=["Perception", "Survival"],
    class_choices=_choices(
        fighting_style=["Defense"], weapon_mastery=["Longsword", "Javelin", "Greatsword"]
    ),
)


class TestSubclass:
    def test_required_once_the_level_reaches_it(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="picks a subclass at level 3"):
            builder.create(duckdb_session, c.id, _build(level=5, subclass=None))
        with pytest.raises(ValueError, match="picks a subclass at level 3"):
            builder.create(duckdb_session, c.id, _build(level=3, subclass="  "))
        # Below the subclass level there is nothing to pick.
        assert builder.create(duckdb_session, c.id, _build(level=2)).pc_id

    def test_a_book_subclass_is_recorded_by_name(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        res = builder.create(duckdb_session, c.id, _build(level=3, subclass="Psi Warrior"))
        assert _pc(duckdb_session, c, res).subclass == "Psi Warrior"
        assert any("isn't in the SRD" in w for w in res.warnings)


class TestSpellCounts:
    def _bard(self, db, **over):
        base = dict(
            character_class="Bard",
            species="Halfling",
            background="Criminal",
            kit="Leather & rapier",
            scores={"CHA": 15, "DEX": 14, "CON": 13, "WIS": 12, "INT": 10, "STR": 8},
            background_bonus={"DEX": 2, "CON": 1},
            skills=["Performance", "Persuasion", "Insight"],
            class_choices=[],
        )
        base.update(over)
        return _build(**base)

    def test_a_bard_must_pick_its_cantrips_and_spells(self, duckdb_session: Session):
        cantrips = _spells(duckdb_session, "Bard tune", "Bard", 0, 3)
        spells = _spells(duckdb_session, "Bard verse", "Bard", 1, 5)
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="pick 2 more cantrips. A level 1 Bard has 2"):
            builder.create(duckdb_session, c.id, self._bard(duckdb_session))
        with pytest.raises(ValueError, match="pick 3 more spells. A level 1 Bard has 4"):
            builder.create(
                duckdb_session,
                c.id,
                self._bard(duckdb_session, cantrips=cantrips[:2], spells=spells[:1]),
            )
        with pytest.raises(ValueError, match="has 2 cantrips: pick 2"):
            builder.create(
                duckdb_session,
                c.id,
                self._bard(duckdb_session, cantrips=cantrips, spells=spells[:4]),
            )
        res = builder.create(
            duckdb_session,
            c.id,
            self._bard(duckdb_session, cantrips=cantrips[:2], spells=spells[:4]),
        )
        assert _known(duckdb_session, c, res) == set(cantrips[:2] + spells[:4])

    def test_off_list_and_too_high_spells_are_refused(self, duckdb_session: Session):
        cantrips = _spells(duckdb_session, "Bard tune", "Bard", 0, 3)
        spells = _spells(duckdb_session, "Bard verse", "Bard", 1, 5)
        _spell(duckdb_session, "P128 Wizard Only", 1, ["Wizard"])
        _spell(duckdb_session, "P128 Bard High", 3, ["Bard"])
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="isn't a Bard spell"):
            builder.create(
                duckdb_session,
                c.id,
                self._bard(
                    duckdb_session, cantrips=cantrips[:2], spells=spells[:3] + ["P128 Wizard Only"]
                ),
            )
        with pytest.raises(ValueError, match="isn't a spell you can prepare yet"):
            builder.create(
                duckdb_session,
                c.id,
                self._bard(
                    duckdb_session, cantrips=cantrips[:2], spells=spells[:3] + ["P128 Bard High"]
                ),
            )

    def test_an_older_caller_keeps_the_lenient_rules(self, duckdb_session: Session):
        """No class_choices (an older caller): a short list is a warning, not a stop."""
        c = _campaign(duckdb_session)
        res = builder.create(duckdb_session, c.id, self._bard(duckdb_session, class_choices=None))
        assert res.pc_id


class TestAlwaysPrepared:
    def test_paladin_5_gets_smite_steed_and_oath_spells_free(self, duckdb_session: Session):
        always = [
            "Divine Smite",
            "Find Steed",
            "Protection from Evil and Good",
            "Shield of Faith",
            "Aid",
            "Zone of Truth",
        ]
        for name in always:
            _spell(
                duckdb_session,
                name,
                2 if name in ("Find Steed", "Aid", "Zone of Truth") else 1,
                ["Paladin"],
            )
        picks = _spells(duckdb_session, "Oath prayer", "Paladin", 1, 7)
        c = _campaign(duckdb_session)
        paladin = dict(
            character_class="Paladin",
            subclass="Oath of Devotion",
            level=5,
            skills=["Insight", "Persuasion"],
            scores={"STR": 15, "CHA": 14, "CON": 13, "DEX": 12, "WIS": 10, "INT": 8},
            asi=[{"level": 4, "name": "Ability Score Improvement", "asi": {"STR": 1, "CHA": 1}}],
            class_choices=_choices(
                fighting_style=["Defense"], weapon_mastery=["Longsword", "Javelin"]
            ),
        )
        with pytest.raises(ValueError, match="Divine Smite is always prepared for you"):
            builder.create(
                duckdb_session, c.id, _build(**paladin, spells=picks[:5] + ["Divine Smite"])
            )
        res = builder.create(duckdb_session, c.id, _build(**paladin, spells=picks[:6]))
        assert _known(duckdb_session, c, res) == set(picks[:6] + always)
        pc = _pc(duckdb_session, c, res)
        assert "Always prepared: Divine Smite, Find Steed" in (pc.notes or "")
        assert res.ac == 16 + 2 + 1  # chain mail, shield, Defense
        assert {"Defense", "Weapon Mastery: Longsword", "Weapon Mastery: Javelin"} <= set(pc.feats)

    def test_ranger_1_has_hunters_mark(self, duckdb_session: Session):
        _spell(duckdb_session, "Hunter's Mark", 1, ["Ranger"])
        picks = _spells(duckdb_session, "Trail sign", "Ranger", 1, 3)
        c = _campaign(duckdb_session)
        res = builder.create(
            duckdb_session,
            c.id,
            _build(
                character_class="Ranger",
                kit="Studded leather, scimitar & shortsword, longbow",
                background_bonus={"DEX": 2, "CON": 1},
                skills=["Perception", "Stealth", "Survival"],
                spells=picks[:2],
                class_choices=_choices(weapon_mastery=["Longbow", "Scimitar"]),
            ),
        )
        assert "Hunter's Mark" in _known(duckdb_session, c, res)

    def test_subclass_and_land_tables(self):
        names = [n for n, _ in rules.always_prepared("Cleric", 5, "Life Domain")]
        assert names == [
            "Aid",
            "Bless",
            "Cure Wounds",
            "Lesser Restoration",
            "Mass Healing Word",
            "Revivify",
        ]
        land = dict(rules.always_prepared("Druid", 3, "Circle of the Land", "Arid"))
        assert land["Speak with Animals"] == "Druidic" and "Fire Bolt" in land
        assert rules.always_prepared("Paladin", 1) == []
        assert rules.always_prepared("Paladin", 2) == [("Divine Smite", "Paladin's Smite")]


class TestMagicInitiate:
    def _acolyte(self, **over):
        base = dict(
            background="Acolyte",
            background_bonus={"WIS": 2, "CHA": 1},
            skills=["Perception", "Survival"],
            class_choices=FIGHTER["class_choices"],
        )
        base.update(over)
        return _build(**base)

    def test_the_acolytes_spells_are_picked_from_the_cleric_list(self, duckdb_session: Session):
        cantrips = _spells(duckdb_session, "Temple chant", "Cleric", 0, 3)
        firsts = _spells(duckdb_session, "Temple rite", "Cleric", 1, 2)
        _spell(duckdb_session, "P128 Arcane Spark", 0, ["Wizard"])
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="Magic Initiate \\(Cleric\\): pick two cantrips"):
            builder.create(duckdb_session, c.id, self._acolyte())
        with pytest.raises(ValueError, match="doesn't fit"):
            builder.create(
                duckdb_session,
                c.id,
                self._acolyte(
                    background_feat_picks={"spells": [cantrips[0], "P128 Arcane Spark", firsts[0]]}
                ),
            )
        with pytest.raises(ValueError, match="uses the Cleric list"):
            builder.create(
                duckdb_session,
                c.id,
                self._acolyte(background_feat_picks={"choice": "Wizard", "spells": []}),
            )
        res = builder.create(
            duckdb_session,
            c.id,
            self._acolyte(background_feat_picks={"spells": cantrips[:2] + firsts[:1]}),
        )
        assert _known(duckdb_session, c, res) == set(cantrips[:2] + firsts[:1])
        assert "Magic Initiate (Cleric)" in _pc(duckdb_session, c, res).feats

    def test_a_humans_versatile_feat_has_its_own_picks(self, duckdb_session: Session):
        cantrips = _spells(duckdb_session, "Temple chant", "Cleric", 0, 3)
        firsts = _spells(duckdb_session, "Temple rite", "Cleric", 1, 2)
        c = _campaign(duckdb_session)
        human = dict(
            species="Human",
            skills=["Perception", "Survival", "Arcana"],
            background_feat_picks={"spells": cantrips[:2] + firsts[:1]},
        )
        with pytest.raises(ValueError, match="already uses the Cleric list"):
            builder.create(
                duckdb_session,
                c.id,
                self._acolyte(
                    **human, origin_feat="Magic Initiate", origin_feat_picks={"choice": "Cleric"}
                ),
            )
        with pytest.raises(ValueError, match="Skilled: pick 1 more skill"):
            builder.create(
                duckdb_session,
                c.id,
                self._acolyte(
                    **human,
                    origin_feat="Skilled",
                    origin_feat_picks={"skills": ["History", "Nature"]},
                ),
            )
        with pytest.raises(ValueError, match="picks an Origin feat"):
            builder.create(duckdb_session, c.id, self._acolyte(**human))
        res = builder.create(
            duckdb_session,
            c.id,
            self._acolyte(
                **human,
                origin_feat="Skilled",
                origin_feat_picks={"skills": ["History", "Nature", "Stealth"]},
            ),
        )
        assert {"History", "Nature", "Stealth"} <= set(
            _pc(duckdb_session, c, res).skill_proficiencies
        )


class TestClassChoices:
    def test_a_fighter_picks_its_style_and_masteries(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        with pytest.raises(ValueError, match="Fighting Style: choose one"):
            builder.create(
                duckdb_session,
                c.id,
                _build(
                    skills=FIGHTER["skills"],
                    class_choices=_choices(weapon_mastery=["Longsword", "Javelin", "Greatsword"]),
                ),
            )
        with pytest.raises(ValueError, match="Weapon Mastery: choose 1 more kind of weapon"):
            builder.create(
                duckdb_session,
                c.id,
                _build(
                    skills=FIGHTER["skills"],
                    class_choices=_choices(
                        fighting_style=["Defense"], weapon_mastery=["Longsword", "Javelin"]
                    ),
                ),
            )
        with pytest.raises(ValueError, match="Pick 1 more skill"):
            builder.create(duckdb_session, c.id, _build(class_choices=FIGHTER["class_choices"]))
        res = builder.create(duckdb_session, c.id, _build(**FIGHTER))
        pc = _pc(duckdb_session, c, res)
        assert res.ac == 19  # chain mail 16 + shield 2 + Defense 1
        assert pc.feats == [
            "Savage Attacker",
            "Defense",
            "Weapon Mastery: Longsword",
            "Weapon Mastery: Javelin",
            "Weapon Mastery: Greatsword",
        ]
        assert "Class choices: Fighting Style: Defense; Weapon Mastery:" in (pc.notes or "")

    def test_weapon_mastery_follows_the_class(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        barbarian = dict(
            character_class="Barbarian",
            kit="Greataxe & handaxes",
            skills=["Perception", "Survival"],
        )
        with pytest.raises(ValueError, match="can't master the Longbow"):
            builder.create(
                duckdb_session,
                c.id,
                _build(**barbarian, class_choices=_choices(weapon_mastery=["Greataxe", "Longbow"])),
            )
        rogue = dict(
            character_class="Rogue",
            species="Halfling",
            background="Criminal",
            kit="Leather, shortsword, shortbow, daggers",
            scores={"DEX": 15, "CON": 14, "INT": 13, "WIS": 12, "CHA": 10, "STR": 8},
            background_bonus={"DEX": 2, "CON": 1},
            skills=["Acrobatics", "Perception", "Investigation", "Deception"],
        )
        with pytest.raises(ValueError, match="can't master the Longsword"):
            builder.create(
                duckdb_session,
                c.id,
                _build(
                    **rogue,
                    class_choices=_choices(
                        expertise=["Stealth", "Perception"], weapon_mastery=["Longsword", "Dagger"]
                    ),
                ),
            )
        with pytest.raises(ValueError, match="trained in Athletics first"):
            builder.create(
                duckdb_session,
                c.id,
                _build(
                    **rogue,
                    class_choices=_choices(
                        expertise=["Stealth", "Athletics"], weapon_mastery=["Shortbow", "Dagger"]
                    ),
                ),
            )
        res = builder.create(
            duckdb_session,
            c.id,
            _build(
                **rogue,
                class_choices=_choices(
                    expertise=["Stealth", "Perception"], weapon_mastery=["Shortbow", "Dagger"]
                ),
            ),
        )
        skills = _pc(duckdb_session, c, res).skill_proficiencies
        assert skills["Stealth"] == 2 and skills["Perception"] == 2 and skills["Acrobatics"] == 1

    def test_unknown_and_unasked_choices_are_refused(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        extra = FIGHTER["class_choices"] + [{"key": "metamagic", "picks": ["Twinned Spell"]}]
        with pytest.raises(ValueError, match="has no Metamagic to choose"):
            builder.create(duckdb_session, c.id, _build(**{**FIGHTER, "class_choices": extra}))
        bad = FIGHTER["class_choices"] + [{"key": "made_up", "picks": ["x"]}]
        with pytest.raises(ValueError, match="Unknown class choice"):
            builder.create(duckdb_session, c.id, _build(**{**FIGHTER, "class_choices": bad}))

    def test_an_older_caller_is_told_what_is_still_open(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        res = builder.create(duckdb_session, c.id, _build())
        assert any(
            "Still to choose on the sheet: Fighting Style, Weapon Mastery" in w
            for w in res.warnings
        )


class TestClassChoiceRules:
    """The shared rules in ``feat_rules.apply_class_choices``, without a database."""

    def _apply(self, cls, level, sub=None, cantrips=(), skills=None, **picks):
        feats: list[str] = []
        sk = dict(skills or {})
        lines: list[str] = []
        warns: list[str] = []
        effects = feat_rules.apply_class_choices(
            cls,
            level,
            sub,
            {k: (v, []) if isinstance(v, list) else v for k, v in picks.items()},
            feats,
            sk,
            list(cantrips),
            lines,
            warns,
        )
        return feats, sk, effects, warns

    def test_counts_by_level(self):
        assert rules.class_choice_counts("Fighter", 1) == {"fighting_style": 1, "weapon_mastery": 3}
        assert rules.class_choice_counts("Fighter", 7, "Champion") == {
            "fighting_style": 2,
            "weapon_mastery": 4,
        }
        assert rules.class_choice_counts("Paladin", 1) == {"weapon_mastery": 2}
        assert rules.class_choice_counts("Warlock", 5) == {"invocations": 5}
        assert rules.class_choice_counts("Rogue", 6)["expertise"] == 4
        assert rules.class_choice_counts("Monk", 5) == {}

    def test_orders_and_extra_cantrips(self):
        feats, _, effects, _ = self._apply("Cleric", 1, divine_order=["Thaumaturge"])
        assert feats == ["Divine Order: Thaumaturge"]
        assert effects["cantrips"] == 1 and effects["cantrip_lists"] == ["Cleric"]
        feats, _, _, _ = self._apply("Cleric", 1, divine_order=["Protector"])
        assert "heavy" in feat_rules.armor_training("Cleric", feats)
        feats, _, effects, _ = self._apply(
            "Paladin",
            2,
            weapon_mastery=["Longsword", "Javelin"],
            fighting_style=["Blessed Warrior"],
        )
        assert "Fighting Style: Blessed Warrior" in feats and effects["cantrips"] == 2
        with pytest.raises(ValueError, match="Divine Order is chosen from its list"):
            self._apply("Cleric", 1, divine_order=([], ["Shepherd"]))

    def test_invocation_prerequisites(self):
        class Spell:
            def __init__(self, dice, attack):
                self.damage_dice, self.attack_type = dice, attack

        blast = Spell("1d10", "ranged")
        with pytest.raises(ValueError, match="needs a Warlock cantrip that deals damage"):
            self._apply(
                "Warlock", 2, invocations=["Agonizing Blast", "Armor of Shadows", "Eldritch Mind"]
            )
        with pytest.raises(ValueError, match="needs Warlock level 5"):
            self._apply(
                "Warlock",
                2,
                cantrips=[blast],
                invocations=["Thirsting Blade", "Pact of the Blade", "Eldritch Mind"],
            )
        with pytest.raises(ValueError, match="needs Pact of the Blade"):
            self._apply(
                "Warlock",
                5,
                cantrips=[blast],
                invocations=[
                    "Thirsting Blade",
                    "Agonizing Blast",
                    "Eldritch Mind",
                    "Devil's Sight",
                    "Misty Visions",
                ],
            )
        feats, _, _, warns = self._apply(
            "Warlock",
            2,
            cantrips=[blast],
            invocations=(["Agonizing Blast", "Repelling Blast"], ["Gift of the Ever-Living"]),
        )
        assert "Eldritch Invocation: Gift of the Ever-Living" in feats
        assert any("recorded by name" in w for w in warns)

    def test_champion_styles_metamagic_and_land(self):
        feats, _, _, _ = self._apply(
            "Fighter",
            7,
            "Champion",
            fighting_style=["Defense", "Archery"],
            weapon_mastery=["Longsword", "Longbow", "Dagger", "Spear"],
        )
        assert {"Defense", "Archery"} <= set(feats)
        with pytest.raises(ValueError, match="Defense is picked twice"):
            self._apply(
                "Fighter",
                7,
                "Champion",
                fighting_style=["Defense", "Defense"],
                weapon_mastery=["Longsword", "Longbow", "Dagger", "Spear"],
            )
        feats, _, _, _ = self._apply("Sorcerer", 2, metamagic=["Twinned Spell", "Quickened Spell"])
        assert feats == ["Metamagic: Twinned Spell", "Metamagic: Quickened Spell"]
        feats, _, effects, _ = self._apply(
            "Druid", 3, "Circle of the Land", primal_order=["Warden"], land=["Polar"]
        )
        assert effects["land"] == "Polar" and "Circle of the Land: Polar" in feats

    def test_skill_choices(self):
        _, skills, _, _ = self._apply(
            "Bard",
            3,
            "College of Lore",
            skills={"Performance": 1, "Persuasion": 1, "Insight": 1},
            expertise=["Performance", "Persuasion"],
            bonus_proficiencies=["Arcana", "History", "Nature"],
        )
        assert skills["Performance"] == 2 and skills["Arcana"] == 1
        with pytest.raises(ValueError, match="pick from Arcana, History"):
            self._apply("Wizard", 2, skills={"Insight": 1}, scholar=["Insight"])
        with pytest.raises(ValueError, match="Primal Knowledge: pick from"):
            self._apply(
                "Barbarian",
                3,
                "Berserker",
                weapon_mastery=["Greataxe", "Handaxe"],
                primal_knowledge=["Arcana"],
            )


class TestOptions:
    def test_spells_carry_their_details_and_hide_other_dms_homebrew(self, duckdb_session: Session):
        c = _campaign(duckdb_session)
        _spell(duckdb_session, "P128 Mine", 1, ["Wizard"], owner=c.dm_email)
        _spell(duckdb_session, "P128 Theirs", 1, ["Wizard"], owner="someone-else@example.com")
        o = builder.options(duckdb_session, c.id)
        names = {s["name"] for s in o.spells}
        assert "P128 Mine" in names and "P128 Theirs" not in names
        mine = next(s for s in o.spells if s["name"] == "P128 Mine")
        assert mine["casting_time"] == "1 action" and mine["range"] == "60 feet"
        assert mine["text"].startswith("P128 Mine does a thing.")
        assert o.class_choices["Fighter"]["weapon_mastery"][0] == [1, 3]
        assert o.choice_kinds["divine_order"]["options"][0]["name"] == "Protector"
        assert o.always_prepared_class["Paladin"][2] == ["Divine Smite"]
        assert any(w["name"] == "Longsword" and w["mastery"] == "Sap" for w in o.mastery_weapons)
        assert any(s["label"] == "Lay on Hands pool" for s in o.class_scales["Paladin"])
