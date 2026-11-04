"""Plan 135 (FT) — homebrew feats in the character builder and the level-up guide.

James (beta, 11/4, a 2014 Zelda campaign) found that the free 2014 rules have one feat
(Grappler) and asked to write his own. A DM's homebrew feat is a real pick wherever a feat is
picked, in both editions: at every Ability Score Improvement of a build, on a level-up's feat
pick, and (a fighting style) in the Fighting Style choice. The builder and the level-up guide
apply the same rules, so a PC built at level 4 and one levelled 3 → 4 end up the same.

Also pinned here: a 2014 character only ever reads the 2014 feat tables (plus its DM's
homebrew); no 2024 feat row, name or blurb reaches its builder options or level-up plan.
"""

import uuid

import pytest

import services.campaign_service as camp_svc
import services.homebrew_service as hb_svc
from domain.character_builder import CharacterBuild
from domain.homebrew import HomebrewFeatCreate
from domain.level_up import FeatChoice, LevelUpChoices
from integrations.dnd_rules import rulesets
from services import character_builder_service as builder
from services import character_service, feat_rules, levelup_service

STANDARD = {"STR": 15, "DEX": 13, "CON": 14, "INT": 8, "WIS": 12, "CHA": 10}
KIT_2014 = "Chain mail, longsword & shield, light crossbow"
KIT_2024 = "Chain mail, longsword & shield"
DEADEYE_TEXT = "Your ranged attacks can take −5 to hit for +10 damage."
# Feat names only the 2024 tables have: none may reach a 2014 character.
ONLY_2024 = {f["name"] for f in rulesets.levelup("2024").FEATS} - {
    f["name"] for f in rulesets.levelup("2014").FEATS
}


def _dm() -> str:
    """A fresh DM email."""
    return f"dm135ft_{uuid.uuid4().hex[:8]}@example.com"


def _campaign(db, dm: str, ruleset: str = "2014"):
    """A campaign of ``dm`` in ``ruleset``."""
    return camp_svc.create_campaign(
        db, name="Hyrule", setting="R", tone="T", dm_email=dm, ruleset=ruleset
    )


def _feat(db, dm: str, name: str = "Deadeye", **extras):
    """A homebrew feat; by default James's 2014 Deadeye (+1 DEX, −5/+10 ranged)."""
    payload = {
        "name": name,
        "ruleset": "2014",
        "blurb": "Long shots and hard hits.",
        "description": DEADEYE_TEXT,
        "prerequisite": "A bow you love.",
        "asi_options": ["DEX"],
        "power_attack": {"to_hit": -5, "damage": 10, "weapons": "ranged"},
    }
    payload.update(extras)
    return hb_svc.create_feat(db, HomebrewFeatCreate(**payload), dm)


def _build(**over) -> CharacterBuild:
    """A 2014 Human Champion Fighter (Archery), level 4 unless told otherwise."""
    base = dict(
        character_name="Sheik",
        player_name="James",
        species="Human",
        character_class="Fighter",
        subclass="Champion",
        background="Acolyte",
        level=4,
        scores=dict(STANDARD),
        score_method="standard",
        background_bonus={},
        skills=["Athletics", "Perception"],
        kit=KIT_2014,
        class_choices=[{"key": "fighting_style", "picks": ["Archery"]}],
        asi=[],
    )
    base.update(over)
    return CharacterBuild(**base)


def _pick(name: str, level: int = 4, **asi) -> dict:
    """One improvement pick for the build: a feat with its +1s."""
    return {"level": level, "name": name, "asi": asi}


def _sheet(db, campaign, pc_id):
    """The PC as the DM reads it."""
    return character_service.get_character(db, uuid.UUID(str(pc_id)), campaign.dm_email)


def _levelled(db, campaign, feat: FeatChoice, level: int = 3, **over):
    """A PC built at ``level`` and levelled once with ``feat``: (result, sheet)."""
    res = builder.create(db, campaign.id, _build(level=level, **over))
    pc_id = uuid.UUID(res.pc_id)
    levelup_service.grant(db, pc_id, campaign.dm_email)
    out = levelup_service.apply(db, pc_id, LevelUpChoices(feat=feat))
    return out, _sheet(db, campaign, pc_id)


# ── Offered ─────────────────────────────────────────────────────────────────


