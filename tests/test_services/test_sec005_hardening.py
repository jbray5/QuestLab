"""SEC-005 — three server-side checks that were missing.

- The town crier posts only to real Discord webhook URLs (it was a substring
  check, so any address could be made the target of server-side posts).
- An inventory row's notes (and a plain read of the row) check that the DM
  owns the character.
- A DM can't seat another campaign's character in a session's tracker or
  attendance.
"""

import uuid

import pytest
from sqlmodel import Session

import services.adventure_service as adv_svc
import services.campaign_service as camp_svc
import services.character_service as char_svc
import services.inventory_service as inv_svc
import services.item_service as item_svc
import services.session_service as sess_svc
from domain.character import CharacterItemCreate
from domain.enums import CharacterClass, ItemRarity
from domain.item import ItemCreate
from domain.session import SessionCombatantCreate, SessionUpdate
from services.crier_service import _checked_webhook_url


@pytest.mark.parametrize(
    "url",
    [
        "https://discord.com/api/webhooks/123/abc",
        "https://discordapp.com/api/webhooks/123/abc",
        "https://canary.discord.com/api/webhooks/1/x",
    ],
)
def test_real_webhooks_pass(url):
    """Discord's own hosts with the webhooks path are accepted."""
    assert _checked_webhook_url(f"  {url} ") == url


@pytest.mark.parametrize(
    "url",
    [
        "https://evil.example/?discord.com/api/webhooks/1/x",
        "https://evil.example/discord.com/api/webhooks/1/x",
        "http://discord.com/api/webhooks/1/x",
        "https://discord.com.evil.example/api/webhooks/1/x",
        "https://user@discord.com/api/webhooks/1/x",
        "https://discord.com:8443/api/webhooks/1/x",
        "https://discord.com/channels/1/2",
        "http://169.254.169.254/latest/meta-data/",
    ],
)
def test_lookalikes_are_refused(url):
    """Anything that merely contains the right words is refused."""
    with pytest.raises(ValueError):
        _checked_webhook_url(url)


def _pc(db: Session, dm: str):
    campaign = camp_svc.create_campaign(db, name="S5", setting="R", tone="T", dm_email=dm)
    pc = char_svc.create_character(
        db,
        campaign_id=campaign.id,
        dm_email=dm,
        player_name="P",
        character_name="Willa",
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
        hp_current=20,
        ac=12,
        speed=30,
    )
    return campaign, pc


def test_inventory_notes_check_the_owner(duckdb_session: Session):
    """Another DM can neither read nor annotate a row in someone else's bag."""
    dm = f"dm_{uuid.uuid4().hex[:6]}@example.com"
    _camp, pc = _pc(duckdb_session, dm)
    item = item_svc.create_item(
        duckdb_session,
        ItemCreate(name=f"Rope {uuid.uuid4().hex[:4]}", rarity=ItemRarity.COMMON, item_type="Gear"),
    )
    row = inv_svc.add_item(duckdb_session, pc.id, CharacterItemCreate(item_id=item.id), dm)
    assert inv_svc.set_notes(duckdb_session, row.id, "50 ft", dm).notes == "50 ft"
    with pytest.raises(PermissionError):
        inv_svc.set_notes(duckdb_session, row.id, "mine now", "intruder@example.com")
    with pytest.raises(PermissionError):
        inv_svc.get_row(duckdb_session, row.id, "intruder@example.com")


def _session(db: Session, dm: str, campaign_id):
    adventure = adv_svc.create_adventure(
        db,
        campaign_id=campaign_id,
        title="Arc",
        synopsis="s",
        tier="Tier1",
        act_count=3,
        dm_email=dm,
    )
    return sess_svc.create_session(
        db, adventure_id=adventure.id, session_number=1, title="Night", dm_email=dm
    )


def test_sessions_only_take_their_own_campaigns_characters(duckdb_session: Session):
    """Tracker adds, snapshots and attendance refuse a character from another table."""
    dm = f"dm_{uuid.uuid4().hex[:6]}@example.com"
    camp, mine = _pc(duckdb_session, dm)
    _other_camp, theirs = _pc(duckdb_session, f"dm_{uuid.uuid4().hex[:6]}@example.com")
    gs = _session(duckdb_session, dm, camp.id)

    def combatant(pc_id):
        return SessionCombatantCreate(
            sort_index=0,
            name="X",
            dex_score=10,
            initiative_roll=10,
            hp_current=10,
            hp_max=10,
            type="pc",
            character_id=pc_id,
        )

    sess_svc.add_combatant(duckdb_session, gs.id, dm, combatant(mine.id))
    with pytest.raises(ValueError, match="isn't in this campaign"):
        sess_svc.add_combatant(duckdb_session, gs.id, dm, combatant(theirs.id))
    with pytest.raises(ValueError, match="isn't in this campaign"):
        sess_svc.update_session(
            duckdb_session, gs.id, dm, SessionUpdate(attending_pc_ids=[mine.id, theirs.id])
        )
    updated = sess_svc.update_session(
        duckdb_session, gs.id, dm, SessionUpdate(attending_pc_ids=[mine.id])
    )
    assert [str(p) for p in updated.attending_pc_ids] == [str(mine.id)]
