"""Plan 142: a DM practises a quest as a character.

What matters: the party never sees a practice run (no names, no recaps), the sheet is never
touched, it can start over, and sending the quest to that character replaces it with a real run.
"""

import uuid

import pytest

import services.campaign_service as camp_svc
import services.character_service as char_svc
from db.repos.character_repo import CharacterRepo
from domain.enums import CharacterClass
from domain.side_quest import (
    QuestAdvance,
    QuestPractice,
    QuestRecapShare,
    QuestStep,
    SideQuestConflictError,
    SideQuestCreate,
    SideQuestNotFoundError,
    SideQuestSend,
    SideQuestUpdate,
)
from services import side_quest_service as svc

_STEPS = [
    {
        "id": "ch",
        "kind": "choice",
        "text": "Four useful things.",
        "party_sees": True,
        "options": [{"label": "Fire", "next": "hurt"}, {"label": "Lantern", "next": "e"}],
    },
    {"id": "hurt", "kind": "read", "text": "Ow.", "damage": "3", "gp": 25, "next": "e"},
    {"id": "e", "kind": "end", "text": "Morning."},
]


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


def _setup(db, sent: bool = True):
    """A quest (sent to Willa if ``sent``) and a practice run as Steven."""
    dm = f"dm142_{uuid.uuid4().hex[:8]}@example.com"
    campaign = camp_svc.create_campaign(db, name="C", setting="S", tone="T", dm_email=dm)
    willa = _pc(db, campaign.id, dm, "Willa")
    steven = _pc(db, campaign.id, dm, "Steven")
    quest = svc.create_quest(db, campaign.id, SideQuestCreate(title="Q", steps=_STEPS), dm)
    if sent:
        svc.send_quest(db, quest.id, SideQuestSend(character_ids=[willa.id]), dm)
    run = svc.practice(db, quest.id, QuestPractice(character_id=steven.id), dm)
    return dm, quest, willa, steven, run


def _sheet(db, pc_id):
    """(hp, gp) now."""
    db.expire_all()
    pc = CharacterRepo.get_by_id(db, pc_id)
    return pc.hp_current, pc.gp


def _willa_run(db, quest_id, dm):
    """Willa's real run id."""
    return next(r.run_id for r in svc.list_runs(db, quest_id, dm) if r.character_name == "Willa")


def test_practice_run_is_marked_everywhere(duckdb_session):
    """The DM's list, the phone's card and the phone's view all say practice."""
    dm, quest, _willa, steven, run = _setup(duckdb_session)
    assert run.practice is True and run.character_name == "Steven"
    assert [c.practice for c in svc.list_cards(duckdb_session, steven.id)] == [True]
    assert svc.get_view(duckdb_session, steven.id, run.run_id).practice is True
    runs = {r.character_name: r.practice for r in svc.list_runs(duckdb_session, quest.id, dm)}
    assert runs == {"Willa": False, "Steven": True}


def test_the_party_never_sees_a_practice_pick(duckdb_session):
    """Steven takes the fire; Willa's phone shows no name on it."""
    dm, quest, willa, steven, run = _setup(duckdb_session)
    svc.advance(duckdb_session, steven.id, run.run_id, QuestAdvance(step_id="ch", option=0))
    view = svc.get_view(duckdb_session, willa.id, _willa_run(duckdb_session, quest.id, dm))
    assert all(o.taken_by == [] for o in view.step.options)


def test_a_practice_run_still_sees_the_real_picks(duckdb_session):
    """The DM sees what a player would: Willa's pick shows on Steven's practice phone."""
    dm, quest, willa, steven, run = _setup(duckdb_session)
    willa_run = _willa_run(duckdb_session, quest.id, dm)
    svc.advance(duckdb_session, willa.id, willa_run, QuestAdvance(step_id="ch", option=1))
    view = svc.get_view(duckdb_session, steven.id, run.run_id)
    assert [o.taken_by for o in view.step.options] == [[], ["Willa"]]


def test_practice_pays_and_hurts_nothing_but_says_what_it_would(duckdb_session):
    """The phone shows 25 gp and 3 damage; the sheet doesn't move."""
    _dm, _quest, _willa, steven, run = _setup(duckdb_session)
    before = _sheet(duckdb_session, steven.id)
    view = svc.advance(duckdb_session, steven.id, run.run_id, QuestAdvance(step_id="ch", option=0))
    assert (view.outcome.gp, view.outcome.damage) == (25, 3)
    assert _sheet(duckdb_session, steven.id) == before