def test_builder_options_carry_the_dms_feats(duckdb_session):
    """The 2014 options list Deadeye (homebrew, with its text) and a both-editions feat, after
    the rules' own; a 2024-only feat and another DM's never show."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm)
    _feat(duckdb_session, dm, name="Brawler", ruleset=None, asi_options="any", power_attack=None)
    _feat(duckdb_session, dm, name="Gunner", ruleset="2024")
    _feat(duckdb_session, _dm(), name="Stranger")
    opts = builder.options_for_dm(duckdb_session, c.id, dm)
    names = [f["name"] for f in opts.feats]
    rules_names = [f["name"] for f in rulesets.levelup("2014").FEATS]
    assert names == rules_names + ["Brawler", "Deadeye"]
    deadeye = opts.feats[-1]
    assert deadeye["homebrew"] is True and deadeye["srd"] is False
    assert deadeye["asi_options"] == ["DEX"] and deadeye["category"] == "general"
    assert deadeye["description"] == DEADEYE_TEXT
    assert deadeye["prerequisite"] == "A bow you love."
    assert deadeye["power_attack"] == {"to_hit": -5, "damage": 10, "weapons": "ranged"}
    assert deadeye["blurb"] == "Long shots and hard hits." and deadeye["prereq"] == {}
    assert opts.feats[-2]["asi_options"] == "any"
    assert not any(f.get("homebrew") for f in opts.feats[: len(rules_names)])


def test_a_feat_with_no_blurb_shows_the_start_of_its_text():
    """The builder's one line falls back to the full text, cut short."""
    feat = HomebrewFeatCreate(name="Quiet", description="Word " * 60)
    row = feat_rules.homebrew_row(_read(feat))
    assert row["blurb"].endswith("…") and len(row["blurb"]) <= 160


def _read(create: HomebrewFeatCreate):
    """A read model for a feat that was never stored (for the pure row helpers)."""
    from datetime import UTC, datetime

    from domain.homebrew import HomebrewFeatRead

    now = datetime.now(UTC)
    return HomebrewFeatRead(
        id=uuid.uuid4(),
        created_by_email="x@example.com",
        created_at=now,
        updated_at=now,
        **create.model_dump(),
    )


# ── Taken: built at 4, levelled 3 → 4 ───────────────────────────────────────


def test_deadeye_at_a_2014_level_4_build(duckdb_session):
    """DEX 13 + 1 (Human) + 1 (Deadeye) = 15; Deadeye on the sheet and in the notes."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm)
    res = builder.create(duckdb_session, c.id, _build(asi=[_pick("deadeye", DEX=1)]))
    pc = _sheet(duckdb_session, c, res.pc_id)
    assert pc.score_dex == 15
    assert pc.feats == ["Archery", "Deadeye"]
    assert "Level 4: Deadeye (+1 DEX)" in pc.notes
    assert not any("book" in w for w in res.warnings)


def test_deadeye_on_a_3_to_4_level_up_matches_the_build(duckdb_session):
    """The guide offers Deadeye at 4 with the DM's text; taking it ends where the build does."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm)
    res = builder.create(duckdb_session, c.id, _build(level=3))
    pc_id = uuid.UUID(res.pc_id)
    levelup_service.grant(duckdb_session, pc_id, dm)
    plan = levelup_service.plan_for(duckdb_session, pc_id)
    offered = next(f for f in plan.feats if f.name == "Deadeye")
    assert offered.ok and offered.homebrew and offered.asi_options == ["DEX"]
    assert offered.description == DEADEYE_TEXT and offered.prerequisite == "A bow you love."
    assert offered.power_attack == {"to_hit": -5, "damage": 10, "weapons": "ranged"}
    # Popular (none in 2014), then the DM's, then the rules' own.
    assert [f.name for f in plan.feats if f.ok][:2] == ["Deadeye", "Ability Score Improvement"]

    out = levelup_service.apply(
        duckdb_session, pc_id, LevelUpChoices(feat=FeatChoice(name="Deadeye", asi={"DEX": 1}))
    )
    assert "Deadeye (+1 DEX)" in out.summary
    levelled = _sheet(duckdb_session, c, pc_id)
    built = _sheet(
        duckdb_session,
        c,
        builder.create(
            duckdb_session, c.id, _build(character_name="B", asi=[_pick("Deadeye", DEX=1)])
        ).pc_id,
    )
    assert levelled.score_dex == built.score_dex == 15
    assert levelled.feats == built.feats == ["Archery", "Deadeye"]


