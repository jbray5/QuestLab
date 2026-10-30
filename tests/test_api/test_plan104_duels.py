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


def _boss(engine) -> str:
    """A soft boss in the catalog, so a scripted fight never ends by itself."""
    from db.repos.monster_repo import MonsterRepo
    from domain.enums import CreatureSize, CreatureType
    from domain.monster import MonsterStatBlockCreate

    with Session(engine) as s:
        boss = MonsterRepo.create(
            s,
            MonsterStatBlockCreate(
                name=f"Revelmaster {uuid.uuid4().hex[:4]}",
                size=CreatureSize.LARGE,
                creature_type=CreatureType.FEY,
                ac=10,
                hp_average=400,
                hp_formula="40d10",
                score_str=10,
                score_dex=10,
                score_con=10,
                score_int=10,
                score_wis=10,
                score_cha=10,
                challenge_rating="1",
                xp=200,
                proficiency_bonus=2,
                actions=[{"name": "Slap", "desc": "+0 to hit, 1d1 bludgeoning"}],
            ),
        )
        return str(boss.id)


def test_a_boss_battle_on_everyones_phone(client, api_engine):
    """Plan 116: the party against a boss, each on their own phone, with a hand-over."""
    nya, thane, creed = _two(api_engine)
    boss = _boss(api_engine)

    started = client.post(
        f"/api/play/{nya}/duels", json={"pc_ids": [nya, thane, creed], "monster_id": boss}
    )
    assert started.status_code == 200, started.text
    duel = started.json()
    assert duel["state"]["mode"] == "boss"
    assert duel["up_pc_id"] in (nya, thane, creed)

    called = client.get(f"/api/play/{thane}/duels").json()
    assert called[0]["mode"] == "boss" and called[0]["boss"].startswith("Revelmaster")

    # Somebody's phone died: another player hands the seat that is up to the referee.
    up = duel["up_pc_id"]
    helper = next(p for p in (nya, thane, creed) if p != up)
    handed = client.post(f"/api/play/{helper}/duels/{duel['id']}/referee", json={"seat_pc_id": up})
    assert handed.status_code == 200, handed.text
    after = handed.json()
    assert after["up_pc_id"] != up
    seat = next(s for s in after["state"]["roster"] if s["pc_id"] == up)
    assert seat["auto"] is True

    # A seat that is only waiting can't be taken by someone else.
    waiting = next(p for p in (nya, thane, creed) if p not in (up, after["up_pc_id"]))
    other = next(p for p in (nya, thane, creed) if p not in (waiting, after["up_pc_id"]))
    refused = client.post(
        f"/api/play/{other}/duels/{duel['id']}/referee", json={"seat_pc_id": waiting}
    )
    assert refused.status_code == 403, refused.text

    # They come back.
    back = client.post(f"/api/play/{up}/duels/{duel['id']}/return", json={})
    assert back.status_code == 200, back.text
    seat = next(s for s in back.json()["state"]["roster"] if s["pc_id"] == up)
    assert seat["auto"] is False

    # An unknown boss is a 404.
    missing = client.post(
        f"/api/play/{nya}/duels",
        json={"pc_ids": [nya, thane], "monster_id": str(uuid.uuid4())},
    )
    assert missing.status_code == 404, missing.text
