"""The companion phone's new verbs on the player link (Plan 122).

Rolls with advantage and real dice, the turn kit, casting that spends the slot,
preparing within the cap, private notes, temp HP, and the DM's notes staying private.
"""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.adventure_repo import AdventureRepo
from db.repos.session_repo import SessionRepo
from db.repos.spell_repo import SpellRepo
from domain.adventure import AdventureCreate
from domain.character import CharacterSpellCreate, PlayerCharacterUpdate
from domain.enums import AdventureTier, CharacterClass
from domain.session import SessionCreate
from domain.spell import SpellCreate
from services import spellcasting_service

DM = "companion@example.com"


def _spell(s, name, level, **kw):
    existing = next((x for x in SpellRepo.list_all(s) if x.name == name), None)
    if existing:
        return existing
    return SpellRepo.create(
        s,
        SpellCreate(
            name=name,
            level=level,
            school="Evocation",
            classes=["Wizard"],
            casting_time=kw.pop("casting_time", "Action"),
            range="60 ft",
            duration=kw.pop("duration", "Instant"),
            description="x",
            **kw,
        ),
    )


def _seed(engine, cls=CharacterClass.WIZARD, level=3, with_session=True) -> dict:
    """A campaign with one PC (and a session to roll into); return ids."""
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Kettle", dm_email=DM)
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=DM,
            player_name="Alex",
            character_name=f"Wren {uuid.uuid4().hex[:4]}",
            race="Human",
            character_class=cls,
            level=level,
            score_str=8,
            score_dex=14,
            score_con=12,
            score_int=16,
            score_wis=12,
            score_cha=10,
            hp_max=17,
            hp_current=17,
            ac=12,
            speed=30,
        )
        char_svc.update_character(
            s, pc.id, DM, PlayerCharacterUpdate(notes="DM secret: a doppelganger")
        )
        if with_session:
            adv = AdventureRepo.create(
                s, AdventureCreate(campaign_id=campaign.id, title="Arc", tier=AdventureTier.TIER1)
            )
            SessionRepo.create(s, SessionCreate(adventure_id=adv.id, session_number=1, title="One"))
        rows = {}
        for name, lvl, kw in (
            (
                "Fire Bolt",
                0,
                {"damage_dice": "1d10", "damage_type": "fire", "attack_type": "ranged"},
            ),
            ("Magic Missile", 1, {"damage_dice": "1d4+1", "damage_type": "force"}),
            (
                "Detect Magic",
                1,
                {"is_ritual": True, "is_concentration": True, "duration": "10 minutes"},
            ),
            ("Misty Step", 2, {"casting_time": "Bonus Action"}),
        ):
            sp = _spell(s, name, lvl, **kw)
            row = spellcasting_service.learn_spell(
                s,
                pc.id,
                CharacterSpellCreate(spell_id=sp.id, known=True, prepared=name != "Misty Step"),
                DM,
            )
            rows[name] = str(row.id)
        return {"pc": str(pc.id), "spells": rows}