def test_dex_stops_at_20(duckdb_session):
    """At DEX 20 the +1 is refused, in the build and on the level-up."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm)
    high = {**STANDARD, "DEX": 19}  # 19 + 1 (Human) = 20
    with pytest.raises(ValueError, match="20 is the most"):
        builder.create(
            duckdb_session,
            c.id,
            _build(scores=high, score_method="manual", asi=[_pick("Deadeye", DEX=1)]),
        )
    with pytest.raises(ValueError, match="can't go above 20"):
        _levelled(
            duckdb_session,
            c,
            FeatChoice(name="Deadeye", asi={"DEX": 1}),
            scores=high,
            score_method="manual",
        )


# ── The +1 ──────────────────────────────────────────────────────────────────


def test_any_takes_any_ability_and_a_list_refuses_others(duckdb_session):
    """ "any" lets the player raise WIS; Deadeye (DEX only) refuses STR, both ways."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm)
    _feat(duckdb_session, dm, name="Gifted", asi_options="any", power_attack=None)
    res = builder.create(duckdb_session, c.id, _build(asi=[_pick("Gifted", WIS=1)]))
    assert _sheet(duckdb_session, c, res.pc_id).score_wis == 14  # 12 + 1 + 1
    _out, pc = _levelled(duckdb_session, c, FeatChoice(name="Gifted", asi={"CHA": 1}))
    assert pc.score_cha == 12 and "Gifted" in pc.feats

    with pytest.raises(ValueError, match="Deadeye can raise only DEX"):
        builder.create(duckdb_session, c.id, _build(asi=[_pick("Deadeye", STR=1)]))
    with pytest.raises(ValueError, match="Deadeye can raise only DEX"):
        _levelled(duckdb_session, c, FeatChoice(name="Deadeye", asi={"STR": 1}))
    with pytest.raises(ValueError, match="pick which"):
        builder.create(duckdb_session, c.id, _build(asi=[_pick("Deadeye")]))


def test_a_feat_without_an_increase_refuses_one(duckdb_session):
    """No ``asi_options``: no +1 may be sent with it."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm, name="Lucky Star", asi_options=None, power_attack=None)
    with pytest.raises(ValueError, match="doesn't raise an ability score"):
        builder.create(duckdb_session, c.id, _build(asi=[_pick("Lucky Star", DEX=1)]))
    res = builder.create(duckdb_session, c.id, _build(asi=[_pick("Lucky Star")]))
    pc = _sheet(duckdb_session, c, res.pc_id)
    assert pc.score_dex == 14 and pc.feats == ["Archery", "Lucky Star"]


# ── Whose feats, and which rules ────────────────────────────────────────────


def test_another_dms_feat_is_refused(duckdb_session):
    """A feat of another DM is an unknown feat, at the build and on the level-up."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, _dm(), name="Stranger")
    with pytest.raises(ValueError, match="Unknown feat 'Stranger'"):
        builder.create(duckdb_session, c.id, _build(asi=[_pick("Stranger", DEX=1)]))
    with pytest.raises(ValueError, match="Unknown feat 'Stranger'"):
        _levelled(duckdb_session, c, FeatChoice(name="Stranger", asi={"DEX": 1}))


def test_a_2024_only_feat_is_refused_in_a_2014_campaign(duckdb_session):
    """The DM's 2024-only feat isn't offered or accepted in their 2014 campaign; it is in 2024."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm, name="Gunner", ruleset="2024")
    with pytest.raises(ValueError, match="Unknown feat 'Gunner'"):
        builder.create(duckdb_session, c.id, _build(asi=[_pick("Gunner", DEX=1)]))
    res = builder.create(duckdb_session, c.id, _build(level=3))
    levelup_service.grant(duckdb_session, uuid.UUID(res.pc_id), dm)
    plan = levelup_service.plan_for(duckdb_session, uuid.UUID(res.pc_id))
    assert "Gunner" not in [f.name for f in plan.feats]

    modern = _campaign(duckdb_session, dm, ruleset="2024")
    opts = builder.options_for_dm(duckdb_session, modern.id, dm)
    assert "Gunner" in [f["name"] for f in opts.feats]


def test_a_book_entry_cant_borrow_a_homebrew_name(duckdb_session):
    """Typing the DM's feat under "From my book" is refused: pick it from the list."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm)
    book = {"level": 4, "name": "Deadeye", "from_book": True, "asi": {"STR": 1}}
    with pytest.raises(ValueError, match="one of your DM's feats"):
        builder.create(duckdb_session, c.id, _build(asi=[book]))
    with pytest.raises(ValueError, match="one of your DM's feats"):
        _levelled(duckdb_session, c, FeatChoice(name="deadeye", from_book=True))


# ── Taken again ─────────────────────────────────────────────────────────────


