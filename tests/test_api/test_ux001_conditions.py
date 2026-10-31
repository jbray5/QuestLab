"""UX-001 — a PC's conditions last between fights and reach the phone.

The HUD's party-card conditions used to live only in the DM's browser tab
outside a fight, and the phone only listed conditions during one.
"""

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from domain.enums import CharacterClass

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _pc(engine, dm: str):
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Cond", setting="R", tone="T", dm_email=dm)
        pc = char_svc.create_character(
            s,
            campaign_id=campaign.id,
            dm_email=dm,
            player_name="Cory",
            character_name="Creed",
            race="Dragonborn",
            character_class=CharacterClass.PALADIN,
            level=3,
            score_str=16,
            score_dex=10,
            score_con=14,
            score_int=8,
            score_wis=12,
            score_cha=14,
            hp_max=28,
            hp_current=28,
            ac=18,
            speed=30,
        )
        return pc.id, pc.play_token


def test_conditions_last_and_show_on_the_phone(client, api_engine):
    """The DM sets Poisoned outside a fight; the sheet keeps it and the phone sees it."""
    dm = "dm_ux1@example.com"
    pc_id, token = _pc(api_engine, dm)
    resp = client.patch(
        f"/api/characters/{pc_id}",
        headers={_AUTH: dm},
        json={"conditions": [" Poisoned ", "poisoned", "Prone"]},
    )
    assert resp.status_code == 200, resp.text
    # Trimmed and de-duplicated ignoring case; the case the HUD sent is kept.
    assert resp.json()["conditions"] == ["Poisoned", "Prone"]
    state = client.get(f"/api/play/{token}/combat-state").json()
    assert state == {"in_combat": False, "conditions": ["Poisoned", "Prone"], "defeated": False}
    # Clearing them clears the phone too.
    client.patch(f"/api/characters/{pc_id}", headers={_AUTH: dm}, json={"conditions": []})
    assert client.get(f"/api/play/{token}/combat-state").json()["conditions"] == []


def test_a_player_cannot_set_their_own_conditions(client, api_engine):
    """Conditions are the DM's call: the player link's state patch refuses them."""
    _pc_id, token = _pc(api_engine, "dm_ux2@example.com")
    resp = client.patch(f"/api/play/{token}/state", json={"conditions": ["Invisible"]})
    assert resp.status_code in (403, 422)