def test_roll_with_advantage_keeps_the_higher(client, api_engine):
    """Advantage rolls one d20 twice and keeps the higher; the total adds the modifier."""
    ids = _seed(api_engine)
    r = client.post(
        f"/api/play/{ids['pc']}/roll",
        json={"die": "d20", "modifier": 4, "label": "Stealth", "mode": "advantage"},
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert len(body["rolls"]) == 2 and body["kept"] == [max(body["rolls"])]
    assert body["total"] == max(body["rolls"]) + 4 and body["mode"] == "advantage"


def test_real_dice_are_logged_not_rolled(client, api_engine):
    """A real-die entry is taken as given; out-of-range faces and wrong counts are refused."""
    ids = _seed(api_engine)
    ok = client.post(
        f"/api/play/{ids['pc']}/roll",
        json={"die": "d20", "modifier": 6, "mode": "disadvantage", "real": [14, 7]},
    )
    assert ok.status_code == 200, ok.text
    assert ok.json()["kept"] == [7] and ok.json()["total"] == 13 and ok.json()["real"] is True
    assert (
        client.post(f"/api/play/{ids['pc']}/roll", json={"die": "d6", "real": [7]}).status_code
        == 422
    )
    assert (
        client.post(f"/api/play/{ids['pc']}/roll", json={"die": "d20", "real": [3, 4]}).status_code
        == 422
    )
    assert (
        client.post(
            f"/api/play/{ids['pc']}/roll", json={"die": "d8", "mode": "advantage"}
        ).status_code
        == 422
    )


def test_turn_kit_groups_by_cost(client, api_engine):
    """A wizard's kit: Fire Bolt as an action with its to-hit; Opportunity Attack as a reaction."""
    ids = _seed(api_engine)
    r = client.get(f"/api/play/{ids['pc']}/turn-kit")
    assert r.status_code == 200, r.text
    kit = r.json()
    assert kit["speed"] == 30 and "Dash" in kit["basic_actions"]
    bolt = next(o for o in kit["action"] if o["name"] == "Fire Bolt")
    assert bolt["to_hit"] == 5 and bolt["damage"].startswith("1d10")
    assert kit["reaction"][0]["key"] == "opportunity_attack"
    assert any("Cantrips never run out" in t for t in kit["tips"])


def test_rogue_kit_has_cunning_action_and_sneak_attack_tip(client, api_engine):
    """A level-3 rogue gets Cunning Action as a bonus action and the Sneak Attack reminder."""
    ids = _seed(api_engine, cls=CharacterClass.ROGUE)
    kit = client.get(f"/api/play/{ids['pc']}/turn-kit").json()
    assert kit["bonus"][0]["key"] == "cunning_action"
    assert any(t.startswith("Sneak Attack: once per turn, add 2d6") for t in kit["tips"])


def test_cast_spends_the_slot_you_choose(client, api_engine):
    """Magic Missile at 2nd spends a 2nd-level slot; a cantrip spends nothing."""
    ids = _seed(api_engine)
    pc = ids["pc"]
    before = client.get(f"/api/play/{pc}/spell-slots").json()["levels"]
    r = client.post(
        f"/api/play/{pc}/spells/{ids['spells']['Magic Missile']}/cast", json={"slot_level": 2}
    )
    assert r.status_code == 200, r.text
    assert r.json()["slot_level"] == 2
    after = client.get(f"/api/play/{pc}/spell-slots").json()["levels"]
    assert after["2"]["remaining"] == before["2"]["remaining"] - 1
    assert after["1"]["remaining"] == before["1"]["remaining"]
    bolt = client.post(f"/api/play/{pc}/spells/{ids['spells']['Fire Bolt']}/cast", json={})
    assert bolt.status_code == 200 and bolt.json()["slot_level"] is None


def test_cast_rules(client, api_engine):
    """No slot below the spell's level; unprepared spells refused; rituals free; slots run out."""
    ids = _seed(api_engine)
    pc, sp = ids["pc"], ids["spells"]
    low = client.post(f"/api/play/{pc}/spells/{sp['Misty Step']}/cast", json={"slot_level": 1})
    assert low.status_code == 422
    assert "Prepare Misty Step" in low.json()["detail"]
    ritual = client.post(f"/api/play/{pc}/spells/{sp['Detect Magic']}/cast", json={"ritual": True})
    assert ritual.status_code == 200 and ritual.json()["slot_level"] is None
    assert client.get(f"/api/play/{pc}").json()["concentration_on"] == "Detect Magic"
    not_ritual = client.post(
        f"/api/play/{pc}/spells/{sp['Magic Missile']}/cast", json={"ritual": True}
    )
    assert not_ritual.status_code == 422
    codes = [
        client.post(
            f"/api/play/{pc}/spells/{sp['Magic Missile']}/cast", json={"slot_level": 1}
        ).status_code
        for _ in range(5)
    ]
    assert codes[-1] == 409


def test_cast_refuses_another_characters_spell(client, api_engine):
    """A spell row from someone else's sheet is a 404 on this link."""
    mine, theirs = _seed(api_engine), _seed(api_engine)
    r = client.post(
        f"/api/play/{mine['pc']}/spells/{theirs['spells']['Magic Missile']}/cast", json={}
    )
    assert r.status_code == 404


def test_prepare_within_the_cap(client, api_engine):
    """A wizard prepares Misty Step; cantrips have nothing to prepare; sorcerers wait to level."""
    ids = _seed(api_engine)
    r = client.post(
        f"/api/play/{ids['pc']}/spells/{ids['spells']['Misty Step']}/prepare",
        json={"prepared": True},
    )
    assert r.status_code == 200, r.text
    assert r.json()["prepared"] is True and r.json()["count"] == 3
    cantrip = client.post(
        f"/api/play/{ids['pc']}/spells/{ids['spells']['Fire Bolt']}/prepare",
        json={"prepared": False},
    )
    assert cantrip.status_code == 422
    sorc = _seed(api_engine, cls=CharacterClass.SORCERER)
    refused = client.post(
        f"/api/play/{sorc['pc']}/spells/{sorc['spells']['Misty Step']}/prepare",
        json={"prepared": True},
    )
    assert refused.status_code == 422 and "level up" in refused.json()["detail"]


def test_notes_are_the_players_and_the_dms_stay_private(client, api_engine):
    """Player notes round-trip; the DM's notes about the PC never go out over the link."""
    ids = _seed(api_engine)
    pc = ids["pc"]
    sheet = client.get(f"/api/play/{pc}").json()
    assert "notes" not in sheet
    saved = client.put(f"/api/play/{pc}/notes", json={"text": "  Ask Tamsin about the sigil.  "})
    assert (
        saved.status_code == 200 and saved.json()["player_notes"] == "Ask Tamsin about the sigil."
    )
    assert client.get(f"/api/play/{pc}").json()["player_notes"] == "Ask Tamsin about the sigil."
    damaged = client.post(f"/api/play/{pc}/damage", json={"amount": 1})
    assert damaged.status_code == 200 and "notes" not in damaged.json()
    assert client.put(f"/api/play/{pc}/notes", json={"text": "x" * 4001}).status_code == 422


def test_temp_hp_is_the_players(client, api_engine):
    """Temp HP joins the player's fields, bounded 0–999; level is still the DM's."""
    ids = _seed(api_engine)
    pc = ids["pc"]
    r = client.patch(f"/api/play/{pc}/state", json={"temp_hp": 5})
    assert r.status_code == 200 and r.json()["temp_hp"] == 5
    assert client.patch(f"/api/play/{pc}/state", json={"temp_hp": 1000}).status_code == 422
    assert client.patch(f"/api/play/{pc}/state", json={"level": 9}).status_code == 403


def test_turn_state_carries_the_order(client, api_engine):
    """Off your turn the phone gets the running order: who's up, which row is you, foes marked."""
    from db.repos.character_repo import CharacterRepo
    from db.repos.session_repo import SessionCombatantRepo
    from domain.session import SessionCombatantCreate

    ids = _seed(api_engine)
    with Session(api_engine) as s:
        pc = CharacterRepo.get_by_id(s, uuid.UUID(ids["pc"]))
        game = next(
            g
            for a in AdventureRepo.list_by_campaign(s, pc.campaign_id)
            for g in SessionRepo.list_by_adventure(s, a.id)
        )
        rows = SessionCombatantRepo.replace_all(
            s,
            game.id,
            [
                SessionCombatantCreate(
                    sort_index=0,
                    name="Bandit",
                    dex_score=12,
                    initiative_roll=15,
                    hp_current=11,
                    hp_max=11,
                    type="monster",
                ),
                SessionCombatantCreate(
                    sort_index=1,
                    name=pc.character_name,
                    dex_score=14,
                    initiative_roll=9,
                    hp_current=17,
                    hp_max=17,
                    type="pc",
                    character_id=pc.id,
                ),
            ],
        )
        game.combat_state = "running"
        game.combat_round = 2
        game.combat_active_combatant_id = rows[0].id
        s.add(game)
        s.commit()
    r = client.get(f"/api/play/{ids['pc']}/turn-state")
    assert r.status_code == 200, r.text
    state = r.json()
    assert state["active"] is False and state["active_combatant_name"] == "Bandit"
    assert [o["side"] for o in state["order"]] == ["foe", "party"]
    assert state["order"][0]["current"] and state["order"][1]["you"]