def test_repeatable_feats_can_be_taken_twice_and_others_cant(duckdb_session):
    """Fighter 2014 improves at 4 and 6: Deadeye twice is refused, a repeatable feat isn't."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm)
    _feat(
        duckdb_session, dm, name="Toughened", asi_options="any", repeatable=True, power_attack=None
    )
    twice = [_pick("Deadeye", 4, DEX=1), _pick("Deadeye", 6, DEX=1)]
    with pytest.raises(ValueError, match="Level 6: Deadeye: Already taken"):
        builder.create(duckdb_session, c.id, _build(level=6, asi=twice))
    again = [_pick("Toughened", 4, CON=1), _pick("Toughened", 6, CON=1)]
    res = builder.create(duckdb_session, c.id, _build(level=6, asi=again))
    pc = _sheet(duckdb_session, c, res.pc_id)
    assert pc.score_con == 17 and pc.feats.count("Toughened") == 2

    # On a level-up 5 → 6: Deadeye already on the sheet is locked, Toughened is offered.
    res = builder.create(
        duckdb_session,
        c.id,
        _build(character_name="C", level=5, asi=[_pick("Deadeye", DEX=1)]),
    )
    levelup_service.grant(duckdb_session, uuid.UUID(res.pc_id), dm)
    plan = levelup_service.plan_for(duckdb_session, uuid.UUID(res.pc_id))
    by_name = {f.name: f for f in plan.feats}
    assert not by_name["Deadeye"].ok and by_name["Deadeye"].reason == "Already taken."
    assert by_name["Toughened"].ok and by_name["Toughened"].repeatable
    with pytest.raises(ValueError, match="Already taken"):
        levelup_service.apply(
            duckdb_session,
            uuid.UUID(res.pc_id),
            LevelUpChoices(feat=FeatChoice(name="Deadeye", asi={"DEX": 1})),
        )


# ── Kinds: epic boons, fighting styles, origin feats ────────────────────────


def test_an_epic_boon_comes_at_level_19():
    """Locked below 19 in both editions, offered from 19."""
    row = feat_rules.homebrew_row(_read(HomebrewFeatCreate(name="Boon", category="epic_boon")))
    for ruleset in ("2014", "2024"):
        for level, ok in ((16, False), (19, True)):
            opts = feat_rules.feat_options(
                "Fighter", level, dict(STANDARD), [], None, ruleset, [row]
            )
            boon = next(f for f in opts if f.name == "Boon")
            assert boon.ok is ok, (ruleset, level)
            if not ok:
                assert boon.reason == "An epic boon comes at level 19."


def test_an_origin_feat_is_offered_at_an_improvement_in_both_editions():
    """2024 lets an Origin feat be taken at an improvement; in 2014 it's simply a feat."""
    row = feat_rules.homebrew_row(_read(HomebrewFeatCreate(name="Farmhand", category="origin")))
    for ruleset in ("2014", "2024"):
        opts = feat_rules.feat_options("Fighter", 4, dict(STANDARD), [], None, ruleset, [row])
        assert next(f for f in opts if f.name == "Farmhand").ok


def test_a_homebrew_fighting_style_in_the_2014_builder(duckdb_session):
    """It joins the Fighting Style choice and lands on the sheet; it's never an improvement."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(
        duckdb_session,
        dm,
        name="Sky Fighting",
        category="fighting_style",
        asi_options=None,
        power_attack=None,
    )
    res = builder.create(
        duckdb_session,
        c.id,
        _build(
            level=1,
            subclass=None,
            class_choices=[{"key": "fighting_style", "picks": ["Sky Fighting"]}],
        ),
    )
    assert _sheet(duckdb_session, c, res.pc_id).feats == ["Sky Fighting"]
    with pytest.raises(ValueError, match="Fighting styles come from the Fighting Style feature"):
        builder.create(duckdb_session, c.id, _build(asi=[_pick("Sky Fighting")]))


def test_a_homebrew_fighting_style_on_a_2014_ranger_level_up(duckdb_session):
    """A Ranger reaching 2 is offered the DM's style (marked) and can take it."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(
        duckdb_session,
        dm,
        name="Sky Fighting",
        category="fighting_style",
        asi_options=None,
        power_attack=None,
    )
    res = builder.create(
        duckdb_session,
        c.id,
        _build(
            character_class="Ranger",
            subclass=None,
            level=1,
            kit=None,
            skills=["Survival", "Stealth", "Nature"],
            class_choices=None,
        ),
    )
    pc_id = uuid.UUID(res.pc_id)
    levelup_service.grant(duckdb_session, pc_id, dm)
    plan = levelup_service.plan_for(duckdb_session, pc_id)
    step = next(s for s in plan.class_choices if s.key == "fighting_style")
    sky = next(o for o in step.options if o.name == "Sky Fighting")
    assert sky.homebrew and sky.ok
    assert not next(o for o in step.options if o.name == "Archery").homebrew
    out = levelup_service.apply(
        duckdb_session,
        pc_id,
        LevelUpChoices.model_validate(
            {"class_choices": [{"key": "fighting_style", "picks": ["Sky Fighting"]}]}
        ),
    )
    assert "Fighting Style: Sky Fighting" in out.summary
    assert "Sky Fighting" in _sheet(duckdb_session, c, pc_id).feats


