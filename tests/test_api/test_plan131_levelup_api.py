"""Plan 131 — the level-up guide over HTTP for a 2014 PC.

The plan says which rules it follows and carries the 2014 class choices; the apply route
takes ``class_choices`` and refuses bad picks with a 422, as every other choice.
"""

import pytest
from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.spell_service as spell_svc
from db.repos.spell_repo import SpellRepo
from domain.character import CharacterSpellCreate
from domain.enums import CharacterClass
from services import spellcasting_service

# These suites address players by UUID (pre-token links); see conftest.uuid_play_links.
pytestmark = pytest.mark.usefixtures("uuid_play_links")

DM = "dm131@example.com"
HDR = {"X-MS-CLIENT-PRINCIPAL-NAME": DM}


def _seed(engine, ruleset: str, cls: CharacterClass, level: int, **over) -> str:
    """Both spell catalogs, one campaign of ``ruleset`` and one PC; returns the PC's id."""
    with Session(engine) as s:
        spell_svc.seed_srd_spells(s)
        campaign = camp_svc.create_campaign(s, name="C", dm_email=DM, ruleset=ruleset)
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=DM,
            player_name="P",
            character_name="Vex",
            race="Tiefling",
            character_class=cls,
            level=level,
            score_str=8,
            score_dex=14,
            score_con=14,
            score_int=10,
            score_wis=12,
            score_cha=16,
            hp_max=8 * level,
            hp_current=8 * level,
            ac=13,
            subclass=over.get("subclass"),
            feats=over.get("feats"),
        )
        for name in over.get("spells", []):
            spell = SpellRepo.get_by_name(s, name, ruleset=ruleset)
            spellcasting_service.learn_spell(
                s, pc.id, CharacterSpellCreate(spell_id=spell.id, known=True, prepared=True), DM
            )
        return str(pc.id)


def test_2014_warlock_takes_its_pact_boon_over_http(client, api_engine):
    """The plan carries the Pact Boon choice; bad and missing picks are a 422; a good pick lands."""
    pc_id = _seed(
        api_engine,
        "2014",
        CharacterClass.WARLOCK,
        2,
        subclass="The Fiend",
        feats=["Eldritch Invocation: Agonizing Blast", "Eldritch Invocation: Devil's Sight"],
        spells=["Eldritch Blast", "Minor Illusion", "Charm Person", "Hellish Rebuke"],
    )
    assert client.post(f"/api/characters/{pc_id}/level-up", json={}, headers=HDR).status_code == 200
    plan = client.get(f"/api/play/{pc_id}/level-up").json()
    assert plan["ruleset"] == "2014"
    boon = next(c for c in plan["class_choices"] if c["key"] == "pact_boon")
    assert boon["count"] == 1 and boon["kind"] == "option"
    assert [o["name"] for o in boon["options"]] == [
        "Pact of the Chain",
        "Pact of the Blade",
        "Pact of the Tome",
    ]
    assert plan["spellcasting"]["new_spells"] == 1 and plan["spellcasting"]["spell_swap"]

    bad = {"class_choices": [{"key": "pact_boon", "picks": ["Pact of the Moon"]}]}
    res = client.post(f"/api/play/{pc_id}/level-up", json=bad)
    assert res.status_code == 422 and "isn't one of the choices" in res.json()["detail"]
    missing = client.post(f"/api/play/{pc_id}/level-up", json={})
    assert missing.status_code == 422 and "Pact Boon" in missing.json()["detail"]

    body = {
        "spells": ["Scorching Ray"],
        "class_choices": [{"key": "pact_boon", "picks": ["Pact of the Tome"]}],
    }
    res = client.post(f"/api/play/{pc_id}/level-up", json=body)
    assert res.status_code == 200, res.text
    assert "Pact Boon: Pact of the Tome" in res.json()["summary"]
    sheet = client.get(f"/api/play/{pc_id}").json()
    assert sheet["level"] == 3 and "Pact Boon: Pact of the Tome" in sheet["feats"]


def test_2014_paladin_plan_shows_its_first_spells(client, api_engine):
    """A 2014 Paladin's level 2 plan: first spells, CHA + 1 prepared, 2 slots, a Fighting Style."""
    pc_id = _seed(api_engine, "2014", CharacterClass.PALADIN, 1)
    client.post(f"/api/characters/{pc_id}/level-up", json={}, headers=HDR)
    plan = client.get(f"/api/play/{pc_id}/level-up").json()
    sc = plan["spellcasting"]
    assert sc["first_spells"] and sc["prepared_count"] == 4 and sc["new_spells"] == 4
    assert plan["slots_before"] == {} and plan["slots_after"] == {"1": 2}
    assert [c["key"] for c in plan["class_choices"]] == ["fighting_style"]


def test_2024_plan_says_2024_and_takes_no_class_choices(client, api_engine):
    """A 2024 plan says so, has no class choices and refuses any sent."""
    pc_id = _seed(api_engine, "2024", CharacterClass.ROGUE, 3)
    client.post(f"/api/characters/{pc_id}/level-up", json={}, headers=HDR)
    plan = client.get(f"/api/play/{pc_id}/level-up").json()
    assert plan["ruleset"] == "2024" and plan["class_choices"] == []
    body = {
        "feat": {"name": "Ability Score Improvement", "asi": {"DEX": 2}},
        "class_choices": [{"key": "expertise", "picks": ["Stealth"]}],
    }
    res = client.post(f"/api/play/{pc_id}/level-up", json=body)
    assert res.status_code == 422 and "No class choices" in res.json()["detail"]
    del body["class_choices"]
    assert client.post(f"/api/play/{pc_id}/level-up", json=body).status_code == 200
