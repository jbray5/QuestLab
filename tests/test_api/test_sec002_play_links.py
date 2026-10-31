"""SEC-002 — player links are unguessable tokens the DM can reset.

``/play/{pc_id}`` used to be the link: the UUID was the secret, but UUIDs leak
(the projector feed, the join roster, party lists) and a link could never be
taken back. Now:

- every PC has a ``play_token`` and ``/play/{token}`` opens the sheet;
- a PC made after tokens never opens by UUID (410, naming the campaign);
- PCs made before tokens open by UUID until ``legacy_uuid_until``;
- resetting a link kills both the old token and the UUID at once;
- no player payload carries the token or the DM's notes;
- the join roster hands out keys, not UUIDs, and the join code compare holds.
"""

from datetime import UTC, datetime, timedelta

from sqlmodel import Session

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.character_repo import CharacterRepo
from domain.enums import CharacterClass

_AUTH = "X-MS-CLIENT-PRINCIPAL-NAME"


def _pc(engine, dm: str, name: str = "Willa", campaign_id=None):
    """Create a PC (and a campaign when none is given); return (campaign_id, pc_id, token)."""
    with Session(engine) as s:
        if campaign_id is None:
            campaign_id = camp_svc.create_campaign(
                s, name="Links", setting="R", tone="T", dm_email=dm
            ).id
        pc = char_svc.create_character(
            s,
            campaign_id=campaign_id,
            dm_email=dm,
            player_name="Hayley",
            character_name=name,
            race="Human",
            character_class=CharacterClass.WIZARD,
            level=3,
            score_str=10,
            score_dex=14,
            score_con=14,
            score_int=16,
            score_wis=10,
            score_cha=10,
            hp_max=20,
            hp_current=17,
            ac=14,
            speed=30,
            notes="The DM's secret about Willa.",
        )
        return campaign_id, pc.id, pc.play_token


def test_new_pcs_get_a_token_that_opens_the_sheet(client, api_engine):
    """A fresh PC has a 22-character token; /play/{token} is its sheet."""
    _cid, pc_id, token = _pc(api_engine, "dm_l1@example.com")
    assert token and len(token) >= 20
    resp = client.get(f"/api/play/{token}")
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == str(pc_id)
    # Neither the secret nor the DM's notes ride along in a player payload.
    assert "play_token" not in body and "legacy_uuid_until" not in body
    assert "notes" not in body
    assert "secret about Willa" not in resp.text


def test_a_new_pc_does_not_open_by_uuid(client, api_engine):
    """After tokens, the UUID is not a link: 410 with the campaign for the join page."""
    cid, pc_id, _token = _pc(api_engine, "dm_l2@example.com")
    resp = client.get(f"/api/play/{pc_id}")
    assert resp.status_code == 410
    assert resp.json()["detail"] == {"code": "link_replaced", "campaign_id": str(cid)}
    # Writes are refused the same way.
    assert client.post(f"/api/play/{pc_id}/damage", json={"amount": 5}).status_code == 410


def test_garbage_and_unknown_keys_are_404(client):
    """A guessed key or an unknown UUID is a plain 404."""
    assert client.get("/api/play/not-a-real-key").status_code == 404
    assert client.get("/api/play/00000000-0000-0000-0000-000000000000").status_code == 404
    assert client.get("/api/play/" + "x" * 80).status_code == 404


def test_old_pcs_open_by_uuid_during_the_grace_period(client, api_engine):
    """A pre-token PC's UUID link works until legacy_uuid_until, then 410s."""
    _cid, pc_id, token = _pc(api_engine, "dm_l3@example.com")
    with Session(api_engine) as s:
        pc = CharacterRepo.get_by_id(s, pc_id)
        pc.legacy_uuid_until = datetime.now(UTC) + timedelta(days=30)
        s.add(pc)
        s.commit()
    assert client.get(f"/api/play/{pc_id}").status_code == 200
    # The phone upgrades itself to the token link.
    link = client.get(f"/api/play/{pc_id}/link").json()
    assert link["play_key"] == token
    with Session(api_engine) as s:
        pc = CharacterRepo.get_by_id(s, pc_id)
        pc.legacy_uuid_until = datetime.now(UTC) - timedelta(minutes=1)
        s.add(pc)
        s.commit()
    assert client.get(f"/api/play/{pc_id}").status_code == 410
    assert client.get(f"/api/play/{token}").status_code == 200


def test_reset_kills_the_old_token_and_the_uuid(client, api_engine):
    """The DM's reset gives a new key; the old token and any UUID grace stop at once."""
    dm = "dm_l4@example.com"
    _cid, pc_id, token = _pc(api_engine, dm)
    with Session(api_engine) as s:
        pc = CharacterRepo.get_by_id(s, pc_id)
        pc.legacy_uuid_until = datetime.now(UTC) + timedelta(days=30)
        s.add(pc)
        s.commit()
    resp = client.post(f"/api/characters/{pc_id}/play-link/reset", headers={_AUTH: dm})
    assert resp.status_code == 200
    new_key = resp.json()["play_key"]
    assert new_key and new_key != token
    assert client.get(f"/api/play/{new_key}").status_code == 200
    assert client.get(f"/api/play/{token}").status_code == 404
    assert client.get(f"/api/play/{pc_id}").status_code == 410


