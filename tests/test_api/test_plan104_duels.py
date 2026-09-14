"""Duels on separate devices over the API (Plan 104).

The capability URL says who you are; it does not say you may act. This walks
the two-phone flow the way two real phones do it — one starts, both read, only
the one whose turn it is may swing.
"""

import uuid

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from domain.enums import CharacterClass


def _two(engine) -> tuple[str, str, str]:
    """A campaign with two duellists and an unrelated third character."""
    dm = f"duel104-api-{uuid.uuid4().hex[:5]}@example.com"
    with Session(engine) as s:
        campaign = camp_svc.create_campaign(s, name="Ring", setting="R", tone="T", dm_email=dm)
        made = []
        for name, cls in (
            ("Nya", CharacterClass.SORCERER),
            ("Thane", CharacterClass.ROGUE),
            ("Creed", CharacterClass.PALADIN),
        ):
            pc = char_svc.create_character(
                s,
                campaign_id=campaign.id,
                dm_email=dm,
                player_name=name,
                character_name=name,
                race="Human",
                character_class=cls,
                level=2,
                score_str=14,
                score_dex=16,
                score_con=14,
                score_int=10,
                score_wis=10,
                score_cha=16,
                hp_max=20,
                hp_current=20,
                ac=15,
                speed=30,
            )
            made.append(str(pc.id))
        return made[0], made[1], made[2]


def test_two_phones_share_one_fight(client, api_engine):
    """Start on one phone, read on the other, and only the turn holder may act."""
    nya, thane, creed = _two(api_engine)

    started = client.post(f"/api/play/{nya}/duels", json={"pc_ids": [nya, thane]})
    assert started.status_code == 200, started.text
    duel = started.json()
    assert duel["phase"] == "live"
    assert {s["pc_id"] for s in duel["seats"]} == {nya, thane}

    up = duel["up_pc_id"]
    waiting = thane if up == nya else nya

    # The other phone reads the same fight, and knows it is not its turn.
    theirs = client.get(f"/api/play/{waiting}/duels/{duel['id']}")
    assert theirs.status_code == 200 and theirs.json()["your_turn"] is False

    # And is refused if it tries anyway — by the server, not by its own screen.
    jumped = client.post(
        f"/api/play/{waiting}/duels/{duel['id']}/act",
        json={"action": {"kind": "end_turn"}},
    )
    assert jumped.status_code == 403, jumped.text

    # Nobody outside the ring gets in at all.
    assert client.get(f"/api/play/{creed}/duels/{duel['id']}").status_code == 403

    # The turn holder ends their turn and it passes across.
    acted = client.post(
        f"/api/play/{up}/duels/{duel['id']}/act", json={"action": {"kind": "end_turn"}}
    )
    assert acted.status_code == 200, acted.text
    assert acted.json()["up_pc_id"] == waiting
    assert client.get(f"/api/play/{waiting}/duels/{duel['id']}").json()["your_turn"] is True

    # The challenge shows up in the other player's list, and stops when it ends.
    called = client.get(f"/api/play/{thane}/duels")
    assert called.status_code == 200 and [c["id"] for c in called.json()] == [duel["id"]]

    ended = client.post(f"/api/play/{thane}/duels/{duel['id']}/end", json={})
    assert ended.status_code == 200 and ended.json()["phase"] == "over"
    assert client.get(f"/api/play/{thane}/duels").json() == []

    # Nothing touched either real sheet.
    for pc in (nya, thane):
        assert client.get(f"/api/play/{pc}").json()["hp_current"] == 20


def test_you_cannot_open_a_duel_you_are_not_in(client, api_engine):
    """The host has to be one of the seats."""
    nya, thane, creed = _two(api_engine)
    refused = client.post(f"/api/play/{creed}/duels", json={"pc_ids": [nya, thane]})
    assert refused.status_code == 403, refused.text