def test_a_2024_fighter_can_take_a_homebrew_style_at_an_improvement(duckdb_session):
    """2024 rules: a style feat at an improvement needs the Fighting Style feature (a Fighter
    has it), as the rules' own styles do."""
    dm = _dm()
    c = _campaign(duckdb_session, dm, ruleset="2024")
    _feat(
        duckdb_session,
        dm,
        name="Sky Fighting",
        ruleset="2024",
        category="fighting_style",
        asi_options=None,
        power_attack=None,
    )
    fighter = feat_rules.feat_options(
        "Fighter",
        4,
        dict(STANDARD),
        [],
        None,
        "2024",
        builder._homebrew_feats(duckdb_session, c),
    )
    wizard = feat_rules.feat_options(
        "Wizard",
        4,
        dict(STANDARD),
        [],
        None,
        "2024",
        builder._homebrew_feats(duckdb_session, c),
    )
    assert next(f for f in fighter if f.name == "Sky Fighting").ok
    assert next(f for f in wizard if f.name == "Sky Fighting").reason == (
        "Needs the Fighting Style feature."
    )


# ── A 2014 character reads only the 2014 feat tables ─────────────────────────


def test_2014_builder_options_have_no_2024_feat(duckdb_session):
    """Feats, popular picks, Origin feats and the Fighting Style options: 2014 only (and the
    DM's homebrew)."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    _feat(duckdb_session, dm)
    opts = builder.options_for_dm(duckdb_session, c.id, dm)
    names = {f["name"] for f in opts.feats}
    assert not names & ONLY_2024
    assert names - {"Deadeye"} == {f["name"] for f in rulesets.levelup("2014").FEATS}
    assert opts.popular_feats == {} and opts.origin_feats == []
    blob = opts.model_dump_json()
    for name in ONLY_2024:
        assert f'"{name}"' not in blob, name


def test_2014_level_up_shows_no_2024_feat_even_for_a_book_feat_of_that_name(duckdb_session):
    """A 2014 PC who took "Sharpshooter" from the book never meets the 2024 row or its text."""
    dm = _dm()
    c = _campaign(duckdb_session, dm)
    res = builder.create(
        duckdb_session,
        c.id,
        _build(
            level=5,
            asi=[{"level": 4, "name": "Sharpshooter", "from_book": True, "asi": {}}],
        ),
    )
    pc_id = uuid.UUID(res.pc_id)
    assert _sheet(duckdb_session, c, pc_id).feats == ["Archery", "Sharpshooter"]
    levelup_service.grant(duckdb_session, pc_id, dm)
    plan = levelup_service.plan_for(duckdb_session, pc_id)
    assert plan.asi_level and plan.ruleset.value == "2014"
    assert not {f.name for f in plan.feats} & ONLY_2024
    sharp = rulesets.levelup("2024").FEATS_BY_NAME["sharpshooter"]["blurb"]
    assert sharp not in plan.model_dump_json()


def test_2014_feat_rules_read_the_2014_tables():
    """Every feat rule given "2014" answers from the 2014 tables, never the 2024 default."""
    assert not feat_rules.has_fighting_style("Wizard", 4, ["Blind Fighting"], "2014")
    assert feat_rules.has_fighting_style("Wizard", 4, ["Blind Fighting"], "2024")
    assert feat_rules.hp_bonus_per_level(None, None, ["Tough"], "2014") == 0
    assert feat_rules.hp_bonus_per_level(None, None, ["Tough"], "2024") == 2
    opts = feat_rules.feat_options("Fighter", 4, dict(STANDARD), [], None, "2014")
    assert {f.name for f in opts} == {f["name"] for f in rulesets.levelup("2014").FEATS}
    styles = {r["name"] for r in feat_rules.choice_rows("Fighter", "fighting_style", "2014")}
    assert not styles & ONLY_2024 and "Archery" in styles