def test_only_the_owning_dm_can_reset(client, api_engine):
    """Another DM (or nobody) can't reset a link."""
    _cid, pc_id, _token = _pc(api_engine, "dm_l5@example.com")
    other = client.post(
        f"/api/characters/{pc_id}/play-link/reset", headers={_AUTH: "intruder@example.com"}
    )
    assert other.status_code == 403
    anon = client.post(f"/api/characters/{pc_id}/play-link/reset")
    assert anon.status_code in (401, 403)


def test_the_dm_sees_the_key_to_build_the_link(client, api_engine):
    """The DM's own character read carries play_token (DM-only projection)."""
    dm = "dm_l6@example.com"
    _cid, pc_id, token = _pc(api_engine, dm)
    resp = client.get(f"/api/characters/{pc_id}", headers={_AUTH: dm})
    assert resp.status_code == 200
    assert resp.json()["play_token"] == token


def test_join_roster_gives_keys_not_uuids(client, api_engine):
    """The roster row opens the sheet; no PC UUID appears in it."""
    cid, pc_id, token = _pc(api_engine, "dm_l7@example.com")
    roster = client.get(f"/api/play/join/{cid}").json()
    assert roster[0]["key"] == token
    assert str(pc_id) not in str(roster)


def test_join_code_still_guards_the_roster(client, api_engine):
    """A wrong or missing code is refused; the right one (any case) works."""
    dm = "dm_l8@example.com"
    cid, _pc_id, _token = _pc(api_engine, dm)
    with Session(api_engine) as s:
        from db.repos.campaign_repo import CampaignRepo

        camp = CampaignRepo.get_by_id(s, cid)
        camp.join_code = "Lantern"
        s.add(camp)
        s.commit()
    assert client.get(f"/api/play/join/{cid}").status_code == 403
    assert client.get(f"/api/play/join/{cid}?code=wrong").status_code == 403
    assert client.get(f"/api/play/join/{cid}?code=lantern").status_code == 200


def test_the_pc_stream_takes_the_key(client, api_engine):
    """The phone's live stream resolves the link too: a new PC's UUID is refused."""
    _cid, pc_id, _token = _pc(api_engine, "dm_l9@example.com")
    assert client.get(f"/api/stream/pc/{pc_id}").status_code == 410
    assert client.get("/api/stream/pc/not-a-real-key").status_code == 404


def test_a_feature_row_must_be_the_players_own(client, api_engine):
    """SEC-006: spending a use needs the feature row to belong to this PC."""
    import uuid as _uuid

    _cid, _pc_id, token = _pc(api_engine, "dm_l10@example.com")
    resp = client.post(f"/api/play/{token}/features/{_uuid.uuid4()}/spend")
    assert resp.status_code == 422


def test_hot_seat_fights_stay_in_one_campaign(client, api_engine):
    """SEC-006: a player link can't pull another campaign's character into its duel."""
    cid, mine, my_token = _pc(api_engine, "dm_l11@example.com", name="Nya")
    _cid2, stranger, _t = _pc(api_engine, "dm_l12@example.com", name="Stranger")
    resp = client.post(
        f"/api/play/{my_token}/arena/duel", json={"pc_ids": [str(mine), str(stranger)]}
    )
    assert resp.status_code == 422
    assert "same campaign" in resp.text


def test_a_pc_without_a_token_still_opens_by_uuid(client, api_engine):
    """A PC made by old code during a deploy (no token yet) isn't locked out."""
    _cid, pc_id, _token = _pc(api_engine, "dm_l13@example.com")
    with Session(api_engine) as s:
        pc = CharacterRepo.get_by_id(s, pc_id)
        pc.play_token = None
        s.add(pc)
        s.commit()
    assert client.get(f"/api/play/{pc_id}").status_code == 200


def test_reset_works_for_a_pc_with_features(client, api_engine):
    """Plan 128: on DuckDB, resetting the link of a PC that has feature rows used to 500.

    DuckDB turns an update of an indexed column into delete + insert, which its
    foreign keys refuse; db.base.relax_duckdb_indexes drops the token's index there.
    """
    from services import feature_service

    dm = "dm_l13@example.com"
    _cid, pc_id, token = _pc(api_engine, dm)
    with Session(api_engine) as s:
        feature_service.sync_for_level(s, pc_id, dm)
    assert client.get(f"/api/play/{token}/features").json(), "sync_for_level should grant features"
    resp = client.post(f"/api/characters/{pc_id}/play-link/reset", headers={_AUTH: dm})
    assert resp.status_code == 200, resp.text
    assert client.get(f"/api/play/{resp.json()['play_key']}").status_code == 200
