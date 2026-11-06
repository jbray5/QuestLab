"""Plan 138: a player tells the party what happened on a finished side quest.

What matters: nothing about a run reaches the party unless its player writes it, and then only
their words and their character's name.
"""

import json
import uuid

import pytest
from pydantic import ValidationError

import services.campaign_service as camp_svc
import services.character_service as char_svc
from domain.enums import CharacterClass
from domain.side_quest import (
    MAX_RECAP,
    QuestAdvance,
    QuestRecapShare,
    SideQuestConflictError,
    SideQuestCreate,
    SideQuestNotFoundError,
    SideQuestSend,
)
from services import side_quest_service as svc

_SECRET_TITLE = "The Secret Compass"
_QUEST = {
    "title": _SECRET_TITLE,
    "teaser": "Nobody else knows",
    "steps": [
        {"id": "a", "kind": "reply", "text": "A hidden thing.", "next": "b"},
        {"id": "b", "kind": "end", "text": "It points somewhere.", "gp": 5},
    ],
}


def _setup(db):
    """A DM, a campaign, two characters, and a run for the first of them."""
    dm = f"dm138_{uuid.uuid4().hex[:8]}@example.com"
    campaign = camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)
    pcs = [_pc(db, campaign.id, dm, name) for name in ("Pip", "Bo")]
    quest = svc.create_quest(db, campaign.id, SideQuestCreate(**_QUEST), dm)
    sent = svc.send_quest(db, quest.id, SideQuestSend(character_ids=[pcs[0].id]), dm)
    return dm, campaign, pcs[0], pcs[1], quest, sent.quest.runs[0].run_id


def _pc(db, campaign_id, dm: str, name: str):
    """A level 1 Rogue."""
    return char_svc.create_character(
        db,
        campaign_id=campaign_id,
        dm_email=dm,
        player_name="P",
        character_name=name,
        race="Human",
        character_class=CharacterClass.ROGUE,
        level=1,
        score_str=10,
        score_dex=10,
        score_con=10,
        score_int=10,
        score_wis=10,
        score_cha=10,
        hp_max=10,
        hp_current=10,
        ac=12,
    )


def _finish(db, pc, run_id) -> None:
    """Play the quest to its ending."""
    svc.advance(db, pc.id, run_id, QuestAdvance(step_id="a", reply="A private answer for my DM."))


def _say(text: str) -> QuestRecapShare:
    """A recap."""
    return QuestRecapShare(text=text)


@pytest.fixture
def events(monkeypatch) -> list[tuple]:
    """Every event the service publishes, as ``(pc_id, notice)``."""
    seen: list[tuple] = []
    monkeypatch.setattr(
        svc,
        "publish_pc_updated",
        lambda pc_id, _campaign, notice=None, **_kw: seen.append((pc_id, notice)),
    )
    return seen


def test_an_unfinished_quest_cant_be_recapped(duckdb_session):
    """Sharing is for after the ending."""
    _dm, _campaign, pc, _other, _quest, run_id = _setup(duckdb_session)
    with pytest.raises(SideQuestConflictError):
        svc.share_recap(duckdb_session, pc.id, run_id, _say("Too soon."))
    assert svc.party_recaps(duckdb_session, pc.id) == []


def test_nothing_reaches_the_party_until_the_player_shares(duckdb_session):
    """Finishing a quest tells nobody anything."""
    _dm, _campaign, pc, other, _quest, run_id = _setup(duckdb_session)
    _finish(duckdb_session, pc, run_id)
    assert svc.party_recaps(duckdb_session, other.id) == []


def test_the_party_gets_the_name_and_the_words_and_nothing_else(duckdb_session):
    """No title, no teaser, no ids, no reply, no gold: a private quest stays private."""
    _dm, _campaign, pc, other, _quest, run_id = _setup(duckdb_session)
    _finish(duckdb_session, pc, run_id)
    view = svc.share_recap(duckdb_session, pc.id, run_id, _say("  I fell down a lot.  "))
    assert view.recap == "I fell down a lot."

    got = svc.party_recaps(duckdb_session, other.id)
    assert [(r.character_name, r.text, r.mine) for r in got] == [
        ("Pip", "I fell down a lot.", False)
    ]
    assert svc.party_recaps(duckdb_session, pc.id)[0].mine is True

    blob = json.dumps([r.model_dump(mode="json") for r in got])
    assert set(got[0].model_dump()) == {"character_name", "text", "at", "mine"}
    for secret in (_SECRET_TITLE, "Nobody else knows", "private answer", str(run_id), str(pc.id)):
        assert secret not in blob