def test_a_practice_run_cant_be_shared(duckdb_session):
    """No recap from practice reaches the party."""
    _dm, _quest, willa, steven, run = _setup(duckdb_session)
    svc.advance(duckdb_session, steven.id, run.run_id, QuestAdvance(step_id="ch", option=1))
    with pytest.raises(SideQuestConflictError):
        svc.share_recap(duckdb_session, steven.id, run.run_id, QuestRecapShare(text="Hi"))
    assert svc.party_recaps(duckdb_session, willa.id) == []


def test_start_over_from_the_phone_or_again_from_the_dm(duckdb_session):
    """Both go back to the first step, log empty: the phone's opens it, the DM's re-seals it."""
    dm, quest, _willa, steven, run = _setup(duckdb_session)
    svc.advance(duckdb_session, steven.id, run.run_id, QuestAdvance(step_id="ch", option=1))
    view = svc.start_over(duckdb_session, steven.id, run.run_id)
    assert (view.step.id, view.status, view.history) == ("ch", "active", [])
    svc.advance(duckdb_session, steven.id, run.run_id, QuestAdvance(step_id="ch", option=1))
    again = svc.practice(duckdb_session, quest.id, QuestPractice(character_id=steven.id), dm)
    assert again.run_id == run.run_id and again.status == "new"


def test_a_real_run_cant_start_over_or_be_removed(duckdb_session):
    """Only practice runs reset; a player's run is theirs."""
    dm, quest, willa, _steven, _run = _setup(duckdb_session)
    willa_run = _willa_run(duckdb_session, quest.id, dm)
    with pytest.raises(SideQuestConflictError):
        svc.start_over(duckdb_session, willa.id, willa_run)
    with pytest.raises(SideQuestConflictError):
        svc.remove_practice(duckdb_session, quest.id, willa_run, dm)
    with pytest.raises(SideQuestConflictError, match="for real"):
        svc.practice(duckdb_session, quest.id, QuestPractice(character_id=willa.id), dm)


def test_sending_replaces_the_practice_run(duckdb_session):
    """Steven gets the quest for real: a fresh real run, the practice one gone."""
    dm, quest, _willa, steven, run = _setup(duckdb_session)
    svc.advance(duckdb_session, steven.id, run.run_id, QuestAdvance(step_id="ch", option=1))
    sent = svc.send_quest(duckdb_session, quest.id, SideQuestSend(character_ids=[steven.id]), dm)
    assert sent.new_runs == 1
    mine = [r for r in sent.quest.runs if r.character_name == "Steven"]
    assert len(mine) == 1 and mine[0].practice is False and mine[0].status == "new"
    assert mine[0].run_id != run.run_id


def test_remove_a_practice_run(duckdb_session):
    """It's gone from the DM's list and the phone."""
    dm, quest, _willa, steven, run = _setup(duckdb_session)
    svc.remove_practice(duckdb_session, quest.id, run.run_id, dm)
    assert svc.list_cards(duckdb_session, steven.id) == []
    with pytest.raises(SideQuestNotFoundError):
        svc.remove_practice(duckdb_session, quest.id, run.run_id, dm)


def test_practice_works_on_a_draft_and_restarts_when_its_links_change(duckdb_session):
    """Play it before anyone gets it; reshaping the draft sends practice back to the start."""
    dm, quest, _willa, steven, run = _setup(duckdb_session, sent=False)
    assert svc.get_quest(duckdb_session, quest.id, dm).status == "draft"
    svc.advance(duckdb_session, steven.id, run.run_id, QuestAdvance(step_id="ch", option=0))
    steps = [QuestStep.model_validate(s) for s in _STEPS]
    steps[0].options[0].next = "e"
    svc.update_quest(duckdb_session, quest.id, SideQuestUpdate(steps=steps), dm)
    view = svc.get_view(duckdb_session, steven.id, run.run_id)
    assert (view.step.id, view.status) == ("ch", "new")


def test_practice_needs_a_finished_quest(duckdb_session):
    """An unfinished draft can't be played."""
    dm = f"dm142_{uuid.uuid4().hex[:8]}@example.com"
    campaign = camp_svc.create_campaign(
        duckdb_session, name="C", setting="S", tone="T", dm_email=dm
    )
    steven = _pc(duckdb_session, campaign.id, dm, "Steven")
    quest = svc.create_quest(
        duckdb_session,
        campaign.id,
        SideQuestCreate(title="Q", steps=[{"id": "a", "kind": "read", "text": "x"}]),
        dm,
    )
    with pytest.raises(SideQuestConflictError):
        svc.practice(duckdb_session, quest.id, QuestPractice(character_id=steven.id), dm)