def test_another_campaign_sees_nothing(duckdb_session):
    """Recaps stay at their own table."""
    _dm, _campaign, pc, _other, _quest, run_id = _setup(duckdb_session)
    _finish(duckdb_session, pc, run_id)
    svc.share_recap(duckdb_session, pc.id, run_id, _say("Ours."))
    _dm2, _campaign2, stranger, _other2, _quest2, _run2 = _setup(duckdb_session)
    assert svc.party_recaps(duckdb_session, stranger.id) == []


def test_only_the_runs_own_character_can_write_it(duckdb_session):
    """Someone else's run reads as not found."""
    _dm, _campaign, pc, other, _quest, run_id = _setup(duckdb_session)
    _finish(duckdb_session, pc, run_id)
    with pytest.raises(SideQuestNotFoundError):
        svc.share_recap(duckdb_session, other.id, run_id, _say("Words in his mouth."))


def test_every_phone_refreshes_and_a_correction_keeps_its_time(duckdb_session, events):
    """Each phone at the table hears about it; a correction won't bring the Now card back."""
    _dm, _campaign, pc, other, _quest, run_id = _setup(duckdb_session)
    _finish(duckdb_session, pc, run_id)
    events.clear()
    svc.share_recap(duckdb_session, pc.id, run_id, _say("First."))
    assert (other.id, None) in events and (pc.id, None) in events
    first_at = svc.party_recaps(duckdb_session, other.id)[0].at

    events.clear()
    svc.share_recap(duckdb_session, pc.id, run_id, _say("Corrected."))
    assert (other.id, None) in events
    again = svc.party_recaps(duckdb_session, other.id)[0]
    assert again.text == "Corrected." and again.at == first_at


def test_empty_words_take_it_back(duckdb_session):
    """It leaves the party's list and the DM's results; sharing again works."""
    dm, _campaign, pc, other, quest, run_id = _setup(duckdb_session)
    _finish(duckdb_session, pc, run_id)
    svc.share_recap(duckdb_session, pc.id, run_id, _say("Oops."))
    view = svc.share_recap(duckdb_session, pc.id, run_id, _say("   "))
    assert view.recap is None
    assert svc.party_recaps(duckdb_session, other.id) == []
    assert svc.list_runs(duckdb_session, quest.id, dm)[0].recap is None
    svc.share_recap(duckdb_session, pc.id, run_id, _say("Back."))
    assert svc.party_recaps(duckdb_session, other.id)[0].text == "Back."


def test_the_dm_sees_it_next_to_what_really_happened(duckdb_session):
    """The results carry the recap and the real log."""
    dm, _campaign, pc, _other, quest, run_id = _setup(duckdb_session)
    _finish(duckdb_session, pc, run_id)
    svc.share_recap(duckdb_session, pc.id, run_id, _say("Nothing happened. Honest."))
    run = svc.list_runs(duckdb_session, quest.id, dm)[0]
    assert run.recap == "Nothing happened. Honest." and run.recap_at is not None
    assert any(entry.reply == "A private answer for my DM." for entry in run.log)


def test_deleting_the_quest_removes_it(duckdb_session):
    """The recap lives on the run."""
    dm, _campaign, pc, other, quest, run_id = _setup(duckdb_session)
    _finish(duckdb_session, pc, run_id)
    svc.share_recap(duckdb_session, pc.id, run_id, _say("Gone soon."))
    svc.delete_quest(duckdb_session, quest.id, dm)
    assert svc.party_recaps(duckdb_session, other.id) == []


def test_length_limit():
    """1500 characters, counted before the trim."""
    assert QuestRecapShare(text="x" * MAX_RECAP).text
    with pytest.raises(ValidationError):
        QuestRecapShare(text="x" * (MAX_RECAP + 1))
